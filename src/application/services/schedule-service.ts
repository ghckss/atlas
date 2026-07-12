import type { ScheduleEvent, ScheduleEventDraft } from "../../domain";
import type { ScheduleRepository } from "../ports";

export interface AddScheduleEventInput {
  ownerUserId: string;
  discordGuildId?: string;
  discordChannelId: string;
  title: string;
  localDate: string;
  localTime: string;
  timezone: string;
  notes?: string;
}

export interface ScheduleBriefingRequest {
  mode: "daily" | "monthly";
  date: string;
  discordChannelId: string;
  timezone: string;
}

export interface ScheduleBriefingResponse {
  shouldSend: boolean;
  discordMessage: string;
  discordMessages: readonly string[];
  eventCount: number;
}

const DISCORD_MESSAGE_LIMIT = 2000;

export class ScheduleService {
  constructor(private readonly repository: ScheduleRepository) {}

  async addEvent(input: AddScheduleEventInput): Promise<ScheduleEvent> {
    const title = input.title.trim();

    if (!title) {
      throw new Error("일정 제목을 입력해주세요.");
    }

    const startsAt = parseLocalDateTime({
      localDate: input.localDate,
      localTime: input.localTime,
      timezone: input.timezone
    });
    const notes = input.notes?.trim() || undefined;
    const draft: ScheduleEventDraft = {
      ownerUserId: input.ownerUserId,
      discordGuildId: input.discordGuildId,
      discordChannelId: input.discordChannelId,
      title,
      startsAt,
      timezone: input.timezone,
      notes
    };

    return this.repository.createEvent(draft);
  }

  async buildBriefing(
    request: ScheduleBriefingRequest
  ): Promise<ScheduleBriefingResponse> {
    const range =
      request.mode === "daily"
        ? localDayRange(request.date, request.timezone)
        : localMonthRange(request.date, request.timezone);
    const events = await this.repository.listEvents({
      discordChannelId: request.discordChannelId,
      startsAtFrom: range.from,
      startsAtTo: range.to,
      status: "active"
    });
    const message = formatScheduleBriefing({
      mode: request.mode,
      date: request.date,
      timezone: request.timezone,
      events
    });
    const discordMessages = splitDiscordMessages(message);

    return {
      shouldSend: discordMessages.length > 0,
      discordMessage: discordMessages[0] ?? "",
      discordMessages,
      eventCount: events.length
    };
  }
}

export function parseLocalDateTime(input: {
  localDate: string;
  localTime: string;
  timezone: string;
}): Date {
  assertSupportedTimezone(input.timezone);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.localDate)) {
    throw new Error("날짜는 YYYY-MM-DD 형식으로 입력해주세요.");
  }

  if (!/^\d{2}:\d{2}$/.test(input.localTime)) {
    throw new Error("시간은 HH:mm 형식으로 입력해주세요.");
  }

  const [year, month, day] = input.localDate.split("-").map(Number);
  const [hour, minute] = input.localTime.split(":").map(Number);

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    throw new Error("날짜 또는 시간이 올바르지 않습니다.");
  }

  const startsAt = new Date(Date.UTC(year, month - 1, day, hour - 9, minute));
  const normalized = formatLocalDateTime(startsAt, input.timezone);

  if (normalized.date !== input.localDate || normalized.time !== input.localTime) {
    throw new Error("날짜 또는 시간이 올바르지 않습니다.");
  }

  return startsAt;
}

export function formatLocalDateTime(
  date: Date,
  timezone: string
): { date: string; time: string } {
  assertSupportedTimezone(timezone);

  const local = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const year = local.getUTCFullYear();
  const month = pad(local.getUTCMonth() + 1);
  const day = pad(local.getUTCDate());
  const hour = pad(local.getUTCHours());
  const minute = pad(local.getUTCMinutes());

  return {
    date: `${year}-${month}-${day}`,
    time: `${hour}:${minute}`
  };
}

function localDayRange(
  localDate: string,
  timezone: string
): { from: Date; to: Date } {
  const from = parseLocalDateTime({
    localDate,
    localTime: "00:00",
    timezone
  });
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);

  return { from, to };
}

function localMonthRange(
  localDate: string,
  timezone: string
): { from: Date; to: Date } {
  assertSupportedTimezone(timezone);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) {
    throw new Error("날짜는 YYYY-MM-DD 형식으로 입력해주세요.");
  }

  parseLocalDateTime({
    localDate,
    localTime: "00:00",
    timezone
  });

  const [year, month] = localDate.split("-").map(Number);
  const from = parseLocalDateTime({
    localDate: `${year}-${pad(month)}-01`,
    localTime: "00:00",
    timezone
  });
  const nextMonthYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const to = parseLocalDateTime({
    localDate: `${nextMonthYear}-${pad(nextMonth)}-01`,
    localTime: "00:00",
    timezone
  });

  return { from, to };
}

function formatScheduleBriefing(input: {
  mode: "daily" | "monthly";
  date: string;
  timezone: string;
  events: readonly ScheduleEvent[];
}): string {
  if (input.mode === "daily") {
    return [
      `오늘의 일정 (${input.date})`,
      "",
      input.events.length > 0
        ? input.events.map((event, index) => formatEventLine(event, index, input.timezone)).join("\n")
        : "오늘 등록된 일정이 없습니다."
    ].join("\n");
  }

  const [year, month] = input.date.split("-");

  return [
    `${year}년 ${Number(month)}월 일정`,
    "",
    input.events.length > 0
      ? input.events.map((event, index) => formatEventLine(event, index, input.timezone)).join("\n")
      : "이번 달에 등록된 일정이 없습니다."
  ].join("\n");
}

function formatEventLine(
  event: ScheduleEvent,
  index: number,
  timezone: string
): string {
  const local = formatLocalDateTime(event.startsAt, timezone);
  const notes = event.notes ? ` - ${event.notes}` : "";

  return `${index + 1}. ${local.date} ${local.time} ${event.title}${notes}`;
}

function splitDiscordMessages(message: string): readonly string[] {
  if (!message.trim()) {
    return [];
  }

  const chunks: string[] = [];
  let current = "";

  for (const line of message.split("\n")) {
    const candidate = current ? `${current}\n${line}` : line;

    if (candidate.length <= DISCORD_MESSAGE_LIMIT) {
      current = candidate;
      continue;
    }

    if (current) {
      chunks.push(current);
      current = "";
    }

    for (let index = 0; index < line.length; index += DISCORD_MESSAGE_LIMIT) {
      chunks.push(line.slice(index, index + DISCORD_MESSAGE_LIMIT));
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

function assertSupportedTimezone(timezone: string): void {
  if (timezone !== "Asia/Seoul") {
    throw new Error("현재 일정 시간대는 Asia/Seoul만 지원합니다.");
  }
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}
