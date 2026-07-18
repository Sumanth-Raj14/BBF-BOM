import { describe, it, expect, beforeEach } from 'vitest';
import { storage, KEYS } from '../storage.js';

describe('storage utility', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should store and retrieve string values', () => {
    storage.set('test-key', 'hello');
    expect(storage.get('test-key')).toBe('hello');
  });

  it('should return fallback for missing keys', () => {
    expect(storage.get('no-exist', 42)).toBe(42);
  });

  it('should store and retrieve JSON values', () => {
    const obj = { a: 1, b: [2, 3] };
    storage.setJSON('test-json', obj);
    expect(storage.getJSON('test-json')).toEqual(obj);
  });

  it('should remove keys', () => {
    storage.set('test', 'value');
    storage.remove('test');
    expect(storage.get('test', 'gone')).toBe('gone');
  });

  it('should handle auth domain methods', () => {
    const user = { name: 'Test', email: 'test@example.com' };
    storage.auth.set(user);
    expect(storage.auth.get()).toEqual(user);
    storage.auth.remove();
    expect(storage.auth.get()).toBeNull();
  });

  it('should handle onboarding domain methods', () => {
    expect(storage.onboarding.isDone()).toBe(false);
    storage.onboarding.setDone();
    expect(storage.onboarding.isDone()).toBe(true);
  });

  it('should handle role domain methods', () => {
    expect(storage.role.get()).toBe('Viewer');
    storage.role.set('Engineer');
    expect(storage.role.get()).toBe('Engineer');
  });

  it('should handle bomRows domain methods', () => {
    const rows = [{ id: 'r1', name: 'Part A' }];
    storage.bomRows.set(rows);
    expect(storage.bomRows.get()).toEqual(rows);
    storage.bomRows.remove();
    expect(storage.bomRows.get()).toBeNull();
  });

  it('should handle poDraft domain methods', () => {
    expect(storage.poDraft.get()).toEqual([]);
    storage.poDraft.set([{ pn: 'TEST-001', qty: 5 }]);
    expect(storage.poDraft.get()).toHaveLength(1);
  });

  it('should handle checklist domain methods', () => {
    expect(storage.checklist.get()).toEqual([]);
    expect(storage.checklist.isDismissed()).toBe(false);
    storage.checklist.set(['item1']);
    expect(storage.checklist.get()).toContain('item1');
    storage.checklist.dismiss();
    expect(storage.checklist.isDismissed()).toBe(true);
  });

  it('should handle duplicates and errors gracefully', () => {
    localStorage.setItem(KEYS.AUTH, '{invalid json}');
    expect(storage.auth.get()).toBeNull();
    expect(() => storage.set('test', 'value')).not.toThrow();
  });

  it('should handle null/undefined fallback gracefully', () => {
    expect(storage.get('non-existent-key')).toBeNull();
    expect(storage.get('non-existent-key', undefined)).toBeNull();
    expect(storage.get('non-existent-key', null)).toBeNull();
    expect(storage.get('non-existent-key', 0)).toBe(0);
    expect(storage.get('non-existent-key', '')).toBe('');
  });

  it('should store and retrieve complex nested objects with setJSON', () => {
    const complex = {
      project: { name: 'Atlas', version: '3.2', tags: ['hw', 'firmware'] },
      parts: [
        { pn: 'ABC-001', qty: 10, specs: { weight: 1.2, material: 'steel' } },
        { pn: 'ABC-002', qty: 5, specs: { weight: 0.8, material: 'aluminum', finish: 'anodized' } },
      ],
      metadata: null,
      active: true,
      count: 42,
    };
    storage.setJSON('complex-test', complex);
    const retrieved = storage.getJSON('complex-test');
    expect(retrieved).toEqual(complex);
    expect(retrieved.parts).toHaveLength(2);
    expect(retrieved.parts[0].specs.material).toBe('steel');
    expect(retrieved.parts[1].specs.finish).toBe('anodized');
    expect(retrieved.metadata).toBeNull();
    expect(retrieved.active).toBe(true);
  });

  it('should not throw when removing non-existent keys', () => {
    expect(() => storage.remove('no-such-key-ever')).not.toThrow();
    expect(storage.remove('no-such-key-ever')).toBe(true);
  });

  it('should handle corrupted JSON across all domain methods', () => {
    const corruptedPairs = [
      [KEYS.AUTH, storage.auth],
      [KEYS.BOM_ROWS, storage.bomRows],
      [KEYS.COMMENTS, storage.comments],
      [KEYS.APPROVALS, storage.approvals],
      [KEYS.NOTIFICATIONS, storage.notifications],
      [KEYS.SAVED_VIEWS, storage.savedViews],
      [KEYS.TEMPLATES, storage.templates],
      [KEYS.ECRS, storage.ecrs],
      [KEYS.CALENDAR_EVENTS, storage.calendarEvents],
      [KEYS.WORK_ORDERS, storage.workOrders],
      [KEYS.CHECKLIST, storage.checklist],
      [KEYS.DUP_DISMISSED, storage.dupDismissed],
      [KEYS.PO_DRAFT, storage.poDraft],
      [KEYS.NOTIF_PREFS, storage.notifPrefs],
      [KEYS.DOCS, storage.docs],
      [KEYS.RECENT_SCANS, storage.recentScans],
      [KEYS.SAVED_SEARCHES, storage.savedSearches],
      [KEYS.SUPPLIER_USERS, storage.supplierUsers],
    ];
    for (const [key] of corruptedPairs) {
      localStorage.setItem(key, '{not valid json!!!}');
    }
    for (const [, domain] of corruptedPairs) {
      const val = domain.get();
      expect(val).not.toBeInstanceOf(Error);
    }
  });

  it('should handle comments/approvals/notifications get with init fallback', () => {
    expect(storage.comments.get({})).toEqual({});
    storage.comments.set({ 'key': [{ id: 1, who: 'Tester', init: 'T', color: '', text: 'test', time: 'now' }] });
    expect(storage.comments.get({})['key']).toHaveLength(1);
  });

  it('should handle a11y domain methods', () => {
    expect(storage.a11y.get()).toEqual([]);
    storage.a11y.set(['high-contrast']);
    expect(storage.a11y.get()).toEqual(['high-contrast']);
    storage.a11y.set(['high-contrast', 'colorblind-safe']);
    expect(storage.a11y.get()).toEqual(['high-contrast', 'colorblind-safe']);
    storage.a11y.set([]);
    expect(storage.a11y.get()).toEqual([]);
  });

  it('a11y domain falls back to [] on corrupted/non-array data', () => {
    localStorage.setItem(KEYS.A11Y, '{not valid json!!!}');
    expect(storage.a11y.get()).toEqual([]);
    localStorage.setItem(KEYS.A11Y, JSON.stringify({ not: 'an array' }));
    expect(storage.a11y.get()).toEqual([]);
  });

  it('checklist domain isolates dismissed state from list items', () => {
    storage.checklist.dismiss();
    expect(storage.checklist.isDismissed()).toBe(true);
    storage.checklist.set(['new-item']);
    expect(storage.checklist.get()).toContain('new-item');
    expect(storage.checklist.isDismissed()).toBe(true);
  });
});
