-- Per-project uptime monitoring.
--
-- Additive and safe to rerun. Apply BEFORE deploying: the uptime cron and the
-- monitor API read and write these tables.
--
-- Nothing in the existing project path touches them, so an unapplied migration
-- disables monitoring rather than affecting the application.

BEGIN;

CREATE TABLE IF NOT EXISTS project_monitors (
  project_id            text PRIMARY KEY,
  workspace_id          text NOT NULL,
  url                   text NOT NULL,
  enabled               integer NOT NULL DEFAULT 1,
  interval_seconds      integer NOT NULL DEFAULT 300,
  timeout_ms            integer NOT NULL DEFAULT 10000,
  failure_threshold     integer NOT NULL DEFAULT 2,
  status                text NOT NULL DEFAULT 'unknown',
  consecutive_failures  integer NOT NULL DEFAULT 0,
  consecutive_successes integer NOT NULL DEFAULT 0,
  last_checked_at       timestamptz,
  last_status_change_at timestamptz,
  last_error            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- The cron sweeps by "enabled and due", so that is the index it gets.
CREATE INDEX IF NOT EXISTS project_monitors_due_idx
  ON project_monitors (enabled, last_checked_at);

CREATE INDEX IF NOT EXISTS project_monitors_workspace_idx
  ON project_monitors (workspace_id);

CREATE TABLE IF NOT EXISTS project_checks (
  id          bigserial PRIMARY KEY,
  project_id  text NOT NULL,
  checked_at  timestamptz NOT NULL DEFAULT now(),
  ok          integer NOT NULL,
  status_code integer,
  latency_ms  integer,
  error       text
);

-- Every read is "this project, newest first, within a window".
CREATE INDEX IF NOT EXISTS project_checks_project_time_idx
  ON project_checks (project_id, checked_at DESC);

-- Alert delivery, separate from the weekly digest so unsubscribing from one
-- does not silence the other.
ALTER TABLE email_preferences
  ADD COLUMN IF NOT EXISTS uptime_alerts integer NOT NULL DEFAULT 1;

COMMIT;
