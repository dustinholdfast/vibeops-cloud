'use client';

import { useCallback, useEffect, useState } from 'react';
import { persistSidebarCollapsed, readStoredSidebarCollapsed } from './sidebar';

export function useSidebarCollapsed() {
  const [collapsed, setCollapsedState] = useState(false);

  useEffect(() => {
    setCollapsedState(readStoredSidebarCollapsed());
  }, []);

  const setCollapsed = useCallback((next: boolean) => {
    persistSidebarCollapsed(next);
    setCollapsedState(next);
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed(!collapsed);
  }, [collapsed, setCollapsed]);

  return { collapsed, setCollapsed, toggleCollapsed };
}
