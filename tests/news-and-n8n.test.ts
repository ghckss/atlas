import assert from "node:assert/strict";
import test from "node:test";

import {
  GoogleCalendarEventSink,
  HttpNewsSourceClient,
  N8nWorkflowClient,
  parseNewsSourceUrls
} from "../src";

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

test("GoogleCalendarEventSink creates timed events through OAuth", async () => {
  const requests: Array<{
    url: string;
    init?: RequestInit;
  }> = [];
  const sink = new GoogleCalendarEventSink({
    clientId: "client-id",
    clientSecret: "client-secret",
    refreshToken: "refresh-token",
    calendarId: "primary",
    defaultDurationMinutes: 45,
    fetch: async (url, init) => {
      requests.push({
        url: String(url),
        init
      });

      if (String(url) === "https://oauth2.googleapis.com/token") {
        return new Response(JSON.stringify({ access_token: "access-token" }), {
          status: 200
        });
      }

      return new Response(
        JSON.stringify({
          id: "event-1",
          htmlLink: "https://calendar.google.com/event?eid=event-1"
        }),
        { status: 200 }
      );
    }
  });

  const result = await sink.createEvent({
    sourceId: "schedule-1",
    title: "팀 회의",
    startsAt: new Date("2026-07-14T01:30:00.000Z"),
    timezone: "Asia/Seoul",
    notes: "회의실 A"
  });
  const tokenBody = String(requests[0].init?.body);
  const eventBody = JSON.parse(String(requests[1].init?.body));

  assert.equal(requests[0].url, "https://oauth2.googleapis.com/token");
  assert.match(tokenBody, /grant_type=refresh_token/);
  assert.match(tokenBody, /refresh_token=refresh-token/);
  assert.equal(
    requests[1].url,
    "https://www.googleapis.com/calendar/v3/calendars/primary/events"
  );
  assert.equal(
    (requests[1].init?.headers as Record<string, string>).authorization,
    "Bearer access-token"
  );
  assert.deepEqual(eventBody.start, {
    dateTime: "2026-07-14T10:30:00+09:00",
    timeZone: "Asia/Seoul"
  });
  assert.deepEqual(eventBody.end, {
    dateTime: "2026-07-14T11:15:00+09:00",
    timeZone: "Asia/Seoul"
  });
  assert.equal(eventBody.extendedProperties.private.hermesScheduleEventId, "schedule-1");
  assert.deepEqual(result, {
    provider: "google",
    externalEventId: "event-1",
    url: "https://calendar.google.com/event?eid=event-1"
  });
});

test("GoogleCalendarEventSink lists Google Calendar events through OAuth", async () => {
  const requests: Array<{
    url: string;
    init?: RequestInit;
  }> = [];
  const sink = new GoogleCalendarEventSink({
    clientId: "client-id",
    clientSecret: "client-secret",
    refreshToken: "refresh-token",
    calendarId: "primary",
    defaultDurationMinutes: 45,
    fetch: async (url, init) => {
      requests.push({
        url: String(url),
        init
      });

      if (String(url) === "https://oauth2.googleapis.com/token") {
        return new Response(JSON.stringify({ access_token: "access-token" }), {
          status: 200
        });
      }

      return new Response(
        JSON.stringify({
          items: [
            {
              id: "event-1",
              summary: "팀 회의",
              description: "회의실 A",
              htmlLink: "https://calendar.google.com/event?eid=event-1",
              start: {
                dateTime: "2026-07-14T10:30:00+09:00"
              }
            },
            {
              id: "event-2",
              summary: "휴가",
              start: {
                date: "2026-07-15"
              }
            },
            {
              id: "event-cancelled",
              status: "cancelled",
              summary: "취소된 일정",
              start: {
                dateTime: "2026-07-16T10:30:00+09:00"
              }
            }
          ]
        }),
        { status: 200 }
      );
    }
  });

  const events = await sink.listEvents({
    startsAtFrom: new Date("2026-06-30T15:00:00.000Z"),
    startsAtTo: new Date("2026-07-31T15:00:00.000Z"),
    timezone: "Asia/Seoul"
  });
  const listUrl = new URL(requests[1].url);

  assert.equal(listUrl.origin + listUrl.pathname, "https://www.googleapis.com/calendar/v3/calendars/primary/events");
  assert.equal(listUrl.searchParams.get("singleEvents"), "true");
  assert.equal(listUrl.searchParams.get("orderBy"), "startTime");
  assert.equal(listUrl.searchParams.get("timeMin"), "2026-06-30T15:00:00.000Z");
  assert.equal(listUrl.searchParams.get("timeMax"), "2026-07-31T15:00:00.000Z");
  assert.equal(
    (requests[1].init?.headers as Record<string, string>).authorization,
    "Bearer access-token"
  );
  assert.deepEqual(
    events.map((event) => ({
      id: event.externalEventId,
      title: event.title,
      startsAt: event.startsAt.toISOString(),
      notes: event.notes
    })),
    [
      {
        id: "event-1",
        title: "팀 회의",
        startsAt: "2026-07-14T01:30:00.000Z",
        notes: "회의실 A"
      },
      {
        id: "event-2",
        title: "휴가",
        startsAt: "2026-07-14T15:00:00.000Z",
        notes: undefined
      }
    ]
  );
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
              <description>&lt;a href=&quot;https://example.com/google-ai&quot;&gt;Short &lt;b&gt;RSS&lt;/b&gt; summary&lt;/a&gt; &lt;font&gt;Example News&lt;/font&gt;</description>
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
        summary: "Short RSS summary Example News"
      }
    ]
  );
  assert.equal(
    requestedUrls[0],
    "https://news.google.com/rss/search?q=AI&hl=ko&gl=KR&ceid=KR%3Ako"
  );
});

test("news source client collects Google News top stories without a query", async () => {
  const requestedUrls: string[] = [];
  const client = new HttpNewsSourceClient({
    fetchImpl: async (url) => {
      requestedUrls.push(String(url));

      return new Response(
        `
        <rss>
          <channel>
            <item>
              <title>Top story one</title>
              <link>https://example.com/top-1</link>
              <source>Top Source</source>
            </item>
            <item>
              <title>Top story two</title>
              <link>https://example.com/top-2</link>
              <source>Top Source</source>
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
      providers: ["google-news-top"],
      googleLanguage: "ko",
      googleCountry: "KR",
      maxArticles: 1
    }),
    [
      {
        title: "Top story one",
        url: "https://example.com/top-1",
        source: "Top Source",
        publishedAt: undefined,
        summary: undefined
      }
    ]
  );
  assert.equal(
    requestedUrls[0],
    "https://news.google.com/rss?hl=ko&gl=KR&ceid=KR%3Ako"
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
