import type {
  MemoryRepository,
  MemorySearchOptions,
  MemorySearchResult
} from "../../application";
import type { EmbeddingVector } from "../../application";
import type { MemoryRecord, MemorySearchScope } from "../../domain";

export interface Mem0AddRequest {
  record: MemoryRecord;
  embedding?: EmbeddingVector;
}

export interface Mem0SearchRequest {
  scope: MemorySearchScope;
  embedding: EmbeddingVector;
  query: string;
  limit: number;
  minScore?: number;
}

export interface Mem0Client {
  add(request: Mem0AddRequest): Promise<void>;
  search(request: Mem0SearchRequest): Promise<readonly MemorySearchResult[]>;
}

export class Mem0MemoryAdapter implements MemoryRepository {
  constructor(private readonly client: Mem0Client) {}

  async upsertMemory(
    record: MemoryRecord,
    embedding?: EmbeddingVector
  ): Promise<void> {
    await this.client.add({
      record,
      embedding
    });
  }

  async searchMemory(
    scope: MemorySearchScope,
    queryEmbedding: EmbeddingVector,
    options: MemorySearchOptions
  ): Promise<readonly MemorySearchResult[]> {
    return this.client.search({
      scope,
      embedding: queryEmbedding,
      query: options.queryText ?? queryEmbedding.values.join(","),
      limit: options.limit,
      minScore: options.minScore
    });
  }
}
