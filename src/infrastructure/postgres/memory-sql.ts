import type { EmbeddingVector } from "../../application";
import type { MemorySearchScope } from "../../domain";

export interface SqlQuery {
  text: string;
  values: readonly unknown[];
}

export function buildMemoryVectorSearchQuery(
  scope: MemorySearchScope,
  embedding: EmbeddingVector,
  limit: number
): SqlQuery {
  if (scope.namespaces.length === 0) {
    throw new Error("Memory search requires at least one namespace.");
  }

  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("Memory search limit must be a positive integer.");
  }

  return {
    text: `
      SELECT
        id,
        namespace,
        lifetime,
        owner_user_id,
        team_id,
        organization_id,
        project_id,
        content,
        source,
        metadata,
        embedding_model,
        embedding_dimensions,
        created_at,
        updated_at,
        1 - (embedding <=> $1::vector) AS score
      FROM memory_entries
      WHERE namespace = ANY($2::text[])
        AND (
          (namespace = 'personal' AND owner_user_id = $3)
          OR (namespace = 'team' AND team_id = $4)
          OR (namespace = 'organization' AND organization_id = $5)
          OR (namespace = 'project' AND project_id = $6)
        )
        AND embedding_model = $7
        AND embedding_dimensions = $8
      ORDER BY embedding <=> $1::vector
      LIMIT $9
    `,
    values: [
      formatPgVector(embedding.values),
      scope.namespaces,
      scope.userId,
      scope.teamId ?? null,
      scope.organizationId ?? null,
      scope.projectId ?? null,
      embedding.model,
      embedding.dimensions,
      limit
    ]
  };
}

export function formatPgVector(values: readonly number[]): string {
  if (values.length === 0) {
    throw new Error("Cannot format an empty embedding vector.");
  }

  for (const value of values) {
    if (!Number.isFinite(value)) {
      throw new Error("Embedding vector contains a non-finite value.");
    }
  }

  return `[${values.join(",")}]`;
}
