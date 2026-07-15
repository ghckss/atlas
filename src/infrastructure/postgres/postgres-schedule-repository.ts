import { randomUUID } from "node:crypto";
import { Pool, type QueryResultRow } from "pg";
import type { ScheduleRepository } from "../../application";
import type {
  ScheduleEvent,
  ScheduleEventDraft,
  ScheduleEventRange,
  ScheduleExternalCalendarLink,
  ScheduleEventStatus
} from "../../domain";

export class PostgresScheduleRepository implements ScheduleRepository {
  private readonly pool: Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({
      connectionString: databaseUrl
    });
  }

  async createEvent(draft: ScheduleEventDraft): Promise<ScheduleEvent> {
    const id = randomUUID();
    const result = await this.pool.query<ScheduleEventRow>(
      `
        INSERT INTO schedule_events (
          id,
          owner_user_id,
          discord_guild_id,
          discord_channel_id,
          title,
          starts_at,
          timezone,
          notes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `,
      [
        id,
        draft.ownerUserId,
        draft.discordGuildId ?? null,
        draft.discordChannelId,
        draft.title,
        draft.startsAt,
        draft.timezone,
        draft.notes ?? null
      ]
    );

    return toScheduleEvent(result.rows[0]);
  }

  async attachExternalCalendarEvent(
    id: string,
    link: ScheduleExternalCalendarLink
  ): Promise<ScheduleEvent> {
    const result = await this.pool.query<ScheduleEventRow>(
      `
        UPDATE schedule_events
        SET
          external_calendar_provider = $2,
          external_calendar_event_id = $3,
          external_calendar_url = $4,
          updated_at = now()
        WHERE id = $1
        RETURNING *
      `,
      [id, link.provider, link.externalEventId, link.url ?? null]
    );

    if (!result.rows[0]) {
      throw new Error(`Schedule event not found: ${id}`);
    }

    return toScheduleEvent(result.rows[0]);
  }

  async listEvents(range: ScheduleEventRange): Promise<readonly ScheduleEvent[]> {
    const scope = toScheduleScope(range);
    const result = await this.pool.query<ScheduleEventRow>(
      `
        SELECT *
        FROM schedule_events
        WHERE ${scope.condition}
          AND starts_at >= $2
          AND starts_at < $3
          AND status = $4
        ORDER BY starts_at ASC, created_at ASC
      `,
      [
        scope.value,
        range.startsAtFrom,
        range.startsAtTo,
        range.status ?? "active"
      ]
    );

    return result.rows.map(toScheduleEvent);
  }
}

interface ScheduleEventRow extends QueryResultRow {
  id: string;
  owner_user_id: string;
  discord_guild_id: string | null;
  discord_channel_id: string;
  title: string;
  starts_at: Date;
  timezone: string;
  notes: string | null;
  status: ScheduleEventStatus;
  external_calendar_provider: "google" | null;
  external_calendar_event_id: string | null;
  external_calendar_url: string | null;
  created_at: Date;
  updated_at: Date;
}

function toScheduleEvent(row: ScheduleEventRow): ScheduleEvent {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    discordGuildId: row.discord_guild_id ?? undefined,
    discordChannelId: row.discord_channel_id,
    title: row.title,
    startsAt: new Date(row.starts_at),
    timezone: row.timezone,
    notes: row.notes ?? undefined,
    status: row.status,
    externalCalendarProvider: row.external_calendar_provider ?? undefined,
    externalCalendarEventId: row.external_calendar_event_id ?? undefined,
    externalCalendarUrl: row.external_calendar_url ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  };
}

function toScheduleScope(range: ScheduleEventRange): {
  condition: string;
  value: string;
} {
  if (range.discordGuildId) {
    return {
      condition: "discord_guild_id = $1",
      value: range.discordGuildId
    };
  }

  if (range.discordChannelId) {
    return {
      condition: "discord_channel_id = $1",
      value: range.discordChannelId
    };
  }

  throw new Error("Schedule event range requires a Discord guild or channel scope.");
}
