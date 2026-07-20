import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  HermesChatService,
  MemoryContextService,
  CodexCliSoulRuntime,
  OpenAISoulRuntime,
  parseScheduleQuery,
  ScheduleService,
  SoulPipeline,
  TaskPlanner
} from "../src";
import type {
  AppendChatMessageInput,
  CalendarEvent,
  CalendarEventDraft,
  CalendarEventRange,
  CalendarEventSink,
  CalendarEventSource,
  ChatHistoryRepository,
  ChatMessage,
  CreatedCalendarEvent,
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

test("MemoryContextService fails open when external memory search fails", async () => {
  const service = new MemoryContextService(
    new FakeEmbeddingProvider(),
    new ThrowingMemoryRepository()
  );
  const context = await service.retrieve({
    identity: {
      userId: "user-1"
    },
    query: "hello",
    limit: 4
  });

  assert.deepEqual(context.memories, []);
  assert.deepEqual(context.scope.namespaces, ["personal"]);
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

test("OpenAISoulRuntime calls Responses API for Soul execution", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const runtime = new OpenAISoulRuntime({
    apiKey: "openai-key",
    model: "gpt-5.6",
    baseUrl: "https://openai.example",
    fetchImpl: async (url, init) => {
      calls.push({
        url: String(url),
        init: init ?? {}
      });

      return new Response(JSON.stringify({ output_text: "실제 모델 응답" }), {
        status: 200
      });
    }
  });

  assert.equal(
    await runtime.execute({
      soul: "default",
      request: "안녕",
      memoryContext: "[Session History]\nuser: 안녕"
    }),
    "실제 모델 응답"
  );
  assert.equal(calls[0].url, "https://openai.example/v1/responses");
  assert.equal(
    (calls[0].init.headers as Record<string, string>).authorization,
    "Bearer openai-key"
  );
  assert.deepEqual(JSON.parse(String(calls[0].init.body)).model, "gpt-5.6");
  assert.match(
    JSON.parse(String(calls[0].init.body)).instructions,
    /Answer in Korean/
  );
});

test("OpenAISoulRuntime writes redacted JSONL execution logs", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "hermes-openai-log-"));
  const logFilePath = join(directory, "llm-runtime.log");
  t.after(() => rm(directory, { recursive: true, force: true }));
  const runtime = new OpenAISoulRuntime({
    apiKey: "openai-key",
    model: "gpt-5.6",
    baseUrl: "https://openai.example",
    logFilePath,
    fetchImpl: async () =>
      new Response(JSON.stringify({ output_text: "실제 모델 응답" }), {
        status: 200,
        headers: {
          "x-request-id": "req_123"
        }
      })
  });

  await runtime.execute({
    soul: "default",
    request: "민감한 사용자 요청",
    memoryContext: "[Session History]\nuser: 민감한 사용자 요청"
  });

  const content = await readFile(logFilePath, "utf8");
  const events = content.trim().split("\n").map((line) => JSON.parse(line));

  assert.equal(events[0].event, "request_start");
  assert.equal(events[0].provider, "openai");
  assert.equal(events[0].model, "gpt-5.6");
  assert.equal(events[0].soul, "default");
  assert.equal(typeof events[0].requestBytes, "number");
  assert.equal(events[1].event, "request_success");
  assert.equal(events[1].status, 200);
  assert.equal(events[1].requestId, "req_123");
  assert.equal(typeof events[1].durationMs, "number");
  assert.doesNotMatch(content, /민감한 사용자 요청/);
  assert.doesNotMatch(content, /openai-key/);
});

test("OpenAISoulRuntime logs provider failures with status", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "hermes-openai-error-log-"));
  const logFilePath = join(directory, "llm-runtime.log");
  t.after(() => rm(directory, { recursive: true, force: true }));
  const runtime = new OpenAISoulRuntime({
    apiKey: "openai-key",
    model: "gpt-5.6",
    baseUrl: "https://openai.example",
    logFilePath,
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          error: {
            message: "You exceeded your current quota."
          }
        }),
        {
          status: 429,
          headers: {
            "x-request-id": "req_quota"
          }
        }
      )
  });

  await assert.rejects(
    () =>
      runtime.execute({
        soul: "default",
        request: "안녕",
        memoryContext: ""
      }),
    /OpenAI response failed with 429/
  );

  const content = await readFile(logFilePath, "utf8");
  const events = content.trim().split("\n").map((line) => JSON.parse(line));

  assert.equal(events[1].event, "request_error");
  assert.equal(events[1].provider, "openai");
  assert.equal(events[1].status, 429);
  assert.equal(events[1].requestId, "req_quota");
  assert.match(events[1].errorMessage, /current quota/);
});

