'use client';
import { useAuth } from '@clerk/nextjs';
import { useEffect, useRef } from 'react';
import { shouldResetDraftSession } from '../lib/draft-session';
import { DRAFT_PREFIX, useProjectStore } from '../store/useProjectStore';

/**
 * Drops account-local recovery data once Clerk has settled. Nothing happens
 * while Clerk is still loading, because `userId` is undefined then and clearing
 * on that would wipe a signed-in user's drafts on every page load.
 */
export function DraftSession() {
  const { isLoaded, userId } = useAuth();
  const observedUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!isLoaded) return;
    const previous = observedUserId.current;
    const current = userId ?? null;
    const shouldReset = shouldResetDraftSession(previous, current);
    observedUserId.current = current;
    if (!shouldReset) return;

    // Keep only the incoming account's drafts; one user must never see
    // another's. Keys are prefix + account + ':' + workspace, so an account may
    // legitimately hold one entry per workspace it belongs to.
    const keep = current ? DRAFT_PREFIX + current + ':' : null;
    try {
      for (const key of Object.keys(sessionStorage)) {
        if (key.startsWith(DRAFT_PREFIX) && !(keep && key.startsWith(keep))) {
          sessionStorage.removeItem(key);
        }
      }
    } catch {
      /* Storage may be disabled; in-memory state is still cleared below. */
    }
    useProjectStore.getState().resetSession();
  }, [isLoaded, userId]);

  return null;
}
