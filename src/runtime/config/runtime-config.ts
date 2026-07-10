import type { Role } from "../../domain";

export interface RuntimeConfig {
  nodeEnv: string;
  logLevel: string;
  port: number;
  databaseUrl: string;
  discord: {
    botUserId: string;
    guildId?: string;
    dedicatedChannelId: string;
    ownerUserIds: readonly string[];
  };
  n8n: {
    webhookSecret: string;
  };
}

export interface RuntimeUserConfig {
  id: string;
  role: Role;
}

export function loadRuntimeConfig(
  env: Record<string, string | undefined>
): RuntimeConfig {
  return {
    nodeEnv: env.NODE_ENV ?? "development",
    logLevel: env.LOG_LEVEL ?? "info",
    port: parsePort(env.PORT ?? "3000"),
    databaseUrl:
      env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/hermes",
    discord: {
      botUserId: requireValue(env.DISCORD_BOT_USER_ID, "DISCORD_BOT_USER_ID"),
      guildId: env.DISCORD_GUILD_ID,
      dedicatedChannelId: requireValue(
        env.DISCORD_DEDICATED_CHANNEL_ID,
        "DISCORD_DEDICATED_CHANNEL_ID"
      ),
      ownerUserIds: parseCsv(env.DISCORD_OWNER_USER_IDS)
    },
    n8n: {
      webhookSecret: requireValue(env.N8N_WEBHOOK_SECRET, "N8N_WEBHOOK_SECRET")
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

function requireValue(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
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
