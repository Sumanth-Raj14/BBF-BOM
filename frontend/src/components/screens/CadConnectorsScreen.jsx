import React from "react";

import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import { api } from "../../../api.js";
import {
  ScreenHeader,
  Card,
  Field,
  Input,
  Textarea,
  Select,
  Button,
  Badge,
  StatusPill,
  DataTable,
  EmptyState,
  Modal,
  Spinner,
} from "../ui";

// ============ CAD CONNECTORS ============
//
// The framework, Onshape/Fusion/Altium connectors and every route in
// app/api/endpoints/cad_connectors.py have existed with no UI surface at
// all — the exact "built but unreachable" pattern. This screen is that
// surface: list connector types, add a connection (credential fields per
// type, read from each connector's own docstring — see FIELD_DEFS below),
// test it and show the HONEST result, browse documents, import an assembly
// into a BOM, and — separately — the credential-free Altium file upload
// with its dry-run preview shown before committing.
//
// Credentials are secrets: the create response never contains them (backend
// `_public()` omits `credentials` entirely), and this screen never stores or
// re-displays what the user typed after a successful save — the form is
// simply closed. Connection status is rendered exactly as the backend
// reports it (`unconfigured` | `ok` | `error`, plus `last_error`) — never
// upgraded to "connected" just because a row exists.

// Credential/config keys per connector type, taken from each connector's own
// docstring (app/integrations/cad/onshape.py, adapters.py's
// FusionCadConnector/AltiumCadConnector). A connector type registered later
// that isn't in this map still works — it falls back to raw JSON fields
// below rather than blocking connection creation.
const FIELD_DEFS = {
  onshape: {
    credentials: [
      { key: "access_key", label: "Access key", required: true, secret: true },
      { key: "secret_key", label: "Secret key", required: true, secret: true },
    ],
    config: [
      {
        key: "base_url",
        label: "Base URL override (optional)",
        required: false,
        placeholder: "https://cad.onshape.com/api/v10",
      },
    ],
  },
  fusion: {
    credentials: [
      { key: "client_id", label: "APS client ID", required: true, secret: true },
      { key: "client_secret", label: "APS client secret", required: true, secret: true },
      {
        key: "refresh_token",
        label: "Refresh token (from the APS OAuth consent flow)",
        required: true,
        secret: true,
      },
    ],
    config: [
      { key: "hub_id", label: "Hub ID", required: true },
      { key: "project_id", label: "Project ID", required: true },
      { key: "folder_id", label: "Folder ID (optional)", required: false },
    ],
  },
  altium: {
    credentials: [
      {
        key: "workspace_domain",
        label: "Workspace domain",
        required: true,
        secret: false,
        placeholder: "acme.365.altium.com",
      },
      { key: "access_token", label: "Access token (optional)", required: false, secret: true },
      { key: "refresh_token", label: "Refresh token (optional)", required: false, secret: true },
      { key: "client_id", label: "Client ID (optional, for refresh)", required: false, secret: true },
      {
        key: "client_secret",
        label: "Client secret (optional, for refresh)",
        required: false,
        secret: true,
      },
    ],
    config: [],
  },
};

function statusTone(status) {
  if (status === "ok") return "success";
  if (status === "error") return "danger";
  return "neutral";
}

function statusLabel(status) {
  if (status === "ok") return "Connected";
  if (status === "error") return "Connection error";
  return "Not tested yet";
}

function fmtWhen(v) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString();
}

const emptyForm = { name: "", connector_type: "", credentials: {}, config: {} };

