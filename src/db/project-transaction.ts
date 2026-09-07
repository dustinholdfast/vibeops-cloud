import { sql } from 'drizzle-orm';
import { requireDb } from './index';

export type Transaction = Parameters<
  Parameters<ReturnType<typeof requireDb>['transaction']>[0]
>[0];

/**
 * Serialize all project mutations for one workspace, including imports and
 * deletes. The lock is transaction-scoped, so it is released on commit or
 * rollback even if the operation throws.
 *
 * A personal workspace id equals its owner's Clerk user id, so this locks
 * exactly the same rows it did before workspaces existed.
 */
export function projectTransaction<T>(
  workspaceId: string,
  operation: (tx: Transaction) => Promise<T>
) {
  return requireDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${workspaceId}, 0))`);
    return operation(tx);
  });
}
