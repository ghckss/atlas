ALTER TABLE schedule_events
  ADD COLUMN IF NOT EXISTS external_calendar_provider TEXT,
  ADD COLUMN IF NOT EXISTS external_calendar_event_id TEXT,
  ADD COLUMN IF NOT EXISTS external_calendar_url TEXT;

CREATE INDEX IF NOT EXISTS schedule_events_external_calendar_idx
  ON schedule_events (external_calendar_provider, external_calendar_event_id)
  WHERE external_calendar_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS schedule_events_guild_starts_idx
  ON schedule_events (discord_guild_id, starts_at)
  WHERE status = 'active' AND discord_guild_id IS NOT NULL;