test("CodexCliSoulRuntime executes codex exec and reads final output", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "hermes-codex-log-"));
  const logFilePath = join(directory, "llm-runtime.log");
  t.after(() => rm(directory, { recursive: true, force: true }));
  const calls: Array<{
    command: string;
    args: readonly string[];
    prompt: string;
    workingDirectory?: string;
  }> = [];
  const runtime = new CodexCliSoulRuntime({
    command: "codex-test",
    model: "gpt-5.6-codex",
    sandbox: "read-only",
    workingDirectory: "/tmp/hermes-project",
    logFilePath,
    commandExecutor: async (input) => {
      calls.push({
        command: input.command,
        args: input.args,
        prompt: input.prompt,
        workingDirectory: input.workingDirectory
      });
      await writeFile(input.outputFilePath, "Codex CLI 응답\n", "utf8");

      return {
        exitCode: 0,
        stdout: "progress",
        stderr: ""
      };
    }
  });

  assert.equal(
    await runtime.execute({
      soul: "default",
      request: "안녕",
      memoryContext: "[Session History]\nuser: 안녕"
    }),
    "Codex CLI 응답"
  );
  assert.equal(calls[0].command, "codex-test");
  assert.equal(calls[0].args[0], "exec");
  assert.equal(calls[0].args.at(-1), "-");
  assert.equal(
    calls[0].args[calls[0].args.indexOf("--model") + 1],
    "gpt-5.6-codex"
  );
  assert.equal(
    calls[0].args[calls[0].args.indexOf("--sandbox") + 1],
    "read-only"
  );
  assert.equal(calls[0].args.includes("--ask-for-approval"), false);
  assert.equal(calls[0].workingDirectory, "/tmp/hermes-project");
  assert.match(calls[0].prompt, /Answer in Korean/);
  assert.match(calls[0].prompt, /Do not modify files/);

  const content = await readFile(logFilePath, "utf8");
  const events = content.trim().split("\n").map((line) => JSON.parse(line));

  assert.equal(events[0].event, "request_start");
  assert.equal(events[0].provider, "codex-cli");
  assert.equal(events[0].command, "codex-test");
  assert.equal(events[0].model, "gpt-5.6-codex");
  assert.equal(events[1].event, "request_success");
  assert.equal(events[1].exitCode, 0);
  assert.equal(typeof events[1].durationMs, "number");
  assert.doesNotMatch(content, /안녕/);
});

test("CodexCliSoulRuntime logs execution failures", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "hermes-codex-error-log-"));
  const logFilePath = join(directory, "llm-runtime.log");
  t.after(() => rm(directory, { recursive: true, force: true }));
  const runtime = new CodexCliSoulRuntime({
    command: "codex-test",
    logFilePath,
    commandExecutor: async () => ({
      exitCode: 1,
      stdout: "",
      stderr: "not logged in"
    })
  });

  await assert.rejects(
    () =>
      runtime.execute({
        soul: "default",
        request: "안녕",
        memoryContext: ""
      }),
    /Codex CLI request failed with exit code 1/
  );

  const content = await readFile(logFilePath, "utf8");
  const events = content.trim().split("\n").map((line) => JSON.parse(line));

  assert.equal(events[1].event, "request_error");
  assert.equal(events[1].provider, "codex-cli");
  assert.equal(events[1].exitCode, 1);
  assert.match(events[1].errorMessage, /not logged in/);
});

