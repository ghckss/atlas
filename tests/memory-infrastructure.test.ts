import assert from "node:assert/strict";
import test from "node:test";

import {
  OpenAIEmbeddingProvider,
  assertEmbeddingDimensions,
  buildMemorySearchScope,
  buildMemoryVectorSearchQuery,
  defaultEmbeddingConfig,
  formatPgVector,
  loadEmbeddingConfig,
  Mem0MemoryAdapter
} from "../src";
import type { EmbeddingVector, MemoryRecord, MemorySearchResult } from "../src";

test("embedding config defaults to OpenAI and validates dimensions", () => {
  assert.deepEqual(loadEmbeddingConfig({}), defaultEmbeddingConfig);
  assert.deepEqual(loadEmbeddingConfig({ EMBEDDING_DIMENSIONS: "3072" }), {
    ...defaultEmbeddingConfig,
    dimensions: 3072
  });
  assert.throws(
    () => loadEmbeddingConfig({ EMBEDDING_DIMENSIONS: "0" }),
    /positive integer/
  );
});

test("embedding dimensions guard checks metadata and vector length together", () => {
  const vector: EmbeddingVector = {
    provider: "openai",
    model: "text-embedding-3-small",
    dimensions: 2,
    values: [0.1, 0.2]
  };

  assert.doesNotThrow(() => assertEmbeddingDimensions(vector, 2));
  assert.throws(
    () => assertEmbeddingDimensions({ ...vector, values: [0.1] }, 2),
    /vector length/
  );
});

test("PostgreSQL vector search query carries namespace and project isolation", () => {
  const scope = buildMemorySearchScope({
    identity: {
      userId: "user-1",
      projectId: "project-a"
    },
    requestedNamespaces: ["personal", "project", "team"]
  });
  const query = buildMemoryVectorSearchQuery(
    scope,
    {
      provider: "openai",
      model: "text-embedding-3-small",
      dimensions: 3,
      values: [0.1, 0.2, 0.3]
    },
    5
  );

  assert.match(query.text, /namespace = ANY/);
  assert.match(query.text, /project_id = \$6/);
  assert.deepEqual(query.values, [
    "[0.1,0.2,0.3]",
    ["personal", "project"],
    "user-1",
    null,
    null,
    "project-a",
    "text-embedding-3-small",
    3,
    5
  ]);
});

test("pgvector formatter rejects invalid vectors", () => {
  assert.equal(formatPgVector([1, 2, 3]), "[1,2,3]");
  assert.throws(() => formatPgVector([]), /empty/);
  assert.throws(() => formatPgVector([Number.NaN]), /non-finite/);
});

test("OpenAI embedding provider maps response into a validated vector", async () => {
  const provider = new OpenAIEmbeddingProvider({
    apiKey: "test-key",
    config: {
      provider: "openai",
      model: "text-embedding-3-small",
      dimensions: 2
    },
    fetchImpl: async () =>
      new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2] }] }), {
        status: 200
      })
  });

  assert.deepEqual(
    await provider.embed({ text: "remember this", purpose: "memory-write" }),
    {
      provider: "openai",
      model: "text-embedding-3-small",
      dimensions: 2,
      values: [0.1, 0.2]
    }
  );
});

test("Mem0 adapter forwards records through an explicit client boundary", async () => {
  const record: MemoryRecord = {
    id: "memory-1",
    namespace: "personal",
    lifetime: "permanent",
    owner: {
      userId: "user-1"
    },
    content: "Prefers concise status updates.",
    source: "extracted-preference",
    createdAt: new Date("2026-07-10T00:00:00.000Z"),
    updatedAt: new Date("2026-07-10T00:00:00.000Z")
  };
  const result: MemorySearchResult = {
    record,
    score: 0.91
  };
  const calls: string[] = [];
  const adapter = new Mem0MemoryAdapter({
    async add(request) {
      calls.push(`add:${request.record.id}`);
    },
    async search(request) {
      calls.push(
        `search:${request.scope.namespaces.join(",")}:${request.limit}:${request.minScore}`
      );
      return [result];
    }
  });
  const embedding: EmbeddingVector = {
    provider: "openai",
    model: "text-embedding-3-small",
    dimensions: 2,
    values: [0.1, 0.2]
  };

  await adapter.upsertMemory(record, embedding);
  assert.deepEqual(
    await adapter.searchMemory(
      {
        userId: "user-1",
        namespaces: ["personal"]
      },
      embedding,
      { limit: 3, minScore: 0.8 }
    ),
    [result]
  );
  assert.deepEqual(calls, ["add:memory-1", "search:personal:3:0.8"]);
});
