import type { MemoryRecord, MemorySearchScope } from "../../domain";
import type { EmbeddingVector } from "./embedding-provider";

export interface MemorySearchOptions {
  limit: number;
  minScore?: number;
}

export interface MemorySearchResult {
  record: MemoryRecord;
  score: number;
}

export interface MemoryRepository {
  upsertMemory(record: MemoryRecord, embedding?: EmbeddingVector): Promise<void>;
  searchMemory(
    scope: MemorySearchScope,
    queryEmbedding: EmbeddingVector,
    options: MemorySearchOptions
  ): Promise<readonly MemorySearchResult[]>;
}
