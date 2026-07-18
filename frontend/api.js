// API Client for Blackbox BOM Management Tool
// ES module with named exports + backward-compatible window.* shims

import config from './src/config.js';

export function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function openPrintWindow(title, bodyHtml, opts) {
  opts = opts || {};
  const w = window.open('', '_blank', opts.features || 'width=900,height=700');
  if (!w) {
    if (window.toast) window.toast('Pop-up blocked — allow pop-ups to print', { kind: 'warn' });
    return null;
  }
  w.document.open();
  w.document.write(bodyHtml);
  w.document.close();
  if (opts.printDelay != null) setTimeout(function() { w.print(); }, opts.printDelay);
  return w;
}

// Derived from config.js (relative '/api/v1' by default so requests go
// through the same reverse proxy that served the page — see config.js —
// overridable via window.__BBOX_CONFIG when the API truly lives elsewhere).
const API_BASE = config.API_BASE;

let _onUnauthorized = null;
export function setOnUnauthorized(fn) { _onUnauthorized = fn; }

const _circuitBreaker = {
  failures: {},
  threshold: 5,
  timeout: 30000,
  isOpen(name) {
    const entry = this.failures[name];
    if (!entry) return false;
    if (entry.count >= this.threshold && Date.now() - entry.lastFailure < this.timeout) return true;
    if (Date.now() - entry.lastFailure >= this.timeout) {
      this.failures[name] = { count: 0, lastFailure: 0 };
    }
    return false;
  },
  recordFailure(name) {
    const entry = this.failures[name] || { count: 0, lastFailure: 0 };
    entry.count++;
    entry.lastFailure = Date.now();
    this.failures[name] = entry;
  },
  recordSuccess(name) {
    this.failures[name] = { count: 0, lastFailure: 0 };
  }
};

function getCSRFToken() {
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]).split('.')[0] : null;
}

// Silent, deduplicated session refresh. Access tokens are short-lived (~30 min)
// while the refresh token lasts far longer, so a 401 usually just means the
// access-token cookie expired. Concurrent 401s share one refresh. Returns:
//   'refreshed'    - new tokens issued; retry the original request
//   'unauthorized' - refresh token genuinely rejected (401/403); session is dead
//   'transient'    - rate limited (429) / 5xx / network error; the session may
//                    still be valid, so DO NOT log out — fail this request soft.
let _refreshPromise = null;
function refreshSession() {
  if (!_refreshPromise) {
    const csrfToken = getCSRFToken();
    _refreshPromise = fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      },
    })
      .then((r) => {
        if (r.ok) return 'refreshed';
        if (r.status === 401 || r.status === 403) return 'unauthorized';
        return 'transient';
      })
      .catch(() => 'transient');
    // Reset once settled so a later expiry can refresh again.
    _refreshPromise.finally(() => { _refreshPromise = null; });
  }
  return _refreshPromise;
}

// Endpoints where a 401 means "these credentials are wrong", not "session
// expired" — never refresh/retry or force a global logout for these.
function _isAuthEntryEndpoint(endpoint) {
  return (
    endpoint.startsWith('/auth/login') ||
    endpoint.startsWith('/auth/register') ||
    endpoint.startsWith('/auth/refresh')
  );
}

export async function apiRequest(endpoint, options = {}, retries = 2, delay = 500) {
  const url = `${API_BASE}${endpoint}`;
  const circuitName = endpoint.split('/')[1] || 'default';

  if (_circuitBreaker.isOpen(circuitName)) {
    throw new Error('Service temporarily unavailable — try again later');
  }

  const method = (options.method || 'GET').toUpperCase();
  const csrfToken = getCSRFToken();

  for (let attempt = 0; attempt <= retries; attempt++) {
    const config = {
      credentials: 'include',
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken && method !== 'GET' ? { 'X-CSRF-Token': csrfToken } : {}),
        ...options.headers,
      },
    };

    try {
      const response = await fetch(url, config);

      if (response.status === 401) {
        // A 401 on a normal endpoint usually means the access-token cookie
        // expired. Try a single silent refresh + retry before treating the
        // session as dead — this is what keeps users logged in across pages.
        // Still fully cookie-based; nothing is read from or written to storage.
        if (!_isAuthEntryEndpoint(endpoint) && !options._retried) {
          const outcome = await refreshSession();
          if (outcome === 'refreshed') {
            return apiRequest(endpoint, { ...options, _retried: true }, retries, delay);
          }
          if (outcome === 'transient') {
            // Refresh couldn't complete (rate limit / 5xx / network). The
            // session may still be valid, so DO NOT log out — fail this one
            // request softly and let the caller retry later.
            throw new Error('Session temporarily unavailable — try again');
          }
          // outcome === 'unauthorized' -> refresh token genuinely rejected;
          // fall through to the global logout below.
        }
        // Session is truly invalid. Only force a global logout for non-entry
        // endpoints (never during a login/register/refresh attempt).
        if (!_isAuthEntryEndpoint(endpoint) && _onUnauthorized) _onUnauthorized();
        throw new Error('Session expired — please sign in again');
      }

      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After') || 5;
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, retryAfter * 1000));
          continue;
        }
      }

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Request failed' }));
        throw new Error(error.detail || `HTTP ${response.status}`);
      }

      _circuitBreaker.recordSuccess(circuitName);

      if (response.status === 204) {
        return null;
      }

      return response.json();
    } catch (e) {
      if (e.message === 'Session expired — please sign in again') throw e;
      if (e.message === 'Session temporarily unavailable — try again') throw e;

      _circuitBreaker.recordFailure(circuitName);

      if (attempt === retries) {
        if (e.message === 'Failed to fetch') {
          throw new Error('Unable to connect to server — please check your connection');
        }
        throw e;
      }

      await new Promise(r => setTimeout(r, delay * (attempt + 1)));
    }
  }
}

