-- Project activity as append-only events, not JSONB on the project row.
--
-- Additive and safe to rerun. Apply BEFORE deploying code that reads
-- project_events. The JSONB column stays as a fallback until this table exists.
--
-- Backfill copies existing activity, then clears the JSONB so later saves
-- cannot clobber history by rewriting the whole array.

BEGIN;

CREATE TABLE IF NOT EXISTS project_events (
  id           text PRIMARY KEY,
  project_id   text NOT NULL,
  workspace_id text NOT NULL,
  type         text NOT NULL,
  message      text NOT NULL,
  author       text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_events_project_time_idx
  ON project_events (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS project_events_workspace_idx
  ON project_events (workspace_id);

INSERT INTO project_events (id, project_id, workspace_id, type, message, author, created_at)
SELECT
  item->>'id',
  p.id,
  p.workspace_id,
  item->>'type',
  left(COALESCE(item->>'message', ''), 5000),
  NULLIF(item->>'author', ''),
  COALESCE(
    CASE
      WHEN (item->>'timestamp') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
        THEN (item->>'timestamp')::timestamptz
      ELSE NULL
    END,
    p.created_at
  )
FROM projects p
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(p.activity) = 'array' THEN p.activity ELSE '[]'::jsonb END
) AS item
WHERE item->>'id' IS NOT NULL
  AND item->>'type' IS NOT NULL
ON CONFLICT (id) DO NOTHING;

UPDATE projects SET activity = '[]'::jsonb
 WHERE jsonb_typeof(activity) = 'array' AND jsonb_array_length(activity) > 0;

COMMIT;
