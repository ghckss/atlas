import assert from "node:assert/strict";
import test from "node:test";

import { HttpNewsSourceClient, N8nWorkflowClient, parseNewsSourceUrls } from "../src";

test("news source client normalizes and deduplicates JSON article payloads", async () => {
  const client = new HttpNewsSourceClient({
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          items: [
            {
              title: "AI update",
              link: "https://example.com/ai",
              description: "Short summary"
            },
            {
              title: "AI update duplicate",
              url: "https://example.com/ai"
            }
          ]
        }),
        { status: 200 }
      )
  });

  assert.deepEqual(parseNewsSourceUrls("https://a.example, https://b.example"), [
    "https://a.example",
    "https://b.example"
  ]);
  assert.deepEqual(await client.collect(["https://news.example/feed"]), [
    {
      title: "AI update",
      url: "https://example.com/ai",
      source: "https://news.example/feed",
      publishedAt: undefined,
      summary: "Short summary"
    }
  ]);
});

test("n8n workflow client creates or updates workflows by name", async () => {
  const calls: Array<{ url: string; method: string | undefined }> = [];
  const client = new N8nWorkflowClient({
    apiUrl: "http://n8n.local",
    apiKey: "n8n-key",
    fetchImpl: async (url, init) => {
      calls.push({
        url: String(url),
        method: init?.method
      });

      if (init?.method === "GET") {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: "workflow-1",
                name: "Existing Workflow"
              }
            ]
          }),
          { status: 200 }
        );
      }

      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
  });

  await client.upsertWorkflow({
    name: "Existing Workflow",
    nodes: []
  });
  await client.upsertWorkflow({
    name: "New Workflow",
    nodes: []
  });

  assert.deepEqual(calls, [
    {
      url: "http://n8n.local/api/v1/workflows",
      method: "GET"
    },
    {
      url: "http://n8n.local/api/v1/workflows/workflow-1",
      method: "PATCH"
    },
    {
      url: "http://n8n.local/api/v1/workflows",
      method: "GET"
    },
    {
      url: "http://n8n.local/api/v1/workflows",
      method: "POST"
    }
  ]);
});
