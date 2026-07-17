import PropTypes from "prop-types";

import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import { DropdownButton, Modal } from "../../globals";
// ============ WORKSPACE SETTINGS ============
export default function SettingsModal({ open, onClose }) {
  const [tab, setTab] = React.useState("general");
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
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {__t("common.close") || "Close"}
          </button>
          <button
            className="btn primary"
            onClick={() => {
              onClose();
              toast(__t("workspace.settingsSaved") || "Settings saved", {
                kind: "success",
              });
            }}
          >
            {__t("workspace.saveChanges") || "Save changes"}
          </button>
        </>
      }
    >
      <div
        className="d-grid"
        style={{ gridTemplateColumns: "160px 1fr", gap: 18, minHeight: 420 }}
      >
        <div className="bri-1 pr-16">
          {[
            ["general", __t("workspace.general") || "General"],
            ["members", __t("workspace.members") || "Members"],
            [
              "roles",
              __t("workspace.rolesPermissions") || "Roles & permissions",
            ],
            ["integrations", __t("workspace.integrations") || "Integrations"],
            ["billing", __t("workspace.billing") || "Billing"],
            ["danger", __t("workspace.dangerZone") || "Danger zone"],
          ].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} className="d-block">
              {label}
            </button>
          ))}
        </div>
        <div>
          {tab === "general" && (
            <>
              <h3 className="fs-14" style={{ margin: "0 0 14px" }}>
                {__t("workspace.general") || "General"}
              </h3>
              <div className="field">
                <label htmlFor="settings-name">
                  {__t("workspace.workspaceName") || "Workspace name"}
                </label>
                <input
                  id="settings-name"
                  name="workspaceName"
                  className="input"
                  defaultValue="Blackbox Factories"
                />
              </div>
              <div className="field">
                <label htmlFor="settings-url">
                  {__t("workspace.workspaceUrl") || "Workspace URL"}
                </label>
                <input
                  id="settings-url"
                  name="workspaceUrl"
                  className="input mono"
                  defaultValue="blackbox.bom.dev"
                />
              </div>
              <div className="field-row">
                <div className="field">
                  <label htmlFor="settings-currency">
                    {__t("workspace.defaultCurrency") || "Default currency"}
                  </label>
                  <select
                    id="settings-currency"
                    name="defaultCurrency"
                    className="select"
                  >
                    <option>USD</option>
                    <option>EUR</option>
                    <option>JPY</option>
                    <option>CNY</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="settings-datefmt">
                    {__t("workspace.dateFormat") || "Date format"}
                  </label>
                  <select
                    id="settings-datefmt"
                    name="dateFormat"
                    className="select"
                  >
                    <option>YYYY-MM-DD (ISO)</option>
                    <option>MM/DD/YYYY</option>
                    <option>DD/MM/YYYY</option>
                  </select>
                </div>
              </div>
              <div className="field">
                <label htmlFor="settings-desc">
                  {__t("workspace.description") || "Description"}
                </label>
                <textarea
                  id="settings-desc"
                  name="workspaceDesc"
                  className="input"
                  defaultValue="Internal BOM, procurement, and vendor management for Blackbox internal product dev."
                />
              </div>
            </>
          )}
          {tab === "members" && (
            <>
              <div className="flex justify-between items-center mb-14">
                <h3 className="fs-14" className="m-0">
                  {__t("workspace.members") || "Members"}{" "}
                  <span className="fg-3">(24)</span>
                </h3>
                <button
                  className="btn small"
                  onClick={() =>
                    toast(__t("workspace.inviteSent") || "Invite sent")
                  }
                >
                  <Icon.Plus size={11} /> {__t("workspace.invite") || "Invite"}
                </button>
              </div>
              {[
                ["E. Chen", "elena@blackboxfactories.com", "Admin", "EC", ""],
                [
                  "M. Park",
                  "marie@blackboxfactories.com",
                  "Engineering",
                  "MP",
                  "user-2",
                ],
                [
                  "K. Singh",
                  "karan@blackboxfactories.com",
                  "Procurement",
                  "KS",
                  "user-4",
                ],
                [
                  "R. Sato",
                  "ryo@blackboxfactories.com",
                  "Engineering",
                  "RS",
                  "user-3",
                ],
                [
                  "T. Reyes",
                  "tom@blackboxfactories.com",
                  "Finance",
                  "TR",
                  "user-2",
                ],
              ].map((m) => (
                <div
                  key={m[0]}
                  className="d-grid gap-12 items-center"
                  style={{
                    gridTemplateColumns: "30px 1fr 130px 80px 24px",
                    padding: "10px 0",
                    borderBottom: "1px solid var(--line-soft)",
                  }}
                >
                  <span className={("ava " + m[4] + " w-26 h-26 fs-10").trim()}>
                    {m[3]}
                  </span>
                  <div>
                    <div className="fw-500 fs-12">{m[0]}</div>
                    <div className="font-mono fs-10 fg-3">{m[1]}</div>
                  </div>
                  <select
                    id={"member-role-" + m[3]}
                    name="memberRole"
                    className="select h-26 fs-11"
                    defaultValue={m[2]}
                  >
                    <option>Admin</option>
                    <option>Engineering</option>
                    <option>Procurement</option>
                    <option>Finance</option>
                    <option>Viewer</option>
                  </select>
                  <span className="font-mono fs-10 fg-3">
                    {__t("workspace.active") || "active"}
                  </span>
                  <DropdownButton
                    width={160}
                    trigger={
                      <button
                        className="icon-btn w-22 h-22"
                        aria-label={
                          __t("workspace.moreOptions") || "More options"
                        }
                      >
                        <Icon.Dots size={11} />
                      </button>
                    }
                    items={[
                      {
                        icon: <Icon.Edit size={11} />,
                        label: __t("workspace.changeRole") || "Change role",
                        onClick: () =>
                          toast(
                            (__t("workspace.roleUpdatedFor") ||
                              "Role updated for ") + m[0],
                          ),
                      },
                      {
                        icon: <Icon.Trash size={11} />,
                        label: __t("workspace.remove") || "Remove",
                        danger: true,
                        onClick: () =>
                          toast(
                            m[0] +
                              (__t("workspace.removedSuffix") || " removed"),
                            { kind: "warn" },
                          ),
                      },
                    ]}
                  />
                </div>
              ))}
            </>
          )}
          {tab === "roles" && (
            <>
              <h3 className="fs-14" style={{ margin: "0 0 14px" }}>
                {__t("workspace.rolesPermissions") || "Roles & Permissions"}
              </h3>
              <div className="border-line rounded-r2 overflow-h">
                <table className="bom-table table-auto">
                  <thead>
                    <tr>
                      <th className="pl-12">
                        {__t("workspace.action") || "Action"}
                      </th>
                      <th>Admin</th>
                      <th>Eng</th>
                      <th>Proc</th>
                      <th>Fin</th>
                      <th>View</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      [
                        __t("workspace.createEditBoms") || "Create/edit BOMs",
                        true,
                        true,
                        false,
                        false,
                        false,
                      ],
                      [
                        __t("workspace.approveRevisions") ||
                          "Approve revisions",
                        true,
                        true,
                        true,
                        true,
                        false,
                      ],
                      [
                        __t("workspace.createPos") || "Create POs",
                        true,
                        false,
                        true,
                        false,
                        false,
                      ],
                      [
                        __t("workspace.viewCosts") || "View costs",
                        true,
                        true,
                        true,
                        true,
                        true,
                      ],
                      [
                        __t("workspace.manageVendors") || "Manage vendors",
                        true,
                        false,
                        true,
                        false,
                        false,
                      ],
                      [
                        __t("workspace.deleteData") || "Delete data",
                        true,
                        false,
                        false,
                        false,
                        false,
                      ],
                    ].map((r) => (
                      <tr key={r[0]}>
                        <td className="pl-12 fs-11">{r[0]}</td>
                        {r.slice(1).map((v, j) => (
                          <td key={j}>
                            {v ? (
                              <Icon.Check size={12} />
                            ) : (
                              <span className="fg-4">—</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {tab === "integrations" && (
            <>
              <h3 className="fs-14" style={{ margin: "0 0 14px" }}>
                {__t("workspace.integrations") || "Integrations"}
              </h3>
              {[
                [
                  "SolidWorks",
                  __t("workspace.cadAssemblySync") || "CAD assembly sync",
                  true,
                  "⌬",
                ],
                [
                  "NetSuite",
                  __t("workspace.erpFinance") || "ERP & finance",
                  false,
                  "$",
                ],
                [
                  "Slack",
                  __t("workspace.notifications") || "Notifications",
                  true,
                  "≡",
                ],
                [
                  "Google Drive",
                  __t("workspace.documentStorage") || "Document storage",
                  false,
                  "▤",
                ],
                [
                  "Jira",
                  __t("workspace.issueTracking") || "Issue tracking",
                  false,
                  "▦",
                ],
              ].map((i, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-12 border-line rounded-r2 mb-8"
                  style={{ padding: 12 }}
                >
                  <span className="w-32 h-32 rounded-r2 bg-sunk inline-flex items-center justify-center font-mono fs-16 fg-2">
                    {i[3]}
                  </span>
                  <div className="flex-1">
                    <div className="fw-600 fs-12">{i[0]}</div>
                    <div className="font-mono fs-10 fg-3">{i[1]}</div>
                  </div>
                  <button
                    className="btn small"
                    style={
                      i[2]
                        ? {
                            background: "var(--ok)",
                            color: "white",
                            borderColor: "var(--ok)",
                          }
                        : {}
                    }
                    onClick={() =>
                      toast(
                        i[2]
                          ? i[0] +
                              (__t("workspace.disconnectedSuffix") ||
                                " disconnected")
                          : i[0] +
                              (__t("workspace.connectedSuffix") ||
                                " connected"),
                        { kind: i[2] ? "warn" : "success" },
                      )
                    }
                  >
                    {i[2] ? (
                      <>
                        <Icon.Check size={11} />{" "}
                        {__t("workspace.connected") || "Connected"}
                      </>
                    ) : (
                      __t("workspace.connect") || "Connect"
                    )}
                  </button>
                </div>
              ))}
            </>
          )}
          {tab === "billing" && (
            <>
              <h3 className="fs-14" style={{ margin: "0 0 14px" }}>
                {__t("workspace.billing") || "Billing"}
              </h3>
              <div
                className="bg-sunk border-line rounded-r2 mb-14"
                style={{ padding: 16 }}
              >
                <div className="font-mono fs-10 fg-3 letter-sp-6 uppercase">
                  {__t("workspace.currentPlan") || "CURRENT PLAN"}
                </div>
                <div className="flex items-baseline gap-10 mt-4">
                  <span className="fs-22 fw-700">
                    {__t("workspace.teamPlan") || "Team"}
                  </span>
                  <span className="font-mono fg-3">
                    {__t("workspace.planPriceDetail") ||
                      "₹19,920/mo · 24 seats"}
                  </span>
                </div>
                <div className="font-mono fs-11 fg-3 mt-6">
                  {__t("workspace.nextInvoice") ||
                    "Next invoice: 2026-06-12 · Visa **** 4242"}
                </div>
              </div>
              <button
                className="btn"
                onClick={() =>
                  toast(
                    __t("workspace.openingBillingPortal") ||
                      "Opening billing portal…",
                  )
                }
              >
                {__t("workspace.manageSubscription") || "Manage subscription"}
              </button>
              <button
                className="btn ml-8"
                onClick={() =>
                  toast(
                    __t("workspace.openingInvoices") ||
                      "12 invoices · opening…",
                  )
                }
              >
                {__t("workspace.viewInvoices") || "View invoices"}
              </button>
            </>
          )}
          {tab === "danger" && (
            <>
              <h3 className="fs-14 fg-danger" style={{ margin: "0 0 14px" }}>
                {__t("workspace.dangerZone") || "Danger zone"}
              </h3>
              <div
                className="rounded-r2 mb-12"
                style={{ padding: 14, border: "1px solid var(--danger)" }}
              >
                <div className="fw-600 fs-13">
                  {__t("workspace.exportAllData") || "Export all data"}
                </div>
                <div className="fs-11 fg-3 mt-4 mb-8">
                  {__t("workspace.exportAllDataDesc") ||
                    "Download an archive of BOMs, vendors, documents, and audit logs."}
                </div>
                <button
                  className="btn small"
                  onClick={() =>
                    toast(
                      __t("workspace.preparingExport") ||
                        "Preparing full export · email link when ready",
                      { kind: "success" },
                    )
                  }
                >
                  {__t("common.export") || "Export"}
                </button>
              </div>
              <div
                className="rounded-r2"
                style={{ padding: 14, border: "1px solid var(--danger)" }}
              >
                <div className="fw-600 fs-13 fg-danger">
                  {__t("workspace.deleteWorkspace") || "Delete workspace"}
                </div>
                <div className="fs-11 fg-3 mt-4 mb-8">
                  {__t("workspace.deleteWorkspaceDesc") ||
                    "This action cannot be undone. All data will be permanently deleted."}
                </div>
                <button
                  className="btn small bg-danger border-color-danger fg-white"
                  onClick={() =>
                    toast(
                      __t("workspace.confirmDeletionToast") ||
                        "Type the workspace name to confirm deletion",
                      { kind: "warn" },
                    )
                  }
                >
                  {__t("workspace.deleteWorkspace") || "Delete workspace"}
                </button>
              </div>
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
