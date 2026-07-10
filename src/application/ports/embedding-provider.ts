export interface EmbeddingInput {
  text: string;
  purpose: "memory-search" | "memory-write" | "document-analysis";
}

export interface EmbeddingVector {
  provider: string;
  model: string;
  dimensions: number;
  values: readonly number[];
}

export interface EmbeddingProvider {
  embed(input: EmbeddingInput): Promise<EmbeddingVector>;
}

export function assertEmbeddingDimensions(
  vector: EmbeddingVector,
  expectedDimensions: number
): void {
  if (vector.dimensions !== expectedDimensions) {
    throw new Error(
      `Embedding dimensions mismatch: expected ${expectedDimensions}, received ${vector.dimensions}`
    );
  }

  if (vector.values.length !== expectedDimensions) {
    throw new Error(
      `Embedding vector length mismatch: expected ${expectedDimensions}, received ${vector.values.length}`
    );
  }
}
