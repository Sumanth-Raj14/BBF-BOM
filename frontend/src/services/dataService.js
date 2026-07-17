import { storage } from '../utils/storage.js';
import { convertApiPartsToTree } from '../utils/bom.js';
import { screenData } from './screenDataBridge.js';
import { api } from '../globals';

const SYNC_EVENT = 'bbox:sync-status';
const QUEUE_KEY = '__bbox_sync_queue';

let _online = navigator.onLine;
let _syncing = false;
let _lastSync = null;
const _listeners = new Set();
let _pendingCount = 0;

function notify() {
  const status = { online: _online, syncing: _syncing, lastSync: _lastSync, pendingCount: _pendingCount };
  _listeners.forEach(fn => { try { fn(status); } catch { /* skip */ } });
  window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: status }));
}

function loadQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveQueue(queue) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue)); } catch { /* skip */ }
  _pendingCount = queue.length;
  notify();
}

function enqueueWrite(domain, action, payload) {
  const queue = loadQueue();
  queue.push({ domain, action, payload, ts: Date.now() });
  saveQueue(queue);
}

function dequeueWrite() {
  const queue = loadQueue();
  const item = queue.shift();
  saveQueue(queue);
  return item;
}

async function processQueue() {
  if (_syncing) return;
  _syncing = true;
  notify();
  let item;
  while ((item = dequeueWrite()) !== undefined) {
    try {
      const writer = apiWriters[item.domain];
      if (writer) {
        if (item.action === 'create') await writer.create(item.payload);
        else if (item.action === 'update') await writer.update(item.payload);
        else if (item.action === 'delete' && writer.remove) await writer.remove(item.payload);
      }
    } catch {
      enqueueWrite(item.domain, item.action, item.payload);
      break;
    }
  }
  _syncing = false;
  _lastSync = Date.now();
  notify();
}

const apiReaders = {
  parts: {
    list: () => screenData.parts.list({ limit: 1000 }),
  },
  comments: {
    list: (params) => screenData.comments.list(params),
  },
  approvals: {
    list: () => screenData.approvals.list(),
  },
  notifications: {
    list: () => screenData.notifications.list(),
  },
  workOrders: {
    list: () => screenData.workOrders.list(),
  },
  ecrs: {
    list: () => screenData.ecrs.list(),
  },
  templates: {
    list: () => screenData.templates.list(),
  },
  documents: {
    list: () => screenData.documents.list(),
  },
  poDrafts: {
    list: () => screenData.procurement.list(),
  },
  vendorUsers: {
    list: () => screenData.supplierPortal.users(),
  },
};

const apiWriters = {
  parts: {
    create: (data) => screenData.parts.create(data),
    update: (data) => screenData.parts.update(data.id, data),
    remove: (id) => screenData.parts.remove(id),
  },
  comments: {
    create: (data) => screenData.comments.create(data),
    remove: (id) => screenData.comments.remove(id),
  },
  approvals: {
    create: (data) => screenData.approvals.create(data),
    update: (data) => screenData.approvals.update(data.id, data),
  },
  notifications: {
    update: (data) => screenData.notifications.update(data.id, data),
  },
  workOrders: {
    create: (data) => screenData.workOrders.create(data),
    update: (data) => screenData.workOrders.update(data.id, data),
  },
  ecrs: {
    create: (data) => screenData.ecrs.create(data),
  },
  templates: {
    create: (data) => screenData.templates.create(data),
    update: (data) => screenData.templates.update(data.id, data),
    remove: (id) => screenData.templates.remove(id),
  },
};

