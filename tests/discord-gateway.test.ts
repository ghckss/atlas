import assert from "node:assert/strict";
import test from "node:test";

import {
  createDiscordGatewayClient,
  createLocalRuntime,
  formatDiscordGatewayErrorReply,
  formatDiscordThreadName,
  loadRuntimeConfig,
  roleForDiscordUser,
  sendDiscordThreadReply,
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

test("Discord Gateway formats provider errors for users", () => {
  assert.match(
    formatDiscordGatewayErrorReply(
      new Error("OpenAI response failed with 429: quota")
    ),
    /quota 또는 billing/
  );
  assert.match(
    formatDiscordGatewayErrorReply(
      new Error("OpenAI response failed with 500: upstream")
    ),
    /LLM 제공자 호출/
  );
  assert.match(formatDiscordGatewayErrorReply(new Error("boom")), /서버 로그/);
});

test("Discord Gateway client can be constructed without logging in", () => {
  const client = createDiscordGatewayClient(createLocalRuntime(config), config, {
    info() {},
    error() {}
  });

  assert.equal(client.isReady(), false);
  client.destroy();
});

test("Discord Gateway formats thread names from mention content", () => {
  assert.equal(formatDiscordThreadName("<@123> 안녕"), "안녕");
  assert.equal(formatDiscordThreadName("<@123>"), "Hermes 대화");
  assert.equal(formatDiscordThreadName("x".repeat(100)).length, 80);
});

test("Discord Gateway sends mention replies in a new thread", async () => {
  const sends: string[] = [];
  const replies: string[] = [];
  const startedThreads: string[] = [];
  const message = {
    id: "message-1",
    channelId: "channel-1",
    guildId: "guild-1",
    content: "<@123> 오늘 일정 알려줘",
    channel: {
      isThread: () => false
    },
    async startThread(options: { name: string }) {
      startedThreads.push(options.name);
      return {
        id: "thread-1",
        async send(input: { content: string }) {
          sends.push(input.content);
        }
      };
    },
    async reply(input: { content: string }) {
      replies.push(input.content);
    }
  };

  await sendDiscordThreadReply(message as never, "답변입니다.", silentLogger);

  assert.deepEqual(startedThreads, ["오늘 일정 알려줘"]);
  assert.deepEqual(sends, ["답변입니다."]);
  assert.deepEqual(replies, []);
});

test("Discord Gateway reuses an existing thread for mention replies", async () => {
  const sends: string[] = [];
  const message = {
    id: "message-1",
    channelId: "thread-1",
    guildId: "guild-1",
    content: "<@123> 이어서 질문",
    channel: {
      id: "thread-1",
      isThread: () => true,
      async send(input: { content: string }) {
        sends.push(input.content);
      }
    },
    async startThread() {
      throw new Error("should not start a nested thread");
    },
    async reply() {
      throw new Error("should not reply in channel");
    }
  };

  await sendDiscordThreadReply(message as never, "스레드 답변", silentLogger);

  assert.deepEqual(sends, ["스레드 답변"]);
});

test("Discord Gateway falls back to channel replies when thread creation fails", async () => {
  const replies: string[] = [];
  const message = {
    id: "message-1",
    channelId: "channel-1",
    guildId: "guild-1",
    content: "<@123> 질문",
    channel: {
      isThread: () => false
    },
    async startThread() {
      throw new Error("missing thread permission");
    },
    async reply(input: { content: string }) {
      replies.push(input.content);
    }
  };

  await sendDiscordThreadReply(message as never, "fallback", silentLogger);

  assert.deepEqual(replies, ["fallback"]);
});

const silentLogger = {
  info() {},
  error() {}
};
