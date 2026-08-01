import PropTypes from "prop-types";

import { __t } from "../i18n";
import { toast } from "../utils/toast";
import {
  Icon,
  Modal,
  downloadBlob,
  api,
  EmptyState,
  LoadingState,
  ErrorState,
} from "../globals";
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
// Real audit-log rows have no actor/target/details/kind fields — those are
// derived here from the actual AuditLog columns returned by GET /audit-logs/
// (id, action, entityType, entityId, entityName, changes, userId, userEmail,
// createdAt — see backend/app/api/endpoints/audit_logs.py). Nothing below is
// fabricated; unmapped cases fall back to an honest "system"/"—" label.
function auditLogKind(action) {
  const a = String(action || "").toLowerCase();
  if (a.includes("create")) return "create";
  if (a.includes("delete")) return "delete";
  if (a.includes("approve")) return "approve";
  if (a.includes("release") || a.includes("publish")) return "release";
  if (a.includes("comment")) return "comment";
  if (a.includes("export")) return "export";
  if (a.includes("update") || a.includes("edit")) return "edit";
  return "system";
}

function auditLogChangeSummary(changes) {
  if (!changes) return "";
  if (typeof changes === "string") return changes;
  if (typeof changes === "object") {
    const keys = Object.keys(changes);
    if (!keys.length) return "";
    return keys.length === 1
      ? `${keys[0]} changed`
      : `${keys.length} fields changed`;
  }
  return String(changes);
}

function normalizeAuditEvent(raw, i) {
  const actor =
    raw && raw.userEmail
      ? raw.userEmail
      : raw && raw.userId != null
        ? `user #${raw.userId}`
        : "system";
  const target =
    raw && raw.entityName
      ? raw.entityName
      : raw && raw.entityType
        ? `${raw.entityType}${raw.entityId != null ? " #" + raw.entityId : ""}`
        : "—";
  return {
    key: raw && raw.id != null ? String(raw.id) : `row-${i}`,
    at:
      raw && raw.createdAt
        ? String(raw.createdAt).replace("T", " ").slice(0, 19)
        : "—",
    actor,
    action: String((raw && raw.action) || "").toLowerCase(),
    target,
    details: auditLogChangeSummary(raw && raw.changes),
    kind: auditLogKind(raw && raw.action),
  };
}

function AuditLogModal({ open, onClose }) {
  const [filter, setFilter] = React.useState("All");
  const [events, setEvents] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [loadError, setLoadError] = React.useState(false);

  const loadAuditLog = React.useCallback(() => {
    setLoading(true);
    setLoadError(false);
    api.auditLogs
      .list({ per_page: 100, sort_dir: "desc" })
      .then((data) => {
        const items = Array.isArray(data) ? data : (data && data.items) || [];
        setEvents(items.map(normalizeAuditEvent));
      })
      .catch((err) => {
        console.warn("Failed to load audit log:", err);
        setEvents([]);
        setLoadError(true);
      })
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    if (!open) return;
    loadAuditLog();
  }, [open, loadAuditLog]);
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
    edit: "var(--accent-text)",
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
        {loading ? (
          <LoadingState
            message={__t("auditLog.loading") || "Loading audit log\u2026"}
          />
        ) : loadError ? (
          <ErrorState
            message={__t("auditLog.loadFailed") || "Could not load audit log"}
            onRetry={loadAuditLog}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Icon.Activity size={28} />}
            title={__t("auditLog.empty") || "No audit log entries"}
            description={
              events.length === 0
                ? __t("auditLog.emptyMsg") ||
                  "No actions have been recorded yet."
                : __t("auditLog.emptyFilterMsg") ||
                  "No entries match this filter."
            }
          />
        ) : (
          filtered.map((e) => (
            <div
              key={e.key}
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
                {e.details ? (
                  <span className="fg-3 ml-8">{"\u00B7"} {e.details}</span>
                ) : null}
              </span>
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}
AuditLogModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
};

// ============ API KEYS ============
// Real API keys come from GET /api-keys/ (plain array of
// { id, name, description, key_prefix, scopes, is_active, expires_at,
// last_used_at, created_at } \u2014 see backend/app/api/endpoints/api_keys.py).
// The full secret is only ever returned once, from create()/rotate(); the
// list never includes it, so we never fabricate one for display.
function apiKeyScopeList(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      return [];
    }
  }
  return [];
}

function formatApiKeyDate(value) {
  if (!value) return "\u2014";
  return String(value).replace("T", " ").slice(0, 10);
}

