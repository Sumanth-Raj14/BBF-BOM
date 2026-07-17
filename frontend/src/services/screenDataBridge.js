import { storage } from '../utils/storage.js';
import { toast } from '../utils/toast.js';

function getApi() {
  return typeof window !== 'undefined' && window.api ? window.api : {};
}

function tryAPIFirst(domain, apiCall) {
  return apiCall()
    .then(data => {
      if (data && (Array.isArray(data) ? data.length : Object.keys(data).length)) {
        if (storage[domain]?.set) storage[domain].set(data);
        return data;
      }
      return storage[domain]?.get() ?? null;
    })
    .catch(() => storage[domain]?.get() ?? null);
}

// R9 fix: writes must NOT resolve as a success when the API call actually
// failed (or was never wired up, e.g. `apiModule` missing). Previously this
// caught every error and quietly returned the local `data` as if the server
// had accepted it, so users believed their change was saved when it was only
// ever written to localStorage. Now: keep the optimistic local write (so the
// UI still updates immediately), but surface the failure with a toast and
// reject so callers know the save did not actually reach the server.
function saveToAPI(domain, apiSaveCall, data) {
  if (storage[domain]?.set) storage[domain].set(data);
  return apiSaveCall().catch((err) => {
    const message = (err && err.message) || 'Unknown error';
    toast(`Save failed — not synced to server (kept locally only): ${message}`, { kind: 'error' });
    throw err;
  });
}

function listWithFallback(apiModule, method, domain, params = {}) {
  return tryAPIFirst(domain, () => {
    const fn = apiModule?.[method || 'list'];
    return fn ? fn(params).then(r => r?.items ?? r ?? []) : Promise.reject(new Error('no api'));
  });
}

function getWithFallback(apiModule, id, domain) {
  return tryAPIFirst(domain, () => {
    const fn = apiModule?.get;
    return fn ? fn(id) : Promise.reject(new Error('no api'));
  });
}

function createWithFallback(apiModule, data, domain) {
  return saveToAPI(domain, () => {
    const fn = apiModule?.create;
    return fn ? fn(data) : Promise.reject(new Error('no api'));
  }, data);
}

function updateWithFallback(apiModule, id, data, domain) {
  return saveToAPI(domain, () => {
    const fn = apiModule?.update;
    return fn ? fn(id, data) : Promise.reject(new Error('no api'));
  }, data);
}

function removeWithFallback(apiModule, id, domain) {
  if (storage[domain]?.remove) storage[domain].remove();
  if (!apiModule?.delete) return Promise.resolve();
  return apiModule.delete(id).catch((err) => {
    const message = (err && err.message) || 'Unknown error';
    toast(`Delete failed — not synced to server (removed locally only): ${message}`, { kind: 'error' });
    throw err;
  });
}

