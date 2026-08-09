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

// ============ REQUIREMENTS ============
//
// The one item in the data-model audit with nothing behind it before this —
// no table, no route, no UI. A requirement on its own is a to-do list; what
// makes it the Arena/Teamcenter differentiator over OpenBOM is the
// traceability link to the parts that satisfy it (requirement_part_links)
// and the coverage view that answers the question a quality/regulatory
// user actually asks: which requirements have NO part behind them yet.
//
// Scope note: this screen covers CRUD, part-linking (both directions) and
// the coverage view. BOM-linking exists on the backend (/requirements/{id}/
// boms) but has no UI surface here — parts are the traceability link that
// matters for a first version; add a BOM-link panel if that becomes a real
// ask.

const TYPES = ["functional", "performance", "regulatory", "interface"];
const STATUSES = ["draft", "approved", "obsolete"];
const PRIORITIES = ["low", "medium", "high", "critical"];

const STATUS_TONE = {
  draft: "neutral",
  approved: "success",
  obsolete: "danger",
};

const PRIORITY_TONE = {
  low: "neutral",
  medium: "info",
  high: "warning",
  critical: "danger",
};

function fmtDate(v) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString();
}

const emptyDraft = {
  key: "",
  title: "",
  description: "",
  type: "functional",
  status: "draft",
  priority: "medium",
  parent_id: "",
};

