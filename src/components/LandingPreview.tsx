'use client';

import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { cn } from '../lib/utils';
import {
  LANDING_COPY,
  PREVIEW_SCENES,
  composeProgress,
  isNowCard,
  previewClock,
  type PreviewNowCard,
  type PreviewNowSlot,
  type PreviewScene,
} from '../lib/marketing/landing';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function finalScene(): PreviewScene {
  return PREVIEW_SCENES[PREVIEW_SCENES.length - 1];
}

export function LandingPreview() {
  const [elapsed, setElapsed] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (reduced || prefersReducedMotion()) return;
    let frame = 0;
    let start: number | null = null;
    let pausedAt: number | null = null;
    let lastBucket = -1;
    const tick = (now: number) => {
      if (document.hidden) {
        pausedAt = now;
        frame = requestAnimationFrame(tick);
        return;
      }
      if (start === null) start = now;
      if (pausedAt !== null) {
        start += now - pausedAt;
        pausedAt = null;
      }
      const elapsedMs = now - start;
      const bucket = Math.floor(elapsedMs / 50);
      if (bucket !== lastBucket) {
        lastBucket = bucket;
        setElapsed(elapsedMs);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reduced]);

  const clock = reduced ? { scene: finalScene(), elapsedInScene: finalScene().durationMs } : previewClock(elapsed);
  const scene = clock.scene;
  const typed = scene.compose ? composeProgress(clock.elapsedInScene, scene.compose) : null;

  return (
    <figure className="w-full">
      <div
        className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_24px_60px_-28px_rgba(0,0,0,0.55)]"
        aria-label={LANDING_COPY.previewCaption}
      >
        <div className="flex min-h-[320px]">
          <aside className="hidden w-12 shrink-0 flex-col items-center border-r border-border bg-background py-4 sm:flex" aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="" width={24} height={24} className="h-6 w-6 rounded-full" />
            <span className="mt-3 h-8 w-8 rounded-lg bg-purple/20" />
            <span className="mt-2 h-8 w-8 rounded-lg bg-surface-elevated" />
          </aside>

          <div className="relative min-w-0 flex-1 px-4 py-4 sm:px-5">
            <div className="mb-4">
              <p className="text-[11px] font-medium uppercase tracking-wider text-text-dim">Today</p>
              <p className="text-sm font-semibold tracking-tight text-text">Command center</p>
              <p className="text-xs text-text-muted">{scene.claimedLabel}</p>
            </div>

            {typed && (
              <div className="mb-4 rounded-xl border border-purple/40 bg-background/90 p-3 shadow-[0_0_0_1px_rgba(139,124,246,0.12)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-dim">New project</p>
                <p className="mt-2 text-sm font-semibold text-text">
                  {typed.name || <span className="text-text-dim">Project name</span>}
                  {typed.phase === 'name' && <Caret />}
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  {typed.nextAction || <span className="text-text-dim">Next action</span>}
                  {typed.phase === 'action' && <Caret />}
                </p>
              </div>
            )}

            <section className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface/80 px-3 py-3 sm:px-4">
              <div className="flex min-w-0 items-center gap-3">
                <Sparkles className="flex-shrink-0 text-purple-light" size={16} aria-hidden />
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-text-dim">Recommended next</p>
                  <p className="truncate text-sm font-semibold text-text">
                    {scene.brief.name}
                    <span className="ml-2 font-normal text-text-muted">{scene.brief.nextAction}</span>
                  </p>
                  <p className="truncate text-[11px] text-text-dim">{scene.brief.why}</p>
                </div>
              </div>
              <span className="hidden shrink-0 rounded-lg bg-purple px-3 py-1.5 text-xs font-medium text-white sm:inline">
                Claim Now
              </span>
            </section>

            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium text-text">Now slots</p>
              <p className="text-xs text-text-dim">
                {scene.now.filter(isNowCard).length} / 3
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {scene.now.map((slot, index) => (
                <NowSlot key={`${scene.id}-${index}`} slot={slot} />
              ))}
            </div>

            <div className="mt-4 rounded-2xl border border-border bg-surface p-3 sm:p-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted">Needs attention</p>
              <p className="text-xs text-text-dim">{scene.attention.label}</p>
              <p className="text-sm font-medium text-text">
                {scene.attention.name}
                <span className="ml-2 text-xs font-normal text-warning">{scene.attention.detail}</span>
              </p>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="mt-3 text-center text-xs text-text-dim">{LANDING_COPY.previewCaption}</figcaption>
    </figure>
  );
}

function Caret() {
  return (
    <span className="ml-0.5 inline-block h-3 w-px translate-y-px animate-pulse bg-purple-light align-middle" aria-hidden />
  );
}

function NowSlot({ slot }: { slot: PreviewNowSlot }) {
  if (!isNowCard(slot)) {
    return (
      <div className="flex min-h-[148px] flex-col items-center justify-center rounded-2xl border border-dashed border-border p-4 text-center">
        <p className="text-sm text-text-dim">Open slot</p>
        {slot.claim ? (
          <p className="mt-2 max-w-full truncate rounded-lg bg-purple/15 px-3 py-1.5 text-xs font-medium text-purple-light">
            Claim {slot.claim}
          </p>
        ) : (
          <p className="mt-1 text-xs text-text-dim">Mark a project Now to fill this.</p>
        )}
      </div>
    );
  }
  return <FilledSlot card={slot} />;
}

function FilledSlot({ card }: { card: PreviewNowCard }) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border bg-surface p-4 text-left',
        card.rotting ? 'border-warning/50' : 'border-border'
      )}
    >
      <span
        className={cn(
          'absolute inset-x-0 top-0 h-0.5',
          card.rotting ? 'bg-warning' : 'bg-gradient-to-r from-purple to-blue'
        )}
      />
      <div className="mb-3 flex flex-wrap gap-1.5">
        <span className="rounded-full bg-surface-elevated px-2 py-0.5 text-[11px] text-text-muted">{card.stage}</span>
        <span className="rounded-full bg-surface-elevated px-2 py-0.5 text-[11px] text-text-muted">{card.health}</span>
        <span className="rounded-full bg-purple/15 px-2 py-0.5 text-[11px] text-purple-light">Now</span>
        {card.rotting && (
          <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[11px] text-warning">{card.rotting}</span>
        )}
      </div>
      <p className="font-semibold text-text">{card.name}</p>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-border-subtle">
        <div className="h-full rounded-full bg-gradient-to-r from-purple to-blue" style={{ width: `${card.progress}%` }} />
      </div>
      <p className="mt-3 text-[11px] uppercase tracking-wider text-text-dim">Next action</p>
      <p className="truncate text-sm text-text">{card.nextAction}</p>
    </div>
  );
}
