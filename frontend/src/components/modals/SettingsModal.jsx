import PropTypes from "prop-types";

import { AppContext } from "../../context/AppCtx.jsx";
import { navigateTo } from "../../services/navigation.js";
import { __t } from "../../i18n";
import { Icon, api } from "../../globals";
import { apiRequest } from "../../../api.js";
import {
  Modal,
  Button,
  StatusPill,
  Switch,
  DataTable,
  EmptyState,
  Spinner,
} from "../ui";

// ============ WORKSPACE SETTINGS ============
// Fix (dead-fakes cleanup): every tab here used to show hardcoded members,
// a hardcoded permission matrix, hardcoded integration cards (SolidWorks,
// NetSuite, Slack, Google Drive, Jira — none of which are real providers),
// and a hardcoded billing plan/invoice, all with buttons that only toasted
// success. Members/Roles/Integrations now load real data (GET /users,
// GET /rbac/roles + /rbac/permissions, GET /integrations/); actions that
// have no backing endpoint (invite, per-member role change, billing) are
// dropped rather than faked. "General" keeps only the accessibility toggles,
// the one thing on this modal that actually persists (via AppContext).

function useAsync(loader, deps) {
  const [state, setState] = React.useState({ loading: true, data: null, error: null });
  React.useEffect(() => {
    let cancelled = false;
    setState({ loading: true, data: null, error: null });
    loader()
      .then((data) => {
        if (!cancelled) setState({ loading: false, data, error: null });
      })
      .catch((e) => {
        if (!cancelled)
          setState({ loading: false, data: null, error: e?.message || "Failed to load" });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

function LoadPanel({ loading, error, empty, children }) {
  if (loading) return <Spinner label={__t("common.loading") || "Loading…"} />;
  if (error)
    return (
      <p className="fs-12 fg-3">
        {__t("common.loadFailed") || "Load failed"}: {error}
      </p>
    );
  if (empty) return <EmptyState message={__t("common.noData") || "No data"} />;
  return children;
}

export default function SettingsModal({ open, onClose }) {
  const ctx = React.useContext(AppContext);
  const { a11yModes = [], toggleA11yMode } = ctx || {};
  const [tab, setTab] = React.useState("general");
  const navRefs = React.useRef([]);

  const sections = [
    { id: "general", label: __t("workspace.general") || "General", icon: Icon.Settings },
    { id: "members", label: __t("workspace.members") || "Members", icon: Icon.User },
    {
      id: "roles",
      label: __t("workspace.rolesPermissions") || "Roles & permissions",
      icon: Icon.Key,
    },
    {
      id: "integrations",
      label: __t("workspace.integrations") || "Integrations",
      icon: Icon.Link,
    },
    { id: "billing", label: __t("workspace.billing") || "Billing", icon: Icon.Cart },
  ];

  const membersState = useAsync(
    () => (open && tab === "members" ? api.users.list({ per_page: 100 }) : Promise.resolve(null)),
    [open, tab],
  );
  const rolesState = useAsync(
    () =>
      open && tab === "roles"
        ? Promise.all([api.rbac.roles(), api.rbac.permissions()])
        : Promise.resolve(null),
    [open, tab],
  );
  const integrationsState = useAsync(
    () => (open && tab === "integrations" ? apiRequest("/integrations/") : Promise.resolve(null)),
    [open, tab],
  );

  const focusNav = (idx) => navRefs.current[idx]?.focus();
  const onNavKeyDown = (e, idx) => {
    let next = null;
    if (e.key === "ArrowDown") next = (idx + 1) % sections.length;
    else if (e.key === "ArrowUp") next = (idx - 1 + sections.length) % sections.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = sections.length - 1;
    if (next !== null) {
      e.preventDefault();
      setTab(sections[next].id);
      focusNav(next);
    }
  };

  const members = (membersState.data && membersState.data.items) || [];
  const memberColumns = [
    {
      key: "member",
      header: __t("workspace.member") || "Member",
      render: (m) => (
        <div>
          <div className="fw-500 fs-12">{m.fullName || m.username}</div>
          <div className="font-mono fs-10 fg-3">{m.email}</div>
        </div>
      ),
    },
    {
      key: "status",
      header: __t("workspace.status") || "Status",
      render: (m) => (
        <StatusPill
          status={m.isActive ? "active" : "inactive"}
          label={
            m.isActive
              ? __t("workspace.active") || "Active"
              : __t("common.inactive") || "Inactive"
          }
        />
      ),
    },
    {
      key: "role",
      header: __t("workspace.role") || "Role",
      render: (m) => <span className="fs-11 fg-3">{m.isSuperuser ? "Admin" : "—"}</span>,
    },
  ];

  const [roles, permissions] = rolesState.data || [[], []];
  const roleColumns = [
    { key: "name", header: __t("workspace.role") || "Role" },
    { key: "description", header: __t("common.description") || "Description" },
    { key: "userCount", header: __t("workspace.members") || "Members", align: "num" },
    { key: "permissionCount", header: __t("workspace.rolesPermissions") || "Permissions", align: "num" },
  ];
  const permColumns = [
    { key: "name", header: __t("common.name") || "Name" },
    { key: "resource", header: __t("common.resource") || "Resource" },
    { key: "action", header: __t("common.action") || "Action" },
  ];

  const integrations = integrationsState.data || [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Settings size={16} />}
      title={__t("workspace.settings") || "Workspace Settings"}
      size="lg"
      closeLabel={__t("workspace.closeSettingsDialog") || "Close settings dialog"}
      footer={
        <Button variant="secondary" onClick={onClose}>
          {__t("common.close") || "Close"}
        </Button>
      }
    >
      <div
        className="d-grid"
        style={{ gridTemplateColumns: "180px 1fr", gap: 18, minHeight: 420 }}
      >
        <div
          role="tablist"
          aria-orientation="vertical"
          aria-label={__t("workspace.settingsSections") || "Settings sections"}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--sp-1)",
            borderRight: "1px solid var(--border-subtle)",
            paddingRight: "var(--sp-3)",
          }}
        >
          {sections.map((s, idx) => {
            const selected = tab === s.id;
            return (
              <button
                key={s.id}
                ref={(el) => (navRefs.current[idx] = el)}
                type="button"
                role="tab"
                id={"settings-tab-" + s.id}
                aria-selected={selected}
                aria-controls={"settings-panel-" + s.id}
                tabIndex={selected ? 0 : -1}
                onClick={() => setTab(s.id)}
                onKeyDown={(e) => onNavKeyDown(e, idx)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--sp-2)",
                  padding: "var(--sp-2) var(--sp-2)",
                  borderRadius: "var(--radius-sm)",
                  border: "none",
                  background: selected ? "var(--accent-subtle)" : "transparent",
                  color: selected ? "var(--accent-text)" : "var(--text-secondary)",
                  fontWeight: selected ? 600 : 500,
                  fontSize: "var(--fs-100)",
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <s.icon size={13} aria-hidden="true" />
                {s.label}
              </button>
            );
          })}
        </div>
        <div
          role="tabpanel"
          id={"settings-panel-" + tab}
          aria-labelledby={"settings-tab-" + tab}
          tabIndex={0}
        >
          {tab === "general" && (
            <>
              <h3 className="fs-14" style={{ margin: "0 0 4px" }}>
                {__t("workspace.accessibility") || "Accessibility"}
              </h3>
              <p className="fs-11" style={{ color: "var(--text-muted)", margin: "0 0 12px" }}>
                {__t("workspace.accessibilityDesc") ||
                  "Applies on top of your light/dark theme — both can be on at once."}
              </p>
              <div
                className="flex items-center justify-between"
                style={{ padding: "var(--sp-2) 0", borderBottom: "1px solid var(--border-subtle)" }}
              >
                <div>
                  <div className="fs-12 fw-500">
                    {__t("workspace.highContrast") || "High-contrast mode"}
                  </div>
                </div>
                <Switch
                  checked={a11yModes.includes("high-contrast")}
                  onChange={(v) => toggleA11yMode?.("high-contrast", v)}
                  label={__t("workspace.highContrast") || "High-contrast mode"}
                />
              </div>
              <div className="flex items-center justify-between" style={{ padding: "var(--sp-2) 0" }}>
                <div>
                  <div className="fs-12 fw-500">
                    {__t("workspace.colorblindSafe") || "Colorblind-safe mode"}
                  </div>
                </div>
                <Switch
                  checked={a11yModes.includes("colorblind-safe")}
                  onChange={(v) => toggleA11yMode?.("colorblind-safe", v)}
                  label={__t("workspace.colorblindSafe") || "Colorblind-safe mode"}
                />
              </div>
              <p className="fs-11 fg-3" style={{ marginTop: 16 }}>
                {__t("workspace.generalMovedNote") ||
                  "Workspace name, plan, and limits are managed from Tenant Settings."}
              </p>
            </>
          )}
          {tab === "members" && (
            <>
              <h3 className="fs-14 m-0" style={{ marginBottom: "var(--sp-4)" }}>
                {__t("workspace.members") || "Members"}
                {members.length > 0 && <span className="fg-3"> ({members.length})</span>}
              </h3>
              <LoadPanel loading={membersState.loading} error={membersState.error} empty={!membersState.loading && !membersState.error && members.length === 0}>
                <DataTable
                  ariaLabel={__t("workspace.members") || "Members"}
                  columns={memberColumns}
                  rows={members}
                  getRowKey={(m) => m.id}
                  dense
                />
              </LoadPanel>
            </>
          )}
          {tab === "roles" && (
            <>
              <h3 className="fs-14" style={{ margin: "0 0 14px" }}>
                {__t("workspace.rolesPermissions") || "Roles & Permissions"}
              </h3>
              <LoadPanel loading={rolesState.loading} error={rolesState.error} empty={!rolesState.loading && !rolesState.error && roles.length === 0}>
                <>
                  <DataTable
                    ariaLabel={__t("workspace.role") || "Roles"}
                    columns={roleColumns}
                    rows={roles}
                    getRowKey={(r) => r.id}
                    dense
                    zebra
                  />
                  {permissions.length > 0 && (
                    <>
                      <h3 className="fs-14" style={{ margin: "20px 0 14px" }}>
                        {__t("common.permissions") || "Permissions"}
                      </h3>
                      <DataTable
                        ariaLabel={__t("common.permissions") || "Permissions"}
                        columns={permColumns}
                        rows={permissions}
                        getRowKey={(p) => p.id}
                        dense
                        zebra
                      />
                    </>
                  )}
                </>
              </LoadPanel>
            </>
          )}
          {tab === "integrations" && (
            <>
              <div className="flex justify-between items-center" style={{ marginBottom: "var(--sp-4)" }}>
                <h3 className="fs-14 m-0">{__t("workspace.integrations") || "Integrations"}</h3>
                <Button variant="secondary" size="sm" onClick={() => navigateTo("integrations")}>
                  {__t("workspace.manageIntegrations") || "Manage"}
                </Button>
              </div>
              <LoadPanel loading={integrationsState.loading} error={integrationsState.error} empty={!integrationsState.loading && !integrationsState.error && integrations.length === 0}>
                <>
                  {integrations.map((i) => (
                    <div
                      key={i.provider}
                      className="flex items-center gap-12 border-line rounded-r2"
                      style={{ padding: 12, marginBottom: "var(--sp-2)" }}
                    >
                      <div className="flex-1">
                        <div className="fw-600 fs-12">{i.provider}</div>
                        <div className="font-mono fs-10 fg-3">
                          {i.last_error || (i.has_credentials ? "Configured" : "No credentials")}
                        </div>
                      </div>
                      <StatusPill
                        tone={i.is_enabled && i.status === "healthy" ? "success" : "neutral"}
                        label={i.status || (i.is_enabled ? "Enabled" : "Disabled")}
                      />
                    </div>
                  ))}
                </>
              </LoadPanel>
            </>
          )}
          {tab === "billing" && (
            <>
              <h3 className="fs-14" style={{ margin: "0 0 14px" }}>
                {__t("workspace.billing") || "Billing"}
              </h3>
              <EmptyState
                message={
                  __t("workspace.billingUnavailable") ||
                  "Billing isn't available in this deployment — there is no billing backend configured."
                }
              />
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

SettingsModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
};