// Auth API
export const authAPI = {
  login: async (email, password) => {
    const result = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
      credentials: 'include',
    });
    return result;
  },

  register: async (userData) => {
    const result = await apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
      credentials: 'include',
    });
    return result;
  },

  refresh: async () => {
    const result = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    if (!result.ok) {
      throw new Error('Token refresh failed');
    }
    return result.json();
  },

  logout: async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST', credentials: 'include' });
    } catch (_e) {
      // Ignore errors — best-effort server-side cookie clearing
    }
  },

  getMe: () => apiRequest('/auth/me', { credentials: 'include' }),

  validateToken: async () => {
    try {
      const me = await apiRequest('/auth/me', { credentials: 'include' });
      return me ? true : false;
    } catch {
      return false;
    }
  },
};

// Parts API
export const partsAPI = {
  list: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/parts${query ? '?' + query : ''}`);
  },
  
  get: (id) => apiRequest(`/parts/${id}`),
  
  create: (part) => 
    apiRequest('/parts', {
      method: 'POST',
      body: JSON.stringify(part),
    }),
  
  update: (id, part) => 
    apiRequest(`/parts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(part),
    }),
  
  delete: (id) => 
    apiRequest(`/parts/${id}`, { method: 'DELETE' }),
};

// Projects API
export const projectsAPI = {
  list: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/projects${query ? '?' + query : ''}`);
  },
  
  get: (id) => apiRequest(`/projects/${id}`),
  
  create: (project) => 
    apiRequest('/projects', {
      method: 'POST',
      body: JSON.stringify(project),
    }),
  
  update: (id, project) => 
    apiRequest(`/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(project),
    }),
  
  delete: (id) => 
    apiRequest(`/projects/${id}`, { method: 'DELETE' }),
};

// Vendors API
export const vendorsAPI = {
  list: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/vendors${query ? '?' + query : ''}`);
  },
  
  get: (id) => apiRequest(`/vendors/${id}`),
  
  create: (vendor) => 
    apiRequest('/vendors', {
      method: 'POST',
      body: JSON.stringify(vendor),
    }),
  
  update: (id, vendor) => 
    apiRequest(`/vendors/${id}`, {
      method: 'PUT',
      body: JSON.stringify(vendor),
    }),
  
  delete: (id) => 
    apiRequest(`/vendors/${id}`, { method: 'DELETE' }),
};

// Procurement API
export const procurementAPI = {
  list: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/procurement${query ? '?' + query : ''}`);
  },
  
  get: (id) => apiRequest(`/procurement/${id}`),
  
  create: (order) => 
    apiRequest('/procurement', {
      method: 'POST',
      body: JSON.stringify(order),
    }),
  
  update: (id, order) => 
    apiRequest(`/procurement/${id}`, {
      method: 'PUT',
      body: JSON.stringify(order),
    }),
  
  advance: (id, action) => 
    apiRequest(`/procurement/${id}/advance`, {
      method: 'POST',
      body: JSON.stringify(action ? { action } : {}),
    }),
  
  alerts: () => apiRequest('/procurement/alerts'),
  
  delete: (id) => 
    apiRequest(`/procurement/${id}`, { method: 'DELETE' }),
};

// Documents API
export const documentsAPI = {
  list: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/documents${query ? '?' + query : ''}`);
  },
  
  folders: () => apiRequest('/documents/folders'),
  
  get: (id) => apiRequest(`/documents/${id}`),
  
  versions: (id) => apiRequest(`/documents/${id}/versions`),
  
  upload: async (file, metadata = {}) => {
    const formData = new FormData();
    formData.append('file', file);
    if (metadata.category) formData.append('category', metadata.category);
    if (metadata.tags) formData.append('tags', metadata.tags);
    if (metadata.partId) formData.append('partId', metadata.partId);
    if (metadata.projectId) formData.append('projectId', metadata.projectId);
    if (metadata.accessLevel) formData.append('accessLevel', metadata.accessLevel);
    
    const response = await fetch(API_BASE + '/documents/upload', {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Upload failed' }));
      throw new Error(error.detail || `HTTP ${response.status}`);
    }
    return response.json();
  },
  
  update: (id, doc) => 
    apiRequest(`/documents/${id}`, {
      method: 'PUT',
      body: JSON.stringify(doc),
    }),
  
  delete: (id) => 
    apiRequest(`/documents/${id}`, { method: 'DELETE' }),
};

// Users API
export const usersAPI = {
  list: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/users${query ? '?' + query : ''}`);
  },
  
  get: (id) => apiRequest(`/users/${id}`),
  
  create: (user) => 
    apiRequest('/users', {
      method: 'POST',
      body: JSON.stringify(user),
    }),
  
  update: (id, user) => 
    apiRequest(`/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(user),
    }),
  
  delete: (id) => 
    apiRequest(`/users/${id}`, { method: 'DELETE' }),
};

// Notifications API
export const notificationsAPI = {
  list: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/notifications${query ? '?' + query : ''}`);
  },
  
  update: (id, data) => 
    apiRequest(`/notifications/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  
  delete: (id) => 
    apiRequest(`/notifications/${id}`, { method: 'DELETE' }),
};

// Comments API
export const commentsAPI = {
  list: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/comments${query ? '?' + query : ''}`);
  },
  
  create: (comment) => 
    apiRequest('/comments', {
      method: 'POST',
      body: JSON.stringify(comment),
    }),
  
  update: (id, comment) => 
    apiRequest(`/comments/${id}`, {
      method: 'PUT',
      body: JSON.stringify(comment),
    }),
  
  delete: (id) => 
    apiRequest(`/comments/${id}`, { method: 'DELETE' }),
};

// Approvals API
export const approvalsAPI = {
  list: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/approvals${query ? '?' + query : ''}`);
  },
  
  create: (approval) => 
    apiRequest('/approvals', {
      method: 'POST',
      body: JSON.stringify(approval),
    }),
  
  update: (id, data) => 
    apiRequest(`/approvals/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
};

// Audit Logs API
export const auditLogsAPI = {
  list: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/audit-logs${query ? '?' + query : ''}`);
  },
  
  create: (log) => 
    apiRequest('/audit-logs', {
      method: 'POST',
      body: JSON.stringify(log),
    }),
};

// Price History API
export const priceHistoryAPI = {
  list: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/price-history${query ? '?' + query : ''}`);
  },
  
  create: (price) => 
    apiRequest('/price-history', {
      method: 'POST',
      body: JSON.stringify(price),
    }),
};

