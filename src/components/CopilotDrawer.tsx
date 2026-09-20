'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, getToolName, isToolUIPart, type UIMessage } from 'ai';
import { Sparkles, X } from 'lucide-react';
import { WORKSPACE_HEADER, getActiveWorkspace } from '../lib/api';
import { useProjectStore } from '../store/useProjectStore';
import { cn } from '../lib/utils';

function visibleCopilotError(error: Error | undefined): string | null {
  if (!error) return null;
  const raw = error.message.trim();
  if (raw.startsWith('{')) {
    try {
      const body = JSON.parse(raw) as { error?: string };
      if (typeof body.error === 'string' && body.error.trim()) return body.error;
    } catch {
      /* keep the raw message */
    }
  }
  return raw || 'The copilot could not answer.';
}

function textOf(message: UIMessage): string {
  return message.parts
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('');
}

function toolLabel(part: UIMessage['parts'][number]): string | null {
  if (!isToolUIPart(part)) return null;
  const name = getToolName(part);
  const output =
    'output' in part && part.output && typeof part.output === 'object'
      ? (part.output as { summary?: string; error?: string })
      : null;
  if (output?.summary) return output.summary;
  if (output?.error) return output.error;
  if (part.state === 'output-error') return 'That edit did not save.';
  if (name === 'createProject') return part.state === 'output-available' ? 'Created a project' : 'Creating project…';
  if (name === 'updateProject') return part.state === 'output-available' ? 'Updated a project' : 'Updating project…';
  if (name === 'getProject') return 'Reading project…';
  return null;
}

export function CopilotDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const loadProjects = useProjectStore((s) => s.loadProjects);
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        credentials: 'include',
        headers: () => {
          const headers: Record<string, string> = {};
          const workspaceId = getActiveWorkspace();
          if (workspaceId) headers[WORKSPACE_HEADER] = workspaceId;
          return headers;
        },
      }),
    []
  );
  const { messages, sendMessage, status, error, stop, setMessages } = useChat({
    transport,
    onFinish: () => {
      void loadProjects();
    },
  });
  const errorText = visibleCopilotError(error);
  const [draft, setDraft] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const busy = status === 'submitted' || status === 'streaming';

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, status]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const submit = () => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft('');
    void sendMessage({ text });
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-[55]"
            aria-hidden
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="copilot-title"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="fixed top-0 right-0 h-full w-full max-w-md bg-surface border-l border-border z-[60] flex flex-col shadow-2xl"
          >
            <div className="px-5 py-4 border-b border-border-subtle flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-text-dim">Workspace copilot</p>
                <h2 id="copilot-title" className="text-lg font-semibold text-text truncate flex items-center gap-2">
                  <Sparkles size={16} className="text-purple-light" />
                  Noxen
                </h2>
                <p className="text-xs text-text-dim mt-1">Gemini 2.5 Flash · can create and edit projects</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-text-dim hover:text-text hover:bg-surface-elevated"
                aria-label="Close copilot"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {messages.length === 0 && (
                <div className="rounded-xl border border-border bg-surface-elevated/60 p-4 text-sm text-text-muted space-y-2">
                  <p>Ask it to add a project, change a stage, or set the next action.</p>
                  <p className="text-xs text-text-dim">Try “Move Holdfast CRM to Testing and set progress to 70%.”</p>
                </div>
              )}
              {messages.map((message) => {
                const text = textOf(message);
                const tools = message.parts.map(toolLabel).filter((label): label is string => Boolean(label));
                if (!text && !tools.length) return null;
                const mine = message.role === 'user';
                return (
                  <div key={message.id} className={cn('flex flex-col gap-1.5', mine ? 'items-end' : 'items-start')}>
                    {text ? (
                      <div
                        className={cn(
                          'max-w-[90%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap',
                          mine ? 'bg-purple text-white' : 'bg-surface-elevated text-text border border-border'
                        )}
                      >
                        {text}
                      </div>
                    ) : null}
                    {tools.map((label, index) => (
                      <span key={`${message.id}-${index}`} className="text-[11px] rounded-full bg-purple/15 text-purple-light px-2 py-0.5">
                        {label}
                      </span>
                    ))}
                  </div>
                );
              })}
              {errorText ? <p className="text-sm text-danger">{errorText}</p> : null}
              <div ref={bottomRef} />
            </div>

            <form
              className="border-t border-border-subtle p-4 space-y-2"
              onSubmit={(event) => {
                event.preventDefault();
                submit();
              }}
            >
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    submit();
                  }
                }}
                rows={3}
                placeholder="Tell Noxen what to change…"
                className="w-full resize-none rounded-xl bg-surface-elevated border border-border px-3 py-2 text-sm text-text placeholder:text-text-dim focus:outline-none focus:border-purple/50"
              />
              <div className="flex items-center justify-between gap-2">
                <button type="button" onClick={() => setMessages([])} className="text-xs text-text-dim hover:text-text">
                  Clear
                </button>
                {busy ? (
                  <button type="button" onClick={() => stop()} className="px-3 py-1.5 rounded-lg border border-border text-sm text-text-muted">
                    Stop
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!draft.trim()}
                    className="px-3 py-1.5 rounded-lg bg-purple hover:bg-purple-light text-white text-sm font-medium disabled:opacity-40"
                  >
                    Send
                  </button>
                )}
              </div>
            </form>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
