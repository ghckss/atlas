import assert from "node:assert/strict";
import test from "node:test";

import {
  createLocalRuntime,
  handleRuntimeHttpRequest,
  loadRuntimeConfig
} from "../src";

const config = loadRuntimeConfig({
  PORT: "3000",
  DISCORD_BOT_USER_ID: "bot-1",
  DISCORD_DEDICATED_CHANNEL_ID: "channel-1",
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

test("local runtime handles dedicated Discord mention through Hermes", async () => {
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
