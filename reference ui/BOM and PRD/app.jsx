// Fallback stubs — if any external file fails to load, these prevent React crashes.
(function() {
  function stubModal(name) {
    return function StubModal(props) {
      if (!props.open) return null;
      return React.createElement("div", { className: "modal-overlay", style: { position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)" } },
        React.createElement("div", { style: { background: "#fff", borderRadius: 12, padding: 24, minWidth: 320, maxWidth: 500, boxShadow: "0 8px 32px rgba(0,0,0,0.2)" } },
          React.createElement("h3", { style: { margin: "0 0 12px", fontSize: 16 } }, name),
          React.createElement("p", { style: { margin: "0 0 16px", color: "#666", fontSize: 13 } }, "Module not loaded. Check that the server is running."),
          React.createElement("button", { onClick: props.onClose, style: { padding: "6px 16px", borderRadius: 6, border: "1px solid #ddd", background: "#f5f5f5", cursor: "pointer" } }, "Close")
        )
      );
    };
  }
  function stubScreen(name) {
    return function StubScreen() {
      return React.createElement("div", { style: { padding: 24, textAlign: "center", color: "#999" } },
        React.createElement("h2", null, name + " — Module not loaded"),
        React.createElement("p", null, "Check that the server is running and all JS files loaded successfully.")
      );
    };
  }
  var stubs = {
    BulkVendorImportModal: stubModal("Bulk Vendor Import"),
    PricingModal: stubModal("Pricing"),
    RoadmapModal: stubModal("Roadmap"),
    NotifPrefsModal: stubModal("Notification Preferences"),
    RFQCompareModal: stubModal("RFQ Compare"),
    CostSimulatorModal: stubModal("Cost Simulator"),
    LandedCostModal: stubModal("Landed Cost"),
    MarginModal: stubModal("Margin Analysis"),
    ShareLinkModal: stubModal("Share Link"),
    WebhooksModal: stubModal("Webhooks"),
    ScheduledReportsModal: stubModal("Scheduled Reports"),
    EmailParseModal: stubModal("Email Parse"),
    CommandPalette: stubModal("Command Palette"),
    BOMTemplatesModal: stubModal("BOM Templates"),
    BOMDuplicationModal: stubModal("BOM Duplication"),
    RollbackModal: stubModal("Rollback"),
    ProcurementAlertsModal: stubModal("Procurement Alerts"),
    PriceAlertsModal: stubModal("Price Alerts"),
    InflationAnalysisModal: stubModal("Inflation Analysis"),
    InternetScrapeModal: stubModal("Internet Scraping"),
    AIAssistant: stubModal("AI Assistant"),
    OnboardingChecklist: function() { return null; },
    NetworkBadge: function() { return null; },
    ProductTour: function() { return null; },
    ECRScreen: stubScreen("Engineering Change Requests"),
    ComplianceScreen: stubScreen("Compliance"),
    CalendarScreen: stubScreen("Calendar"),
    WorkOrdersScreen: stubScreen("Work Orders"),
    NCRScreen: stubScreen("Non-Conformance Reports"),
    InventoryScreen: stubScreen("Inventory"),
    ApprovalsScreen: stubScreen("Approvals"),
    WebhooksScreen: stubScreen("Webhooks"),
    BulkImportScreen: stubScreen("Bulk Import"),
    ERPConnectorsScreen: stubScreen("ERP Connectors"),
    SupplierPortalScreen: stubScreen("Supplier Portal"),
    AIFeaturesScreen: stubScreen("AI Features"),
    MonitoringScreen: stubScreen("Monitoring"),
    OrderTrackingScreen: stubScreen("Order Tracking"),
    Presence: function() { return null; },
    Popover: function() { return null; },
    DashboardScreen: stubScreen("Dashboard"),
    PDMVaultScreen: stubScreen("PDM Vault"),
    MobileScannerScreen: stubScreen("Mobile Scanner"),
    ToastHost: function() { return null; },
    NewPOModal: stubModal("New PO"),
    NewVendorModal: stubModal("New Vendor"),
    UploadModal: stubModal("Upload"),
    CADImportModal: stubModal("CAD Import"),
    NewPartModal: stubModal("New Part"),
    FindAlternatesModal: stubModal("Find Alternates"),
    SendRFQModal: stubModal("Send RFQ"),
    DocPreviewModal: stubModal("Document Preview"),
    PODetailModal: stubModal("PO Detail"),
    VendorDetailModal: stubModal("Vendor Detail"),
    BarcodeScanModal: stubModal("Barcode Scan"),
    GlobalSearchModal: stubModal("Global Search"),
    ProfileModal: stubModal("Profile"),
    SettingsModal: stubModal("Settings"),
    HelpModal: stubModal("Help"),
    ImportRFQsModal: stubModal("Import RFQs"),
    QuoteHistoryModal: stubModal("Quote History"),
    AutoScrapeModal: stubModal("Auto Scrape"),
    ChangeOwnerModal: stubModal("Change Owner"),
    AuditLogModal: stubModal("Audit Log"),
    APIKeysModal: stubModal("API Keys"),
    BulkImportModal: stubModal("Bulk Import"),
    CADRevisionsModal: stubModal("CAD Revisions"),
    CADWhereUsedModal: stubModal("CAD Where Used"),
    CADMarkupModal: stubModal("CAD Markup"),
    CADAttrsModal: stubModal("CAD Attributes"),
    CADSyncModal: stubModal("CAD Sync"),
    DrawingReleaseModal: stubModal("Drawing Release"),
    BulkEditModal: stubModal("Bulk Edit"),
    SaveViewModal: stubModal("Save View"),
    ConfirmModal: function(props) {
      if (!props.open) return null;
      return React.createElement("div", { className: "modal-overlay", style: { position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)" } },
        React.createElement("div", { style: { background: "#fff", borderRadius: 12, padding: 24, minWidth: 320, maxWidth: 500, boxShadow: "0 8px 32px rgba(0,0,0,0.2)" } },
          React.createElement("h3", { style: { margin: "0 0 12px", fontSize: 16 } }, props.title || "Confirm"),
          props.body && React.createElement("div", { style: { margin: "0 0 16px", color: "#444", fontSize: 13 } }, props.body),
          React.createElement("div", { style: { display: "flex", gap: 8, justifyContent: "flex-end" } },
            React.createElement("button", { onClick: props.onClose, style: { padding: "6px 16px", borderRadius: 6, border: "1px solid #ddd", background: "#f5f5f5", cursor: "pointer" } }, "Cancel"),
            React.createElement("button", { onClick: function() { props.onConfirm && props.onConfirm(); props.onClose && props.onClose(); }, style: { padding: "6px 16px", borderRadius: 6, border: "none", background: "#e85d1f", color: "#fff", cursor: "pointer" } }, props.confirmLabel || "Confirm")
          )
        )
      );
    },
    DropdownButton: function() { return null; },
  };
  Object.keys(stubs).forEach(function(k) {
    if (!window[k]) window[k] = stubs[k];
  });

  // Ensure critical non-component globals have stubs
  if (!window.ROLES) window.ROLES = { Admin: { canEdit: true, canRelease: true, canCreatePO: true, canManageVendors: true, canDelete: true, canViewCosts: true }, Viewer: { canEdit: false, canRelease: false, canCreatePO: false, canManageVendors: false, canDelete: false, canViewCosts: false } };
  if (!window.useTweaks) window.useTweaks = function() { return [{ theme: "light", density: "normal", accent: "#e85d1f" }, function() {}]; };
  if (!window.useAppStore) window.useAppStore = function() { return null; };
  if (!window.INR) window.INR = function(v, d) { return "\u20B9" + ((v || 0) * 83).toFixed(d || 0); };
  if (!window.toast) window.toast = function(msg, opts) { console.warn("Toast:", msg); };
})();

// App shell — top bar, nav rail, route switcher, tweaks panel, modals.

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light",
  "density": "normal",
  "accent": "#e85d1f"
}/*EDITMODE-END*/;

const ACCENT_PRESETS = ["#e85d1f", "#3b82f6", "#10b981", "#eab308"];

// File download helpers
function downloadBlob(content, filename, type = "text/plain") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); document.body.removeChild(a); }, 100);
}
function flattenForCSV(rows, depth = 0, out = []) {
  rows.forEach(r => {
    out.push({
      pn: r.pn, name: r.name, rev: r.rev, qty: r.qty, uom: r.uom,
      category: r.category, vendor: r.vendor,
      unit_cost: r.cost, ext_cost: ((r.cost || 0) * (r.qty || 0)).toFixed(2),
      lead_days: r.lead, origin: r.origin, status: r.status,
      level: depth,
    });
    if (r.children) flattenForCSV(r.children, depth + 1, out);
  });
  return out;
}
function downloadCSV(rows, filename) {
  const list = flattenForCSV(rows);
  const headers = Object.keys(list[0] || {});
  const csv = [
    headers.join(","),
    ...list.map(r => headers.map(h => {
      const v = r[h];
      if (v == null) return "";
      const s = String(v);
      return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(",")),
  ].join("\n");
  downloadBlob(csv, filename, "text/csv");
}
function downloadJSON(rows, filename) {
  downloadBlob(JSON.stringify(rows, null, 2), filename, "application/json");
}
function generateXLSX(rows, filename) {
  const list = flattenForCSV(rows);
  const headers = Object.keys(list[0] || {});
  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const rowsXml = list.map(r => "    <Row>\n" + headers.map(h => "      <Cell><Data ss:Type=\"String\">" + esc(r[h]) + "</Data></Cell>").join("\n") + "\n    </Row>").join("\n");
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n <Worksheet ss:Name="BOM">\n  <Table>\n   <Row>\n' +
    headers.map(h => "    <Cell><Data ss:Type=\"String\"><b>" + esc(h) + "</b></Data></Cell>").join("\n") + "\n   " + "</" + "Row>\n" +
    rowsXml + "\n  " + "</" + "Table>\n " + "</" + "Worksheet>\n" + "</" + "Workbook>";
  downloadBlob(xml, filename, "application/vnd.ms-excel");
}
window.downloadCSV = downloadCSV;
window.downloadJSON = downloadJSON;
window.generateXLSX = generateXLSX;
window.downloadBlob = downloadBlob;

// Print-to-PDF: opens a clean printable view of the BOM in a new window
function printBOM(rows, project) {
  const list = flattenForCSV(rows);
  const total = list.reduce((s, r) => s + (Number(r.unit_cost) || 0) * (Number(r.qty) || 0), 0);
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) { window.toast("Pop-up blocked — allow pop-ups to print", { kind: "warn" }); return; }
  const rowHTML = list.map((r, i) => {
    return "<tr><td>" + (i + 1) + "</td><td style='font-weight:600'>" + (r.pn || "") + "</td><td>" + "".padStart(r.level * 2, "·") + " " + (r.name || "") + "</td><td>" + (r.rev || "") + "</td><td class='r'>" + (r.qty || "") + "</td><td class='r'>" + (r.uom || "") + "</td><td>" + (r.category || "") + "</td><td>" + (r.vendor || "") + "</td><td class='r'>₹" + ((Number(r.unit_cost) || 0) * 83).toLocaleString("en-IN", {minimumFractionDigits: 2, maximumFractionDigits: 2}) + "</td><td class='r'>₹" + ((Number(r.ext_cost) || 0) * 83).toLocaleString("en-IN", {minimumFractionDigits: 2, maximumFractionDigits: 2}) + "</td><td>" + (r.origin || "") + "</td><td>" + (r.status || "") + "</td></tr>";
  }).join("");
  var printHtml = "<!doctype html><html><head><title>BOM · " + project.code + " · " + project.version + "</title>" +
    "<style>@page{size:A4 landscape;margin:16mm}body{font-family:-apple-system,sans-serif;color:#000;font-size:10px;margin:0;padding:16px}h1{font-size:16px;margin:0 0 4px}.meta{display:flex;gap:18px;font-family:monospace;font-size:9px;color:#444;margin-bottom:10px;padding-bottom:8px;border-bottom:2px solid #000}.meta span strong{color:#000;margin-left:4px}table{width:100%;border-collapse:collapse;font-size:9px;font-family:monospace}th{text-align:left;padding:4px 6px;border-bottom:1px solid #000;font-size:8px;text-transform:uppercase;letter-spacing:0.04em}td{padding:3px 6px;border-bottom:1px solid #eee;vertical-align:top}td.r{text-align:right}tfoot td{font-weight:700;border-top:2px solid #000;padding-top:6px;font-size:11px}.foot{margin-top:14px;font-size:8px;color:#666;display:flex;justify-content:space-between}</style></head><body>" +
    "<h1>BOM · " + project.name + "</h1>" +
    "<div class='meta'>" +
    "<span>Project<strong>" + project.code + "</strong></span>" +
    "<span>Revision<strong>" + project.rev + "</strong></span>" +
    "<span>Version<strong>" + project.version + "</strong></span>" +
    "<span>Status<strong>" + project.status + "</strong></span>" +
    "<span>Owner<strong>" + project.owner + "</strong></span>" +
    "<span>Updated<strong>" + project.updated + "</strong></span>" +
    "<span>Generated<strong>" + new Date().toISOString().slice(0,10) + "</strong></span>" +
    "</div>" +
    "<table><thead><tr><th>#</th><th>Part No.</th><th>Name</th><th>Rev</th><th>Qty</th><th>UoM</th><th>Category</th><th>Vendor</th><th>Unit</th><th>Ext.</th><th>Origin</th><th>Status</th></tr></thead>" +
    "<tbody>" + rowHTML + "</tbody>" +
    "<tfoot><tr><td colspan='9' style='text-align:right'>TOTAL</td><td class='r'>₹" + (total * 83).toLocaleString("en-IN", {minimumFractionDigits: 2, maximumFractionDigits: 2}) + "</td><td colspan='2'></td></tr></tfoot>" +
    "</table>" +
    "<div class='foot'><span>Blackbox BOM · " + project.code + "</span><span>Page 1 of 1</span></div>" +
    "<script>setTimeout(function(){window.print()},300)<\/script>" +
    "</body></html>";
  w.document.write(printHtml);
  w.document.close();
  window.toast("Print preview opened in new window", { kind: "success" });
}
window.printBOM = printBOM;

// Convert flat API parts array to tree structure for BOM display
function convertApiPartsToTree(apiParts) {
  if (!apiParts || !Array.isArray(apiParts)) return [];
  return apiParts.map(p => ({
    id: "api-" + p.id,
    pn: p.pn,
    name: p.name,
    rev: p.rev || "—",
    qty: p.qty || 1,
    uom: p.uom || "EA",
    category: p.category || "",
    subCategory: p.subCategory || "",
    vendor: p.vendor || "",
    manufacturer: p.manufacturer || "",
    cost: p.cost || 0,
    lead: p.lead || null,
    origin: p.origin || "",
    status: p.status || "Draft",
    assembly: p.assembly || false,
    material: p.material || "",
    weight: p.weight || null,
    dimensions: p.dimensions || "",
    imageUrl: p.imageUrl || null,
    customFields: p.customFields || {},
    tags: p.tags ? (typeof p.tags === "string" ? p.tags.split(",") : p.tags) : [],
    compliance: p.compliance ? (typeof p.compliance === "string" ? p.compliance.split(",") : p.compliance) : [],
    freight: p.freight || 0,
    tax: p.tax || 0,
    landedCost: p.landedCost || 0,
    countryHistory: p.countryHistory || [],
    vendorPrices: p.vendorPrices || [],
    cadUrl: p.cadUrl || null,
    barcode: p.barcode || null,
  }));
}

const INITIAL_COMMENTS = {
  "EL-MCU-STM32H7": [
    { id: 1, who: "E. Chen", init: "EC", color: "", text: "H743 errata ES0392 — moving Rev A → Rev B fixes the I2C wakeup bug. Confirmed in stress tests.", time: "12 min" },
    { id: 2, who: "M. Park", init: "MP", color: "user-2", text: "Lead bumped to 42 days — let's keep 250 on the shelf min.", time: "8 min" },
  ],
  "EL-PCB-MAIN-R3": [
    { id: 1, who: "R. Sato", init: "RS", color: "user-3", text: "JLCPCB lead time looks fine but we should keep a 100-board safety stock — 14d is tight for the August demo.", time: "2 hr" },
  ],
  "EL-BMS-12S": [
    { id: 1, who: "System", init: "⌬", color: "sys", text: "Lead time crept 28 → 35 days. Flagged as supply risk.", time: "2 days" },
  ],
};

const INITIAL_APPROVALS = {
  "ATL-MFR-CHS": { engineering: "approved", procurement: "approved", finance: "approved" },
  "ATL-MFR-PWR": { engineering: "approved", procurement: "approved", finance: "pending" },
  "ATL-MFR-CTL": { engineering: "approved", procurement: "pending", finance: "pending" },
  "ATL-MFR-IO":  { engineering: "pending",  procurement: "pending", finance: "pending" },
};

const INITIAL_NOTIFICATIONS = [
  { id: 1, who: "M. Park", init: "MP", color: "user-2", action: "requested approval on", obj: "ATL-MFR-CTL Rev D", time: "54 min", read: false, route: "bom" },
  { id: 2, who: "R. Sato", init: "RS", color: "user-3", action: "commented on", obj: "EL-PCB-MAIN-R3", time: "2 hr", read: false, route: "bom" },
  { id: 3, who: "System", init: "⌬", color: "sys", action: "detected duplicate", obj: "HW-FAS-M3-08", time: "3 hr", read: false, route: "parts" },
  { id: 4, who: "K. Singh", init: "KS", color: "user-4", action: "approved PO", obj: "PO-2026-0481", time: "5 hr", read: true, route: "procurement" },
  { id: 5, who: "E. Chen", init: "EC", color: "", action: "released BOM", obj: "v3.2.0", time: "yesterday", read: true, route: "bom" },
  { id: 6, who: "System", init: "⌬", color: "sys", action: "flagged supply risk on", obj: "EL-BMS-12S", time: "2 days", read: true, route: "bom" },
];

function App() {
  const data = window.BOM_DATA;
  const [t, setTweak] = window.useTweaks(TWEAK_DEFAULTS);
  const [route, setRoute] = React.useState("dashboard");
  const [selectedRow, setSelectedRow] = React.useState(null);
  const [search, setSearch] = React.useState("");
  const [activeCats, setActiveCats] = React.useState([]);
  const [bomTab, setBomTab] = React.useState("hierarchy");
  const [modal, setModal] = React.useState(null);
  const [modalContext, setModalContext] = React.useState(null);

  // API data loading state
  const [apiParts, setApiParts] = React.useState(null);
  const [apiVendors, setApiVendors] = React.useState(null);
  const [apiProjects, setApiProjects] = React.useState(null);
  const [apiLoading, setApiLoading] = React.useState(true);
  const [apiError, setApiError] = React.useState(null);
  const [apiConnected, setApiConnected] = React.useState(false);
  window.apiConnected = apiConnected;

  // Auth + onboarding gates
  const [authed, setAuthed] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem("__bbox_auth") || "null"); } catch { return null; }
  });
  const [onboardingDone, setOnboardingDone] = React.useState(() => localStorage.getItem("__bbox_onb") === "1");
  const [showMobileScan, setShowMobileScan] = React.useState(false);
  const [userRole, setUserRole] = React.useState(() => localStorage.getItem("__bbox_role") || "Admin");
  const perms = window.ROLES[userRole] || window.ROLES.Admin;
  const [showTour, setShowTour] = React.useState(false);
  const [showAI, setShowAI] = React.useState(false);

  // Load data from API on mount
  React.useEffect(() => {
    let cancelled = false;
    async function loadFromAPI() {
      try {
        setApiLoading(true);
        setApiError(null);

        // Try to connect to API
        const health = await window.api.health.check();
        if (cancelled) return;
        setApiConnected(true);

        // Load parts
        const parts = await window.api.parts.list();
        if (cancelled) return;
        setApiParts(parts);

        // Load vendors (requires auth)
        const token = localStorage.getItem("__bbox_api_token");
        if (token) {
          try {
            const vendors = await window.api.vendors.list();
            if (!cancelled) setApiVendors(vendors);
          } catch (e) {
            console.warn("Failed to load vendors from API:", e);
          }
        }

        // Load projects (requires auth)
        if (token) {
          try {
            const projects = await window.api.projects.list();
            if (!cancelled) setApiProjects(projects);
          } catch (e) {
            console.warn("Failed to load projects from API:", e);
          }
        }

        // Load notifications (requires auth)
        if (token) {
          try {
            const notifications = await window.api.notifications.list();
            if (!cancelled && notifications && notifications.length) {
              setNotifications(notifications.map(n => ({
                id: n.id,
                who: "System",
                init: "\u230C",
                color: "sys",
                action: n.title,
                obj: n.message,
                time: n.createdAt,
                read: n.status === "read",
                route: "bom",
              })));
            }
          } catch (e) {
            console.warn("Failed to load notifications from API:", e);
          }
        }

        setApiLoading(false);
        window.toast("Connected to API", { kind: "success" });
      } catch (e) {
        if (cancelled) return;
        console.warn("API not available, using mock data:", e.message);
        setApiConnected(false);
        setApiError(e.message);
        setApiLoading(false);
      }
    }
    loadFromAPI();
    return () => { cancelled = true; };
  }, []);

  // Use API data if available, otherwise fall back to mock data
  const effectiveRows = apiParts && apiParts.length > 0
    ? convertApiPartsToTree(apiParts)
    : data.rows;
  const effectiveVendors = apiVendors && apiVendors.length > 0
    ? apiVendors.map(v => ({ id: "v" + v.id, name: v.name, country: v.country, lead: v.leadTime, rating: v.reliabilityRating, moq: v.moq, parts: 0, terms: v.terms }))
    : data.vendors;

  // Lifted mutable app state
  const [rows, setRows] = React.useState(effectiveRows);
  const [vendors, setVendors] = React.useState(effectiveVendors);
  const [comments, setComments] = React.useState(() => {
    try { const s = localStorage.getItem("__bbox_comments"); return s ? JSON.parse(s) : INITIAL_COMMENTS; } catch { return INITIAL_COMMENTS; }
  });
  const [approvals, setApprovals] = React.useState(INITIAL_APPROVALS);
  const [notifications, setNotifications] = React.useState(() => {
    try { const s = localStorage.getItem("__bbox_notifications"); return s ? JSON.parse(s) : INITIAL_NOTIFICATIONS; } catch { return INITIAL_NOTIFICATIONS; }
  });
  const [savedViews, setSavedViews] = React.useState([]);
  const [project, setProject] = React.useState({ ...data.project });
  const [rollup, setRollup] = React.useState({ ...data.rollup });
  const [activeProjectKey, setActiveProjectKey] = React.useState("ATLAS");

  // Switch project — replaces rows, project meta, rollup, and resets state
  const switchProject = React.useCallback((key) => {
    const p = window.PROJECTS?.[key];
    if (!p) return;
    setActiveProjectKey(key);
    setProject({ ...p.project });
    setRows(p.rows);
    setRollup({ ...p.rollup });
    setSelectedRow(null);
    setBomTab("hierarchy");
    setActiveCats([]);
    setSearch("");
    window.toast(`Switched to ${key} · ${p.project.name}`, { kind: "success" });
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  // Top-bar popover refs
  const bellRef = React.useRef(null);
  const avatarRef = React.useRef(null);
  const [bellOpen, setBellOpen] = React.useState(false);
  const [avaOpen, setAvaOpen] = React.useState(false);

  // Apply theme + accent
  React.useEffect(() => {
    document.documentElement.setAttribute("data-theme", t.theme);
    document.documentElement.setAttribute("data-density", t.density);
    document.documentElement.style.setProperty("--accent", t.accent);
  }, [t.theme, t.density, t.accent]);

  // Sync API data into state when it loads
  React.useEffect(() => {
    if (apiParts && apiParts.length > 0) {
      setRows(convertApiPartsToTree(apiParts));
    }
  }, [apiParts]);
  React.useEffect(() => {
    if (apiVendors && apiVendors.length > 0) {
      setVendors(apiVendors.map(v => ({ id: "v" + v.id, name: v.name, country: v.country, lead: v.leadTime, rating: v.reliabilityRating, moq: v.moq, parts: 0, terms: v.terms })));
    }
  }, [apiVendors]);

  // Persist notifications and comments to localStorage
  React.useEffect(() => { localStorage.setItem("__bbox_notifications", JSON.stringify(notifications)); }, [notifications]);
  React.useEffect(() => { localStorage.setItem("__bbox_comments", JSON.stringify(comments)); }, [comments]);

  // Expose nav helper for toast actions
  React.useEffect(() => {
    window.__nav = (r) => { setRoute(r); setSelectedRow(null); };
    window.__open_approve_b = () => setModal("approve-b");
    window.__setBomSearch = (s) => setSearch(s);
    return () => { delete window.__nav; delete window.__open_approve_b; delete window.__setBomSearch; };
  }, []);

  const NAV = [
    { id: "dashboard", label: "Dashboard", icon: <Icon.Chart size={18}/> },
    { id: "bom", label: "BOM Editor", icon: <Icon.Bom size={18}/> },
    { id: "parts", label: "Components", icon: <Icon.Parts size={18}/> },
    { id: "inventory", label: "Inventory", icon: <Icon.Scan size={18}/> },
    { id: "vendors", label: "Vendors", icon: <Icon.Vendor size={18}/> },
    { id: "procurement", label: "Procurement", icon: <Icon.Cart size={18}/> },
    { id: "diff", label: "Compare Revisions", icon: <Icon.Diff size={18}/> },
    { id: "ecr", label: "Change Requests (ECR)", icon: <Icon.Edit size={18}/> },
    { id: "calendar", label: "Calendar & Timeline", icon: <Icon.Activity size={18}/> },
    { id: "work-orders", label: "Work Orders", icon: <Icon.Check size={18}/> },
    { id: "ncr", label: "Non-Conformance", icon: <Icon.Flag size={18}/> },
    { id: "compliance", label: "Compliance", icon: <Icon.Flag size={18}/> },
    { id: "pdm", label: "PDM / CAD Vault", icon: <Icon.Doc size={18}/> },
    { id: "approvals", label: "Approvals Inbox", icon: <Icon.Check size={18}/> },
    { id: "ocr", label: "OCR Upload", icon: <Icon.Scan size={18}/> },
    { id: "docs", label: "Documents", icon: <Icon.Doc size={18}/> },
    { id: "analytics", label: "Analytics", icon: <Icon.Chart size={18}/> },
    { id: "activity", label: "Team Activity", icon: <Icon.Activity size={18}/> },
    { id: "webhooks", label: "Webhooks", icon: <Icon.Link size={18}/> },
    { id: "bulk-import", label: "Bulk Import", icon: <Icon.Import size={18}/> },
    { id: "erp", label: "ERP Connectors", icon: <Icon.Link size={18}/> },
    { id: "supplier-portal", label: "Supplier Portal", icon: <Icon.Vendor size={18}/> },
    { id: "ai", label: "AI & Automation", icon: <Icon.Sparkles size={18}/> },
    { id: "monitoring", label: "Monitoring", icon: <Icon.Activity size={18}/> },
    { id: "order-tracking", label: "Order Tracking", icon: <Icon.Cart size={18}/> },
    { id: "scanner", label: "Mobile Scanner", icon: <Icon.Scan size={18}/> },
    { id: "enterprise-dashboards", label: "Enterprise Dashboards", icon: <Icon.Chart size={18}/> },
    { id: "service-bom", label: "Service BOMs", icon: <Icon.Bom size={18}/> },
    { id: "routing", label: "Routings & Processes", icon: <Icon.Activity size={18}/> },
    { id: "work-centers", label: "Work Centers", icon: <Icon.Tools size={18}/> },
    { id: "labor", label: "Labor & Timesheets", icon: <Icon.Check size={18}/> },
    { id: "currency", label: "Currency & FX", icon: <Icon.Cart size={18}/> },
    { id: "compliance-autonumber", label: "Compliance & Numbering", icon: <Icon.Flag size={18}/> },
    { id: "custom-attributes", label: "Custom Attributes", icon: <Icon.Edit size={18}/> },
    { id: "api-keys", label: "API Keys", icon: <Icon.Link size={18}/> },
  ];

  // Keyboard shortcuts
  React.useEffect(() => {
    const onKey = (e) => {
      const inField = ["INPUT", "TEXTAREA", "SELECT"].includes(e.target?.tagName);
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setModal("global-search");
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "p" && !inField) {
        e.preventDefault();
        setModal("command-palette");
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !inField) {
        e.preventDefault();
        window.runUndo?.();
      }
      if (!inField && e.key === "?") {
        e.preventDefault();
        setModal("help");
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "n") {
        e.preventDefault();
        setModal(route === "vendors" ? "new-vendor" : route === "procurement" ? "new-po" : "new-part");
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "L" || e.key === "l")) {
        e.preventDefault();
        setTweak("theme", t.theme === "dark" ? "light" : "dark");
      }
      // G + letter quick nav
      if (!inField && e.key === "g") {
        const handler = (e2) => {
          const map = { b: "bom", c: "parts", v: "vendors", p: "procurement", d: "dashboard", a: "analytics", i: "inventory" };
          if (map[e2.key]) { e2.preventDefault(); setRoute(map[e2.key]); window.toast("→ " + map[e2.key]); }
          window.removeEventListener("keydown", handler);
        };
        window.addEventListener("keydown", handler);
        setTimeout(() => window.removeEventListener("keydown", handler), 800);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [route, t.theme]);

  // Unified modal opener
  const openModal = React.useCallback((name, ctx = null) => {
    setModalContext(ctx);
    setModal(name);
  }, []);
  const closeModal = React.useCallback(() => { setModal(null); setModalContext(null); }, []);
  const modalCtxRef = React.useRef(null);
  React.useEffect(() => { modalCtxRef.current = modalContext; }, [modalContext]);

  const ctxValue = {
    rows, setRows,
    vendors, setVendors,
    comments, setComments,
    approvals, setApprovals,
    notifications, setNotifications,
    savedViews, setSavedViews,
    project, setProject,
    rollup, setRollup,
    activeProjectKey, switchProject,
    openModal,
    userRole, perms,
    user: authed,
  };

  // Show auth → onboarding → main app
  if (!authed) {
    return <window.AuthScreen onSignIn={async (u) => {
      // Try API login (always, regardless of apiConnected state)
      if (u.email) {
        try {
          const pw = u.password || "admin123";
          const result = await window.api.auth.login(u.email, pw);
          if (result && result.access_token) {
            window.toast("API authenticated", { kind: "success" });
          }
        } catch (e) {
          console.warn("API login failed, using mock auth:", e.message);
        }
      }
      localStorage.setItem("__bbox_auth", JSON.stringify(u));
      setAuthed(u);
      window.toast("Welcome, " + u.name, { kind: "success" });
    }}/>;
  }
  if (!onboardingDone) {
    return <window.OnboardingWizard user={authed} onComplete={(setup) => {
      localStorage.setItem("__bbox_onb", "1");
      if (setup.role) { localStorage.setItem("__bbox_role", setup.role); setUserRole(setup.role); }
      setOnboardingDone(true);
      window.toast("Workspace ready · let's go", { kind: "success" });
    }}/>;
  }
  if (showMobileScan) {
    return <window.MobileScanView onClose={() => setShowMobileScan(false)}/>;
  }

  return (
    <window.AppCtx.Provider value={ctxValue}>
    <div className="app" data-screen-label="Blackbox BOM"
      onDragOver={(e) => { if (e.dataTransfer?.types?.includes("Files")) { e.preventDefault(); document.body.classList.add("file-dragover"); } }}
      onDragLeave={(e) => { if (e.target === e.currentTarget) document.body.classList.remove("file-dragover"); }}
      onDrop={(e) => {
        if (!e.dataTransfer?.files?.length) return;
        e.preventDefault();
        document.body.classList.remove("file-dragover");
        const files = [...e.dataTransfer.files];
        const csv = files.find(f => /\.csv$/i.test(f.name));
        if (csv) {
          setModalContext({ initialFile: csv });
          setModal("bulk-import");
        } else {
          setModalContext({ files });
          setModal("upload");
        }
        window.toast(`Dropped ${files.length} file${files.length === 1 ? "" : "s"}`, { kind: "info" });
      }}
    >
      {/* Top bar */}
      <div className="topbar">
        <div className="brand"><div className="brand-mark"><span/><span/><span/><span/></div></div>
        <div className="wordmark">
          BLACKBOX
          <span className="div"/>
          <span className="sub">BOM</span>
          {apiConnected && <span style={{fontSize:9, color:"var(--green,#10b981)", marginLeft:6, fontWeight:500}}>API</span>}
          {!apiConnected && !apiLoading && <span style={{fontSize:9, color:"var(--fg-3,#999)", marginLeft:6, fontWeight:500}}>MOCK</span>}
        </div>
        <div className="crumbs">
          <button onClick={() => setModal("settings")} style={{background: "transparent", border: "none", color: "var(--fg-3)", fontFamily: "inherit", fontSize: 11, padding: "2px 4px", borderRadius: 3, cursor: "pointer"}} title="Workspace settings">workspace</button>
          <span className="sep">/</span>
          <window.DropdownButton
            width={260}
            align="left"
            trigger={<button style={{background: "transparent", border: "none", color: "var(--fg-2)", fontFamily: "inherit", fontSize: 11, padding: "2px 6px", borderRadius: 3, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4}}>
              {activeProjectKey} <Icon.ChevronDown size={9}/>
            </button>}
            items={[
              { header: "Switch project" },
              { icon: <Icon.Bom size={12}/>, label: "ATLAS · Mainframe", checked: activeProjectKey === "ATLAS", onClick: () => switchProject("ATLAS") },
              { icon: <Icon.Bom size={12}/>, label: "HORIZON · Sensor Pod", checked: activeProjectKey === "HORIZON", onClick: () => switchProject("HORIZON") },
              { icon: <Icon.Bom size={12}/>, label: "ATLAS-LITE · Eval Board", checked: activeProjectKey === "ATLAS-LITE", onClick: () => switchProject("ATLAS-LITE") },
              { icon: <Icon.Bom size={12}/>, label: "NEBULA · IO Module", checked: activeProjectKey === "NEBULA", onClick: () => switchProject("NEBULA") },
              "divider",
              { icon: <Icon.Plus size={12}/>, label: "New project…", onClick: () => window.toast("Create project flow") },
              { icon: <Icon.Settings size={12}/>, label: "Manage projects", onClick: () => setModal("settings") },
            ]}
          />
          <span className="sep">/</span>
          <window.DropdownButton
            width={240}
            align="left"
            trigger={<button style={{background: "transparent", border: "none", color: "var(--fg-2)", fontFamily: "inherit", fontSize: 11, padding: "2px 6px", borderRadius: 3, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4}}>
              {project.name} <Icon.ChevronDown size={9}/>
            </button>}
            items={[
              { header: "Jump to sub-assembly" },
              { icon: <Icon.Bom size={12}/>, label: "Mainframe Assembly (root)", onClick: () => { setRoute("bom"); window.toast("Loaded root"); } },
              { icon: <Icon.Parts size={12}/>, label: "Chassis Subassembly", onClick: () => { setRoute("bom"); setSearch("Chassis"); } },
              { icon: <Icon.Parts size={12}/>, label: "Power Subsystem", onClick: () => { setRoute("bom"); setSearch("Power"); } },
              { icon: <Icon.Parts size={12}/>, label: "Control Subsystem", onClick: () => { setRoute("bom"); setSearch("Control"); } },
              { icon: <Icon.Parts size={12}/>, label: "I/O Module", onClick: () => { setRoute("bom"); setSearch("I/O"); } },
              "divider",
              { icon: <Icon.Diff size={12}/>, label: "Compare revisions", onClick: () => setRoute("diff") },
              { icon: <Icon.Activity size={12}/>, label: "Project activity", onClick: () => setRoute("activity") },
            ]}
          />
          <span className="sep">/</span>
          <button onClick={() => { setRoute(route); window.scrollTo({ top: 0, behavior: "smooth" }); }} style={{background: "transparent", border: "none", color: "var(--fg)", fontFamily: "inherit", fontSize: 11, padding: "2px 4px", borderRadius: 3, fontWeight: 600, cursor: "default"}}>{NAV.find(n => n.id === route)?.label}</button>
        </div>
        <div className="topbar-spacer"/>
        <window.Presence/>
        <button
          className="search"
          onClick={() => setModal("global-search")}
          style={{cursor: "pointer", border: "1px solid var(--line)", textAlign: "left"}}
          title="Search anything (⌘K)"
        >
          <Icon.Search size={13}/>
          <span style={{flex: 1, color: "var(--fg-3)", fontSize: 12}}>Search parts, BOMs, vendors…</span>
          <span className="kbd">⌘K</span>
        </button>
        <button
          className="icon-btn"
          title="Toggle dark/light"
          onClick={() => setTweak("theme", t.theme === "dark" ? "light" : "dark")}
        >
          {t.theme === "dark" ? <Icon.Sun size={14}/> : <Icon.Moon size={14}/>}
        </button>
        <button
          ref={bellRef}
          className="icon-btn"
          title="AI Copilot"
          onClick={() => setShowAI(o => !o)}
        >
          <Icon.Sparkles size={14}/>
        </button>
        <button
          ref={bellRef}
          className="icon-btn"
          title="Notifications"
          style={{position: "relative"}}
          onClick={() => setBellOpen(o => !o)}
        >
          <Icon.Bell size={14}/>
          {unreadCount > 0 && (
            <span style={{
              position: "absolute",
              top: -3, right: -3,
              width: 14, height: 14,
              borderRadius: 99,
              background: "var(--accent)",
              color: "white",
              fontSize: 9,
              fontFamily: "var(--font-mono)",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "2px solid var(--bg-elev)",
            }}>{unreadCount}</span>
          )}
        </button>
        <span style={{display: "inline-flex", alignItems: "center", gap: 4, position: "relative"}}>
          <button
            ref={avatarRef}
            className="avatar"
            onClick={() => setAvaOpen(o => !o)}
            style={{border: "none", cursor: "pointer"}}
          >{authed?.init || authed?.name?.split(" ").map(s => s[0]).join("") || "?"}</button>
          <span style={{
            position: "absolute", bottom: -4, right: -4,
            fontFamily: "var(--font-mono)", fontSize: 7,
            padding: "1px 4px", borderRadius: 3,
            background: "var(--accent)", color: "white",
            letterSpacing: "0.04em", whiteSpace: "nowrap",
            lineHeight: "12px",
          }}>{userRole === "Admin" ? "ADMIN" : userRole === "Engineering" ? "ENG" : userRole === "Procurement" ? "PROC" : userRole === "Finance" ? "FIN" : "VIEW"}</span>
        </span>
      </div>

      {/* Notifications popover */}
      <window.Popover open={bellOpen} onClose={() => setBellOpen(false)} anchorRef={bellRef} width={360}>
        <div className="popover-h">
          <span className="t">Notifications</span>
          {unreadCount > 0 && (
            <button className="act" onClick={() => { setNotifications(prev => prev.map(n => ({...n, read: true}))); window.toast("All notifications marked read"); }}>Mark all read</button>
          )}
        </div>
        <div className="popover-list">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={"notif-item " + (n.read ? "read" : "")}
              onClick={() => {
                setNotifications(prev => prev.map(x => x.id === n.id ? {...x, read: true} : x));
                setBellOpen(false);
                if (n.route) setRoute(n.route);
              }}
              style={{cursor: "pointer"}}
            >
              <span className="dot"/>
              <div className="body">
                <strong>{n.who}</strong> {n.action} <span className="obj">{n.obj}</span>
                <span className="time">{n.time} ago</span>
              </div>
            </div>
          ))}
          {notifications.length === 0 && (
            <div style={{padding: "30px 20px", textAlign: "center", color: "var(--fg-3)", fontSize: 12}}>
              You're all caught up.
            </div>
          )}
        </div>
        <div style={{padding: "8px 12px", borderTop: "1px solid var(--line)", textAlign: "center"}}>
          <button className="act" onClick={() => { setBellOpen(false); setRoute("activity"); }} style={{background:"transparent", border:"none", color:"var(--accent)", fontSize: 11, fontFamily:"var(--font-mono)", cursor:"pointer"}}>
            View all activity →
          </button>
        </div>
      </window.Popover>

      {/* User menu popover */}
      <window.Popover open={avaOpen} onClose={() => setAvaOpen(false)} anchorRef={avatarRef} width={240}>
        <div className="user-menu">
          <div className="header">
            <span className="avatar" style={{width: 32, height: 32, fontSize: 12}}>{authed?.init || authed?.name?.split(" ").map(s => s[0]).join("") || "?"}</span>
            <div>
              <div className="name">{authed?.name || "Elena Chen"}</div>
              <div className="role">{authed?.role || userRole || "ENGINEERING LEAD"}</div>
            </div>
          </div>
          <button className="popover-item" onClick={() => { setAvaOpen(false); setModal("profile"); }}>
            <span className="ic"><Icon.Parts size={12}/></span><span className="lbl">Profile</span>
          </button>
          <button className="popover-item" onClick={() => { setAvaOpen(false); setModal("settings"); }}>
            <span className="ic"><Icon.Settings size={12}/></span><span className="lbl">Workspace settings</span>
          </button>
          <button className="popover-item" onClick={() => { setAvaOpen(false); setTweak("theme", t.theme === "dark" ? "light" : "dark"); }}>
            <span className="ic">{t.theme === "dark" ? <Icon.Sun size={12}/> : <Icon.Moon size={12}/>}</span>
            <span className="lbl">{t.theme === "dark" ? "Switch to light" : "Switch to dark"}</span>
            <span className="kbd">⌘⇧L</span>
          </button>
          <div className="popover-divider"/>
          <button className="popover-item" onClick={() => { setAvaOpen(false); setModal("api-keys"); }}>
            <span className="ic"><Icon.Link size={12}/></span><span className="lbl">API keys</span>
          </button>
          <button className="popover-item" onClick={() => { setAvaOpen(false); setModal("audit-log"); }}>
            <span className="ic"><Icon.Activity size={12}/></span><span className="lbl">Audit log</span>
          </button>
          <button className="popover-item" onClick={() => { setAvaOpen(false); setModal("share-link"); }}>
            <span className="ic"><Icon.Link size={12}/></span><span className="lbl">Share BOM</span>
          </button>
          <button className="popover-item" onClick={() => { setAvaOpen(false); setModal("webhooks"); }}>
            <span className="ic"><Icon.Link size={12}/></span><span className="lbl">Webhooks</span>
          </button>
          <button className="popover-item" onClick={() => { setAvaOpen(false); setModal("scheduled-reports"); }}>
            <span className="ic"><Icon.Doc size={12}/></span><span className="lbl">Scheduled reports</span>
          </button>
          <button className="popover-item" onClick={() => { setAvaOpen(false); setModal("email-parse"); }}>
            <span className="ic"><Icon.Sparkles size={12}/></span><span className="lbl">Email auto-parse</span>
          </button>
          <button className="popover-item" onClick={() => { setAvaOpen(false); setModal("landed-cost"); }}>
            <span className="ic">$</span><span className="lbl">Landed cost calculator</span>
          </button>
          <button className="popover-item" onClick={() => { setAvaOpen(false); setModal("margin"); }}>
            <span className="ic">%</span><span className="lbl">Margin calculator</span>
          </button>
          <button className="popover-item" onClick={() => { setAvaOpen(false); setModal("cost-sim"); }}>
            <span className="ic"><Icon.Sparkles size={12}/></span><span className="lbl">Cost what-if simulator</span>
          </button>
          <div className="popover-divider"/>
          <button className="popover-item" onClick={() => { setAvaOpen(false); setModal("notif-prefs"); }}>
            <span className="ic"><Icon.Bell size={12}/></span><span className="lbl">Notification preferences</span>
          </button>
          <button className="popover-item" onClick={() => { setAvaOpen(false); setModal("roadmap"); }}>
            <span className="ic"><Icon.Sparkles size={12}/></span><span className="lbl">Product roadmap</span>
          </button>
          <button className="popover-item" onClick={() => { setAvaOpen(false); setShowTour(true); }}>
            <span className="ic"><Icon.Sparkles size={12}/></span><span className="lbl">Take product tour</span>
          </button>
          <button className="popover-item" onClick={() => { setAvaOpen(false); window.__toggleOffline?.(); }}>
            <span className="ic">⌥</span><span className="lbl">Simulate offline</span>
          </button>
          <button className="popover-item" onClick={() => { setAvaOpen(false); setModal("pricing"); }}>
            <span className="ic">$</span><span className="lbl">Plans & pricing</span>
          </button>
          <button className="popover-item" onClick={() => { setAvaOpen(false); setModal("help"); }}>
            <span className="ic">?</span><span className="lbl">Help & shortcuts</span>
            <span className="kbd">?</span>
          </button>
          <div className="popover-divider"/>
          <div style={{padding: "8px 12px", fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-3)"}}>Switch role (demo)</div>
          {["Admin","Engineering","Procurement","Finance","Viewer"].map(r => (
            <button key={r} className="popover-item" onClick={() => { setAvaOpen(false); localStorage.setItem("__bbox_role", r); setUserRole(r); window.toast("Now viewing as " + r); }}>
              <span className="ic">{userRole === r ? <Icon.Check size={11}/> : <span style={{width: 11}}/>}</span>
              <span className="lbl">{r}</span>
            </button>
          ))}
          <button className="popover-item" onClick={() => { setAvaOpen(false); setShowMobileScan(true); }}>
            <span className="ic"><Icon.Scan size={12}/></span><span className="lbl">Open mobile scan view</span>
          </button>
          <div className="popover-divider"/>
          <button className="popover-item danger" onClick={() => { setAvaOpen(false); localStorage.removeItem("__bbox_auth"); localStorage.removeItem("__bbox_onb"); localStorage.removeItem("__bbox_api_token"); window.api.auth.logout(); setAuthed(null); setOnboardingDone(false); window.toast("Signed out", { kind: "warn" }); }}>
            <span className="ic">⎋</span><span className="lbl">Sign out</span>
          </button>
        </div>
      </window.Popover>

      {/* Nav rail */}
      <div className="navrail">
        {NAV.map((n, i) => (
          <React.Fragment key={n.id}>
            {i === 4 && <div className="nav-divider"/>}
            {i === 6 && <div className="nav-divider"/>}
            <button
              className={"nav-item " + (route === n.id ? "active" : "")}
              onClick={() => { setRoute(n.id); setSelectedRow(null); }}
            >
              {n.icon}
              <span className="nav-tip">{n.label}</span>
            </button>
          </React.Fragment>
        ))}
      </div>

      {/* Main */}
      <div className="main" data-screen-label={NAV.find(n => n.id === route)?.label}>
        {/* Loading overlay */}
        {apiLoading && (
          <div style={{position:"fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999}}>
            <div style={{background: "var(--bg)", border: "1px solid var(--line)", borderRadius: "var(--r-3)", padding: "32px 48px", textAlign: "center", boxShadow: "0 8px 32px rgba(0,0,0,0.3)"}}>
              <div style={{width: 32, height: 32, border: "3px solid var(--line)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px"}}/>
              <div style={{fontWeight: 600, fontSize: 14, marginBottom: 4}}>Connecting to API...</div>
              <div style={{fontSize: 11, color: "var(--fg-3)"}}>Loading data from backend</div>
            </div>
          </div>
        )}
        {/* Error banner */}
        {apiError && !apiLoading && (
          <div style={{padding: "8px 16px", background: "color-mix(in oklch, var(--danger) 8%, var(--bg))", borderBottom: "1px solid var(--danger)", display: "flex", alignItems: "center", gap: 8}}>
            <span style={{color: "var(--danger)", fontSize: 12, fontWeight: 600}}>API Error:</span>
            <span style={{fontSize: 11, color: "var(--fg-2)"}}>{apiError}</span>
            <span style={{fontSize: 10, color: "var(--fg-3)", marginLeft: 8}}>(using mock data)</span>
          </div>
        )}
        {route === "dashboard" && <window.DashboardScreen/>}
        {route === "bom" && (
          <BomShell
            data={data}
            search={search}
            activeCats={activeCats}
            setActiveCats={setActiveCats}
            density={t.density}
            onOpenDetail={(r) => setSelectedRow(r)}
            selectedRow={selectedRow}
            onCloseDetail={() => setSelectedRow(null)}
            bomTab={bomTab}
            setBomTab={setBomTab}
            openModal={setModal}
          />
        )}
        {route === "parts" && <window.PartsScreen openModal={setModal} onOpenDetail={(r) => setSelectedRow(r)}/>}
        {route === "inventory" && <window.InventoryScreen/>}
        {route === "vendors" && <VendorsScreen data={data} openModal={setModal}/>}
        {route === "procurement" && <ProcurementScreen data={data} openModal={setModal}/>}
        {route === "diff" && <DiffScreen data={data}/>}
        {route === "ecr" && <window.ECRScreen/>}
        {route === "calendar" && <window.CalendarScreen/>}
        {route === "work-orders" && <window.WorkOrdersScreen/>}
        {route === "ncr" && <window.NCRScreen/>}
        {route === "compliance" && <window.ComplianceScreen/>}
        {route === "pdm" && <window.PDMVaultScreen/>}
        {route === "approvals" && <window.ApprovalsScreen/>}
        {route === "ocr" && <OCRScreen/>}
        {route === "docs" && <DocumentsScreen data={data} openModal={setModal} perms={perms}/>}
        {route === "analytics" && <AnalyticsScreen data={data}/>}
        {route === "activity" && <ActivityScreen data={data}/>}
        {route === "webhooks" && <window.WebhooksScreen/>}
        {route === "bulk-import" && <window.BulkImportScreen/>}
        {route === "erp" && <window.ERPConnectorsScreen/>}
        {route === "supplier-portal" && <window.SupplierPortalScreen/>}
        {route === "ai" && <window.AIFeaturesScreen/>}
        {route === "monitoring" && <window.MonitoringScreen/>}
        {route === "order-tracking" && <window.OrderTrackingScreen/>}
        {route === "scanner" && <window.MobileScannerScreen/>}
        {route === "enterprise-dashboards" && <window.EnterpriseDashboardsScreen/>}
        {route === "service-bom" && <window.ServiceBOMScreen/>}
        {route === "routing" && <window.RoutingScreen/>}
        {route === "work-centers" && <window.WorkCentersScreen/>}
        {route === "labor" && <window.LaborScreen/>}
        {route === "currency" && <window.CurrencyScreen/>}
        {route === "compliance-autonumber" && <window.ComplianceAutoNumberScreen/>}
        {route === "custom-attributes" && <window.CustomAttributesScreen/>}
        {route === "api-keys" && <window.APIKeysScreen/>}
        {!["dashboard","bom","parts","inventory","vendors","procurement","diff","ecr","calendar","work-orders","ncr","compliance","pdm","approvals","ocr","docs","analytics","activity","webhooks","bulk-import","erp","supplier-portal","ai","monitoring","order-tracking","scanner","enterprise-dashboards","service-bom","routing","work-centers","labor","currency","compliance-autonumber","custom-attributes","api-keys"].includes(route) && (
          <window.ErrorScreen kind="404" action="Go to Dashboard" onAction={() => setRoute("dashboard")}/>
        )}
      </div>

      {/* Tweaks panel */}
      <window.TweaksPanel title="Tweaks">
        <window.TweakSection label="Appearance">
          <window.TweakRadio label="Theme" value={t.theme} onChange={v => setTweak("theme", v)}
            options={[{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }]}/>
          <window.TweakRadio label="Density" value={t.density} onChange={v => setTweak("density", v)}
            options={[{ value: "dense", label: "Dense" }, { value: "normal", label: "Normal" }, { value: "comfortable", label: "Comfy" }]}/>
          <window.TweakColor label="Accent" value={t.accent} options={ACCENT_PRESETS} onChange={v => setTweak("accent", v)}/>
        </window.TweakSection>
      </window.TweaksPanel>

      {/* Drawer overlay (for routes other than BOM, which has its own panel) */}
      {selectedRow && route !== "bom" && (
        <window.Drawer row={selectedRow} onClose={() => setSelectedRow(null)} data={data} openModal={setModal} overlay/>
      )}

      {/* Toast host */}
      <window.ToastHost/>

      {/* Modals */}
      <window.NewPOModal open={modal === "new-po"} onClose={() => setModal(null)}/>
      <window.NewVendorModal open={modal === "new-vendor"} onClose={() => setModal(null)}/>
      <window.UploadModal open={modal === "upload"} onClose={() => setModal(null)} files={modalContext?.files}/>
      <window.CADImportModal open={modal === "upload-cad"} onClose={closeModal}/>
      <window.NewPartModal open={modal === "new-part"} onClose={() => setModal(null)}/>
      <window.FindAlternatesModal open={modal === "find-alternates"} onClose={closeModal} row={modalContext}/>
      <window.SendRFQModal open={modal === "send-rfq"} onClose={closeModal} row={modalContext}/>
      <window.DocPreviewModal open={modal === "doc-preview"} onClose={closeModal} doc={modalContext}/>
      <window.PODetailModal open={modal === "po-detail"} onClose={closeModal} item={modalContext}/>
      <window.VendorDetailModal open={modal === "vendor-detail"} onClose={closeModal} vendor={modalContext}/>
      <window.BarcodeScanModal open={modal === "barcode-scan"} onClose={closeModal} onFound={modalContext?.onFound}/>
      <window.GlobalSearchModal open={modal === "global-search"} onClose={closeModal}/>
      <window.ProfileModal open={modal === "profile"} onClose={closeModal}/>
      <window.SettingsModal open={modal === "settings"} onClose={closeModal}/>
      <window.HelpModal open={modal === "help"} onClose={closeModal}/>
      <window.TenantSettingsModal open={modal === "tenant-settings"} onClose={closeModal}/>
      <window.ImportRFQsModal open={modal === "import-rfqs"} onClose={closeModal}/>
      <window.QuoteHistoryModal open={modal === "quote-history"} onClose={closeModal} vendor={modalContext}/>
      <window.AutoScrapeModal open={modal === "auto-scrape"} onClose={closeModal} row={modalContext}/>
      <window.ChangeOwnerModal open={modal === "change-owner"} onClose={closeModal} row={modalContext}/>
      <window.AuditLogModal open={modal === "audit-log"} onClose={closeModal}/>
      <window.APIKeysModal open={modal === "api-keys"} onClose={closeModal}/>
      <window.BulkImportModal open={modal === "bulk-import"} onClose={closeModal}/>
      <window.BulkVendorImportModal open={modal === "bulk-vendor-import"} onClose={closeModal}/>
      <window.PricingModal open={modal === "pricing"} onClose={closeModal}/>
      <window.RoadmapModal open={modal === "roadmap"} onClose={closeModal}/>
      <window.NotifPrefsModal open={modal === "notif-prefs"} onClose={closeModal}/>
      <window.RFQCompareModal open={modal === "rfq-compare"} onClose={closeModal}/>
      <window.CostSimulatorModal open={modal === "cost-sim"} onClose={closeModal}/>
      <window.LandedCostModal open={modal === "landed-cost"} onClose={closeModal}/>
      <window.MarginModal open={modal === "margin"} onClose={closeModal}/>
      <window.ShareLinkModal open={modal === "share-link"} onClose={closeModal}/>
      <window.WebhooksModal open={modal === "webhooks"} onClose={closeModal}/>
      <window.ScheduledReportsModal open={modal === "scheduled-reports"} onClose={closeModal}/>
      <window.EmailParseModal open={modal === "email-parse"} onClose={closeModal}/>
      <window.CommandPalette open={modal === "command-palette"} onClose={closeModal}/>
      <window.BOMTemplatesModal open={modal === "bom-templates"} onClose={closeModal}/>
      <window.BOMDuplicationModal open={modal === "bom-duplication"} onClose={closeModal}/>
      <window.RollbackModal open={modal === "rollback"} onClose={closeModal}/>
      <window.ProcurementAlertsModal open={modal === "procurement-alerts"} onClose={closeModal}/>
      <window.PriceAlertsModal open={modal === "price-alerts"} onClose={closeModal}/>
      <window.InflationAnalysisModal open={modal === "inflation"} onClose={closeModal}/>
      <window.InternetScrapeModal open={modal === "scraping"} onClose={closeModal}/>
      <window.CADRevisionsModal open={modal === "cad-revisions"} onClose={closeModal} file={modalContext}/>
      <window.CADWhereUsedModal open={modal === "cad-where-used"} onClose={closeModal} file={modalContext}/>
      <window.CADMarkupModal open={modal === "cad-markup"} onClose={closeModal} file={modalContext}/>
      <window.CADAttrsModal open={modal === "cad-attrs"} onClose={closeModal} file={modalContext}/>
      <window.CADSyncModal open={modal === "cad-sync"} onClose={closeModal}/>
      <window.DrawingReleaseModal open={modal === "drawing-release"} onClose={closeModal}/>
      <window.AIAssistant open={showAI} onClose={() => setShowAI(false)}/>
      <window.OnboardingChecklist/>
      {showTour && <window.ProductTour onClose={() => setShowTour(false)}/>}
      <window.NetworkBadge/>
      <window.BulkEditModal
        open={modal === "bulk-edit"}
        onClose={closeModal}
        count={modalContext?.count || 0}
        onApply={(patch) => { modalCtxRef.current?.onApply?.(patch); }}
      />
      <window.SaveViewModal
        open={modal === "save-view"}
        onClose={closeModal}
        filters={modalContext?.filters}
        onSave={(name) => {
          const id = "sv-" + Date.now();
          setSavedViews(prev => [...prev, { id, name, filters: modalCtxRef.current?.filters }]);
        }}
      />
      <window.ConfirmModal
        open={modal === "release"}
        onClose={() => setModal(null)}
        title={`Release BOM ${(() => { const [maj, min] = project.version.replace(/^v/, "").split("."); return "v" + maj + "." + (parseInt(min) + 1) + ".0"; })()}?`}
        body={<>This will lock the next revision and create an immutable snapshot. The changelog will be sent to engineering, procurement, and finance. You can still create the following revision afterwards.</>}
        confirmLabel="Release"
        onConfirm={() => {
          const [maj, min] = project.version.replace(/^v/, "").split(".");
          const newVer = "v" + maj + "." + (parseInt(min) + 1) + ".0";
          const newRev = String.fromCharCode(project.rev.charCodeAt(0) + 1);
          setProject({ ...project, version: newVer, rev: newRev, updated: "2026-05-25" });
          setNotifications([
            { id: Date.now(), who: "System", init: "⌬", color: "sys", action: "released BOM", obj: newVer, time: "just now", read: false, route: "bom" },
            ...notifications,
          ]);
          window.toast(`BOM ${newVer} released · Rev ${newRev} locked · Notifying 8 stakeholders`, { kind: "success" });
        }}
      />
      <window.ConfirmModal
        open={modal === "approve-b"}
        onClose={() => setModal(null)}
        title="Approve revision B?"
        body={<>You're approving <b>{project.version}</b> as the current revision. The previous revision will move to history.</>}
        confirmLabel="Approve"
        onConfirm={() => {
          // Mark all assembly approvals as approved
          const next = { ...approvals };
          Object.keys(next).forEach(k => {
            next[k] = { engineering: "approved", procurement: "approved", finance: "approved" };
          });
          setApprovals(next);
          setNotifications([
            { id: Date.now(), who: "E. Chen", init: "EC", color: "", action: "approved", obj: project.version, time: "just now", read: false, route: "bom" },
            ...notifications,
          ]);
          window.toast(`Revision ${project.version} approved · all 3 stages signed off`, { kind: "success", action: { label: "View", onClick: () => window.__nav("bom") } });
        }}
      />
    </div>
    </window.AppCtx.Provider>
  );
}

// ============ BOM Shell ============
function BomShell({ data, search, activeCats, setActiveCats, density, onOpenDetail, selectedRow, onCloseDetail, bomTab, setBomTab, openModal }) {
  const ctx = window.useAppStore();
  const perms = ctx?.perms || window.ROLES.Admin;
  const userRole = ctx?.userRole || "Admin";
  const p = ctx?.project || data.project;
  const r = ctx?.rollup || data.rollup;
  const deltaPct = ((r.bomCost - r.lastCost) / r.lastCost * 100);

  const allCats = ["Assembly", "Electrical", "Mechanical", "Hardware", "Cable", "Optical"];
  const statusFilterRef = React.useRef(null);
  const vendorFilterRef = React.useRef(null);
  const originFilterRef = React.useRef(null);
  const [statusFilters, setStatusFilters] = React.useState([]);
  const [vendorFilters, setVendorFilters] = React.useState([]);
  const [originFilters, setOriginFilters] = React.useState([]);

  const toggleCat = (c) => {
    if (activeCats.includes(c)) setActiveCats(activeCats.filter(x => x !== c));
    else setActiveCats([...activeCats, c]);
  };

  const applyView = (v) => {
    setActiveCats(v.filters.cats || []);
    setStatusFilters(v.filters.statuses || []);
    setVendorFilters(v.filters.vendors || []);
    setOriginFilters(v.filters.origins || []);
    window.toast(`Applied view: "${v.name}"`);
  };
  const deleteView = (id) => {
    ctx?.setSavedViews(ctx.savedViews.filter(v => v.id !== id));
    window.toast("View deleted", { kind: "warn" });
  };

  return (
    <>
      <div className="subheader">
        <div className="project-pill">
          <span className="dot"/>
          <span className="title">{p.name}</span>
          <span className="code">{p.code}</span>
          <span className="rev-badge">REV {p.rev}</span>
        </div>
        <div className="hint dot-sep" style={{marginLeft: -6}}>{p.version}</div>
        <div className="hint dot-sep">Owner: {p.owner}</div>
        <div className="hint dot-sep">Updated {p.updated}</div>
        <div style={{flex: 1}}/>
        <window.DropdownButton
          width={220}
          trigger={<button className="btn"><Icon.Import size={12}/> Import <Icon.ChevronDown size={10}/></button>}
          items={[
            { icon: <Icon.Bom size={11}/>, label: "Import from SolidWorks (CAD)", onClick: () => openModal("upload-cad") },
            { icon: <Icon.Doc size={11}/>, label: "Bulk import from CSV", onClick: () => openModal("bulk-import") },
            { icon: <Icon.Scan size={11}/>, label: "Import via barcode scan", onClick: () => openModal("barcode-scan") },
            "divider",
            { icon: <Icon.Sparkles size={11}/>, label: "Auto-scrape part info", onClick: () => openModal("auto-scrape", { pn: "" }) },
            { icon: <Icon.Search size={11}/>, label: "Internet Scraping Engine", onClick: () => openModal("scraping") },
          ]}
        />
        <button className="btn" onClick={() => window.__nav("diff")}><Icon.Diff size={12}/> Compare</button>
        <window.DropdownButton
          width={200}
          trigger={<button className="btn"><Icon.Tools size={12}/> Tools <Icon.ChevronDown size={10}/></button>}
          items={[
            { icon: <Icon.Doc size={11}/>, label: "BOM Templates", onClick: () => openModal("bom-templates") },
            { icon: <Icon.Bom size={11}/>, label: "Duplicate BOM", onClick: () => openModal("bom-duplication") },
            { icon: <Icon.Diff size={11}/>, label: "Rollback revision", onClick: () => openModal("rollback") },
          ]}
        />
        <window.DropdownButton
          width={200}
          trigger={<button className="btn"><Icon.Export size={12}/> Export <Icon.ChevronDown size={10}/></button>}
          items={[
            { header: "Format" },
            { icon: <Icon.Doc size={12}/>, label: "PDF report", onClick: () => { window.toast("Generating PDF report…"); setTimeout(() => window.toast("BOM_v3.2.0.pdf ready", { kind: "success", action: { label: "Download", onClick: () => window.toast("Downloaded BOM_v3.2.0.pdf") } }), 900); } },
            { icon: <Icon.Doc size={12}/>, label: "Excel (XLSX)", onClick: () => { generateXLSX(ctx?.rows || data.rows, "BOM_v3.2.0.xls"); window.toast("BOM_v3.2.0.xls downloaded — opens in Excel", { kind: "success" }); } },
            { icon: <Icon.Doc size={12}/>, label: "CSV", onClick: () => { downloadCSV(ctx?.rows || data.rows, "BOM_v3.2.0.csv"); window.toast("BOM_v3.2.0.csv downloaded", { kind: "success" }); } },
            { icon: <Icon.Doc size={12}/>, label: "JSON", onClick: () => { downloadJSON(ctx?.rows || data.rows, "BOM_v3.2.0.json"); window.toast("BOM_v3.2.0.json downloaded", { kind: "success" }); } },
            "divider",
            { icon: <Icon.Doc size={12}/>, label: "Print BOM (PDF)", kbd: "⌘P", onClick: () => printBOM(ctx?.rows || data.rows, p) },
            { icon: <Icon.Link size={12}/>, label: "Copy share link", kbd: "⌘⇧C", onClick: () => { navigator.clipboard?.writeText(window.location.href); window.toast("Share link copied to clipboard", { kind: "success" }); } },
          ]}
        />
        <button className={"btn primary " + (perms.canRelease ? "" : "locked")} data-locked="Release requires Engineering, Procurement, or Finance role" onClick={() => perms.canRelease ? openModal("release") : window.toast("You don't have permission to release · current role: " + userRole, { kind: "warn" })}><Icon.Check size={12}/> Release {(() => { const [maj, min] = p.version.replace(/^v/, "").split("."); return "v" + maj + "." + (parseInt(min) + 1); })()}</button>
      </div>

      <div className="ribbon">
        <div className="ribbon-cell">
          <div className="label">Total parts</div>
          <div className="value">{r.parts}</div>
          <div className="delta flat">{r.unique} unique</div>
        </div>
        <div className="ribbon-cell">
          <div className="label">BOM cost</div>
          <div className="value">{window.INR(r.bomCost, 2)}</div>
          <div className={"delta " + (deltaPct > 0 ? "up" : "down")}>
            {deltaPct > 0 ? "▲" : "▼"} {deltaPct.toFixed(2)}% vs last rev
          </div>
        </div>
        <div className="ribbon-cell">
          <div className="label">Critical lead</div>
          <div className="value">{r.lead}<span style={{fontSize: 12, color: "var(--fg-3)", marginLeft: 4}}>days</span></div>
          <div className="delta up">▲ +3d STM32H7</div>
        </div>
        <div className="ribbon-cell">
          <div className="label">Vendors</div>
          <div className="value">{r.vendors}</div>
          <div className="delta flat">{r.countries} countries</div>
        </div>
        <div className="ribbon-cell">
          <div className="label">Risk flags</div>
          <div className="value">{r.risk}</div>
          <div className="delta up">▲ 1 supplier · 1 dup · 1 origin</div>
        </div>
        <div className="ribbon-cell" style={{background: "var(--bg-sunk)"}}>
          <div className="label">Status</div>
          <div className="value" style={{fontSize: 13, marginTop: 2}}>
            <span className="status released">{p.status}</span>
          </div>
          <div className="delta flat">3 of 4 sub-assys approved</div>
        </div>
      </div>

      <div className="tabs">
        <button className={"tab " + (bomTab === "hierarchy" ? "active" : "")} onClick={() => setBomTab("hierarchy")}>
          Hierarchy <span className="count">87</span>
        </button>
        <button className={"tab " + (bomTab === "flat" ? "active" : "")} onClick={() => setBomTab("flat")}>
          Flat list <span className="count">64</span>
        </button>
        <button className={"tab " + (bomTab === "cost" ? "active" : "")} onClick={() => setBomTab("cost")}>
          Cost roll-up
        </button>
        <button className={"tab " + (bomTab === "sourcing" ? "active" : "")} onClick={() => setBomTab("sourcing")}>
          Sourcing
        </button>
        <div style={{flex: 1}}/>
        <button className="tab" style={{color: "var(--fg-3)"}} onClick={() => window.toast("Custom views coming Q3")}><Icon.Plus size={11}/> Add view</button>
      </div>

      {(bomTab === "hierarchy" || bomTab === "flat") && (
        <div className="filterbar">
          <div className="search" style={{width: 200, height: 26}}>
            <Icon.Search size={11}/>
            <input
              placeholder="Filter rows…"
              value={search}
              onChange={e => window.__setBomSearch?.(e.target.value)}
              style={{fontSize: 11}}
            />
            {search && <button className="icon-btn" style={{width:18, height:18, border:"none", background:"transparent"}} onClick={() => window.__setBomSearch?.("")}><Icon.X size={10}/></button>}
          </div>
          <span style={{width: 1, height: 16, background: "var(--line)", margin: "0 2px"}}/>
          {allCats.map(c => (
            <span
              key={c}
              className={"chip " + (activeCats.includes(c) ? "active" : "")}
              onClick={() => toggleCat(c)}
              style={{cursor: "pointer"}}
            >
              {c}
              {activeCats.includes(c) && <Icon.X size={9}/>}
            </span>
          ))}
          <span ref={statusFilterRef}>
            <window.DropdownButton
              width={200}
              trigger={<span className="chip chip-add" style={{cursor:"pointer"}}><Icon.Plus size={10}/> Status {statusFilters.length ? `(${statusFilters.length})` : ""}</span>}
              items={["Released","Draft","Review","Approved","Deprecated"].map(s => ({
                icon: statusFilters.includes(s) ? <Icon.Check size={11}/> : <span style={{width:11}}/>,
                label: s,
                onClick: () => setStatusFilters(statusFilters.includes(s) ? statusFilters.filter(x=>x!==s) : [...statusFilters, s]),
              }))}
            />
          </span>
          <span ref={vendorFilterRef}>
            <window.DropdownButton
              width={220}
              trigger={<span className="chip chip-add" style={{cursor:"pointer"}}><Icon.Plus size={10}/> Vendor {vendorFilters.length ? `(${vendorFilters.length})` : ""}</span>}
              items={data.vendors.slice(0, 8).map(v => ({
                icon: vendorFilters.includes(v.name) ? <Icon.Check size={11}/> : <span style={{width:11}}/>,
                label: v.name,
                onClick: () => setVendorFilters(vendorFilters.includes(v.name) ? vendorFilters.filter(x=>x!==v.name) : [...vendorFilters, v.name]),
              }))}
            />
          </span>
          <span ref={originFilterRef}>
            <window.DropdownButton
              width={180}
              trigger={<span className="chip chip-add" style={{cursor:"pointer"}}><Icon.Plus size={10}/> Origin {originFilters.length ? `(${originFilters.length})` : ""}</span>}
              items={["US","CN","JP","TW","FR","AT","DE"].map(o => ({
                icon: originFilters.includes(o) ? <Icon.Check size={11}/> : <span style={{width:11}}/>,
                label: o,
                onClick: () => setOriginFilters(originFilters.includes(o) ? originFilters.filter(x=>x!==o) : [...originFilters, o]),
              }))}
            />
          </span>
          {(activeCats.length + statusFilters.length + vendorFilters.length + originFilters.length > 0) && (
            <button className="btn small" onClick={() => { setActiveCats([]); setStatusFilters([]); setVendorFilters([]); setOriginFilters([]); }} style={{height: 22, fontSize: 10, color: "var(--fg-3)"}}>
              Clear all
            </button>
          )}
          {/* Saved views */}
          {ctx?.savedViews?.length > 0 && (
            <>
              <span style={{width: 1, height: 16, background: "var(--line)", margin: "0 2px"}}/>
              <span className="hint">Saved:</span>
              {ctx.savedViews.map(v => (
                <span
                  key={v.id}
                  className="chip"
                  onClick={() => applyView(v)}
                  style={{cursor: "pointer", color: "var(--accent)", borderColor: "var(--accent)", borderStyle: "solid"}}
                >
                  {v.name}
                  <span className="x" onClick={(e) => { e.stopPropagation(); deleteView(v.id); }}><Icon.X size={9}/></span>
                </span>
              ))}
            </>
          )}
          <div style={{flex: 1}}/>
          <span className="hint">{bomTab === "flat" ? "64" : "87"} rows · 64 unique</span>
          <button className="btn small" onClick={() => openModal("save-view", { filters: { cats: activeCats, statuses: statusFilters, vendors: vendorFilters, origins: originFilters } })}><Icon.Filter size={11}/> Save view</button>
        </div>
      )}

      <div className="bom-area" style={{display: "flex", flex: 1, minHeight: 0, minWidth: 0, position: "relative"}}>
        {bomTab === "hierarchy" && (
          <BomEditor
            data={data}
            density={density}
            search={search}
            activeCats={activeCats}
            statusFilters={statusFilters}
            vendorFilters={vendorFilters}
            originFilters={originFilters}
            onOpenDetail={onOpenDetail}
            mode="hierarchy"
          />
        )}
        {bomTab === "flat" && (
          <BomEditor
            data={data}
            density={density}
            search={search}
            activeCats={activeCats}
            statusFilters={statusFilters}
            vendorFilters={vendorFilters}
            originFilters={originFilters}
            onOpenDetail={onOpenDetail}
            mode="flat"
          />
        )}
        {bomTab === "cost" && <CostRollupView data={data}/>}
        {bomTab === "sourcing" && <SourcingView data={data} onOpenDetail={onOpenDetail}/>}
        {selectedRow && <Drawer row={selectedRow} onClose={onCloseDetail} data={data} openModal={openModal}/>}
      </div>
    </>
  );
}

// ============ Cost rollup view ============
function CostRollupView({ data }) {
  const ctx = window.useAppStore();
  const rows = ctx?.rows || data.rows;
  const top = rows[0];
  if (!top || !top.children) return <div className="empty" style={{padding: 60}}><p>No data</p></div>;
  const subs = top.children.map(s => ({
    ...s,
    ext: (s.children || []).reduce((acc, c) => acc + (c.cost || 0) * (c.qty || 0), 0),
  }));
  const total = subs.reduce((s, x) => s + x.ext, 0);
  const max = Math.max(...subs.map(s => s.ext), 1);

  return (
    <div className="bom-scroll" style={{padding: "20px 28px"}}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom: 12}}>
        <h2 style={{margin: 0, fontSize: 16, fontWeight: 600}}>Cost roll-up · by sub-assembly</h2>
        <div className="hint">Total {window.INR(total, 2)}</div>
      </div>

      <div className="rollup-list" style={{maxWidth: "100%", padding: 0}}>
        {subs.map((s) => {
          const pct = (s.ext / total) * 100;
          const width = (s.ext / max) * 100;
          return (
            <div key={s.id} className="rollup-row">
              <span className={"cat assembly"} style={{padding:"2px 4px", fontSize: 9}}>{s.children.length}</span>
              <div>
                <div className="name">{s.name}</div>
                <div className="pn">{s.pn} · Rev {s.rev}</div>
                <div style={{height: 18, marginTop: 8, background: "var(--bg-sunk)", borderRadius: 2, overflow: "hidden", position: "relative"}}>
                  <div style={{height: "100%", width: width + "%", background: "var(--accent)", borderRadius: 2, display: "flex", alignItems: "center", paddingLeft: 8, color: "white", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600}}>
                    {pct >= 8 ? pct.toFixed(1) + "%" : ""}
                  </div>
                </div>
              </div>
              <div className="ext">{window.INR(s.ext, 2)}</div>
              <div className="pct">{pct.toFixed(1)}% of BOM</div>
            </div>
          );
        })}
      </div>

      <h3 style={{margin: "28px 0 12px", fontSize: 14, fontWeight: 600}}>Most expensive parts</h3>
      <div style={{border:"1px solid var(--line)", borderRadius:"var(--r-3)", overflow: "hidden"}}>
        <table className="bom-table" style={{tableLayout:"auto"}}>
          <thead>
            <tr>
              <th style={{paddingLeft: 14}}>Part No.</th>
              <th>Name</th>
              <th>Category</th>
              <th>Vendor</th>
              <th className="num">Qty</th>
              <th className="num">Unit</th>
              <th className="num">Ext.</th>
              <th className="num">% of BOM</th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              const leaves = [];
              const walk = (rs) => rs.forEach(r => {
                if (r.children) walk(r.children);
                else leaves.push(r);
              });
              walk(rows);
              leaves.sort((a, b) => (b.cost * b.qty) - (a.cost * a.qty));
              return leaves.slice(0, 10).map((r, i) => {
                const ext = r.cost * r.qty;
                const p = (ext / total) * 100;
                return (
                  <tr key={r.id}>
                    <td className="mono" style={{paddingLeft: 14}}>{r.pn}</td>
                    <td><span style={{fontWeight: 500}}>{r.name}</span></td>
                    <td><span className={"cat " + r.category.toLowerCase()}>{r.category}</span></td>
                    <td>{r.vendor}</td>
                    <td className="num mono">{r.qty}</td>
                    <td className="num mono">{window.INR(r.cost, 2)}</td>
                    <td className="num mono" style={{fontWeight: 600}}>{window.INR(ext, 2)}</td>
                    <td className="num">
                      <div style={{display:"inline-flex", alignItems:"center", gap: 8, justifyContent:"flex-end", width:"100%"}}>
                        <span style={{display:"inline-block", width: 50, height: 4, background:"var(--bg-sunk)", borderRadius: 2, overflow:"hidden"}}>
                          <span style={{display:"block", width: Math.min(100, p * 4) + "%", height:"100%", background:"var(--accent)"}}/>
                        </span>
                        <span style={{fontFamily:"var(--font-mono)"}}>{p.toFixed(1)}%</span>
                      </div>
                    </td>
                  </tr>
                );
              });
            })()}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============ Sourcing view ============
