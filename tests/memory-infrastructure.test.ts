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
  Mem0HttpClient,
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
        `search:${request.query}:${request.scope.namespaces.join(",")}:${request.limit}:${request.minScore}`
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
      { limit: 3, minScore: 0.8, queryText: "concise updates" }
    ),
    [result]
  );
  assert.deepEqual(calls, [
    "add:memory-1",
    "search:concise updates:personal:3:0.8"
  ]);
});

test("Mem0 HTTP client writes and searches memories through REST API", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const client = new Mem0HttpClient({
    apiKey: "mem0-key",
    baseUrl: "https://mem0.example",
    fetchImpl: async (url, init) => {
      calls.push({
        url: String(url),
        init: init ?? {}
      });

      if (String(url).endsWith("/search/")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: "mem0-memory-1",
                memory: "Prefers Korean status updates.",
                score: 0.9,
                metadata: {
                  namespace: "personal",
                  lifetime: "permanent"
                }
              }
            ]
          }),
          { status: 200 }
        );
      }

      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
  });
  const record: MemoryRecord = {
    id: "memory-1",
    namespace: "personal",
    lifetime: "permanent",
    owner: {
      userId: "user-1"
    },
    content: "Prefers Korean status updates.",
    source: "extracted-preference",
    createdAt: new Date("2026-07-10T00:00:00.000Z"),
    updatedAt: new Date("2026-07-10T00:00:00.000Z")
  };
  const embedding: EmbeddingVector = {
    provider: "openai",
    model: "text-embedding-3-small",
    dimensions: 2,
    values: [0.1, 0.2]
  };

  await client.add({ record, embedding });
  const results = await client.search({
    scope: {
      userId: "user-1",
      namespaces: ["personal"]
    },
    embedding,
    query: "status language",
    limit: 5
  });

  assert.equal(calls[0].url, "https://mem0.example/v3/memories/add/");
  assert.equal(calls[1].url, "https://mem0.example/v3/memories/search/");
  const addHeaders = calls[0].init.headers as Record<string, string>;
  assert.equal(addHeaders.authorization, "Token mem0-key");
  assert.deepEqual(JSON.parse(String(calls[1].init.body)), {
    query: "status language",
    filters: {
      AND: [
        {
          user_id: "user-1"
        },
        {
          metadata: {
            namespace: "personal"
          }
        }
      ]
    },
    top_k: 5,
    threshold: 0
  });
  assert.equal(results[0].record.content, "Prefers Korean status updates.");
  assert.equal(results[0].score, 0.9);
});

test("Mem0 HTTP client uses OR metadata filters for multiple namespaces", async () => {
  const calls: RequestInit[] = [];
  const client = new Mem0HttpClient({
    apiKey: "mem0-key",
    baseUrl: "https://mem0.example",
    fetchImpl: async (_url, init) => {
      calls.push(init ?? {});
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    }
  });

  await client.search({
    scope: {
      userId: "user-1",
      namespaces: ["personal", "project"],
      projectId: "project-a"
    },
    embedding: {
      provider: "openai",
      model: "text-embedding-3-small",
      dimensions: 2,
      values: [0.1, 0.2]
    },
    query: "hello",
    limit: 5
  });

  assert.deepEqual(JSON.parse(String(calls[0].body)).filters, {
    AND: [
      {
        user_id: "user-1"
      },
      {
        OR: [
          {
            metadata: {
              project_id: "project-a",
              namespace: "personal"
            }
          },
          {
            metadata: {
              project_id: "project-a",
              namespace: "project"
            }
          }
        ]
      }
    ]
  });
});

test("Mem0 HTTP client includes response body in failed requests", async () => {
  const client = new Mem0HttpClient({
    apiKey: "mem0-key",
    baseUrl: "https://mem0.example",
    fetchImpl: async () =>
      new Response(JSON.stringify({ detail: "invalid filters" }), {
        status: 400
      })
  });

  await assert.rejects(
    () =>
      client.search({
        scope: {
          userId: "user-1",
          namespaces: ["personal"]
        },
        embedding: {
          provider: "openai",
          model: "text-embedding-3-small",
          dimensions: 2,
          values: [0.1, 0.2]
        },
        query: "hello",
        limit: 5
      }),
    /Mem0 request failed with 400: .*invalid filters/
  );
});