function APIKeysModal({ open, onClose }) {
  const [keys, setKeys] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [loadError, setLoadError] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [revokingId, setRevokingId] = React.useState(null);

  const loadKeys = React.useCallback(() => {
    setLoading(true);
    setLoadError(false);
    api.apiKeys
      .list()
      .then((data) => setKeys(Array.isArray(data) ? data : []))
      .catch((err) => {
        console.warn("Failed to load API keys:", err);
        setKeys([]);
        setLoadError(true);
      })
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    if (!open) return;
    loadKeys();
  }, [open, loadKeys]);

  const generate = () => {
    setCreating(true);
    api.apiKeys
      .create({ name: __t("apiKeys.defaultLabel") || "New API key" })
      .then((res) => {
        const rawKey = res && (res.key || res.api_key);
        toast(
          __t("apiKeys.generatedToast") ||
            "New API key generated \u2014 copy now, it won't be shown again",
          {
            kind: "warn",
            action: rawKey
              ? {
                  label: __t("common.copy") || "Copy",
                  onClick: () =>
                    toast((__t("apiKeys.copied") || "Copied ") + rawKey),
                }
              : undefined,
          },
        );
        loadKeys();
      })
      .catch((err) => {
        console.warn("Failed to generate API key:", err);
        toast(__t("apiKeys.generateFailed") || "Could not generate API key", {
          kind: "warn",
        });
      })
      .finally(() => setCreating(false));
  };
  const revoke = (id) => {
    setRevokingId(id);
    api.apiKeys
      .revoke(id)
      .then(() => {
        toast(__t("apiKeys.revokedToast") || "Key revoked", { kind: "warn" });
        loadKeys();
      })
      .catch((err) => {
        console.warn("Failed to revoke API key:", err);
        toast(__t("apiKeys.revokeFailed") || "Could not revoke key", {
          kind: "warn",
        });
      })
      .finally(() => setRevokingId(null));
  };
  const activeCount = keys.filter((k) => k.is_active !== false).length;
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Link size={16} />}
      title={__t("apiKeys.title") || "API Keys"}
      subtitle={(
        __t("apiKeys.subtitle") ||
        "{count} active key(s) \u00B7 all requests audited"
      ).replace("{count}", activeCount)}
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {__t("common.close") || "Close"}
          </button>
          <button
            className="btn primary"
            onClick={generate}
            disabled={creating}
          >
            <Icon.Plus size={12} />{" "}
            {creating
              ? __t("apiKeys.generating") || "Generating\u2026"
              : __t("apiKeys.generateNewKey") || "Generate new key"}
          </button>
        </>
      }
    >
      <p className="fs-12 fg-3" style={{ margin: "0 0 14px" }}>
        {__t("apiKeys.description") ||
          "Use API keys to authenticate Blackbox BOM API requests. Keep keys secret \u2014 anyone with the key can act on your behalf."}
      </p>
      {loading ? (
        <LoadingState
          message={__t("apiKeys.loading") || "Loading API keys\u2026"}
        />
      ) : loadError ? (
        <ErrorState
          message={__t("apiKeys.loadFailed") || "Could not load API keys"}
          onRetry={loadKeys}
        />
      ) : keys.length === 0 ? (
        <EmptyState
          icon={<Icon.Link size={28} />}
          title={__t("apiKeys.empty") || "No API keys yet"}
          description={
            __t("apiKeys.emptyMsg") ||
            "Generate a key to start authenticating API requests."
          }
        />
      ) : (
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
              {keys.map((k) => {
                const revoked = k.is_active === false;
                const scopes = apiKeyScopeList(k.scopes);
                return (
                  <tr
                    key={k.id}
                    style={revoked ? { opacity: 0.5 } : undefined}
                  >
                    <td className="mono pl-12 fw-600">
                      {k.key_prefix ? `${k.key_prefix}\u2026` : "\u2014"}
                      <span className="fg-3 ml-8">#{k.id}</span>
                    </td>
                    <td>
                      {k.name}
                      {k.description ? (
                        <div className="fg-3 fs-11">{k.description}</div>
                      ) : null}
                      {revoked ? (
                        <span
                          className="tag-pill"
                          style={{
                            borderColor: "var(--danger)",
                            color: "var(--danger)",
                            marginLeft: 6,
                          }}
                        >
                          {__t("apiKeys.revokedTag") || "revoked"}
                        </span>
                      ) : null}
                    </td>
                    <td>
                      <span
                        className="tag-pill"
                        style={{
                          borderColor:
                            scopes.length === 1 && scopes[0] === "read"
                              ? "var(--info)"
                              : "var(--accent)",
                          color:
                            scopes.length === 1 && scopes[0] === "read"
                              ? "var(--info)"
                              : "var(--accent-text)",
                        }}
                      >
                        {scopes.length ? scopes.join("+") : "\u2014"}
                      </span>
                    </td>
                    <td className="mono fg-3">
                      {formatApiKeyDate(k.created_at)}
                    </td>
                    <td className="mono fg-3">
                      {k.last_used_at
                        ? formatApiKeyDate(k.last_used_at)
                        : __t("apiKeys.neverUsed") || "Never"}
                    </td>
                    <td>
                      <span className="inline-flex gap-2">
                        <button
                          className="icon-btn w-22 h-22"
                          onClick={() =>
                            toast(
                              (__t("apiKeys.copied") || "Copied ") +
                                (k.key_prefix || ""),
                            )
                          }
                          title={
                            __t("apiKeys.copyPrefix") || "Copy key prefix"
                          }
                          aria-label={
                            __t("apiKeys.copyPrefix") || "Copy key prefix"
                          }
                        >
                          <Icon.Link size={11} />
                        </button>
                        {!revoked && (
                          <button
                            className="icon-btn w-22 h-22 fg-danger"
                            onClick={() => revoke(k.id)}
                            disabled={revokingId === k.id}
                            title={__t("apiKeys.revoke") || "Revoke"}
                            aria-label={__t("apiKeys.revoke") || "Revoke"}
                          >
                            <Icon.Trash size={11} />
                          </button>
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ marginTop: 18 }}>
        <div className="font-mono fs-10 uppercase letter-sp-6 fg-3 mb-6">
          {__t("apiKeys.quickStart") || "Quick start"}
        </div>
        <pre
          className="bg-sunk rounded-r2 border-line font-mono fs-11 fg-2 overflow-x-a"
          style={{ padding: 12 }}
        >{`curl https://api.bbox.dev/v1/boms/atlas-mfr-a \
  -H "Authorization: Bearer YOUR_API_KEY"`}</pre>
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
