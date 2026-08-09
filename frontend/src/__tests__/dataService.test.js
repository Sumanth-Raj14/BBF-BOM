import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockStorage = {
  KEYS: { SAVED_SEARCHES: '__bbox_saved_searches' },
  bomRows: { get: vi.fn(), set: vi.fn() },
  comments: { get: vi.fn(), set: vi.fn() },
  approvals: { get: vi.fn(), set: vi.fn() },
  notifications: { get: vi.fn(), set: vi.fn() },
  savedViews: { get: vi.fn(() => []), set: vi.fn() },
  templates: { get: vi.fn(() => []), set: vi.fn() },
  ecrs: { get: vi.fn(), set: vi.fn() },
  calendarEvents: { get: vi.fn(), set: vi.fn() },
  workOrders: { get: vi.fn(), set: vi.fn() },
  poDraft: { get: vi.fn(() => []), set: vi.fn() },
  docs: { get: vi.fn(() => []), set: vi.fn() },
  supplierUsers: { get: vi.fn(() => []), set: vi.fn() },
  savedSearches: { get: vi.fn(() => []), set: vi.fn() },
  inrRate: { get: vi.fn(() => 83), set: vi.fn() },
  theme: { get: vi.fn(() => 'light'), set: vi.fn() },
};

vi.mock('../utils/storage.js', () => ({
  storage: mockStorage,
  KEYS: { SAVED_SEARCHES: '__bbox_saved_searches' },
}));

let dataService;

beforeEach(async () => {
  vi.clearAllMocks();
  window.matchMedia = window.matchMedia || vi.fn().mockImplementation(q => ({
    matches: false, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  }));
  dataService = (await import('../services/dataService.js')).dataService;
});

describe('dataService', () => {
  it('exports getSyncStatus with initial state', () => {
    const status = dataService.getSyncStatus();
    expect(status).toHaveProperty('online');
    expect(status).toHaveProperty('syncing');
    expect(status).toHaveProperty('lastSync');
    expect(status).toHaveProperty('pendingCount');
  });

  it('onSyncStatus registers a listener and returns unsubscribe function', () => {
    const fn = vi.fn();
    const unsubscribe = dataService.onSyncStatus(fn);
    expect(typeof unsubscribe).toBe('function');
    unsubscribe();
  });

  it('setOnline updates status and calls online handler', () => {
    const fn = vi.fn();
    dataService.onSyncStatus(fn);
    dataService.setOnline(true);
    expect(dataService.getSyncStatus().online).toBe(true);
  });

  it('refresh returns null when offline', async () => {
    dataService.setOnline(false);
    const result = await dataService.refresh('parts');
    expect(result).toBeNull();
  });

  // R9: dataService.set()/update()/remove() must propagate a real API
  // failure as a rejection instead of silently resolving as if the write
  // succeeded (previously the try/catch swallowed the error and only
  // enqueued it for a background retry the caller was never told about).
  // set() replaces the whole LOCAL collection — its only caller is
  // AppCtx.jsx passing the BOM rows array. Posting that array to the
  // single-entity create endpoint was never valid: the server answered 422 and
  // the failed write was then queued and retried on every app boot forever
  // (see syncQueue.test.js). So a collection set is local-only and must NOT
  // call create at all. The R9 "propagate real failures" guarantee still holds
  // for the per-entity writers and is covered by the update() test below.
  it('set() with a collection writes locally and does not post the array', async () => {
    const create = vi.fn().mockRejectedValue(new Error('API down'));
    window.api = { parts: { create } };
    dataService.setOnline(true);
    await expect(dataService.set('parts', [{ id: 1 }])).resolves.toBeUndefined();
    expect(create, 'a collection must never be posted to a single-entity create').not.toHaveBeenCalled();
  });

  it('update() rejects when the API write actually fails while online', async () => {
    window.api = { workOrders: { update: vi.fn().mockRejectedValue(new Error('API down')) } };
    dataService.setOnline(true);
    await expect(dataService.update('workOrders', 1, { status: 'done' })).rejects.toThrow('API down');
  });
});
