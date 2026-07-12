import { randomUUID } from "node:crypto";
import { Pool, type QueryResultRow } from "pg";
import type { ScheduleRepository } from "../../application";
import type {
  ScheduleEvent,
  ScheduleEventDraft,
  ScheduleEventRange,
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

  async listEvents(range: ScheduleEventRange): Promise<readonly ScheduleEvent[]> {
    const result = await this.pool.query<ScheduleEventRow>(
      `
        SELECT *
        FROM schedule_events
        WHERE discord_channel_id = $1
          AND starts_at >= $2
          AND starts_at < $3
          AND status = $4
        ORDER BY starts_at ASC, created_at ASC
      `,
      [
        range.discordChannelId,
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
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  };
}
