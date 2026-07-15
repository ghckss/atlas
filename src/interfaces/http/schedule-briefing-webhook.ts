import type {
  ScheduleBriefingResponse,
  ScheduleService
} from "../../application";

export interface ScheduleBriefingWebhookBody {
  mode: "daily" | "monthly";
  date?: string;
  discordGuildId?: string;
  discordChannelId?: string;
}

export function createScheduleBriefingWebhookHandler(
  service: ScheduleService,
  secret: string,
  defaults: {
    discordGuildId?: string;
    discordChannelId: string;
    timezone: string;
  }
): (request: {
  headers: Record<string, string | undefined>;
  body: unknown;
}) => Promise<{ status: number; body: unknown }> {
  if (!secret) {
    throw new Error("N8N webhook secret is required.");
  }

  return async (request) => {
    if (request.headers["x-n8n-webhook-secret"] !== secret) {
      return {
        status: 401,
        body: {
          error: "unauthorized"
        }
      };
    }

    const body = parseBody(request.body);

    if (!body) {
      return {
        status: 400,
        body: {
          error: "invalid_schedule_briefing_payload"
        }
      };
    }

    const result = await service.buildBriefing({
      mode: body.mode,
      date: body.date ?? todayInSeoul(),
      discordGuildId: body.discordGuildId ?? defaults.discordGuildId,
      discordChannelId: body.discordChannelId ?? defaults.discordChannelId,
      timezone: defaults.timezone
    });

    return toWebhookResponse(result);
  };
}

function parseBody(body: unknown): ScheduleBriefingWebhookBody | undefined {
  if (typeof body !== "object" || body === null) {
    return undefined;
  }

  const value = body as {
    mode?: unknown;
    date?: unknown;
    discordGuildId?: unknown;
    discordChannelId?: unknown;
  };

  if (value.mode !== "daily" && value.mode !== "monthly") {
    return undefined;
  }

  if (value.date !== undefined && typeof value.date !== "string") {
    return undefined;
  }

  if (
    value.discordGuildId !== undefined &&
    typeof value.discordGuildId !== "string"
  ) {
    return undefined;
  }

  if (
    value.discordChannelId !== undefined &&
    typeof value.discordChannelId !== "string"
  ) {
    return undefined;
  }

  return {
    mode: value.mode,
    date: value.date,
    discordGuildId: value.discordGuildId,
    discordChannelId: value.discordChannelId
  };
}

function toWebhookResponse(
  result: ScheduleBriefingResponse
): { status: number; body: ScheduleBriefingResponse } {
  return {
    status: 200,
    body: result
  };
}

function todayInSeoul(): string {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
