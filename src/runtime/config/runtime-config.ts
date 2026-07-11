import type { Role } from "../../domain";

export interface RuntimeConfig {
  nodeEnv: string;
  logLevel: string;
  port: number;
  databaseUrl: string;
  llm: {
    provider: "template" | "openai";
    openaiApiKey?: string;
    openaiBaseUrl: string;
    openaiModel: string;
    openaiLogFilePath?: string;
    requestTimeoutMs: number;
  };
  discord: {
    token?: string;
    botUserId: string;
    guildId?: string;
    dedicatedChannelId: string;
    ownerUserIds: readonly string[];
    enableGateway: boolean;
  };
  n8n: {
    webhookSecret: string;
    apiUrl?: string;
    apiKey?: string;
  };
  mem0: {
    apiKey?: string;
    baseUrl?: string;
  };
  news: {
    sourceUrls: readonly string[];
    providers: readonly string[];
    query: string;
    googleLanguage: string;
    googleCountry: string;
    naverClientId?: string;
    naverClientSecret?: string;
    naverDisplay: number;
    maxArticles: number;
    collectionTimeoutMs: number;
  };
}

export interface RuntimeUserConfig {
  id: string;
  role: Role;
}

export function loadRuntimeConfig(
  env: Record<string, string | undefined>
): RuntimeConfig {
  const newsSourceUrls = parseCsv(env.NEWS_SOURCE_URLS);

  return {
    nodeEnv: env.NODE_ENV ?? "development",
    logLevel: env.LOG_LEVEL ?? "info",
    port: parsePort(env.PORT ?? "3000"),
    databaseUrl:
      env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/hermes",
    llm: {
      provider: parseLlmProvider(env.LLM_PROVIDER),
      openaiApiKey: env.OPENAI_API_KEY,
      openaiBaseUrl: env.OPENAI_BASE_URL ?? "https://api.openai.com",
      openaiModel: env.OPENAI_MODEL ?? "gpt-5.6",
      openaiLogFilePath: parseOptionalPath(
        env.OPENAI_LOG_FILE,
        "logs/openai-runtime.log"
      ),
      requestTimeoutMs: parsePositiveInteger(
        env.LLM_REQUEST_TIMEOUT_MS ?? "30000",
        "LLM_REQUEST_TIMEOUT_MS"
      )
    },
    discord: {
      token: env.DISCORD_BOT_TOKEN,
      botUserId: requireValue(env.DISCORD_BOT_USER_ID, "DISCORD_BOT_USER_ID"),
      guildId: env.DISCORD_GUILD_ID,
      dedicatedChannelId: requireValue(
        env.DISCORD_DEDICATED_CHANNEL_ID,
        "DISCORD_DEDICATED_CHANNEL_ID"
      ),
      ownerUserIds: parseCsv(env.DISCORD_OWNER_USER_IDS),
      enableGateway: env.DISCORD_ENABLE_GATEWAY === "true"
    },
    n8n: {
      webhookSecret: requireValue(env.N8N_WEBHOOK_SECRET, "N8N_WEBHOOK_SECRET"),
      apiUrl: env.N8N_API_URL,
      apiKey: env.N8N_API_KEY
    },
    mem0: {
      apiKey: env.MEM0_API_KEY,
      baseUrl: env.MEM0_BASE_URL ?? "https://api.mem0.ai"
    },
    news: {
      sourceUrls: newsSourceUrls,
      providers: parseNewsProviders(env.NEWS_PROVIDERS, newsSourceUrls),
      query: env.NEWS_QUERY ?? "",
      googleLanguage: env.NEWS_GOOGLE_LANGUAGE ?? "ko",
      googleCountry: env.NEWS_GOOGLE_COUNTRY ?? "KR",
      naverClientId: env.NAVER_CLIENT_ID,
      naverClientSecret: env.NAVER_CLIENT_SECRET,
      naverDisplay: parsePositiveInteger(
        env.NEWS_NAVER_DISPLAY ?? "10",
        "NEWS_NAVER_DISPLAY"
      ),
      maxArticles: parsePositiveInteger(
        env.NEWS_MAX_ARTICLES ?? "10",
        "NEWS_MAX_ARTICLES"
      ),
      collectionTimeoutMs: parsePositiveInteger(
        env.NEWS_COLLECTION_TIMEOUT_MS ?? "5000",
        "NEWS_COLLECTION_TIMEOUT_MS"
      )
    }
  };
}

export function roleFromRuntimeInput(value: unknown): Role {
  if (value === "owner" || value === "developer" || value === "viewer") {
    return value;
  }

  return "developer";
}

function parsePort(value: string): number {
  const port = Number(value);

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }

  return port;
}

function parsePositiveInteger(value: string, name: string): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

function requireValue(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

function parseOptionalPath(
  value: string | undefined,
  defaultValue: string
): string | undefined {
  if (value === undefined) {
    return defaultValue;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

function parseLlmProvider(value: string | undefined): RuntimeConfig["llm"]["provider"] {
  if (!value || value === "template") {
    return "template";
  }

  if (value === "openai") {
    return "openai";
  }

  throw new Error("LLM_PROVIDER must be either template or openai.");
}

function parseCsv(value: string | undefined): readonly string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function parseNewsProviders(
  value: string | undefined,
  sourceUrls: readonly string[]
): readonly string[] {
  const providers = parseCsv(value);

  if (providers.length > 0) {
    return providers;
  }

  if (sourceUrls.length > 0) {
    return ["source-url"];
  }

  return ["google-news-top"];
}