// Revisions API
export const revisionsAPI = {
  list: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/revisions${query ? '?' + query : ''}`);
  },
  
  get: (id) => apiRequest(`/revisions/${id}`),
  
  create: (revision) => 
    apiRequest('/revisions', {
      method: 'POST',
      body: JSON.stringify(revision),
    }),
};

// BOM Templates API
export const bomTemplatesAPI = {
  list: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/bom-templates${query ? '?' + query : ''}`);
  },
  
  get: (id) => apiRequest(`/bom-templates/${id}`),
  
  create: (template) => 
    apiRequest('/bom-templates', {
      method: 'POST',
      body: JSON.stringify(template),
    }),
  
  update: (id, template) => 
    apiRequest(`/bom-templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(template),
    }),
  
  delete: (id) => 
    apiRequest(`/bom-templates/${id}`, { method: 'DELETE' }),
  
  load: (id) => apiRequest(`/bom-templates/${id}/load`, { method: 'POST' }),
};

// Part Vendors API (multi-vendor per part)
export const partVendorsAPI = {
  list: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/part-vendors${query ? '?' + query : ''}`);
  },
  
  create: (partVendor) => 
    apiRequest('/part-vendors', {
      method: 'POST',
      body: JSON.stringify(partVendor),
    }),
  
  update: (id, data) => 
    apiRequest(`/part-vendors/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  
  delete: (id) => 
    apiRequest(`/part-vendors/${id}`, { method: 'DELETE' }),
};

// Country History API
export const countryHistoryAPI = {
  getPartHistory: (partId) => apiRequest(`/country-history/parts/${partId}/country-history`),
  
  addEntry: (partId, entry) => 
    apiRequest(`/country-history/parts/${partId}/country-history`, {
      method: 'POST',
      body: JSON.stringify(entry),
    }),
  
  updateHistory: (partId, history) => 
    apiRequest(`/country-history/parts/${partId}/country-history`, {
      method: 'PUT',
      body: JSON.stringify({ countryHistory: history }),
    }),
  
  deleteEntry: (partId, index) => 
    apiRequest(`/country-history/parts/${partId}/country-history/${index}`, { method: 'DELETE' }),
  
  getStatsByCountry: () => apiRequest('/country-history/stats/by-country'),
};

// Barcodes API
export const barcodesAPI = {
  generate: async (partId, format = 'code128') => {
    return apiRequest(`/barcodes/generate/${partId}?format=${format}`);
  },
  
  lookup: async (barcode) => {
    return apiRequest(`/barcodes/lookup/${barcode}`);
  },
  
  assign: async (partId) => {
    return apiRequest(`/barcodes/assign/${partId}`, {
      method: 'POST',
    });
  },
  
  batchGenerate: async (partIds) => {
    const idsStr = partIds.join(',');
    return apiRequest(`/barcodes/batch-generate?part_ids=${idsStr}`);
  },
};

// OCR API
export const ocrAPI = {
  upload: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch(API_BASE + '/ocr/extract-file', {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Upload failed' }));
      throw new Error(error.detail || `HTTP ${response.status}`);
    }
    return response.json();
  },

  extract: (documentId, partId) => 
    apiRequest('/ocr/extract', {
      method: 'POST',
      body: JSON.stringify({ documentId, partId }),
    }),
  
  confirm: (partId, fields) => 
    apiRequest('/ocr/confirm', {
      method: 'POST',
      body: JSON.stringify({ partId, fields }),
    }),
};

// Health check
export const healthAPI = {
  check: () => apiRequest('/health'),
};

// Analytics API
export const analyticsAPI = {
  dashboard: () => apiRequest('/analytics/dashboard'),
  trends: (range_) => apiRequest(`/analytics/trends?range_=${range_ || '6mo'}`),
  categories: () => apiRequest('/analytics/categories'),
};

// CAD API
export const cadAPI = {
  sync: (data = {}) => apiRequest('/cad/sync', { method: 'POST', body: JSON.stringify(data) }),
  applySync: (changes = []) => apiRequest('/cad/apply-sync', { method: 'POST', body: JSON.stringify(changes) }),
  extractAttrs: (data) => apiRequest('/cad/extract-attrs', { method: 'POST', body: JSON.stringify(data) }),
  vaultStats: () => apiRequest('/cad/vault/stats'),
  vaultTree: () => apiRequest('/cad/vault/tree'),
};

// Scraping API
export const scrapingAPI = {
  scrape: (url, mode) => apiRequest('/scraping/scrape', { method: 'POST', body: JSON.stringify({ url, mode: mode || 'auto' }) }),
  history: () => apiRequest('/scraping/history'),
};

// PO Orders API (from Excel import)
export const poOrdersAPI = {
  list: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/po-orders${query ? '?' + query : ''}`);
  },
  get: (id) => apiRequest(`/po-orders/${id}`),
  stats: () => apiRequest('/po-orders/stats'),
};

// Phase 3 — Supply Chain Depth APIs