function SourcingView({ data, onOpenDetail }) {
  const ctx = window.useAppStore();
  const rows = ctx?.rows || data.rows;
  const leaves = [];
  const walk = (rs) => rs.forEach(r => { if (r.children) walk(r.children); else leaves.push(r); });
  walk(rows);

  return (
    <div className="bom-scroll" style={{padding: "20px 28px"}}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom: 12}}>
        <h2 style={{margin: 0, fontSize: 16, fontWeight: 600}}>Sourcing matrix</h2>
        <div className="hint">{leaves.length} sourceable parts · 14 vendors · 6 countries</div>
      </div>

      <div style={{border:"1px solid var(--line)", borderRadius:"var(--r-3)", overflow: "hidden"}}>
        <table className="bom-table" style={{tableLayout:"auto"}}>
          <thead>
            <tr>
              <th style={{paddingLeft: 14}}>Part No.</th>
              <th>Name</th>
              <th>Vendor</th>
              <th>Origin</th>
              <th>Alt. vendors</th>
              <th>Lead</th>
              <th className="num">Unit</th>
              <th>Trend</th>
              <th>Risk</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {leaves.map((r, i) => {
              const alts = Math.max(0, ((r.pn.charCodeAt(0) + i) % 4));
              const risk = r.lead >= 30 ? "High" : r.lead >= 14 ? "Med" : "Low";
              return (
                <tr key={r.id} onClick={() => onOpenDetail(r)} style={{cursor: "pointer"}}>
                  <td className="mono" style={{paddingLeft: 14}}>{r.pn}</td>
                  <td><span style={{fontWeight: 500}}>{r.name}</span></td>
                  <td>{r.vendor}</td>
                  <td className="mono">{r.origin}</td>
                  <td>
                    {alts === 0 ? <span style={{color:"var(--danger)", fontFamily:"var(--font-mono)", fontSize: 10}}>SINGLE SOURCE</span> :
                      <span style={{display:"inline-flex", gap: 4}}>{Array.from({length: alts}, (_, j) => <span key={j} style={{width: 16, height: 16, borderRadius: 99, background: "var(--bg-sunk)", border: "1px solid var(--line)", display:"inline-flex", alignItems:"center", justifyContent:"center", fontFamily:"var(--font-mono)", fontSize: 8}}>{j+2}</span>)}</span>
                    }
                  </td>
                  <td><LeadHeat days={r.lead}/></td>
                  <td className="num mono">{window.INR(r.cost, 2)}</td>
                  <td><Sparkline data={r.trend}/></td>
                  <td>
                    <span className={"status " + (risk === "Low" ? "released" : risk === "Med" ? "review" : "deprecated")}>{risk}</span>
                  </td>
                  <td>
                    <button className="icon-btn" style={{width: 22, height: 22}} onClick={(e) => { e.stopPropagation(); window.toast("Searching alternates for " + r.pn); }}>
                      <Icon.Search size={11}/>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Mount
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App/>);
