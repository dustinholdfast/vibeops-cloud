'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Shield } from 'lucide-react';

export function AdminLink() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch('/api/admin/me', { credentials: 'include' })
      .then((res) => {
        if (active && res.ok) setVisible(true);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  if (!visible) return null;

  return (
    <Link
      href="/admin"
      className="mx-2 mb-2 flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] text-text-muted hover:bg-surface-elevated hover:text-text"
    >
      <Shield size={14} className="text-purple-light" aria-hidden />
      Admin console
    </Link>
  );
}
