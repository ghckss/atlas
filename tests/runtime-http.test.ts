import assert from "node:assert/strict";
import test from "node:test";

import {
  createLocalRuntime,
  handleRuntimeDiscordMessage,
  handleRuntimeHttpRequest,
  HttpNewsSourceClient,
  type LocalRuntime,
  loadRuntimeConfig
} from "../src";

const config = loadRuntimeConfig({
  PORT: "3000",
  DISCORD_BOT_USER_ID: "bot-1",
  DISCORD_OWNER_USER_IDS: "owner-1",
  N8N_WEBHOOK_SECRET: "secret"
});

test("local runtime health endpoint reports readiness", async () => {
  const response = await handleRuntimeHttpRequest(
    {
      method: "GET",
      path: "/health",
      headers: {}
    },
    createLocalRuntime(config),
    config
  );

  assert.deepEqual(response, {
    status: 200,
    body: {
      status: "ok",
      service: "ai-assistant-platform",
      runtime: "local-mvp"
    }
  });
});

test("local runtime handles Discord mention through Hermes", async () => {
  const response = await handleRuntimeHttpRequest(
    {
      method: "POST",
      path: "/discord/message",
      headers: {},
      body: {
        id: "message-1",
        authorId: "user-1",
        channelId: "channel-1",
        content: "<@bot-1> 코드 분석해줘",
        mentionedUserIds: ["bot-1"],
        projectId: "ai-assistant-platform"
      }
    },
    createLocalRuntime(config),
    config
  );

  assert.equal(response.status, 200);
  assert.match(JSON.stringify(response.body), /로컬 MVP/);
  assert.match(JSON.stringify(response.body), /coder/);
});

test("local runtime ignores non-mentioned Discord messages", async () => {
  const response = await handleRuntimeHttpRequest(
    {
      method: "POST",
      path: "/discord/message",
      headers: {},
      body: {
        id: "message-1",
        authorId: "user-1",
        channelId: "channel-1",
        content: "hello",
        mentionedUserIds: []
      }
    },
    createLocalRuntime(config),
    config
  );

  assert.deepEqual(response, {
    status: 202,
    body: {
      kind: "ignore",
      reason: "missing-bot-mention"
    }
  });
});

test("runtime answers schedule mentions from Google Calendar before LLM", async () => {
  let briefingInput:
    | {
        mode: "daily" | "monthly";
        date: string;
        discordGuildId?: string;
        discordChannelId?: string;
        timezone: string;
      }
    | undefined;
  const runtime = {
    discord: {
      botUserId: "bot-1",
      ownerUserIds: []
    },
    scheduleTimezone: "Asia/Seoul",
    schedule: {
      async buildBriefing(input: NonNullable<typeof briefingInput>) {
        briefingInput = input;

        return {
          shouldSend: true,
          discordMessage: "2026년 7월 일정\n\n1. 2026-07-20 10:00 회의",
          discordMessages: ["2026년 7월 일정\n\n1. 2026-07-20 10:00 회의"],
          eventCount: 1,
          calendarEventCount: 1
        };
      }
    },
    chat: {
      async respond() {
        throw new Error("LLM should not handle schedule lookup requests.");
      }
    }
  } as unknown as LocalRuntime;

  const response = await handleRuntimeDiscordMessage(
    {
      id: "message-1",
      authorId: "user-1",
      channelId: "channel-1",
      guildId: "guild-1",
      content: "<@bot-1> 7월 일정 알려줘",
      mentionedUserIds: ["bot-1"]
    },
    runtime
  );

  assert.deepEqual(briefingInput, {
    mode: "monthly",
    date: "2026-07-01",
    discordGuildId: "guild-1",
    discordChannelId: "channel-1",
    timezone: "Asia/Seoul"
  });
  assert.deepEqual(response, {
    status: 200,
    body: {
      kind: "schedule",
      content: "2026년 7월 일정\n\n1. 2026-07-20 10:00 회의",
      eventCount: 1
    }
  });
});

test("local runtime exposes n8n news briefing webhook", async () => {
  const response = await handleRuntimeHttpRequest(
    {
      method: "POST",
      path: "/webhooks/news-briefing",
      headers: {
        "x-n8n-webhook-secret": "secret"
      },
      body: {
        articles: [
          {
            title: "Hermes platform ships local MVP runtime",
            url: "https://example.com/hermes"
          }
        ]
      }
    },
    createLocalRuntime(config),
    config
  );

  assert.equal(response.status, 200);
  assert.match(JSON.stringify(response.body), /discordMessage/);
});

test("local runtime exposes collected news articles for n8n", async () => {
  const runtime = createLocalRuntime(
    loadRuntimeConfig({
      ...configToEnv(),
      NEWS_SOURCE_URLS: "https://news.example/feed"
    })
  );
  runtime.newsCollector = new HttpNewsSourceClient({
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          articles: [
            {
              title: "AI news",
              url: "https://example.com/ai"
            }
          ]
        }),
        { status: 200 }
      )
  });
  const response = await handleRuntimeHttpRequest(
    {
      method: "GET",
      path: "/news/articles",
      headers: {}
    },
    runtime,
    loadRuntimeConfig({
      ...configToEnv(),
      NEWS_SOURCE_URLS: "https://news.example/feed"
    })
  );

  assert.deepEqual(response, {
    status: 200,
    body: {
      articles: [
        {
          title: "AI news",
          url: "https://example.com/ai",
          source: "https://news.example/feed",
          publishedAt: undefined,
          summary: undefined
        }
      ]
    }
  });
});

function configToEnv(): Record<string, string> {
  return {
    PORT: "3000",
    DISCORD_BOT_USER_ID: "bot-1",
    DISCORD_OWNER_USER_IDS: "owner-1",
    N8N_WEBHOOK_SECRET: "secret"
  };
}
