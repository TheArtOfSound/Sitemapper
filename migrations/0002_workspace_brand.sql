ALTER TABLE workspaces ADD COLUMN brand_name TEXT;
ALTER TABLE workspaces ADD COLUMN brand_url TEXT;
ALTER TABLE workspaces ADD COLUMN operator INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS invites (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  accepted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_invites_ws ON invites (workspace_id);
