-- Sitemapper SaaS schema. Snapshots live in R2; D1 holds tenancy, jobs, diffs, issues.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  name TEXT,
  github_id TEXT UNIQUE,
  google_id TEXT UNIQUE,
  created_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  stripe_price_id TEXT,
  stripe_status TEXT NOT NULL DEFAULT 'none',
  created_at TEXT NOT NULL
);

CREATE INDEX idx_workspaces_owner ON workspaces (owner_user_id);
CREATE INDEX idx_workspaces_stripe_customer ON workspaces (stripe_customer_id);

CREATE TABLE memberships (
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'owner',
  created_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX idx_memberships_user ON memberships (user_id);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  user_agent TEXT
);

CREATE INDEX idx_sessions_user ON sessions (user_id);
CREATE INDEX idx_sessions_expires ON sessions (expires_at);

CREATE TABLE oauth_states (
  state TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  code_verifier TEXT,
  next_path TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE magic_links (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  next_path TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  site_url TEXT NOT NULL,
  host TEXT NOT NULL,
  verified INTEGER NOT NULL DEFAULT 0,
  verification_token TEXT,
  gsc_property TEXT,
  github_repo TEXT,
  created_from_share_id TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (workspace_id, host)
);

CREATE INDEX idx_projects_workspace ON projects (workspace_id);
CREATE INDEX idx_projects_host ON projects (host);

CREATE TABLE monitors (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL DEFAULT 1,
  frequency_minutes INTEGER NOT NULL DEFAULT 1440,
  last_started_at TEXT,
  last_finished_at TEXT,
  next_run_at TEXT,
  last_status TEXT,
  fail_on_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_monitors_due ON monitors (enabled, next_run_at);

CREATE TABLE crawl_jobs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  idempotency_key TEXT UNIQUE,
  error TEXT,
  started_at TEXT,
  finished_at TEXT,
  snapshot_id TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_jobs_project ON crawl_jobs (project_id, created_at);
CREATE INDEX idx_jobs_status ON crawl_jobs (status, created_at);

CREATE TABLE snapshots (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  job_id TEXT,
  kind TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  declared_urls INTEGER NOT NULL DEFAULT 0,
  live_urls INTEGER NOT NULL DEFAULT 0,
  indexable_urls INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  warnings INTEGER NOT NULL DEFAULT 0,
  notices INTEGER NOT NULL DEFAULT 0,
  index_score INTEGER,
  seo_score INTEGER,
  sitemap_score INTEGER,
  fingerprint TEXT,
  sitemap_hash TEXT,
  is_baseline INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_snapshots_project ON snapshots (project_id, generated_at);

CREATE TABLE change_events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  previous_snapshot_id TEXT,
  code TEXT NOT NULL,
  severity TEXT NOT NULL,
  url TEXT,
  before_json TEXT,
  after_json TEXT,
  grouped_count INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_changes_project ON change_events (project_id, created_at);
CREATE INDEX idx_changes_snapshot ON change_events (snapshot_id);
CREATE INDEX idx_changes_code ON change_events (project_id, code, created_at);

CREATE TABLE issues (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  code TEXT NOT NULL,
  severity TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  resolved_at TEXT,
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  affected_urls INTEGER NOT NULL DEFAULT 0,
  evidence TEXT,
  UNIQUE (project_id, code)
);

CREATE INDEX idx_issues_project ON issues (project_id, resolved_at, severity);

CREATE TABLE alert_channels (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  project_id TEXT,
  type TEXT NOT NULL,
  destination TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_alert_channels_ws ON alert_channels (workspace_id);

CREATE TABLE alert_deliveries (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  snapshot_id TEXT,
  fingerprint TEXT NOT NULL,
  status TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_alert_dedupe ON alert_deliveries (project_id, fingerprint, created_at);

CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  prefix TEXT NOT NULL,
  hashed_secret TEXT NOT NULL,
  name TEXT,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT
);

CREATE INDEX idx_api_keys_prefix ON api_keys (prefix);

CREATE TABLE usage_counters (
  workspace_id TEXT NOT NULL,
  period TEXT NOT NULL,
  monitored_urls INTEGER NOT NULL DEFAULT 0,
  deep_checks INTEGER NOT NULL DEFAULT 0,
  scans INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (workspace_id, period)
);

CREATE TABLE analytics_events (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  props_json TEXT,
  user_id TEXT,
  workspace_id TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_analytics_name ON analytics_events (name, created_at);

CREATE TABLE gsc_connections (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  refresh_token_enc TEXT NOT NULL,
  properties_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE github_connections (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  access_token_enc TEXT,
  created_at TEXT NOT NULL
);
