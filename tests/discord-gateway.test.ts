import assert from "node:assert/strict";
import test from "node:test";

import {
  addDiscordRequestStatusReaction,
  archiveDiscordThread,
  createDiscordGatewayClient,
  createLocalRuntime,
  DISCORD_REQUEST_STATUS_REACTIONS,
  formatDiscordGatewayErrorReply,
  formatDiscordThreadName,
  loadRuntimeConfig,
  replyEphemeral,
  roleForDiscordUser,
  sendDiscordThreadReply,
  truncateDiscordContent
} from "../src";

const config = loadRuntimeConfig({
  DISCORD_BOT_USER_ID: "bot-1",
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

test("Discord Gateway maps request statuses to reactions", async () => {
  const reactions: string[] = [];
  const message = {
    id: "message-1",
    async react(emoji: string) {
      reactions.push(emoji);
    }
  };

  await addDiscordRequestStatusReaction(message, "accepted", silentLogger);
  await addDiscordRequestStatusReaction(message, "inProgress", silentLogger);
  await addDiscordRequestStatusReaction(message, "completed", silentLogger);
  await addDiscordRequestStatusReaction(message, "failed", silentLogger);

  assert.deepEqual(reactions, [
    DISCORD_REQUEST_STATUS_REACTIONS.accepted,
    DISCORD_REQUEST_STATUS_REACTIONS.inProgress,
    DISCORD_REQUEST_STATUS_REACTIONS.completed,
    DISCORD_REQUEST_STATUS_REACTIONS.failed
  ]);
});

test("Discord Gateway reaction failures do not fail the request", async () => {
  const errors: string[] = [];
  const message = {
    id: "message-1",
    async react() {
      throw new Error("missing permission");
    }
  };

  await addDiscordRequestStatusReaction(message, "accepted", {
    info() {},
    error(messageText: string) {
      errors.push(messageText);
    }
  });

  assert.equal(errors.length, 1);
  assert.match(errors[0], /status=accepted/);
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

test("Discord Gateway archives a thread after completed work", async () => {
  const archived: Array<{ archived: boolean; reason?: string }> = [];
  const channel = {
    id: "thread-1",
    isThread: () => true,
    async setArchived(value: boolean, reason?: string) {
      archived.push({ archived: value, reason });
    }
  };

  const result = await archiveDiscordThread(channel, silentLogger);

  assert.equal(result, true);
  assert.deepEqual(archived, [
    { archived: true, reason: "Hermes task completed" }
  ]);
});

test("Discord Gateway ignores non-thread channels when archiving", async () => {
  let archiveCalls = 0;
  const channel = {
    id: "channel-1",
    isThread: () => false,
    async setArchived() {
      archiveCalls += 1;
    }
  };

  const result = await archiveDiscordThread(channel, silentLogger);

  assert.equal(result, false);
  assert.equal(archiveCalls, 0);
});

test("Discord Gateway archive failures do not fail completed work", async () => {
  const errors: string[] = [];
  const channel = {
    id: "thread-1",
    isThread: () => true,
    async setArchived() {
      throw new Error("missing permission");
    }
  };

  const result = await archiveDiscordThread(channel, {
    info() {},
    error(message: string) {
      errors.push(message);
    }
  });

  assert.equal(result, false);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /threadId=thread-1/);
});

test("Discord Gateway edits deferred interaction replies", async () => {
  const edits: string[] = [];
  const followUps: string[] = [];
  const interaction = {
    deferred: true,
    replied: false,
    async editReply(input: { content: string }) {
      edits.push(input.content);
    },
    async followUp(input: { content: string }) {
      followUps.push(input.content);
    },
    async reply() {
      throw new Error("deferred interactions must be edited");
    }
  };

  await replyEphemeral(interaction as never, "승인 결과", true);

  assert.deepEqual(edits, ["승인 결과"]);
  assert.deepEqual(followUps, []);
});

const silentLogger = {
  info() {},
  error() {}
};
