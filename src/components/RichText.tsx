'use client';

import { parseRichText, toggleChecklistLine, type InlineToken } from '../lib/rich-text';
import { cn } from '../lib/utils';

function Inline({ tokens }: { tokens: InlineToken[] }) {
  return (
    <>
      {tokens.map((token, i) => {
        if (token.type === 'bold') return <strong key={i}>{token.value}</strong>;
        if (token.type === 'code') {
          return (
            <code key={i} className="rounded bg-surface-elevated px-1 py-0.5 text-[0.92em]">
              {token.value}
            </code>
          );
        }
        if (token.type === 'link') {
          return (
            <a
              key={i}
              href={token.href}
              target="_blank"
              rel="noreferrer"
              className="text-purple-light underline decoration-purple/40 hover:decoration-purple-light"
              onClick={(e) => e.stopPropagation()}
            >
              {token.value}
            </a>
          );
        }
        return <span key={i}>{token.value}</span>;
      })}
    </>
  );
}

export function RichText({
  text,
  onToggleChecklist,
  className,
  empty,
}: {
  text: string;
  onToggleChecklist?: (next: string) => void;
  className?: string;
  empty?: string;
}) {
  if (!text.trim()) {
    return <p className={cn('text-text-dim italic', className)}>{empty ?? 'Empty'}</p>;
  }

  const blocks = parseRichText(text);
  return (
    <div className={cn('space-y-1.5', className)}>
      {blocks.map((block, i) => {
        if (block.type === 'checklist') {
          return (
            <label key={`${block.lineIndex}-${i}`} className="flex items-start gap-2 text-sm text-text">
              <input
                type="checkbox"
                checked={block.checked}
                disabled={!onToggleChecklist}
                onChange={() => onToggleChecklist?.(toggleChecklistLine(text, block.lineIndex))}
                onClick={(e) => e.stopPropagation()}
                className="mt-0.5 rounded border-border bg-surface-elevated text-purple focus:ring-purple/40"
              />
              <span className={cn(block.checked && 'text-text-muted line-through')}>
                <Inline tokens={block.children} />
              </span>
            </label>
          );
        }
        return (
          <p key={i} className="text-sm text-text">
            <Inline tokens={block.children} />
          </p>
        );
      })}
    </div>
  );
}
