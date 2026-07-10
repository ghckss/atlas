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

test("news source client collects Google News RSS by query", async () => {
  const requestedUrls: string[] = [];
  const client = new HttpNewsSourceClient({
    fetchImpl: async (url) => {
      requestedUrls.push(String(url));

      return new Response(
        `
        <rss>
          <channel>
            <item>
              <title><![CDATA[AI ships &amp; updates]]></title>
              <link>https://example.com/google-ai</link>
              <source>Example News</source>
              <pubDate>Sat, 11 Jul 2026 09:00:00 GMT</pubDate>
              <description><![CDATA[Short <b>RSS</b> summary]]></description>
            </item>
          </channel>
        </rss>
        `,
        { status: 200 }
      );
    }
  });

  assert.deepEqual(
    await client.collect({
      providers: ["google-news"],
      query: "AI",
      googleLanguage: "ko",
      googleCountry: "KR"
    }),
    [
      {
        title: "AI ships & updates",
        url: "https://example.com/google-ai",
        source: "Example News",
        publishedAt: "Sat, 11 Jul 2026 09:00:00 GMT",
        summary: "Short RSS summary"
      }
    ]
  );
  assert.equal(
    requestedUrls[0],
    "https://news.google.com/rss/search?q=AI&hl=ko&gl=KR&ceid=KR%3Ako"
  );
});

test("news source client collects Naver News through the official search API", async () => {
  const calls: Array<{ url: string; headers: HeadersInit | undefined }> = [];
  const client = new HttpNewsSourceClient({
    fetchImpl: async (url, init) => {
      calls.push({
        url: String(url),
        headers: init?.headers
      });

      return new Response(
        JSON.stringify({
          items: [
            {
              title: "<b>AI</b> 뉴스",
              originallink: "https://example.com/naver-ai",
              link: "https://n.news.naver.com/article",
              description: "네이버 <b>뉴스</b> 요약",
              pubDate: "Sat, 11 Jul 2026 18:00:00 +0900"
            }
          ]
        }),
        { status: 200 }
      );
    }
  });

  assert.deepEqual(
    await client.collect({
      providers: ["naver-news"],
      query: "AI",
      naverClientId: "naver-id",
      naverClientSecret: "naver-secret",
      naverDisplay: 5
    }),
    [
      {
        title: "AI 뉴스",
        url: "https://example.com/naver-ai",
        source: "naver-news",
        publishedAt: "Sat, 11 Jul 2026 18:00:00 +0900",
        summary: "네이버 뉴스 요약"
      }
    ]
  );

  const headers = calls[0].headers as Record<string, string>;
  assert.equal(
    calls[0].url,
    "https://openapi.naver.com/v1/search/news.json?query=AI&display=5&sort=date"
  );
  assert.equal(headers["X-Naver-Client-Id"], "naver-id");
  assert.equal(headers["X-Naver-Client-Secret"], "naver-secret");
});

test("n8n workflow client creates or updates workflows by name", async () => {
  const calls: Array<{
    url: string;
    method: string | undefined;
    body?: unknown;
  }> = [];
  const client = new N8nWorkflowClient({
    apiUrl: "http://n8n.local",
    apiKey: "n8n-key",
    fetchImpl: async (url, init) => {
      calls.push({
        url: String(url),
        method: init?.method,
        body: init?.body ? JSON.parse(String(init.body)) : undefined
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
    nodes: [],
    connections: {},
    settings: {
      executionOrder: "v1"
    },
    active: false,
    versionId: "export-version",
    meta: {
      description: "export-only metadata"
    }
  });
  await client.upsertWorkflow({
    name: "New Workflow",
    nodes: []
  });

  assert.deepEqual(calls, [
    {
      url: "http://n8n.local/api/v1/workflows",
      method: "GET",
      body: undefined
    },
    {
      url: "http://n8n.local/api/v1/workflows/workflow-1",
      method: "PUT",
      body: {
        name: "Existing Workflow",
        nodes: [],
        connections: {},
        settings: {
          executionOrder: "v1"
        }
      }
    },
    {
      url: "http://n8n.local/api/v1/workflows",
      method: "GET",
      body: undefined
    },
    {
      url: "http://n8n.local/api/v1/workflows",
      method: "POST",
      body: {
        name: "New Workflow",
        nodes: [],
        connections: {},
        settings: {}
      }
    }
  ]);
});
