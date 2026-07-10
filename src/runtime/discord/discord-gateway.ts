import {
  Client,
  Events,
  GatewayIntentBits,
  type ChatInputCommandInteraction,
  type Interaction,
  type Message
} from "discord.js";
import type { Role } from "../../domain";
import { handleSlashCommand } from "../../interfaces";
import type { RuntimeConfig } from "../config/runtime-config";
import type { LocalRuntime } from "../create-runtime";
import { handleRuntimeDiscordMessage } from "./discord-message-handler";

export interface DiscordGatewayLogger {
  info(message: string): void;
  error(message: string, error?: unknown): void;
}

export function createDiscordGatewayClient(
  runtime: LocalRuntime,
  config: RuntimeConfig,
  logger: DiscordGatewayLogger = console
): Client {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.MessageContent
    ]
  });

  client.once(Events.ClientReady, (readyClient) => {
    logger.info(`Discord Gateway ready as ${readyClient.user.tag}`);
  });

  client.on(Events.MessageCreate, async (message) => {
    try {
      await handleGatewayMessage(message, runtime, config);
    } catch (error) {
      logger.error("Discord message handling failed.", error);
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      await handleGatewayInteraction(interaction, config);
    } catch (error) {
      logger.error("Discord interaction handling failed.", error);
    }
  });

  return client;
}

export async function startDiscordGateway(
  runtime: LocalRuntime,
  config: RuntimeConfig,
  logger: DiscordGatewayLogger = console
): Promise<Client | undefined> {
  if (!config.discord.enableGateway) {
    logger.info("Discord Gateway disabled. Set DISCORD_ENABLE_GATEWAY=true to enable it.");
    return undefined;
  }

  if (!config.discord.token) {
    throw new Error("DISCORD_BOT_TOKEN is required when Discord Gateway is enabled.");
  }

  const client = createDiscordGatewayClient(runtime, config, logger);
  await client.login(config.discord.token);
  return client;
}

export function roleForDiscordUser(
  userId: string,
  config: RuntimeConfig
): Role {
  return config.discord.ownerUserIds.includes(userId) ? "owner" : "developer";
}

export function truncateDiscordContent(content: string): string {
  if (content.length <= 2000) {
    return content;
  }

  const suffix = "\n...[truncated]";
  return `${content.slice(0, 2000 - suffix.length)}${suffix}`;
}

async function handleGatewayMessage(
  message: Message,
  runtime: LocalRuntime,
  config: RuntimeConfig
): Promise<void> {
  const result = await handleRuntimeDiscordMessage(
    {
      id: message.id,
      authorId: message.author.id,
      channelId: message.channelId,
      content: message.content,
      isBot: message.author.bot,
      isDirectMessage: message.guildId === null,
      mentionedUserIds: message.mentions.users.map((user) => user.id),
      sessionId: message.channelId,
      userRole: roleForDiscordUser(message.author.id, config)
    },
    runtime
  );

  if (result.status === 202 || result.status >= 400) {
    return;
  }

  if (result.body.kind === "chat" && result.body.answer) {
    await message.reply({
      content: truncateDiscordContent(result.body.answer)
    });
    return;
  }

  if (result.body.kind === "admin-dm" && result.body.content) {
    await message.reply({
      content: truncateDiscordContent(result.body.content)
    });
  }
}

async function handleGatewayInteraction(
  interaction: Interaction,
  config: RuntimeConfig
): Promise<void> {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  if (interaction.commandName !== "status" && interaction.commandName !== "config") {
    return;
  }

  const response = handleSlashCommand({
    command: interaction.commandName,
    userRole: roleForInteraction(interaction, config)
  });

  await replyEphemeral(interaction, response.content, response.ephemeral);
}

function roleForInteraction(
  interaction: ChatInputCommandInteraction,
  config: RuntimeConfig
): Role {
  return roleForDiscordUser(interaction.user.id, config);
}

async function replyEphemeral(
  interaction: ChatInputCommandInteraction,
  content: string,
  ephemeral: boolean
): Promise<void> {
  if (interaction.replied || interaction.deferred) {
    await interaction.followUp({
      content: truncateDiscordContent(content),
      ephemeral
    });
    return;
  }

  await interaction.reply({
    content: truncateDiscordContent(content),
    ephemeral
  });
}
