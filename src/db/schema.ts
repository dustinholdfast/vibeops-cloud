import {
  pgTable,
  text,
  timestamp,
  integer,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/**
 * Projects are scoped to a Clerk user id (multi-tenant v1: user = workspace).
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
    index('projects_user_id_idx').on(t.userId),
    index('projects_user_priority_idx').on(t.userId, t.priority),
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

export type DbProject = typeof projects.$inferSelect;
export type NewDbProject = typeof projects.$inferInsert;
export type DbSubscription = typeof subscriptions.$inferSelect;
export type NewDbSubscription = typeof subscriptions.$inferInsert;
