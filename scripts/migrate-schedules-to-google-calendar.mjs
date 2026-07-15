import { Pool } from "pg";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const limit = parseLimit(process.argv.slice(2));

const databaseUrl = requireEnv("DATABASE_URL");
const calendarId = process.env.GOOGLE_CALENDAR_ID?.trim() || "primary";
const defaultDurationMinutes = parsePositiveInteger(
  process.env.GOOGLE_CALENDAR_DEFAULT_EVENT_DURATION_MINUTES || "60",
  "GOOGLE_CALENDAR_DEFAULT_EVENT_DURATION_MINUTES"
);

const pool = new Pool({
  connectionString: databaseUrl
});

try {
  const rows = await loadLegacyScheduleRows(pool, limit);
  const syncedRows = rows.filter((row) => row.external_calendar_event_id);
  const pendingRows = rows.filter((row) => !row.external_calendar_event_id);

  console.log(
    JSON.stringify(
      {
        dryRun,
        totalActiveRows: rows.length,
        alreadySyncedRows: syncedRows.length,
        pendingRows: pendingRows.length,
        limit
      },
      null,
      2
    )
  );

  if (dryRun || pendingRows.length === 0) {
    if (pendingRows.length > 0) {
      console.log("Dry run only. Re-run without --dry-run to create Google Calendar events.");
    }
    process.exitCode = 0;
  } else {
    const google = createGoogleCalendarClient({
      clientId: requireEnv("GOOGLE_CALENDAR_CLIENT_ID"),
      clientSecret: requireEnv("GOOGLE_CALENDAR_CLIENT_SECRET"),
      refreshToken: requireEnv("GOOGLE_CALENDAR_REFRESH_TOKEN"),
      calendarId,
      defaultDurationMinutes
    });
    let migratedRows = 0;

    for (const row of pendingRows) {
      const created = await google.createEvent(row);
      await attachGoogleCalendarEvent(pool, row.id, created);
      migratedRows += 1;
      console.log(
        `migrated schedule_event id=${row.id} googleEventId=${created.externalEventId}`
      );
    }

    console.log(
      JSON.stringify(
        {
          migratedRows,
          skippedRows: syncedRows.length
        },
        null,
        2
      )
    );
  }
} finally {
  await pool.end();
}

async function loadLegacyScheduleRows(pool, limit) {
  const result = await pool.query(
    `
      SELECT
        id,
        title,
        starts_at,
        timezone,
        notes,
        external_calendar_event_id
      FROM schedule_events
      WHERE status = 'active'
      ORDER BY starts_at ASC, created_at ASC
      ${limit ? "LIMIT $1" : ""}
    `,
    limit ? [limit] : []
  );

  return result.rows.map((row) => ({
    id: row.id,
    title: row.title,
    startsAt: new Date(row.starts_at),
    timezone: row.timezone,
    notes: row.notes ?? undefined,
    external_calendar_event_id: row.external_calendar_event_id ?? undefined
  }));
}

async function attachGoogleCalendarEvent(pool, id, event) {
  await pool.query(
    `
      UPDATE schedule_events
      SET
        external_calendar_provider = 'google',
        external_calendar_event_id = $2,
        external_calendar_url = $3,
        updated_at = now()
      WHERE id = $1
    `,
    [id, event.externalEventId, event.url ?? null]
  );
}

function createGoogleCalendarClient(options) {
  return {
    async createEvent(row) {
      const accessToken = await fetchAccessToken(options);
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
          options.calendarId
        )}/events`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json"
          },
          body: JSON.stringify(toGoogleCalendarEventBody(row, options))
        }
      );
      const responseText = await response.text();

      if (!response.ok) {
        throw new Error(
          `Google Calendar event request failed with ${response.status}: ${responseText.slice(0, 500)}`
        );
      }

      const body = responseText ? JSON.parse(responseText) : {};

      if (typeof body.id !== "string") {
        throw new Error("Google Calendar event response did not include an event id.");
      }

      return {
        externalEventId: body.id,
        url: typeof body.htmlLink === "string" ? body.htmlLink : undefined
      };
    }
  };
}

async function fetchAccessToken(options) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      client_id: options.clientId,
      client_secret: options.clientSecret,
      refresh_token: options.refreshToken,
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

  if (typeof body.access_token !== "string") {
    throw new Error("Google OAuth token response did not include an access token.");
  }

  return body.access_token;
}

function toGoogleCalendarEventBody(row, options) {
  const endsAt = new Date(
    row.startsAt.getTime() + options.defaultDurationMinutes * 60 * 1000
  );

  return {
    summary: row.title,
    description: row.notes,
    start: {
      dateTime: toGoogleDateTime(row.startsAt, row.timezone),
      timeZone: row.timezone
    },
    end: {
      dateTime: toGoogleDateTime(endsAt, row.timezone),
      timeZone: row.timezone
    },
    extendedProperties: {
      private: {
        hermesLegacyScheduleEventId: row.id,
        migratedFrom: "schedule_events"
      }
    }
  };
}

function toGoogleDateTime(date, timezone) {
  if (timezone !== "Asia/Seoul") {
    throw new Error("Google Calendar migration currently supports Asia/Seoul schedules only.");
  }

  const local = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const year = local.getUTCFullYear();
  const month = pad(local.getUTCMonth() + 1);
  const day = pad(local.getUTCDate());
  const hour = pad(local.getUTCHours());
  const minute = pad(local.getUTCMinutes());

  return `${year}-${month}-${day}T${hour}:${minute}:00+09:00`;
}

function parseLimit(values) {
  const index = values.indexOf("--limit");

  if (index < 0) {
    return undefined;
  }

  return parsePositiveInteger(values[index + 1], "--limit");
}

function parsePositiveInteger(value, name) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

function requireEnv(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

function pad(value) {
  return value.toString().padStart(2, "0");
}
