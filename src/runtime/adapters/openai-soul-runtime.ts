import type { SoulRuntime, SoulRuntimeInput } from "../../application";
import { soulProfiles } from "../../domain";

export interface OpenAISoulRuntimeOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

interface OpenAIResponsePayload {
  output_text?: unknown;
  output?: unknown;
  error?: {
    message?: unknown;
  };
}

const DEFAULT_BASE_URL = "https://api.openai.com";
const DEFAULT_TIMEOUT_MS = 30000;

export class OpenAISoulRuntime implements SoulRuntime {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OpenAISoulRuntimeOptions) {
    if (!options.apiKey) {
      throw new Error("OPENAI_API_KEY is required when LLM_PROVIDER=openai.");
    }

    if (!options.model) {
      throw new Error("OPENAI_MODEL is required when LLM_PROVIDER=openai.");
    }

    this.apiKey = options.apiKey;
    this.model = options.model;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async execute(input: SoulRuntimeInput): Promise<string> {
    const payload = await this.request({
      model: this.model,
      instructions: buildInstructions(input),
      input: buildUserInput(input)
    });
    const output = readOutputText(payload);

    if (!output) {
      throw new Error("OpenAI response did not include output text.");
    }

    return output;
  }

  private async request(body: unknown): Promise<OpenAIResponsePayload> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(`${this.baseUrl}/v1/responses`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      const responseText = await response.text();
      const payload = parseResponsePayload(responseText);

      if (!response.ok) {
        throw new Error(
          `OpenAI response failed with ${response.status}: ${readErrorMessage(payload) ?? responseText}`
        );
      }

      return payload;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function buildInstructions(input: SoulRuntimeInput): string {
  const profile = soulProfiles[input.soul];

  return [
    "You are Hermes, an AI assistant platform for personal and small-team development workflows.",
    "Answer in Korean unless the user explicitly asks for another language.",
    "Do not mention internal pipeline mechanics unless they are directly relevant.",
    "",
    `[Soul Identity] ${profile.identity}`,
    `[Purpose] ${profile.purpose}`,
    `[Responsibilities] ${profile.responsibilities.join(", ")}`,
    `[Decision Principles] ${profile.decisionPrinciples.join(", ")}`,
    `[Response Style] ${profile.responseStyle}`,
    `[Things To Avoid] ${profile.thingsToAvoid.join(", ")}`
  ].join("\n");
}

function buildUserInput(input: SoulRuntimeInput): string {
  return [
    `[User Request]\n${input.request}`,
    input.previousOutput ? `[Previous Soul Output]\n${input.previousOutput}` : undefined,
    input.memoryContext.trim()
      ? `[Memory And Session Context]\n${input.memoryContext}`
      : undefined
  ]
    .filter(Boolean)
    .join("\n\n");
}

function parseResponsePayload(responseText: string): OpenAIResponsePayload {
  if (!responseText) {
    return {};
  }

  try {
    return JSON.parse(responseText) as OpenAIResponsePayload;
  } catch {
    return {};
  }
}

function readErrorMessage(payload: OpenAIResponsePayload): string | undefined {
  return typeof payload.error?.message === "string"
    ? payload.error.message
    : undefined;
}

function readOutputText(payload: OpenAIResponsePayload): string | undefined {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  if (!Array.isArray(payload.output)) {
    return undefined;
  }

  const parts = payload.output.flatMap((item) => {
    if (typeof item !== "object" || item === null) {
      return [];
    }

    const content = (item as { content?: unknown }).content;

    if (!Array.isArray(content)) {
      return [];
    }

    return content.flatMap((entry) => {
      if (typeof entry !== "object" || entry === null) {
        return [];
      }

      const text = (entry as { text?: unknown }).text;
      return typeof text === "string" ? [text] : [];
    });
  });
  const output = parts.join("").trim();

  return output || undefined;
}
