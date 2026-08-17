import {
  pgTable,
  text,
  timestamp,
  integer,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';

/**
 * Projects are scoped to a Clerk user id (multi-tenant v1: user = workspace).
 * Activity is stored as JSONB for simplicity; can normalize later if needed.
 */
export const projects = pgTable(
  'projects',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    nextAction: text('next_action').notNull().default('Define the first slice'),
    stage: text('stage').notNull().default('Exploring'),
    priority: text('priority').notNull().default('Later'),
    health: text('health').notNull().default('On track'),
    targetDate: text('target_date'), // YYYY-MM-DD or null
    lastTouched: timestamp('last_touched', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    liveUrl: text('live_url'),
    repoUrl: text('repo_url'),
    progress: integer('progress').notNull().default(0),
    activity: jsonb('activity').notNull().default([]),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('projects_user_id_idx').on(t.userId),
    index('projects_user_priority_idx').on(t.userId, t.priority),
  ]
);

export type DbProject = typeof projects.$inferSelect;
export type NewDbProject = typeof projects.$inferInsert;
