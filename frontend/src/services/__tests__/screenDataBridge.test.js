import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockStorage = {
  bomRows: { get: vi.fn(() => null), set: vi.fn(), remove: vi.fn() },
  poDraft: { get: vi.fn(() => []), set: vi.fn(), remove: vi.fn() },
  docs: { get: vi.fn(() => []), set: vi.fn(), remove: vi.fn() },
  notifications: { get: vi.fn(() => null), set: vi.fn(), remove: vi.fn() },
  comments: { get: vi.fn(() => null), set: vi.fn(), remove: vi.fn() },
  approvals: { get: vi.fn(() => null), set: vi.fn() },
  workOrders: { get: vi.fn(() => null), set: vi.fn(), remove: vi.fn() },
  templates: { get: vi.fn(() => []), set: vi.fn(), remove: vi.fn() },
  ecrs: { get: vi.fn(() => null), set: vi.fn(), remove: vi.fn() },
  calendarEvents: { get: vi.fn(() => null), set: vi.fn(), remove: vi.fn() },
  savedSearches: { get: vi.fn(() => []), set: vi.fn() },
  supplierUsers: { get: vi.fn(() => []), set: vi.fn() },
};

vi.mock('../../utils/storage.js', () => ({
  storage: mockStorage,
  KEYS: {},
}));

const storageDefaults = {
  bomRows: null, poDraft: [], docs: [], notifications: null, comments: null,
  approvals: null, workOrders: null, templates: [], ecrs: null,
  calendarEvents: null, savedSearches: [], supplierUsers: [],
};

let screenData;

