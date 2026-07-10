import assert from "node:assert/strict";
import test from "node:test";

import { loadRuntimeConfig, roleFromRuntimeInput } from "../src";

test("runtime config loads required local MVP settings", () => {
  const config = loadRuntimeConfig({
    PORT: "3100",
    DISCORD_BOT_USER_ID: "bot-1",
    DISCORD_DEDICATED_CHANNEL_ID: "channel-1",
    DISCORD_OWNER_USER_IDS: "owner-1, owner-2",
    N8N_WEBHOOK_SECRET: "secret"
  });

  assert.equal(config.port, 3100);
  assert.equal(config.discord.botUserId, "bot-1");
  assert.deepEqual(config.discord.ownerUserIds, ["owner-1", "owner-2"]);
  assert.equal(config.n8n.webhookSecret, "secret");
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
