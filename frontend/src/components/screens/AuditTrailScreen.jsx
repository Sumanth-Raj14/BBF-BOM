import React from "react";

import { __t } from "../../i18n";
import { api } from "../../../api.js";
import {
  ScreenHeader,
  DataTable,
  Badge,
  Field,
  Select,
  Input,
  Button,
  EmptyState,
  Spinner,
} from "../ui";

// Read-only viewer over the tenant's audit trail (GET /audit-logs). The
// backend already scopes every row to the caller's tenant (or NULL-tenant
// for superusers) — see app.api.endpoints.audit_logs.get_audit_logs — so no
// additional tenant filtering happens here. entityType/userId are sent as
// real server-side query params; action text and the date range are
// client-side refinements over the fetched page (the backend list endpoint
// does not (yet) support them as query params).
const ENTITY_TYPES = [
  "part",
  "project",
  "user",
  "document",
  "bom",
  "po",
  "eco",
  "ncr",
  "capa",
  "vendor",
  "auth",
  "api_key",
  "work_order",
];

const ACTION_TONE = (action) => {
  const a = String(action || "").toLowerCase();
  if (a.includes("delete") || a.includes("reject")) return "danger";
  if (a.includes("approve") || a.includes("implement") || a.includes("create") || a.includes("login"))
    return "success";
  if (a.includes("update") || a.includes("edit") || a.includes("submit")) return "info";
  return "neutral";
};

function formatWhen(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString();
}

function summarizeChanges(changes) {
  if (changes == null) return "—";
  if (typeof changes === "string") return changes;
  if (typeof changes === "object") {
    if (changes.meaning) return changes.meaning;
    try {
      const s = JSON.stringify(changes);
      return s.length > 120 ? `${s.slice(0, 117)}…` : s;
    } catch {
      return "—";
    }
  }
  return String(changes);
}

export default function AuditTrailScreen() {
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [page, setPage] = React.useState(1);
  const [hasNext, setHasNext] = React.useState(false);

  const [entityType, setEntityType] = React.useState("");
  const [actionFilter, setActionFilter] = React.useState("");
  const [userFilter, setUserFilter] = React.useState("");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");

  const load = React.useCallback(async (pageNum, append) => {
    setLoading(true);
    setError(null);
    try {
      const params = { page: pageNum, per_page: 100 };
      if (entityType) params.entityType = entityType;
      const result = await api.auditLogs.list(params);
      const items = Array.isArray(result) ? result : result?.items || [];
      setRows((prev) => (append ? [...prev, ...items] : items));
      setHasNext(Boolean(result?.has_next));
      setPage(pageNum);
    } catch (e) {
      // Honest failure — do not fall back to fabricated/sample rows.
      setError(e?.message || "Failed to load the audit trail.");
      if (!append) setRows([]);
    } finally {
      setLoading(false);
    }
  }, [entityType]);

  React.useEffect(() => {
    load(1, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType]);

  const filtered = rows.filter((r) => {
    if (actionFilter && !String(r.action || "").toLowerCase().includes(actionFilter.toLowerCase()))
      return false;
    if (userFilter) {
      const hay = String(r.userEmail || r.userId || "").toLowerCase();
      if (!hay.includes(userFilter.toLowerCase())) return false;
    }
    if (dateFrom && r.createdAt && new Date(r.createdAt) < new Date(dateFrom)) return false;
    if (dateTo && r.createdAt && new Date(r.createdAt) > new Date(`${dateTo}T23:59:59`)) return false;
    return true;
  });

  const columns = [
    {
      key: "createdAt",
      header: __t("auditTrail.colWhen") || "When",
      render: (r) => <span className="font-mono fs-11">{formatWhen(r.createdAt)}</span>,
    },
    {
      key: "actor",
      header: __t("auditTrail.colActor") || "Actor",
      render: (r) => <span className="fs-12">{r.userEmail || (r.userId != null ? `user #${r.userId}` : "system")}</span>,
    },
    {
      key: "action",
      header: __t("auditTrail.colAction") || "Action",
      render: (r) => <Badge tone={ACTION_TONE(r.action)}>{r.action}</Badge>,
    },
    {
      key: "entity",
      header: __t("auditTrail.colEntity") || "Entity",
      render: (r) => (
        <span className="font-mono fs-11">
          {r.entityType || "—"}
          {r.entityId != null ? ` #${r.entityId}` : ""}
        </span>
      ),
    },
    {
      key: "changes",
      header: __t("auditTrail.colDetails") || "Details",
      render: (r) => <span className="fs-11 fg-3">{summarizeChanges(r.changes)}</span>,
    },
  ];

  return (
    <div className="screen-wrap">
      <ScreenHeader
        title={__t("auditTrail.title") || "Audit Trail"}
        description={
          loading
            ? __t("common.loading") || "Loading…"
            : `${filtered.length} ${__t("auditTrail.of") || "of"} ${rows.length} ${__t("auditTrail.events") || "events"}`
        }
        actions={
          <Button variant="secondary" size="sm" onClick={() => load(1, false)}>
            {__t("common.refresh") || "Refresh"}
          </Button>
        }
      />

      <div className="d-grid gap-10 mb-14" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
        <Field label={__t("auditTrail.filterEntity") || "Entity type"} htmlFor="audit-filter-entity">
          <Select
            id="audit-filter-entity"
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
          >
            <option value="">{__t("common.all") || "All"}</option>
            {ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </Select>
        </Field>
        <Field label={__t("auditTrail.filterAction") || "Action contains"} htmlFor="audit-filter-action">
          <Input
            id="audit-filter-action"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            placeholder="approve, delete…"
          />
        </Field>
        <Field label={__t("auditTrail.filterUser") || "User contains"} htmlFor="audit-filter-user">
          <Input
            id="audit-filter-user"
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            placeholder="name@company.com"
          />
        </Field>
        <Field label={__t("auditTrail.filterFrom") || "From date"} htmlFor="audit-filter-from">
          <Input id="audit-filter-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </Field>
        <Field label={__t("auditTrail.filterTo") || "To date"} htmlFor="audit-filter-to">
          <Input id="audit-filter-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </Field>
      </div>

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
        ariaLabel={__t("auditTrail.title") || "Audit Trail"}
        columns={columns}
        rows={filtered}
        getRowKey={(r) => r.id}
        empty={
          loading ? (
            <div className="flex items-center gap-8 fg-3 fs-12" style={{ padding: "32px 0" }}>
              <Spinner size="sm" label={__t("common.loading") || "Loading…"} />
              <span aria-hidden="true">{__t("common.loading") || "Loading…"}</span>
            </div>
          ) : (
            <EmptyState title={__t("auditTrail.noResults") || "No audit events match these filters"} />
          )
        }
      />

      {hasNext && !loading && (
        <div className="flex justify-center mt-14">
          <Button variant="secondary" size="sm" onClick={() => load(page + 1, true)}>
            {__t("common.loadMore") || "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}

AuditTrailScreen.displayName = "AuditTrailScreen";
// Self-register on window so LazyScreens can resolve it after dynamic import.
window.AuditTrailScreen = AuditTrailScreen;
