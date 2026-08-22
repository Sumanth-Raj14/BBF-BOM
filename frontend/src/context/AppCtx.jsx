import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { storage } from "../utils/storage.js";
import { dataService } from "../services/dataService.js";
import { setNavigator } from "../services/navigation.js";
import { TWEAK_DEFAULTS } from "../utils/constants.js";
import { convertApiPartsToTree } from "../utils/bom.js";
import { accentTokensFor } from "../utils/accent.js";

import { __t } from "../i18n";
import { toast } from "../utils/toast";
// fixfe: PROJECTS (frontend/projects.js) is no longer imported. It is a static
// fixture of invented parts/vendors/costs that switchProject used to paste over
// the user's real BOM — see switchProject below.
import { BOM_DATA, ROLES, api } from "../globals";
import { AppContext } from "./appContext.js";

const EM_DASH = "—";

// Paginated endpoints (projects, notifications) answer {items, total, ...};
// a few answer a bare array. Normalise both, and never invent rows on failure.
function asList(res) {
  if (Array.isArray(res)) return res;
  if (res && Array.isArray(res.items)) return res.items;
  return [];
}

// A real project record (GET /api/v1/projects) shaped for the `project` context
// value. The projects API carries no revision / version / owner, so those read
// as an em-dash rather than the fixture's confident "Rev C · v3.2.0 · E. Chen".
function projectFromApi(p) {
  return {
    id: p.id,
    code: p.code || EM_DASH,
    name: p.name || EM_DASH,
    status: p.status || EM_DASH,
    description: p.description || "",
    rev: EM_DASH,
    version: EM_DASH,
    owner: EM_DASH,
    updated: String(p.updatedAt || p.createdAt || "").slice(0, 10) || EM_DASH,
  };
}

// fixfe: `project` used to initialise from the BOM_DATA fixture, so before (and
// forever after a failed fetch) the crumbs and the BOM header asserted the demo
// assembly "ATL-MFR-A · Mainframe Assembly · Rev C · Released" was open. Start
// with a blank identity and adopt a real project once the API answers.
const EMPTY_PROJECT = {
  code: EM_DASH,
  name: EM_DASH,
  status: EM_DASH,
  description: "",
  rev: EM_DASH,
  version: EM_DASH,
  owner: EM_DASH,
  updated: EM_DASH,
};

// fixfe: the BOM-editor KPI ribbon used to render BOM_DATA.rollup — the frozen
// constants {parts:87, unique:64, bomCost:4218.40, lead:21, vendors:14,
// countries:6, risk:3}. setRollup had exactly one caller (switchProject, which
// only ever fed it more fixture data), so those seven numbers described every
// BOM ever opened, including an empty one. They are now derived from the rows
// actually on screen; anything the rows cannot support reads as an em-dash.
export function deriveRollup(rows) {
  const pns = new Set();
  const vendorNames = new Set();
  const origins = new Set();
  let count = 0;
  let cost = 0;
  let lead = null;

  const visit = (row) => {
    if (!row) return;
    count += 1;
    if (row.pn) pns.add(row.pn);
    if (row.vendor && row.vendor !== EM_DASH) vendorNames.add(row.vendor);
    if (row.origin && row.origin !== EM_DASH) origins.add(row.origin);
    const rowLead = Number(row.lead);
    if (Number.isFinite(rowLead) && (lead === null || rowLead > lead)) {
      lead = rowLead;
    }
    const kids = Array.isArray(row.children) ? row.children : [];
    if (kids.length) {
      kids.forEach(visit);
    } else {
      // Leaves only — an assembly's own `cost` is itself a rollup of its
      // children, so adding both double-counts the whole sub-tree.
      cost += (Number(row.qty) || 0) * (Number(row.cost) || 0);
    }
  };
  (Array.isArray(rows) ? rows : []).forEach(visit);

  return {
    parts: count,
    unique: pns.size,
    bomCost: cost,
    // No prior-revision cost is loaded anywhere in the app, so there is nothing
    // honest to compare against. Consumers must guard before showing a delta.
    lastCost: null,
    lead: lead === null ? EM_DASH : lead,
    vendors: vendorNames.size,
    countries: origins.size,
    // Rows carry no risk flag; the old constant "3" was invented.
    risk: EM_DASH,
  };
}

function relTime(iso) {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return EM_DASH;
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 60) return mins + " min";
  if (mins < 1440) return Math.round(mins / 60) + " hr";
  return Math.round(mins / 1440) + " days";
}

