import test from 'node:test';
import assert from 'node:assert/strict';
import { persistSidebarCollapsed, readStoredSidebarCollapsed, SIDEBAR_STORAGE_KEY } from './sidebar';

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) {
    return this.data.has(key) ? this.data.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, String(value));
  }
}

test('sidebar collapse persists as 1 or 0', () => {
  const storage = new MemoryStorage();
  (globalThis as { localStorage?: MemoryStorage }).localStorage = storage;

  assert.equal(readStoredSidebarCollapsed(), false);
  persistSidebarCollapsed(true);
  assert.equal(storage.getItem(SIDEBAR_STORAGE_KEY), '1');
  assert.equal(readStoredSidebarCollapsed(), true);
  persistSidebarCollapsed(false);
  assert.equal(storage.getItem(SIDEBAR_STORAGE_KEY), '0');
  assert.equal(readStoredSidebarCollapsed(), false);
});
