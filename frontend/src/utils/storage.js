export const KEYS = {
  AUTH: "__bbox_auth",
  ONBOARDING: "__bbox_onb",
  ROLE: "__bbox_role",
  NOTIFICATIONS: "__bbox_notifications",
  SAVED_VIEWS: "__bbox_saved_views",
  TEMPLATES: "__bbox_templates",
  ECRS: "__bbox_ecrs",
  CALENDAR_EVENTS: "__bbox_calendar_events",
  CHECKLIST: "__bbox_checklist",
  CHECKLIST_DISMISSED: "__bbox_checklist_dismissed",
  DUP_DISMISSED: "__bbox_dup_dismissed",
  NOTIF_PREFS: "__bbox_notif",
  DOCS: "__bbox_docs",
  INR_RATE: "__bbox_rate",
  RECENT_SCANS: "__bbox_recent_scans",
  LANG: "bbox_lang",
  SAVED_SEARCHES: "__bbox_saved_searches",
  SUPPLIER_USERS: "__bbox_supplier_users",
  NAV_COLLAPSED: "__bbox_nav_collapsed",
  THEME: "__bbox_theme",
  A11Y: "__bbox_a11y",
};

function get(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return raw;
  } catch {
    return fallback;
  }
}

function getJSON(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function set(key, value) {
  try {
    localStorage.setItem(key, String(value));
    return true;
  } catch {
    return false;
  }
}

function setJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function remove(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export const storage = {
  KEYS,
  get,
  getJSON,
  set,
  setJSON,
  remove,

  auth: {
    get: () => getJSON(KEYS.AUTH, null),
    // Never persist credentials. Strip password (and any other sensitive
    // fields) before storing — only keep non-sensitive profile data for UI.
    set: (u) => {
      if (u && typeof u === "object") {
        // eslint-disable-next-line no-unused-vars
        const { password, pass, pwd, token, access_token, refresh_token, ...safe } = u;
        return setJSON(KEYS.AUTH, safe);
      }
      return setJSON(KEYS.AUTH, u);
    },
    remove: () => remove(KEYS.AUTH),
  },

  onboarding: {
    isDone: () => get(KEYS.ONBOARDING) === "1",
    setDone: () => set(KEYS.ONBOARDING, "1"),
  },

  role: {
    // Default to the least-privileged role when unset. NOTE: client-side role
    // is UI-only — the backend must enforce authorization server-side.
    get: () => get(KEYS.ROLE, "Viewer"),
    set: (r) => set(KEYS.ROLE, r),
  },

  notifications: {
    get: (init) => getJSON(KEYS.NOTIFICATIONS, init),
    set: (n) => setJSON(KEYS.NOTIFICATIONS, n),
  },

  savedViews: {
    get: () => getJSON(KEYS.SAVED_VIEWS, []),
    set: (v) => setJSON(KEYS.SAVED_VIEWS, v),
  },

  templates: {
    get: () => getJSON(KEYS.TEMPLATES, []),
    set: (t) => setJSON(KEYS.TEMPLATES, t),
  },

  ecrs: {
    get: () => getJSON(KEYS.ECRS, null),
    set: (e) => setJSON(KEYS.ECRS, e),
  },

  calendarEvents: {
    get: () => getJSON(KEYS.CALENDAR_EVENTS, null),
    set: (e) => setJSON(KEYS.CALENDAR_EVENTS, e),
  },

  checklist: {
    get: () => getJSON(KEYS.CHECKLIST, []),
    set: (items) => setJSON(KEYS.CHECKLIST, items),
    isDismissed: () => get(KEYS.CHECKLIST_DISMISSED) === "1",
    dismiss: () => set(KEYS.CHECKLIST_DISMISSED, "1"),
  },

  dupDismissed: {
    get: () => getJSON(KEYS.DUP_DISMISSED, []),
    set: (ids) => setJSON(KEYS.DUP_DISMISSED, ids),
  },

  notifPrefs: {
    get: () => getJSON(KEYS.NOTIF_PREFS, null),
    set: (p) => setJSON(KEYS.NOTIF_PREFS, p),
  },

  docs: {
    get: () => getJSON(KEYS.DOCS, []),
    set: (d) => setJSON(KEYS.DOCS, d),
  },


  inrRate: {
    get: () => {
      try { return parseFloat(get(KEYS.INR_RATE)) || (window.INR_RATE || 83); }
      catch { return window.INR_RATE || 83; }
    },
    set: (r) => set(KEYS.INR_RATE, String(r)),
  },

  recentScans: {
    get: () => getJSON(KEYS.RECENT_SCANS, []),
    set: (s) => setJSON(KEYS.RECENT_SCANS, s),
  },


  lang: {
    get: () => get(KEYS.LANG, "en"),
    set: (l) => set(KEYS.LANG, l),
  },

  savedSearches: {
    get: () => getJSON(KEYS.SAVED_SEARCHES, []),
    set: (list) => setJSON(KEYS.SAVED_SEARCHES, list),
  },

  supplierUsers: {
    get: () => getJSON(KEYS.SUPPLIER_USERS, []),
    set: (u) => setJSON(KEYS.SUPPLIER_USERS, u),
  },

  nav: {
    // Persisted collapsed state for the primary navigation rail.
    getCollapsed: () => get(KEYS.NAV_COLLAPSED) === "1",
    setCollapsed: (v) => set(KEYS.NAV_COLLAPSED, v ? "1" : "0"),
  },

  theme: {
    // "light" | "dark" | "system" — "system" follows prefers-color-scheme
    // (see AppCtx.jsx). Defaults to "system" so a fresh install respects the
    // OS setting rather than silently forcing light mode.
    get: () => get(KEYS.THEME, "system"),
    set: (v) => set(KEYS.THEME, v),
  },

  a11y: {
    // Array of active accessibility-mode flags, e.g. ["high-contrast",
    // "colorblind-safe"] — both/either/neither can be active at once, and
    // they compose with theme (see styles.css [data-a11y] rules and
    // AppCtx.jsx, which joins this array into the `data-a11y` root attribute).
    get: () => {
      const v = getJSON(KEYS.A11Y, []);
      return Array.isArray(v) ? v : [];
    },
    set: (modes) => setJSON(KEYS.A11Y, Array.isArray(modes) ? modes : []),
  },
};
