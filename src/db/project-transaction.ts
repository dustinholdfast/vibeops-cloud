import { sql } from 'drizzle-orm';
import { requireDb } from './index';

export type Transaction = Parameters<
  Parameters<ReturnType<typeof requireDb>['transaction']>[0]
>[0];

/**
 * Serialize all project mutations for one account, including imports and deletes.
 * The lock is transaction-scoped, so it is released on commit or rollback even if
 * the operation throws.
 */
export function projectTransaction<T>(userId: string, operation: (tx: Transaction) => Promise<T>) {
  return requireDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 0))`);
    return operation(tx);
  });
}
