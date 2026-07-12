import {
  HermesChatService,
  HermesNewsBriefingService,
  MemoryContextService,
  type MemoryRepository,
  SoulPipeline,
  TaskPlanner
} from "../application";
import {
  HttpNewsSourceClient,
  Mem0HttpClient,
  Mem0MemoryAdapter
} from "../infrastructure";
import type { DiscordInterfaceConfig } from "../interfaces";
import type { RuntimeConfig } from "./config/runtime-config";
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
  discord: DiscordInterfaceConfig;
}

export function createLocalRuntime(config: RuntimeConfig): LocalRuntime {
  const embeddingProvider = new DeterministicEmbeddingProvider();
  const memoryRepository = createMemoryRepository(config);
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
    discord: {
      botUserId: config.discord.botUserId,
      dedicatedChannelId: config.discord.dedicatedChannelId,
      ownerUserIds: config.discord.ownerUserIds
    }
  };
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
      approvalPolicy: config.llm.codexCliApprovalPolicy,
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