// Server notification (title/message/status/createdAt) -> the shape the TopBar
// bell renders. No `route` is set: the API's entityType values do not map onto
// this app's routes, and guessing one would send the user somewhere unrelated.
function notificationFromApi(n) {
  const title = n.title || "";
  return {
    id: n.id,
    who: title,
    init: title.slice(0, 2).toUpperCase() || "⌬",
    color: n.type === "error" || n.type === "warning" ? "sys" : "",
    action: "",
    obj: n.message || "",
    time: relTime(n.createdAt),
    read: n.status === "read",
    route: null,
  };
}

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
  // fixfe: the project list was fetched and then thrown away (`const [, setApiProjects]`),
  // which is why the project switcher had nothing real to switch between and
  // fell back to the demo fixture. It is kept and exposed on the context now.
  const [apiProjects, setApiProjects] = React.useState(null);
  const [apiLoading, setApiLoading] = React.useState(true);
  const [apiError, setApiError] = React.useState(null);
  const [apiConnected, setApiConnected] = React.useState(false);
  const [syncStatus, setSyncStatus] = React.useState(
    dataService.getSyncStatus(),
  );
  // Improvement #2: apiConnected is on the context value below; it used to be
  // mirrored onto window for modals that already hold ctx. Mirror removed.

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
  // Accessibility modes: array of "high-contrast" / "colorblind-safe" flags
  // (both/either/neither active at once), persisted via storage.a11y and
  // composed onto the root as `data-a11y="high-contrast colorblind-safe"`
  // (see styles.css [data-a11y~=...] rules) — independent of, and layered
  // on top of, the light/dark theme above.
  const [a11yModes, setA11yModesState] = React.useState(() =>
    storage.a11y.get(),
  );
  const toggleA11yMode = React.useCallback((mode, enabled) => {
    setA11yModesState((prev) => {
      const has = prev.includes(mode);
      const want = enabled === undefined ? !has : !!enabled;
      if (want === has) return prev;
      const next = want ? [...prev, mode] : prev.filter((m) => m !== mode);
      storage.a11y.set(next);
      return next;
    });
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
          const projects = asList(await api.projects.list());
          if (!cancelled) {
            setApiProjects(projects);
            // Adopt the workspace's first REAL project as the active one. This
            // replaces the BOM_DATA fixture identity that used to be shown
            // before (and instead of) anything real. If the list is empty the
            // crumbs stay on the blank EMPTY_PROJECT rather than inventing one.
            if (projects.length > 0) {
              const first = projects[0];
              setProject(projectFromApi(first));
              setActiveProjectKey(first.code || String(first.id));
            }
          }
        } catch (err) {
          console.warn(
            "[AppCtx] Failed to load projects:",
            err?.message || err,
          );
        }
        // fixfe: the notification bell used to render six invented activity
        // entries seeded from INITIAL_NOTIFICATIONS. Real endpoint:
        // GET /api/v1/notifications (api.notifications.list). On failure the
        // bell stays empty — an empty bell is honest, a fabricated one is not.
        try {
          const notifs = asList(await api.notifications.list());
          if (!cancelled) setNotifications(notifs.map(notificationFromApi));
        } catch (err) {
          console.warn(
            "[AppCtx] Failed to load notifications:",
            err?.message || err,
          );
        }
        // Fix: comments/approvals used to stay on the fake demo seed forever
        // (see comments/setComments init above). dataService.refresh already
        // knows how to fetch+shape these (same grouped-by-key shape the demo
        // constants used) — same explicit-refresh-after-syncAll pattern parts
        // uses above, since syncAll's own internal refresh discards the result.
        try {
          const commentsData = await dataService.refresh("comments");
          if (!cancelled && commentsData) setComments(commentsData);
        } catch (err) {
          console.warn(
            "[AppCtx] Failed to load comments:",
            err?.message || err,
          );
        }
        try {
          const approvalsData = await dataService.refresh("approvals");
          if (!cancelled && approvalsData) setApprovals(approvalsData);
        } catch (err) {
          console.warn(
            "[AppCtx] Failed to load approvals:",
            err?.message || err,
          );
        }
        setApiLoading(false);
        {
          toast(__t("common.apiConnected"), { kind: "success" });
        }
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
      : [];

  // Never substitute the bundled demo BOM for real data. This used to be
  // `apiRows || data.rows`: before the parts API responded (and forever, if it
  // failed), every consumer -- Analytics, the BOM editor, search, sourcing --
  // silently rendered the DEMO assembly. No error, no empty state, just
  // plausible numbers that were not the user's. Screens must show real data or
  // an honest empty state.
  //
  // Fixing it here fixes every downstream `ctx?.rows || BOM_DATA.rows`
  // fallback too, because [] is truthy and so wins those expressions.
  const [rows, setRows] = React.useState(() => apiRows || []);
  const [vendors, setVendors] = React.useState(effectiveVendors);
  // Fix: comments/approvals used to seed from fake demo rows
  // (INITIAL_COMMENTS/INITIAL_APPROVALS in utils/constants.js — invented
  // names/statuses that never got overwritten by real data). Start empty,
  // like rows/vendors above, and hydrate from the real API below.
  const [comments, setComments] = React.useState({});
  const [approvals, setApprovals] = React.useState({});
  // fixfe: this used to default to INITIAL_NOTIFICATIONS (six fabricated
  // activity entries) via localStorage, so a fresh install opened with an unread
  // badge over events that never happened — and the localStorage mirror kept
  // serving those fakes back on every later boot. Notifications are
  // server-owned; start empty and hydrate from the API in loadFromAPI above.
  const [notifications, setNotifications] = React.useState([]);
  const [savedViews, setSavedViews] = React.useState(() =>
    storage.savedViews.get(),
  );
  const [project, setProject] = React.useState({ ...EMPTY_PROJECT });
  // Derived, not stored — see deriveRollup. `setRollup` is gone: its only caller
  // was switchProject, feeding it fixture numbers.
  const rollup = React.useMemo(() => deriveRollup(rows), [rows]);
  // fixfe: was hardcoded to "ATLAS", a fixture project code, so the crumb named
  // a project that may not exist in this workspace.
  const [activeProjectKey, setActiveProjectKey] = React.useState(EM_DASH);
  // Same instance-BOM id convention used by BomEditor/CostRollupView for the
  // structural bom_items_master API (neither the Parts-API row source nor
  // the demo fixture threads a real bom_id through yet).
  const bomId = project?.id || project?.bomId || data?.project?.id || 1;

  // fixfe: THE WORST ONE. This used to read `PROJECTS[key]` from
  // frontend/projects.js — a static fixture of invented parts, vendors and
  // costs — and do `setRows(p.rows); setProject(p.project); setRollup(p.rollup)`
  // before toasting success. Two clicks in the TopBar replaced the user's real
  // BOM with fiction, indistinguishably, while AppCtx's load path was carefully
  // avoiding exactly that substitution a few lines above.
  //
  // It now switches between the workspace's REAL projects (GET /api/v1/projects,
  // cached in apiProjects). If the requested project is not in that list nothing
  // changes and the failure is shown — there is no fixture to fall back to.
  //
  // `rows` are deliberately NOT touched: they are the tenant-wide Parts catalog
  // (GET /api/v1/parts has no project filter), not a per-project set. What the
  // switch really does change is `project`, and therefore `bomId`, which
  // refetches the project's bom_items_master lines in the effect below.
  const switchProject = React.useCallback(
    (key) => {
      const match = (apiProjects || []).find(
        (p) =>
          p.code === key || p.name === key || String(p.id) === String(key),
      );
      if (!match) {
        toast(
          __t("app.crumbSwitchProject") +
            ": " +
            key +
            " — " +
            __t("common.failed"),
          { kind: "error" },
        );
        return;
      }
      setActiveProjectKey(match.code || String(match.id));
      setProject(projectFromApi(match));
      setSelectedRow(null);
      setBomTab("hierarchy");
      setActiveCats([]);
      setSearch("");
      toast(
        __t("app.crumbSwitchProject") + ": " + (match.code || match.name),
        { kind: "success" },
      );
    },
    [apiProjects],
  );

  // fixfe: the bell's "Mark all read" / click-to-read only flipped local state,
  // so the badge silently came back on the next reload. Persist through
  // PUT /api/v1/notifications/{id}, and only mark read the ones that saved.
  const markNotificationsRead = React.useCallback(async (ids) => {
    const targets = (Array.isArray(ids) ? ids : [ids]).filter(
      (id) => id != null,
    );
    if (targets.length === 0) return;
    const results = await Promise.allSettled(
      targets.map((id) => api.notifications.update(id, { status: "read" })),
    );
    const saved = targets.filter((_, i) => results[i].status === "fulfilled");
    if (saved.length > 0) {
      setNotifications((prev) =>
        prev.map((n) => (saved.includes(n.id) ? { ...n, read: true } : n)),
      );
    }
    const failure = results.find((r) => r.status === "rejected");
    if (failure) throw failure.reason || new Error("Request failed");
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

  // Stamp data-a11y before paint, same rationale as data-theme above. An
  // empty modes array clears the attribute entirely rather than leaving
  // `data-a11y=""` (both are inert for the [data-a11y~="..."] selectors,
  // but an absent attribute is cleaner to inspect/debug).
  React.useLayoutEffect(() => {
    if (a11yModes.length > 0) {
      document.documentElement.setAttribute("data-a11y", a11yModes.join(" "));
    } else {
      document.documentElement.removeAttribute("data-a11y");
    }
  }, [a11yModes]);

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
  // fixfe: the localStorage mirror of notifications is gone with the fixture
  // seed. It existed only to persist the six invented entries; keeping it would
  // keep replaying a stale copy of server-owned data on every boot.
  // comments and approvals sync removed from localStorage
  React.useEffect(() => {
    storage.savedViews.set(savedViews);
  }, [savedViews]);

  React.useEffect(() => {
    if (apiConnected) dataService.syncAll();
  }, [apiConnected]);

  React.useEffect(() => {
    // Improvement #2: registered through services/navigation.js instead of
    // assigning navigateTo.
    const unregisterNavigator = setNavigator((r) => {
      setRoute(r);
      setSelectedRow(null);
    });
    // Improvement #2: window.__open_approve_b and window.__setBomSearch are
    // gone. Both consumers (DiffScreen, the BOM editor screens) live inside
    // this provider, so they call ctx.openModal / ctx.setSearch directly.
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setModal("global-search");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      unregisterNavigator();
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
    markNotificationsRead,
    savedViews,
    setSavedViews,
    project,
    setProject,
    rollup,
    activeProjectKey,
    apiProjects,
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
    a11yModes,
    toggleA11yMode,
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