export const screenData = {
  parts: {
    list: (params) => listWithFallback(getApi().parts, 'list', 'bomRows', params),
    get: (id) => getWithFallback(getApi().parts, id, 'bomRows'),
    create: (data) => createWithFallback(getApi().parts, data, 'bomRows'),
    update: (id, data) => updateWithFallback(getApi().parts, id, data, 'bomRows'),
    remove: (id) => removeWithFallback(getApi().parts, id, 'bomRows'),
  },
  vendors: {
    list: (params) => listWithFallback(getApi().vendors, 'list', null, params),
    get: (id) => getWithFallback(getApi().vendors, id, null),
    create: (data) => createWithFallback(getApi().vendors, data, null),
    update: (id, data) => updateWithFallback(getApi().vendors, id, data, null),
    remove: (id) => removeWithFallback(getApi().vendors, id, null),
  },
  projects: {
    list: (params) => listWithFallback(getApi().projects, 'list', null, params),
    get: (id) => getWithFallback(getApi().projects, id, null),
    create: (data) => createWithFallback(getApi().projects, data, null),
    update: (id, data) => updateWithFallback(getApi().projects, id, data, null),
    remove: (id) => removeWithFallback(getApi().projects, id, null),
  },
  procurement: {
    list: (params) => listWithFallback(getApi().procurement, 'list', 'poDraft', params),
    get: (id) => getWithFallback(getApi().procurement, id, 'poDraft'),
    alerts: () => tryAPIFirst('poDraft', () => getApi().procurement?.alerts?.() ?? Promise.resolve([])),
    create: (data) => createWithFallback(getApi().procurement, data, 'poDraft'),
    update: (id, data) => updateWithFallback(getApi().procurement, id, data, 'poDraft'),
    advance: (id, action) => saveToAPI('poDraft', () => getApi().procurement?.advance?.(id, action) ?? Promise.reject(), action),
    remove: (id) => removeWithFallback(getApi().procurement, id, 'poDraft'),
  },
  documents: {
    list: (params) => listWithFallback(getApi().documents, 'list', 'docs', params),
    folders: () => tryAPIFirst('docs', () => getApi().documents?.folders?.() ?? Promise.resolve([])),
    get: (id) => getWithFallback(getApi().documents, id, 'docs'),
    upload: (file, meta) => saveToAPI('docs', () => getApi().documents?.upload?.(file, meta) ?? Promise.reject(), { file, meta }),
    update: (id, data) => updateWithFallback(getApi().documents, id, data, 'docs'),
    remove: (id) => removeWithFallback(getApi().documents, id, 'docs'),
  },
  users: {
    list: (params) => listWithFallback(getApi().users, 'list', null, params),
    get: (id) => getWithFallback(getApi().users, id, null),
    create: (data) => createWithFallback(getApi().users, data, null),
    update: (id, data) => updateWithFallback(getApi().users, id, data, null),
    remove: (id) => removeWithFallback(getApi().users, id, null),
  },
  notifications: {
    list: (params) => listWithFallback(getApi().notifications, 'list', 'notifications', params),
    update: (id, data) => updateWithFallback(getApi().notifications, id, data, 'notifications'),
    remove: (id) => removeWithFallback(getApi().notifications, id, 'notifications'),
  },
  comments: {
    list: (params) => listWithFallback(getApi().comments, 'list', 'comments', params),
    create: (data) => createWithFallback(getApi().comments, data, 'comments'),
    update: (id, data) => updateWithFallback(getApi().comments, id, data, 'comments'),
    remove: (id) => removeWithFallback(getApi().comments, id, 'comments'),
  },
  approvals: {
    list: (params) => listWithFallback(getApi().approvals, 'list', 'approvals', params),
    create: (data) => createWithFallback(getApi().approvals, data, 'approvals'),
    update: (id, data) => updateWithFallback(getApi().approvals, id, data, 'approvals'),
  },
  workOrders: {
    list: (params) => listWithFallback(getApi().workOrders, 'list', 'workOrders', params),
    get: (id) => getWithFallback(getApi().workOrders, id, 'workOrders'),
    create: (data) => createWithFallback(getApi().workOrders, data, 'workOrders'),
    update: (id, data) => updateWithFallback(getApi().workOrders, id, data, 'workOrders'),
    remove: (id) => removeWithFallback(getApi().workOrders, id, 'workOrders'),
  },
  templates: {
    list: (params) => listWithFallback(getApi().bomTemplates, 'list', 'templates', params),
    get: (id) => getWithFallback(getApi().bomTemplates, id, 'templates'),
    create: (data) => createWithFallback(getApi().bomTemplates, data, 'templates'),
    update: (id, data) => updateWithFallback(getApi().bomTemplates, id, data, 'templates'),
    remove: (id) => removeWithFallback(getApi().bomTemplates, id, 'templates'),
    load: (id) => tryAPIFirst('templates', () => getApi().bomTemplates?.load?.(id) ?? Promise.reject()),
  },
  ecrs: {
    list: (params) => listWithFallback(getApi().eco, 'list', 'ecrs', params),
    get: (id) => getWithFallback(getApi().eco, id, 'ecrs'),
    create: (data) => createWithFallback(getApi().eco, data, 'ecrs'),
    update: (id, data) => updateWithFallback(getApi().eco, id, data, 'ecrs'),
    remove: (id) => removeWithFallback(getApi().eco, id, 'ecrs'),
    approve: (id, data) => saveToAPI('ecrs', () => getApi().eco?.approve?.(id, data) ?? Promise.reject(), { id, data }),
  },
  calendarEvents: {
    list: (params) => listWithFallback(getApi().calendarEvents, 'list', 'calendarEvents', params),
    create: (data) => createWithFallback(getApi().calendarEvents, data, 'calendarEvents'),
    update: (id, data) => updateWithFallback(getApi().calendarEvents, id, data, 'calendarEvents'),
    remove: (id) => removeWithFallback(getApi().calendarEvents, id, 'calendarEvents'),
  },
  inventory: {
    list: (params) => listWithFallback(getApi().inventory, 'list', null, params),
    get: (id) => getWithFallback(getApi().inventory, id, null),
    lowStock: () => tryAPIFirst(null, () => getApi().inventory?.lowStock?.() ?? Promise.resolve([])),
  },
  quality: {
    ncr: {
      list: (params) => listWithFallback(getApi().quality?.ncr, 'list', null, params),
      create: (data) => createWithFallback(getApi().quality?.ncr, data, null),
    },
    inspection: {
      list: (params) => listWithFallback(getApi().quality?.inspection, 'list', null, params),
      create: (data) => createWithFallback(getApi().quality?.inspection, data, null),
    },
  },
  compliance: {
    list: (params) => listWithFallback(getApi().compliance, 'list', null, params),
    dashboard: () => tryAPIFirst(null, () => getApi().compliance?.dashboard?.() ?? Promise.resolve({})),
    parts: {
      status: (partId) => tryAPIFirst(null, () => getApi().compliance?.parts?.status?.(partId) ?? Promise.resolve(null)),
    },
  },
  analytics: {
    dashboard: () => tryAPIFirst(null, () => getApi().analytics?.dashboard?.() ?? Promise.resolve({})),
    trends: (range) => tryAPIFirst(null, () => getApi().analytics?.trends?.(range) ?? Promise.resolve([])),
    categories: () => tryAPIFirst(null, () => getApi().analytics?.categories?.() ?? Promise.resolve([])),
  },
  makeVsBuy: {
    list: (params) => listWithFallback(getApi().makeVsBuy, 'list', null, params),
    create: (data) => createWithFallback(getApi().makeVsBuy, data, null),
  },
  shouldCost: {
    list: (params) => listWithFallback(getApi().shouldCost, 'list', null, params),
    create: (data) => createWithFallback(getApi().shouldCost, data, null),
  },
  supplierScorecard: {
    list: (params) => listWithFallback(getApi().supplierScorecard, 'list', null, params),
  },
  capa: {
    list: (params) => listWithFallback(getApi().capa, 'list', null, params),
    create: (data) => createWithFallback(getApi().capa, data, null),
  },
  fai: {
    list: (params) => listWithFallback(getApi().fai, 'list', null, params),
    create: (data) => createWithFallback(getApi().fai, data, null),
  },
  deviations: {
    list: (params) => listWithFallback(getApi().deviation, 'list', null, params),
    create: (data) => createWithFallback(getApi().deviation, data, null),
  },
  kanban: {
    list: (params) => listWithFallback(getApi().kanban, 'list', null, params),
    lowStockAlerts: () => tryAPIFirst(null, () => getApi().kanban?.lowStockAlerts?.() ?? Promise.resolve([])),
  },
  contracts: {
    list: (params) => listWithFallback(getApi().contract, 'list', null, params),
    create: (data) => createWithFallback(getApi().contract, data, null),
  },
  orderTracking: {
    list: (params) => listWithFallback(getApi().orderTracking, 'list', null, params),
    stats: () => tryAPIFirst(null, () => getApi().orderTracking?.stats?.() ?? Promise.resolve({})),
  },
  webhooks: {
    list: (params) => listWithFallback(getApi().webhooks, 'list', null, params),
    create: (data) => createWithFallback(getApi().webhooks, data, null),
    deliveries: (params) => listWithFallback(getApi().webhooks, 'deliveries', null, params),
  },
  erpConnectors: {
    list: (params) => listWithFallback(getApi().erpConnectors, 'list', null, params),
    logs: (id) => tryAPIFirst(null, () => getApi().erpConnectors?.logs?.(id) ?? Promise.resolve([])),
  },
  supplierPortal: {
    users: () => listWithFallback(getApi().supplierPortal, 'listUsers', 'supplierUsers'),
    priceUpdates: (params) => listWithFallback(getApi().supplierPortal, 'listPriceUpdates', null, params),
  },
  traceability: {
    serialNumbers: {
      list: (params) => listWithFallback(getApi().traceability?.serialNumbers, 'list', null, params),
    },
    lots: {
      list: (params) => listWithFallback(getApi().traceability?.lots, 'list', null, params),
    },
  },
  savedSearches: {
    list: () => tryAPIFirst('savedSearches', () => getApi().userDataSync?.getSavedSearches?.() ?? Promise.resolve([])),
    save: (name, params, isDefault) => saveToAPI('savedSearches', () => getApi().userDataSync?.saveSearch?.(name, params, isDefault) ?? Promise.reject(), { name, params }),
  },
  userData: {
    preferences: () => tryAPIFirst(null, () => getApi().userDataSync?.getPreferences?.() ?? Promise.resolve({})),
    bomDraft: (name) => tryAPIFirst(null, () => getApi().userDataSync?.getBomDraft?.(name) ?? Promise.resolve(null)),
  },
};

window.__screenData = screenData;
