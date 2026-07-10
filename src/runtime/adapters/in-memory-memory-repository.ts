import type {
  EmbeddingVector,
  MemoryRepository,
  MemorySearchOptions,
  MemorySearchResult
} from "../../application";
import type { MemoryRecord, MemorySearchScope } from "../../domain";

interface StoredMemory {
  record: MemoryRecord;
  embedding?: EmbeddingVector;
}

export class InMemoryMemoryRepository implements MemoryRepository {
  private readonly memories: StoredMemory[] = [];

  constructor(initialRecords: readonly MemoryRecord[] = []) {
    this.memories = initialRecords.map((record) => ({ record }));
  }

  async upsertMemory(
    record: MemoryRecord,
    embedding?: EmbeddingVector
  ): Promise<void> {
    const existingIndex = this.memories.findIndex(
      (memory) => memory.record.id === record.id
    );
    const next = {
      record,
      embedding
    };

    if (existingIndex >= 0) {
      this.memories[existingIndex] = next;
      return;
    }

    this.memories.push(next);
  }

  async searchMemory(
    scope: MemorySearchScope,
    queryEmbedding: EmbeddingVector,
    options: MemorySearchOptions
  ): Promise<readonly MemorySearchResult[]> {
    const scoped = this.memories.filter((memory) =>
      isInScope(memory.record, scope)
    );

    return scoped
      .map((memory) => ({
        record: memory.record,
        score: scoreMemory(memory.embedding, queryEmbedding)
      }))
      .filter((result) =>
        options.minScore === undefined ? true : result.score >= options.minScore
      )
      .sort((left, right) => right.score - left.score)
      .slice(0, options.limit);
  }
}

function isInScope(record: MemoryRecord, scope: MemorySearchScope): boolean {
  if (!scope.namespaces.includes(record.namespace)) {
    return false;
  }

  if (record.namespace === "personal") {
    return record.owner.userId === scope.userId;
  }

  if (record.namespace === "team") {
    return Boolean(scope.teamId) && record.owner.teamId === scope.teamId;
  }

  if (record.namespace === "organization") {
    return (
      Boolean(scope.organizationId) &&
      record.owner.organizationId === scope.organizationId
    );
  }

  return Boolean(scope.projectId) && record.owner.projectId === scope.projectId;
}

function scoreMemory(
  memoryEmbedding: EmbeddingVector | undefined,
  queryEmbedding: EmbeddingVector
): number {
  if (!memoryEmbedding || memoryEmbedding.values.length !== queryEmbedding.values.length) {
    return 0.5;
  }

  const dot = memoryEmbedding.values.reduce(
    (sum, value, index) => sum + value * queryEmbedding.values[index],
    0
  );
  const leftMagnitude = Math.sqrt(
    memoryEmbedding.values.reduce((sum, value) => sum + value * value, 0)
  );
  const rightMagnitude = Math.sqrt(
    queryEmbedding.values.reduce((sum, value) => sum + value * value, 0)
  );

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0;
  }

  return dot / (leftMagnitude * rightMagnitude);
}
