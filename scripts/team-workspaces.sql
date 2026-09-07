-- Team workspaces.
--
-- Additive and safe to rerun. Apply this BEFORE deploying the application: the
-- new code reads and writes projects.workspace_id.
--
-- Migration principle: a user's personal workspace has the same id as their
-- Clerk user id, so projects.workspace_id backfills from projects.user_id and
-- no existing row changes hands. Advisory locks keyed on that id therefore keep
-- serialising exactly the same set of rows as before.

BEGIN;

CREATE TABLE IF NOT EXISTS workspaces (
  id            text PRIMARY KEY,
  name          text NOT NULL,
  owner_user_id text NOT NULL,
  personal      integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workspaces_owner_idx ON workspaces (owner_user_id);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id text NOT NULL,
  user_id      text NOT NULL,
  role         text NOT NULL DEFAULT 'member',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS workspace_members_user_idx ON workspace_members (user_id);

CREATE TABLE IF NOT EXISTS workspace_invites (
  id                  text PRIMARY KEY,
  workspace_id        text NOT NULL,
  email               text NOT NULL,
  role                text NOT NULL DEFAULT 'member',
  token_hash          text NOT NULL,
  invited_by_user_id  text NOT NULL,
  expires_at          timestamptz NOT NULL,
  accepted_at         timestamptz,
  accepted_by_user_id text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS workspace_invites_token_idx ON workspace_invites (token_hash);
CREATE INDEX IF NOT EXISTS workspace_invites_workspace_idx ON workspace_invites (workspace_id);
CREATE INDEX IF NOT EXISTS workspace_invites_email_idx ON workspace_invites (email);

-- Give every existing account a personal workspace keyed on its user id.
INSERT INTO workspaces (id, name, owner_user_id, personal, created_at, updated_at)
SELECT DISTINCT p.user_id, 'Personal', p.user_id, 1, now(), now()
FROM projects p
ON CONFLICT (id) DO NOTHING;

INSERT INTO workspaces (id, name, owner_user_id, personal, created_at, updated_at)
SELECT s.user_id, 'Personal', s.user_id, 1, now(), now()
FROM subscriptions s
ON CONFLICT (id) DO NOTHING;

-- The owner is a member like anyone else; membership is what grants access.
INSERT INTO workspace_members (workspace_id, user_id, role, created_at, updated_at)
SELECT w.id, w.owner_user_id, 'owner', now(), now()
FROM workspaces w
ON CONFLICT (workspace_id, user_id) DO NOTHING;

-- Scope existing projects to their owner's personal workspace.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS workspace_id text;
UPDATE projects SET workspace_id = user_id WHERE workspace_id IS NULL;
ALTER TABLE projects ALTER COLUMN workspace_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS projects_workspace_id_idx ON projects (workspace_id);
CREATE INDEX IF NOT EXISTS projects_workspace_priority_idx ON projects (workspace_id, priority);

COMMIT;
