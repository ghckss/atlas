export interface DiscordInterfaceConfig {
  botUserId: string;
  ownerUserIds: readonly string[];
}

export interface DiscordMessageInput {
  id: string;
  authorId: string;
  channelId: string;
  content: string;
  isBot: boolean;
  isDirectMessage: boolean;
  mentionedUserIds: readonly string[];
}

export type DiscordRouteDecision =
  | {
      kind: "ignore";
      reason: string;
    }
  | {
      kind: "chat";
      content: string;
    }
  | {
      kind: "admin-dm";
      content: string;
    };

export function routeDiscordMessage(
  input: DiscordMessageInput,
  config: DiscordInterfaceConfig
): DiscordRouteDecision {
  if (input.isBot) {
    return {
      kind: "ignore",
      reason: "bot-message"
    };
  }

  if (input.isDirectMessage) {
    if (!config.ownerUserIds.includes(input.authorId)) {
      return {
        kind: "ignore",
        reason: "dm-from-non-owner"
      };
    }

    return {
      kind: "admin-dm",
      content: input.content.trim()
    };
  }

  if (!isBotMentioned(input, config.botUserId)) {
    return {
      kind: "ignore",
      reason: "missing-bot-mention"
    };
  }

  const content = stripBotMention(input.content, config.botUserId);

  if (content.length === 0) {
    return {
      kind: "ignore",
      reason: "empty-mention"
    };
  }

  return {
    kind: "chat",
    content
  };
}

function isBotMentioned(input: DiscordMessageInput, botUserId: string): boolean {
  return (
    input.mentionedUserIds.includes(botUserId) ||
    new RegExp(`<@!?${escapeRegExp(botUserId)}>`, "g").test(input.content)
  );
}

function stripBotMention(content: string, botUserId: string): string {
  return content
    .replace(new RegExp(`<@!?${escapeRegExp(botUserId)}>`, "g"), "")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
