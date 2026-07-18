import PropTypes from "prop-types";

import { AppContext } from "../../context/AppCtx.jsx";
import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import { Icon } from "../../globals";
import {
  Modal,
  Button,
  Field,
  Input,
  Select,
  Textarea,
  Menu,
  StatusPill,
  Card,
  Switch,
  DataTable,
} from "../ui";

// ============ WORKSPACE SETTINGS ============

const boolCell = (value) => (
  <span aria-label={value ? "Yes" : "No"}>
    {value ? (
      <Icon.Check size={12} aria-hidden="true" />
    ) : (
      <span aria-hidden="true" style={{ color: "var(--text-muted)" }}>
        —
      </span>
    )}
  </span>
);

export default function SettingsModal({ open, onClose }) {
  const ctx = React.useContext(AppContext);
  const { a11yModes = [], toggleA11yMode } = ctx || {};
  const [tab, setTab] = React.useState("general");
  const navRefs = React.useRef([]);

  const sections = [
    {
      id: "general",
      label: __t("workspace.general") || "General",
      icon: Icon.Settings,
    },
    {
      id: "members",
      label: __t("workspace.members") || "Members",
      icon: Icon.User,
    },
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
    {
      id: "billing",
      label: __t("workspace.billing") || "Billing",
      icon: Icon.Cart,
    },
    {
      id: "danger",
      label: __t("workspace.dangerZone") || "Danger zone",
      icon: Icon.Trash,
      danger: true,
    },
  ];

  const focusNav = (idx) => {
    const el = navRefs.current[idx];
    if (el) el.focus();
  };

  const onNavKeyDown = (e, idx) => {
    let next = null;
    if (e.key === "ArrowDown") next = (idx + 1) % sections.length;
    else if (e.key === "ArrowUp")
      next = (idx - 1 + sections.length) % sections.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = sections.length - 1;
    if (next !== null) {
      e.preventDefault();
      setTab(sections[next].id);
      focusNav(next);
    }
  };

  const members = [
    {
      name: "E. Chen",
      email: "elena@blackboxfactories.com",
      role: "Admin",
      initials: "EC",
    },
    {
      name: "M. Park",
      email: "marie@blackboxfactories.com",
      role: "Engineering",
      initials: "MP",
    },
    {
      name: "K. Singh",
      email: "karan@blackboxfactories.com",
      role: "Procurement",
      initials: "KS",
    },
    {
      name: "R. Sato",
      email: "ryo@blackboxfactories.com",
      role: "Engineering",
      initials: "RS",
    },
    {
      name: "T. Reyes",
      email: "tom@blackboxfactories.com",
      role: "Finance",
      initials: "TR",
    },
  ];

  const memberColumns = [
    {
      key: "member",
      header: __t("workspace.member") || "Member",
      render: (m) => (
        <div className="flex items-center gap-8">
          <span className="avatar" aria-hidden="true">
            {m.initials}
          </span>
          <div>
            <div className="fw-500 fs-12">{m.name}</div>
            <div className="font-mono fs-10 fg-3">{m.email}</div>
          </div>
        </div>
      ),
    },
    {
      key: "role",
      header: __t("workspace.role") || "Role",
      render: (m) => (
        <Select
          name="memberRole"
          defaultValue={m.role}
          aria-label={
            (__t("workspace.changeRole") || "Change role") + " – " + m.name
          }
        >
          <option>Admin</option>
          <option>Engineering</option>
          <option>Procurement</option>
          <option>Finance</option>
          <option>Viewer</option>
        </Select>
      ),
    },
    {
      key: "status",
      header: __t("workspace.status") || "Status",
      render: () => (
        <StatusPill status="active" label={__t("workspace.active") || "Active"} />
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">{__t("common.actions") || "Actions"}</span>,
      align: "right",
      render: (m) => (
        <Menu
          align="right"
          ariaLabel={
            (__t("workspace.moreOptions") || "More options") + " – " + m.name
          }
          trigger={
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              aria-label={__t("workspace.moreOptions") || "More options"}
            >
              <Icon.Dots size={12} />
            </Button>
          }
          items={[
            {
              icon: <Icon.Edit size={11} />,
              label: __t("workspace.changeRole") || "Change role",
              onSelect: () =>
                toast(
                  (__t("workspace.roleUpdatedFor") || "Role updated for ") +
                    m.name,
                ),
            },
            {
              icon: <Icon.Trash size={11} />,
              label: __t("workspace.remove") || "Remove",
              danger: true,
              onSelect: () =>
                toast(
                  m.name + (__t("workspace.removedSuffix") || " removed"),
                  { kind: "warn" },
                ),
            },
          ]}
        />
      ),
    },
  ];

  const roleRows = [
    {
      action: __t("workspace.createEditBoms") || "Create/edit BOMs",
      admin: true,
      eng: true,
      proc: false,
      fin: false,
      view: false,
    },
    {
      action: __t("workspace.approveRevisions") || "Approve revisions",
      admin: true,
      eng: true,
      proc: true,
      fin: true,
      view: false,
    },
    {
      action: __t("workspace.createPos") || "Create POs",
      admin: true,
      eng: false,
      proc: true,
      fin: false,
      view: false,
    },
    {
      action: __t("workspace.viewCosts") || "View costs",
      admin: true,
      eng: true,
      proc: true,
      fin: true,
      view: true,
    },
    {
      action: __t("workspace.manageVendors") || "Manage vendors",
      admin: true,
      eng: false,
      proc: true,
      fin: false,
      view: false,
    },
    {
      action: __t("workspace.deleteData") || "Delete data",
      admin: true,
      eng: false,
      proc: false,
      fin: false,
      view: false,
    },
  ];

  const roleColumns = [
    { key: "action", header: __t("workspace.action") || "Action" },
    { key: "admin", header: "Admin", align: "num", render: (r) => boolCell(r.admin) },
    { key: "eng", header: "Eng", align: "num", render: (r) => boolCell(r.eng) },
    { key: "proc", header: "Proc", align: "num", render: (r) => boolCell(r.proc) },
    { key: "fin", header: "Fin", align: "num", render: (r) => boolCell(r.fin) },
    { key: "view", header: "View", align: "num", render: (r) => boolCell(r.view) },
  ];

  const integrations = [
    {
      name: "SolidWorks",
      desc: __t("workspace.cadAssemblySync") || "CAD assembly sync",
      connected: true,
      glyph: "⌬",
    },
    {
      name: "NetSuite",
      desc: __t("workspace.erpFinance") || "ERP & finance",
      connected: false,
      glyph: "$",
    },
    {
      name: "Slack",
      desc: __t("workspace.notifications") || "Notifications",
      connected: true,
      glyph: "≡",
    },
    {
      name: "Google Drive",
      desc: __t("workspace.documentStorage") || "Document storage",
      connected: false,
      glyph: "▤",
    },
    {
      name: "Jira",
      desc: __t("workspace.issueTracking") || "Issue tracking",
      connected: false,
      glyph: "▦",
    },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Settings size={16} />}
      title={__t("workspace.settings") || "Workspace Settings"}
      subtitle={
        __t("workspace.settingsSubtitle") ||
        "Blackbox · 24 members · 4 projects"
      }
      size="lg"
      closeLabel={__t("workspace.closeSettingsDialog") || "Close settings dialog"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {__t("common.close") || "Close"}
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              onClose();
              toast(__t("workspace.settingsSaved") || "Settings saved", {
                kind: "success",
              });
            }}
          >
            {__t("workspace.saveChanges") || "Save changes"}
          </Button>
        </>
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
                  color: selected
                    ? "var(--accent-text)"
                    : s.danger
                      ? "var(--status-danger-text)"
                      : "var(--text-secondary)",
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
              <h3 className="fs-14" style={{ margin: "0 0 14px" }}>
                {__t("workspace.general") || "General"}
              </h3>
              <Field label={__t("workspace.workspaceName") || "Workspace name"}>
                <Input name="workspaceName" defaultValue="Blackbox Factories" />
              </Field>
              <Field label={__t("workspace.workspaceUrl") || "Workspace URL"}>
                <Input mono name="workspaceUrl" defaultValue="blackbox.bom.dev" />
              </Field>
              <div className="field-row">
                <Field
                  label={__t("workspace.defaultCurrency") || "Default currency"}
                >
                  <Select name="defaultCurrency" defaultValue="USD">
                    <option>USD</option>
                    <option>EUR</option>
                    <option>JPY</option>
                    <option>CNY</option>
                  </Select>
                </Field>
                <Field label={__t("workspace.dateFormat") || "Date format"}>
                  <Select name="dateFormat" defaultValue="YYYY-MM-DD (ISO)">
                    <option>YYYY-MM-DD (ISO)</option>
                    <option>MM/DD/YYYY</option>
                    <option>DD/MM/YYYY</option>
                  </Select>
                </Field>
              </div>
              <Field label={__t("workspace.description") || "Description"}>
                <Textarea
                  name="workspaceDesc"
                  rows={3}
                  defaultValue="Internal BOM, procurement, and vendor management for Blackbox internal product dev."
                />
              </Field>

              <h3 className="fs-14" style={{ margin: "20px 0 4px" }}>
                {__t("workspace.accessibility") || "Accessibility"}
              </h3>
              <p
                className="fs-11"
                style={{ color: "var(--text-muted)", margin: "0 0 12px" }}
              >
                {__t("workspace.accessibilityDesc") ||
                  "Applies on top of your light/dark theme — both can be on at once."}
              </p>
              <div
                className="flex items-center justify-between"
                style={{
                  padding: "var(--sp-2) 0",
                  borderBottom: "1px solid var(--border-subtle)",
                }}
              >
                <div>
                  <div className="fs-12 fw-500">
                    {__t("workspace.highContrast") || "High-contrast mode"}
                  </div>
                  <div className="fs-10" style={{ color: "var(--text-muted)" }}>
                    {__t("workspace.highContrastDesc") ||
                      "Stronger borders, higher text contrast, heavier focus rings."}
                  </div>
                </div>
                <Switch
                  checked={a11yModes.includes("high-contrast")}
                  onChange={(v) => toggleA11yMode?.("high-contrast", v)}
                  label={__t("workspace.highContrast") || "High-contrast mode"}
                />
              </div>
              <div
                className="flex items-center justify-between"
                style={{ padding: "var(--sp-2) 0" }}
              >
                <div>
                  <div className="fs-12 fw-500">
                    {__t("workspace.colorblindSafe") || "Colorblind-safe mode"}
                  </div>
                  <div className="fs-10" style={{ color: "var(--text-muted)" }}>
                    {__t("workspace.colorblindSafeDesc") ||
                      "Distinct status palette plus icons/shapes so status is never color-only."}
                  </div>
                </div>
                <Switch
                  checked={a11yModes.includes("colorblind-safe")}
                  onChange={(v) => toggleA11yMode?.("colorblind-safe", v)}
                  label={__t("workspace.colorblindSafe") || "Colorblind-safe mode"}
                />
              </div>
            </>
          )}
          {tab === "members" && (
            <>
              <div
                className="flex justify-between items-center"
                style={{ marginBottom: "var(--sp-4)" }}
              >
                <h3 className="fs-14 m-0">
                  {__t("workspace.members") || "Members"}{" "}
                  <span className="fg-3">(24)</span>
                </h3>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    toast(__t("workspace.inviteSent") || "Invite sent")
                  }
                >
                  <Icon.Plus size={11} /> {__t("workspace.invite") || "Invite"}
                </Button>
              </div>
              <DataTable
                ariaLabel={__t("workspace.members") || "Members"}
                columns={memberColumns}
                rows={members}
                getRowKey={(m) => m.email}
                dense
              />
            </>
          )}
          {tab === "roles" && (
            <>
              <h3 className="fs-14" style={{ margin: "0 0 14px" }}>
                {__t("workspace.rolesPermissions") || "Roles & Permissions"}
              </h3>
              <DataTable
                ariaLabel={__t("workspace.rolesPermissions") || "Roles & Permissions"}
                columns={roleColumns}
                rows={roleRows}
                getRowKey={(r) => r.action}
                dense
                zebra
              />
            </>
          )}
          {tab === "integrations" && (
            <>
              <h3 className="fs-14" style={{ margin: "0 0 14px" }}>
                {__t("workspace.integrations") || "Integrations"}
              </h3>
              {integrations.map((i) => (
                <div
                  key={i.name}
                  className="flex items-center gap-12 border-line rounded-r2"
                  style={{ padding: 12, marginBottom: "var(--sp-2)" }}
                >
                  <span
                    className="w-32 h-32 rounded-r2 bg-sunk inline-flex items-center justify-center font-mono fs-16 fg-2"
                    aria-hidden="true"
                  >
                    {i.glyph}
                  </span>
                  <div className="flex-1">
                    <div className="fw-600 fs-12">{i.name}</div>
                    <div className="font-mono fs-10 fg-3">{i.desc}</div>
                  </div>
                  <StatusPill
                    tone={i.connected ? "success" : "neutral"}
                    label={
                      i.connected
                        ? __t("workspace.connected") || "Connected"
                        : __t("workspace.notConnected") || "Not connected"
                    }
                  />
                  <Button
                    variant={i.connected ? "secondary" : "primary"}
                    size="sm"
                    onClick={() =>
                      toast(
                        i.connected
                          ? i.name +
                              (__t("workspace.disconnectedSuffix") ||
                                " disconnected")
                          : i.name +
                              (__t("workspace.connectedSuffix") ||
                                " connected"),
                        { kind: i.connected ? "warn" : "success" },
                      )
                    }
                  >
                    {i.connected
                      ? __t("workspace.disconnect") || "Disconnect"
                      : __t("workspace.connect") || "Connect"}
                  </Button>
                </div>
              ))}
            </>
          )}
          {tab === "billing" && (
            <>
              <h3 className="fs-14" style={{ margin: "0 0 14px" }}>
                {__t("workspace.billing") || "Billing"}
              </h3>
              <Card
                title={__t("workspace.currentPlan") || "Current plan"}
                className="mb-12"
              >
                <div
                  className="flex items-baseline"
                  style={{ gap: "var(--sp-2)" }}
                >
                  <span className="fs-22 fw-700">
                    {__t("workspace.teamPlan") || "Team"}
                  </span>
                  <span className="font-mono fg-3">
                    {__t("workspace.planPriceDetail") ||
                      "₹19,920/mo · 24 seats"}
                  </span>
                </div>
                <div className="font-mono fs-11 fg-3" style={{ marginTop: 6 }}>
                  {__t("workspace.nextInvoice") ||
                    "Next invoice: 2026-06-12 · Visa **** 4242"}
                </div>
              </Card>
              <div className="flex gap-8">
                <Button
                  variant="secondary"
                  onClick={() =>
                    toast(
                      __t("workspace.openingBillingPortal") ||
                        "Opening billing portal…",
                    )
                  }
                >
                  {__t("workspace.manageSubscription") || "Manage subscription"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() =>
                    toast(
                      __t("workspace.openingInvoices") ||
                        "12 invoices · opening…",
                    )
                  }
                >
                  {__t("workspace.viewInvoices") || "View invoices"}
                </Button>
              </div>
            </>
          )}
          {tab === "danger" && (
            <>
              <h3
                className="fs-14"
                style={{ margin: "0 0 14px", color: "var(--status-danger-text)" }}
              >
                {__t("workspace.dangerZone") || "Danger zone"}
              </h3>
              <Card
                title={__t("workspace.exportAllData") || "Export all data"}
                className="mb-12"
                style={{ borderColor: "var(--status-danger)" }}
                footer={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      toast(
                        __t("workspace.preparingExport") ||
                          "Preparing full export · email link when ready",
                        { kind: "success" },
                      )
                    }
                  >
                    {__t("common.export") || "Export"}
                  </Button>
                }
              >
                <p className="fs-11" style={{ color: "var(--text-muted)", margin: 0 }}>
                  {__t("workspace.exportAllDataDesc") ||
                    "Download an archive of BOMs, vendors, documents, and audit logs."}
                </p>
              </Card>
              <Card
                title={
                  <span style={{ color: "var(--status-danger-text)" }}>
                    {__t("workspace.deleteWorkspace") || "Delete workspace"}
                  </span>
                }
                style={{ borderColor: "var(--status-danger)" }}
                footer={
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() =>
                      toast(
                        __t("workspace.confirmDeletionToast") ||
                          "Type the workspace name to confirm deletion",
                        { kind: "warn" },
                      )
                    }
                  >
                    {__t("workspace.deleteWorkspace") || "Delete workspace"}
                  </Button>
                }
              >
                <p className="fs-11" style={{ color: "var(--text-muted)", margin: 0 }}>
                  {__t("workspace.deleteWorkspaceDesc") ||
                    "This action cannot be undone. All data will be permanently deleted."}
                </p>
              </Card>
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
