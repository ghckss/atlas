import { formatLocalDateTime } from "./schedule-service";

export interface ParsedScheduleQuery {
  mode: "daily" | "monthly";
  date: string;
}

const QUERY_INTENT_PATTERN = /(알려|조회|보여|확인|정리|뭐|어떤|있어|있나|리스트)/;

export function parseScheduleQuery(
  content: string,
  now: Date = new Date(),
  timezone = "Asia/Seoul"
): ParsedScheduleQuery | undefined {
  const normalized = normalizeScheduleQuery(content);

  if (!normalized.includes("일정") || !QUERY_INTENT_PATTERN.test(normalized)) {
    return undefined;
  }

  const today = formatLocalDateTime(now, timezone).date;

  if (/오늘/.test(normalized)) {
    return {
      mode: "daily",
      date: today
    };
  }

  if (/내일/.test(normalized)) {
    return {
      mode: "daily",
      date: addDays(today, 1)
    };
  }

  if (/(이번\s*달|이번\s*월|당월)/.test(normalized)) {
    return {
      mode: "monthly",
      date: firstDayOfMonth(today)
    };
  }

  if (/(다음\s*달|다음\s*월)/.test(normalized)) {
    return {
      mode: "monthly",
      date: firstDayOfNextMonth(today)
    };
  }

  const explicitMonth = /(?:(\d{4})년\s*)?(\d{1,2})월/.exec(normalized);

  if (explicitMonth) {
    const currentYear = Number(today.slice(0, 4));
    const year = explicitMonth[1] ? Number(explicitMonth[1]) : currentYear;
    const month = Number(explicitMonth[2]);

    if (month < 1 || month > 12) {
      return undefined;
    }

    return {
      mode: "monthly",
      date: `${year}-${pad(month)}-01`
    };
  }

  return undefined;
}

function normalizeScheduleQuery(content: string): string {
  return content
    .replace(/<@!?\d+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function addDays(localDate: string, days: number): string {
  const [year, month, day] = localDate.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));

  return formatDate(next);
}

function firstDayOfMonth(localDate: string): string {
  return `${localDate.slice(0, 7)}-01`;
}

function firstDayOfNextMonth(localDate: string): string {
  const [year, month] = localDate.split("-").map(Number);
  const nextMonthYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;

  return `${nextMonthYear}-${pad(nextMonth)}-01`;
}

function formatDate(date: Date): string {
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate())
  ].join("-");
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}
