import assert from "node:assert/strict";
import test from "node:test";

import {
  createDiscordGatewayClient,
  createLocalRuntime,
  loadRuntimeConfig,
  roleForDiscordUser,
  truncateDiscordContent
} from "../src";

const config = loadRuntimeConfig({
  DISCORD_BOT_USER_ID: "bot-1",
  DISCORD_DEDICATED_CHANNEL_ID: "channel-1",
  DISCORD_OWNER_USER_IDS: "owner-1",
  N8N_WEBHOOK_SECRET: "secret"
});

test("Discord Gateway maps owners to owner role and others to developer", () => {
  assert.equal(roleForDiscordUser("owner-1", config), "owner");
  assert.equal(roleForDiscordUser("user-1", config), "developer");
});

test("Discord Gateway truncates messages to Discord content limits", () => {
  assert.equal(truncateDiscordContent("short"), "short");
  assert.equal(truncateDiscordContent("x".repeat(2100)).length, 2000);
  assert.match(truncateDiscordContent("x".repeat(2100)), /\[truncated\]$/);
});

test("Discord Gateway client can be constructed without logging in", () => {
  const client = createDiscordGatewayClient(createLocalRuntime(config), config, {
    info() {},
    error() {}
  });

  assert.equal(client.isReady(), false);
  client.destroy();
});
