import {
  HermesChatService,
  HermesNewsBriefingService,
  MemoryContextService,
  SoulPipeline,
  TaskPlanner
} from "../application";
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
  discord: DiscordInterfaceConfig;
}

export function createLocalRuntime(config: RuntimeConfig): LocalRuntime {
  const embeddingProvider = new DeterministicEmbeddingProvider();
  const memoryRepository = new InMemoryMemoryRepository();
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
    discord: {
      botUserId: config.discord.botUserId,
      dedicatedChannelId: config.discord.dedicatedChannelId,
      ownerUserIds: config.discord.ownerUserIds
    }
  };
}
