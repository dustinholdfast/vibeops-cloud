-- Apply to a preview database first, then production before deploying the app.
-- Additive and safe to rerun; existing projects begin at version 1.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS last_mutation_id text;
