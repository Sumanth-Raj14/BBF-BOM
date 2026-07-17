import PropTypes from "prop-types";

import { __t } from "../i18n";
import { toast } from "../utils/toast";
import { Icon, Modal, downloadBlob } from "../globals";
import {
  PODetailModal,
  VendorDetailModal,
  CADImportModal,
  BarcodeScanModal,
  GlobalSearchModal,
  ProfileModal,
  SettingsModal,
  HelpModal,
  ImportRFQsModal,
  QuoteHistoryModal,
  AutoScrapeModal,
  BulkImportModal,
  BOMTemplatesModal,
  BOMDuplicationModal,
  RollbackModal,
  ProcurementAlertsModal,
  DocumentFolderTree,
} from "../components/modals/index.jsx";

Object.assign(window, {
  PODetailModal,
  VendorDetailModal,
  CADImportModal,
  BarcodeScanModal,
  GlobalSearchModal,
  ProfileModal,
  SettingsModal,
  HelpModal,
  ImportRFQsModal,
  QuoteHistoryModal,
  AutoScrapeModal,
  BulkImportModal,
  BOMTemplatesModal,
  BOMDuplicationModal,
  RollbackModal,
  ProcurementAlertsModal,
  DocumentFolderTree,
});

// ============ AUDIT LOG ============
function AuditLogModal({ open, onClose }) {
  const [filter, setFilter] = React.useState("All");
  const events = [
    {
      at: "2026-05-25 09:42:18",
      actor: "elena@blackboxfactories.com",
      action: "created",
      target: "BOM v3.3.0",
      details: "Forked from v3.2.0",
      kind: "create",
    },
    {
      at: "2026-05-24 16:08:42",
      actor: "marie@blackboxfactories.com",
      action: "edited",
      target: "EL-MCU-STM32H7",
      details: "rev A → B; lead 35 → 42",
      kind: "edit",
    },
    {
      at: "2026-05-24 15:11:09",
      actor: "karan@blackboxfactories.com",
      action: "approved",
      target: "PO-2026-0481",
      details: "₹1,74,300.00 · Mean Well",
      kind: "approve",
    },
    {
      at: "2026-05-24 14:55:33",
      actor: "system",
      action: "auto-scraped",
      target: "EL-MCU-STM32H7",
      details: "5 sources, 12 fields, 91% confidence",
      kind: "system",
    },
    {
      at: "2026-05-24 11:30:00",
      actor: "elena@blackboxfactories.com",
      action: "released",
      target: "BOM v3.2.0",
      details: "Rev C locked",
      kind: "release",
    },
    {
      at: "2026-05-23 18:22:15",
      actor: "ryo@blackboxfactories.com",
      action: "commented on",
      target: "EL-PCB-MAIN-R3",
      details: "Safety stock concern",
      kind: "comment",
    },
    {
      at: "2026-05-23 14:08:01",
      actor: "system",
      action: "detected",
      target: "HW-FAS-M3-08",
      details: "Duplicate match HW-SCR-M3X8 · 95%",
      kind: "system",
    },
    {
      at: "2026-05-22 17:55:18",
      actor: "tom@blackboxfactories.com",
      action: "exported",
      target: "BOM_v3.1.4.xlsx",
      details: "412 KB · finance review",
      kind: "export",
    },
    {
      at: "2026-05-22 13:14:42",
      actor: "marie@blackboxfactories.com",
      action: "deleted",
      target: "EL-FAN-80",
      details: "Replaced by EL-FAN-92",
      kind: "delete",
    },
    {
      at: "2026-05-22 09:00:00",
      actor: "system",
      action: "synced",
      target: "ATL-MFR-A_v3.2.sldasm",
      details: "87 parts imported from SolidWorks",
      kind: "system",
    },
  ];
  const kindIcon = {
    create: "+",
    edit: "\u270E",
    approve: "\u2713",
    release: "\u25B2",
    comment: "\u201C",
    export: "\u2193",
    delete: "\u2715",
    system: "\u232C",
  };
  const kindColor = {
    create: "var(--ok)",
    edit: "var(--accent)",
    approve: "var(--ok)",
    release: "var(--info)",
    comment: "var(--fg-3)",
    export: "var(--fg-2)",
    delete: "var(--danger)",
    system: "var(--fg-2)",
  };
  const filterLabels = {
    All: __t("auditLog.filterAll") || "All",
    Edits: __t("auditLog.filterEdits") || "Edits",
    Approvals: __t("auditLog.filterApprovals") || "Approvals",
    System: __t("auditLog.filterSystem") || "System",
    Deletes: __t("auditLog.filterDeletes") || "Deletes",
    Exports: __t("auditLog.filterExports") || "Exports",
  };
  const filters = ["All", "Edits", "Approvals", "System", "Deletes", "Exports"];
  const matches = (e) =>
    filter === "All"
      ? true
      : filter === "Edits"
        ? e.kind === "edit" || e.kind === "create"
        : filter === "Approvals"
          ? e.kind === "approve" || e.kind === "release"
          : filter === "System"
            ? e.kind === "system"
            : filter === "Deletes"
              ? e.kind === "delete"
              : e.kind === "export";
  const filtered = events.filter(matches);

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Activity size={16} />}
      title={__t("auditLog.title") || "Audit log"}
      subtitle={
        __t("auditLog.subtitle") ||
        "Tamper-proof event history \u00B7 all actions recorded"
      }
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {__t("common.close") || "Close"}
          </button>
          <button
            className="btn"
            onClick={() => {
              onClose();
              toast(__t("auditLog.exporting") || "Exporting audit log\u2026");
              downloadBlob &&
                downloadBlob(
                  events
                    .map(
                      (e) =>
                        `${e.at}\t${e.actor}\t${e.action}\t${e.target}\t${e.details}`,
                    )
                    .join("\n"),
                  "audit_log.txt",
                );
            }}
          >
            <Icon.Export size={12} />{" "}
            {__t("auditLog.exportTsv") || "Export TSV"}
          </button>
          <button
            className="btn primary"
            onClick={() =>
              toast(__t("auditLog.subscribed") || "Subscribed to audit alerts")
            }
          >
            {__t("auditLog.subscribeToAlerts") || "Subscribe to alerts"}
          </button>
        </>
      }
    >
      <div className="flex gap-6 mb-14" style={{ flexWrap: "wrap" }}>
        {filters.map((f) => (
          <span
            key={f}
            className={(
              (
                "chip " +
                (f === filter ? "active" : "") +
                " cursor-pointer"
              ).trim() + " fg-4 ml-4"
            ).trim()}
            onClick={() => setFilter(f)}
          >
            {filterLabels[f]}{" "}
            <span>
              {
                events.filter((e) => (f === "All" ? true : matches({ ...e })))
                  .length
              }
            </span>
          </span>
        ))}
      </div>
      <div
        className="border-line rounded-r2 overflow-h oy-auto"
        style={{ maxHeight: 460 }}
      >
        {filtered.map((e, i) => (
          <div
            key={e.at + "-" + e.actor + "-" + i}
            className="d-grid gap-12 items-center fs-11 font-mono"
            style={{
              gridTemplateColumns: "auto 150px 160px 1fr",
              padding: "10px 14px",
              borderBottom: "1px solid var(--line-soft)",
            }}
          >
            <span
              className="w-22 h-22 br-4 bg-sunk inline-flex items-center justify-center fs-12 fw-700"
              style={{ color: kindColor[e.kind] }}
            >
              {kindIcon[e.kind]}
            </span>
            <span className="fg-3">{e.at}</span>
            <span>{e.actor}</span>
            <span>
              <span className="fg-2">{e.action}</span>{" "}
              <span className="bg-sunk br-2 fg" style={{ padding: "0 4px" }}>
                {e.target}
              </span>
              <span className="fg-3 ml-8">\u00B7 {e.details}</span>
            </span>
          </div>
        ))}
      </div>
    </Modal>
  );
}
AuditLogModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
};

