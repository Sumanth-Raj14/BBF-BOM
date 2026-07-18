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
    switchProject,
    unreadCount,
    bellRef,
    bellOpen,
    setBellOpen,
    notifications,
    setNotifications,
    setShowAI,
    setSearch,
    t,
    setTweak,
    themePref,
    setThemePref,
    mobileNavOpen,
    setMobileNavOpen,
  } = ctx;

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
          <span className="bbf-chevron">&lt;&lt;</span>
          <span className="bbf-wordmark-black">BLACKBOX</span>
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
              {
                icon: <Icon.Bom size={12} />,
                label: "ATLAS \u00B7 Mainframe",
                checked: activeProjectKey === "ATLAS",
                onClick: () => switchProject("ATLAS"),
              },
              {
                icon: <Icon.Bom size={12} />,
                label: "HORIZON \u00B7 Sensor Pod",
                checked: activeProjectKey === "HORIZON",
                onClick: () => switchProject("HORIZON"),
              },
              {
                icon: <Icon.Bom size={12} />,
                label: "ATLAS-LITE \u00B7 Eval Board",
                checked: activeProjectKey === "ATLAS-LITE",
                onClick: () => switchProject("ATLAS-LITE"),
              },
              {
                icon: <Icon.Bom size={12} />,
                label: "NEBULA \u00B7 IO Module",
                checked: activeProjectKey === "NEBULA",
                onClick: () => switchProject("NEBULA"),
              },
              "divider",
              {
                icon: <Icon.Plus size={12} />,
                label: __t("app.crumbNewProject"),
                onClick: () => toast(__t("common.loading")),
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
              {
                icon: <Icon.Bom size={12} />,
                label: "Mainframe Assembly (root)",
                onClick: () => {
                  setRoute("bom");
                  toast(__t("common.loading"));
                },
              },
              {
                icon: <Icon.Parts size={12} />,
                label: "Chassis Subassembly",
                onClick: () => {
                  setRoute("bom");
                  setSearch("Chassis");
                },
              },
              {
                icon: <Icon.Parts size={12} />,
                label: "Power Subsystem",
                onClick: () => {
                  setRoute("bom");
                  setSearch("Power");
                },
              },
              {
                icon: <Icon.Parts size={12} />,
                label: "Control Subsystem",
                onClick: () => {
                  setRoute("bom");
                  setSearch("Control");
                },
              },
              {
                icon: <Icon.Parts size={12} />,
                label: "I/O Module",
                onClick: () => {
                  setRoute("bom");
                  setSearch("I/O");
                },
              },
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
              onClick={() => {
                setNotifications((prev) =>
                  prev.map((n) => ({ ...n, read: true })),
                );
                toast(__t("app.notifMarkAllRead"));
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
              onClick={() => {
                setNotifications((prev) =>
                  prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)),
                );
                setBellOpen(false);
                if (n.route) setRoute(n.route);
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
