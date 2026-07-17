import { storage } from "../utils/storage.js";
import { ANIM } from "../utils/design-tokens.js";
import { __t } from "../i18n";
import { toast } from "../utils/toast";
import {
  Button,
  Field,
  Input,
  Select,
  Card,
  DataTable,
  Badge,
  StatusPill,
  Tabs,
  EmptyState,
  ScreenHeader,
} from "../components/ui/index.js";
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
  const erpColumns = [
    {
      key: "name",
      header: __t("integrations.erp.table.name") || "Name",
      render: (c) => <span className="fw-600 fs-12">{c.name}</span>,
    },
    {
      key: "type",
      header: __t("integrations.erp.table.type") || "Type",
      render: (c) => <Badge tone="neutral">{String(c.type).toUpperCase()}</Badge>,
    },
    {
      key: "baseUrl",
      header: __t("integrations.erp.table.url") || "URL",
      render: (c) => <span className="mono fs-10">{c.baseUrl}</span>,
    },
    {
      key: "status",
      header: __t("integrations.erp.table.status") || "Status",
      render: (c) => (
        <StatusPill
          tone={c.active ? "success" : "danger"}
          label={
            c.active
              ? __t("integrations.erp.connected") || "Connected"
              : __t("integrations.erp.disabled") || "Disabled"
          }
        />
      ),
    },
    {
      key: "lastSyncAt",
      header: __t("integrations.erp.table.lastSync") || "Last Sync",
      render: (c) => (
        <span className="fs-10 fg-3">
          {c.lastSyncAt || __t("integrations.erp.never") || "Never"}
        </span>
      ),
    },
    {
      key: "actions",
      header: __t("integrations.erp.table.actions") || "Actions",
      render: (c) => (
        <div className="flex gap-4">
          <Button
            size="sm"
            disabled={actionIds.has("test-" + c.id)}
            loading={actionIds.has("test-" + c.id)}
            onClick={() => testConnection(c.id)}
          >
            <Icon.Link size={10} /> {__t("integrations.erp.test") || "Test"}
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={actionIds.has("sync-" + c.id)}
            loading={actionIds.has("sync-" + c.id)}
            onClick={() => syncNow(c.id)}
          >
            <Icon.Refresh size={10} /> {__t("integrations.erp.sync") || "Sync"}
          </Button>
          <Button size="sm" onClick={() => loadLogs(c.id)}>
            <Icon.Doc size={10} /> {__t("integrations.erp.logs") || "Logs"}
          </Button>
          <Button
            variant="danger"
            size="sm"
            disabled={actionIds.has("del-" + c.id)}
            loading={actionIds.has("del-" + c.id)}
            iconOnly
            aria-label={__t("common.delete") || "Delete"}
            onClick={() => deleteConnector(c.id)}
          >
            <Icon.Trash size={10} />
          </Button>
        </div>
      ),
    },
  ];
  const erpLogColumns = [
    {
      key: "direction",
      header: __t("integrations.erp.logsTable.direction") || "Direction",
      render: (l) => <Badge>{l.direction}</Badge>,
    },
    {
      key: "entityType",
      header: __t("integrations.erp.logsTable.entity") || "Entity",
      render: (l) => <span className="fs-11">{l.entityType}</span>,
    },
    {
      key: "recordsCount",
      header: __t("integrations.erp.logsTable.records") || "Records",
      align: "num",
      render: (l) => <span className="mono fs-11">{l.recordsCount}</span>,
    },
    {
      key: "status",
      header: __t("integrations.erp.logsTable.status") || "Status",
      render: (l) => (
        <StatusPill tone={l.status === "success" ? "success" : "danger"} label={l.status} />
      ),
    },
    {
      key: "createdAt",
      header: __t("integrations.erp.logsTable.time") || "Time",
      render: (l) => <span className="fs-10 fg-3">{l.createdAt}</span>,
    },
  ];
  return (
    <div className="screen-wrap">
      <ScreenHeader
        title={__t("integrations.erp.title") || "ERP Connectors"}
        description={
          __t("integrations.erp.subtitle") ||
          "Sync data with SAP, NetSuite, Oracle, ClickUp, Zoho Cliq, and other systems"
        }
        actions={
          <Button
            variant="primary"
            disabled={creating}
            loading={creating}
            onClick={() => setShowCreate(!showCreate)}
          >
            <Icon.Plus size={12} />{" "}
            {creating
              ? __t("integrations.erp.creating") || "Creating…"
              : __t("integrations.erp.newConnector") || "New Connector"}
          </Button>
        }
      />
      {showCreate && (
        <Card className="mb-12">
          <div
            className="d-grid gap-8"
            style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr" }}
          >
            <Field
              label={
                __t("integrations.erp.connectorNamePlaceholder") ||
                "Connector name"
              }
              htmlFor="erp-name"
            >
              <Input
                id="erp-name"
                name="connectorName"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label={__t("integrations.erp.table.type") || "Type"} htmlFor="erp-type">
              <Select
                id="erp-type"
                name="connectorType"
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
              </Select>
            </Field>
            <Field
              label={__t("integrations.erp.baseUrlPlaceholder") || "Base URL"}
              htmlFor="erp-base-url"
            >
              <Input
                id="erp-base-url"
                name="baseUrl"
                value={form.baseUrl}
                onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
              />
            </Field>
            <Field
              label={__t("integrations.erp.apiKeyPlaceholder") || "API Key"}
              htmlFor="erp-api-key"
            >
              <Input
                id="erp-api-key"
                name="apiKey"
                type="password"
                value={form.apiKey}
                onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
              />
            </Field>
          </div>
          <div className="flex gap-8 mt-8">
            <Button
              variant="primary"
              disabled={creating}
              loading={creating}
              onClick={createConnector}
            >
              <Icon.Check size={12} /> {__t("common.create") || "Create"}
            </Button>
            <Button onClick={() => setShowCreate(false)}>
              {__t("common.cancel") || "Cancel"}
            </Button>
          </div>
        </Card>
      )}
      <Card bodyClassName="p-0">
        {loading ? (
          SkeletonTable({ rows: 4, cols: 6 })
        ) : (
          <DataTable
            dense
            ariaLabel={__t("integrations.erp.title") || "ERP Connectors"}
            columns={erpColumns}
            rows={connectors}
            getRowKey={(c) => c.id}
            empty={
              <EmptyState
                title={__t("integrations.erp.empty") || "No ERP connectors configured"}
                message={
                  __t("integrations.erp.emptyMsg") ||
                  "Create one to start syncing."
                }
              />
            }
          />
        )}
      </Card>
      {selectedConnector && logs.length > 0 && (
        <Card
          className="mt-12"
          bodyClassName="p-0"
          title={__t("integrations.erp.syncLogs") || "Sync Logs"}
        >
          <DataTable
            dense
            ariaLabel={__t("integrations.erp.syncLogs") || "Sync Logs"}
            columns={erpLogColumns}
            rows={logs}
            getRowKey={(l) => l.id}
          />
        </Card>
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
  const subscriptionColumns = [
    {
      key: "url",
      header: __t("integrations.webhooks.table.url") || "URL",
      render: (s) => (
        <span
          className="mono fs-10 overflow-h"
          style={{ display: "inline-block", maxWidth: 260, textOverflow: "ellipsis" }}
        >
          {s.url}
        </span>
      ),
    },
    {
      key: "events",
      header: __t("integrations.webhooks.table.events") || "Events",
      render: (s) => <span className="fs-10">{s.events}</span>,
    },
    {
      key: "status",
      header: __t("integrations.webhooks.table.status") || "Status",
      render: (s) => (
        <StatusPill
          tone={s.active ? "success" : "danger"}
          label={
            s.active
              ? __t("integrations.webhooks.active") || "Active"
              : __t("integrations.webhooks.inactive") || "Inactive"
          }
        />
      ),
    },
    {
      key: "createdAt",
      header: __t("integrations.webhooks.table.created") || "Created",
      render: (s) => <span className="fs-10 fg-3">{s.createdAt}</span>,
    },
    {
      key: "actions",
      header: __t("integrations.webhooks.table.actions") || "Actions",
      render: (s) => (
        <div className="flex gap-4">
          <Button size="sm" onClick={() => testWebhook(s.id)}>
            <Icon.Send size={10} /> {__t("integrations.webhooks.test") || "Test"}
          </Button>
          <Button size="sm" onClick={() => toggleWebhook(s.id, s.active)}>
            {s.active
              ? __t("integrations.webhooks.pause") || "Pause"
              : __t("integrations.webhooks.activate") || "Activate"}
          </Button>
          <Button
            variant="danger"
            size="sm"
            iconOnly
            aria-label={__t("common.delete") || "Delete"}
            onClick={() => deleteWebhook(s.id)}
          >
            <Icon.Trash size={10} />
          </Button>
        </div>
      ),
    },
  ];
  const deliveryColumns = [
    {
      key: "event",
      header: __t("integrations.webhooks.deliveryTable.event") || "Event",
      render: (d) => <span className="fs-11">{d.event}</span>,
    },
    {
      key: "status",
      header: __t("integrations.webhooks.deliveryTable.status") || "Status",
      render: (d) => (
        <StatusPill
          tone={
            d.status === "delivered"
              ? "success"
              : d.status === "failed"
                ? "danger"
                : "warning"
          }
          label={d.status}
        />
      ),
    },
    {
      key: "statusCode",
      header: __t("integrations.webhooks.deliveryTable.code") || "Code",
      align: "num",
      render: (d) => <span className="mono fs-11">{d.statusCode || "—"}</span>,
    },
    {
      key: "retryCount",
      header: __t("integrations.webhooks.deliveryTable.retries") || "Retries",
      align: "num",
      render: (d) => <span className="mono fs-11">{d.retryCount || 0}</span>,
    },
    {
      key: "createdAt",
      header: __t("integrations.webhooks.deliveryTable.time") || "Time",
      render: (d) => <span className="fs-10 fg-3">{d.createdAt || "—"}</span>,
    },
    {
      key: "retryAction",
      header: "",
      render: (d) =>
        d.status === "failed" ? (
          <Button size="sm" onClick={() => retryDelivery(d.id)}>
            <Icon.Refresh size={10} /> {__t("integrations.webhooks.retry") || "Retry"}
          </Button>
        ) : null,
    },
  ];
  return (
    <div className="screen-wrap">
      <ScreenHeader
        title={__t("integrations.webhooks.title") || "Webhooks"}
        description={
          __t("integrations.webhooks.subtitle") ||
          "Manage outgoing webhook subscriptions for real-time event notifications"
        }
        actions={
          <Button variant="primary" onClick={() => setShowCreate(!showCreate)}>
            <Icon.Plus size={12} />{" "}
            {__t("integrations.webhooks.newWebhook") || "New Webhook"}
          </Button>
        }
      />
      <Tabs
        className="mb-12"
        ariaLabel={__t("integrations.webhooks.title") || "Webhooks"}
        value={activeTab}
        onChange={setActiveTab}
        items={[
          {
            value: "subscriptions",
            label: __t("integrations.webhooks.tabSubscriptions") || "Subscriptions",
            count: subscriptions.length,
          },
          {
            value: "deliveries",
            label: __t("integrations.webhooks.tabDeliveries") || "Delivery Log",
            count: deliveries.length,
          },
        ]}
      />
      {showCreate && (
        <Card className="mb-12">
          <div className="d-grid gap-8 grid-cols-2">
            <Field
              label={__t("integrations.webhooks.urlPlaceholder") || "Webhook URL"}
              htmlFor="webhook-url"
            >
              <Input
                id="webhook-url"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
              />
            </Field>
            <Field
              label={
                __t("integrations.webhooks.eventsLabel") ||
                "Events (e.g. bom.created,part.updated)"
              }
              htmlFor="webhook-events"
            >
              <Input
                id="webhook-events"
                value={newEvents}
                onChange={(e) => setNewEvents(e.target.value)}
              />
            </Field>
          </div>
          <div className="flex gap-8 mt-8">
            <Button
              variant="primary"
              size="sm"
              disabled={creating || !newUrl}
              loading={creating}
              onClick={createWebhook}
            >
              {__t("common.create") || "Create"}
            </Button>
            <Button size="sm" onClick={() => setShowCreate(false)}>
              {__t("common.cancel") || "Cancel"}
            </Button>
          </div>
        </Card>
      )}
      {activeTab === "subscriptions" ? (
        <Card bodyClassName="p-0">
          {loading ? (
            SkeletonTable({ rows: 3, cols: 5 })
          ) : (
            <DataTable
              dense
              ariaLabel={__t("integrations.webhooks.tabSubscriptions") || "Subscriptions"}
              columns={subscriptionColumns}
              rows={subscriptions}
              getRowKey={(s) => s.id}
              empty={
                <EmptyState
                  title={
                    __t("integrations.webhooks.empty") || "No webhooks configured"
                  }
                />
              }
            />
          )}
        </Card>
      ) : (
        <Card bodyClassName="p-0">
          {deliveriesLoading ? (
            SkeletonTable({ rows: 5, cols: 6 })
          ) : (
            <DataTable
              dense
              ariaLabel={__t("integrations.webhooks.tabDeliveries") || "Delivery Log"}
              columns={deliveryColumns}
              rows={deliveries}
              getRowKey={(d) => d.id}
              empty={
                <EmptyState
                  title={__t("integrations.webhooks.noDeliveries") || "No deliveries yet"}
                />
              }
            />
          )}
        </Card>
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
  const jobColumns = [
    {
      key: "filename",
      header: __t("integrations.bulkImport.table.file") || "File",
      render: (j) => <span className="fs-11">{j.filename}</span>,
    },
    {
      key: "totalRows",
      header: __t("integrations.bulkImport.table.rows") || "Rows",
      align: "num",
      render: (j) => <span className="mono fs-11">{j.totalRows}</span>,
    },
    {
      key: "processedRows",
      header: __t("integrations.bulkImport.table.processed") || "Processed",
      align: "num",
      render: (j) => <span className="mono fs-11">{j.processedRows}</span>,
    },
    {
      key: "errorRows",
      header: __t("integrations.bulkImport.table.errors") || "Errors",
      align: "num",
      render: (j) => (
        <span
          className="mono fs-11"
          style={{ color: j.errorRows > 0 ? "var(--danger)" : "inherit" }}
        >
          {j.errorRows}
        </span>
      ),
    },
    {
      key: "status",
      header: __t("integrations.bulkImport.table.status") || "Status",
      render: (j) => (
        <StatusPill
          tone={
            j.errorRows > 0
              ? "warning"
              : j.status === "completed"
                ? "success"
                : "danger"
          }
          label={j.status}
        />
      ),
    },
    {
      key: "createdAt",
      header: __t("integrations.bulkImport.table.date") || "Date",
      render: (j) => <span className="fs-10 fg-3">{j.createdAt}</span>,
    },
  ];
  return (
    <div className="screen-wrap">
      <ScreenHeader
        title={__t("integrations.bulkImport.title") || "Bulk Import"}
        description={
          __t("integrations.bulkImport.subtitle") ||
          "Import parts, BOMs, and vendor data from CSV or Excel files"
        }
      />
      <Card className="mb-12">
        <div className="flex gap-16 items-center">
          <div className="flex-1">
            <div
              role="button"
              tabIndex={0}
              style={{
                border: "2px dashed var(--line)",
                borderRadius: "var(--r-2)",
                padding: 24,
                textAlign: "center",
                cursor: "pointer",
              }}
              onClick={() => document.getElementById("import-file").click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  document.getElementById("import-file").click();
                }
              }}
            >
              <Icon.Upload
                size={24}
                style={{ opacity: 0.3, marginBottom: 8 }}
              />
              <div className="fs-12 fw-500">
                {selectedFile
                  ? selectedFile.name
                  : __t("integrations.bulkImport.selectFile") ||
                    "Click to select CSV or XLSX file"}
              </div>
              <div className="fs-10 fg-3 mt-4">
                {__t("integrations.bulkImport.supports") ||
                  "Supports: Parts, BOMs, Vendors, Purchase Orders"}
              </div>
              <label className="sr-only" htmlFor="import-file">
                {__t("integrations.bulkImport.selectFile") ||
                  "Click to select CSV or XLSX file"}
              </label>
              <input
                id="import-file"
                type="file"
                accept=".csv,.xlsx,.xls"
                style={{ display: "none" }}
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              />
            </div>
          </div>
          <Button
            variant="primary"
            disabled={!selectedFile || uploading}
            loading={uploading}
            onClick={handleUpload}
          >
            <Icon.Import size={12} />{" "}
            {uploading
              ? __t("integrations.bulkImport.uploading") || "Importing..."
              : __t("integrations.bulkImport.uploadAndImport") || "Start Import"}
          </Button>
        </div>
      </Card>
      <Card
        bodyClassName="p-0"
        title={__t("integrations.bulkImport.importHistory") || "Import History"}
      >
        <DataTable
          dense
          ariaLabel={__t("integrations.bulkImport.importHistory") || "Import History"}
          columns={jobColumns}
          rows={jobs}
          getRowKey={(j) => j.id}
          empty={
            <EmptyState
              title={__t("integrations.bulkImport.empty") || "No imports yet"}
            />
          }
        />
      </Card>
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
      <ScreenHeader
        title={__t("integrations.supplierPortal.title") || "Supplier Portal"}
        description={
          __t("integrations.supplierPortal.subtitle") ||
          "Manage vendor access and price update submissions"
        }
        actions={
          <Button
            variant="primary"
            disabled={creatingUser}
            loading={creatingUser}
            onClick={() => setShowCreateUser(!showCreateUser)}
          >
            <Icon.Plus size={12} />{" "}
            {creatingUser
              ? __t("integrations.supplierPortal.creating") || "Creating…"
              : __t("integrations.supplierPortal.addUser") || "Add Supplier User"}
          </Button>
        }
      />
      {showCreateUser && (
        <Card className="mb-12">
          <div className="flex gap-8" style={{ flexWrap: "wrap" }}>
            <Field
              label={__t("integrations.supplierPortal.emailPlaceholder") || "Email"}
              htmlFor="sp-user-email"
            >
              <Input
                id="sp-user-email"
                name="userEmail"
                type="email"
                value={newUser.email}
                onChange={(e) =>
                  setNewUser({ ...newUser, email: e.target.value })
                }
              />
            </Field>
            <Field
              label={__t("integrations.supplierPortal.namePlaceholder") || "Name"}
              htmlFor="sp-user-name"
            >
              <Input
                id="sp-user-name"
                name="userName"
                value={newUser.name}
                onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
              />
            </Field>
            <Field
              label={
                __t("integrations.supplierPortal.vendorIdPlaceholder") ||
                "Vendor ID (number)"
              }
              htmlFor="sp-user-vendor"
            >
              <Input
                id="sp-user-vendor"
                name="vendorId"
                type="number"
                value={newUser.vendorId}
                onChange={(e) =>
                  setNewUser({ ...newUser, vendorId: e.target.value })
                }
              />
            </Field>
            <Field
              label={
                __t("integrations.supplierPortal.passwordPlaceholder") || "Password"
              }
              htmlFor="sp-user-pass"
            >
              <Input
                id="sp-user-pass"
                name="password"
                type="password"
                value={newUser.password}
                onChange={(e) =>
                  setNewUser({ ...newUser, password: e.target.value })
                }
              />
            </Field>
            <Button
              variant="primary"
              disabled={creatingUser || !newUser.email || !newUser.name}
              loading={creatingUser}
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
              <Icon.Check size={12} /> {__t("common.create") || "Create"}
            </Button>
          </div>
        </Card>
      )}
      <div className="d-grid gap-12" style={{ gridTemplateColumns: "1fr 2fr" }}>
        <Card
          bodyClassName="p-0"
          title={
            __t("integrations.supplierPortal.supplierUsers", {
              count: users.length,
            }) || "Supplier Users (" + users.length + ")"
          }
        >
          {loading ? (
            SkeletonCards({ count: 3 })
          ) : users.length === 0 ? (
            <EmptyState
              title={
                __t("integrations.supplierPortal.noUsers") ||
                "No supplier users yet"
              }
            />
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
                  <StatusPill
                    tone={u.active ? "success" : "danger"}
                    label={
                      u.active
                        ? __t("integrations.supplierPortal.active") || "Active"
                        : __t("integrations.supplierPortal.inactive") || "Inactive"
                    }
                  />
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card
          bodyClassName="p-0"
          title={
            __t("integrations.supplierPortal.priceUpdates", {
              count: priceUpdates.length,
            }) || "Price Update Submissions (" + priceUpdates.length + ")"
          }
        >
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
                      <StatusPill
                        tone={
                          p.status === "approved"
                            ? "success"
                            : p.status === "rejected"
                              ? "danger"
                              : "warning"
                        }
                        label={p.status}
                      />
                    </td>
                    <td className="fs-10 fg-3">{p.createdAt || "\u2014"}</td>
                    <td>
                      {p.status === "pending" && (
                        <div className="flex gap-4">
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={actionIds.has("approve-" + p.id)}
                            loading={actionIds.has("approve-" + p.id)}
                            onClick={() => approve(p.id)}
                          >
                            <Icon.Check size={10} />{" "}
                            {__t("common.approve") || "Approve"}
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={actionIds.has("reject-" + p.id)}
                            loading={actionIds.has("reject-" + p.id)}
                            onClick={() => reject(p.id)}
                          >
                            <Icon.X size={10} />{" "}
                            {__t("common.reject") || "Reject"}
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>
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
      <ScreenHeader
        title={__t("integrations.ai.title") || "AI & Automation"}
        description={
          __t("integrations.ai.subtitle") ||
          "Demand forecasting, part interchangeability, poka-yoke validation, and approval automation"
        }
      />
      <Tabs
        className="mb-12"
        ariaLabel={__t("integrations.ai.title") || "AI & Automation"}
        value={tab}
        onChange={setTab}
        items={[
          { value: "forecast", label: __t("integrations.ai.tabForecast") || "Demand Forecast" },
          { value: "interchange", label: __t("integrations.ai.tabInterchange") || "Interchangeability" },
          { value: "validation", label: __t("integrations.ai.tabValidation") || "Validation Rules" },
          { value: "automation", label: __t("integrations.ai.tabAutomation") || "Approval Automation" },
        ]}
      />
      {tab === "forecast" && (
        <Card>
          <div className="flex justify-between items-center px-16 py-10">
            <span className="fw-600 fs-11 uppercase letter-sp-6 fg-3">
              {__t("integrations.ai.forecastSection") || "Demand Forecasts"}
            </span>
            <Button variant="primary" onClick={generateForecast} disabled={loading} loading={loading}>
              <Icon.Sparkles size={12} />{" "}
              {__t("integrations.ai.generateForecast") ||
                "Generate from PO History"}
            </Button>
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
                      <StatusPill
                        tone={
                          f.confidence >= 0.8
                            ? "success"
                            : f.confidence >= 0.5
                              ? "warning"
                              : "danger"
                        }
                        label={Math.round((f.confidence || 0) * 100) + "%"}
                      />
                    </td>
                    <td className="fs-10 fg-3">{f.model || "po-history"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}
      {tab === "interchange" && (
        <Card>
          <div className="flex justify-between items-center px-16 py-10">
            <span className="fw-600 fs-11 uppercase letter-sp-6 fg-3">
              {__t("integrations.ai.interchangeSection") ||
                "Interchangeability Suggestions"}
            </span>
            <Button variant="primary" onClick={analyzeInterchangeability} disabled={loading} loading={loading}>
              <Icon.Sparkles size={12} />{" "}
              {__t("integrations.ai.analyzeParts") || "Analyze Parts"}
            </Button>
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
                      <StatusPill
                        tone={s.status === "approved" ? "success" : "warning"}
                        label={s.status || "pending"}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}
      {tab === "validation" && (
        <Card>
          <div className="flex justify-between items-center px-16 py-10">
            <span className="fw-600 fs-11 uppercase letter-sp-6 fg-3">
              {__t("integrations.ai.validationSection") ||
                "Poka-yoke Validation Results"}
            </span>
            <Button variant="primary" onClick={runValidation} disabled={loading} loading={loading}>
              <Icon.Sparkles size={12} />{" "}
              {__t("integrations.ai.runValidation") || "Run Validation"}
            </Button>
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
                      <StatusPill
                        tone={v.passed ? "success" : "danger"}
                        label={
                          v.passed
                            ? __t("integrations.ai.pass") || "PASS"
                            : __t("integrations.ai.fail") || "FAIL"
                        }
                      />
                    </td>
                    <td className="fs-10 fg-3">{v.message}</td>
                    <td>
                      <Badge
                        tone={
                          v.severity === "critical"
                            ? "danger"
                            : v.severity === "warning"
                              ? "warning"
                              : "neutral"
                        }
                      >
                        {v.severity}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}
      {tab === "automation" && (
        <Card title={__t("integrations.ai.automationSection") || "Approval Automation Rules"}>
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
                  <StatusPill
                    tone={r.active ? "success" : "danger"}
                    label={
                      r.active
                        ? __t("integrations.ai.active") || "Active"
                        : __t("integrations.ai.disabled") || "Disabled"
                    }
                  />
                </div>
              ))}
            </div>
          )}
        </Card>
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
      <ScreenHeader
        title={__t("integrations.monitoring.title") || "System Monitoring"}
        description={
          __t("integrations.monitoring.subtitle") ||
          "Application health, metrics, and performance"
        }
        actions={
          <Button
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
          </Button>
        }
      />
      {health && (
        <div
          className="kpi-grid mb-12"
          style={{ gridTemplateColumns: "repeat(4, 1fr)" }}
        >
          <div className="kpi">
            <div className="l">
              {__t("integrations.monitoring.apiStatus") || "API Status"}
            </div>
            <div className="v">
              <StatusPill
                tone={health.status === "healthy" ? "success" : "danger"}
                label={health.status}
              />
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
            <div className="v">
              <StatusPill
                tone={health.database?.status === "connected" ? "success" : "danger"}
                label={health.database?.status || "\u2014"}
              />
            </div>
          </div>
        </div>
      )}
      {metrics && (
        <Card
          bodyClassName="p-0"
          title={__t("integrations.monitoring.metrics") || "Prometheus Metrics"}
        >
          <pre
            className="fs-10 font-mono overflow-x-a bg-sunk rounded-r2"
            style={{ padding: 16, maxHeight: 400, margin: "0 16px 16px" }}
          >
            {metrics}
          </pre>
        </Card>
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
        <ScreenHeader
          title={
            <span className="flex items-center gap-12">
              <Button
                size="sm"
                onClick={() => {
                  setSelectedTracking(null);
                  setDetailData(null);
                }}
              >
                <Icon.ChevronLeft size={14} /> {__t("common.back") || "Back"}
              </Button>
              {detailData.po?.poNumber ||
                __t("orderTracking.title") ||
                "Order Tracking"}
            </span>
          }
          description={
            <span>
              {detailData.po?.vendorName} \u00B7{" "}
              {detailData.po?.project || ""}
            </span>
          }
          actions={
            detailData.currentStage !== "completed" &&
            detailData.currentStage !== "delivered" && (
              <Button variant="primary" onClick={() => advanceStage(detailData.id)}>
                <Icon.ChevronRight size={12} />{" "}
                {__t("orderTracking.advanceStage") || "Advance Stage"}
              </Button>
            )
          }
        />
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
          <Card
            bodyClassName="p-0"
            title={
              (__t("orderTracking.shipmentUpdates") || "Shipment Updates") +
              " (" +
              (detailData.shipmentUpdates || []).length +
              ")"
            }
          >
            {(detailData.shipmentUpdates || []).length === 0 ? (
              <EmptyState
                title={
                  __t("orderTracking.noShipmentUpdates") ||
                  "No shipment updates yet"
                }
              />
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
                        background: i === 0 ? "var(--accent)" : "var(--line)",
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
          </Card>
          {/* Order Details Sidebar */}
          <div>
            <Card
              className="mb-12"
              title={__t("orderTracking.orderDetails") || "Order Details"}
            >
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
            </Card>
          </div>
        </div>
      </div>
    );
  }
  // List view
  return (
    <div className="screen-wrap">
      <ScreenHeader
        title={__t("orderTracking.title") || "Order Tracking"}
        description={
          loading
            ? __t("common.loading") || "Loading..."
            : __t("orderTracking.ordersCount", {
                count: filtered.length,
                overdue: stats?.overdue || 0,
              }) ||
              `${filtered.length} orders being tracked \u00B7 ${stats?.overdue || 0} overdue`
        }
        actions={
          <div className="flex gap-8">
            <div className="search w-220 h-32">
              <Icon.Search size={12} />
              <input
                id="ordertrack-search"
                name="orderSearch"
                aria-label={
                  __t("orderTracking.searchPlaceholder") ||
                  "Search by PO, vendor, tracking..."
                }
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  __t("orderTracking.searchPlaceholder") ||
                  "Search by PO, vendor, tracking..."
                }
              />
            </div>
            <Select
              id="ordertrack-stage"
              name="stageFilter"
              aria-label={__t("orderTracking.allStages") || "All Stages"}
              className="w-160 h-32 fs-11"
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
            </Select>
          </div>
        }
      />
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
              role="button"
              tabIndex={0}
              aria-label={STAGE_LABELS[stage]}
              className="kpi c-pointer"
              style={{ borderLeft: "3px solid " + STAGE_COLORS[stage] }}
              onClick={() => setStageFilter(stage)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setStageFilter(stage);
                }
              }}
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
          <div style={{ gridColumn: "1/-1" }}>
            <EmptyState
              title={__t("orderTracking.noMatch") || "No orders match your filters"}
            />
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
                role="button"
                tabIndex={0}
                aria-label={t.po?.poNumber || "PO-" + t.poHeaderId}
                onClick={() => loadDetail(t.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    loadDetail(t.id);
                  }
                }}
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
