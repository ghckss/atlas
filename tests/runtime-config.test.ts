import assert from "node:assert/strict";
import test from "node:test";

import { loadRuntimeConfig, roleFromRuntimeInput } from "../src";

test("runtime config loads required local MVP settings", () => {
  const config = loadRuntimeConfig({
    PORT: "3100",
    DISCORD_BOT_USER_ID: "bot-1",
    DISCORD_DEDICATED_CHANNEL_ID: "channel-1",
    DISCORD_OWNER_USER_IDS: "owner-1, owner-2",
    N8N_WEBHOOK_SECRET: "secret",
    N8N_API_URL: "http://localhost:5678",
    N8N_API_KEY: "n8n-key",
    MEM0_API_KEY: "mem0-key",
    MEM0_BASE_URL: "https://mem0.example",
    NEWS_SOURCE_URLS: "https://news-a.example, https://news-b.example",
    NEWS_COLLECTION_TIMEOUT_MS: "7000"
  });

  assert.equal(config.port, 3100);
  assert.equal(config.discord.botUserId, "bot-1");
  assert.deepEqual(config.discord.ownerUserIds, ["owner-1", "owner-2"]);
  assert.equal(config.discord.enableGateway, false);
  assert.equal(config.n8n.webhookSecret, "secret");
  assert.equal(config.n8n.apiUrl, "http://localhost:5678");
  assert.equal(config.n8n.apiKey, "n8n-key");
  assert.equal(config.mem0.apiKey, "mem0-key");
  assert.equal(config.mem0.baseUrl, "https://mem0.example");
  assert.deepEqual(config.news.sourceUrls, [
    "https://news-a.example",
    "https://news-b.example"
  ]);
  assert.equal(config.news.collectionTimeoutMs, 7000);
});

test("runtime config can enable Discord Gateway with a token", () => {
  const config = loadRuntimeConfig({
    DISCORD_BOT_TOKEN: "token",
    DISCORD_BOT_USER_ID: "bot-1",
    DISCORD_ENABLE_GATEWAY: "true",
    DISCORD_DEDICATED_CHANNEL_ID: "channel-1",
    N8N_WEBHOOK_SECRET: "secret"
  });

  assert.equal(config.discord.token, "token");
  assert.equal(config.discord.enableGateway, true);
});

test("runtime config rejects invalid port and missing secrets", () => {
  assert.throws(
    () =>
      loadRuntimeConfig({
        PORT: "99999",
        DISCORD_BOT_USER_ID: "bot-1",
        DISCORD_DEDICATED_CHANNEL_ID: "channel-1",
        N8N_WEBHOOK_SECRET: "secret"
      }),
    /PORT/
  );
  assert.throws(
    () =>
      loadRuntimeConfig({
        DISCORD_BOT_USER_ID: "bot-1",
        DISCORD_DEDICATED_CHANNEL_ID: "channel-1"
      }),
    /N8N_WEBHOOK_SECRET/
  );
});

test("runtime user role input defaults to developer", () => {
  assert.equal(roleFromRuntimeInput("owner"), "owner");
  assert.equal(roleFromRuntimeInput("unknown"), "developer");
});
