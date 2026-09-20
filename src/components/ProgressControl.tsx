'use client';

import { useRef, useState } from 'react';
import { cn } from '../lib/utils';
import { progressFromClientX, snapProgress } from '../lib/progress-snap';

export function ProgressControl({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [preview, setPreview] = useState<number | null>(null);
  const shown = preview ?? value;

  const commit = (next: number) => {
    const snapped = snapProgress(next);
    setPreview(snapped);
    if (snapped !== value) onChange(snapped);
  };

  const fromPointer = (clientX: number) => {
    const el = track.current;
    if (!el) return value;
    return progressFromClientX(clientX, el.getBoundingClientRect());
  };

  return (
    <div className="flex items-center gap-2 max-w-xs w-full">
      <div
        ref={track}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={shown}
        aria-valuetext={`${shown}%`}
        className="relative h-2 flex-1 rounded-full bg-border-subtle overflow-visible cursor-pointer focus:outline-none focus:ring-2 focus:ring-purple/50"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          dragging.current = true;
          (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
          setPreview(fromPointer(e.clientX));
        }}
        onPointerMove={(e) => {
          if (!dragging.current) return;
          e.stopPropagation();
          setPreview(fromPointer(e.clientX));
        }}
        onPointerUp={(e) => {
          if (!dragging.current) return;
          e.stopPropagation();
          dragging.current = false;
          commit(fromPointer(e.clientX));
          setPreview(null);
        }}
        onPointerCancel={() => {
          dragging.current = false;
          setPreview(null);
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
            e.preventDefault();
            commit(value + 10);
          } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
            e.preventDefault();
            commit(value - 10);
          } else if (e.key === 'Home') {
            e.preventDefault();
            commit(0);
          } else if (e.key === 'End') {
            e.preventDefault();
            commit(100);
          }
        }}
        onFocus={() => setPreview(value)}
        onBlur={() => {
          if (!dragging.current) setPreview(null);
        }}
      >
        <div className="absolute inset-y-0 left-0 right-0 rounded-full bg-border-subtle overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-purple to-blue"
            style={{ width: `${shown}%` }}
          />
        </div>
      </div>
      <span
        className={cn(
          'w-8 text-right text-[11px] tabular-nums',
          preview !== null ? 'text-purple-light' : 'text-text-dim'
        )}
      >
        {preview !== null ? `${shown}%` : ''}
      </span>
    </div>
  );
}
