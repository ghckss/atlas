import assert from "node:assert/strict";
import test from "node:test";

import {
  HermesChatService,
  MemoryContextService,
  routeDiscordMessage,
  SoulPipeline,
  TaskPlanner
} from "../src";
import type {
  AppendChatMessageInput,
  ChatHistoryRepository,
  ChatMessage,
  EmbeddingInput,
  EmbeddingProvider,
  EmbeddingVector,
  MemoryRepository,
  MemoryRecord,
  MemorySearchResult
} from "../src";

test("dedicated Discord mention flows through Hermes with memory and session context", async () => {
  const route = routeDiscordMessage(
    {
      id: "discord-message-1",
      authorId: "user-1",
      channelId: "dedicated-channel",
      content: "<@bot-1> 프로젝트 구조 설명해줘",
      isBot: false,
      isDirectMessage: false,
      mentionedUserIds: ["bot-1"]
    },
    {
      botUserId: "bot-1",
      dedicatedChannelId: "dedicated-channel",
      ownerUserIds: ["owner-1"]
    }
  );

  assert.equal(route.kind, "chat");

  if (route.kind !== "chat") {
    throw new Error("Expected chat route.");
  }

  const chatHistory = new E2EChatHistoryRepository();
  const service = new HermesChatService(
    chatHistory,
    new MemoryContextService(
      new E2EEmbeddingProvider(),
      new E2EMemoryRepository([
        {
          record: makeMemoryRecord("이 프로젝트는 TypeScript/Node.js를 사용한다."),
          score: 0.93
        }
      ])
    ),
    new TaskPlanner(),
    new SoulPipeline({
      async execute(input) {
        return `${input.soul} response\n${input.memoryContext}`;
      }
    })
  );

  const response = await service.respond({
    sessionId: "session-1",
    user: {
      id: "user-1",
      role: "developer"
    },
    projectId: "ai-assistant-platform",
    content: route.content
  });

  assert.match(response.answer, /architect response/);
  assert.match(response.answer, /External Memory/);
  assert.match(response.answer, /Session History/);
  assert.equal(chatHistory.messages.length, 2);
});

class E2EEmbeddingProvider implements EmbeddingProvider {
  async embed(input: EmbeddingInput): Promise<EmbeddingVector> {
    assert.equal(input.purpose, "memory-search");

    return {
      provider: "fake",
      model: "fake",
      dimensions: 2,
      values: [0.4, 0.6]
    };
  }
}

class E2EMemoryRepository implements MemoryRepository {
  constructor(private readonly results: readonly MemorySearchResult[]) {}

  async upsertMemory(): Promise<void> {}

  async searchMemory(): Promise<readonly MemorySearchResult[]> {
    return this.results;
  }
}

class E2EChatHistoryRepository implements ChatHistoryRepository {
  readonly messages: ChatMessage[] = [];

  async appendMessage(input: AppendChatMessageInput): Promise<ChatMessage> {
    const message: ChatMessage = {
      id: `message-${this.messages.length + 1}`,
      sessionId: input.sessionId,
      role: input.role,
      content: input.content,
      createdAt: new Date("2026-07-10T00:00:00.000Z"),
      metadata: input.metadata
    };

    this.messages.push(message);
    return message;
  }

  async listRecentMessages(): Promise<readonly ChatMessage[]> {
    return this.messages;
  }
}

function makeMemoryRecord(content: string): MemoryRecord {
  return {
    id: "memory-1",
    namespace: "project",
    lifetime: "project",
    owner: {
      userId: "user-1",
      projectId: "ai-assistant-platform"
    },
    content,
    source: "project-fact",
    createdAt: new Date("2026-07-10T00:00:00.000Z"),
    updatedAt: new Date("2026-07-10T00:00:00.000Z")
  };
}
