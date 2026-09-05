'use client';
import { useAuth } from '@clerk/nextjs';
import { useEffect } from 'react';
import { DRAFT_PREFIX, useProjectStore } from '../store/useProjectStore';

/**
 * Drops account-local recovery data once Clerk has settled. Nothing happens
 * while Clerk is still loading, because `userId` is undefined then and clearing
 * on that would wipe a signed-in user's drafts on every page load.
 */
export function DraftSession() {
  const { isLoaded, userId } = useAuth();

  useEffect(() => {
    if (!isLoaded) return;
    const previous = useProjectStore.getState().userId;
    const signedOut = !userId;
    const switchedAccount = Boolean(previous && userId && previous !== userId);
    if (!signedOut && !switchedAccount) return;

    // Keep only the incoming account's drafts; one user must never see another's.
    const keep = userId ? DRAFT_PREFIX + userId : null;
    try {
      for (const key of Object.keys(sessionStorage)) {
        if (key.startsWith(DRAFT_PREFIX) && key !== keep) sessionStorage.removeItem(key);
      }
    } catch {
      /* Storage may be disabled; in-memory state is still cleared below. */
    }
    useProjectStore.getState().resetSession();
  }, [isLoaded, userId]);

  return null;
}