// Make vs. Buy
export const makeVsBuyAPI = {
  list: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiRequest(`/make-vs-buy${q ? '?' + q : ''}`);
  },
  get: (id) => apiRequest(`/make-vs-buy/${id}`),
  create: (data) => apiRequest('/make-vs-buy', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => apiRequest(`/make-vs-buy/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => apiRequest(`/make-vs-buy/${id}`, { method: 'DELETE' }),
  approve: (id) => apiRequest(`/make-vs-buy/${id}/approve`, { method: 'POST' }),
};

// Should-Cost
export const shouldCostAPI = {
  list: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiRequest(`/should-cost${q ? '?' + q : ''}`);
  },
  get: (id) => apiRequest(`/should-cost/${id}`),
  create: (data) => apiRequest('/should-cost', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => apiRequest(`/should-cost/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => apiRequest(`/should-cost/${id}`, { method: 'DELETE' }),
};

// Supplier Scorecard
export const supplierScorecardAPI = {
  list: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiRequest(`/supplier-scorecards${q ? '?' + q : ''}`);
  },
  get: (id) => apiRequest(`/supplier-scorecards/${id}`),
  create: (data) => apiRequest('/supplier-scorecards', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => apiRequest(`/supplier-scorecards/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => apiRequest(`/supplier-scorecards/${id}`, { method: 'DELETE' }),
};

// CAPA
export const capaAPI = {
  list: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiRequest(`/capas${q ? '?' + q : ''}`);
  },
  get: (id) => apiRequest(`/capas/${id}`),
  create: (data) => apiRequest('/capas', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => apiRequest(`/capas/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => apiRequest(`/capas/${id}`, { method: 'DELETE' }),
  verify: (id, result) => apiRequest(`/capas/${id}/verify?result=${result}`, { method: 'POST' }),
};

// FAI (First Article Inspection)
export const faiAPI = {
  list: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiRequest(`/fai${q ? '?' + q : ''}`);
  },
  get: (id) => apiRequest(`/fai/${id}`),
  create: (data) => apiRequest('/fai', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => apiRequest(`/fai/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => apiRequest(`/fai/${id}`, { method: 'DELETE' }),
  submit: (id) => apiRequest(`/fai/${id}/submit`, { method: 'POST' }),
  approve: (id, type) => apiRequest(`/fai/${id}/approve?approvalType=${type}`, { method: 'POST' }),
};

// Deviation / Waiver
export const deviationAPI = {
  list: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiRequest(`/deviations${q ? '?' + q : ''}`);
  },
  get: (id) => apiRequest(`/deviations/${id}`),
  create: (data) => apiRequest('/deviations', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => apiRequest(`/deviations/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => apiRequest(`/deviations/${id}`, { method: 'DELETE' }),
  submit: (id) => apiRequest(`/deviations/${id}/submit`, { method: 'POST' }),
  approve: (id, type, name) => apiRequest(`/deviations/${id}/approve?approvalType=${type}&approverName=${encodeURIComponent(name || '')}`, { method: 'POST' }),
};

// Traceability (Serial/Lot/Batch)
export const traceabilityAPI = {
  serialNumbers: {
    list: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return apiRequest(`/traceability/serial-numbers${q ? '?' + q : ''}`);
    },
    get: (id) => apiRequest(`/traceability/serial-numbers/${id}`),
    lookup: (sn) => apiRequest(`/traceability/serial-numbers/lookup/${encodeURIComponent(sn)}`),
    create: (data) => apiRequest('/traceability/serial-numbers', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => apiRequest(`/traceability/serial-numbers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  },
  lots: {
    list: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return apiRequest(`/traceability/lots${q ? '?' + q : ''}`);
    },
    get: (id) => apiRequest(`/traceability/lots/${id}`),
    create: (data) => apiRequest('/traceability/lots', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => apiRequest(`/traceability/lots/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  },
};

// Kanban Triggers
export const kanbanAPI = {
  list: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiRequest(`/kanban${q ? '?' + q : ''}`);
  },
  get: (id) => apiRequest(`/kanban/${id}`),
  create: (data) => apiRequest('/kanban', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => apiRequest(`/kanban/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => apiRequest(`/kanban/${id}`, { method: 'DELETE' }),
  lowStockAlerts: () => apiRequest('/kanban/alerts/low-stock'),
  updateStock: (id, qty) => apiRequest(`/kanban/${id}/update-stock?quantityChange=${qty}`, { method: 'POST' }),
};

// Contracts & Pricing
export const contractAPI = {
  list: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiRequest(`/contracts${q ? '?' + q : ''}`);
  },
  get: (id) => apiRequest(`/contracts/${id}`),
  create: (data) => apiRequest('/contracts', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => apiRequest(`/contracts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => apiRequest(`/contracts/${id}`, { method: 'DELETE' }),
  pricing: (contractId, partId) => {
    const q = partId ? `?partId=${partId}` : '';
    return apiRequest(`/contracts/${contractId}/pricing${q}`);
  },
  createPricingAgreement: (data) => apiRequest('/contracts/pricing-agreements', { method: 'POST', body: JSON.stringify(data) }),
  updatePricingAgreement: (id, data) => apiRequest(`/contracts/pricing-agreements/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePricingAgreement: (id) => apiRequest(`/contracts/pricing-agreements/${id}`, { method: 'DELETE' }),
};

// Order Tracking
export const orderTrackingAPI = {
  list: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiRequest(`/order-tracking${q ? '?' + q : ''}`);
  },
  get: (id) => apiRequest(`/order-tracking/${id}`),
  getByPo: (poId) => apiRequest(`/order-tracking/by-po/${poId}`),
  stats: () => apiRequest('/order-tracking/stats'),
  create: (data) => apiRequest('/order-tracking', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => apiRequest(`/order-tracking/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  advance: (id) => apiRequest(`/order-tracking/${id}/advance`, { method: 'POST' }),
  delete: (id) => apiRequest(`/order-tracking/${id}`, { method: 'DELETE' }),
  addShipmentUpdate: (id, data) => apiRequest(`/order-tracking/${id}/shipment-updates`, { method: 'POST', body: JSON.stringify(data) }),
};

// Phase 4 — Integration APIs

// Webhooks
export const webhooksAPI = {
  list: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiRequest(`/webhooks${q ? '?' + q : ''}`);
  },
  get: (id) => apiRequest(`/webhooks/${id}`),
  create: (data) => apiRequest('/webhooks', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => apiRequest(`/webhooks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => apiRequest(`/webhooks/${id}`, { method: 'DELETE' }),
  test: (id) => apiRequest(`/webhooks/${id}/test`, { method: 'POST' }),
  deliveries: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiRequest(`/webhooks/deliveries${q ? '?' + q : ''}`);
  },
  retry: (deliveryId) => apiRequest(`/webhooks/retry/${deliveryId}`, { method: 'POST' }),
};

// Bulk Import
export const bulkImportAPI = {
  upload: async (file, mappingConfig) => {
    const formData = new FormData();
    formData.append('file', file);
    if (mappingConfig) formData.append('mappingConfig', JSON.stringify(mappingConfig));
    const response = await fetch(API_BASE + '/import/upload', {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
    if (!response.ok) throw new Error('Upload failed');
    return response.json();
  },
  process: (jobId, mappingConfig) => apiRequest(`/import/${jobId}/process`, { method: 'POST', body: JSON.stringify({ mappingConfig }) }),
  status: (jobId) => apiRequest(`/import/${jobId}/status`),
  errors: (jobId) => apiRequest(`/import/${jobId}/errors`),
};

// ERP Connectors
export const erpConnectorsAPI = {
  list: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiRequest(`/erp-connectors${q ? '?' + q : ''}`);
  },
  get: (id) => apiRequest(`/erp-connectors/${id}`),
  create: (data) => apiRequest('/erp-connectors', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => apiRequest(`/erp-connectors/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => apiRequest(`/erp-connectors/${id}`, { method: 'DELETE' }),
  sync: (id) => apiRequest(`/erp-connectors/${id}/sync`, { method: 'POST' }),
  logs: (id, params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiRequest(`/erp-connectors/${id}/logs${q ? '?' + q : ''}`);
  },
  testConnection: (id) => apiRequest(`/erp-connectors/${id}/test-connection`, { method: 'POST' }),
};

// BOM Enterprise API
export const bomEnterpriseAPI = {
  explosion: (bomId, level = 10) => apiRequest(`/bom/${bomId}/explosion?level=${level}`),
  quantityRollup: (bomId) => apiRequest(`/bom/${bomId}/quantity-rollup`),
  costRollup: (bomId) => apiRequest(`/bom/${bomId}/cost-rollup`),
  whereUsed: (partId) => apiRequest(`/bom/where-used/${partId}`),
  whereUsedTree: (partId) => apiRequest(`/bom/where-used/${partId}/tree`),
  compare: (bomId1, bomId2) => apiRequest('/bom/compare', { method: 'POST', body: JSON.stringify({ bom_id_1: bomId1, bom_id_2: bomId2 }) }),
  // Canonical instance-BOM line CRUD (table `bom_items_master`, scoped by
  // bom_id + tenant — see app/services/bom_service.py + app/api/endpoints/
  // bom_enterprise.py). This is distinct from the older `/bom-items` client
  // (`bomItemsAPI` below), which persists to the `bom_items` table tied to
  // reusable BOM *templates*, not a specific instance BOM, and has no
  // find_number field. Structural BOM-editor operations (add/edit qty-refdes-
  // find-number/delete/reorder a line) must go through `items` here so they
  // land in bom_items_master, not the global Part record.
  items: {
    list: (bomId) => apiRequest(`/bom/${bomId}/items`),
    create: (bomId, data) => apiRequest(`/bom/${bomId}/items`, { method: 'POST', body: JSON.stringify(data) }),
    update: (bomId, itemId, data) => apiRequest(`/bom/${bomId}/items/${itemId}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (bomId, itemId) => apiRequest(`/bom/${bomId}/items/${itemId}`, { method: 'DELETE' }),
    reorder: (bomId, itemIds) => apiRequest(`/bom/${bomId}/items/reorder`, { method: 'POST', body: JSON.stringify({ item_ids: itemIds }) }),
  },
  snapshots: {
    list: (bomId) => apiRequest(`/bom/${bomId}/snapshots`),
    create: (bomId, data) => apiRequest(`/bom/${bomId}/snapshots`, { method: 'POST', body: JSON.stringify(data) }),
  },
  baselines: {
    create: (bomId, name) => apiRequest(`/bom/${bomId}/baselines?baseline_name=${encodeURIComponent(name)}`, { method: 'POST' }),
  },
  variants: {
    create: (data) => apiRequest('/bom/variants', { method: 'POST', body: JSON.stringify(data) }),
    get: (id) => apiRequest(`/bom/variants/${id}`),
    addItem: (data) => apiRequest('/bom/variants/items', { method: 'POST', body: JSON.stringify(data) }),
  },
  templates: {
    list: () => apiRequest('/bom/templates'),
    create: (name, description, sourceBomId) => {
      let q = `name=${encodeURIComponent(name)}`;
      if (description) q += `&description=${encodeURIComponent(description)}`;
      if (sourceBomId) q += `&source_bom_id=${sourceBomId}`;
      return apiRequest(`/bom/templates?${q}`, { method: 'POST' });
    },
    apply: (templateId, projectId) => apiRequest(`/bom/templates/${templateId}/apply?project_id=${projectId}`, { method: 'POST' }),
  },
  export: (bomId, format = 'csv') => apiRequest(`/bom/${bomId}/export?format=${format}`, { method: 'POST' }),
  import: (fileUrl, projectId, format = 'csv') => apiRequest('/bom/import?file_url=' + encodeURIComponent(fileUrl) + '&project_id=' + projectId + '&format=' + format, { method: 'POST' }),
};

// Supplier Portal
export const supplierPortalAPI = {
  login: (email, password) => apiRequest('/supplier-portal/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  listUsers: () => apiRequest('/supplier-portal/users'),
  createUser: (data) => apiRequest('/supplier-portal/users', { method: 'POST', body: JSON.stringify(data) }),
  listPriceUpdates: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiRequest(`/supplier-portal/price-updates${q ? '?' + q : ''}`);
  },
  submitPriceUpdate: (data) => apiRequest('/supplier-portal/price-updates', { method: 'POST', body: JSON.stringify(data) }),
  approvePriceUpdate: (id) => apiRequest(`/supplier-portal/price-updates/${id}/approve`, { method: 'PUT' }),
  rejectPriceUpdate: (id) => apiRequest(`/supplier-portal/price-updates/${id}/reject`, { method: 'PUT' }),
  // RFQ workflow
  listRfqs: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiRequest(`/supplier-portal/rfqs${q ? '?' + q : ''}`);
  },
  createRfq: (data) => apiRequest('/supplier-portal/rfqs', { method: 'POST', body: JSON.stringify(data) }),
  getRfq: (id) => apiRequest(`/supplier-portal/rfqs/${id}`),
  submitRfqResponse: (id, data) => apiRequest(`/supplier-portal/rfqs/${id}/respond`, { method: 'POST', body: JSON.stringify(data) }),
  awardRfq: (id, supplierId) => apiRequest(`/supplier-portal/rfqs/${id}/award?supplier_id=${supplierId}`, { method: 'POST' }),
};

// Phase 5 — Monitoring
export const monitoringAPI = {
  metrics: () => apiRequest('/metrics'),
  healthDetailed: () => apiRequest('/health/detailed'),
};

// Phase 6 — AI & Automation
export const aiAPI = {
  demandForecast: {
    generate: (params = {}) => apiRequest('/ai/demand-forecast/generate', { method: 'POST', body: JSON.stringify(params) }),
    list: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return apiRequest(`/ai/demand-forecast${q ? '?' + q : ''}`);
    },
  },
  interchangeability: {
    analyze: (params = {}) => apiRequest('/ai/interchangeability/analyze', { method: 'POST', body: JSON.stringify(params) }),
    list: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return apiRequest(`/ai/interchangeability${q ? '?' + q : ''}`);
    },
  },
  validation: {
    run: (params = {}) => apiRequest('/ai/validation/run', { method: 'POST', body: JSON.stringify(params) }),
    results: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return apiRequest(`/ai/validation/results${q ? '?' + q : ''}`);
    },
  },
};

// Compliance API (ISO 9001, AS9100, RoHS, REACH)
// Backend mounts the compliance router under the /compliance prefix and its
// routes are themselves /compliance/... , so the effective base is doubled:
// /compliance/compliance.
export const complianceAPI = {
  list: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiRequest(`/compliance/compliance${q ? '?' + q : ''}`);
  },
  create: (data) => apiRequest('/compliance/compliance', { method: 'POST', body: JSON.stringify(data) }),
  get: (id) => apiRequest(`/compliance/compliance/${id}`),
  update: (id, data) => apiRequest(`/compliance/compliance/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => apiRequest(`/compliance/compliance/${id}`, { method: 'DELETE' }),
  packs: {
    list: () => apiRequest('/compliance/compliance/packs'),
    get: (id) => apiRequest(`/compliance/compliance/packs/${id}`),
    create: (data) => apiRequest('/compliance/compliance/packs', { method: 'POST', body: JSON.stringify(data) }),
  },
  parts: {
    status: (partId) => apiRequest(`/compliance/compliance/parts/${partId}`),
    certify: (partId, data) => apiRequest(`/compliance/compliance/parts/${partId}/certify`, { method: 'POST', body: JSON.stringify(data) }),
  },
  dashboard: () => apiRequest('/compliance/compliance/dashboard'),
};

// Production Scheduling API
export const schedulingAPI = {
  workCenters: {
    list: () => apiRequest('/manufacturing/work-centers'),
    create: (data) => apiRequest('/manufacturing/work-centers', { method: 'POST', body: JSON.stringify(data) }),
    capacity: () => apiRequest('/manufacturing/work-centers/capacity'),
  },
  schedules: {
    list: () => apiRequest('/manufacturing/schedules'),
    create: (data) => apiRequest('/manufacturing/schedules', { method: 'POST', body: JSON.stringify(data) }),
  },
  laborRates: {
    list: () => apiRequest('/manufacturing/labor-rates'),
    create: (data) => apiRequest('/manufacturing/labor-rates', { method: 'POST', body: JSON.stringify(data) }),
  },
  timesheets: {
    list: () => apiRequest('/manufacturing/timesheets'),
    create: (data) => apiRequest('/manufacturing/timesheets', { method: 'POST', body: JSON.stringify(data) }),
    laborCost: () => apiRequest('/manufacturing/timesheets/labor-cost'),
  },
};

export const approvalAutomationAPI = {
  listRules: () => apiRequest('/approval-automation/rules'),
  createRule: (data) => apiRequest('/approval-automation/rules', { method: 'POST', body: JSON.stringify(data) }),
  updateRule: (id, data) => apiRequest(`/approval-automation/rules/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteRule: (id) => apiRequest(`/approval-automation/rules/${id}`, { method: 'DELETE' }),
  evaluate: (data) => apiRequest('/approval-automation/evaluate', { method: 'POST', body: JSON.stringify(data) }),
  evaluateById: (id) => apiRequest(`/approval-automation/evaluate/${id}`, { method: 'POST' }),
};

// Work Orders API
export const workOrdersAPI = {
  list: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiRequest(`/work-orders${q ? '?' + q : ''}`);
  },
  get: (id) => apiRequest(`/work-orders/${id}`),
  create: (data) => apiRequest('/work-orders', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => apiRequest(`/work-orders/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => apiRequest(`/work-orders/${id}`, { method: 'DELETE' }),
  advance: (id) => apiRequest(`/work-orders/${id}/advance`, { method: 'POST' }),
  materials: (id) => apiRequest(`/work-orders/${id}/materials`),
  operations: (id) => apiRequest(`/work-orders/${id}/operations`),
};

// ECO/ECR API
export const ecoAPI = {
  list: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiRequest(`/eco${q ? '?' + q : ''}`);
  },
  get: (id) => apiRequest(`/eco/${id}`),
  create: (data) => apiRequest('/eco', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => apiRequest(`/eco/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => apiRequest(`/eco/${id}`, { method: 'DELETE' }),
  // Canonical guarded state-transition endpoint (app.services.eco_service.
  // perform_eco_action). action: 'submit'|'approve'|'reject'|'implement'|
  // 'close'. 'approve'/'implement' require { password, signature_meaning } —
  // a 21 CFR Part 11 password-re-authenticated electronic signature — and
  // the backend rejects (401/403/409) without mutating state on failure.
  action: (id, data) => apiRequest(`/eco/${id}/action`, { method: 'POST', body: JSON.stringify(data) }),
  approve: (id, data) => apiRequest(`/eco/${id}/approve`, { method: 'POST', body: JSON.stringify(data) }),
  reject: (id, reason) => apiRequest(`/eco/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
  changes: (id) => apiRequest(`/eco/${id}/changes`),
  notifications: (id) => apiRequest(`/eco/${id}/notifications`),
  impact: (id) => apiRequest(`/eco/${id}/impact`),
  addItem: (id, data) => apiRequest(`/eco/${id}/items`, { method: 'POST', body: JSON.stringify(data) }),
};

// 21 CFR Part 11 — electronic signatures. Read-only (write-once, created
// only by app.services.part11_service.sign_action as a side effect of a
// guarded action such as eco.action). Admin-gated on the backend.
export const esignatureAPI = {
  list: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiRequest(`/esignatures/${q ? '?' + q : ''}`);
  },
};

// RoHS/REACH substance compliance — substance catalog, per-part
// composition declarations, and the two read-only derivation endpoints
// (part compliance status, BOM-wide compliance rollup).
export const substanceComplianceAPI = {
  substances: {
    list: () => apiRequest('/substance-compliance/substances'),
    get: (id) => apiRequest(`/substance-compliance/substances/${id}`),
    create: (data) => apiRequest('/substance-compliance/substances', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => apiRequest(`/substance-compliance/substances/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => apiRequest(`/substance-compliance/substances/${id}`, { method: 'DELETE' }),
  },
  partComposition: {
    list: (partId) => apiRequest(`/substance-compliance/parts/${partId}/composition`),
    add: (partId, data) => apiRequest(`/substance-compliance/parts/${partId}/composition`, { method: 'POST', body: JSON.stringify(data) }),
    update: (partId, rowId, data) => apiRequest(`/substance-compliance/parts/${partId}/composition/${rowId}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (partId, rowId) => apiRequest(`/substance-compliance/parts/${partId}/composition/${rowId}`, { method: 'DELETE' }),
  },
  partCompliance: (partId) => apiRequest(`/substance-compliance/parts/${partId}/compliance`),
  bomCompliance: (bomId) => apiRequest(`/substance-compliance/bom/${bomId}/compliance`),
};

// Inventory API — backend is resource-specific (stock / warehouses /
// bin-locations / transactions / reports), not a generic /inventory CRUD.
export const inventoryAPI = {
  list: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiRequest(`/inventory/stock${q ? '?' + q : ''}`);
  },
  transactions: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiRequest(`/inventory/transactions${q ? '?' + q : ''}`);
  },
  reservations: () => apiRequest('/inventory/reservations'),
  adjust: (data) => apiRequest('/inventory/adjust', { method: 'POST', body: JSON.stringify(data) }),
  reserve: (data) => apiRequest('/inventory/reserve', { method: 'POST', body: JSON.stringify(data) }),
  transfer: (data) => apiRequest('/inventory/transfer', { method: 'POST', body: JSON.stringify(data) }),
  warehouses: {
    list: () => apiRequest('/inventory/warehouses'),
    create: (data) => apiRequest('/inventory/warehouses', { method: 'POST', body: JSON.stringify(data) }),
  },
  binLocations: {
    list: () => apiRequest('/inventory/bin-locations'),
    create: (data) => apiRequest('/inventory/bin-locations', { method: 'POST', body: JSON.stringify(data) }),
  },
  reports: {
    stockSummary: () => apiRequest('/inventory/reports/stock-summary'),
    stockValuation: () => apiRequest('/inventory/reports/stock-valuation'),
  },
};

// Quality API — matches backend routes: /quality/ncrs, inspection-plans,
// inspection-records, and reports.
export const qualityAPI = {
  ncr: {
    list: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return apiRequest(`/quality/ncrs${q ? '?' + q : ''}`);
    },
    get: (id) => apiRequest(`/quality/ncrs/${id}`),
    create: (data) => apiRequest('/quality/ncrs', { method: 'POST', body: JSON.stringify(data) }),
    action: (id, data) => apiRequest(`/quality/ncrs/${id}/action`, { method: 'POST', body: JSON.stringify(data) }),
    capa: (id) => apiRequest(`/quality/ncrs/${id}/capa`),
  },
  inspectionPlans: {
    list: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return apiRequest(`/quality/inspection-plans${q ? '?' + q : ''}`);
    },
    get: (id) => apiRequest(`/quality/inspection-plans/${id}`),
    create: (data) => apiRequest('/quality/inspection-plans', { method: 'POST', body: JSON.stringify(data) }),
  },
  inspectionRecords: {
    list: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return apiRequest(`/quality/inspection-records${q ? '?' + q : ''}`);
    },
    create: (data) => apiRequest('/quality/inspection-records', { method: 'POST', body: JSON.stringify(data) }),
  },
  reports: {
    capaEffectiveness: () => apiRequest('/quality/reports/capa-effectiveness'),
    defectSummary: () => apiRequest('/quality/reports/defect-summary'),
    supplierQuality: () => apiRequest('/quality/reports/supplier-quality'),
  },
};

// User Data Sync API (localStorage → PostgreSQL bridge)
export const userDataSyncAPI = {
  getDataStore: () => apiRequest('/user-sync/data-store'),
  getDataStoreEntry: (key) => apiRequest(`/user-sync/data-store/${key}`),
  upsertDataStore: (key, value) => apiRequest(`/user-sync/data-store/${key}`, {
    method: 'PUT', body: JSON.stringify({ data_key: key, data_value: value }),
  }),
  deleteDataStore: (key) => apiRequest(`/user-sync/data-store/${key}`, { method: 'DELETE' }),
  syncAll: (data) => apiRequest('/user-sync/sync-all', { method: 'POST', body: JSON.stringify(data) }),
  exportAll: () => apiRequest('/user-sync/export-all'),
  getPreferences: () => apiRequest('/user-sync/preferences'),
  upsertPreference: (key, value, type = 'string') => apiRequest(`/user-sync/preferences/${key}`, {
    method: 'PUT', body: JSON.stringify({ pref_key: key, pref_value: String(value), pref_type: type }),
  }),
  getChecklist: () => apiRequest('/user-sync/checklist'),
  updateChecklist: (completedItems, dismissed = false) => apiRequest('/user-sync/checklist', {
    method: 'PUT', body: JSON.stringify({ completed_items: completedItems, dismissed }),
  }),
  getBomDraft: (name = 'default') => apiRequest(`/user-sync/bom-draft?draft_name=${name}`),
  saveBomDraft: (rows, conversionRate = 83) => apiRequest('/user-sync/bom-draft', {
    method: 'PUT', body: JSON.stringify({ draft_name: 'default', rows_data: rows, conversion_rate: conversionRate }),
  }),
  getScanHistory: (limit = 50) => apiRequest(`/user-sync/scan-history?limit=${limit}`),
  addScanEntry: (barcode, result = null) => apiRequest('/user-sync/scan-history', {
    method: 'POST', body: JSON.stringify({ barcode_data: barcode, scan_result: result }),
  }),
  getSavedSearches: () => apiRequest('/user-sync/saved-searches'),
  saveSearch: (name, params, isDefault = false) => apiRequest(`/user-sync/saved-searches/${name}`, {
    method: 'PUT', body: JSON.stringify({ search_name: name, search_params: params, is_default: isDefault }),
  }),
  deleteSearch: (name) => apiRequest(`/user-sync/saved-searches/${encodeURIComponent(name)}`, { method: 'DELETE' }),
};

// Calendar Events API
export const calendarEventsAPI = {
  list: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiRequest(`/calendar/calendar-events${q ? '?' + q : ''}`);
  },
  create: (data) => apiRequest('/calendar/calendar-events', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => apiRequest(`/calendar/calendar-events/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => apiRequest(`/calendar/calendar-events/${id}`, { method: 'DELETE' }),
};

/* ── Backward-compatible window.* shims ── */
// These allow existing code (app.jsx, screens, etc.) to work without changes.
// New code should import directly from this module.

window.escapeHtml = escapeHtml;
window.openPrintWindow = openPrintWindow;
window.__setOnUnauthorized = setOnUnauthorized;
window.apiRequest = apiRequest;

export const tenantsAPI = {
  list: (params = {}) => {
    const query = params instanceof URLSearchParams ? params.toString() : new URLSearchParams(params).toString();
    return apiRequest(`/tenants${query ? '?' + query : ''}`);
  },
  get: (id) => apiRequest(`/tenants/${id}`),
  create: (data) =>
    apiRequest('/tenants', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) =>
    apiRequest(`/tenants/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) =>
    apiRequest(`/tenants/${id}`, { method: 'DELETE' }),
  users: (tenantId) =>
    apiRequest(`/tenants/${tenantId}/users`),
  inviteUser: (tenantId, data) =>
    apiRequest(`/tenants/${tenantId}/users`, { method: 'POST', body: JSON.stringify(data) }),
  transferUser: (tenantId, userId) =>
    apiRequest(`/tenants/${tenantId}/users/${userId}/transfer`, { method: 'PUT' }),
};

// BOM Items API
export const bomItemsAPI = {
  list: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/bom-items${query ? '?' + query : ''}`);
  },
  
  get: (id) => apiRequest(`/bom-items/${id}`),
  
  create: (item) => 
    apiRequest('/bom-items', {
      method: 'POST',
      body: JSON.stringify(item),
    }),
  
  update: (id, item) => 
    apiRequest(`/bom-items/${id}`, {
      method: 'PUT',
      body: JSON.stringify(item),
    }),
  
  delete: (id) => 
    apiRequest(`/bom-items/${id}`, { method: 'DELETE' }),
    
  bulkCreate: (items) =>
    apiRequest('/bom-items/bulk', {
      method: 'POST',
      body: JSON.stringify({ items }),
    }),
    
  bulkDelete: (ids) =>
    apiRequest('/bom-items/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),
    
  reorder: (templateId, itemIds) =>
    apiRequest(`/bom-items/${templateId}/reorder`, {
      method: 'POST',
      body: JSON.stringify(itemIds),
    }),
};

export const api = {
  auth: authAPI,
  tenants: tenantsAPI,
  parts: partsAPI,
  projects: projectsAPI,
  vendors: vendorsAPI,
  procurement: procurementAPI,
  documents: documentsAPI,
  users: usersAPI,
  notifications: notificationsAPI,
  comments: commentsAPI,
  approvals: approvalsAPI,
  auditLogs: auditLogsAPI,
  priceHistory: priceHistoryAPI,
  revisions: revisionsAPI,
  bomTemplates: bomTemplatesAPI,
  bomEnterprise: bomEnterpriseAPI,
  bomItems: bomItemsAPI,
  compliance: complianceAPI,
  scheduling: schedulingAPI,
  partVendors: partVendorsAPI,
  ocr: ocrAPI,
  countryHistory: countryHistoryAPI,
  barcodes: barcodesAPI,
  analytics: analyticsAPI,
  cad: cadAPI,
  scraping: scrapingAPI,
  poOrders: poOrdersAPI,
  makeVsBuy: makeVsBuyAPI,
  shouldCost: shouldCostAPI,
  supplierScorecard: supplierScorecardAPI,
  capa: capaAPI,
  fai: faiAPI,
  deviation: deviationAPI,
  traceability: traceabilityAPI,
  kanban: kanbanAPI,
  contract: contractAPI,
  health: healthAPI,
  webhooks: webhooksAPI,
  bulkImport: bulkImportAPI,
  erpConnectors: erpConnectorsAPI,
  supplierPortal: supplierPortalAPI,
  monitoring: monitoringAPI,
  ai: aiAPI,
  approvalAutomation: approvalAutomationAPI,
  orderTracking: orderTrackingAPI,
  workOrders: workOrdersAPI,
  eco: ecoAPI,
  esignatures: esignatureAPI,
  substanceCompliance: substanceComplianceAPI,
  inventory: inventoryAPI,
  quality: qualityAPI,
  userDataSync: userDataSyncAPI,
  calendarEvents: calendarEventsAPI,
};
window.api = api;

window.poOrdersAPI = poOrdersAPI;
window.analyticsAPI = analyticsAPI;
window.cadAPI = cadAPI;
window.scrapingAPI = scrapingAPI;
window.webhooksAPI = webhooksAPI;
window.bulkImportAPI = bulkImportAPI;
window.erpConnectorsAPI = erpConnectorsAPI;
window.supplierPortalAPI = supplierPortalAPI;
window.monitoringAPI = monitoringAPI;
window.aiAPI = aiAPI;
window.approvalAutomationAPI = approvalAutomationAPI;
window.orderTrackingAPI = orderTrackingAPI;
window.workOrdersAPI = workOrdersAPI;
window.ecoAPI = ecoAPI;
window.esignatureAPI = esignatureAPI;
window.substanceComplianceAPI = substanceComplianceAPI;
window.inventoryAPI = inventoryAPI;
window.qualityAPI = qualityAPI;
window.userDataSyncAPI = userDataSyncAPI;
window.calendarEventsAPI = calendarEventsAPI;
