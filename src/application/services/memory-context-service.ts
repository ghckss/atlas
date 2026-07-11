import type {
  EmbeddingProvider,
  MemoryRepository,
  MemorySearchResult
} from "../ports";
import type { MemoryIdentity, MemoryNamespace, MemorySearchScope } from "../../domain";
import { buildMemorySearchScope } from "../../domain";

export interface MemoryContextRequest {
  identity: MemoryIdentity;
  query: string;
  namespaces?: readonly MemoryNamespace[];
  limit: number;
  minScore?: number;
}

export interface MemoryContext {
  scope: MemorySearchScope;
  memories: readonly MemorySearchResult[];
}

export class MemoryContextService {
  constructor(
    private readonly embeddingProvider: EmbeddingProvider,
    private readonly memoryRepository: MemoryRepository
  ) {}

  async retrieve(request: MemoryContextRequest): Promise<MemoryContext> {
    const scope = buildMemorySearchScope({
      identity: request.identity,
      requestedNamespaces: request.namespaces
    });
    const embedding = await this.embeddingProvider.embed({
      text: request.query,
      purpose: "memory-search"
    });
    let memories: readonly MemorySearchResult[];

    try {
      memories = await this.memoryRepository.searchMemory(scope, embedding, {
        limit: request.limit,
        minScore: request.minScore,
        queryText: request.query
      });
    } catch (error) {
      console.warn(
        `Memory search failed; continuing without external memory. ${formatMemoryError(error)}`
      );
      memories = [];
    }

    return {
      scope,
      memories
    };
  }
}

function formatMemoryError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
