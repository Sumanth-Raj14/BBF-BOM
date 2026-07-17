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
});
