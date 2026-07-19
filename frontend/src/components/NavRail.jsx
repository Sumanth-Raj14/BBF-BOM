import React from "react";
import { AppContext } from "../context/AppCtx.jsx";
import { storage } from "../utils/storage.js";
import { __t } from "../i18n";
import { toast } from "../utils/toast";
import { Popover, api } from "../globals";

// ── Information architecture ───────────────────────────────────────────────
// PRIMARY: ~8–12 most-used destinations, promoted to the top of the rail with
// no section header. SECTIONS: the remaining destinations grouped under
// VISIBLE text headers (Linear/Jira pattern). Every route id resolves through
// exactly one entry so `findNav` and the ⌘1–9 shortcuts keep working.
const size = 17;

export const PRIMARY = [
  { id: "dashboard", label: "Dashboard", icon: <Icon.Chart size={size} /> },
  { id: "bom", label: "BOM Editor", icon: <Icon.Bom size={size} /> },
  { id: "parts", label: "Components", icon: <Icon.Parts size={size} /> },
  { id: "ecr", label: "Change Requests", icon: <Icon.Edit size={size} /> },
  { id: "work-orders", label: "Work Orders", icon: <Icon.Tools size={size} /> },
  { id: "my-work", label: "My Work", icon: <Icon.User size={size} /> },
  { id: "procurement", label: "Procurement", icon: <Icon.Cart size={size} /> },
  { id: "vendors", label: "Suppliers", icon: <Icon.Vendor size={size} /> },
  { id: "inventory", label: "Inventory", icon: <Icon.Scan size={size} /> },
  { id: "analytics", label: "Analytics", icon: <Icon.Chart size={size} /> },
  { id: "integrations", label: "Integrations", icon: <Icon.Link size={size} /> },
  { id: "tenant-admin", label: "Admin", icon: <Icon.Settings size={size} /> },
];

export const SECTIONS = [
  {
    label: __t("navGroup.engineering") || "Engineering",
    items: [
      { id: "diff", label: "Compare Revisions", icon: <Icon.Diff size={size} /> },
      { id: "pdm", label: "CAD Vault", icon: <Icon.Doc size={size} /> },
      { id: "routing", label: "Routings & Processes", icon: <Icon.Activity size={size} /> },
    ],
  },
  {
    label: __t("navGroup.quality") || "Quality",
    items: [
      { id: "qms", label: "QMS Dashboard", icon: <Icon.Activity size={size} /> },
      { id: "ncr", label: "Non-Conformance", icon: <Icon.Flag size={size} /> },
      { id: "compliance", label: "Compliance", icon: <Icon.Check size={size} /> },
    ],
  },
  {
    label: __t("navGroup.operations") || "Operations",
    items: [
      { id: "work-centers", label: "Work Centers", icon: <Icon.Settings size={size} /> },
      { id: "labor", label: "Labor & Timesheets", icon: <Icon.History size={size} /> },
      { id: "calendar", label: "Calendar & Timeline", icon: <Icon.Calendar size={size} /> },
      { id: "approvals", label: "Approvals Inbox", icon: <Icon.Bell size={size} /> },
    ],
  },
  {
    label: __t("navGroup.supplyChain") || "Supply Chain",
    items: [
      { id: "order-tracking", label: "Order Tracking", icon: <Icon.Send size={size} /> },
      { id: "supplier-portal", label: "Supplier Portal", icon: <Icon.Export size={size} /> },
    ],
  },
  {
    label: __t("navGroup.documents") || "Documents",
    items: [
      { id: "docs", label: __t("navGroup.documents") || "Documents", icon: <Icon.Folder size={size} /> },
      { id: "ocr", label: "OCR Upload", icon: <Icon.Upload size={size} /> },
      { id: "bulk-import", label: "Bulk Import", icon: <Icon.Import size={size} /> },
    ],
  },
  {
    label: __t("navGroup.insights") || "Insights",
    items: [
      { id: "ai", label: "AI & Automation", icon: <Icon.Sparkles size={size} /> },
      { id: "activity", label: "Team Activity", icon: <Icon.User size={size} /> },
    ],
  },
  {
    label: __t("navGroup.integration") || "Connectors",
    items: [
      { id: "webhooks", label: "Webhooks", icon: <Icon.Link size={size} /> },
      { id: "erp", label: "ERP Connectors", icon: <Icon.Refresh size={size} /> },
      { id: "zoho-books", label: "Zoho Books", icon: <Icon.Refresh size={size} /> },
      { id: "monitoring", label: "Monitoring", icon: <Icon.Activity size={size} /> },
    ],
  },
  {
    label: __t("navGroup.enterprise") || "Enterprise",
    items: [
      { id: "enterprise-dashboards", label: "Enterprise Dashboards", icon: <Icon.Chart size={size} /> },
      { id: "service-bom", label: "Service BOMs", icon: <Icon.Bom size={size} /> },
      { id: "currency", label: "Currency & FX", icon: <Icon.Cart size={size} /> },
      { id: "compliance-autonumber", label: "Compliance & Numbering", icon: <Icon.Flag size={size} /> },
      { id: "custom-attributes", label: "Custom Attributes", icon: <Icon.Sliders size={size} /> },
      { id: "api-keys", label: "API Keys", icon: <Icon.Key size={size} /> },
    ],
  },
  {
    label: __t("navGroup.system") || "Tools",
    items: [
      { id: "scanner", label: "Mobile Scanner", icon: <Icon.Scan size={size} /> },
    ],
  },
];

