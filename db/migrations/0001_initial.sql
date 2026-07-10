CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE app_users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'developer', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  filesystem_root TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE chat_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(id),
  project_id TEXT REFERENCES projects(id),
  discord_channel_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE chat_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE memory_entries (
  id TEXT PRIMARY KEY,
  namespace TEXT NOT NULL CHECK (
    namespace IN ('personal', 'team', 'project', 'organization')
  ),
  lifetime TEXT NOT NULL CHECK (
    lifetime IN ('permanent', 'project', 'temporary')
  ),
  owner_user_id TEXT NOT NULL REFERENCES app_users(id),
  team_id TEXT,
  organization_id TEXT,
  project_id TEXT REFERENCES projects(id),
  content TEXT NOT NULL,
  source TEXT NOT NULL CHECK (
    source IN (
      'user-declared',
      'extracted-preference',
      'project-fact',
      'core-file',
      'session-history'
    )
  ),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  embedding vector(1536),
  embedding_provider TEXT,
  embedding_model TEXT,
  embedding_dimensions INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX chat_messages_session_created_idx
  ON chat_messages (session_id, created_at);

CREATE INDEX memory_entries_scope_idx
  ON memory_entries (
    namespace,
    owner_user_id,
    team_id,
    organization_id,
    project_id,
    lifetime
  );

CREATE INDEX memory_entries_embedding_idx
  ON memory_entries
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100)
  WHERE embedding IS NOT NULL;
