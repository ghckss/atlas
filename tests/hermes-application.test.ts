import assert from "node:assert/strict";
import test from "node:test";

import {
  HermesChatService,
  MemoryContextService,
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
  SoulRuntimeInput
} from "../src";

test("TaskPlanner chooses the minimum sequential Souls for compound work", () => {
  const planner = new TaskPlanner();

  assert.deepEqual(planner.plan({ request: "이 코드 리뷰하고 수정해줘" }).steps, [
    {
      soul: "reviewer",
      receivesFrom: undefined
    },
    {
      soul: "coder",
      receivesFrom: "reviewer"
    }
  ]);
  assert.deepEqual(planner.plan({ request: "React Suspense가 뭐야?" }).steps, [
    {
      soul: "teacher",
      receivesFrom: undefined
    }
  ]);
});

test("MemoryContextService searches only the scoped namespaces", async () => {
  const embeddingProvider = new FakeEmbeddingProvider();
  const memoryRepository = new FakeMemoryRepository([]);
  const service = new MemoryContextService(embeddingProvider, memoryRepository);

  await service.retrieve({
    identity: {
      userId: "user-1",
      projectId: "project-a"
    },
    query: "project memory",
    namespaces: ["personal", "project", "team"],
    limit: 4
  });

  assert.deepEqual(memoryRepository.lastScope?.namespaces, [
    "personal",
    "project"
  ]);
  assert.equal(embeddingProvider.lastInput?.purpose, "memory-search");
});

test("SoulPipeline passes each Soul output to the next Soul", async () => {
  const calls: SoulRuntimeInput[] = [];
  const pipeline = new SoulPipeline({
    async execute(input) {
      calls.push(input);
      return `${input.soul}:${input.previousOutput ?? "start"}`;
    }
  });

  const result = await pipeline.run({
    plan: new TaskPlanner().plan({ request: "설계하고 구현해줘" }),
    memoryContext: "known context"
  });

  assert.equal(result.finalOutput, "coder:architect:start");
  assert.equal(calls[1].previousOutput, "architect:start");
});

test("HermesChatService records conversation and returns pipeline output", async () => {
  const record = makeMemoryRecord("Prefers Korean responses.");
  const chatHistory = new FakeChatHistoryRepository();
  const service = new HermesChatService(
    chatHistory,
    new MemoryContextService(
      new FakeEmbeddingProvider(),
      new FakeMemoryRepository([
        {
          record,
          score: 0.95
        }
      ])
    ),
    new TaskPlanner(),
    new SoulPipeline({
      async execute(input) {
        return `${input.soul} handled ${input.request} with ${input.memoryContext}`;
      }
    })
  );

  const response = await service.respond({
    sessionId: "session-1",
    user: {
      id: "user-1",
      role: "developer"
    },
    projectId: "project-a",
    content: "뉴스 요약"
  });

  assert.equal(response.memoryCount, 1);
  assert.match(response.answer, /researcher handled/);
  assert.match(response.answer, /\[External Memory\]/);
  assert.match(response.answer, /\[Session History\]/);
  assert.deepEqual(
    chatHistory.messages.map((message) => message.role),
    ["user", "assistant"]
  );
});

class FakeEmbeddingProvider implements EmbeddingProvider {
  lastInput?: EmbeddingInput;

  async embed(input: EmbeddingInput): Promise<EmbeddingVector> {
    this.lastInput = input;
    return {
      provider: "fake",
      model: "fake-model",
      dimensions: 2,
      values: [0.1, 0.2]
    };
  }
}

class FakeMemoryRepository implements MemoryRepository {
  lastScope?: Parameters<MemoryRepository["searchMemory"]>[0];

  constructor(
    private readonly results: Awaited<
      ReturnType<MemoryRepository["searchMemory"]>
    >
  ) {}

  async upsertMemory(): Promise<void> {}

  async searchMemory(
    ...args: Parameters<MemoryRepository["searchMemory"]>
  ): ReturnType<MemoryRepository["searchMemory"]> {
    this.lastScope = args[0];
    return this.results;
  }
}

class FakeChatHistoryRepository implements ChatHistoryRepository {
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
    namespace: "personal",
    lifetime: "permanent",
    owner: {
      userId: "user-1"
    },
    content,
    source: "extracted-preference",
    createdAt: new Date("2026-07-10T00:00:00.000Z"),
    updatedAt: new Date("2026-07-10T00:00:00.000Z")
  };
}