export default function RequirementsScreen() {
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [page, setPage] = React.useState(1);
  const [hasNext, setHasNext] = React.useState(false);

  const [status, setStatus] = React.useState("");
  const [type, setType] = React.useState("");

  const [selected, setSelected] = React.useState(null);
  const [linkedParts, setLinkedParts] = React.useState([]);
  const [linkPartId, setLinkPartId] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const [showCreate, setShowCreate] = React.useState(false);
  const [draft, setDraft] = React.useState(emptyDraft);
  const [creating, setCreating] = React.useState(false);
  const [createError, setCreateError] = React.useState(null);

  const [coverage, setCoverage] = React.useState(null);
  const [showCoverage, setShowCoverage] = React.useState(false);

  const load = React.useCallback(
    async (pageNum, append) => {
      setLoading(true);
      setError(null);
      try {
        const params = { page: pageNum, per_page: 100 };
        if (status) params.status = status;
        if (type) params.type = type;
        const result = await api.requirement.list(params);
        const items = Array.isArray(result) ? result : result?.items || [];
        setRows((prev) => (append ? [...prev, ...items] : items));
        setHasNext(Boolean(result?.has_next));
        setPage(pageNum);
      } catch (e) {
        // Honest failure — do not fall back to fabricated/sample rows.
        setError(e?.message || "Failed to load requirements.");
        if (!append) setRows([]);
      } finally {
        setLoading(false);
      }
    },
    [status, type],
  );

  React.useEffect(() => {
    load(1, false);
  }, [load]);

  const loadCoverage = async () => {
    try {
      const result = await api.requirement.coverage();
      setCoverage(result);
      setShowCoverage(true);
    } catch (e) {
      toast(
        (__t("requirements.coverageFailed") || "Could not load coverage") +
          ": " +
          (e?.message || String(e)),
        { kind: "error" },
      );
    }
  };

  const openRow = async (row) => {
    setSelected(row);
    setLinkPartId("");
    try {
      const parts = await api.requirement.linkedParts(row.id);
      setLinkedParts(Array.isArray(parts) ? parts : []);
    } catch {
      setLinkedParts([]);
    }
  };

  const linkPart = async () => {
    if (!selected || !linkPartId) return;
    setBusy(true);
    try {
      await api.requirement.linkPart(selected.id, Number(linkPartId));
      toast(__t("requirements.linked") || "Part linked", { kind: "success" });
      setLinkPartId("");
      const parts = await api.requirement.linkedParts(selected.id);
      setLinkedParts(Array.isArray(parts) ? parts : []);
    } catch (e) {
      toast(
        (__t("requirements.linkFailed") || "Could not link part") +
          ": " +
          (e?.message || String(e)),
        { kind: "error" },
      );
    } finally {
      setBusy(false);
    }
  };

  const unlinkPart = async (partId) => {
    if (!selected) return;
    setBusy(true);
    try {
      await api.requirement.unlinkPart(selected.id, partId);
      setLinkedParts((prev) => prev.filter((p) => p.part_id !== partId));
    } catch (e) {
      toast(
        (__t("requirements.unlinkFailed") || "Could not remove link") +
          ": " +
          (e?.message || String(e)),
        { kind: "error" },
      );
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    setCreating(true);
    setCreateError(null);
    try {
      const payload = {
        key: draft.key.trim(),
        title: draft.title.trim(),
        type: draft.type,
        status: draft.status,
        priority: draft.priority,
      };
      if (draft.description.trim()) payload.description = draft.description.trim();
      if (draft.parent_id) payload.parent_id = Number(draft.parent_id);

      const created = await api.requirement.create(payload);
      toast(
        (__t("requirements.created") || "Requirement created") +
          ": " +
          (created?.key || payload.key),
        { kind: "success" },
      );
      setShowCreate(false);
      setDraft(emptyDraft);
      await load(1, false);
    } catch (e) {
      setCreateError(e?.message || "Could not create the requirement.");
    } finally {
      setCreating(false);
    }
  };

  const canCreate = draft.key.trim() && draft.title.trim();

  const columns = [
    {
      key: "key",
      header: __t("requirements.colKey") || "Key",
      render: (r) => <span className="font-mono fs-12">{r.key}</span>,
    },
    {
      key: "title",
      header: __t("requirements.colTitle") || "Title",
      render: (r) => <span className="fs-12">{r.title}</span>,
    },
    {
      key: "type",
      header: __t("requirements.colType") || "Type",
      render: (r) => <Badge tone="neutral">{r.type}</Badge>,
    },
    {
      key: "priority",
      header: __t("requirements.colPriority") || "Priority",
      render: (r) =>
        r.priority ? (
          <Badge tone={PRIORITY_TONE[r.priority] || "neutral"}>{r.priority}</Badge>
        ) : (
          <span className="fg-3">—</span>
        ),
    },
    {
      key: "parent_id",
      header: __t("requirements.colParent") || "Parent",
      render: (r) => (
        <span className="font-mono fs-11">
          {r.parent_id != null ? `#${r.parent_id}` : "—"}
        </span>
      ),
    },
    {
      key: "version",
      header: __t("requirements.colVersion") || "Version",
      align: "num",
    },
    {
      key: "createdAt",
      header: __t("requirements.colCreated") || "Created",
      render: (r) => <span className="fs-11">{fmtDate(r.createdAt)}</span>,
    },
    {
      key: "status",
      header: __t("requirements.colStatus") || "Status",
      render: (r) => (
        <StatusPill
          status={r.status}
          tone={STATUS_TONE[String(r.status || "").toLowerCase()] || "neutral"}
        />
      ),
    },
  ];

  return (
    <div className="screen-wrap">
      <ScreenHeader
        title={__t("requirements.title") || "Requirements"}
        description={
          __t("requirements.subtitle") ||
          "Functional, performance, regulatory and interface requirements, traced to the parts that satisfy them"
        }
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={loadCoverage}>
              {__t("requirements.coverage") || "Coverage"}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => load(1, false)}>
              {__t("common.refresh") || "Refresh"}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setCreateError(null);
                setShowCreate(true);
              }}
            >
              {__t("requirements.new") || "New requirement"}
            </Button>
          </>
        }
      />

      <div className="d-grid gap-10 mb-14" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
        <Field label={__t("requirements.filterStatus") || "Status"} htmlFor="req-filter-status">
          <Select id="req-filter-status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{__t("common.all") || "All"}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={__t("requirements.filterType") || "Type"} htmlFor="req-filter-type">
          <Select id="req-filter-type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">{__t("common.all") || "All"}</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
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
        ariaLabel={__t("requirements.title") || "Requirements"}
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.id}
        onRowClick={openRow}
        empty={
          loading ? (
            <div className="flex items-center gap-8 fg-3 fs-12" style={{ padding: "32px 0" }}>
              <Spinner size="sm" label={__t("common.loading") || "Loading…"} />
              <span aria-hidden="true">{__t("common.loading") || "Loading…"}</span>
            </div>
          ) : (
            <EmptyState
              title={__t("requirements.empty") || "No requirements match these filters"}
              message={
                __t("requirements.emptyMsg") ||
                "Create one and link it to the part that satisfies it."
              }
            />
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

      {selected && (
        <Card
          className="mt-14"
          title={<span className="font-mono">{selected.key}</span>}
          subtitle={selected.title}
          actions={
            <>
              <StatusPill
                status={selected.status}
                tone={STATUS_TONE[String(selected.status || "").toLowerCase()] || "neutral"}
              />
              <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
                {__t("common.close") || "Close"}
              </Button>
            </>
          }
        >
          <dl className="req__facts">
            <div>
              <dt>{__t("requirements.colType") || "Type"}</dt>
              <dd>{selected.type}</dd>
            </div>
            <div>
              <dt>{__t("requirements.colPriority") || "Priority"}</dt>
              <dd>{selected.priority || "—"}</dd>
            </div>
            <div>
              <dt>{__t("requirements.colVersion") || "Version"}</dt>
              <dd>{selected.version ?? "—"}</dd>
            </div>
            <div>
              <dt>{__t("requirements.colParent") || "Parent"}</dt>
              <dd className="font-mono">
                {selected.parent_id != null ? `#${selected.parent_id}` : "—"}
              </dd>
            </div>
          </dl>

          <h4 className="fs-12 fw-600 mt-14 mb-8">
            {__t("requirements.description") || "Description"}
          </h4>
          <p className="fs-12 fg-2">{selected.description || "—"}</p>

          <h4 className="fs-12 fw-600 mt-14 mb-8">
            {__t("requirements.linkedParts") || "Parts satisfying this requirement"}
          </h4>
          {linkedParts.length === 0 ? (
            <p className="fs-12 fg-3">
              {__t("requirements.noLinkedParts") || "No parts linked yet — this requirement is uncovered."}
            </p>
          ) : (
            <ul className="req__links">
              {linkedParts.map((l) => (
                <li key={l.id} className="fs-12 font-mono">
                  part #{l.part_id}
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => unlinkPart(l.part_id)}
                  >
                    {__t("common.remove") || "Remove"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-8 mt-8">
            <Input
              type="number"
              placeholder={__t("requirements.partIdPlaceholder") || "Part ID"}
              value={linkPartId}
              onChange={(e) => setLinkPartId(e.target.value)}
              style={{ maxWidth: 140 }}
            />
            <Button variant="secondary" size="sm" disabled={busy || !linkPartId} onClick={linkPart}>
              {__t("requirements.linkPart") || "Link part"}
            </Button>
          </div>
        </Card>
      )}

      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title={__t("requirements.new") || "New requirement"}
        subtitle={
          __t("requirements.newSubtitle") ||
          "Key and title are required; link it to a part afterwards to make it traceable."
        }
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>
              {__t("common.cancel") || "Cancel"}
            </Button>
            <Button variant="primary" loading={creating} disabled={!canCreate} onClick={create}>
              {__t("common.create") || "Create"}
            </Button>
          </>
        }
      >
        {createError && (
          <div role="alert" className="mb-14 fs-12 fg-danger">
            {createError}
          </div>
        )}
        <div className="d-grid gap-10" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
          <Field label={__t("requirements.colKey") || "Key"} htmlFor="req-new-key" required>
            <Input
              id="req-new-key"
              mono
              value={draft.key}
              onChange={(e) => setDraft({ ...draft, key: e.target.value })}
              placeholder="REQ-0001"
            />
          </Field>
          <Field label={__t("requirements.colType") || "Type"} htmlFor="req-new-type" required>
            <Select
              id="req-new-type"
              value={draft.type}
              onChange={(e) => setDraft({ ...draft, type: e.target.value })}
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label={__t("requirements.colTitle") || "Title"} htmlFor="req-new-title" required>
          <Input
            id="req-new-title"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
        </Field>

        <Field label={__t("requirements.description") || "Description"} htmlFor="req-new-desc">
          <Textarea
            id="req-new-desc"
            rows={3}
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
        </Field>

        <div className="d-grid gap-10" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          <Field label={__t("requirements.colPriority") || "Priority"} htmlFor="req-new-priority">
            <Select
              id="req-new-priority"
              value={draft.priority}
              onChange={(e) => setDraft({ ...draft, priority: e.target.value })}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={__t("requirements.colStatus") || "Status"} htmlFor="req-new-status">
            <Select
              id="req-new-status"
              value={draft.status}
              onChange={(e) => setDraft({ ...draft, status: e.target.value })}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={__t("requirements.colParent") || "Parent requirement ID"} htmlFor="req-new-parent">
            <Input
              id="req-new-parent"
              type="number"
              value={draft.parent_id}
              onChange={(e) => setDraft({ ...draft, parent_id: e.target.value })}
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={showCoverage}
        onClose={() => setShowCoverage(false)}
        title={__t("requirements.coverage") || "Coverage"}
        subtitle={
          __t("requirements.coverageSubtitle") ||
          "Requirements with no linked part — the ones a quality/regulatory review would flag"
        }
        size="lg"
        footer={
          <Button variant="secondary" onClick={() => setShowCoverage(false)}>
            {__t("common.close") || "Close"}
          </Button>
        }
      >
        {coverage && (
          <>
            <p className="fs-12 fg-2 mb-14">
              {(__t("requirements.coverageSummary") || "{covered} of {total} covered")
                .replace("{covered}", coverage.covered_count)
                .replace("{total}", coverage.total)}
            </p>
            {coverage.uncovered.length === 0 ? (
              <EmptyState
                title={__t("requirements.fullyCovered") || "All requirements are covered"}
                message={__t("requirements.fullyCoveredMsg") || "Every requirement has at least one linked part."}
              />
            ) : (
              <ul className="req__links">
                {coverage.uncovered.map((r) => (
                  <li key={r.id} className="fs-12">
                    <span className="font-mono">{r.key}</span> — {r.title}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Modal>

      <style>{`
        .req__facts {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: var(--sp-3, 12px);
          margin: 0;
        }
        .req__facts dt {
          font-size: var(--fs-075, 11px);
          color: var(--text-muted, var(--fg-3));
          margin-bottom: 2px;
        }
        .req__facts dd {
          margin: 0;
          font-size: var(--fs-100, 13px);
          color: var(--text-primary, var(--fg));
        }
        .req__links {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .req__links li {
          display: flex;
          align-items: center;
          gap: 10px;
          justify-content: space-between;
        }
      `}</style>
    </div>
  );
}

RequirementsScreen.displayName = "RequirementsScreen";
// Self-register on window so LazyScreens can resolve it after dynamic import.
window.RequirementsScreen = RequirementsScreen;
