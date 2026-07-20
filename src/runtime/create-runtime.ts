import {
  HermesChatService,
  HermesNewsBriefingService,
  MemoryContextService,
  ScheduleService,
  type CalendarEventSource,
  type CalendarEventSink,
  type MemoryRepository,
  SoulPipeline,
  TaskPlanner
} from "../application";
import {
  GoogleCalendarEventSink,
  HttpNewsSourceClient,
  Mem0HttpClient,
  Mem0MemoryAdapter,
} from "../infrastructure";
import type { DiscordInterfaceConfig } from "../interfaces";
import type { RuntimeConfig } from "./config/runtime-config";
import { GitApprovalService } from "./git";
import {
  CodexCliSoulRuntime,
  DeterministicEmbeddingProvider,
  InMemoryChatHistoryRepository,
  InMemoryMemoryRepository,
  OpenAISoulRuntime,
  TemplateSoulRuntime
} from "./adapters";

export interface LocalRuntime {
  chat: HermesChatService;
  newsBriefing: HermesNewsBriefingService;
  newsCollector: HttpNewsSourceClient;
  schedule: ScheduleService;
  scheduleTimezone: string;
  discord: DiscordInterfaceConfig;
  gitApproval: GitApprovalService;
}

export function createLocalRuntime(config: RuntimeConfig): LocalRuntime {
  const embeddingProvider = new DeterministicEmbeddingProvider();
  const memoryRepository = createMemoryRepository(config);
  const calendarClient = createCalendarClient(config);
  const memoryContext = new MemoryContextService(
    embeddingProvider,
    memoryRepository
  );
  const planner = new TaskPlanner();
  const soulPipeline = new SoulPipeline(createSoulRuntime(config));

  return {
    chat: new HermesChatService(
      new InMemoryChatHistoryRepository(),
      memoryContext,
      planner,
      soulPipeline
    ),
    newsBriefing: new HermesNewsBriefingService(planner, soulPipeline),
    newsCollector: new HttpNewsSourceClient({
      timeoutMs: config.news.collectionTimeoutMs
    }),
    schedule: new ScheduleService(calendarClient, calendarClient),
    scheduleTimezone: config.schedule.timezone,
    discord: {
      botUserId: config.discord.botUserId,
      dedicatedChannelId: config.discord.dedicatedChannelId,
      ownerUserIds: config.discord.ownerUserIds
    },
    gitApproval: new GitApprovalService({
      enabled: config.gitApproval.enabled,
      workdir: config.gitApproval.workdir,
      remote: config.gitApproval.remote,
      defaultCommitMessage: config.gitApproval.defaultCommitMessage
    })
  };
}

function createCalendarClient(
  config: RuntimeConfig
): (CalendarEventSink & CalendarEventSource) | undefined {
  if (!config.calendar.googleEnabled) {
    return undefined;
  }

  return new GoogleCalendarEventSink({
    clientId: config.calendar.googleClientId ?? "",
    clientSecret: config.calendar.googleClientSecret ?? "",
    refreshToken: config.calendar.googleRefreshToken ?? "",
    calendarId: config.calendar.googleCalendarId,
    defaultDurationMinutes: config.calendar.googleDefaultEventDurationMinutes
  });
}

function createSoulRuntime(config: RuntimeConfig) {
  if (config.llm.provider === "openai") {
    return new OpenAISoulRuntime({
      apiKey: config.llm.openaiApiKey ?? "",
      baseUrl: config.llm.openaiBaseUrl,
      model: config.llm.openaiModel,
      logFilePath: config.llm.logFilePath,
      timeoutMs: config.llm.requestTimeoutMs
    });
  }

  if (config.llm.provider === "codex-cli") {
    return new CodexCliSoulRuntime({
      command: config.llm.codexCliCommand,
      model: config.llm.codexCliModel,
      profile: config.llm.codexCliProfile,
      sandbox: config.llm.codexCliSandbox,
      workingDirectory: config.llm.codexCliWorkdir,
      logFilePath: config.llm.logFilePath,
      timeoutMs: config.llm.requestTimeoutMs,
      useOss: config.llm.codexCliUseOss,
      localProvider: config.llm.codexCliLocalProvider
    });
  }

  return new TemplateSoulRuntime();
}

function createMemoryRepository(config: RuntimeConfig): MemoryRepository {
  if (config.mem0.apiKey && config.mem0.baseUrl) {
    return new Mem0MemoryAdapter(
      new Mem0HttpClient({
        apiKey: config.mem0.apiKey,
        baseUrl: config.mem0.baseUrl
      })
    );
  }

  return new InMemoryMemoryRepository();
}
