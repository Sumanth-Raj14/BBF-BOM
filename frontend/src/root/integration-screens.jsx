import { storage } from "../utils/storage.js";
import { ANIM } from "../utils/design-tokens.js";
import { __t } from "../i18n";
import { toast } from "../utils/toast";
// Phase 4-6 Integration Screens: Webhooks, Bulk Import, ERP Connectors,
// Supplier Portal, AI Features, Monitoring Dashboard
// ============ ERP CONNECTORS ============
function ERPConnectorsScreen() {
  const [connectors, setConnectors] = React.useState([]);
  const [logs, setLogs] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [showCreate, setShowCreate] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [form, setForm] = React.useState({
    name: "",
    type: "sap",
    baseUrl: "",
    apiKey: "",
  });
  const [selectedConnector, setSelectedConnector] = React.useState(null);
  const [actionIds, setActionIds] = React.useState(() => new Set());
  const markBusy = (id, v) =>
    setActionIds((prev) => {
      const n = new Set(prev);
      v ? n.add(id) : n.delete(id);
      return n;
    });
  const [confirmDeleteId, setConfirmDeleteId] = React.useState(null);
  const load = React.useCallback(() => {
    setLoading(true);
    Promise.all([
      erpConnectorsAPI?.list().catch(() => {
        return [];
      }),
      erpConnectorsAPI?.logs("latest").catch(() => {
        return [];
      }),
    ])
      .then(([conns, logEntries]) => {
        setConnectors(Array.isArray(conns) ? conns : []);
        setLogs(Array.isArray(logEntries) ? logEntries : []);
        setLoading(false);
      })
      .catch(() => {
        console.error("Failed to load ERP connectors");
        setConnectors([]);
        setLogs([]);
        setLoading(false);
      });
  }, []);
  React.useEffect(() => {
    load();
  }, [load]);
  const createConnector = async () => {
    if (!form.name) return;
    setCreating(true);
    try {
      await erpConnectorsAPI?.create(form);
      toast(__t("integrations.erp.created") || "Connector created", {
        kind: "success",
      });
      setShowCreate(false);
      setForm({ name: "", type: "sap", baseUrl: "", apiKey: "" });
      load();
    } catch (_e) {
      toast(
        __t("integrations.erp.createFailed") || "Failed to create connector",
        { kind: "error" },
      );
    } finally {
      setCreating(false);
    }
  };
  const testConnection = async (id) => {
    markBusy("test-" + id, true);
    try {
      await erpConnectorsAPI?.testConnection(id);
      toast(
        __t("integrations.erp.connectionSuccess") || "Connection successful",
        { kind: "success" },
      );
    } catch (_e) {
      toast(__t("integrations.erp.connectionFailed") || "Connection failed", {
        kind: "error",
      });
    } finally {
      markBusy("test-" + id, false);
    }
  };
  const syncNow = async (id) => {
    markBusy("sync-" + id, true);
    try {
      toast(__t("integrations.erp.syncStarted") || "Sync started...", {
        kind: "info",
      });
      await erpConnectorsAPI?.sync(id);
      toast(__t("integrations.erp.syncCompleted") || "Sync completed", {
        kind: "success",
      });
      if (selectedConnector === id) loadLogs(id);
    } catch (_e) {
      toast(__t("integrations.erp.syncFailed") || "Sync failed", {
        kind: "error",
      });
    } finally {
      markBusy("sync-" + id, false);
    }
  };
  const loadLogs = async (id) => {
    setSelectedConnector(id);
    try {
      const r = await erpConnectorsAPI?.logs(id);
      setLogs(Array.isArray(r) ? r : []);
    } catch (_e) {
      console.error("Failed to load logs");
      setLogs([]);
    }
  };
  const deleteConnector = (id) => {
    setConfirmDeleteId(id);
  };
  return (
    <div className="screen-wrap">
      <div className="screen-header">
        <div>
          <h1>{__t("integrations.erp.title") || "ERP Connectors"}</h1>
          <div className="sub">
            {__t("integrations.erp.subtitle") ||
              "Sync data with SAP, NetSuite, Oracle, ClickUp, Zoho Cliq, and other systems"}
          </div>
        </div>
        <button
          className="btn primary"
          disabled={creating}
          onClick={() => setShowCreate(!showCreate)}
        >
          {creating ? (
            <>
              <span className="spinner" style={{ width: 10, height: 10 }} />{" "}
              {__t("integrations.erp.creating") || "Creating…"}
            </>
          ) : (
            <>
              <Icon.Plus size={12} />{" "}
              {__t("integrations.erp.newConnector") || "New Connector"}
            </>
          )}
        </button>
      </div>
      {showCreate && (
        <div className="card mb-12 p-16">
          <div
            className="d-grid gap-8"
            style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr" }}
          >
            <input
              id="erp-name"
              name="connectorName"
              className="twk-field"
              placeholder={
                __t("integrations.erp.connectorNamePlaceholder") ||
                "Connector name"
              }
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <select
              id="erp-type"
              name="connectorType"
              className="twk-field"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
            >
              <option value="sap">SAP</option>
              <option value="netsuite">NetSuite</option>
              <option value="oracle">Oracle</option>
              <option value="clickup">ClickUp</option>
              <option value="cliq">Zoho Cliq</option>
              <option value="custom">
                {__t("integrations.erp.customRest") || "Custom REST"}
              </option>
            </select>
            <input
              id="erp-base-url"
              name="baseUrl"
              className="twk-field"
              placeholder={
                __t("integrations.erp.baseUrlPlaceholder") || "Base URL"
              }
              value={form.baseUrl}
              onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
            />
            <input
              id="erp-api-key"
              name="apiKey"
              className="twk-field"
              placeholder={
                __t("integrations.erp.apiKeyPlaceholder") || "API Key"
              }
              value={form.apiKey}
              onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
            />
          </div>
          <div className="flex gap-8 mt-8">
            <button
              className="btn primary"
              disabled={creating}
              onClick={createConnector}
            >
              {creating ? (
                <>
                  <span className="spinner" style={{ width: 10, height: 10 }} />{" "}
                  {__t("integrations.erp.creating") || "Creating…"}
                </>
              ) : (
                <>
                  <Icon.Check size={12} /> {__t("common.create") || "Create"}
                </>
              )}
            </button>
            <button className="btn" onClick={() => setShowCreate(false)}>
              {__t("common.cancel") || "Cancel"}
            </button>
          </div>
        </div>
      )}
      <div className="card">
        {loading ? (
          SkeletonTable({ rows: 4, cols: 6 })
        ) : connectors.length === 0 ? (
          <div className="text-center fg-3 fs-12 p-40">
            {__t("integrations.erp.empty") ||
              "No ERP connectors configured. Create one to start syncing."}
          </div>
        ) : (
          <table className="bom-table">
            <thead>
              <tr>
                <th>{__t("integrations.erp.table.name") || "Name"}</th>
                <th>{__t("integrations.erp.table.type") || "Type"}</th>
                <th>{__t("integrations.erp.table.url") || "URL"}</th>
                <th>{__t("integrations.erp.table.status") || "Status"}</th>
                <th>{__t("integrations.erp.table.lastSync") || "Last Sync"}</th>
                <th>{__t("integrations.erp.table.actions") || "Actions"}</th>
              </tr>
            </thead>
            <tbody>
              {connectors.map((c) => (
                <tr key={c.id}>
                  <td className="fw-600 fs-12">{c.name}</td>
                  <td>
                    <span className="tag-pill fs-9 uppercase">{c.type}</span>
                  </td>
                  <td className="mono fs-10">{c.baseUrl}</td>
                  <td>
                    <span
                      className={
                        "status " + (c.active ? "released" : "deprecated")
                      }
                    >
                      {c.active
                        ? __t("integrations.erp.connected") || "Connected"
                        : __t("integrations.erp.disabled") || "Disabled"}
                    </span>
                  </td>
                  <td className="fs-10 fg-3">
                    {c.lastSyncAt || __t("integrations.erp.never") || "Never"}
                  </td>
                  <td>
                    <div className="flex gap-4">
                      <button
                        className="btn small"
                        disabled={actionIds.has("test-" + c.id)}
                        onClick={() => testConnection(c.id)}
                      >
                        <Icon.Link size={10} />{" "}
                        {actionIds.has("test-" + c.id)
                          ? "…"
                          : __t("integrations.erp.test") || "Test"}
                      </button>
                      <button
                        className="btn small primary"
                        disabled={actionIds.has("sync-" + c.id)}
                        onClick={() => syncNow(c.id)}
                      >
                        <Icon.Refresh size={10} />{" "}
                        {actionIds.has("sync-" + c.id)
                          ? "…"
                          : __t("integrations.erp.sync") || "Sync"}
                      </button>
                      <button
                        className="btn small"
                        onClick={() => loadLogs(c.id)}
                      >
                        <Icon.Doc size={10} />{" "}
                        {__t("integrations.erp.logs") || "Logs"}
                      </button>
                      <button
                        className="btn small fg-danger"
                        disabled={actionIds.has("del-" + c.id)}
                        onClick={() => deleteConnector(c.id)}
                      >
                        {actionIds.has("del-" + c.id) ? (
                          "…"
                        ) : (
                          <Icon.Trash size={10} />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {selectedConnector && logs.length > 0 && (
        <div className="card mt-12">
          <div className="fw-600 fs-11 uppercase letter-sp-6 fg-3 px-16 py-10">
            {__t("integrations.erp.syncLogs") || "Sync Logs"}
          </div>
          <table className="bom-table">
            <thead>
              <tr>
                <th>
                  {__t("integrations.erp.logsTable.direction") || "Direction"}
                </th>
                <th>{__t("integrations.erp.logsTable.entity") || "Entity"}</th>
                <th>
                  {__t("integrations.erp.logsTable.records") || "Records"}
                </th>
                <th>{__t("integrations.erp.logsTable.status") || "Status"}</th>
                <th>{__t("integrations.erp.logsTable.time") || "Time"}</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td>
                    <span className="tag-pill fs-9">{l.direction}</span>
                  </td>
                  <td className="fs-11">{l.entityType}</td>
                  <td className="mono fs-11">{l.recordsCount}</td>
                  <td>
                    <span
                      className={
                        "status " +
                        (l.status === "success" ? "released" : "deprecated")
                      }
                    >
                      {l.status}
                    </span>
                  </td>
                  <td className="fs-10 fg-3">{l.createdAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {confirmDeleteId !== null && (
        <window.ConfirmModal
          open
          onClose={() => setConfirmDeleteId(null)}
          title={__t("integrations.erp.confirmDelete") || "Delete connector?"}
          body={
            __t("integrations.erp.confirmDeleteBody") ||
            "Are you sure you want to delete this connector?"
          }
          danger
          confirmLabel={__t("common.delete") || "Delete"}
          onConfirm={async () => {
            const id = confirmDeleteId;
            setConfirmDeleteId(null);
            markBusy("del-" + id, true);
            try {
              await erpConnectorsAPI?.delete(id);
              toast(__t("integrations.erp.deleted") || "Deleted", {
                kind: "success",
              });
              load();
            } catch (_e) {
              toast(__t("integrations.erp.deleteFailed") || "Failed", {
                kind: "error",
              });
            } finally {
              markBusy("del-" + id, false);
            }
          }}
        />
      )}
    </div>
  );
}
// ============ WEBHOOK MANAGEMENT ============
function WebhooksScreen() {
  const [subscriptions, setSubscriptions] = React.useState([]);
  const [deliveries, setDeliveries] = React.useState([]);
  const [activeTab, setActiveTab] = React.useState("subscriptions");
  const [loading, setLoading] = React.useState(false);
  const [deliveriesLoading, setDeliveriesLoading] = React.useState(false);
  const [showCreate, setShowCreate] = React.useState(false);
  const [newUrl, setNewUrl] = React.useState("");
  const [newEvents, setNewEvents] = React.useState("bom.created,part.updated");
  const [creating, setCreating] = React.useState(false);
  const [, setActionIds] = React.useState(() => new Set());
  const markBusy = (id, v) =>
    setActionIds((prev) => {
      const n = new Set(prev);
      v ? n.add(id) : n.delete(id);
      return n;
    });
  const [confirmDeleteId, setConfirmDeleteId] = React.useState(null);
  const loadSubscriptions = React.useCallback(() => {
    setLoading(true);
    return webhooksAPI
      ?.list()
      .then((d) => {
        setSubscriptions(Array.isArray(d) ? d : []);
        setLoading(false);
      })
      .catch(() => {
        console.error("Failed to load webhooks");
        setSubscriptions([]);
        setLoading(false);
      });
  }, []);
  const loadDeliveries = React.useCallback(() => {
    setDeliveriesLoading(true);
    return webhooksAPI
      ?.deliveries({ limit: 50 })
      .then((d) => {
        setDeliveries(Array.isArray(d) ? d : Array.isArray(d?.deliveries) ? d.deliveries : []);
        setDeliveriesLoading(false);
      })
      .catch(() => {
        console.error("Failed to load webhook deliveries");
        setDeliveries([]);
        setDeliveriesLoading(false);
      });
  }, []);
  React.useEffect(() => {
    loadSubscriptions();
  }, [loadSubscriptions]);
  React.useEffect(() => {
    if (activeTab === "deliveries") loadDeliveries();
  }, [activeTab, loadDeliveries]);
  const createWebhook = async () => {
    if (!newUrl) return;
    setCreating(true);
    try {
      await webhooksAPI?.create({
        url: newUrl,
        events: newEvents,
        secret: Math.random().toString(36).slice(2),
        active: true,
      });
      toast(__t("integrations.webhooks.created") || "Webhook created", {
        kind: "success",
      });
      setShowCreate(false);
      setNewUrl("");
      setNewEvents("bom.created,part.updated");
      loadSubscriptions();
    } catch (_e) {
      toast(__t("integrations.webhooks.createFailed") || "Failed", {
        kind: "error",
      });
    } finally {
      setCreating(false);
    }
  };
  const toggleWebhook = async (id, active) => {
    markBusy("toggle-" + id, true);
    try {
      await webhooksAPI?.update(id, { active: !active });
      loadSubscriptions();
    } catch (_e) {
      toast(__t("integrations.webhooks.toggleFailed") || "Toggle failed", {
        kind: "error",
      });
    } finally {
      markBusy("toggle-" + id, false);
    }
  };
  const testWebhook = async (id) => {
    markBusy("test-" + id, true);
    try {
      await webhooksAPI?.test(id);
      toast("Test event sent", { kind: "success" });
    } catch (e) {
      toast("Test failed: " + (e?.message || ""), { kind: "error" });
    } finally {
      markBusy("test-" + id, false);
    }
  };
  const retryDelivery = async (deliveryId) => {
    markBusy("retry-" + deliveryId, true);
    try {
      await webhooksAPI?.retry(deliveryId);
      toast("Retry queued", { kind: "success" });
      loadDeliveries();
    } catch (e) {
      toast("Retry failed: " + (e?.message || ""), { kind: "error" });
    } finally {
      markBusy("retry-" + deliveryId, false);
    }
  };
  const deleteWebhook = (id) => {
    setConfirmDeleteId(id);
  };
  return (
    <div className="screen-wrap">
      <div className="screen-header">
        <div>
          <h1>{__t("integrations.webhooks.title") || "Webhooks"}</h1>
          <div className="sub">
            {__t("integrations.webhooks.subtitle") ||
              "Manage outgoing webhook subscriptions for real-time event notifications"}
          </div>
        </div>
        <div className="flex gap-8">
          <button
            className={"btn" + (activeTab === "subscriptions" ? " primary" : "")}
            onClick={() => setActiveTab("subscriptions")}
          >
            Subscriptions ({subscriptions.length})
          </button>
          <button
            className={"btn" + (activeTab === "deliveries" ? " primary" : "")}
            onClick={() => setActiveTab("deliveries")}
          >
            Delivery Log ({deliveries.length})
          </button>
          <button
            className="btn primary"
            onClick={() => setShowCreate(!showCreate)}
          >
            <Icon.Plus size={12} />{" "}
            {__t("integrations.webhooks.newWebhook") || "New Webhook"}
          </button>
        </div>
      </div>
      {showCreate && (
        <div className="card mb-12 p-16">
          <div className="d-grid gap-8 grid-cols-2">
            <input
              className="twk-field"
              placeholder={
                __t("integrations.webhooks.urlPlaceholder") || "Webhook URL"
              }
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
            />
            <input
              className="twk-field"
              placeholder={
                __t("integrations.webhooks.eventsPlaceholder") ||
                "Events (e.g. bom.created,part.updated)"
              }
              value={newEvents}
              onChange={(e) => setNewEvents(e.target.value)}
            />
          </div>
          <div className="flex gap-8 mt-8">
            <button
              className="btn primary small"
              disabled={creating || !newUrl}
              onClick={createWebhook}
            >
              {creating
                ? __t("integrations.webhooks.creating") || "Creating..."
                : __t("common.create") || "Create"}
            </button>
            <button className="btn small" onClick={() => setShowCreate(false)}>
              {__t("common.cancel") || "Cancel"}
            </button>
          </div>
        </div>
      )}
      {activeTab === "subscriptions" ? (
        <div className="card">
          {loading ? (
            SkeletonTable({ rows: 3, cols: 5 })
          ) : subscriptions.length === 0 ? (
            <div className="text-center fg-3 fs-12 p-40">
              {__t("integrations.webhooks.empty") || "No webhooks configured."}
            </div>
          ) : (
            <table className="bom-table">
              <thead>
                <tr>
                  <th>{__t("integrations.webhooks.table.url") || "URL"}</th>
                  <th>
                    {__t("integrations.webhooks.table.events") || "Events"}
                  </th>
                  <th>
                    {__t("integrations.webhooks.table.status") || "Status"}
                  </th>
                  <th>
                    {__t("integrations.webhooks.table.created") || "Created"}
                  </th>
                  <th>
                    {__t("integrations.webhooks.table.actions") || "Actions"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {subscriptions.map((s) => (
                  <tr key={s.id}>
                    <td
                      className="mono fs-10 overflow-h"
                      style={{ maxWidth: 260, textOverflow: "ellipsis" }}
                    >
                      {s.url}
                    </td>
                    <td className="fs-10">{s.events}</td>
                    <td>
                      <span
                        className={
                          "status " + (s.active ? "released" : "deprecated")
                        }
                      >
                        {s.active
                          ? __t("integrations.webhooks.active") || "Active"
                          : __t("integrations.webhooks.inactive") || "Inactive"}
                      </span>
                    </td>
                    <td className="fs-10 fg-3">{s.createdAt}</td>
                    <td>
                      <div className="flex gap-4">
                        <button
                          className="btn small"
                          onClick={() => testWebhook(s.id)}
                        >
                          <Icon.Send size={10} /> Test
                        </button>
                        <button
                          className="btn small"
                          onClick={() => toggleWebhook(s.id, s.active)}
                        >
                          {s.active ? "Pause" : "Activate"}
                        </button>
                        <button
                          className="btn small fg-danger"
                          onClick={() => deleteWebhook(s.id)}
                        >
                          <Icon.Trash size={10} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className="card">
          {deliveriesLoading ? (
            SkeletonTable({ rows: 5, cols: 6 })
          ) : deliveries.length === 0 ? (
            <div className="text-center fg-3 fs-12 p-40">No deliveries yet.</div>
          ) : (
            <table className="bom-table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Status</th>
                  <th>Code</th>
                  <th>Retries</th>
                  <th>Time</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((d) => (
                  <tr key={d.id}>
                    <td className="fs-11">{d.event}</td>
                    <td>
                      <span
                        className={
                          "status " +
                          (d.status === "delivered"
                            ? "released"
                            : d.status === "failed"
                              ? "deprecated"
                              : "review")
                        }
                      >
                        {d.status}
                      </span>
                    </td>
                    <td className="mono fs-11">{d.statusCode || "—"}</td>
                    <td className="mono fs-11">{d.retryCount || 0}</td>
                    <td className="fs-10 fg-3">{d.createdAt || "—"}</td>
                    <td>
                      {d.status === "failed" && (
                        <button
                          className="btn small"
                          onClick={() => retryDelivery(d.id)}
                        >
                          <Icon.Refresh size={10} /> Retry
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      {confirmDeleteId !== null && (
        <window.ConfirmModal
          open
          onClose={() => setConfirmDeleteId(null)}
          title={
            __t("integrations.webhooks.confirmDelete") || "Delete webhook?"
          }
          body={
            __t("integrations.webhooks.confirmDeleteBody") ||
            "Are you sure you want to delete this webhook?"
          }
          danger
          confirmLabel={__t("common.delete") || "Delete"}
          onConfirm={async () => {
            const id = confirmDeleteId;
            setConfirmDeleteId(null);
            markBusy("del-" + id, true);
            try {
              await webhooksAPI?.delete(id);
              toast(__t("integrations.webhooks.deleted") || "Deleted", {
                kind: "success",
              });
            } catch (_e) {
              toast(__t("integrations.webhooks.deleteFailed") || "Failed", {
                kind: "error",
              });
            } finally {
              markBusy("del-" + id, false);
            }
          }}
        />
      )}
    </div>
  );
}
// ============ BULK IMPORT ============
function BulkImportScreen() {
  const [jobs, setJobs] = React.useState([]);
  const [uploading, setUploading] = React.useState(false);
  const [selectedFile, setSelectedFile] = React.useState(null);
  const loadJobs = React.useCallback(() => {
    return Promise.resolve(bulkImportAPI?.list?.())
      .then((d) => {
        if (d) setJobs(Array.isArray(d) ? d : Array.isArray(d?.jobs) ? d.jobs : []);
        else setJobs([]);
      })
      .catch(() => {
        console.error("Failed to load import jobs");
        setJobs([]);
      });
  }, []);
  React.useEffect(() => {
    loadJobs();
  }, [loadJobs]);
  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    try {
      const result = await bulkImportAPI?.upload(selectedFile);
      const totalRows = result?.totalRows || 0;
      toast("File uploaded" + (totalRows ? ", " + totalRows + " rows detected" : ""), {
        kind: "success",
      });
      const jobId = result?.jobId || result?.id;
      if (jobId) {
        const processed = await bulkImportAPI?.process(jobId);
        const done = processed?.processedRows;
        const errs = processed?.errorRows;
        toast(
          "Import processing started" +
            (typeof done === "number"
              ? " (" + done + " processed" + (errs ? ", " + errs + " errors" : "") + ")"
              : ""),
          { kind: "success" },
        );
      }
      loadJobs();
    } catch (e) {
      toast("Import failed: " + (e?.message || ""), { kind: "error" });
    } finally {
      setUploading(false);
    }
  };
  return (
    <div className="screen-wrap">
      <div className="screen-header">
        <div>
          <h1>{__t("integrations.bulkImport.title") || "Bulk Import"}</h1>
          <div className="sub">
            {__t("integrations.bulkImport.subtitle") ||
              "Import parts, BOMs, and vendor data from CSV or Excel files"}
          </div>
        </div>
      </div>
      <div className="card mb-12 p-16">
        <div className="flex gap-16 items-center">
          <div className="flex-1">
            <div
              style={{
                border: "2px dashed var(--line)",
                borderRadius: "var(--r-2)",
                padding: 24,
                textAlign: "center",
                cursor: "pointer",
              }}
              onClick={() => document.getElementById("import-file").click()}
            >
              <Icon.Upload
                size={24}
                style={{ opacity: 0.3, marginBottom: 8 }}
              />
              <div className="fs-12 fw-500">
                {selectedFile
                  ? selectedFile.name
                  : "Click to select CSV or XLSX file"}
              </div>
              <div className="fs-10 fg-3 mt-4">
                Supports: Parts, BOMs, Vendors, Purchase Orders
              </div>
              <input
                id="import-file"
                type="file"
                accept=".csv,.xlsx,.xls"
                style={{ display: "none" }}
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              />
            </div>
          </div>
          <button
            className="btn primary"
            disabled={!selectedFile || uploading}
            onClick={handleUpload}
          >
            {uploading ? (
              <>
                <span
                  className="spinner"
                  style={{ width: 12, height: 12 }}
                />{" "}
                {__t("integrations.bulkImport.uploading") || "Importing..."}
              </>
            ) : (
              <>
                <Icon.Import size={12} />{" "}
                {__t("integrations.bulkImport.uploadAndImport") ||
                  "Start Import"}
              </>
            )}
          </button>
        </div>
      </div>
      <div className="card">
        <div className="fw-600 fs-11 uppercase letter-sp-6 fg-3 px-16 py-10">
          {__t("integrations.bulkImport.importHistory") || "Import History"}
        </div>
        {jobs.length === 0 ? (
          <div className="text-center fg-3 fs-12 p-40">
            {__t("integrations.bulkImport.empty") || "No imports yet."}
          </div>
        ) : (
          <table className="bom-table">
            <thead>
              <tr>
                <th>{__t("integrations.bulkImport.table.file") || "File"}</th>
                <th>{__t("integrations.bulkImport.table.rows") || "Rows"}</th>
                <th>
                  {__t("integrations.bulkImport.table.processed") ||
                    "Processed"}
                </th>
                <th>
                  {__t("integrations.bulkImport.table.errors") || "Errors"}
                </th>
                <th>
                  {__t("integrations.bulkImport.table.status") || "Status"}
                </th>
                <th>{__t("integrations.bulkImport.table.date") || "Date"}</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td className="fs-11">{j.filename}</td>
                  <td className="mono fs-11">{j.totalRows}</td>
                  <td className="mono fs-11">{j.processedRows}</td>
                  <td
                    className="mono fs-11"
                    style={{
                      color: j.errorRows > 0 ? "var(--danger)" : "inherit",
                    }}
                  >
                    {j.errorRows}
                  </td>
                  <td>
                    <span
                      className={
                        "status " +
                        (j.errorRows > 0
                          ? "warning"
                          : j.status === "completed"
                            ? "released"
                            : "deprecated")
                      }
                    >
                      {j.status}
                    </span>
                  </td>
                  <td className="fs-10 fg-3">{j.createdAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
// ============ SUPPLIER PORTAL ============
function SupplierPortalScreen() {
  const [users, setUsers] = React.useState([]);
  const [priceUpdates, setPriceUpdates] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [showCreateUser, setShowCreateUser] = React.useState(false);
  const [newUser, setNewUser] = React.useState({
    email: "",
    name: "",
    vendorId: "",
    password: "",
  });
  const [creatingUser, setCreatingUser] = React.useState(false);
  const [actionIds, setActionIds] = React.useState(() => new Set());
  const markBusy = (id, v) =>
    setActionIds((prev) => {
      const n = new Set(prev);
      v ? n.add(id) : n.delete(id);
      return n;
    });
  const load = React.useCallback(() => {
    setLoading(true);
    Promise.all([
      supplierPortalAPI?.listUsers().catch(() => {
        return [];
      }),
      supplierPortalAPI?.listPriceUpdates().catch(() => {
        return [];
      }),
    ])
      .then(([u, p]) => {
        const users = Array.isArray(u) ? u : [];
        const prices = Array.isArray(p) ? p : [];
        setUsers(users.length > 0 ? users : []);
        setPriceUpdates(prices.length > 0 ? prices : []);
        setLoading(false);
      })
      .catch(() => {
        console.error("Failed to load supplier portal data");
        setUsers([]);
        setPriceUpdates([]);
        setLoading(false);
      });
  }, []);
  React.useEffect(() => {
    load();
  }, [load]);
  const approve = async (id) => {
    markBusy("approve-" + id, true);
    try {
      await supplierPortalAPI?.approvePriceUpdate(id);
      toast(__t("integrations.supplierPortal.approved") || "Approved", {
        kind: "success",
      });
      load();
    } catch (_e) {
      toast(__t("integrations.supplierPortal.approveFailed") || "Failed", {
        kind: "error",
      });
    } finally {
      markBusy("approve-" + id, false);
    }
  };
  const reject = async (id) => {
    markBusy("reject-" + id, true);
    try {
      await supplierPortalAPI?.rejectPriceUpdate(id);
      toast(__t("integrations.supplierPortal.rejected") || "Rejected", {
        kind: "success",
      });
      load();
    } catch (_e) {
      toast(__t("integrations.supplierPortal.rejectFailed") || "Failed", {
        kind: "error",
      });
    } finally {
      markBusy("reject-" + id, false);
    }
  };
  return (
    <div className="screen-wrap">
      <div className="screen-header">
        <div>
          <h1>
            {__t("integrations.supplierPortal.title") || "Supplier Portal"}
          </h1>
          <div className="sub">
            {__t("integrations.supplierPortal.subtitle") ||
              "Manage vendor access and price update submissions"}
          </div>
        </div>
        <button
          className="btn primary"
          disabled={creatingUser}
          onClick={() => setShowCreateUser(!showCreateUser)}
        >
          {creatingUser ? (
            <>
              <span className="spinner" style={{ width: 10, height: 10 }} />{" "}
              {__t("integrations.supplierPortal.creating") || "Creating…"}
            </>
          ) : (
            <>
              <Icon.Plus size={12} />{" "}
              {__t("integrations.supplierPortal.addUser") ||
                "Add Supplier User"}
            </>
          )}
        </button>
      </div>
      {showCreateUser && (
        <div className="card mb-12 p-16">
          <div className="flex gap-8" style={{ flexWrap: "wrap" }}>
            <input
              id="sp-user-email"
              name="userEmail"
              className="twk-field"
              placeholder={
                __t("integrations.supplierPortal.emailPlaceholder") || "Email"
              }
              value={newUser.email}
              onChange={(e) =>
                setNewUser({ ...newUser, email: e.target.value })
              }
            />
            <input
              id="sp-user-name"
              name="userName"
              className="twk-field"
              placeholder={
                __t("integrations.supplierPortal.namePlaceholder") || "Name"
              }
              value={newUser.name}
              onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
            />
            <input
              id="sp-user-vendor"
              name="vendorId"
              className="twk-field"
              type="number"
              placeholder={
                __t("integrations.supplierPortal.vendorIdPlaceholder") ||
                "Vendor ID (number)"
              }
              value={newUser.vendorId}
              onChange={(e) =>
                setNewUser({ ...newUser, vendorId: e.target.value })
              }
            />
            <input
              id="sp-user-pass"
              name="password"
              className="twk-field"
              type="password"
              placeholder={
                __t("integrations.supplierPortal.passwordPlaceholder") ||
                "Password"
              }
              value={newUser.password}
              onChange={(e) =>
                setNewUser({ ...newUser, password: e.target.value })
              }
            />
            <button
              className="btn primary"
              disabled={creatingUser || !newUser.email || !newUser.name}
              onClick={async () => {
                setCreatingUser(true);
                try {
                  const payload = {
                    ...newUser,
                    vendorId: parseInt(newUser.vendorId) || 0,
                  };
                  await supplierPortalAPI?.createUser(payload);
                  toast(
                    __t("integrations.supplierPortal.userCreated") ||
                      "User created",
                    { kind: "success" },
                  );
                  setShowCreateUser(false);
                  setNewUser({
                    email: "",
                    name: "",
                    vendorId: "",
                    password: "",
                  });
                  load();
                } catch (e) {
                  // If backend is offline, store locally
                  if (
                    e.message?.includes("Failed to fetch") ||
                    e.message?.includes("Unable to connect")
                  ) {
                    const existing = storage.supplierUsers.get();
                    existing.push({
                      id: "su-" + Date.now(),
                      ...newUser,
                      active: true,
                    });
                    storage.supplierUsers.set(existing);
                    toast(
                      __t("integrations.supplierPortal.userCreatedLocal") ||
                        "User created (local)",
                      { kind: "success" },
                    );
                    setShowCreateUser(false);
                    setNewUser({
                      email: "",
                      name: "",
                      vendorId: "",
                      password: "",
                    });
                    setUsers((prev) => [
                      ...prev,
                      { id: "su-" + Date.now(), ...newUser, active: true },
                    ]);
                  } else {
                    toast(
                      __t("integrations.supplierPortal.createUserFailed") ||
                        "Failed: " + (e.message || "error"),
                      { kind: "error" },
                    );
                  }
                } finally {
                  setCreatingUser(false);
                }
              }}
            >
              {creatingUser ? (
                <>
                  <span className="spinner" style={{ width: 10, height: 10 }} />{" "}
                  {__t("integrations.supplierPortal.creating") || "Creating…"}
                </>
              ) : (
                <>
                  <Icon.Check size={12} /> {__t("common.create") || "Create"}
                </>
              )}
            </button>
          </div>
        </div>
      )}
      <div className="d-grid gap-12" style={{ gridTemplateColumns: "1fr 2fr" }}>
        <div className="card">
          <div className="fw-600 fs-11 uppercase letter-sp-6 fg-3 px-16 py-10">
            {__t("integrations.supplierPortal.supplierUsers", {
              count: users.length,
            }) || "Supplier Users (" + users.length + ")"}
          </div>
          {loading ? (
            SkeletonCards({ count: 3 })
          ) : users.length === 0 ? (
            <div className="text-center fg-3 fs-11 p-16">
              {__t("integrations.supplierPortal.noUsers") ||
                "No supplier users yet"}
            </div>
          ) : (
            <div className="px-16 pb-12">
              {users.map((u) => (
                <div
                  key={u.id}
                  className="flex justify-between border-bottom py-8"
                >
                  <div>
                    <div className="fs-12 fw-500">{u.name}</div>
                    <div className="fs-10 fg-3">{u.email}</div>
                  </div>
                  <span
                    className={(
                      "status " +
                      (u.active ? "released" : "deprecated") +
                      " fs-9"
                    ).trim()}
                  >
                    {u.active
                      ? __t("integrations.supplierPortal.active") || "Active"
                      : __t("integrations.supplierPortal.inactive") ||
                        "Inactive"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="card">
          <div className="fw-600 fs-11 uppercase letter-sp-6 fg-3 px-16 py-10">
            {__t("integrations.supplierPortal.priceUpdates", {
              count: priceUpdates.length,
            }) || "Price Update Submissions (" + priceUpdates.length + ")"}
          </div>
          <table className="bom-table">
            <thead>
              <tr>
                <th>
                  {__t("integrations.supplierPortal.table.part") || "Part"}
                </th>
                <th>
                  {__t("integrations.supplierPortal.table.oldPrice") ||
                    "Old Price"}
                </th>
                <th>
                  {__t("integrations.supplierPortal.table.newPrice") ||
                    "New Price"}
                </th>
                <th>
                  {__t("integrations.supplierPortal.table.status") || "Status"}
                </th>
                <th>
                  {__t("integrations.supplierPortal.table.date") || "Date"}
                </th>
                <th>
                  {__t("integrations.supplierPortal.table.actions") ||
                    "Actions"}
                </th>
              </tr>
            </thead>
            <tbody>
              {priceUpdates.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="text-center fg-3 fs-11"
                    style={{ padding: 20 }}
                  >
                    {__t("integrations.supplierPortal.noPriceUpdates") ||
                      "No price updates submitted"}
                  </td>
                </tr>
              ) : (
                priceUpdates.map((p) => (
                  <tr key={p.id}>
                    <td className="fs-11">{p.partId}</td>
                    <td className="mono fs-11">{INR(p.oldPrice, 2)}</td>
                    <td className="mono fs-11">{INR(p.newPrice, 2)}</td>
                    <td>
                      <span
                        className={
                          "status " +
                          (p.status === "approved"
                            ? "released"
                            : p.status === "rejected"
                              ? "deprecated"
                              : "review")
                        }
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="fs-10 fg-3">{p.createdAt || "\u2014"}</td>
                    <td>
                      {p.status === "pending" && (
                        <div className="flex gap-4">
                          <button
                            className="btn small primary"
                            disabled={actionIds.has("approve-" + p.id)}
                            onClick={() => approve(p.id)}
                          >
                            <Icon.Check size={10} />{" "}
                            {actionIds.has("approve-" + p.id)
                              ? "…"
                              : __t("common.approve") || "Approve"}
                          </button>
                          <button
                            className="btn small fg-danger"
                            disabled={actionIds.has("reject-" + p.id)}
                            onClick={() => reject(p.id)}
                          >
                            <Icon.X size={10} />{" "}
                            {actionIds.has("reject-" + p.id)
                              ? "…"
                              : __t("common.reject") || "Reject"}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
// ============ AI & AUTOMATION ============
function AIFeaturesScreen() {
  const [tab, setTab] = React.useState("forecast");
  const [forecasts, setForecasts] = React.useState([]);
  const [suggestions, setSuggestions] = React.useState([]);
  const [validationResults, setValidationResults] = React.useState([]);
  const [rules, setRules] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const loadForecast = React.useCallback(() => {
    setLoading(true);
    aiAPI?.demandForecast
      .list()
      .then((r) => {
        setForecasts(Array.isArray(r) ? r : []);
        setLoading(false);
      })
      .catch(function () {
        console.error("Failed to load forecasts");
        setForecasts([]);
        setLoading(false);
      });
  }, []);
  const loadSuggestions = React.useCallback(() => {
    setLoading(true);
    aiAPI?.interchangeability
      .list()
      .then((r) => {
        setSuggestions(Array.isArray(r) ? r : []);
        setLoading(false);
      })
      .catch(function () {
        console.error("Failed to load interchangeability suggestions");
        setSuggestions([]);
        setLoading(false);
      });
  }, []);
  const loadValidation = React.useCallback(() => {
    setLoading(true);
    aiAPI?.validation
      .results()
      .then((r) => {
        setValidationResults(Array.isArray(r) ? r : []);
        setLoading(false);
      })
      .catch(function () {
        console.error("Failed to load validation results");
        setValidationResults([]);
        setLoading(false);
      });
  }, []);
  const loadRules = React.useCallback(() => {
    setLoading(true);
    approvalAutomationAPI
      ?.listRules()
      .then((r) => {
        setRules(Array.isArray(r) ? r : []);
        setLoading(false);
      })
      .catch(function () {
        console.error("Failed to load approval rules");
        setRules([]);
        setLoading(false);
      });
  }, []);
  React.useEffect(() => {
    if (tab === "forecast") loadForecast();
    else if (tab === "interchange") loadSuggestions();
    else if (tab === "validation") loadValidation();
    else if (tab === "automation") loadRules();
  }, [tab]);
  const generateForecast = async () => {
    setLoading(true);
    try {
      await aiAPI?.demandForecast.generate();
      toast(
        __t("integrations.ai.forecastGenerated") ||
          "Forecasts generated from PO history",
        { kind: "success" },
      );
      loadForecast();
    } catch (_e) {
      toast(__t("common.error") || "Failed to generate forecasts", {
        kind: "error",
      });
    }
    setLoading(false);
  };
  const runValidation = async () => {
    setLoading(true);
    try {
      await aiAPI?.validation.run();
      toast(
        __t("integrations.ai.validationComplete") || "Validation complete",
        { kind: "success" },
      );
      loadValidation();
    } catch (_e) {
      toast(__t("common.error") || "Validation failed", { kind: "error" });
    }
    setLoading(false);
  };
  const analyzeInterchangeability = async () => {
    setLoading(true);
    try {
      await aiAPI?.interchangeability.analyze();
      toast(__t("integrations.ai.analysisComplete") || "Analysis complete", {
        kind: "success",
      });
      loadSuggestions();
    } catch (_e) {
      toast(__t("common.error") || "Analysis failed", { kind: "error" });
    }
    setLoading(false);
  };
  return (
    <div className="screen-wrap">
      <div className="screen-header">
        <div>
          <h1>{__t("integrations.ai.title") || "AI & Automation"}</h1>
          <div className="sub">
            {__t("integrations.ai.subtitle") ||
              "Demand forecasting, part interchangeability, poka-yoke validation, and approval automation"}
          </div>
        </div>
      </div>
      <div className="flex gap-4 mb-12">
        {[
          ["forecast", __t("integrations.ai.tabForecast") || "Demand Forecast"],
          [
            "interchange",
            __t("integrations.ai.tabInterchange") || "Interchangeability",
          ],
          [
            "validation",
            __t("integrations.ai.tabValidation") || "Validation Rules",
          ],
          [
            "automation",
            __t("integrations.ai.tabAutomation") || "Approval Automation",
          ],
        ].map(([key, label]) => (
          <button
            key={key}
            className={"btn" + (tab === key ? " primary" : "")}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "forecast" && (
        <div className="card">
          <div className="flex justify-between items-center px-16 py-10">
            <span className="fw-600 fs-11 uppercase letter-sp-6 fg-3">
              {__t("integrations.ai.forecastSection") || "Demand Forecasts"}
            </span>
            <button
              className="btn primary"
              onClick={generateForecast}
              disabled={loading}
            >
              <Icon.Sparkles size={12} />{" "}
              {__t("integrations.ai.generateForecast") ||
                "Generate from PO History"}
            </button>
          </div>
          {loading ? (
            SkeletonTable({ rows: 5, cols: 5 })
          ) : forecasts.length === 0 ? (
            <div className="text-center fg-3 fs-12 p-40">
              {__t("integrations.ai.forecastEmpty") ||
                'No forecasts yet. Click "Generate from PO History" to analyze demand patterns.'}
            </div>
          ) : (
            <table className="bom-table">
              <thead>
                <tr>
                  <th>{__t("integrations.ai.forecastTable.part") || "Part"}</th>
                  <th>
                    {__t("integrations.ai.forecastTable.date") ||
                      "Forecast Date"}
                  </th>
                  <th>
                    {__t("integrations.ai.forecastTable.qty") ||
                      "Predicted Qty"}
                  </th>
                  <th>
                    {__t("integrations.ai.forecastTable.confidence") ||
                      "Confidence"}
                  </th>
                  <th>
                    {__t("integrations.ai.forecastTable.model") || "Model"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {forecasts.map((f, i) => (
                  <tr key={f.partId + "-" + f.forecastDate}>
                    <td className="fs-11">{f.partId}</td>
                    <td className="mono fs-11">{f.forecastDate}</td>
                    <td className="mono fs-11">{f.predictedQuantity}</td>
                    <td>
                      <span
                        className={
                          "status " +
                          (f.confidence >= 0.8
                            ? "released"
                            : f.confidence >= 0.5
                              ? "review"
                              : "deprecated")
                        }
                      >
                        {Math.round((f.confidence || 0) * 100)}%
                      </span>
                    </td>
                    <td className="fs-10 fg-3">{f.model || "po-history"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      {tab === "interchange" && (
        <div className="card">
          <div className="flex justify-between items-center px-16 py-10">
            <span className="fw-600 fs-11 uppercase letter-sp-6 fg-3">
              {__t("integrations.ai.interchangeSection") ||
                "Interchangeability Suggestions"}
            </span>
            <button
              className="btn primary"
              onClick={analyzeInterchangeability}
              disabled={loading}
            >
              <Icon.Sparkles size={12} />{" "}
              {__t("integrations.ai.analyzeParts") || "Analyze Parts"}
            </button>
          </div>
          {loading ? (
            SkeletonTable({ rows: 4, cols: 5 })
          ) : suggestions.length === 0 ? (
            <div className="text-center fg-3 fs-12 p-40">
              {__t("integrations.ai.interchangeEmpty") ||
                'No suggestions yet. Click "Analyze Parts" to find interchangeable components.'}
            </div>
          ) : (
            <table className="bom-table">
              <thead>
                <tr>
                  <th>
                    {__t("integrations.ai.interchangeTable.partA") || "Part A"}
                  </th>
                  <th>
                    {__t("integrations.ai.interchangeTable.partB") || "Part B"}
                  </th>
                  <th>
                    {__t("integrations.ai.interchangeTable.similarity") ||
                      "Similarity"}
                  </th>
                  <th>
                    {__t("integrations.ai.interchangeTable.reason") || "Reason"}
                  </th>
                  <th>
                    {__t("integrations.ai.interchangeTable.status") || "Status"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {suggestions.map((s, i) => (
                  <tr key={s.partId1 + "-" + s.partId2}>
                    <td className="fs-11">{s.partId1}</td>
                    <td className="fs-11">{s.partId2}</td>
                    <td>
                      <div>
                        <div
                          style={{
                            height: 6,
                            borderRadius: 3,
                            background: "var(--line)",
                          }}
                        >
                          <div
                            style={{
                              width: (s.similarity || 0) * 50,
                              height: "100%",
                              borderRadius: 3,
                              background: "var(--accent)",
                            }}
                          />
                        </div>
                        <span
                          className="mono flex items-center gap-6 w-50"
                          style={{ fontSize: 10 }}
                        >
                          {Math.round((s.similarity || 0) * 100)}%
                        </span>
                      </div>
                    </td>
                    <td className="fs-10 fg-3">{s.reason}</td>
                    <td>
                      <span
                        className={
                          "status " +
                          (s.status === "approved" ? "released" : "review")
                        }
                      >
                        {s.status || "pending"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      {tab === "validation" && (
        <div className="card">
          <div className="flex justify-between items-center px-16 py-10">
            <span className="fw-600 fs-11 uppercase letter-sp-6 fg-3">
              {__t("integrations.ai.validationSection") ||
                "Poka-yoke Validation Results"}
            </span>
            <button
              className="btn primary"
              onClick={runValidation}
              disabled={loading}
            >
              <Icon.Sparkles size={12} />{" "}
              {__t("integrations.ai.runValidation") || "Run Validation"}
            </button>
          </div>
          {loading ? (
            SkeletonTable({ rows: 5, cols: 5 })
          ) : validationResults.length === 0 ? (
            <div className="text-center fg-3 fs-12 p-40">
              {__t("integrations.ai.validationEmpty") ||
                'No validation results. Click "Run Validation" to check BOMs against poka-yoke rules.'}
            </div>
          ) : (
            <table className="bom-table">
              <thead>
                <tr>
                  <th>
                    {__t("integrations.ai.validationTable.part") || "Part"}
                  </th>
                  <th>
                    {__t("integrations.ai.validationTable.rule") || "Rule"}
                  </th>
                  <th>
                    {__t("integrations.ai.validationTable.result") || "Result"}
                  </th>
                  <th>
                    {__t("integrations.ai.validationTable.message") ||
                      "Message"}
                  </th>
                  <th>
                    {__t("integrations.ai.validationTable.severity") ||
                      "Severity"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {validationResults.map((v, i) => (
                  <tr key={v.partId + "-" + v.ruleName}>
                    <td className="fs-11">{v.partId}</td>
                    <td className="fs-11">{v.ruleName}</td>
                    <td>
                      <span
                        className={
                          "status " + (v.passed ? "released" : "deprecated")
                        }
                      >
                        {v.passed
                          ? __t("integrations.ai.pass") || "PASS"
                          : __t("integrations.ai.fail") || "FAIL"}
                      </span>
                    </td>
                    <td className="fs-10 fg-3">{v.message}</td>
                    <td>
                      <span
                        className={("tag-pill" + " fs-9").trim()}
                        style={{
                          color:
                            v.severity === "critical"
                              ? "var(--danger)"
                              : v.severity === "warning"
                                ? "var(--warn)"
                                : undefined,
                        }}
                      >
                        {v.severity}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      {tab === "automation" && (
        <div className="card">
          <div className="fw-600 fs-11 uppercase letter-sp-6 fg-3 px-16 py-10">
            {__t("integrations.ai.automationSection") ||
              "Approval Automation Rules"}
          </div>
          {loading ? (
            SkeletonCards({ count: 4 })
          ) : rules.length === 0 ? (
            <div className="text-center fg-3 fs-12 p-40">
              {__t("integrations.ai.automationEmpty") ||
                "No automation rules configured. Rules auto-approve requests matching conditions."}
            </div>
          ) : (
            <div className="px-16 pb-12">
              {rules.map((r) => (
                <div
                  key={r.id}
                  className="flex justify-between border-bottom py-10"
                >
                  <div>
                    <div className="fs-12 fw-500">{r.name}</div>
                    <div className="fs-10 fg-3 font-mono">
                      {r.conditions ||
                        __t("integrations.ai.noConditions") ||
                        "No conditions"}
                    </div>
                  </div>
                  <span
                    className={(
                      "status " +
                      (r.active ? "released" : "deprecated") +
                      " fs-9"
                    ).trim()}
                  >
                    {r.active
                      ? __t("integrations.ai.active") || "Active"
                      : __t("integrations.ai.disabled") || "Disabled"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
// ============ MONITORING DASHBOARD ============
function MonitoringScreen() {
  const [metrics, setMetrics] = React.useState(null);
  const [health, setHealth] = React.useState(null);
  const [, setLoading] = React.useState(false);
  React.useEffect(() => {
    setLoading(true);
    Promise.all([
      monitoringAPI?.metrics().catch(() => {
        return null;
      }),
      monitoringAPI?.healthDetailed().catch(() => {
        return null;
      }),
    ])
      .then(([m, h]) => {
        setMetrics(m);
        setHealth(h);
        setLoading(false);
      })
      .catch(() => {
        console.error("Failed to load monitoring data");
        setMetrics(null);
        setHealth(null);
        setLoading(false);
      });
  }, []);
  return (
    <div className="screen-wrap">
      <div className="screen-header">
        <div>
          <h1>{__t("integrations.monitoring.title") || "System Monitoring"}</h1>
          <div className="sub">
            {__t("integrations.monitoring.subtitle") ||
              "Application health, metrics, and performance"}
          </div>
        </div>
        <button
          className="btn"
          onClick={() => {
            setLoading(true);
            Promise.all([
              monitoringAPI?.metrics(),
              monitoringAPI?.healthDetailed(),
            ])
              .then(([m, h]) => {
                setMetrics(m);
                setHealth(h);
                setLoading(false);
              })
              .catch(() => {
                console.error("Monitoring refresh failed");
                setMetrics(null);
                setHealth(null);
                setLoading(false);
              });
          }}
        >
          <Icon.Refresh size={12} />{" "}
          {__t("integrations.monitoring.refresh") || "Refresh"}
        </button>
      </div>
      {health && (
        <div
          className="kpi-grid mb-12"
          style={{ gridTemplateColumns: "repeat(4, 1fr)" }}
        >
          <div className="kpi">
            <div className="l">
              {__t("integrations.monitoring.apiStatus") || "API Status"}
            </div>
            <div
              className="v"
              style={{
                color:
                  health.status === "healthy"
                    ? "var(--green, #10b981)"
                    : "var(--danger)",
              }}
            >
              {health.status}
            </div>
          </div>
          <div className="kpi">
            <div className="l">
              {__t("integrations.monitoring.uptime") || "Uptime"}
            </div>
            <div className="v">{health.uptime || "\u2014"}</div>
          </div>
          <div className="kpi">
            <div className="l">
              {__t("integrations.monitoring.memory") || "Memory"}
            </div>
            <div className="v">{health.memory?.usedMB || "\u2014"} MB</div>
          </div>
          <div className="kpi">
            <div className="l">{__t("integrations.monitoring.db") || "DB"}</div>
            <div
              className="v"
              style={{
                color:
                  health.database?.status === "connected"
                    ? "var(--green, #10b981)"
                    : "var(--danger)",
              }}
            >
              {health.database?.status || "\u2014"}
            </div>
          </div>
        </div>
      )}
      {metrics && (
        <div className="card">
          <div className="fw-600 fs-11 uppercase letter-sp-6 fg-3 px-16 py-10">
            {__t("integrations.monitoring.metrics") || "Prometheus Metrics"}
          </div>
          <pre
            className="fs-10 font-mono overflow-x-a bg-sunk rounded-r2"
            style={{ padding: 16, maxHeight: 400, margin: "0 16px 16px" }}
          >
            {metrics}
          </pre>
        </div>
      )}
    </div>
  );
}
// Register screens globally
window.WebhooksScreen = WebhooksScreen;
// ============ ORDER TRACKING (Amazon-style) ============
function OrderTrackingScreen() {
  const [trackings, setTrackings] = React.useState([]);
  const [stats, setStats] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [selectedTracking, setSelectedTracking] = React.useState(null);
  const [detailData, setDetailData] = React.useState(null);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [stageFilter, setStageFilter] = React.useState("all");
  const STAGE_ICONS = {
    order_placed: "\u{1F4CB}",
    confirmed: "\u2705",
    processing: "\u2699\uFE0F",
    packed: "\u{1F4E6}",
    shipped: "\u{1F69A}",
    in_transit: "\u{1F310}",
    out_for_delivery: "\u{1F4CD}",
    delivered: "\u{1F3E0}",
    completed: "\u{1F389}",
  };
  const STAGE_COLORS = {
    order_placed: "#6b7280",
    confirmed: "#3b82f6",
    processing: "#8b5cf6",
    packed: "#f59e0b",
    shipped: "#e85d1f",
    in_transit: "#06b6d4",
    out_for_delivery: "#10b981",
    delivered: "#22c55e",
    completed: "#15803d",
  };
  const STAGE_LABELS = {
    order_placed: __t("orderTracking.stage.orderPlaced") || "Order Placed",
    confirmed: __t("orderTracking.stage.confirmed") || "Confirmed",
    processing: __t("orderTracking.stage.processing") || "Processing",
    packed: __t("orderTracking.stage.packed") || "Packed",
    shipped: __t("orderTracking.stage.shipped") || "Shipped",
    in_transit: __t("orderTracking.stage.inTransit") || "In Transit",
    out_for_delivery:
      __t("orderTracking.stage.outForDelivery") || "Out for Delivery",
    delivered: __t("orderTracking.stage.delivered") || "Delivered",
    completed: __t("orderTracking.stage.completed") || "Completed",
  };
  const load = React.useCallback(() => {
    setLoading(true);
    Promise.all([
      orderTrackingAPI?.list({ limit: 200 }).catch(() => {
        return { total: 0, items: [] };
      }),
      orderTrackingAPI?.stats().catch(() => {
        return null;
      }),
    ])
      .then(([list, st]) => {
        setTrackings(list.items || []);
        setStats(st);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);
  React.useEffect(() => {
    load();
  }, [load]);
  const loadDetail = async (id) => {
    try {
      const detail = await orderTrackingAPI?.get(id);
      setDetailData(detail);
      setSelectedTracking(id);
    } catch (_e) {
      toast(
        __t("orderTracking.loadFailed") || "Failed to load tracking details",
        { kind: "error" },
      );
    }
  };
  const advanceStage = async (id) => {
    try {
      const result = await orderTrackingAPI?.advance(id);
      toast(result.message, { kind: "success" });
      load();
      if (selectedTracking === id) loadDetail(id);
    } catch (_e) {
      toast(__t("orderTracking.advanceFailed") || "Failed to advance", {
        kind: "error",
      });
    }
  };
  const filtered = React.useMemo(() => {
    let r = trackings;
    if (stageFilter !== "all")
      r = r.filter((t) => t.currentStage === stageFilter);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      r = r.filter(
        (t) =>
          (t.po?.poNumber || "").toLowerCase().includes(q) ||
          (t.po?.vendorName || "").toLowerCase().includes(q) ||
          (t.trackingNumber || "").toLowerCase().includes(q),
      );
    }
    return r;
  }, [trackings, stageFilter, searchQuery]);
  // Detail view with Amazon-style timeline
  if (selectedTracking && detailData) {
    return (
      <div className="screen-wrap">
        <div className="screen-header">
          <div className="flex items-center gap-12">
            <button
              className="btn"
              onClick={() => {
                setSelectedTracking(null);
                setDetailData(null);
              }}
            >
              <Icon.ChevronLeft size={14} /> {__t("common.back") || "Back"}
            </button>
            <div>
              <h1>
                {detailData.po?.poNumber ||
                  __t("orderTracking.title") ||
                  "Order Tracking"}
              </h1>
              <div className="sub">
                {detailData.po?.vendorName} \u00B7{" "}
                {detailData.po?.project || ""}
              </div>
            </div>
          </div>
          <div className="flex gap-8">
            {detailData.currentStage !== "completed" &&
              detailData.currentStage !== "delivered" && (
                <button
                  className="btn primary"
                  onClick={() => advanceStage(detailData.id)}
                >
                  <Icon.ChevronRight size={12} />{" "}
                  {__t("orderTracking.advanceStage") || "Advance Stage"}
                </button>
              )}
          </div>
        </div>
        {/* Status Banner */}
        <div
          style={{
            background: STAGE_COLORS[detailData.currentStage] || "#6b7280",
            color: "white",
            padding: "16px 20px",
            borderRadius: "var(--r-2)",
            marginBottom: 16,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div className="fs-20 fw-700">
              {STAGE_ICONS[detailData.currentStage] || "\u{1F4E6}"}{" "}
              {STAGE_LABELS[detailData.currentStage] || detailData.currentStage}
            </div>
            {detailData.estimatedDelivery && (
              <div className="fs-12 op-09 mt-4">
                {detailData.currentStage === "delivered" ||
                detailData.currentStage === "completed"
                  ? (__t("orderTracking.deliveredOn") || "Delivered on ") +
                    (detailData.actualDelivery || detailData.estimatedDelivery)
                  : (__t("orderTracking.expectedDelivery") ||
                      "Expected delivery: ") + detailData.estimatedDelivery}
              </div>
            )}
          </div>
          {detailData.trackingNumber && (
            <div className="text-right">
              <div className="fs-10 op-07">
                {__t("orderTracking.tracking") || "TRACKING"}
              </div>
              <div className="mono fs-13 fw-600">
                {detailData.trackingNumber}
              </div>
            </div>
          )}
        </div>
        {/* Amazon-style milestone progress bar */}
        <div className="card mb-16" style={{ padding: "20px 16px" }}>
          <div
            className="pos-relative flex justify-between"
            style={{ padding: "0 8px" }}
          >
            {/* Progress line */}
            <div
              className="pos-absolute br-2"
              style={{
                top: 14,
                left: 20,
                right: 20,
                height: 3,
                background: "var(--line)",
              }}
            />
            <div className="pos-absolute" />
            {(detailData.milestones || [])
              .filter((m) => m.stage !== "completed")
              .map((m, i, arr) => {
                const isActive = m.stage === detailData.currentStage;
                const isCompleted = m.completed;
                const _progress = isCompleted ? 100 : isActive ? 50 : 0;
                return (
                  <div
                    key={m.id}
                    className="flex flex-col items-center z-1 flex-1"
                  >
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 12,
                        fontWeight: 700,
                        border:
                          "2px solid " +
                          (isCompleted || isActive
                            ? STAGE_COLORS[detailData.currentStage]
                            : "var(--line)"),
                        background: isCompleted
                          ? STAGE_COLORS[detailData.currentStage]
                          : isActive
                            ? STAGE_COLORS[detailData.currentStage] + "22"
                            : "var(--bg)",
                        color: isCompleted
                          ? "white"
                          : isActive
                            ? STAGE_COLORS[detailData.currentStage]
                            : "var(--fg-3)",
                        boxShadow: isActive
                          ? "0 0 0 4px " +
                            STAGE_COLORS[detailData.currentStage] +
                            "33"
                          : "none",
                      }}
                    >
                      {isCompleted ? "\u2714" : i + 1}
                    </div>
                    <div
                      style={{
                        fontSize: 8,
                        marginTop: 6,
                        textAlign: "center",
                        fontWeight: isActive ? 700 : 400,
                        color:
                          isCompleted || isActive ? "var(--fg)" : "var(--fg-3)",
                        maxWidth: 60,
                      }}
                    >
                      {m.label}
                    </div>
                    {m.completedAt && (
                      <div className="fg-4 mt-2" style={{ fontSize: 7 }}>
                        {m.completedAt.split(" ")[0] ||
                          m.completedAt.slice(0, 10)}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
        {/* Shipment Updates Timeline */}
        <div
          className="d-grid gap-12"
          style={{ gridTemplateColumns: "2fr 1fr" }}
        >
          <div className="card">
            <div className="fw-600 fs-11 uppercase letter-sp-6 fg-3 px-16 py-10">
              {__t("orderTracking.shipmentUpdates") || "Shipment Updates"} (
              {(detailData.shipmentUpdates || []).length})
            </div>
            {(detailData.shipmentUpdates || []).length === 0 ? (
              <div className="text-center fg-3 fs-11" style={{ padding: 24 }}>
                {__t("orderTracking.noShipmentUpdates") ||
                  "No shipment updates yet"}
              </div>
            ) : (
              <div className="px-16 pb-12">
                {detailData.shipmentUpdates.map((u, i) => (
                  <div
                    key={u.id}
                    className="flex gap-12"
                    style={{
                      padding: "10px 0",
                      borderBottom:
                        i < detailData.shipmentUpdates.length - 1
                          ? "1px solid var(--line)"
                          : "none",
                    }}
                  >
                    <div
                      className="w-8 h-8 br-50p mt-4 flex-shrink-0"
                      style={{
                        background: i === 0 ? "#e85d1f" : "var(--line)",
                      }}
                    />
                    <div className="flex-1">
                      <div className="flex justify-between">
                        <span className="fs-11 fw-600">{u.status}</span>
                        <span className="fs-9 fg-4">
                          {u.timestamp || u.createdAt || "\u2014"}
                        </span>
                      </div>
                      {u.location && (
                        <div className="fs-10 fg-3 mt-2">{u.location}</div>
                      )}
                      {u.description && (
                        <div className="fs-10 fg-3 mt-2">{u.description}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* Order Details Sidebar */}
          <div>
            <div className="card mb-12 p-16">
              <div className="fs-10 uppercase letter-sp-6 fg-3 mb-8">
                {__t("orderTracking.orderDetails") || "Order Details"}
              </div>
              <div className="d-grid gap-8">
                <div>
                  <div className="fs-9 fg-4 fs-13 fw-700 fg-accent">
                    {__t("orderTracking.amount") || "Amount"}
                  </div>
                  <div>{INR?.(detailData.po?.poTotal, 0) || "\u2014"}</div>
                </div>
                <div>
                  <div className="fs-9 fg-4 fs-11">
                    {__t("orderTracking.carrier") || "Carrier"}
                  </div>
                  <div>{detailData.carrier || "\u2014"}</div>
                </div>
                <div>
                  <div>
                    {__t("orderTracking.trackingNumber") || "Tracking #"}
                  </div>
                  <div className="mono fs-9 fg-4 fs-10">
                    {detailData.trackingNumber || "\u2014"}
                  </div>
                </div>
                <div>
                  <div className="fs-9 fg-4 fs-10">
                    {__t("orderTracking.shipTo") || "Ship To"}
                  </div>
                  <div>{detailData.shippingAddress || "\u2014"}</div>
                </div>
                {detailData.notes && (
                  <div>
                    <div className="fs-9 fg-4 fs-10">
                      {__t("orderTracking.notes") || "Notes"}
                    </div>
                    <div>{detailData.notes}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  // List view
  return (
    <div className="screen-wrap">
      <div className="screen-header">
        <div>
          <h1>{__t("orderTracking.title") || "Order Tracking"}</h1>
          <div className="sub">
            {loading
              ? __t("common.loading") || "Loading..."
              : __t("orderTracking.ordersCount", {
                  count: filtered.length,
                  overdue: stats?.overdue || 0,
                }) ||
                `${filtered.length} orders being tracked \u00B7 ${stats?.overdue || 0} overdue`}
          </div>
        </div>
        <div className="flex gap-8">
          <div className="search w-220 h-32">
            <Icon.Search size={12} />
            <input
              id="ordertrack-search"
              name="orderSearch"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                __t("orderTracking.searchPlaceholder") ||
                "Search by PO, vendor, tracking..."
              }
            />
          </div>
          <select
            id="ordertrack-stage"
            name="stageFilter"
            className="twk-field w-160 h-32 fs-11"
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
          >
            <option value="all">
              {__t("orderTracking.allStages") || "All Stages"}
            </option>
            {Object.entries(STAGE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </div>
      {/* Stage Summary Cards */}
      {stats && (
        <div
          className="kpi-grid mb-14"
          style={{ gridTemplateColumns: "repeat(5, 1fr)" }}
        >
          {[
            "order_placed",
            "shipped",
            "in_transit",
            "delivered",
            "completed",
          ].map((stage) => (
            <div
              key={stage}
              className="kpi c-pointer"
              style={{ borderLeft: "3px solid " + STAGE_COLORS[stage] }}
              onClick={() => setStageFilter(stage)}
            >
              <div className="l">{STAGE_LABELS[stage]}</div>
              <div className="v" style={{ color: STAGE_COLORS[stage] }}>
                {stats.byStage?.[stage] || 0}
              </div>
            </div>
          ))}
        </div>
      )}
      {/* Tracking Cards */}
      <div
        className="d-grid gap-12"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))" }}
      >
        {loading ? (
          SkeletonCards({ count: 6 })
        ) : filtered.length === 0 ? (
          <div
            className="text-center fg-3 fs-12 p-40"
            style={{ gridColumn: "1/-1" }}
          >
            {__t("orderTracking.noMatch") || "No orders match your filters"}
          </div>
        ) : (
          filtered.map((t) => {
            const completedStages = (t.milestones || []).filter(
              (m) => m.completed,
            ).length;
            const totalStages = (t.milestones || []).length || 9;
            const progress =
              totalStages > 0 ? (completedStages / totalStages) * 100 : 0;
            return (
              <div
                key={t.id}
                onClick={() => loadDetail(t.id)}
                className="bg-elev"
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--accent)";
                  e.currentTarget.style.boxShadow =
                    "0 2px 8px rgba(0,0,0,0.08)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--line)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                <div
                  className="flex justify-between mb-10"
                  style={{ alignItems: "start" }}
                >
                  <div>
                    <div className="fs-14 fw-700">
                      {t.po?.poNumber || "PO-" + t.poHeaderId}
                    </div>
                    <div className="fs-11 fg-3 mt-2">
                      {t.po?.vendorName ||
                        __t("orderTracking.unknownVendor") ||
                        "Unknown Vendor"}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      padding: "3px 8px",
                      borderRadius: 12,
                      background: STAGE_COLORS[t.currentStage] + "22",
                      color: STAGE_COLORS[t.currentStage],
                    }}
                  >
                    {STAGE_LABELS[t.currentStage] || t.currentStage}
                  </span>
                </div>
                {/* Mini progress bar */}
                <div
                  className="h-4 br-2 mb-8"
                  style={{ background: "var(--line)" }}
                >
                  <div
                    className="h-100p br-2"
                    style={{
                      width: progress + "%",
                      background: STAGE_COLORS[t.currentStage],
                      transition: "width " + ANIM.PROGRESS_BAR,
                    }}
                  />
                </div>
                <div className="flex justify-between items-center">
                  <div className="fs-10 fg-4">
                    {__t("orderTracking.stagesProgress", {
                      completed: completedStages,
                      total: totalStages - 1,
                    }) || `${completedStages}/${totalStages - 1} stages`}
                    {t.estimatedDelivery &&
                      " \u00B7 " +
                        (__t("orderTracking.eta") || "ETA: ") +
                        t.estimatedDelivery}
                  </div>
                  <div className="fs-14 fw-700 fg-accent">
                    {INR?.(t.po?.poTotal, 0) || "\u2014"}
                  </div>
                </div>
                {t.trackingNumber && (
                  <div className="fs-9 fg-4 mt-6">
                    <Icon.Link size={9} />{" "}
                    <span className="mono">{t.trackingNumber}</span> \u00B7{" "}
                    {t.carrier || ""}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
export {
  WebhooksScreen,
  BulkImportScreen,
  ERPConnectorsScreen,
  SupplierPortalScreen,
  AIFeaturesScreen,
  MonitoringScreen,
  OrderTrackingScreen,
};
window.WebhooksScreen = WebhooksScreen;
window.BulkImportScreen = BulkImportScreen;
window.ERPConnectorsScreen = ERPConnectorsScreen;
window.SupplierPortalScreen = SupplierPortalScreen;
window.AIFeaturesScreen = AIFeaturesScreen;
window.MonitoringScreen = MonitoringScreen;
window.OrderTrackingScreen = OrderTrackingScreen;