export const dataService = {

  onSyncStatus(fn) {
    _listeners.add(fn);
    return () => _listeners.delete(fn);
  },

  getSyncStatus() {
    return { online: _online, syncing: _syncing, lastSync: _lastSync, pendingCount: _pendingCount };
  },

  async setOnline(online) {
    _online = online;
    notify();
    if (online) processQueue();
  },

  async syncAll() {
    if (!_online || _syncing) return;
    _syncing = true;
    notify();
    try {
      if (!api) { _syncing = false; notify(); return; }
      await Promise.allSettled([
        this.refresh('parts'),
        this.refresh('comments'),
        this.refresh('approvals'),
        this.refresh('notifications'),
        this.refresh('workOrders'),
        this.refresh('ecrs'),
        this.refresh('templates'),
        this.refresh('documents'),
        this.refresh('poDrafts'),
        this.refresh('vendorUsers'),
      ]);
    } finally {
      _syncing = false;
      _lastSync = Date.now();
      notify();
    }
  },

  async refresh(domain) {
    if (!_online) return null;
    try {
      switch (domain) {
        case 'parts': {
          const parts = await apiReaders.parts.list();
          if (parts && parts.items) {
            const tree = convertApiPartsToTree(parts.items);
            return { items: tree, raw: parts.items };
          }
          return null;
        }
        case 'comments': {
          const data = await apiReaders.comments.list();
          if (data) {
            const grouped = {};
            if (Array.isArray(data)) {
              data.forEach(c => {
                const key = c.partId || c.bomItemId || 'default';
                if (!grouped[key]) grouped[key] = [];
                grouped[key].push({
                  id: c.id, who: c.author || c.userName || 'User', init: (c.author || 'U')[0],
                  color: '', text: c.content || c.text || '', time: c.createdAt || '',
                });
              });
            }
            return grouped;
          }
          return null;
        }
        case 'approvals': {
          const data = await apiReaders.approvals.list();
          if (data) {
            const mapped = {};
            if (Array.isArray(data)) {
              data.forEach(a => {
                const key = a.bomId || a.id;
                mapped[key] = {
                  engineering: a.engineering || 'pending',
                  procurement: a.procurement || 'pending',
                  finance: a.finance || 'pending',
                };
              });
            }
            return mapped;
          }
          return null;
        }
        case 'notifications': {
          const data = await apiReaders.notifications.list();
          if (data) {
            const mapped = Array.isArray(data) ? data.map(n => ({
              id: n.id, who: n.author || 'System', init: (n.author || 'S')[0],
              color: 'sys', action: n.title || n.message || '',
              obj: n.message || n.title || '', time: n.createdAt || '',
              read: n.status === 'read', route: 'bom',
            })) : [];
            storage.notifications.set(mapped);
            return mapped;
          }
          return null;
        }
        case 'workOrders': {
          const data = await apiReaders.workOrders.list();
          if (data) {
            return data;
          }
          return null;
        }
        case 'ecrs': {
          const data = await apiReaders.ecrs.list();
          if (data) { storage.ecrs.set(data); return data; }
          return null;
        }
        case 'templates': {
          const data = await apiReaders.templates.list();
          if (data) { storage.templates.set(data); return data; }
          return null;
        }
        case 'documents': {
          const data = await apiReaders.documents.list();
          if (data) { storage.docs.set(data); return data; }
          return null;
        }
        case 'poDrafts': {
          const data = await apiReaders.poDrafts.list();
          if (data) { return data; }
          return null;
        }
        case 'vendorUsers': {
          const data = await apiReaders.vendorUsers.list();
          if (data) { storage.supplierUsers.set(data); return data; }
          return null;
        }
        default:
          return null;
      }
    } catch {
      return null;
    }
  },

  async get(domain, fallback = null) {
    const local = getLocal(domain);
    if (local !== null && local !== undefined) return local;
    const api = await this.refresh(domain);
    return api || fallback;
  },

  async set(domain, value) {
    setLocal(domain, value);
    const writer = apiWriters[domain];
    if (!writer || !_online) {
      if (!_online && writer) enqueueWrite(domain, 'create', value);
      return;
    }
    try {
      if (writer.create) await writer.create(value);
    } catch {
      enqueueWrite(domain, 'create', value);
    }
  },

  async update(domain, id, value) {
    if (domain === 'parts') {
      // Direct API sync instead of local mutation
    } else {
      setLocal(domain, value);
    }
    const writer = apiWriters[domain];
    if (!writer || !_online) {
      if (!_online && writer) enqueueWrite(domain, 'update', { id, ...value });
      return;
    }
    try {
      if (writer.update) await writer.update({ id, ...value });
    } catch {
      enqueueWrite(domain, 'update', { id, ...value });
    }
  },

  async remove(domain, id) {
    if (domain === 'parts') {
      // Direct API sync instead of local mutation
    }
    const writer = apiWriters[domain];
    if (!writer || !_online) {
      if (!_online && writer) enqueueWrite(domain, 'delete', id);
      return;
    }
    try {
      if (writer.remove) await writer.remove(id);
    } catch {
      enqueueWrite(domain, 'delete', id);
    }
  },

  async migrateToBackend() {
    if (!_online) return { migrated: false, reason: 'offline' };
    const results = { migrated: [], skipped: [], errors: [] };
    if (!api) return { migrated: false, reason: 'no-api' };

    const bomRows = null;
    if (bomRows && Array.isArray(bomRows) && bomRows.length > 0) {
      try {
        const existing = await api.parts.list({ limit: 1 });
        if (!existing || !existing.items || existing.items.length === 0) {
          for (const row of bomRows) {
            try {
              await api.parts.create({
                pn: row.pn, name: row.name, rev: row.rev, qty: row.qty,
                uom: row.uom, category: row.category, vendor: row.vendor,
                cost: row.cost, lead: row.lead, origin: row.origin,
                status: row.status, assembly: row.assembly || false,
                material: row.material || '', weight: row.weight,
                dimensions: row.dimensions || '',
              });
              results.migrated.push(row.pn);
            } catch (e) {
              results.errors.push({ pn: row.pn, error: e.message });
            }
          }
        } else {
          results.skipped.push('parts: backend already has data');
        }
      } catch (e) {
        results.errors.push({ domain: 'parts', error: e.message });
      }
    }

    const ecrs = null;
    if (ecrs && Array.isArray(ecrs) && ecrs.length > 0) {
      try {
        for (const ecr of ecrs) {
          try {
            await api.eco.create(ecr);
            results.migrated.push('ecr:' + (ecr.id || ecr.number));
          } catch (e) {
            results.errors.push({ ecr: ecr.id, error: e.message });
          }
        }
      } catch { /* skip */ }
    }

    const templates = null;
    if (templates && Array.isArray(templates) && templates.length > 0) {
      try {
        for (const t of templates) {
          try {
            await api.bomTemplates.create(t);
            results.migrated.push('template:' + t.name);
          } catch (e) {
            results.errors.push({ template: t.name, error: e.message });
          }
        }
      } catch { /* skip */ }
    }

    return results;
  },
};

