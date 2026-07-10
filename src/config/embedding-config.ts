export interface EmbeddingConfig {
  provider: string;
  model: string;
  dimensions: number;
}

export const defaultEmbeddingConfig: EmbeddingConfig = {
  provider: "openai",
  model: "text-embedding-3-small",
  dimensions: 1536
};

export function loadEmbeddingConfig(
  env: Record<string, string | undefined>
): EmbeddingConfig {
  const dimensions = Number(
    env.EMBEDDING_DIMENSIONS ?? defaultEmbeddingConfig.dimensions
  );

  if (!Number.isInteger(dimensions) || dimensions <= 0) {
    throw new Error("EMBEDDING_DIMENSIONS must be a positive integer.");
  }

  return {
    provider: env.EMBEDDING_PROVIDER ?? defaultEmbeddingConfig.provider,
    model: env.EMBEDDING_MODEL ?? defaultEmbeddingConfig.model,
    dimensions
  };
}
