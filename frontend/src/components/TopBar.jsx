import React from "react";
import { AppContext } from "../context/AppCtx.jsx";
import { findNav } from "./NavRail.jsx";
import SyncStatus from "./SyncStatus.jsx";

import { __t } from "../i18n";
import { toast } from "../utils/toast";
import { DropdownButton, Popover, Presence } from "../globals";

const DENSITIES = [
  { v: "dense", label: "Compact density" },
  { v: "normal", label: "Normal density" },
  { v: "comfortable", label: "Comfortable density" },
];

const THEMES = [
  { v: "light", label: "Light theme", icon: Icon.Sun },
  { v: "dark", label: "Dark theme", icon: Icon.Moon },
  { v: "system", label: "Match system theme", icon: Icon.Monitor },
];

export default function TopBar() {
  const ctx = React.useContext(AppContext);
  const {
    apiConnected,
    apiLoading,
    setModal,
    setRoute,
    route,
    project,
    activeProjectKey,
    apiProjects,
    switchProject,
    rows,
    unreadCount,
    bellRef,
    bellOpen,
    setBellOpen,
    notifications,
    markNotificationsRead,
    setShowAI,
    setSearch,
    t,
    setTweak,
    themePref,
    setThemePref,
    mobileNavOpen,
    setMobileNavOpen,
  } = ctx;

  // fixfe: this dropdown used to hardcode four fixture projects — ATLAS,
  // HORIZON, ATLAS-LITE, NEBULA — each wired to switchProject(), which pasted
  // the invented BOM from frontend/projects.js over the user's real data. The
  // list is now the workspace's real projects (GET /api/v1/projects, held on
  // ctx.apiProjects). No projects means an empty, non-clickable state; there is
  // nothing to fall back to and nothing worth inventing.
  const projectItems = React.useMemo(() => {
    const list = Array.isArray(apiProjects) ? apiProjects : [];
    if (list.length === 0) {
      return [
        {
          header: apiLoading
            ? __t("common.loading")
            : __t("app.crumbNoProjects") || "No projects in this workspace",
        },
      ];
    }
    return list.map((p) => {
      const key = p.code || String(p.id);
      return {
        icon: <Icon.Bom size={12} />,
        label: key + (p.name ? " · " + p.name : ""),
        checked: activeProjectKey === key,
        onClick: () => switchProject(key),
      };
    });
  }, [apiProjects, apiLoading, activeProjectKey, switchProject]);

  // fixfe: the "jump to sub-assembly" menu listed five invented sub-assemblies
  // from the ATLAS fixture ("Chassis Subassembly", "Power Subsystem", …) no
  // matter what BOM was open, and the first entry only toasted "Loading…"
  // forever. These are now the real assemblies present in ctx.rows.
  const subassemblyItems = React.useMemo(() => {
    const found = [];
    const seen = new Set();
    const visit = (row) => {
      if (!row) return;
      const kids = Array.isArray(row.children) ? row.children : [];
      const label = row.name || row.pn;
      if ((row.assembly || kids.length > 0) && label && !seen.has(label)) {
        seen.add(label);
        found.push(label);
      }
      kids.forEach(visit);
    };
    (Array.isArray(rows) ? rows : []).forEach(visit);
    if (found.length === 0) {
      return [
        {
          header:
            __t("app.crumbNoSubassemblies") || "No sub-assemblies in this BOM",
        },
      ];
    }
    return found.slice(0, 8).map((label) => ({
      icon: <Icon.Parts size={12} />,
      label,
      onClick: () => {
        setRoute("bom");
        setSearch(label);
      },
    }));
  }, [rows, setRoute, setSearch]);

  const markRead = React.useCallback(
    async (ids) => {
      try {
        await markNotificationsRead(ids);
        return true;
      } catch (e) {
        toast(
          __t("common.failedWithMessage", {
            message: (e && e.message) || String(e),
          }),
          { kind: "error" },
        );
        return false;
      }
    },
    [markNotificationsRead],
  );

  return (
    <>
      <header className="topbar">
        <button
          type="button"
          id="nav-toggle-btn"
          className="icon-btn nav-toggle"
          aria-label={mobileNavOpen ? "Close navigation" : "Open navigation"}
          title={mobileNavOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={mobileNavOpen}
          aria-controls="primary-nav"
          onClick={() => setMobileNavOpen((o) => !o)}
        >
          {mobileNavOpen ? <Icon.Close size={16} /> : <Icon.Menu size={16} />}
        </button>
        <div className="brand">
          <img
            src="/bbf-logo.svg"
            alt="Blackbox Factories"
            className="bbf-logo"
            style={{ height: 24, width: "auto" }}
          />
        </div>
        <div className="wordmark">
          <span className="bbf-wordmark-bom">BOM</span>
          {apiConnected && (
            <span className="bbf-badge bbf-badge-olive fs-9">
              {__t("app.badgeApi")}
            </span>
          )}
          <SyncStatus />
          {!apiConnected && !apiLoading && (
            <span className="bbf-badge bbf-badge-orange fs-9">
              {__t("app.badgeOffline")}
            </span>
          )}
        </div>
        <div className="crumbs">
          <button
            className="crumb-btn"
            onClick={() => setModal("settings")}
            title={__t("settings.title")}
          >
            {__t("app.crumbWorkspace")}
          </button>
          <span className="sep">/</span>
          <DropdownButton
            width={260}
            align="left"
            trigger={
              <button className="crumb-btn crumb-btn-drop">
                {activeProjectKey} <Icon.ChevronDown size={9} />
              </button>
            }
            items={[
              { header: __t("app.crumbSwitchProject") },
              ...projectItems,
              "divider",
              {
                icon: <Icon.Plus size={12} />,
                // fixfe: this used to toast "Loading\u2026" and do nothing at all,
                // so it read as a create that was in progress. POST
                // /api/v1/projects exists, but there is no project-creation
                // form in this build to collect a code + name, so the control
                // says so plainly instead of pretending.
                label:
                  __t("app.crumbNewProject") +
                  " \u2014 " +
                  (__t("common.notAvailableInBuild") ||
                    "not available in this build"),
                onClick: () =>
                  toast(
                    __t("app.crumbNewProjectUnavailable") ||
                      "Creating a project isn't available in this build yet. Nothing was created.",
                    { kind: "warn" },
                  ),
              },
              {
                icon: <Icon.Settings size={12} />,
                label: __t("app.crumbManageProjects"),
                onClick: () => setModal("settings"),
              },
            ]}
          />
          <span className="sep">/</span>
          <DropdownButton
            width={240}
            align="left"
            trigger={
              <button className="crumb-btn crumb-btn-drop">
                {project.name} <Icon.ChevronDown size={9} />
              </button>
            }
            items={[
              { header: __t("app.crumbJumpToSubassembly") },
              ...subassemblyItems,
              "divider",
              {
                icon: <Icon.Diff size={12} />,
                label: __t("app.crumbCompareRevisions"),
                onClick: () => setRoute("diff"),
              },
              {
                icon: <Icon.Activity size={12} />,
                label: __t("app.crumbProjectActivity"),
                onClick: () => setRoute("activity"),
              },
            ]}
          />
          <span className="sep">/</span>
          <button
            className="crumb-btn crumb-btn-here"
            onClick={() => {
              setRoute(route);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          >
            {findNav(route)?.label}
          </button>
        </div>
        <div className="topbar-spacer" />
        <Presence />
        <button
          onClick={() => setModal("global-search")}
          className="search c-pointer border-line text-left"
          title={__t("common.search") + " (\u2318K)"}
        >
          <Icon.Search size={13} />
          <span className="flex-1 fg-3 fs-12">
            {__t("app.searchPlaceholder")}
          </span>
          <span className="kbd">{__t("app.searchKbd")}</span>
        </button>

        <div
          className="density-seg"
          role="group"
          aria-label="Row density"
          title="Row density"
        >
          {DENSITIES.map((d) => (
            <button
              key={d.v}
              type="button"
              className={"density-opt" + (t.density === d.v ? " active" : "")}
              aria-pressed={t.density === d.v}
              aria-label={d.label}
              title={d.label}
              onClick={() => setTweak("density", d.v)}
            >
              <span className={"density-glyph d-" + d.v} aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            </button>
          ))}
        </div>

        <div
          className="theme-seg"
          role="group"
          aria-label="Theme"
          title="Theme"
        >
          {THEMES.map((opt) => (
            <button
              key={opt.v}
              type="button"
              className={"theme-opt" + (themePref === opt.v ? " active" : "")}
              aria-pressed={themePref === opt.v}
              aria-label={opt.label}
              title={opt.label}
              onClick={() => setThemePref(opt.v)}
            >
              <opt.icon size={13} />
            </button>
          ))}
        </div>

        <button
          className="icon-btn"
          title={__t("app.aiCopilot")}
          aria-label={__t("app.aiCopilot")}
          onClick={() => setShowAI((o) => !o)}
        >
          <Icon.Sparkles size={14} />
        </button>
        <button
          ref={bellRef}
          title={__t("app.notifications")}
          aria-label={__t("app.notifications")}
          className="icon-btn relative"
          onClick={() => setBellOpen((o) => !o)}
        >
          <Icon.Bell size={14} />
          {unreadCount > 0 && (
            <span className="pos-absolute">{unreadCount}</span>
          )}
        </button>
        <button
          className="icon-btn"
          title={__t("userMenu.workspaceSettings")}
          aria-label={__t("userMenu.workspaceSettings")}
          onClick={() => setModal("settings")}
        >
          <Icon.Settings size={14} />
        </button>
      </header>

      <Popover
        open={bellOpen}
        onClose={() => setBellOpen(false)}
        anchorRef={bellRef}
        width={360}
      >
        <div className="popover-h">
          <span className="t">{__t("app.notifications")}</span>
          {unreadCount > 0 && (
            <button
              className="act"
              // fixfe: this flipped `read` in local state and toasted
              // immediately, so it claimed a persisted change that never left
              // the browser — the badge came straight back on reload. Now it
              // awaits PUT /api/v1/notifications/{id} for each unread item and
              // only confirms once the server accepted them.
              onClick={async () => {
                const ids = notifications
                  .filter((n) => !n.read)
                  .map((n) => n.id);
                if (await markRead(ids)) {
                  toast(__t("app.notifMarkAllRead"), { kind: "success" });
                }
              }}
            >
              {__t("app.notifMarkAllRead")}
            </button>
          )}
        </div>
        <div className="popover-list">
          {notifications.map((n) => (
            <div
              key={n.id}
              // fixfe: same local-only read flip as "Mark all read" above.
              // Persisted through markNotificationsRead now; if the server
              // rejects it the item honestly stays unread.
              onClick={() => {
                setBellOpen(false);
                if (n.route) setRoute(n.route);
                if (!n.read) markRead([n.id]);
              }}
              className={"notif-item cursor-pointer " + (n.read ? "read" : "")}
            >
              <span className="dot" />
              <div className="body">
                <strong>{n.who}</strong> {n.action}{" "}
                <span className="obj">{n.obj}</span>
                <span className="time">{n.time} ago</span>
              </div>
            </div>
          ))}
          {notifications.length === 0 && (
            <div
              className="text-center fg-3 fs-12"
              style={{ padding: "30px 20px" }}
            >
              {__t("app.notifAllCaughtUp")}
            </div>
          )}
        </div>
        <div className="border-top text-center" style={{ padding: "8px 12px" }}>
          <button
            className="act bg-transparent b-0 fg-accent fs-11 font-mono c-pointer"
            onClick={() => {
              setBellOpen(false);
              setRoute("activity");
            }}
          >
            {__t("app.notifViewAllActivity")}
          </button>
        </div>
      </Popover>
    </>
  );
}
