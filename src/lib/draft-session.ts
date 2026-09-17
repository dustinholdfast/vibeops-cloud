/**
 * Whether DraftSession should wipe the in-memory project store.
 *
 * `previousClerkUserId` is the last userId this hook observed, or `undefined`
 * if Clerk has not settled yet. Treating `isLoaded && !userId` on that first
 * tick as sign-out is what used to drop an in-flight `/api/projects` response
 * and leave the dashboard stuck on "Loading your workspace…".
 */
export function shouldResetDraftSession(
  previousClerkUserId: string | null | undefined,
  clerkUserId: string | null | undefined
): boolean {
  if (previousClerkUserId === undefined) return false;
  const current = clerkUserId ?? null;
  const signedOut = Boolean(previousClerkUserId && !current);
  const switchedAccount = Boolean(
    previousClerkUserId && current && previousClerkUserId !== current
  );
  return signedOut || switchedAccount;
}
