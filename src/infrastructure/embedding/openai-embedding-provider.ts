import type {
  EmbeddingInput,
  EmbeddingProvider,
  EmbeddingVector
} from "../../application";
import type { EmbeddingConfig } from "../../config";
import { assertEmbeddingDimensions } from "../../application";

export interface OpenAIEmbeddingProviderOptions {
  apiKey: string;
  baseUrl?: string;
  config: EmbeddingConfig;
  fetchImpl?: typeof fetch;
}

interface OpenAIEmbeddingPayload {
  data: Array<{
    embedding: number[];
  }>;
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly config: EmbeddingConfig;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OpenAIEmbeddingProviderOptions) {
    if (!options.apiKey) {
      throw new Error("OpenAI embedding API key is required.");
    }

    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? "https://api.openai.com/v1";
    this.config = options.config;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async embed(input: EmbeddingInput): Promise<EmbeddingVector> {
    const response = await this.fetchImpl(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: this.config.model,
        input: input.text,
        dimensions: this.config.dimensions
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI embedding request failed with ${response.status}.`);
    }

    const payload = await response.json();
    const embedding = readEmbedding(payload);
    const vector: EmbeddingVector = {
      provider: this.config.provider,
      model: this.config.model,
      dimensions: this.config.dimensions,
      values: embedding
    };

    assertEmbeddingDimensions(vector, this.config.dimensions);
    return vector;
  }
}

function readEmbedding(payload: unknown): number[] {
  if (!isEmbeddingPayload(payload)) {
    throw new Error("OpenAI embedding response did not include an embedding.");
  }

  return payload.data[0].embedding;
}

function isEmbeddingPayload(payload: unknown): payload is OpenAIEmbeddingPayload {
  if (typeof payload !== "object" || payload === null) {
    return false;
  }

  const data = (payload as { data?: unknown }).data;

  if (!Array.isArray(data) || data.length === 0) {
    return false;
  }

  const first = data[0] as { embedding?: unknown };
  return (
    Array.isArray(first.embedding) &&
    first.embedding.every((value) => typeof value === "number")
  );
}
