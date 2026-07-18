import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { storage } from "../utils/storage.js";
import { dataService } from "../services/dataService.js";
import {
  TWEAK_DEFAULTS,
  INITIAL_COMMENTS,
  INITIAL_APPROVALS,
  INITIAL_NOTIFICATIONS,
} from "../utils/constants.js";
import { convertApiPartsToTree } from "../utils/bom.js";
import { accentTokensFor } from "../utils/accent.js";

import { __t } from "../i18n";
import { toast } from "../utils/toast";
import { BOM_DATA, PROJECTS, ROLES, api } from "../globals";
const AppContext = React.createContext(null);

function AppCtxProvider({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const route =
    location.pathname === "/" ? "dashboard" : location.pathname.slice(1);

  const setRoute = React.useCallback((r) => navigate("/" + r), [navigate]);

  const data = BOM_DATA;
  const [t, setTweak] = window.useTweaks(TWEAK_DEFAULTS);
  const [selectedRow, setSelectedRow] = React.useState(null);
  const [search, setSearch] = React.useState("");
  const [activeCats, setActiveCats] = React.useState([]);
  const [bomTab, setBomTab] = React.useState("hierarchy");
  const [modal, setModal] = React.useState(null);
  const [modalContext, setModalContext] = React.useState(null);

  const [apiParts, setApiParts] = React.useState(null);
  const [apiVendors, setApiVendors] = React.useState(null);
  // Canonical bom_items_master lines for the active BOM — hydrated onto
  // Parts-API rows below so structural edits (qty/refdes/find-number,
  // delete, reorder) can scope their writes to a real bom_items_master
  // line instead of silently falling back to local-only state or the
  // global Part record. See convertApiPartsToTree in utils/bom.js.
  const [apiBomItems, setApiBomItems] = React.useState(null);
  const [, setApiProjects] = React.useState(null);
  const [apiLoading, setApiLoading] = React.useState(true);
  const [apiError, setApiError] = React.useState(null);
  const [apiConnected, setApiConnected] = React.useState(false);
  const [syncStatus, setSyncStatus] = React.useState(
    dataService.getSyncStatus(),
  );
  window.apiConnected = apiConnected;

  const [authed, setAuthed] = React.useState(() => storage.auth.get());
  const [onboardingDone, setOnboardingDone] = React.useState(() =>
    storage.onboarding.isDone(),
  );
  // Theme: "light" | "dark" | "system" (persisted). "system" resolves via
  // prefers-color-scheme, tracked live through a matchMedia listener below
  // so an OS-level theme change is reflected without a reload.
  const [themePref, setThemePrefState] = React.useState(() =>
    storage.theme.get(),
  );
  const [systemPrefersDark, setSystemPrefersDark] = React.useState(() =>
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : false,
  );
  const resolvedTheme =
    themePref === "system" ? (systemPrefersDark ? "dark" : "light") : themePref;
  const setThemePref = React.useCallback((v) => {
    storage.theme.set(v);
    setThemePrefState(v);
  }, []);
  const [showMobileScan, setShowMobileScan] = React.useState(false);
  const [userRole, setUserRole] = React.useState(() => storage.role.get());
  const [authChecking, setAuthChecking] = React.useState(false);
  // Fall back to the least-privileged role. NOTE: client-side role/perms are
  // UI-only — the backend must enforce authorization server-side.
  const perms = ROLES[userRole] || ROLES.Viewer;
  const [showTour, setShowTour] = React.useState(false);
  const [showAI, setShowAI] = React.useState(false);

  React.useEffect(() => {
    return dataService.onSyncStatus(setSyncStatus);
  }, []);

  React.useEffect(() => {
    const stored = storage.auth.get();
    if (!stored || !api?.auth) return;
    setAuthChecking(true);
    (async () => {
      try {
        // Validate the cookie session. api.js transparently refreshes on a 401
        // and fires the global unauthorized handler (logout) ONLY when the
        // session is genuinely invalid. Transient failures — rate limiting
        // (429), 5xx, network blips, a backend restart — must NOT log the user
        // out, otherwise every page load that hits a transient error kicks them
        // back to the login screen.
        await api.auth.getMe();
      } catch (err) {
        const msg = (err && err.message) || "";
        if (msg.includes("Session expired")) {
          // Genuine 401 after a failed refresh — _onUnauthorized already
          // cleared auth state. Nothing more to do.
        } else {
          // Transient error — keep the session; requests will retry on demand.
          console.warn("[AppCtx] session check deferred (transient):", msg);
        }
      }
    })().finally(() => setAuthChecking(false));
  }, []);

  React.useEffect(() => {
    if (authed && !authChecking) {
      const saved = sessionStorage.getItem("intended_route");
      if (saved && saved !== "login" && saved !== "dashboard") {
        sessionStorage.removeItem("intended_route");
        navigate("/" + saved, { replace: true });
      }
    }
  }, [authed, authChecking, navigate]);

  React.useEffect(() => {
    window.__setOnUnauthorized(() => {
      storage.auth.remove();
      setAuthed(null);
      toast(__t("common.sessionExpired"), { kind: "error" });
    });
    return () => window.__setOnUnauthorized(null);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    async function loadFromAPI() {
      try {
        setApiLoading(true);
        setApiError(null);
        await api.health.check();
        if (cancelled) return;
        dataService.setOnline(true);
        setApiConnected(true);
        await dataService.syncAll();
        if (cancelled) return;
        const apiPartsRefreshed = await dataService.refresh("parts");
        if (cancelled) return;
        if (apiPartsRefreshed) setApiParts(apiPartsRefreshed.raw);
        try {
          const vendors = await api.vendors.list();
          if (!cancelled) setApiVendors(vendors);
        } catch (err) {
          console.warn("[AppCtx] Failed to load vendors:", err?.message || err);
        }
        try {
          const projects = await api.projects.list();
          if (!cancelled) setApiProjects(projects);
        } catch (err) {
          console.warn(
            "[AppCtx] Failed to load projects:",
            err?.message || err,
          );
        }
        setApiLoading(false);
        {
          toast(__t("common.apiConnected"), { kind: "success" });
        }
        dataService.migrateToBackend();
      } catch (e) {
        if (cancelled) return;
        dataService.setOnline(false);

        setApiConnected(false);
        setApiError(e.message);
        setApiLoading(false);
      }
    }
    loadFromAPI();
    return () => {
      cancelled = true;
    };
  }, []);

  const apiRows =
    apiParts && apiParts.length > 0
      ? convertApiPartsToTree(apiParts, apiBomItems)
      : null;
  const effectiveVendors =
    apiVendors && apiVendors.length > 0
      ? apiVendors.map((v) => ({
          id: "v" + v.id,
          name: v.name,
          country: v.country,
          lead: v.leadTime,
          rating: v.reliabilityRating,
          moq: v.moq,
          parts: 0,
          terms: v.terms,
        }))
      : data.vendors;

  const [rows, setRows] = React.useState(() => {
    return apiRows || data.rows;
  });
  const [vendors, setVendors] = React.useState(effectiveVendors);
  const [comments, setComments] = React.useState(INITIAL_COMMENTS);
  const [approvals, setApprovals] = React.useState(INITIAL_APPROVALS);
  const [notifications, setNotifications] = React.useState(() =>
    storage.notifications.get(INITIAL_NOTIFICATIONS),
  );
  const [savedViews, setSavedViews] = React.useState(() =>
    storage.savedViews.get(),
  );
  const [project, setProject] = React.useState({ ...data.project });
  const [rollup, setRollup] = React.useState({ ...data.rollup });
  const [activeProjectKey, setActiveProjectKey] = React.useState("ATLAS");
  // Same instance-BOM id convention used by BomEditor/CostRollupView for the
  // structural bom_items_master API (neither the Parts-API row source nor
  // the demo fixture threads a real bom_id through yet).
  const bomId = project?.id || project?.bomId || data?.project?.id || 1;

  const switchProject = React.useCallback((key) => {
    const p = PROJECTS?.[key];
    if (!p) return;
    setActiveProjectKey(key);
    setProject({ ...p.project });
    setRows(p.rows);
    setRollup({ ...p.rollup });
    setSelectedRow(null);
    setBomTab("hierarchy");
    setActiveCats([]);
    setSearch("");
    toast(__t("app.crumbSwitchProject") + ": " + key, { kind: "success" });
  }, []);

  // LOCKED DECISIONS UI #6: data grids (Parts, BOM) default to DENSE, the rest
  // of the shell stays at the user's density (default 'normal'). When the tweak
  // sits at its 'normal' default we bump grids to 'dense'; an explicit user
  // choice (dense/comfortable) flows through to the grids unchanged.
  const gridDensity = t.density === "normal" ? "dense" : t.density;

  const unreadCount = notifications.filter((n) => !n.read).length;
  const bellRef = React.useRef(null);
  const avatarRef = React.useRef(null);
  const [bellOpen, setBellOpen] = React.useState(false);
  const [avaOpen, setAvaOpen] = React.useState(false);
  // Off-canvas nav drawer (mobile/tablet ≤900px). The rail is always mounted;
  // this only governs the slide-in overlay + scrim below the breakpoint.
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);

  // Live-track the OS theme so themePref === "system" updates without a
  // reload when the user flips their OS between light/dark.
  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e) => setSystemPrefersDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Stamp data-theme before paint (useLayoutEffect, matching the
  // data-nav-collapsed pattern in NavRail.jsx) to avoid a flash of the
  // wrong theme. styles.css defines a complete :root[data-theme="dark"]
  // token override that every component consumes automatically.
  React.useLayoutEffect(() => {
    document.documentElement.setAttribute("data-theme", resolvedTheme);
  }, [resolvedTheme]);

  React.useEffect(() => {
    document.documentElement.setAttribute("data-density", t.density);
    // Accent-preset AA rethread: a chosen preset must move the *whole* accent
    // family together (interactive/hover/strong/strong-hover/text/focus/subtle),
    // not just the single legacy --accent alias — otherwise components reading
    // --accent-strong/--accent-text/--focus directly stay desynced on the
    // default orange while --accent-driven chrome follows the new pick.
    // Threading resolvedTheme through re-derives --accent-text/--accent-subtle
    // for dark surfaces (utils/accent.js) — the light-tuned values otherwise
    // stay pinned as an inline style, overriding the CSS dark-token fallback.
    const tokens = accentTokensFor(t.accent, resolvedTheme);
    for (const [prop, value] of Object.entries(tokens)) {
      document.documentElement.style.setProperty(prop, value);
    }
  }, [t.density, t.accent, resolvedTheme]);

  React.useEffect(() => {
    // Hydrate the canonical bom_items_master lines for the active BOM so
    // pre-existing Parts-API rows (not just ones created fresh this session
    // via Add Item/Duplicate) get a real bomItemId. Without this, every
    // loaded row falls through to local-only edits/deletes/reorders — see
    // convertApiPartsToTree in utils/bom.js.
    if (!apiConnected || !api?.bomEnterprise?.items) return;
    let cancelled = false;
    api.bomEnterprise.items
      .list(bomId)
      .then((items) => {
        if (!cancelled) setApiBomItems(Array.isArray(items) ? items : []);
      })
      .catch((err) => {
        console.warn(
          "[AppCtx] Failed to load BOM items for bom",
          bomId,
          err?.message || err,
        );
      });
    return () => {
      cancelled = true;
    };
  }, [apiConnected, bomId]);

  React.useEffect(() => {
    if (apiParts && apiParts.length > 0) {
      setRows(convertApiPartsToTree(apiParts, apiBomItems));
    }
  }, [apiParts, apiBomItems]);
  React.useEffect(() => {
    if (apiVendors && apiVendors.length > 0) {
      setVendors(
        apiVendors.map((v) => ({
          id: "v" + v.id,
          name: v.name,
          country: v.country,
          lead: v.leadTime,
          rating: v.reliabilityRating,
          moq: v.moq,
          parts: 0,
          terms: v.terms,
        })),
      );
    }
  }, [apiVendors]);

  React.useEffect(() => {
    // dataService.set() now rejects (instead of silently "succeeding") when
    // the API write actually fails — screenDataBridge already toasts the
    // user, so just swallow the rejection here to avoid an unhandled-promise
    // warning from this fire-and-forget effect.
    dataService.set("parts", rows).catch(() => {});
  }, [rows]);
  React.useEffect(() => {
    storage.notifications.set(notifications);
  }, [notifications]);
  // comments and approvals sync removed from localStorage
  React.useEffect(() => {
    storage.savedViews.set(savedViews);
  }, [savedViews]);

  React.useEffect(() => {
    if (apiConnected) dataService.syncAll();
  }, [apiConnected]);

  React.useEffect(() => {
    window.__nav = (r) => {
      setRoute(r);
      setSelectedRow(null);
    };
    window.__open_approve_b = () => setModal("approve-b");
    window.__setBomSearch = (s) => setSearch(s);
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setModal("global-search");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      delete window.__nav;
      delete window.__open_approve_b;
      delete window.__setBomSearch;
      window.removeEventListener("keydown", onKey);
    };
  }, [setRoute]);

  React.useEffect(() => {
    const el = document.querySelector(".nav-item.active");
    if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [route]);

  // Auto-close the mobile nav drawer after any navigation.
  React.useEffect(() => {
    setMobileNavOpen(false);
  }, [route]);

  const openModal = React.useCallback((name, ctx = null) => {
    setModalContext(ctx);
    setModal(name);
  }, []);
  const closeModal = React.useCallback(() => {
    setModal(null);
    setModalContext(null);
  }, []);
  const modalCtxRef = React.useRef(null);
  React.useEffect(() => {
    modalCtxRef.current = modalContext;
  }, [modalContext]);

  window.AppCtx = AppContext;

  const ctxValue = {
    rows,
    setRows,
    vendors,
    setVendors,
    comments,
    setComments,
    approvals,
    setApprovals,
    notifications,
    setNotifications,
    savedViews,
    setSavedViews,
    project,
    setProject,
    rollup,
    setRollup,
    activeProjectKey,
    switchProject,
    openModal,
    closeModal,
    userRole,
    setUserRole,
    perms,
    user: authed,
    route,
    setRoute,
    t,
    gridDensity,
    setTweak,
    themePref,
    setThemePref,
    resolvedTheme,
    selectedRow,
    setSelectedRow,
    search,
    setSearch,
    activeCats,
    setActiveCats,
    bomTab,
    setBomTab,
    modal,
    setModal,
    modalContext,
    setModalContext,
    modalCtxRef,
    apiConnected,
    apiLoading,
    apiError,
    apiParts,
    apiVendors,
    apiBomItems,
    bomId,
    syncStatus,
    authed,
    setAuthed,
    onboardingDone,
    setOnboardingDone,
    showMobileScan,
    setShowMobileScan,
    authChecking,
    showTour,
    setShowTour,
    showAI,
    setShowAI,
    bellOpen,
    setBellOpen,
    avaOpen,
    setAvaOpen,
    mobileNavOpen,
    setMobileNavOpen,
    bellRef,
    avatarRef,
    unreadCount,
    data,
  };

  return <AppContext.Provider value={ctxValue}>{children}</AppContext.Provider>;
}

export { AppContext, AppCtxProvider };
