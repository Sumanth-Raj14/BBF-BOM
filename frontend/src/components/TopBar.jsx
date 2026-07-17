import React from "react";
import { AppContext } from "../context/AppCtx.jsx";
import { findNav } from "./NavRail.jsx";
import SyncStatus from "./SyncStatus.jsx";

import { __t } from "../i18n";
import { toast } from "../utils/toast";
import { storage } from "../utils/storage.js";
import { DropdownButton, Popover, Presence, api } from "../globals";
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
    authed,
    userRole,
    unreadCount,
    bellRef,
    avatarRef,
    bellOpen,
    setBellOpen,
    avaOpen,
    setAvaOpen,
    notifications,
    setNotifications,
    setShowAI,
    setSearch,
    setShowTour,
    setUserRole,
    setShowMobileScan,
    setAuthed,
    setOnboardingDone,
  } = ctx;

  return (
    <>
      <header className="topbar">
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

        <button
          ref={bellRef}
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
        <span className="inline-flex items-center gap-4 pos-relative">
          <button
            ref={avatarRef}
            onClick={() => setAvaOpen((o) => !o)}
            className="avatar b-0 c-pointer"
          >
            {authed?.init ||
              authed?.name
                ?.split(" ")
                .map((s) => s[0])
                .join("") ||
              "?"}
          </button>
          <span className="pos-absolute">
            {userRole === "Admin"
              ? "ADMIN"
              : userRole === "Engineering"
                ? "ENG"
                : userRole === "Procurement"
                  ? "PROC"
                  : userRole === "Finance"
                    ? "FIN"
                    : "VIEW"}
          </span>
        </span>
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

      <Popover
        open={avaOpen}
        onClose={() => setAvaOpen(false)}
        anchorRef={avatarRef}
        width={240}
      >
        <div className="user-menu">
          <div className="header">
            <span className="avatar w-32 h-32 fs-12">
              {authed?.init ||
                authed?.name
                  ?.split(" ")
                  .map((s) => s[0])
                  .join("") ||
                "?"}
            </span>
            <div>
              <div className="name">{authed?.name || "Elena Chen"}</div>
              <div className="role">{userRole || __t("navGroup.engineering")}</div>
            </div>
          </div>
          <button className="popover-item" onClick={() => { setAvaOpen(false); setModal("profile"); }}>
            <span className="ic"><Icon.Parts size={12} /></span>
            <span className="lbl">{__t("userMenu.profile")}</span>
          </button>
          <button className="popover-item" onClick={() => { setAvaOpen(false); setModal("settings"); }}>
            <span className="ic"><Icon.Settings size={12} /></span>
            <span className="lbl">{__t("userMenu.workspaceSettings")}</span>
          </button>

          <div className="popover-divider" />
          <button className="popover-item" onClick={() => { setAvaOpen(false); setModal("api-keys"); }}>
            <span className="ic"><Icon.Link size={12} /></span>
            <span className="lbl">{__t("userMenu.apiKeys")}</span>
          </button>
          <button className="popover-item" onClick={() => { setAvaOpen(false); setModal("audit-log"); }}>
            <span className="ic"><Icon.Activity size={12} /></span>
            <span className="lbl">Audit log</span>
          </button>
          <button className="popover-item" onClick={() => { setAvaOpen(false); setModal("share-link"); }}>
            <span className="ic"><Icon.Link size={12} /></span>
            <span className="lbl">Share BOM</span>
          </button>
          <button className="popover-item" onClick={() => { setAvaOpen(false); setModal("webhooks"); }}>
            <span className="ic"><Icon.Link size={12} /></span>
            <span className="lbl">Webhooks</span>
          </button>
          <button className="popover-item" onClick={() => { setAvaOpen(false); setModal("scheduled-reports"); }}>
            <span className="ic"><Icon.Doc size={12} /></span>
            <span className="lbl">Scheduled reports</span>
          </button>
          <button className="popover-item" onClick={() => { setAvaOpen(false); setModal("email-parse"); }}>
            <span className="ic"><Icon.Sparkles size={12} /></span>
            <span className="lbl">Email auto-parse</span>
          </button>
          <button className="popover-item" onClick={() => { setAvaOpen(false); setModal("landed-cost"); }}>
            <span className="ic">$</span>
            <span className="lbl">Landed cost calculator</span>
          </button>
          <button className="popover-item" onClick={() => { setAvaOpen(false); setModal("margin"); }}>
            <span className="ic">%</span>
            <span className="lbl">Margin calculator</span>
          </button>
          <button className="popover-item" onClick={() => { setAvaOpen(false); setModal("cost-sim"); }}>
            <span className="ic"><Icon.Sparkles size={12} /></span>
            <span className="lbl">Cost what-if simulator</span>
          </button>

          <div className="popover-divider" />
          <button className="popover-item" onClick={() => { setAvaOpen(false); setModal("notif-prefs"); }}>
            <span className="ic"><Icon.Bell size={12} /></span>
            <span className="lbl">Notification preferences</span>
          </button>
          <button className="popover-item" onClick={() => { setAvaOpen(false); setModal("roadmap"); }}>
            <span className="ic"><Icon.Sparkles size={12} /></span>
            <span className="lbl">Product roadmap</span>
          </button>
          <button className="popover-item" onClick={() => { setAvaOpen(false); setShowTour(true); }}>
            <span className="ic"><Icon.Sparkles size={12} /></span>
            <span className="lbl">Take product tour</span>
          </button>
          <button className="popover-item" onClick={() => { setAvaOpen(false); if (window.__toggleOffline) window.__toggleOffline(); else toast("Offline simulation unavailable"); }}>
            <span className="ic">{"⌥"}</span>
            <span className="lbl">Simulate offline</span>
          </button>
          <button className="popover-item" onClick={() => { setAvaOpen(false); setModal("pricing"); }}>
            <span className="ic">$</span>
            <span className="lbl">Plans &amp; pricing</span>
          </button>
          <button className="popover-item" onClick={() => { setAvaOpen(false); setModal("help"); }}>
            <span className="ic">?</span>
            <span className="lbl">Help &amp; shortcuts</span>
          </button>
          <button className="popover-item" onClick={() => { setAvaOpen(false); setShowMobileScan(true); }}>
            <span className="ic"><Icon.Scan size={12} /></span>
            <span className="lbl">Open mobile scan view</span>
          </button>

          <div className="popover-divider" />
          <div className="popover-section-label">Switch role (demo)</div>
          {["Admin", "Engineering", "Procurement", "Finance", "Viewer"].map((r) => (
            <button
              key={r}
              className="popover-item"
              onClick={() => { setAvaOpen(false); storage.role.set(r); setUserRole(r); toast("Now viewing as " + r); }}
            >
              <span className="ic">{userRole === r ? <Icon.Check size={11} /> : <span style={{ width: 11 }} />}</span>
              <span className="lbl">{r}</span>
            </button>
          ))}

          <div className="popover-divider" />
          <button
            className="popover-item danger"
            onClick={async () => {
              setAvaOpen(false);
              try { await api.auth.logout(); } catch { /* best-effort */ }
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
    </>
  );
}
