import type {
  CalendarEvent,
  CalendarEventDraft,
  CalendarEventRange,
  CalendarEventSink,
  CalendarEventSource,
  CreatedCalendarEvent
} from "../../application";
import { formatLocalDateTime, parseLocalDateTime } from "../../application";

export interface GoogleCalendarEventSinkOptions {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  calendarId: string;
  defaultDurationMinutes: number;
  fetch?: typeof fetch;
}

export class GoogleCalendarEventSink implements CalendarEventSink, CalendarEventSource {
  private readonly fetchFn: typeof fetch;

  constructor(private readonly options: GoogleCalendarEventSinkOptions) {
    this.fetchFn = options.fetch ?? fetch;
  }

  async createEvent(draft: CalendarEventDraft): Promise<CreatedCalendarEvent> {
    const accessToken = await this.fetchAccessToken();
    const response = await this.fetchFn(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
        this.options.calendarId
      )}/events`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(toGoogleCalendarEventBody(draft, this.options))
      }
    );
    const responseText = await response.text();

    if (!response.ok) {
      throw new Error(
        `Google Calendar event request failed with ${response.status}: ${responseText.slice(0, 500)}`
      );
    }

    const body = responseText ? JSON.parse(responseText) : {};
    const id = typeof body.id === "string" ? body.id : undefined;

    if (!id) {
      throw new Error("Google Calendar event response did not include an event id.");
    }

    return {
      provider: "google",
      externalEventId: id,
      url: typeof body.htmlLink === "string" ? body.htmlLink : undefined
    };
  }

  async listEvents(range: CalendarEventRange): Promise<readonly CalendarEvent[]> {
    assertGoogleCalendarTimezone(range.timezone);

    const accessToken = await this.fetchAccessToken();
    const events: CalendarEvent[] = [];
    let pageToken: string | undefined;

    do {
      const url = new URL(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
          this.options.calendarId
        )}/events`
      );
      url.searchParams.set("timeMin", range.startsAtFrom.toISOString());
      url.searchParams.set("timeMax", range.startsAtTo.toISOString());
      url.searchParams.set("singleEvents", "true");
      url.searchParams.set("orderBy", "startTime");
      url.searchParams.set("showDeleted", "false");
      url.searchParams.set("maxResults", "2500");
      url.searchParams.set("timeZone", range.timezone);

      if (pageToken) {
        url.searchParams.set("pageToken", pageToken);
      }

      const response = await this.fetchFn(url.toString(), {
        method: "GET",
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      const responseText = await response.text();

      if (!response.ok) {
        throw new Error(
          `Google Calendar events request failed with ${response.status}: ${responseText.slice(0, 500)}`
        );
      }

      const body = responseText ? JSON.parse(responseText) : {};
      const items = Array.isArray(body.items) ? body.items : [];

      for (const item of items) {
        const event = parseGoogleCalendarEvent(item, range.timezone);

        if (
          event &&
          event.startsAt >= range.startsAtFrom &&
          event.startsAt < range.startsAtTo
        ) {
          events.push(event);
        }
      }

      pageToken = typeof body.nextPageToken === "string" ? body.nextPageToken : undefined;
    } while (pageToken);

    return events.sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime());
  }

  private async fetchAccessToken(): Promise<string> {
    const response = await this.fetchFn("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_id: this.options.clientId,
        client_secret: this.options.clientSecret,
        refresh_token: this.options.refreshToken,
        grant_type: "refresh_token"
      }).toString()
    });
    const responseText = await response.text();

    if (!response.ok) {
      throw new Error(
        `Google OAuth token request failed with ${response.status}: ${responseText.slice(0, 500)}`
      );
    }

    const body = responseText ? JSON.parse(responseText) : {};
    const accessToken = typeof body.access_token === "string" ? body.access_token : undefined;

    if (!accessToken) {
      throw new Error("Google OAuth token response did not include an access token.");
    }

    return accessToken;
  }
}

function toGoogleCalendarEventBody(
  draft: CalendarEventDraft,
  options: GoogleCalendarEventSinkOptions
): Record<string, unknown> {
  const endsAt = new Date(
    draft.startsAt.getTime() + options.defaultDurationMinutes * 60 * 1000
  );

  return {
    summary: draft.title,
    description: draft.notes,
    start: {
      dateTime: toGoogleDateTime(draft.startsAt, draft.timezone),
      timeZone: draft.timezone
    },
    end: {
      dateTime: toGoogleDateTime(endsAt, draft.timezone),
      timeZone: draft.timezone
    },
    extendedProperties: {
      private: {
        hermesScheduleEventId: draft.sourceId
      }
    }
  };
}

function toGoogleDateTime(date: Date, timezone: string): string {
  assertGoogleCalendarTimezone(timezone);

  const local = formatLocalDateTime(date, timezone);
  return `${local.date}T${local.time}:00+09:00`;
}

function parseGoogleCalendarEvent(
  value: unknown,
  timezone: string
): CalendarEvent | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const event = value as {
    id?: unknown;
    status?: unknown;
    summary?: unknown;
    description?: unknown;
    htmlLink?: unknown;
    start?: {
      dateTime?: unknown;
      date?: unknown;
    };
  };

  if (event.status === "cancelled" || typeof event.id !== "string") {
    return undefined;
  }

  const startsAt = parseGoogleEventStart(event.start, timezone);

  if (!startsAt) {
    return undefined;
  }

  return {
    provider: "google",
    externalEventId: event.id,
    title: typeof event.summary === "string" && event.summary.trim()
      ? event.summary.trim()
      : "(제목 없음)",
    startsAt,
    timezone,
    notes: typeof event.description === "string" && event.description.trim()
      ? event.description.trim()
      : undefined,
    url: typeof event.htmlLink === "string" ? event.htmlLink : undefined
  };
}

function parseGoogleEventStart(
  start: { dateTime?: unknown; date?: unknown } | undefined,
  timezone: string
): Date | undefined {
  if (!start) {
    return undefined;
  }

  if (typeof start.dateTime === "string") {
    const parsed = new Date(start.dateTime);

    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  if (typeof start.date === "string") {
    try {
      return parseLocalDateTime({
        localDate: start.date,
        localTime: "00:00",
        timezone
      });
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function assertGoogleCalendarTimezone(timezone: string): void {
  if (timezone !== "Asia/Seoul") {
    throw new Error("Google Calendar sync currently supports Asia/Seoul schedules only.");
  }
}
