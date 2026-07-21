import type { LocalRuntime } from "../create-runtime";
import { roleFromRuntimeInput } from "../config/runtime-config";
import { parseScheduleQuery } from "../../application";
import { routeDiscordMessage } from "../../interfaces";

export interface RuntimeDiscordMessageInput {
  id: string;
  authorId: string;
  channelId: string;
  guildId?: string;
  content: string;
  isBot?: boolean;
  isDirectMessage?: boolean;
  mentionedUserIds?: readonly string[];
  sessionId?: string;
  projectId?: string;
  conversationContext?: string;
  userRole?: unknown;
}

export interface RuntimeDiscordMessageResponse {
  status: number;
  body: {
    kind?: string;
    reason?: string;
    content?: string;
    answer?: string;
    memoryCount?: number;
    eventCount?: number;
    souls?: readonly string[];
    error?: string;
  };
}

export async function handleRuntimeDiscordMessage(
  body: unknown,
  runtime: LocalRuntime
): Promise<RuntimeDiscordMessageResponse> {
  if (!isDiscordMessageBody(body)) {
    return {
      status: 400,
      body: {
        error: "invalid_discord_message_payload"
      }
    };
  }

  const route = routeDiscordMessage(
    {
      id: body.id,
      authorId: body.authorId,
      channelId: body.channelId,
      content: body.content,
      isBot: body.isBot ?? false,
      isDirectMessage: body.isDirectMessage ?? false,
      mentionedUserIds: body.mentionedUserIds ?? []
    },
    runtime.discord
  );

  if (route.kind === "ignore") {
    return {
      status: 202,
      body: route
    };
  }

  if (route.kind === "admin-dm") {
    return {
      status: 200,
      body: {
        kind: "admin-dm",
        content: "관리자 DM은 로컬 MVP에서 수신 확인까지만 처리합니다."
      }
    };
  }

  const scheduleQuery = parseScheduleQuery(
    route.content,
    new Date(),
    runtime.scheduleTimezone
  );

  if (scheduleQuery) {
    const briefing = await runtime.schedule.buildBriefing({
      mode: scheduleQuery.mode,
      date: scheduleQuery.date,
      discordGuildId: body.guildId,
      discordChannelId: body.channelId,
      timezone: runtime.scheduleTimezone
    });

    return {
      status: 200,
      body: {
        kind: "schedule",
        content: briefing.discordMessage,
        eventCount: briefing.eventCount
      }
    };
  }

  const response = await runtime.chat.respond({
    sessionId: body.sessionId ?? body.channelId,
    user: {
      id: body.authorId,
      role: roleFromRuntimeInput(body.userRole)
    },
    projectId: body.projectId,
    content: route.content,
    conversationContext: body.conversationContext
  });

  return {
    status: 200,
    body: {
      kind: "chat",
      answer: response.answer,
      memoryCount: response.memoryCount,
      souls: response.pipeline.steps.map((step) => step.step.soul)
    }
  };
}

export function isDiscordMessageBody(
  body: unknown
): body is RuntimeDiscordMessageInput {
  if (typeof body !== "object" || body === null) {
    return false;
  }

  const value = body as {
    id?: unknown;
    authorId?: unknown;
    channelId?: unknown;
    guildId?: unknown;
    content?: unknown;
    mentionedUserIds?: unknown;
    conversationContext?: unknown;
  };

  return (
    typeof value.id === "string" &&
    typeof value.authorId === "string" &&
    typeof value.channelId === "string" &&
    (value.guildId === undefined || typeof value.guildId === "string") &&
    typeof value.content === "string" &&
    (value.conversationContext === undefined ||
      typeof value.conversationContext === "string") &&
    (value.mentionedUserIds === undefined ||
      (Array.isArray(value.mentionedUserIds) &&
        value.mentionedUserIds.every((id) => typeof id === "string")))
  );
}
