import type {
  CalendarEventDraft,
  CalendarEventSink,
  CreatedCalendarEvent
} from "../../application";
import { formatLocalDateTime } from "../../application";

export interface GoogleCalendarEventSinkOptions {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  calendarId: string;
  defaultDurationMinutes: number;
  fetch?: typeof fetch;
}

export class GoogleCalendarEventSink implements CalendarEventSink {
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
  if (timezone !== "Asia/Seoul") {
    throw new Error("Google Calendar sync currently supports Asia/Seoul schedules only.");
  }

  const local = formatLocalDateTime(date, timezone);
  return `${local.date}T${local.time}:00+09:00`;
}
