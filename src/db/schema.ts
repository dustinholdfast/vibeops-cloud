import {
  pgTable,
  text,
  timestamp,
  integer,
  bigserial,
  jsonb,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core';

/**
 * Projects are scoped to a workspace. Access is granted by membership in
 * `workspace_members`, never by the `user_id` that created the row.
 */
export const projects = pgTable(
  'projects',
  {
    id: text('id').primaryKey(),
    version: integer('version').notNull().default(1),
    lastMutationId: text('last_mutation_id'),
    /**
     * Owning workspace. A user's personal workspace has the same id as their
     * Clerk user id, so rows written before workspaces existed keep their scope.
     */
    workspaceId: text('workspace_id').notNull(),
    /** The Clerk user who created the row, kept for attribution. */
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    nextAction: text('next_action').notNull().default('Define the first slice'),
    stage: text('stage').notNull().default('Exploring'),
    priority: text('priority').notNull().default('Later'),
    health: text('health').notNull().default('On track'),
    targetDate: text('target_date'),
    lastTouched: timestamp('last_touched', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    liveUrl: text('live_url'),
    repoUrl: text('repo_url'),
    progress: integer('progress').notNull().default(0),
    activity: jsonb('activity').notNull().default([]),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('projects_workspace_id_idx').on(t.workspaceId),
    index('projects_workspace_priority_idx').on(t.workspaceId, t.priority),
    index('projects_user_id_idx').on(t.userId),
  ]
);

/**
 * One billing row per Clerk user. Synced from Stripe webhooks.
 * plan: 'free' | 'pro'
 * status: mirrors Stripe subscription status when paid, else 'free'
 */
export const subscriptions = pgTable(
  'subscriptions',
  {
    userId: text('user_id').primaryKey(),
    stripeCustomerId: text('stripe_customer_id'),
    stripeSubscriptionId: text('stripe_subscription_id'),
    stripePriceId: text('stripe_price_id'),
    plan: text('plan').notNull().default('free'),
    status: text('status').notNull().default('free'),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    cancelAtPeriodEnd: integer('cancel_at_period_end').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex('subscriptions_stripe_customer_idx').on(t.stripeCustomerId),
    index('subscriptions_stripe_sub_idx').on(t.stripeSubscriptionId),
  ]
);

/**
 * A workspace is the unit projects belong to and billing follows. Every user has
 * a personal workspace whose id equals their Clerk user id; team workspaces get
 * a generated id.
 */
export const workspaces = pgTable(
  'workspaces',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    /** Exactly one owner. Their subscription sets the workspace plan. */
    ownerUserId: text('owner_user_id').notNull(),
    /** 1 for the workspace created automatically for a single user. */
    personal: integer('personal').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('workspaces_owner_idx').on(t.ownerUserId)]
);

/** Membership is the only thing that grants access to a workspace. */
export const workspaceMembers = pgTable(
  'workspace_members',
  {
    workspaceId: text('workspace_id').notNull(),
    userId: text('user_id').notNull(),
    role: text('role').notNull().default('member'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId] }),
    index('workspace_members_user_idx').on(t.userId),
  ]
);

/**
 * A pending invitation. The token is stored hashed so a leaked database row is
 * not itself redeemable.
 */
export const workspaceInvites = pgTable(
  'workspace_invites',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull(),
    email: text('email').notNull(),
    role: text('role').notNull().default('member'),
    tokenHash: text('token_hash').notNull(),
    invitedByUserId: text('invited_by_user_id').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    acceptedByUserId: text('accepted_by_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex('workspace_invites_token_idx').on(t.tokenHash),
    index('workspace_invites_workspace_idx').on(t.workspaceId),
    index('workspace_invites_email_idx').on(t.email),
  ]
);

/**
 * Per-user email settings. A row is created the first time a preference is read
 * or written, so an account with no row is treated as subscribed with defaults.
 */
export const emailPreferences = pgTable(
  'email_preferences',
  {
    userId: text('user_id').primaryKey(),
    /** 1 = send the weekly digest. */
    weeklyDigest: integer('weekly_digest').notNull().default(1),
    /**
     * `uptime_alerts` also lives on this table but is deliberately absent here.
     * Drizzle names every column in a `select()`, so listing it would make each
     * existing digest query fail until the uptime migration is applied. It is
     * read and written by raw SQL in `monitor-service.ts` instead, which keeps
     * a late migration to "uptime alerts are off" rather than "email is broken".
     */
    /** Bearer of this token may unsubscribe without signing in. */
    unsubscribeToken: text('unsubscribe_token').notNull(),
    /** Guards against a retried cron sending the same week twice. */
    lastSentAt: timestamp('last_sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex('email_preferences_token_idx').on(t.unsubscribeToken)]
);

/**
 * One uptime monitor per project, keyed by the project it watches.
 *
 * `workspace_id` is denormalised from `projects` so the cron can decide who to
 * email without joining, and so a monitor cannot outlive its project's scope.
 */
export const projectMonitors = pgTable(
  'project_monitors',
  {
    projectId: text('project_id').primaryKey(),
    workspaceId: text('workspace_id').notNull(),
    /** Validated and normalised by `lib/uptime/target.ts` before it is stored. */
    url: text('url').notNull(),
    enabled: integer('enabled').notNull().default(1),
    intervalSeconds: integer('interval_seconds').notNull().default(300),
    timeoutMs: integer('timeout_ms').notNull().default(10000),
    /** Consecutive failures before it counts as down and alerts. */
    failureThreshold: integer('failure_threshold').notNull().default(2),
    /** 'unknown' | 'up' | 'down' */
    status: text('status').notNull().default('unknown'),
    consecutiveFailures: integer('consecutive_failures').notNull().default(0),
    consecutiveSuccesses: integer('consecutive_successes').notNull().default(0),
    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
    lastStatusChangeAt: timestamp('last_status_change_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('project_monitors_due_idx').on(t.enabled, t.lastCheckedAt),
    index('project_monitors_workspace_idx').on(t.workspaceId),
  ]
);

/** One row per probe. Pruned on a rolling window by the cron. */
export const projectChecks = pgTable(
  'project_checks',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    projectId: text('project_id').notNull(),
    checkedAt: timestamp('checked_at', { withTimezone: true }).notNull(),
    /** 1 = the target answered healthily. Integer for consistency with the rest. */
    ok: integer('ok').notNull(),
    statusCode: integer('status_code'),
    latencyMs: integer('latency_ms'),
    error: text('error'),
  },
  (t) => [index('project_checks_project_time_idx').on(t.projectId, t.checkedAt)]
);

export type DbProject = typeof projects.$inferSelect;
export type NewDbProject = typeof projects.$inferInsert;
export type DbSubscription = typeof subscriptions.$inferSelect;
export type DbWorkspace = typeof workspaces.$inferSelect;
export type NewDbWorkspace = typeof workspaces.$inferInsert;
export type DbWorkspaceMember = typeof workspaceMembers.$inferSelect;
export type DbWorkspaceInvite = typeof workspaceInvites.$inferSelect;
export type DbEmailPreferences = typeof emailPreferences.$inferSelect;
export type NewDbSubscription = typeof subscriptions.$inferInsert;
export type DbProjectMonitor = typeof projectMonitors.$inferSelect;
export type DbProjectCheck = typeof projectChecks.$inferSelect;
