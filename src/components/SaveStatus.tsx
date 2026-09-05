'use client';
import Link from 'next/link';
import { useProjectStore, type Draft } from '../store/useProjectStore';

const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  nextAction: 'Next action',
  stage: 'Stage',
  priority: 'Priority',
  health: 'Health',
  targetDate: 'Target date',
  progress: 'Progress',
  liveUrl: 'Live URL',
  repoUrl: 'Repo URL',
};

function summary(draft: Draft): { label: string; tone: string } {
  switch (draft.status) {
    case 'saving':
      return { label: 'Saving…', tone: 'text-text-muted' };
    case 'conflict':
      return { label: 'Conflict', tone: 'text-danger' };
    case 'recovered':
      return { label: 'Recovered', tone: 'text-warning' };
    default:
      return { label: 'Unsaved', tone: 'text-warning' };
  }
}

/**
 * Rows get a one-word indicator that opens the drawer; the drawer carries the
 * full explanation and the recovery actions. Keeping the conflict comparison out
 * of the table stops a wide diff from wrecking narrow layouts.
 */
export function SaveStatusChip({ id }: { id: string }) {
  const draft = useProjectStore((s) => s.drafts[id]);
  const open = useProjectStore((s) => s.openDrawer);
  if (!draft) {
    return (
      <span className="text-xs text-success" role="status">
        Saved
      </span>
    );
  }
  const { label, tone } = summary(draft);
  if (draft.status === 'saving') {
    return (
      <span className={`text-xs ${tone}`} role="status">
        {label}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={`text-xs underline text-left ${tone}`}
      onClick={(e) => {
        e.stopPropagation();
        open(id);
      }}
    >
      {label} — review
    </button>
  );
}

/** Full save state with retry, conflict review and discard. Used in the drawer. */
export function SaveStatus({ id }: { id: string }) {
  const draft = useProjectStore((s) => s.drafts[id]);
  const retry = useProjectStore((s) => s.retrySave);
  const review = useProjectStore((s) => s.reviewConflict);
  const discard = useProjectStore((s) => s.discardSave);
  if (!draft) {
    return (
      <p className="text-xs text-success" role="status">
        All changes saved.
      </p>
    );
  }
  if (draft.status === 'saving') {
    return (
      <p className="text-xs text-text-muted" role="status">
        Saving…
      </p>
    );
  }

  const patch = { ...draft.request?.patch, ...draft.patch };
  const comparable = Object.keys(patch).filter((key) => key !== 'activity');

  return (
    <div
      className="text-xs space-y-3 rounded-lg border border-warning/40 bg-warning/5 p-3"
      onClick={(e) => e.stopPropagation()}
    >
      <p role="alert" className="text-warning">
        {draft.error || 'Changes have not been saved.'}
      </p>
      <div className="flex flex-wrap gap-3">
        {draft.status === 'conflict' ? (
          <button type="button" className="underline" onClick={() => void review(id)}>
            Review latest version
          </button>
        ) : (
          <button type="button" className="underline" onClick={() => void retry(id)}>
            Retry save
          </button>
        )}
        <button type="button" className="underline" onClick={() => void discard(id)}>
          Discard changes
        </button>
      </div>

      {draft.latest && (
        <div className="space-y-2 border-t border-warning/30 pt-2">
          <p>Someone saved a newer version. Compare it with your changes before applying them.</p>
          {comparable.length === 0 && <p>Your draft only adds activity history.</p>}
          {comparable.map((key) => (
            <div key={key} className="break-words">
              <strong>{FIELD_LABELS[key] ?? key}</strong>
              <p className="text-text-dim">
                Saved: {String(draft.latest![key as keyof typeof patch] ?? 'Empty')}
              </p>
              <p>Your draft: {String(patch[key as keyof typeof patch] ?? 'Empty')}</p>
            </div>
          ))}
          <button
            type="button"
            className="underline font-medium"
            onClick={() => void retry(id, true)}
          >
            Apply my changes to this version
          </button>
        </div>
      )}
    </div>
  );
}

export function WorkspaceSaveNotice() {
  const drafts = useProjectStore((s) => s.drafts);
  const error = useProjectStore((s) => s.operationError);
  const code = useProjectStore((s) => s.operationCode);
  const busy = useProjectStore((s) => s.operationBusy);
  const open = useProjectStore((s) => s.openDrawer);
  const unconfirmed = Object.entries(drafts).filter(([, d]) => d.status !== 'saving');
  if (!unconfirmed.length && !error && !busy) return null;
  return (
    <div className="px-6 py-3 border-b border-warning/30 bg-warning/5 text-sm space-y-2" role="status">
      {busy && <p>Saving workspace changes…</p>}
      {error && <p>{error}</p>}
      {code === 'PLAN_LIMIT' && (
        <Link className="underline text-purple-light" href="/pricing">
          View Pro plans
        </Link>
      )}
      {code === 'UNAUTHORIZED' && (
        <Link className="underline text-purple-light" href="/sign-in">
          Sign in again
        </Link>
      )}
      {unconfirmed.map(([id, d]) => (
        <button
          key={id}
          type="button"
          className="block underline text-warning"
          onClick={() => open(id)}
        >
          Review unsaved changes: {d.base.name}
        </button>
      ))}
      {error && (
        <button
          type="button"
          className="underline text-xs"
          onClick={() => useProjectStore.setState({ operationError: null, operationCode: null })}
        >
          Dismiss message
        </button>
      )}
    </div>
  );
}
