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
    apiParts && apiParts.length > 0 ? convertApiPartsToTree(apiParts) : null;
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

  const unreadCount = notifications.filter((n) => !n.read).length;
  const bellRef = React.useRef(null);
  const avatarRef = React.useRef(null);
  const [bellOpen, setBellOpen] = React.useState(false);
  const [avaOpen, setAvaOpen] = React.useState(false);

  React.useEffect(() => {
    // Dark mode was removed (a real AA dark theme is a later build); the app is
    // light-only. Density + accent remain user-adjustable via Tweaks.
    document.documentElement.setAttribute("data-density", t.density);
    document.documentElement.style.setProperty("--accent", t.accent);
  }, [t.density, t.accent]);

  React.useEffect(() => {
    if (apiParts && apiParts.length > 0) {
      setRows(convertApiPartsToTree(apiParts));
    }
  }, [apiParts]);
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
    setTweak,
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
    bellRef,
    avatarRef,
    unreadCount,
    data,
  };

  return <AppContext.Provider value={ctxValue}>{children}</AppContext.Provider>;
}

export { AppContext, AppCtxProvider };
