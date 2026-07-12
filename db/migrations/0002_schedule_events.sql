CREATE TABLE schedule_events (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  discord_guild_id TEXT,
  discord_channel_id TEXT NOT NULL,
  title TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Seoul',
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (
    status IN ('active', 'cancelled')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX schedule_events_channel_starts_idx
  ON schedule_events (discord_channel_id, starts_at)
  WHERE status = 'active';

CREATE INDEX schedule_events_owner_starts_idx
  ON schedule_events (owner_user_id, starts_at)
  WHERE status = 'active';
