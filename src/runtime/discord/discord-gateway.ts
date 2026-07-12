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
      await handleGatewayMessage(message, runtime, config, logger);
    } catch (error) {
      logger.error(
        `Discord message handling failed. messageId=${message.id} channelId=${message.channelId}`,
        error
      );
      try {
        await message.reply({
          content: truncateDiscordContent(formatDiscordGatewayErrorReply(error))
        });
      } catch (replyError) {
        logger.error(
          `Discord error reply failed. messageId=${message.id} channelId=${message.channelId}`,
          replyError
        );
      }
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      await handleGatewayInteraction(interaction, config);
    } catch (error) {
      logger.error("Discord interaction handling failed.", error);
    }
  });

  client.on(Events.Error, (error) => {
    logger.error("Discord Gateway emitted an error.", error);
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
  logger.info(
    `Discord Gateway login starting. botUserId=${config.discord.botUserId} dedicatedChannelId=${config.discord.dedicatedChannelId}`
  );
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

export function formatDiscordGatewayErrorReply(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("OpenAI response failed with 429")) {
    return [
      "현재 LLM 제공자의 quota 또는 billing 제한 때문에 답변을 생성하지 못했습니다.",
      "OpenAI API 결제/크레딧 상태를 확인하거나, `.env`의 `OPENAI_MODEL`/`OPENAI_API_KEY` 설정을 점검해주세요."
    ].join("\n");
  }

  if (message.includes("OpenAI response failed")) {
    return "현재 LLM 제공자 호출 중 오류가 발생했습니다. 서버 로그의 OpenAI 오류 내용을 확인해주세요.";
  }

  if (message.includes("Codex CLI request timed out")) {
    return "Codex CLI 응답 시간이 초과되었습니다. `LLM_REQUEST_TIMEOUT_MS`를 늘리거나 Codex CLI 상태를 확인해주세요.";
  }

  if (message.includes("Codex CLI request failed")) {
    return "현재 Codex CLI 호출 중 오류가 발생했습니다. 서버 로그와 `pnpm logs` 출력을 확인해주세요.";
  }

  return "요청을 처리하는 중 오류가 발생했습니다. 서버 로그를 확인해주세요.";
}

async function handleGatewayMessage(
  message: Message,
  runtime: LocalRuntime,
  config: RuntimeConfig,
  logger: DiscordGatewayLogger
): Promise<void> {
  const mentionedUserIds = message.mentions.users.map((user) => user.id);
  const rawMentionedUserIds = extractRawMentionedUserIds(message.content);
  logger.info(
    [
      "Discord message received.",
      `messageId=${message.id}`,
      `channelId=${message.channelId}`,
      `authorId=${message.author.id}`,
      `isBot=${message.author.bot}`,
      `isDirectMessage=${message.guildId === null}`,
      `contentLength=${message.content.length}`,
      `mentionedUsers=${mentionedUserIds.length}`,
      `rawMentionedUsers=${rawMentionedUserIds.join(",") || "none"}`,
      `mentionsConfiguredBot=${mentionedUserIds.includes(config.discord.botUserId)}`,
      `rawMentionsConfiguredBot=${rawMentionedUserIds.includes(config.discord.botUserId)}`
    ].join(" ")
  );

  const result = await handleRuntimeDiscordMessage(
    {
      id: message.id,
      authorId: message.author.id,
      channelId: message.channelId,
      content: message.content,
      isBot: message.author.bot,
      isDirectMessage: message.guildId === null,
      mentionedUserIds,
      sessionId: message.channelId,
      userRole: roleForDiscordUser(message.author.id, config)
    },
    runtime
  );

  if (result.status === 202) {
    logger.info(
      `Discord message ignored. messageId=${message.id} reason=${result.body.reason ?? "unknown"}`
    );
    return;
  }

  if (result.status >= 400) {
    logger.error(
      `Discord message rejected. messageId=${message.id} status=${result.status} error=${result.body.error ?? "unknown"}`
    );
    return;
  }

  if (result.body.kind === "chat" && result.body.answer) {
    logger.info(
      [
        "Discord message routed to chat.",
        `messageId=${message.id}`,
        `answerLength=${result.body.answer.length}`,
        `memoryCount=${result.body.memoryCount ?? 0}`,
        `souls=${result.body.souls?.join(",") ?? ""}`
      ].join(" ")
    );
    await message.reply({
      content: truncateDiscordContent(result.body.answer)
    });
    logger.info(`Discord reply sent. messageId=${message.id}`);
    return;
  }

  if (result.body.kind === "admin-dm" && result.body.content) {
    logger.info(
      `Discord admin DM acknowledged. messageId=${message.id} contentLength=${result.body.content.length}`
    );
    await message.reply({
      content: truncateDiscordContent(result.body.content)
    });
    logger.info(`Discord admin DM reply sent. messageId=${message.id}`);
    return;
  }

  logger.info(
    `Discord message produced no reply. messageId=${message.id} kind=${result.body.kind ?? "unknown"}`
  );
}

function extractRawMentionedUserIds(content: string): readonly string[] {
  return [...content.matchAll(/<@!?(\d+)>/g)].map((match) => match[1]);
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