function getLocal(domain) {
  switch (domain) {
    case 'parts': return null;
    case 'comments': return null;
    case 'approvals': return null;
    case 'notifications': return storage.notifications.get([]);
    case 'savedViews': return storage.savedViews.get();
    case 'templates': return storage.templates.get();
    case 'ecrs': return storage.ecrs.get();
    case 'calendarEvents': return storage.calendarEvents.get();
    case 'workOrders': return null;
    case 'poDrafts': return null;
    case 'documents': return storage.docs.get();
    case 'vendorUsers': return storage.supplierUsers.get();
    case 'savedSearches': return storage.savedSearches.get();
    default: return null;
  }
}

function setLocal(domain, value) {
  switch (domain) {
    case 'parts': break;
    case 'comments': break;
    case 'approvals': break;
    case 'notifications': storage.notifications.set(value); break;
    case 'savedViews': storage.savedViews.set(value); break;
    case 'templates': storage.templates.set(value); break;
    case 'ecrs': storage.ecrs.set(value); break;
    case 'calendarEvents': storage.calendarEvents.set(value); break;
    case 'workOrders': break;
    case 'poDrafts': break;
    case 'documents': storage.docs.set(value); break;
    case 'vendorUsers': storage.supplierUsers.set(value); break;
    case 'savedSearches': storage.savedSearches.set(value); break;
  }
}

window.addEventListener('online', () => { _online = true; notify(); processQueue(); });
window.addEventListener('offline', () => { _online = false; notify(); });

window.__dataService = dataService;