// Keep GROUPS as a flat [{label, items}] list (primary first) so the ⌘1–9
// keyboard shortcuts and `findNav` keep resolving every destination.
export const GROUPS = [
  { label: __t("navGroup.core") || "Workspace", items: PRIMARY },
  ...SECTIONS,
];

export function findNav(id) {
  for (const g of GROUPS) {
    const f = g.items.find((n) => n.id === id);
    if (f) return f;
  }
}

function applyCollapsed(v) {
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute(
      "data-nav-collapsed",
      v ? "true" : "false",
    );
  }
}

function initials(user) {
  return (
    user?.init ||
    user?.name
      ?.split(" ")
      .map((s) => s[0])
      .join("") ||
    "?"
  );
}

export default function NavRail() {
  const ctx = React.useContext(AppContext);
  const {
    route,
    setRoute,
    setSelectedRow,
    authed,
    userRole,
    setUserRole,
    setModal,
    setShowTour,
    setShowMobileScan,
    setAuthed,
    setOnboardingDone,
    avatarRef,
    avaOpen,
    setAvaOpen,
    mobileNavOpen,
    setMobileNavOpen,
  } = ctx;

  const [collapsed, setCollapsed] = React.useState(() =>
    storage.nav.getCollapsed(),
  );

  React.useLayoutEffect(() => {
    applyCollapsed(collapsed);
  }, [collapsed]);

  // Close the mobile drawer on Escape.
  React.useEffect(() => {
    if (!mobileNavOpen) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setMobileNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileNavOpen, setMobileNavOpen]);

  // Mobile drawer focus management: move focus into the rail when it opens
  // (Esc / scrim-click / navigate all funnel through setMobileNavOpen(false),
  // so restoring focus to the hamburger on the false-transition covers all
  // three close paths uniformly).
  const wasMobileOpenRef = React.useRef(false);
  React.useEffect(() => {
    if (mobileNavOpen) {
      wasMobileOpenRef.current = true;
      const rail = document.getElementById("primary-nav");
      const firstFocusable = rail?.querySelector(
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      );
      firstFocusable?.focus();
    } else if (wasMobileOpenRef.current) {
      wasMobileOpenRef.current = false;
      document.getElementById("nav-toggle-btn")?.focus();
    }
  }, [mobileNavOpen]);

  // If the viewport grows past the ≤900px breakpoint while the drawer is open,
  // close it so it never lingers as a stray overlay on desktop.
  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia("(min-width: 901px)");
    const onChange = (e) => {
      if (e.matches) setMobileNavOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [setMobileNavOpen]);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      storage.nav.setCollapsed(next);
      return next;
    });
  };

  const go = (id) => {
    setRoute(id);
    setSelectedRow(null);
    setMobileNavOpen(false);
  };

  const renderItem = (n) => {
    const active = route === n.id;
    return (
      <li key={n.id}>
        <button
          type="button"
          className={"nav-item" + (active ? " active" : "")}
          aria-current={active ? "page" : undefined}
          title={collapsed ? n.label : undefined}
          onClick={() => go(n.id)}
        >
          <span className="nav-item-icon" aria-hidden="true">
            {n.icon}
          </span>
          <span className="nav-item-label">{n.label}</span>
        </button>
      </li>
    );
  };

  const roleShort =
    userRole === "Admin"
      ? "Admin"
      : userRole === "Engineering"
        ? "Engineering"
        : userRole === "Procurement"
          ? "Procurement"
          : userRole === "Finance"
            ? "Finance"
            : userRole || "Viewer";

  return (
    <>
      <div
        className={"nav-scrim" + (mobileNavOpen ? " open" : "")}
        aria-hidden="true"
        hidden={!mobileNavOpen}
        onClick={() => setMobileNavOpen(false)}
      />
      <nav
        id="primary-nav"
        className="navrail"
        aria-label="Main navigation"
        data-collapsed={collapsed ? "true" : "false"}
        data-mobile-open={mobileNavOpen ? "true" : "false"}
      >
      <div className="navrail-scroll">
        <ul className="nav-list nav-list-primary">{PRIMARY.map(renderItem)}</ul>

        {SECTIONS.map((section) => (
          <div className="nav-section" key={section.label}>
            <div
              className="nav-section-label"
              title={collapsed ? section.label : undefined}
            >
              <span className="nav-section-text">{section.label}</span>
              <span className="nav-section-rule" aria-hidden="true" />
            </div>
            <ul className="nav-list">{section.items.map(renderItem)}</ul>
          </div>
        ))}
      </div>

      <div className="navrail-footer">
        <button
          ref={avatarRef}
          type="button"
          className="nav-account"
          onClick={() => setAvaOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={avaOpen}
          title={collapsed ? authed?.name || "Account" : undefined}
        >
          <span className="avatar nav-account-avatar">{initials(authed)}</span>
          <span className="nav-account-meta">
            <span className="nav-account-name">
              {authed?.name || "Elena Chen"}
            </span>
            <span className="nav-account-role">{roleShort}</span>
          </span>
          <span className="nav-account-caret" aria-hidden="true">
            <Icon.ChevronDown size={12} />
          </span>
        </button>

        <button
          type="button"
          className="nav-collapse-btn"
          onClick={toggleCollapsed}
          aria-pressed={collapsed}
          title={collapsed ? "Expand navigation" : "Collapse navigation"}
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
        >
          <span className="nav-item-icon" aria-hidden="true">
            {collapsed ? (
              <Icon.ChevronRight size={16} />
            ) : (
              <Icon.ChevronLeft size={16} />
            )}
          </span>
          <span className="nav-item-label">Collapse</span>
        </button>
      </div>

      <Popover
        open={avaOpen}
        onClose={() => setAvaOpen(false)}
        anchorRef={avatarRef}
        width={248}
      >
        <div className="user-menu">
          <div className="header">
            <span className="avatar w-32 h-32 fs-12">{initials(authed)}</span>
            <div>
              <div className="name">{authed?.name || "Elena Chen"}</div>
              <div className="role">
                {userRole || __t("navGroup.engineering")}
              </div>
            </div>
          </div>
          <button
            className="popover-item"
            onClick={() => {
              setAvaOpen(false);
              setModal("profile");
            }}
          >
            <span className="ic">
              <Icon.Parts size={12} />
            </span>
            <span className="lbl">{__t("userMenu.profile")}</span>
          </button>
          <button
            className="popover-item"
            onClick={() => {
              setAvaOpen(false);
              setModal("settings");
            }}
          >
            <span className="ic">
              <Icon.Settings size={12} />
            </span>
            <span className="lbl">{__t("userMenu.workspaceSettings")}</span>
          </button>

          <div className="popover-divider" />
          <button
            className="popover-item"
            onClick={() => {
              setAvaOpen(false);
              setModal("api-keys");
            }}
          >
            <span className="ic">
              <Icon.Link size={12} />
            </span>
            <span className="lbl">{__t("userMenu.apiKeys")}</span>
          </button>
          <button
            className="popover-item"
            onClick={() => {
              setAvaOpen(false);
              setModal("audit-log");
            }}
          >
            <span className="ic">
              <Icon.Activity size={12} />
            </span>
            <span className="lbl">Audit log</span>
          </button>
          <button
            className="popover-item"
            onClick={() => {
              setAvaOpen(false);
              setModal("share-link");
            }}
          >
            <span className="ic">
              <Icon.Link size={12} />
            </span>
            <span className="lbl">Share BOM</span>
          </button>
          <button
            className="popover-item"
            onClick={() => {
              setAvaOpen(false);
              setModal("webhooks");
            }}
          >
            <span className="ic">
              <Icon.Link size={12} />
            </span>
            <span className="lbl">Webhooks</span>
          </button>
          <button
            className="popover-item"
            onClick={() => {
              setAvaOpen(false);
              setModal("scheduled-reports");
            }}
          >
            <span className="ic">
              <Icon.Doc size={12} />
            </span>
            <span className="lbl">Scheduled reports</span>
          </button>
          <button
            className="popover-item"
            onClick={() => {
              setAvaOpen(false);
              setModal("email-parse");
            }}
          >
            <span className="ic">
              <Icon.Sparkles size={12} />
            </span>
            <span className="lbl">Email auto-parse</span>
          </button>
          <button
            className="popover-item"
            onClick={() => {
              setAvaOpen(false);
              setModal("landed-cost");
            }}
          >
            <span className="ic">$</span>
            <span className="lbl">Landed cost calculator</span>
          </button>
          <button
            className="popover-item"
            onClick={() => {
              setAvaOpen(false);
              setModal("margin");
            }}
          >
            <span className="ic">%</span>
            <span className="lbl">Margin calculator</span>
          </button>
          <button
            className="popover-item"
            onClick={() => {
              setAvaOpen(false);
              setModal("cost-sim");
            }}
          >
            <span className="ic">
              <Icon.Sparkles size={12} />
            </span>
            <span className="lbl">Cost what-if simulator</span>
          </button>

          <div className="popover-divider" />
          <button
            className="popover-item"
            onClick={() => {
              setAvaOpen(false);
              setModal("notif-prefs");
            }}
          >
            <span className="ic">
              <Icon.Bell size={12} />
            </span>
            <span className="lbl">Notification preferences</span>
          </button>
          <button
            className="popover-item"
            onClick={() => {
              setAvaOpen(false);
              setModal("roadmap");
            }}
          >
            <span className="ic">
              <Icon.Sparkles size={12} />
            </span>
            <span className="lbl">Product roadmap</span>
          </button>
          <button
            className="popover-item"
            onClick={() => {
              setAvaOpen(false);
              setShowTour(true);
            }}
          >
            <span className="ic">
              <Icon.Sparkles size={12} />
            </span>
            <span className="lbl">Take product tour</span>
          </button>
          <button
            className="popover-item"
            onClick={() => {
              setAvaOpen(false);
              if (window.__toggleOffline) window.__toggleOffline();
              else toast("Offline simulation unavailable");
            }}
          >
            <span className="ic">{"⌥"}</span>
            <span className="lbl">Simulate offline</span>
          </button>
          <button
            className="popover-item"
            onClick={() => {
              setAvaOpen(false);
              setModal("pricing");
            }}
          >
            <span className="ic">$</span>
            <span className="lbl">Plans &amp; pricing</span>
          </button>
          <button
            className="popover-item"
            onClick={() => {
              setAvaOpen(false);
              setModal("help");
            }}
          >
            <span className="ic">?</span>
            <span className="lbl">Help &amp; shortcuts</span>
          </button>
          <button
            className="popover-item"
            onClick={() => {
              setAvaOpen(false);
              setShowMobileScan(true);
            }}
          >
            <span className="ic">
              <Icon.Scan size={12} />
            </span>
            <span className="lbl">Open mobile scan view</span>
          </button>

          <div className="popover-divider" />
          <div className="popover-section-label">Switch role (demo)</div>
          {["Admin", "Engineering", "Procurement", "Finance", "Viewer"].map(
            (r) => (
              <button
                key={r}
                className="popover-item"
                onClick={() => {
                  setAvaOpen(false);
                  storage.role.set(r);
                  setUserRole(r);
                  toast("Now viewing as " + r);
                }}
              >
                <span className="ic">
                  {userRole === r ? (
                    <Icon.Check size={11} />
                  ) : (
                    <span style={{ width: 11 }} />
                  )}
                </span>
                <span className="lbl">{r}</span>
              </button>
            ),
          )}

          <div className="popover-divider" />
          <button
            className="popover-item danger"
            onClick={async () => {
              setAvaOpen(false);
              try {
                await api.auth.logout();
              } catch {
                /* best-effort */
              }
              storage.auth.remove();
              setAuthed(null);
              setOnboardingDone(false);
              toast("Signed out", { kind: "warn" });
            }}
          >
            <span className="ic">{"⏏"}</span>
            <span className="lbl">Sign out</span>
          </button>
        </div>
      </Popover>
      </nav>
    </>
  );
}
