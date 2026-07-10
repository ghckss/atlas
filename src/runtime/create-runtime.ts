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
  DeterministicEmbeddingProvider,
  InMemoryChatHistoryRepository,
  InMemoryMemoryRepository,
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
  const soulPipeline = new SoulPipeline(new TemplateSoulRuntime());

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
