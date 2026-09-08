'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

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
      className="mx-2 mb-2 block rounded-lg px-2.5 py-1.5 text-[13px] text-text-muted hover:bg-surface-elevated hover:text-text"
    >
      Admin
    </Link>
  );
}