export default function CadConnectorsScreen() {
  const [types, setTypes] = React.useState([]);
  const [connections, setConnections] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  const [showAdd, setShowAdd] = React.useState(false);
  const [form, setForm] = React.useState(emptyForm);
  const [rawCredsJSON, setRawCredsJSON] = React.useState("{}");
  const [rawConfigJSON, setRawConfigJSON] = React.useState("{}");
  const [creating, setCreating] = React.useState(false);
  const [createError, setCreateError] = React.useState(null);

  const [testingId, setTestingId] = React.useState(null);
  const [deletingId, setDeletingId] = React.useState(null);

  const [selected, setSelected] = React.useState(null);
  const [documents, setDocuments] = React.useState([]);
  const [docsLoading, setDocsLoading] = React.useState(false);
  const [docsError, setDocsError] = React.useState(null);

  const [importDoc, setImportDoc] = React.useState(null);
  const [importMode, setImportMode] = React.useState("new");
  const [importBomName, setImportBomName] = React.useState("");
  const [importBomId, setImportBomId] = React.useState("");
  const [importing, setImporting] = React.useState(false);
  const [importError, setImportError] = React.useState(null);
  const [importResult, setImportResult] = React.useState(null);

  const [altiumFile, setAltiumFile] = React.useState(null);
  const [altiumBomName, setAltiumBomName] = React.useState("");
  const [altiumBusy, setAltiumBusy] = React.useState(false);
  const [altiumError, setAltiumError] = React.useState(null);
  const [altiumPreview, setAltiumPreview] = React.useState(null);
  const [altiumResult, setAltiumResult] = React.useState(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [typesRes, connsRes] = await Promise.all([
        api.cadConnectors.types(),
        api.cadConnectors.list(),
      ]);
      setTypes(Array.isArray(typesRes?.types) ? typesRes.types : []);
      setConnections(Array.isArray(connsRes?.items) ? connsRes.items : []);
    } catch (e) {
      // Honest failure — do not fall back to fabricated/sample rows.
      setError(e?.message || "Failed to load CAD connectors.");
      setConnections([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const fieldDef = FIELD_DEFS[form.connector_type];

  const openAdd = () => {
    setForm({ ...emptyForm, connector_type: types[0] || "" });
    setRawCredsJSON("{}");
    setRawConfigJSON("{}");
    setCreateError(null);
    setShowAdd(true);
  };

  const setConnectorType = (connector_type) => {
    setForm({ name: form.name, connector_type, credentials: {}, config: {} });
    setRawCredsJSON("{}");
    setRawConfigJSON("{}");
  };

  const setCred = (key, value) =>
    setForm((prev) => ({ ...prev, credentials: { ...prev.credentials, [key]: value } }));
  const setConf = (key, value) =>
    setForm((prev) => ({ ...prev, config: { ...prev.config, [key]: value } }));

  const canCreate =
    form.name.trim() &&
    form.connector_type &&
    (!fieldDef ||
      fieldDef.credentials
        .filter((f) => f.required)
        .every((f) => (form.credentials[f.key] || "").trim()));

  const create = async () => {
    setCreating(true);
    setCreateError(null);
    try {
      let credentials = form.credentials;
      let config = form.config;
      if (!fieldDef) {
        try {
          credentials = JSON.parse(rawCredsJSON || "{}");
        } catch {
          throw new Error("Credentials must be valid JSON.");
        }
        try {
          config = JSON.parse(rawConfigJSON || "{}");
        } catch {
          throw new Error("Config must be valid JSON.");
        }
      } else {
        credentials = Object.fromEntries(
          Object.entries(form.credentials).filter(([, v]) => v != null && v !== ""),
        );
        config = Object.fromEntries(
          Object.entries(form.config).filter(([, v]) => v != null && v !== ""),
        );
      }
      const payload = {
        name: form.name.trim(),
        connector_type: form.connector_type,
        credentials,
        config,
      };
      await api.cadConnectors.create(payload);
      toast(`Connection "${payload.name}" created — credentials stored encrypted.`, {
        kind: "success",
      });
      setShowAdd(false);
      await load();
    } catch (e) {
      setCreateError(e?.message || "Could not create the connection.");
    } finally {
      setCreating(false);
    }
  };

  const runTest = async (conn) => {
    setTestingId(conn.id);
    try {
      const result = await api.cadConnectors.test(conn.id);
      toast(
        result.ok
          ? `${conn.name}: connection OK`
          : `${conn.name}: ${result.reason} — ${result.detail}`,
        { kind: result.ok ? "success" : "error" },
      );
    } catch (e) {
      toast(`${conn.name}: ${e?.message || "test failed"}`, { kind: "error" });
    } finally {
      setTestingId(null);
      await load();
    }
  };

  const removeConnection = async (conn) => {
    setDeletingId(conn.id);
    try {
      await api.cadConnectors.delete(conn.id);
      toast("Connection deleted", { kind: "success" });
      if (selected?.id === conn.id) {
        setSelected(null);
        setDocuments([]);
      }
      await load();
    } catch (e) {
      toast(`Could not delete: ${e?.message || String(e)}`, { kind: "error" });
    } finally {
      setDeletingId(null);
    }
  };

  const openConnection = async (conn) => {
    setSelected(conn);
    setDocuments([]);
    setDocsError(null);
    setDocsLoading(true);
    try {
      const result = await api.cadConnectors.documents(conn.id);
      setDocuments(Array.isArray(result?.items) ? result.items : []);
    } catch (e) {
      // Honest failure — a bad/missing credential surfaces here, never a
      // silent empty list that reads as "no documents exist".
      setDocsError(e?.message || "Could not load documents for this connection.");
    } finally {
      setDocsLoading(false);
    }
  };

  const openImport = (doc) => {
    setImportDoc(doc);
    setImportMode("new");
    setImportBomName(doc.name || "");
    setImportBomId("");
    setImportError(null);
    setImportResult(null);
  };

  const runImport = async () => {
    if (!selected || !importDoc) return;
    setImporting(true);
    setImportError(null);
    try {
      const payload = { document_id: importDoc.id };
      if (importMode === "existing" && importBomId) {
        payload.bom_id = Number(importBomId);
      } else if (importBomName.trim()) {
        payload.bom_name = importBomName.trim();
      }
      const result = await api.cadConnectors.importAssembly(selected.id, payload);
      setImportResult(result);
      toast(
        `Imported ${result.items_created} item(s), ${result.parts_created} new part(s) into BOM #${result.bom_id}`,
        { kind: "success" },
      );
    } catch (e) {
      setImportError(e?.message || "Import failed.");
    } finally {
      setImporting(false);
    }
  };

  const runAltium = async (dryRun) => {
    if (!altiumFile) return;
    setAltiumBusy(true);
    setAltiumError(null);
    try {
      const result = await api.cadConnectors.importAltiumFile(altiumFile, {
        bomName: altiumBomName.trim() || undefined,
        dryRun,
      });
      if (dryRun) {
        setAltiumPreview(result);
        setAltiumResult(null);
      } else {
        setAltiumResult(result);
        setAltiumPreview(null);
        toast(
          `Imported ${result.items_created} item(s), ${result.parts_created} new part(s) into "${result.bom_name}"`,
          { kind: "success" },
        );
      }
    } catch (e) {
      // Honest: an unparsable file is a 400 with the parse reason, never a
      // partial/fake preview or import.
      setAltiumError(e?.message || "Could not parse this file.");
    } finally {
      setAltiumBusy(false);
    }
  };

  const columns = [
    {
      key: "name",
      header: __t("cadConnectors.colName") || "Name",
      render: (r) => <span className="fs-12 fw-600">{r.name}</span>,
    },
    {
      key: "connector_type",
      header: __t("cadConnectors.colType") || "Type",
      render: (r) => <Badge tone="neutral">{r.connector_type}</Badge>,
    },
    {
      key: "status",
      header: __t("cadConnectors.colStatus") || "Status",
      render: (r) => (
        <div>
          <StatusPill status={statusLabel(r.status)} tone={statusTone(r.status)} />
          {r.status === "error" && r.last_error && (
            <div className="fs-11 fg-3 mt-2">{r.last_error}</div>
          )}
        </div>
      ),
    },
    {
      key: "last_sync_at",
      header: __t("cadConnectors.colLastSync") || "Last sync",
      render: (r) => <span className="fs-11">{fmtWhen(r.last_sync_at)}</span>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) => (
        <div className="flex gap-6 justify-end" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="sm" loading={testingId === r.id} onClick={() => runTest(r)}>
            {__t("cadConnectors.test") || "Test"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={deletingId === r.id}
            onClick={() => removeConnection(r)}
          >
            {__t("common.delete") || "Delete"}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="screen-wrap">
      <ScreenHeader
        title={__t("cadConnectors.title") || "CAD Connectors"}
        description={
          __t("cadConnectors.subtitle") ||
          "Connect Onshape, Fusion 360 or Altium 365, or import an Altium BOM file directly — credentials are stored encrypted and never shown again after saving."
        }
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={load}>
              {__t("common.refresh") || "Refresh"}
            </Button>
            <Button variant="primary" size="sm" onClick={openAdd}>
              {__t("cadConnectors.new") || "Add connection"}
            </Button>
          </>
        }
      />

      {error && (
        <div
          role="alert"
          className="mb-14 fs-12"
          style={{
            padding: "8px 12px",
            borderRadius: "var(--r-2, 6px)",
            background: "color-mix(in oklch, var(--status-danger, red) 10%, transparent)",
          }}
        >
          {error}
        </div>
      )}

      <DataTable
        dense
        zebra
        ariaLabel={__t("cadConnectors.title") || "CAD Connectors"}
        columns={columns}
        rows={connections}
        getRowKey={(r) => r.id}
        onRowClick={openConnection}
        empty={
          loading ? (
            <div className="flex items-center gap-8 fg-3 fs-12" style={{ padding: "32px 0" }}>
              <Spinner size="sm" label={__t("common.loading") || "Loading…"} />
              <span aria-hidden="true">{__t("common.loading") || "Loading…"}</span>
            </div>
          ) : (
            <EmptyState
              title={__t("cadConnectors.empty") || "No CAD connections yet"}
              message={
                __t("cadConnectors.emptyMsg") ||
                "Add a connection to Onshape, Fusion 360 or Altium 365 — or use the Altium file import below, which needs no credentials at all."
              }
            />
          )
        }
      />

      {selected && (
        <Card
          className="mt-14"
          title={selected.name}
          subtitle={selected.connector_type}
          actions={
            <>
              <StatusPill status={statusLabel(selected.status)} tone={statusTone(selected.status)} />
              <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
                {__t("common.close") || "Close"}
              </Button>
            </>
          }
        >
          {selected.status === "unconfigured" && (
            <p className="fs-12 fg-3 mb-14">
              {__t("cadConnectors.untested") ||
                "This connection hasn't been tested yet — run Test to verify the credentials before importing anything."}
            </p>
          )}
          {selected.status === "error" && (
            <p className="fs-12 mb-14" style={{ color: "var(--status-danger, red)" }}>
              {selected.last_error ||
                (__t("cadConnectors.lastTestFailed") || "The last connectivity test failed.")}
            </p>
          )}

          <h4 className="fs-12 fw-600 mb-8">{__t("cadConnectors.documents") || "Documents"}</h4>
          {docsError && (
            <div
              role="alert"
              className="mb-14 fs-12"
              style={{
                padding: "8px 12px",
                borderRadius: "var(--r-2, 6px)",
                background: "color-mix(in oklch, var(--status-danger, red) 10%, transparent)",
              }}
            >
              {docsError}
            </div>
          )}
          {docsLoading ? (
            <div className="flex items-center gap-8 fg-3 fs-12" style={{ padding: "16px 0" }}>
              <Spinner size="sm" label={__t("common.loading") || "Loading…"} />
              <span aria-hidden="true">{__t("common.loading") || "Loading…"}</span>
            </div>
          ) : documents.length === 0 && !docsError ? (
            <p className="fs-12 fg-3">
              {__t("cadConnectors.noDocuments") || "No documents found for this connection."}
            </p>
          ) : (
            <ul className="cad__doclist">
              {documents.map((d) => (
                <li key={d.id}>
                  <span className="fs-12">{d.name || d.id}</span>
                  <Button variant="secondary" size="sm" onClick={() => openImport(d)}>
                    {__t("cadConnectors.import") || "Import into a BOM"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <Card
        className="mt-14"
        title={__t("cadConnectors.altiumTitle") || "Altium BOM file import"}
        subtitle={
          __t("cadConnectors.altiumSubtitle") ||
          "No credentials needed — upload a .csv/.xlsx Altium BOM export and preview it before committing."
        }
      >
        <div className="d-grid gap-10 mb-10" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
          <Field label={__t("cadConnectors.altiumFile") || "BOM file (.csv or .xlsx)"} htmlFor="altium-file">
            <input
              id="altium-file"
              type="file"
              accept=".csv,.xlsx"
              onChange={(e) => {
                setAltiumFile(e.target.files?.[0] || null);
                setAltiumPreview(null);
                setAltiumResult(null);
                setAltiumError(null);
              }}
            />
          </Field>
          <Field label={__t("cadConnectors.altiumBomName") || "BOM name (optional)"} htmlFor="altium-bom-name">
            <Input
              id="altium-bom-name"
              value={altiumBomName}
              onChange={(e) => setAltiumBomName(e.target.value)}
              placeholder={altiumFile?.name || "Altium BOM"}
            />
          </Field>
        </div>

        <div className="flex gap-8 mb-10">
          <Button
            variant="secondary"
            size="sm"
            disabled={!altiumFile || altiumBusy}
            loading={altiumBusy}
            onClick={() => runAltium(true)}
          >
            {__t("cadConnectors.altiumPreview") || "Preview (dry run)"}
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!altiumFile || altiumBusy}
            onClick={() => runAltium(false)}
          >
            {__t("cadConnectors.altiumImport") || "Import"}
          </Button>
        </div>

        {altiumError && (
          <div
            role="alert"
            className="mb-10 fs-12"
            style={{
              padding: "8px 12px",
              borderRadius: "var(--r-2, 6px)",
              background: "color-mix(in oklch, var(--status-danger, red) 10%, transparent)",
            }}
          >
            {altiumError}
          </div>
        )}

        {altiumPreview && (
          <div className="fs-12">
            <p className="fg-2 mb-8">
              {(__t("cadConnectors.altiumPreviewSummary") ||
                "Dry run: {items} component(s), {parts} new part(s), targeting BOM \"{bom}\"")
                .replace("{items}", altiumPreview.items_to_create)
                .replace("{parts}", altiumPreview.parts_to_create)
                .replace("{bom}", altiumPreview.bom_name)}
            </p>
            <ul className="cad__doclist">
              {(altiumPreview.components || []).map((c, i) => (
                <li key={c.external_id || i}>
                  <span className="fs-12">
                    {c.name || c.part_number || "Unnamed part"} × {c.quantity}
                    {c.designators?.length ? ` (${c.designators.join(", ")})` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {altiumResult && (
          <p className="fs-12" style={{ color: "var(--status-success, green)" }}>
            {(__t("cadConnectors.altiumResultSummary") ||
              "Committed: {items} item(s), {parts} new part(s) into BOM #{id}")
              .replace("{items}", altiumResult.items_created)
              .replace("{parts}", altiumResult.parts_created)
              .replace("{id}", altiumResult.bom_id)}
          </p>
        )}
      </Card>

      <Modal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        title={__t("cadConnectors.new") || "Add CAD connection"}
        subtitle={
          __t("cadConnectors.newSubtitle") ||
          "Credentials are encrypted at rest and never shown again once saved."
        }
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowAdd(false)}>
              {__t("common.cancel") || "Cancel"}
            </Button>
            <Button variant="primary" loading={creating} disabled={!canCreate} onClick={create}>
              {__t("common.create") || "Create"}
            </Button>
          </>
        }
      >
        {createError && (
          <div role="alert" className="mb-14 fs-12" style={{ color: "var(--status-danger, red)" }}>
            {createError}
          </div>
        )}

        <div className="d-grid gap-10 mb-10" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
          <Field label={__t("cadConnectors.colName") || "Name"} htmlFor="cad-new-name" required>
            <Input
              id="cad-new-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Main Onshape account"
            />
          </Field>
          <Field label={__t("cadConnectors.colType") || "Connector type"} htmlFor="cad-new-type" required>
            <Select
              id="cad-new-type"
              value={form.connector_type}
              onChange={(e) => setConnectorType(e.target.value)}
            >
              {types.length === 0 && <option value="">—</option>}
              {types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {fieldDef ? (
          <>
            <h4 className="fs-12 fw-600 mt-10 mb-8">
              {__t("cadConnectors.credentials") || "Credentials"}
            </h4>
            {fieldDef.credentials.map((f) => (
              <Field key={f.key} label={f.label} htmlFor={`cad-cred-${f.key}`} required={f.required}>
                <Input
                  id={`cad-cred-${f.key}`}
                  type={f.secret ? "password" : "text"}
                  autoComplete="off"
                  value={form.credentials[f.key] || ""}
                  onChange={(e) => setCred(f.key, e.target.value)}
                  placeholder={f.placeholder}
                />
              </Field>
            ))}
            {fieldDef.config.length > 0 && (
              <>
                <h4 className="fs-12 fw-600 mt-10 mb-8">{__t("cadConnectors.config") || "Config"}</h4>
                {fieldDef.config.map((f) => (
                  <Field key={f.key} label={f.label} htmlFor={`cad-conf-${f.key}`} required={f.required}>
                    <Input
                      id={`cad-conf-${f.key}`}
                      value={form.config[f.key] || ""}
                      onChange={(e) => setConf(f.key, e.target.value)}
                      placeholder={f.placeholder}
                    />
                  </Field>
                ))}
              </>
            )}
          </>
        ) : (
          form.connector_type && (
            <>
              <Field
                label={__t("cadConnectors.credentialsJson") || "Credentials (JSON)"}
                htmlFor="cad-creds-json"
                hint={
                  __t("cadConnectors.credentialsJsonHint") ||
                  "This connector type has no known field list yet — enter its credential keys as JSON."
                }
              >
                <Textarea
                  id="cad-creds-json"
                  rows={4}
                  value={rawCredsJSON}
                  onChange={(e) => setRawCredsJSON(e.target.value)}
                />
              </Field>
              <Field label={__t("cadConnectors.configJson") || "Config (JSON, optional)"} htmlFor="cad-config-json">
                <Textarea
                  id="cad-config-json"
                  rows={2}
                  value={rawConfigJSON}
                  onChange={(e) => setRawConfigJSON(e.target.value)}
                />
              </Field>
            </>
          )
        )}
      </Modal>

      <Modal
        open={Boolean(importDoc)}
        onClose={() => setImportDoc(null)}
        title={__t("cadConnectors.importTitle") || "Import into a BOM"}
        subtitle={importDoc?.name}
        footer={
          <>
            <Button variant="secondary" onClick={() => setImportDoc(null)}>
              {__t("common.close") || "Close"}
            </Button>
            <Button variant="primary" loading={importing} onClick={runImport}>
              {__t("cadConnectors.import") || "Import"}
            </Button>
          </>
        }
      >
        {importError && (
          <div role="alert" className="mb-14 fs-12" style={{ color: "var(--status-danger, red)" }}>
            {importError}
          </div>
        )}
        {importResult ? (
          <p className="fs-12" style={{ color: "var(--status-success, green)" }}>
            {(__t("cadConnectors.importResultSummary") ||
              "Created {items} item(s) and {parts} new part(s) in BOM #{id}.")
              .replace("{items}", importResult.items_created)
              .replace("{parts}", importResult.parts_created)
              .replace("{id}", importResult.bom_id)}
          </p>
        ) : (
          <>
            <Field label={__t("cadConnectors.importTarget") || "Target"} htmlFor="cad-import-mode">
              <Select
                id="cad-import-mode"
                value={importMode}
                onChange={(e) => setImportMode(e.target.value)}
              >
                <option value="new">{__t("cadConnectors.newBom") || "Create a new BOM"}</option>
                <option value="existing">{__t("cadConnectors.existingBom") || "Add to an existing BOM"}</option>
              </Select>
            </Field>
            {importMode === "existing" ? (
              <Field label={__t("cadConnectors.bomId") || "BOM ID"} htmlFor="cad-import-bomid">
                <Input
                  id="cad-import-bomid"
                  type="number"
                  value={importBomId}
                  onChange={(e) => setImportBomId(e.target.value)}
                />
              </Field>
            ) : (
              <Field label={__t("cadConnectors.bomName") || "BOM name"} htmlFor="cad-import-bomname">
                <Input
                  id="cad-import-bomname"
                  value={importBomName}
                  onChange={(e) => setImportBomName(e.target.value)}
                />
              </Field>
            )}
          </>
        )}
      </Modal>

      <style>{`
        .cad__doclist {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .cad__doclist li {
          display: flex;
          align-items: center;
          gap: 10px;
          justify-content: space-between;
        }
      `}</style>
    </div>
  );
}

CadConnectorsScreen.displayName = "CadConnectorsScreen";
// Self-register on window so LazyScreens can resolve it after dynamic import.
window.CadConnectorsScreen = CadConnectorsScreen;
