// API Client for Blackbox BOM Management Tool
// This module provides functions to interact with the backend API

const API_BASE = 'http://localhost:8000/api/v1';

// Helper function for API requests
async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const token = localStorage.getItem('__bbox_api_token') || localStorage.getItem('token');
  
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...options.headers,
    },
    ...options,
  };
  
  const response = await fetch(url, config);
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }
  
  if (response.status === 204) {
    return null;
  }
  
  return response.json();
}

// Auth API
const authAPI = {
  login: async (email, password) => {
    const result = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (result && result.access_token) {
      localStorage.setItem('__bbox_api_token', result.access_token);
    }
    return result;
  },
  
  register: async (userData) => {
    const result = await apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
    if (result && result.access_token) {
      localStorage.setItem('__bbox_api_token', result.access_token);
    }
    return result;
  },
  
  logout: () => {
    localStorage.removeItem('__bbox_api_token');
  },
  
  getMe: () => apiRequest('/auth/me'),
};

// Parts API
const partsAPI = {
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
const projectsAPI = {
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
const vendorsAPI = {
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
const procurementAPI = {
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
const documentsAPI = {
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
    
    const token = localStorage.getItem('__bbox_api_token') || localStorage.getItem('token');
    const response = await fetch('/api/v1/documents/upload', {
      method: 'POST',
      headers: {
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
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
const usersAPI = {
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
const notificationsAPI = {
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
const commentsAPI = {
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
const approvalsAPI = {
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
const auditLogsAPI = {
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
const priceHistoryAPI = {
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
const revisionsAPI = {
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
const bomTemplatesAPI = {
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
const partVendorsAPI = {
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
const countryHistoryAPI = {
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
const barcodesAPI = {
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
const ocrAPI = {
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
const healthAPI = {
  check: () => apiRequest('/health'),
};

// Analytics API
const analyticsAPI = {
  dashboard: () => apiRequest('/analytics/dashboard'),
  trends: (range_) => apiRequest(`/analytics/trends?range_=${range_ || '6mo'}`),
  categories: () => apiRequest('/analytics/categories'),
};

// CAD API
const cadAPI = {
  sync: (data = {}) => apiRequest('/cad/sync', { method: 'POST', body: JSON.stringify(data) }),
  applySync: (changes = []) => apiRequest('/cad/apply-sync', { method: 'POST', body: JSON.stringify(changes) }),
  extractAttrs: (data) => apiRequest('/cad/extract-attrs', { method: 'POST', body: JSON.stringify(data) }),
  vaultStats: () => apiRequest('/cad/vault/stats'),
  vaultTree: () => apiRequest('/cad/vault/tree'),
};

// Scraping API
const scrapingAPI = {
  scrape: (url, mode) => apiRequest('/scraping/scrape', { method: 'POST', body: JSON.stringify({ url, mode: mode || 'auto' }) }),
  history: () => apiRequest('/scraping/history'),
};

// PO Orders API (from Excel import)
const poOrdersAPI = {
  list: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/po-orders${query ? '?' + query : ''}`);
  },
  get: (id) => apiRequest(`/po-orders/${id}`),
  stats: () => apiRequest('/po-orders/stats'),
};

// Phase 3 — Supply Chain Depth APIs

// Make vs. Buy
const makeVsBuyAPI = {
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
const shouldCostAPI = {
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
const supplierScorecardAPI = {
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
const capaAPI = {
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
const faiAPI = {
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
const deviationAPI = {
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
const traceabilityAPI = {
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
const kanbanAPI = {
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
const contractAPI = {
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
const orderTrackingAPI = {
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
const webhooksAPI = {
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
const bulkImportAPI = {
  upload: async (file, mappingConfig) => {
    const formData = new FormData();
    formData.append('file', file);
    if (mappingConfig) formData.append('mappingConfig', JSON.stringify(mappingConfig));
    const token = localStorage.getItem('__bbox_api_token') || localStorage.getItem('token');
    const response = await fetch('/api/v1/import/upload', {
      method: 'POST',
      headers: { ...(token ? { 'Authorization': 'Bearer ' + token } : {}) },
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
const erpConnectorsAPI = {
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

// Supplier Portal
const supplierPortalAPI = {
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
};

// Phase 5 — Monitoring
const monitoringAPI = {
  metrics: () => apiRequest('/metrics'),
  healthDetailed: () => apiRequest('/health/detailed'),
};

// Phase 6 — AI & Automation
const aiAPI = {
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

const approvalAutomationAPI = {
  listRules: () => apiRequest('/approval-automation/rules'),
  createRule: (data) => apiRequest('/approval-automation/rules', { method: 'POST', body: JSON.stringify(data) }),
  updateRule: (id, data) => apiRequest(`/approval-automation/rules/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteRule: (id) => apiRequest(`/approval-automation/rules/${id}`, { method: 'DELETE' }),
  evaluate: (data) => apiRequest('/approval-automation/evaluate', { method: 'POST', body: JSON.stringify(data) }),
  evaluateById: (id) => apiRequest(`/approval-automation/evaluate/${id}`, { method: 'POST' }),
};

// Assign all APIs to window.api for global access
window.api = {
  auth: authAPI,
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
};

// Also expose individual APIs on window for direct access
window.poOrdersAPI = poOrdersAPI;
window.analyticsAPI = analyticsAPI;
window.cadAPI = cadAPI;
window.scrapingAPI = scrapingAPI;
window.webhooksAPI = webhooksAPI;
window.erpConnectorsAPI = erpConnectorsAPI;
window.supplierPortalAPI = supplierPortalAPI;
window.aiAPI = aiAPI;
window.approvalAutomationAPI = approvalAutomationAPI;
window.orderTrackingAPI = orderTrackingAPI;

// Expose apiRequest globally for enterprise-screens.jsx
window.apiRequest = apiRequest;
