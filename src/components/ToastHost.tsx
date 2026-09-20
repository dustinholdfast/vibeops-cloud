'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useToastStore } from '../store/useToastStore';

export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[70] flex flex-col items-center gap-2 px-4">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-border bg-surface-elevated px-4 py-2.5 shadow-2xl"
            role="status"
          >
            <p className="text-sm text-text">{toast.message}</p>
            {toast.onAction && (
              <button
                type="button"
                className="text-sm font-medium text-purple-light hover:underline"
                onClick={() => {
                  toast.onAction?.();
                  dismiss(toast.id);
                }}
              >
                {toast.actionLabel ?? 'Undo'}
              </button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