function resetStorage() {
  Object.entries(storageDefaults).forEach(([domain, val]) => {
    if (mockStorage[domain]?.get) mockStorage[domain].get.mockImplementation(() => val);
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  window.api = {};
  window.apiRequest = vi.fn();
  resetStorage();
  screenData = (await import('../screenDataBridge.js')).screenData;
});

afterEach(() => {
  delete window.api;
  delete window.apiRequest;
});

function setMockApi(domain, methods) {
  window.api[domain] = methods;
}

describe('screenDataBridge', () => {
  describe('tryAPIFirst fallback behavior', () => {
    it('returns localStorage data when API is unavailable', async () => {
      delete window.api;
      screenData = (await import('../screenDataBridge.js')).screenData;
      const result = await screenData.parts.list();
      expect(result).toBeNull();
    });

    it('returns localStorage data when API call fails', async () => {
      setMockApi('parts', { list: vi.fn().mockRejectedValue(new Error('Network error')) });
      mockStorage.bomRows.get.mockReturnValue([{ id: 1, name: 'cached' }]);
      const result = await screenData.parts.list();
      expect(result).toEqual([{ id: 1, name: 'cached' }]);
    });

    it('returns API data and caches to localStorage on success', async () => {
      const apiData = [{ id: 1, name: 'Part A' }];
      setMockApi('parts', { list: vi.fn().mockResolvedValue({ items: apiData }) });
      const result = await screenData.parts.list();
      expect(result).toEqual(apiData);
      expect(mockStorage.bomRows.set).toHaveBeenCalledWith(apiData);
    });
  });

  describe('parts domain', () => {
    it('creates a part via API and caches to localStorage', async () => {
      const newPart = { pn: 'TEST-001', name: 'Test' };
      setMockApi('parts', { create: vi.fn().mockResolvedValue(newPart) });
      const result = await screenData.parts.create(newPart);
      expect(result).toEqual(newPart);
      expect(mockStorage.bomRows.set).toHaveBeenCalledWith(newPart);
    });

    it('falls back to localStorage on create failure', async () => {
      setMockApi('parts', { create: vi.fn().mockRejectedValue(new Error('fail')) });
      const result = await screenData.parts.create({ pn: 'TEST' });
      expect(result).toEqual({ pn: 'TEST' });
    });

    it('removes part via API', async () => {
      setMockApi('parts', { delete: vi.fn().mockResolvedValue({}) });
      await screenData.parts.remove(1);
      expect(mockStorage.bomRows.remove).toHaveBeenCalled();
    });
  });

  describe('vendors domain', () => {
    it('lists vendors from API', async () => {
      setMockApi('vendors', { list: vi.fn().mockResolvedValue({ items: [{ id: 1, name: 'Vendor A' }] }) });
      const result = await screenData.vendors.list();
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Vendor A');
    });

    it('gets a vendor by id from API', async () => {
      setMockApi('vendors', { get: vi.fn().mockResolvedValue({ id: 1, name: 'Vendor A' }) });
      const result = await screenData.vendors.get(1);
      expect(result.name).toBe('Vendor A');
    });
  });

  describe('procurement domain', () => {
    it('lists procurement from API', async () => {
      setMockApi('procurement', { list: vi.fn().mockResolvedValue({ items: [{ poNumber: 'PO-001' }] }) });
      const result = await screenData.procurement.list();
      expect(result).toHaveLength(1);
      expect(result[0].poNumber).toBe('PO-001');
    });

    it('calls alerts method', async () => {
      setMockApi('procurement', { alerts: vi.fn().mockResolvedValue([{ type: 'overdue' }]) });
      const result = await screenData.procurement.alerts();
      expect(result).toHaveLength(1);
    });

    it('calls advance action', async () => {
      setMockApi('procurement', { advance: vi.fn().mockResolvedValue({}) });
      const result = await screenData.procurement.advance(1, 'approve');
      expect(window.api.procurement.advance).toHaveBeenCalledWith(1, 'approve');
    });
  });

  describe('documents domain', () => {
    it('lists documents from API', async () => {
      setMockApi('documents', { list: vi.fn().mockResolvedValue({ items: [{ id: 1, name: 'Doc A' }] }) });
      const result = await screenData.documents.list();
      expect(result).toHaveLength(1);
    });

    it('lists folders from API', async () => {
      setMockApi('documents', { folders: vi.fn().mockResolvedValue([{ id: 1, name: 'Folder A' }]) });
      const result = await screenData.documents.folders();
      expect(result).toHaveLength(1);
    });

    it('uploads a document via API', async () => {
      setMockApi('documents', { upload: vi.fn().mockResolvedValue({ id: 1 }) });
      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
      const result = await screenData.documents.upload(file, { category: 'spec' });
      expect(window.api.documents.upload).toHaveBeenCalledWith(file, { category: 'spec' });
    });
  });

  describe('users domain', () => {
    it('lists users from API', async () => {
      setMockApi('users', { list: vi.fn().mockResolvedValue({ items: [{ id: 1, email: 'a@b.com' }] }) });
      const result = await screenData.users.list();
      expect(result).toHaveLength(1);
    });
  });

  describe('workOrders domain', () => {
    it('lists work orders from API', async () => {
      setMockApi('workOrders', { list: vi.fn().mockResolvedValue({ items: [{ id: 1, title: 'WO-001' }] }) });
      const result = await screenData.workOrders.list();
      expect(result).toHaveLength(1);
    });
  });

  describe('templates domain', () => {
    it('lists templates from API', async () => {
      setMockApi('bomTemplates', { list: vi.fn().mockResolvedValue({ items: [{ id: 1, name: 'Template A' }] }) });
      const result = await screenData.templates.list();
      expect(result).toHaveLength(1);
    });

    it('loads a template via load method', async () => {
      setMockApi('bomTemplates', { load: vi.fn().mockResolvedValue({ bomRows: [] }) });
      const result = await screenData.templates.load(1);
      expect(window.api.bomTemplates.load).toHaveBeenCalledWith(1);
    });
  });

  describe('ecrs domain (engineering change requests)', () => {
    it('lists ECRs from API', async () => {
      setMockApi('eco', { list: vi.fn().mockResolvedValue({ items: [{ id: 1, title: 'ECR-001' }] }) });
      const result = await screenData.ecrs.list();
      expect(result).toHaveLength(1);
    });

    it('approves an ECR via API', async () => {
      setMockApi('eco', { approve: vi.fn().mockResolvedValue({}) });
      await screenData.ecrs.approve(1, { status: 'approved' });
      expect(window.api.eco.approve).toHaveBeenCalledWith(1, { status: 'approved' });
    });
  });

  describe('calendarEvents domain', () => {
    it('lists calendar events from API', async () => {
      setMockApi('calendarEvents', { list: vi.fn().mockResolvedValue({ items: [{ id: 1, title: 'Event' }] }) });
      const result = await screenData.calendarEvents.list();
      expect(result).toHaveLength(1);
    });
  });

  describe('inventory domain', () => {
    it('lists inventory from API', async () => {
      setMockApi('inventory', { list: vi.fn().mockResolvedValue({ items: [{ id: 1, partNumber: 'PN-001' }] }) });
      const result = await screenData.inventory.list();
      expect(result).toHaveLength(1);
    });

    it('calls lowStock from API', async () => {
      setMockApi('inventory', { lowStock: vi.fn().mockResolvedValue([{ partNumber: 'PN-001', qty: 5 }]) });
      const result = await screenData.inventory.lowStock();
      expect(result).toHaveLength(1);
    });
  });

  describe('quality domain', () => {
    it('lists NCRs from API', async () => {
      setMockApi('quality', { ncr: { list: vi.fn().mockResolvedValue({ items: [{ id: 1 }] }) } });
      const result = await screenData.quality.ncr.list();
      expect(result).toHaveLength(1);
    });

    it('lists inspections from API', async () => {
      setMockApi('quality', { inspection: { list: vi.fn().mockResolvedValue({ items: [{ id: 1, status: 'pass' }] }) } });
      const result = await screenData.quality.inspection.list();
      expect(result).toHaveLength(1);
    });
  });

  describe('compliance domain', () => {
    it('lists compliance from API', async () => {
      setMockApi('compliance', { list: vi.fn().mockResolvedValue({ items: [{ id: 1, standard: 'ISO 9001' }] }) });
      const result = await screenData.compliance.list();
      expect(result).toHaveLength(1);
    });

    it('calls dashboard from API', async () => {
      setMockApi('compliance', { dashboard: vi.fn().mockResolvedValue({ compliant: 10, nonCompliant: 2 }) });
      const result = await screenData.compliance.dashboard();
      expect(result.compliant).toBe(10);
    });

    it('calls parts status from API', async () => {
      setMockApi('compliance', { parts: { status: vi.fn().mockResolvedValue({ compliant: true }) } });
      const result = await screenData.compliance.parts.status(1);
      expect(result.compliant).toBe(true);
    });
  });

  describe('analytics domain', () => {
    it('calls analytics dashboard from API', async () => {
      setMockApi('analytics', { dashboard: vi.fn().mockResolvedValue({ totalParts: 100 }) });
      const result = await screenData.analytics.dashboard();
      expect(result.totalParts).toBe(100);
    });

    it('calls analytics trends from API', async () => {
      setMockApi('analytics', { trends: vi.fn().mockResolvedValue([{ month: '2026-01', avgCost: 50 }]) });
      const result = await screenData.analytics.trends('6mo');
      expect(window.api.analytics.trends).toHaveBeenCalledWith('6mo');
      expect(result).toHaveLength(1);
    });
  });

  describe('supply chain domains', () => {
    it('lists makeVsBuy from API', async () => {
      setMockApi('makeVsBuy', { list: vi.fn().mockResolvedValue({ items: [{ id: 1, decision: 'make' }] }) });
      const result = await screenData.makeVsBuy.list();
      expect(result).toHaveLength(1);
    });

    it('lists shouldCost from API', async () => {
      setMockApi('shouldCost', { list: vi.fn().mockResolvedValue({ items: [{ id: 1, cost: 100 }] }) });
      const result = await screenData.shouldCost.list();
      expect(result).toHaveLength(1);
    });

    it('lists supplierScorecard from API', async () => {
      setMockApi('supplierScorecard', { list: vi.fn().mockResolvedValue({ items: [{ vendor: 'A', score: 95 }] }) });
      const result = await screenData.supplierScorecard.list();
      expect(result).toHaveLength(1);
    });
  });

  describe('quality process domains (CAPA, FAI, Deviations)', () => {
    it('lists CAPAs from API', async () => {
      setMockApi('capa', { list: vi.fn().mockResolvedValue({ items: [{ id: 1 }] }) });
      const result = await screenData.capa.list();
      expect(result).toHaveLength(1);
    });

    it('lists FAIs from API', async () => {
      setMockApi('fai', { list: vi.fn().mockResolvedValue({ items: [{ id: 1 }] }) });
      const result = await screenData.fai.list();
      expect(result).toHaveLength(1);
    });

    it('lists deviations from API', async () => {
      setMockApi('deviation', { list: vi.fn().mockResolvedValue({ items: [{ id: 1 }] }) });
      const result = await screenData.deviations.list();
      expect(result).toHaveLength(1);
    });
  });

  describe('logistics domains (Kanban, Contracts, OrderTracking)', () => {
    it('lists kanban from API', async () => {
      setMockApi('kanban', { list: vi.fn().mockResolvedValue({ items: [{ id: 1, cardType: 'production' }] }) });
      const result = await screenData.kanban.list();
      expect(result).toHaveLength(1);
    });

    it('calls kanban lowStockAlerts from API', async () => {
      setMockApi('kanban', { lowStockAlerts: vi.fn().mockResolvedValue([{ partNumber: 'PN-001' }]) });
      const result = await screenData.kanban.lowStockAlerts();
      expect(result).toHaveLength(1);
    });

    it('lists contracts from API', async () => {
      setMockApi('contract', { list: vi.fn().mockResolvedValue({ items: [{ id: 1, vendor: 'Vendor A' }] }) });
      const result = await screenData.contracts.list();
      expect(result).toHaveLength(1);
    });

    it('lists orderTracking from API', async () => {
      setMockApi('orderTracking', { list: vi.fn().mockResolvedValue({ items: [{ id: 1, status: 'shipped' }] }) });
      const result = await screenData.orderTracking.list();
      expect(result).toHaveLength(1);
    });
  });

  describe('integration domains (Webhooks, ERP, SupplierPortal)', () => {
    it('lists webhooks from API', async () => {
      setMockApi('webhooks', { list: vi.fn().mockResolvedValue({ items: [{ id: 1, url: 'https://hook.example.com' }] }) });
      const result = await screenData.webhooks.list();
      expect(result).toHaveLength(1);
    });

    it('lists webhook deliveries from API', async () => {
      setMockApi('webhooks', { deliveries: vi.fn().mockResolvedValue({ items: [{ id: 1, status: 'delivered' }] }) });
      const result = await screenData.webhooks.deliveries();
      expect(result).toHaveLength(1);
    });

    it('lists ERP connectors from API', async () => {
      setMockApi('erpConnectors', { list: vi.fn().mockResolvedValue({ items: [{ id: 1, type: 'SAP' }] }) });
      const result = await screenData.erpConnectors.list();
      expect(result).toHaveLength(1);
    });

    it('lists supplier portal users from API', async () => {
      setMockApi('supplierPortal', { listUsers: vi.fn().mockResolvedValue({ items: [{ id: 1, email: 'vendor@test.com' }] }) });
      const result = await screenData.supplierPortal.users();
      expect(result).toHaveLength(1);
    });
  });

  describe('traceability domain', () => {
    it('lists serial numbers from API', async () => {
      setMockApi('traceability', { serialNumbers: { list: vi.fn().mockResolvedValue({ items: [{ id: 1 }] }) } });
      const result = await screenData.traceability.serialNumbers.list();
      expect(result).toHaveLength(1);
    });

    it('lists lots from API', async () => {
      setMockApi('traceability', { lots: { list: vi.fn().mockResolvedValue({ items: [{ id: 1, lotNumber: 'LOT-001' }] }) } });
      const result = await screenData.traceability.lots.list();
      expect(result).toHaveLength(1);
    });
  });

  describe('savedSearches domain', () => {
    it('lists saved searches from API', async () => {
      setMockApi('userDataSync', { getSavedSearches: vi.fn().mockResolvedValue([{ id: 1, name: 'My Search' }]) });
      const result = await screenData.savedSearches.list();
      expect(result).toHaveLength(1);
    });

    it('saves a search and caches to localStorage', async () => {
      setMockApi('userDataSync', { saveSearch: vi.fn().mockResolvedValue({}) });
      await screenData.savedSearches.save('test', { q: 'test' }, false);
      expect(window.api.userDataSync.saveSearch).toHaveBeenCalledWith('test', { q: 'test' }, false);
    });
  });

  describe('userData domain', () => {
    it('gets user preferences from API', async () => {
      setMockApi('userDataSync', { getPreferences: vi.fn().mockResolvedValue({ theme: 'dark' }) });
      const result = await screenData.userData.preferences();
      expect(result.theme).toBe('dark');
    });

    it('gets BOM draft from API', async () => {
      setMockApi('userDataSync', { getBomDraft: vi.fn().mockResolvedValue({ bomRows: [] }) });
      const result = await screenData.userData.bomDraft('default');
      expect(window.api.userDataSync.getBomDraft).toHaveBeenCalledWith('default');
    });
  });
});
