-- Weekly digest email preferences.
--
-- Additive and safe to rerun. Apply BEFORE deploying: the digest cron reads and
-- writes this table.
--
-- Nothing else reads it, so an unapplied migration disables the digest rather
-- than affecting the application.

BEGIN;

CREATE TABLE IF NOT EXISTS email_preferences (
  user_id           text PRIMARY KEY,
  weekly_digest     integer NOT NULL DEFAULT 1,
  unsubscribe_token text NOT NULL,
  last_sent_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS email_preferences_token_idx
  ON email_preferences (unsubscribe_token);

COMMIT;