// ============ API KEYS ============
function APIKeysModal({ open, onClose }) {
  const [keys, setKeys] = React.useState([
    {
      id: "ak_live_aZ7\u202632fK",
      label: "Production API",
      created: "2026-01-12",
      last: "5 min ago",
      scope: "read+write",
    },
    {
      id: "sk_live_19xQ\u20260Lpm",
      label: "SolidWorks integration",
      created: "2026-02-04",
      last: "2 hr ago",
      scope: "read+sync",
    },
    {
      id: "rk_read_n3jB\u2026X8sR",
      label: "Analytics dashboard",
      created: "2025-12-18",
      last: "yesterday",
      scope: "read",
    },
  ]);
  const generate = () => {
    const id =
      "ak_live_" +
      Math.random().toString(36).slice(2, 8) +
      "\u2026" +
      Math.random().toString(36).slice(2, 6);
    setKeys([
      {
        id,
        label: "New API key",
        created: "just now",
        last: "\u2014",
        scope: "read+write",
      },
      ...keys,
    ]);
    toast(
      __t("apiKeys.generatedToast") ||
        "New API key generated \u2014 copy now, it won't be shown again",
      {
        kind: "warn",
        action: {
          label: __t("common.copy") || "Copy",
          onClick: () => toast((__t("apiKeys.copied") || "Copied ") + id),
        },
      },
    );
  };
  const revoke = (id) => {
    setKeys(keys.filter((k) => k.id !== id));
    toast(__t("apiKeys.revokedToast") || "Key revoked", { kind: "warn" });
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Link size={16} />}
      title={__t("apiKeys.title") || "API Keys"}
      subtitle={(
        __t("apiKeys.subtitle") ||
        "{count} active key(s) \u00B7 all requests audited"
      ).replace("{count}", keys.length)}
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {__t("common.close") || "Close"}
          </button>
          <button className="btn primary" onClick={generate}>
            <Icon.Plus size={12} />{" "}
            {__t("apiKeys.generateNewKey") || "Generate new key"}
          </button>
        </>
      }
    >
      <p className="fs-12 fg-3" style={{ margin: "0 0 14px" }}>
        {__t("apiKeys.description") ||
          "Use API keys to authenticate Blackbox BOM API requests. Keep keys secret \u2014 anyone with the key can act on your behalf."}
      </p>
      <div className="border-line rounded-r2 overflow-h">
        <table className="bom-table table-auto">
          <thead>
            <tr>
              <th className="pl-12">{__t("apiKeys.key") || "Key"}</th>
              <th>{__t("apiKeys.label") || "Label"}</th>
              <th>{__t("apiKeys.scope") || "Scope"}</th>
              <th>{__t("apiKeys.created") || "Created"}</th>
              <th>{__t("apiKeys.lastUsed") || "Last used"}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id}>
                <td className="mono pl-12 fw-600">{k.id}</td>
                <td>{k.label}</td>
                <td>
                  <span
                    className="tag-pill"
                    style={{
                      borderColor:
                        k.scope === "read" ? "var(--info)" : "var(--accent)",
                      color:
                        k.scope === "read" ? "var(--info)" : "var(--accent)",
                    }}
                  >
                    {k.scope}
                  </span>
                </td>
                <td className="mono fg-3">{k.created}</td>
                <td className="mono fg-3">{k.last}</td>
                <td>
                  <span className="inline-flex gap-2">
                    <button
                      className="icon-btn w-22 h-22"
                      onClick={() =>
                        toast((__t("apiKeys.copied") || "Copied ") + k.id)
                      }
                      title={__t("common.copy") || "Copy"}
                      aria-label={__t("common.copy") || "Copy"}
                    >
                      <Icon.Link size={11} />
                    </button>
                    <button
                      className="icon-btn w-22 h-22 fg-danger"
                      onClick={() => revoke(k.id)}
                      title={__t("apiKeys.revoke") || "Revoke"}
                      aria-label={__t("apiKeys.revoke") || "Revoke"}
                    >
                      <Icon.Trash size={11} />
                    </button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 18 }}>
        <div className="font-mono fs-10 uppercase letter-sp-6 fg-3 mb-6">
          {__t("apiKeys.quickStart") || "Quick start"}
        </div>
        <pre
          className="bg-sunk rounded-r2 border-line font-mono fs-11 fg-2 overflow-x-a"
          style={{ padding: 12 }}
        >{`curl https://api.bbox.dev/v1/boms/atlas-mfr-a \
  -H "Authorization: Bearer ak_live_aZ7\u202632fK"`}</pre>
      </div>
    </Modal>
  );
}
APIKeysModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
};

Object.assign(window, { AuditLogModal, APIKeysModal });

export {
  PODetailModal,
  VendorDetailModal,
  CADImportModal,
  BarcodeScanModal,
  GlobalSearchModal,
  ProfileModal,
  SettingsModal,
  HelpModal,
  ImportRFQsModal,
  QuoteHistoryModal,
  AutoScrapeModal,
  BulkImportModal,
  BOMTemplatesModal,
  BOMDuplicationModal,
  RollbackModal,
  ProcurementAlertsModal,
  DocumentFolderTree,
  AuditLogModal,
  APIKeysModal,
};
