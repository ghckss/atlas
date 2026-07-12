import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { SoulRuntime, SoulRuntimeInput } from "../../application";
import { buildSoulInstructions, buildSoulUserInput } from "./soul-runtime-prompts";

export interface OpenAISoulRuntimeOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
  logFilePath?: string;
  fetchImpl?: typeof fetch;
}

export interface OpenAIRuntimeLogEvent {
  timestamp: string;
  event: "request_start" | "request_success" | "request_error";
  model: string;
  baseUrl: string;
  soul: SoulRuntimeInput["soul"];
  durationMs?: number;
  status?: number;
  requestId?: string;
  requestBytes?: number;
  responseBytes?: number;
  requestLength?: number;
  previousOutputLength?: number;
  memoryContextLength?: number;
  errorName?: string;
  errorMessage?: string;
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
const OPENAI_REQUEST_ID_HEADERS = ["x-request-id", "openai-request-id"];

interface OpenAIRequestResult {
  payload: OpenAIResponsePayload;
  status: number;
  requestId?: string;
  responseBytes: number;
}

class OpenAIResponseError extends Error {
  readonly status: number;
  readonly requestId?: string;
  readonly responseBytes: number;

  constructor(options: {
    status: number;
    message: string;
    requestId?: string;
    responseBytes: number;
  }) {
    super(options.message);
    this.name = "OpenAIResponseError";
    this.status = options.status;
    this.requestId = options.requestId;
    this.responseBytes = options.responseBytes;
  }
}

export class OpenAISoulRuntime implements SoulRuntime {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly logFilePath?: string;
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
    this.logFilePath = options.logFilePath?.trim() || undefined;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async execute(input: SoulRuntimeInput): Promise<string> {
    const body = {
      model: this.model,
      instructions: buildSoulInstructions(input),
      input: buildSoulUserInput(input)
    };
    const bodyText = JSON.stringify(body);
    const startedAt = Date.now();

    await this.writeLog({
      event: "request_start",
      ...this.baseLogFields(input),
      requestBytes: Buffer.byteLength(bodyText),
      requestLength: input.request.length,
      previousOutputLength: input.previousOutput?.length ?? 0,
      memoryContextLength: input.memoryContext.length
    });

    try {
      const result = await this.request(bodyText);
      const output = readOutputText(result.payload);

      if (!output) {
        throw new Error("OpenAI response did not include output text.");
      }

      await this.writeLog({
        event: "request_success",
        ...this.baseLogFields(input),
        durationMs: Date.now() - startedAt,
        status: result.status,
        requestId: result.requestId,
        responseBytes: result.responseBytes
      });

      return output;
    } catch (error) {
      await this.writeLog({
        event: "request_error",
        ...this.baseLogFields(input),
        durationMs: Date.now() - startedAt,
        status: error instanceof OpenAIResponseError ? error.status : undefined,
        requestId:
          error instanceof OpenAIResponseError ? error.requestId : undefined,
        responseBytes:
          error instanceof OpenAIResponseError ? error.responseBytes : undefined,
        errorName: error instanceof Error ? error.name : undefined,
        errorMessage: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  private async request(bodyText: string): Promise<OpenAIRequestResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(`${this.baseUrl}/v1/responses`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json"
        },
        body: bodyText,
        signal: controller.signal
      });
      const responseText = await response.text();
      const payload = parseResponsePayload(responseText);
      const requestId = readRequestId(response.headers);
      const responseBytes = Buffer.byteLength(responseText);

      if (!response.ok) {
        throw new OpenAIResponseError({
          status: response.status,
          requestId,
          responseBytes,
          message: `OpenAI response failed with ${response.status}: ${
            readErrorMessage(payload) ?? responseText
          }`
        });
      }

      return {
        payload,
        status: response.status,
        requestId,
        responseBytes
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private baseLogFields(
    input: SoulRuntimeInput
  ): Pick<OpenAIRuntimeLogEvent, "model" | "baseUrl" | "soul"> {
    return {
      model: this.model,
      baseUrl: this.baseUrl,
      soul: input.soul
    };
  }

  private async writeLog(
    event: Omit<OpenAIRuntimeLogEvent, "timestamp">
  ): Promise<void> {
    if (!this.logFilePath) {
      return;
    }

    try {
      await mkdir(dirname(this.logFilePath), { recursive: true });
      await appendFile(
        this.logFilePath,
        `${JSON.stringify({ timestamp: new Date().toISOString(), ...event })}\n`,
        "utf8"
      );
    } catch {
      // Logging must never block a user-facing response path.
    }
  }
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

function readRequestId(headers: Headers): string | undefined {
  for (const header of OPENAI_REQUEST_ID_HEADERS) {
    const value = headers.get(header);

    if (value) {
      return value;
    }
  }

  return undefined;
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
