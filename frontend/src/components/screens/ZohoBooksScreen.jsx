import React from "react";

import { toast } from "../../utils/toast";
import { apiRequest } from "../../../api.js";
import {
  ScreenHeader,
  Card,
  Button,
  StatusPill,
  DataTable,
  EmptyState,
} from "../ui";

// The three entity types the connector syncs. Labels use ↔ for two-way
// entities and → for the push-only PO, so the direction of authority is
// legible before a single button is pressed (spec §4.5).
const ENTITIES = [
  { type: "part", label: "Parts ↔ Items" },
  { type: "vendor", label: "Vendors ↔ Contacts" },
  { type: "purchase_order", label: "Purchase orders → Zoho" },
];

function entityLabel(type) {
  const e = ENTITIES.find((x) => x.type === type);
  return e ? e.label : type;
}

// Poll cursor run status → StatusPill tone. "ok"/"partial"/"error" aren't in
// the shared domain-status map, so the tone is set explicitly.
function runTone(s) {
  if (s === "ok") return "success";
  if (s === "partial") return "warning";
  if (s === "error") return "danger";
  return "neutral";
}

function fmtDate(v) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString();
}

function fmtVal(v) {
  if (v == null) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

// field_diffs arrives as either {field:{old,new}} (a mutation trail) or the
// three-way {field:{base,local,zoho}} (a conflict). Render whatever sub-keys
// are present so both shapes read clearly without assuming one.
function renderDiffs(diffs) {
  if (!diffs || typeof diffs !== "object") return "—";
  const keys = Object.keys(diffs);
  if (!keys.length) return "—";
  return (
    <div
      className="flex flex-col gap-4"
      style={{ fontSize: "var(--fs-sm, 13px)" }}
    >
      {keys.map((k) => {
        const v = diffs[k];
        const detail =
          v && typeof v === "object"
            ? Object.entries(v)
                .map(([sk, sv]) => `${sk}: ${fmtVal(sv)}`)
                .join("  ·  ")
            : fmtVal(v);
        return (
          <div key={k}>
            <span style={{ fontWeight: 600 }}>{k}</span>
            <span style={{ color: "var(--text-secondary)" }}> — {detail}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function ZohoBooksScreen() {
  const [status, setStatus] = React.useState({ cursors: [], entities: {} });
  const [mapEntity, setMapEntity] = React.useState("part");
  const [mappings, setMappings] = React.useState([]);
  const [conflicts, setConflicts] = React.useState([]);
  const [busy, setBusy] = React.useState({});
  const [loading, setLoading] = React.useState(true);
  const [notReady, setNotReady] = React.useState(false);

  const loadStatus = React.useCallback(async () => {
    try {
      const r = await apiRequest("/integrations/zoho_books/sync/status");
      setStatus(r || { cursors: [], entities: {} });
      setNotReady(false);
    } catch {
      // A failure here means the connector isn't connected/enabled yet — that
      // is a normal state, not an error to shout about.
      setNotReady(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadConflicts = React.useCallback(async () => {
    try {
      const r = await apiRequest("/integrations/zoho_books/conflicts");
      setConflicts((r && r.conflicts) || []);
    } catch {
      setConflicts([]);
    }
  }, []);

  const loadMappings = React.useCallback(async (type) => {
    try {
      const r = await apiRequest(`/integrations/zoho_books/mappings/${type}`);
      setMappings((r && r.mappings) || []);
    } catch {
      setMappings([]);
    }
  }, []);

  React.useEffect(() => {
    loadStatus();
    loadConflicts();
  }, [loadStatus, loadConflicts]);

  React.useEffect(() => {
    loadMappings(mapEntity);
  }, [mapEntity, loadMappings]);

  const runSync = async (entityType, direction, mode) => {
    setBusy((s) => ({ ...s, [entityType]: true }));
    try {
      const params = new URLSearchParams();
      if (direction) params.set("direction", direction);
      if (mode) params.set("mode", mode);
      const qs = params.toString();
      const r = await apiRequest(
        `/integrations/zoho_books/sync/${entityType}${qs ? `?${qs}` : ""}`,
        { method: "POST" },
      );
      const summary =
        r && r.enqueued != null
          ? `${r.enqueued} change(s) queued`
          : mode === "reconcile"
            ? "Reconciliation started"
            : "Sync started";
      toast(`${entityLabel(entityType)}: ${summary}`, { kind: "success" });
      loadStatus();
      loadConflicts();
      loadMappings(mapEntity);
    } catch (e) {
      toast("Sync failed: " + (e.message || ""), { kind: "error" });
    } finally {
      setBusy((s) => ({ ...s, [entityType]: false }));
    }
  };

  const resolve = async (id, resolution) => {
    try {
      await apiRequest(`/integrations/zoho_books/conflicts/${id}/resolve`, {
        method: "POST",
        body: JSON.stringify({ resolution }),
      });
      toast(
        resolution === "tool_wins"
          ? "Kept this tool's values"
          : "Kept Zoho Books' values",
        { kind: "success" },
      );
      loadConflicts();
      loadStatus();
    } catch (e) {
      toast("Could not resolve conflict: " + (e.message || ""), {
        kind: "error",
      });
    }
  };

  const cursors = {};
  (status.cursors || []).forEach((c) => {
    cursors[c.entity_type] = c;
  });
  const entities = status.entities || {};

  const mappingColumns = [
    { key: "entity_type", header: "Entity" },
    {
      key: "entity_id",
      header: "BOM ID",
      render: (r) => (r.entity_id != null ? `#${r.entity_id}` : "—"),
    },
    {
      key: "external_id",
      header: "Zoho ID",
      render: (r) =>
        r.external_url ? (
          <a href={r.external_url} target="_blank" rel="noopener noreferrer">
            {r.external_id || "Open in Zoho"}
          </a>
        ) : (
          r.external_id || "—"
        ),
    },
    {
      key: "last_synced_at",
      header: "Last synced",
      render: (r) => fmtDate(r.last_synced_at),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} />,
    },
  ];

  const conflictColumns = [
    {
      key: "entity",
      header: "Entity",
      render: (r) => `${r.entity_type}#${r.entity_id}`,
    },
    { key: "message", header: "Conflict", render: (r) => r.message || "—" },
    {
      key: "field_diffs",
      header: "Field differences",
      render: (r) => renderDiffs(r.field_diffs),
    },
    {
      key: "resolve",
      header: "Resolution",
      render: (r) => (
        <div className="flex gap-8">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => resolve(r.id, "tool_wins")}
          >
            Tool wins
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => resolve(r.id, "books_wins")}
          >
            Books wins
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="screen-wrap">
      <ScreenHeader
        title="Zoho Books"
        description="Sync parts, vendors, and purchase orders with Zoho Books, and resolve any money conflicts before they reach the ledger."
      />

      {notReady && !loading && (
        <Card>
          <EmptyState
            title="Zoho Books isn't connected yet"
            message="Connect and enable Zoho Books on the Integrations screen, then return here to sync and review mappings."
          />
        </Card>
      )}

      {!notReady && (
        <>
          <div className="flex flex-col gap-16">
            {ENTITIES.map((ent) => {
              const cur = cursors[ent.type] || {};
              const counts = entities[ent.type] || {};
              const byStatus = counts.by_status || {};
              const isBusy = !!busy[ent.type];
              return (
                <Card
                  key={ent.type}
                  title={ent.label}
                  actions={
                    <StatusPill
                      tone={runTone(cur.last_run_status)}
                      label={
                        cur.last_run_status
                          ? `Last run: ${cur.last_run_status}`
                          : "Never run"
                      }
                    />
                  }
                >
                  <div
                    className="flex gap-16"
                    style={{
                      flexWrap: "wrap",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <div className="flex flex-col gap-8" style={{ minWidth: 240 }}>
                      <div
                        style={{
                          fontSize: "var(--fs-sm, 13px)",
                          color: "var(--text-secondary)",
                        }}
                      >
                        {counts.total != null
                          ? `${counts.total} record${counts.total === 1 ? "" : "s"} mapped`
                          : "No records mapped yet"}
                        {cur.last_run_at ? ` · last run ${fmtDate(cur.last_run_at)}` : ""}
                        {cur.records_seen != null ? ` · ${cur.records_seen} seen` : ""}
                      </div>
                      {Object.keys(byStatus).length > 0 && (
                        <div className="flex gap-8" style={{ flexWrap: "wrap" }}>
                          {Object.entries(byStatus).map(([st, n]) => (
                            <StatusPill key={st} status={st} label={`${st}: ${n}`} />
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-8" style={{ flexWrap: "wrap" }}>
                      <Button
                        size="sm"
                        variant="primary"
                        loading={isBusy}
                        onClick={() => runSync(ent.type, "push")}
                      >
                        Push
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={isBusy}
                        onClick={() => runSync(ent.type, "pull")}
                      >
                        Pull
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={isBusy}
                        onClick={() => runSync(ent.type, "both", "reconcile")}
                      >
                        Reconcile
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          <div
            className="flex items-center gap-8"
            style={{ marginTop: "var(--sp-5, 24px)", flexWrap: "wrap" }}
          >
            <h3 style={{ margin: 0 }}>Mappings</h3>
            <div className="flex gap-8" style={{ marginLeft: "auto" }}>
              {ENTITIES.map((ent) => (
                <Button
                  key={ent.type}
                  size="sm"
                  variant={mapEntity === ent.type ? "primary" : "secondary"}
                  onClick={() => setMapEntity(ent.type)}
                >
                  {ent.type}
                </Button>
              ))}
            </div>
          </div>
          <DataTable
            dense
            ariaLabel="Zoho Books record mappings"
            columns={mappingColumns}
            rows={mappings}
            getRowKey={(r) => `${r.entity_type}-${r.entity_id}`}
            empty={
              <EmptyState
                title="No mappings yet"
                message="Records appear here once they're linked to Zoho by a push or a reconcile."
              />
            }
          />

          <h3 style={{ marginTop: "var(--sp-5, 24px)" }}>Conflicts</h3>
          <DataTable
            ariaLabel="Open Zoho Books sync conflicts"
            columns={conflictColumns}
            rows={conflicts}
            getRowKey={(r) => r.id}
            empty={
              <EmptyState
                title="No open conflicts"
                message="Two-sided money changes land here for review. Nothing needs your attention right now."
              />
            }
          />
        </>
      )}
    </div>
  );
}

ZohoBooksScreen.displayName = "ZohoBooksScreen";
window.ZohoBooksScreen = ZohoBooksScreen;
