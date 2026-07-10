import type {
  EmbeddingInput,
  EmbeddingProvider,
  EmbeddingVector
} from "../../application";

export class DeterministicEmbeddingProvider implements EmbeddingProvider {
  constructor(
    private readonly dimensions = 8,
    private readonly model = "local-deterministic"
  ) {}

  async embed(input: EmbeddingInput): Promise<EmbeddingVector> {
    const values = Array.from({ length: this.dimensions }, (_, index) =>
      normalizeHash(`${input.purpose}:${input.text}:${index}`)
    );

    return {
      provider: "local",
      model: this.model,
      dimensions: this.dimensions,
      values
    };
  }
}

function normalizeHash(value: string): number {
  let hash = 0;

  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  return Number((hash / 0xffffffff).toFixed(6));
}