test("CodexCliSoulRuntime allows workspace edits but defers git operations", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "hermes-codex-write-log-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const prompts: string[] = [];
  const runtime = new CodexCliSoulRuntime({
    sandbox: "workspace-write",
    commandExecutor: async (input) => {
      prompts.push(input.prompt);
      await writeFile(input.outputFilePath, "수정 완료", "utf8");

      return {
        exitCode: 0,
        stdout: "",
        stderr: ""
      };
    }
  });

  await runtime.execute({
    soul: "coder",
    request: "코드 수정해줘",
    memoryContext: ""
  });

  assert.match(prompts[0], /You may modify files/);
  assert.match(prompts[0], /Do not run git commit, git push/);
  assert.doesNotMatch(prompts[0], /Do not modify files/);
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

test("ScheduleService creates schedule events directly in Google Calendar", async () => {
  const calendar = new FakeCalendarEventClient();
  const service = new ScheduleService(calendar, calendar);
  const result = await service.addEvent({
    ownerUserId: "user-1",
    discordGuildId: "guild-1",
    discordChannelId: "channel-1",
    title: "병원 예약",
    localDate: "2026-07-13",
    localTime: "15:00",
    timezone: "Asia/Seoul",
    notes: "신분증 챙기기"
  });
  const event = result.event;

  assert.equal(event.startsAt.toISOString(), "2026-07-13T06:00:00.000Z");
  assert.equal(event.externalCalendarProvider, "google");
  assert.equal(event.externalCalendarEventId, "google-event-1");
  assert.equal(calendar.createdEvents.length, 1);
  assert.equal(calendar.createdEvents[0].title, "병원 예약");
  assert.equal(calendar.createdEvents[0].startsAt.toISOString(), "2026-07-13T06:00:00.000Z");
  assert.deepEqual(result.calendar, {
    status: "created",
    provider: "google",
    externalEventId: "google-event-1",
    url: "https://calendar.google.com/event?eid=1"
  });
});

test("ScheduleService requires Google Calendar for schedule writes and reads", async () => {
  const service = new ScheduleService();

  await assert.rejects(
    service.addEvent({
      ownerUserId: "user-1",
      discordGuildId: "guild-1",
      discordChannelId: "channel-1",
      title: "병원 예약",
      localDate: "2026-07-13",
      localTime: "15:00",
      timezone: "Asia/Seoul"
    }),
    /Google Calendar 설정/
  );
  await assert.rejects(
    service.buildBriefing({
      mode: "daily",
      date: "2026-07-13",
      timezone: "Asia/Seoul"
    }),
    /Google Calendar 설정/
  );
});

test("ScheduleService builds briefings from Google Calendar only", async () => {
  const calendar = new FakeCalendarEventClient([
    {
      provider: "google",
      externalEventId: "google-event-1",
      title: "병원 예약",
      startsAt: new Date("2026-07-13T06:00:00.000Z"),
      timezone: "Asia/Seoul",
      notes: "신분증 챙기기"
    }
  ]);
  const service = new ScheduleService(calendar, calendar);
  const briefing = await service.buildBriefing({
    mode: "daily",
    date: "2026-07-13",
    discordGuildId: "guild-1",
    timezone: "Asia/Seoul"
  });

  assert.equal(briefing.shouldSend, true);
  assert.equal(briefing.eventCount, 1);
  assert.equal(briefing.calendarEventCount, 1);
  assert.equal(calendar.lastRange?.startsAtFrom.toISOString(), "2026-07-12T15:00:00.000Z");
  assert.equal(calendar.lastRange?.startsAtTo.toISOString(), "2026-07-13T15:00:00.000Z");
  assert.match(briefing.discordMessage, /오늘의 일정 \(2026-07-13\)/);
  assert.match(briefing.discordMessage, /1\. 2026-07-13 15:00 병원 예약 - 신분증 챙기기/);
});

test("ScheduleService reads direct Google Calendar events for monthly briefings", async () => {
  const calendar = new FakeCalendarEventClient([
    {
      provider: "google",
      externalEventId: "google-event-1",
      title: "Google에서 수정한 회의",
      startsAt: new Date("2026-07-14T02:00:00.000Z"),
      timezone: "Asia/Seoul"
    },
    {
      provider: "google",
      externalEventId: "google-event-2",
      title: "캘린더에 직접 넣은 일정",
      startsAt: new Date("2026-07-20T01:00:00.000Z"),
      timezone: "Asia/Seoul",
      notes: "Google Calendar 원본"
    }
  ]);
  const service = new ScheduleService(calendar, calendar);

  const briefing = await service.buildBriefing({
    mode: "monthly",
    date: "2026-07-01",
    discordGuildId: "guild-1",
    timezone: "Asia/Seoul"
  });

  assert.equal(calendar.lastRange?.startsAtFrom.toISOString(), "2026-06-30T15:00:00.000Z");
  assert.equal(calendar.lastRange?.startsAtTo.toISOString(), "2026-07-31T15:00:00.000Z");
  assert.equal(briefing.eventCount, 2);
  assert.equal(briefing.calendarEventCount, 2);
  assert.match(briefing.discordMessage, /1\. 2026-07-14 11:00 Google에서 수정한 회의/);
  assert.match(briefing.discordMessage, /2\. 2026-07-20 10:00 캘린더에 직접 넣은 일정 - Google Calendar 원본/);
});

test("parseScheduleQuery detects Korean schedule lookup requests", () => {
  const now = new Date("2026-07-15T01:00:00.000Z");

  assert.deepEqual(parseScheduleQuery("<@123> 7월 일정 알려줘", now), {
    mode: "monthly",
    date: "2026-07-01"
  });
  assert.deepEqual(parseScheduleQuery("이번 달 일정 보여줘", now), {
    mode: "monthly",
    date: "2026-07-01"
  });
  assert.deepEqual(parseScheduleQuery("오늘 일정 확인", now), {
    mode: "daily",
    date: "2026-07-15"
  });
  assert.deepEqual(parseScheduleQuery("내일 일정 있나?", now), {
    mode: "daily",
    date: "2026-07-16"
  });
  assert.deepEqual(parseScheduleQuery("일정 추가하고 싶어", now), undefined);
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

class ThrowingMemoryRepository implements MemoryRepository {
  async upsertMemory(): Promise<void> {}

  async searchMemory(): Promise<readonly []> {
    throw new Error("external memory unavailable");
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

class FakeCalendarEventClient implements CalendarEventSink, CalendarEventSource {
  readonly createdEvents: CalendarEventDraft[] = [];
  lastRange?: CalendarEventRange;

  constructor(private readonly events: readonly CalendarEvent[] = []) {}

  async createEvent(draft: CalendarEventDraft): Promise<CreatedCalendarEvent> {
    this.createdEvents.push(draft);

    return {
      provider: "google",
      externalEventId: `google-event-${this.createdEvents.length}`,
      url: "https://calendar.google.com/event?eid=1"
    };
  }

  async listEvents(range: CalendarEventRange): Promise<readonly CalendarEvent[]> {
    this.lastRange = range;
    return this.events.filter(
      (event) =>
        event.startsAt >= range.startsAtFrom &&
        event.startsAt < range.startsAtTo
    );
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
