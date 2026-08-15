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

// ============ DEVIATIONS & WAIVERS ============
//
// The deviations table (app/models/deviation.py) plus its eight routes
// (GET/POST /deviations, GET/PUT/PATCH/DELETE /deviations/{id},
// POST /deviations/{id}/submit, POST /deviations/{id}/approve) have been
// complete for a while with nothing in the UI calling them. A deviation is
// the formal record that a part is being accepted outside its specification,
// so a regulated buyer expects to see the request, its risk and disposition,
// and the three named approvals. This screen is that missing surface.
//
// Scope note: the approve endpoint records one of three approval types
// (engineering / quality / customer) as a name string; the backend flips
// status to "Approved" and allApprovalsReceived to "Yes" only once all three
// are present. This screen just calls the endpoint and re-reads — it never
// computes an approval state of its own.

const TYPES = ["Deviation", "Waiver", "Concession"];
const STATUSES = [
  "Draft",
  "Submitted",
  "Under Review",
  "Approved",
  "Rejected",
  "Expired",
];
const RISK_LEVELS = ["Low", "Medium", "High", "Critical"];
const REQUEST_TYPES = ["One-time", "Permanent", "Temporary"];
const DISPOSITIONS = ["Use As Is", "Rework", "Scrap", "Return to Vendor"];
const APPROVAL_TYPES = ["engineering", "quality", "customer"];

const RISK_TONE = {
  low: "neutral",
  medium: "info",
  high: "warning",
  critical: "danger",
};

const STATUS_TONE = {
  draft: "neutral",
  submitted: "info",
  "under review": "warning",
  approved: "success",
  rejected: "danger",
  expired: "neutral",
};

function fmtDate(v) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString();
}

// Only the three fields the backend marks non-nullable are required here;
// everything else is optional so a draft can be opened fast and filled later.
const emptyDraft = {
  deviationNumber: "",
  title: "",
  type: "Deviation",
  deviationDescription: "",
  specification: "",
  partId: "",
  riskLevel: "",
  requestType: "",
  disposition: "",
  affectedQuantity: "",
  impactAssessment: "",
  expirationDate: "",
};

export default function DeviationsScreen() {
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [page, setPage] = React.useState(1);
  const [hasNext, setHasNext] = React.useState(false);

  const [status, setStatus] = React.useState("");
  const [type, setType] = React.useState("");
  const [riskLevel, setRiskLevel] = React.useState("");
  const [partId, setPartId] = React.useState("");

  const [selected, setSelected] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  const [showCreate, setShowCreate] = React.useState(false);
  const [draft, setDraft] = React.useState(emptyDraft);
  const [creating, setCreating] = React.useState(false);
  const [createError, setCreateError] = React.useState(null);

  const load = React.useCallback(
    async (pageNum, append) => {
      setLoading(true);
      setError(null);
      try {
        const params = { page: pageNum, per_page: 100 };
        if (status) params.status = status;
        if (type) params.type = type;
        if (riskLevel) params.riskLevel = riskLevel;
        if (partId) params.partId = partId;
        const result = await api.deviation.list(params);
        const items = Array.isArray(result) ? result : result?.items || [];
        setRows((prev) => (append ? [...prev, ...items] : items));
        setHasNext(Boolean(result?.has_next));
        setPage(pageNum);
      } catch (e) {
        // Honest failure — do not fall back to fabricated/sample rows.
        setError(e?.message || "Failed to load deviations.");
        if (!append) setRows([]);
      } finally {
        setLoading(false);
      }
    },
    [status, type, riskLevel, partId],
  );

  React.useEffect(() => {
    load(1, false);
  }, [load]);

  // After submit/approve the server owns the resulting state, so re-read the
  // single record rather than patching it locally.
  const refreshSelected = async (id) => {
    try {
      const fresh = await api.deviation.get(id);
      setSelected(fresh);
      setRows((prev) => prev.map((r) => (r.id === id ? fresh : r)));
    } catch {
      await load(1, false);
      setSelected(null);
    }
  };

  const submitDeviation = async (row) => {
    setBusy(true);
    try {
      await api.deviation.submit(row.id);
      toast(
        (__t("deviations.submitted") || "Submitted for review") +
          ": " +
          row.deviationNumber,
        { kind: "success" },
      );
      await refreshSelected(row.id);
    } catch (e) {
      toast(
        (__t("deviations.submitFailed") || "Could not submit") +
          ": " +
          (e?.message || String(e)),
        { kind: "error" },
      );
    } finally {
      setBusy(false);
    }
  };

  const approve = async (row, approvalType) => {
    setBusy(true);
    try {
      // approverName is left empty so the backend falls back to the signed-in
      // user's own name — the UI must not invent a signature.
      await api.deviation.approve(row.id, approvalType, "");
      toast(
        (__t("deviations.approved") || "Approval recorded") +
          ": " +
          approvalType,
        { kind: "success" },
      );
      await refreshSelected(row.id);
    } catch (e) {
      toast(
        (__t("deviations.approveFailed") || "Could not record approval") +
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
        deviationNumber: draft.deviationNumber.trim(),
        title: draft.title.trim(),
        type: draft.type,
        deviationDescription: draft.deviationDescription.trim(),
      };
      if (draft.specification.trim())
        payload.specification = draft.specification.trim();
      if (draft.impactAssessment.trim())
        payload.impactAssessment = draft.impactAssessment.trim();
      if (draft.partId) payload.partId = Number(draft.partId);
      if (draft.riskLevel) payload.riskLevel = draft.riskLevel;
      if (draft.requestType) payload.requestType = draft.requestType;
      if (draft.disposition) payload.disposition = draft.disposition;
      if (draft.affectedQuantity)
        payload.affectedQuantity = Number(draft.affectedQuantity);
      if (draft.expirationDate)
        payload.expirationDate = new Date(draft.expirationDate).toISOString();

      const created = await api.deviation.create(payload);
      toast(
        (__t("deviations.created") || "Deviation created") +
          ": " +
          (created?.deviationNumber || payload.deviationNumber),
        { kind: "success" },
      );
      setShowCreate(false);
      setDraft(emptyDraft);
      await load(1, false);
    } catch (e) {
      setCreateError(e?.message || "Could not create the deviation.");
    } finally {
      setCreating(false);
    }
  };

  const canCreate =
    draft.deviationNumber.trim() &&
    draft.title.trim() &&
    draft.deviationDescription.trim();

  const columns = [
    {
      key: "deviationNumber",
      header: __t("deviations.colNumber") || "Number",
      render: (r) => (
        <span className="font-mono fs-12">{r.deviationNumber}</span>
      ),
    },
    {
      key: "title",
      header: __t("deviations.colTitle") || "Title",
      render: (r) => <span className="fs-12">{r.title}</span>,
    },
    {
      key: "type",
      header: __t("deviations.colType") || "Type",
      render: (r) => <Badge tone="neutral">{r.type}</Badge>,
    },
    {
      key: "partId",
      header: __t("deviations.colPart") || "Part",
      render: (r) => (
        <span className="font-mono fs-11">
          {r.partId != null ? `part #${r.partId}` : "—"}
        </span>
      ),
    },
    {
      key: "riskLevel",
      header: __t("deviations.colRisk") || "Risk",
      render: (r) =>
        r.riskLevel ? (
          <Badge tone={RISK_TONE[String(r.riskLevel).toLowerCase()] || "neutral"}>
            {r.riskLevel}
          </Badge>
        ) : (
          <span className="fg-3">—</span>
        ),
    },
    {
      key: "disposition",
      header: __t("deviations.colDisposition") || "Disposition",
      render: (r) => r.disposition || "—",
    },
    {
      key: "affectedQuantity",
      header: __t("deviations.colQty") || "Affected qty",
      align: "num",
    },
    {
      key: "expirationDate",
      header: __t("deviations.colExpires") || "Expires",
      render: (r) => <span className="fs-11">{fmtDate(r.expirationDate)}</span>,
    },
    {
      key: "status",
      header: __t("deviations.colStatus") || "Status",
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
        title={__t("deviations.title") || "Deviations & Waivers"}
        description={
          __t("deviations.subtitle") ||
          "Formal requests to accept material outside specification, with engineering, quality and customer sign-off"
        }
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => load(1, false)}
            >
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
              {__t("deviations.new") || "New deviation"}
            </Button>
          </>
        }
      />

      <div
        className="d-grid gap-10 mb-14"
        style={{ gridTemplateColumns: "repeat(4, 1fr)" }}
      >
        <Field
          label={__t("deviations.filterStatus") || "Status"}
          htmlFor="dev-filter-status"
        >
          <Select
            id="dev-filter-status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">{__t("common.all") || "All"}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label={__t("deviations.filterType") || "Type"}
          htmlFor="dev-filter-type"
        >
          <Select
            id="dev-filter-type"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="">{__t("common.all") || "All"}</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label={__t("deviations.filterRisk") || "Risk level"}
          htmlFor="dev-filter-risk"
        >
          <Select
            id="dev-filter-risk"
            value={riskLevel}
            onChange={(e) => setRiskLevel(e.target.value)}
          >
            <option value="">{__t("common.all") || "All"}</option>
            {RISK_LEVELS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label={__t("deviations.filterPart") || "Part ID"}
          htmlFor="dev-filter-part"
        >
          <Input
            id="dev-filter-part"
            type="number"
            value={partId}
            onChange={(e) => setPartId(e.target.value)}
            placeholder="e.g. 42"
          />
        </Field>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-14 fs-12"
          style={{
            padding: "8px 12px",
            borderRadius: "var(--r-2, 6px)",
            background:
              "color-mix(in oklch, var(--status-danger, red) 10%, transparent)",
          }}
        >
          {error}
        </div>
      )}

      <DataTable
        dense
        zebra
        ariaLabel={__t("deviations.title") || "Deviations & Waivers"}
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.id}
        onRowClick={(r) => setSelected(r)}
        empty={
          loading ? (
            <div
              className="flex items-center gap-8 fg-3 fs-12"
              style={{ padding: "32px 0" }}
            >
              <Spinner size="sm" label={__t("common.loading") || "Loading…"} />
              <span aria-hidden="true">
                {__t("common.loading") || "Loading…"}
              </span>
            </div>
          ) : (
            <EmptyState
              title={
                __t("deviations.empty") ||
                "No deviations match these filters"
              }
              message={
                __t("deviations.emptyMsg") ||
                "Raise one when material has to be accepted outside its specification."
              }
            />
          )
        }
      />

      {hasNext && !loading && (
        <div className="flex justify-center mt-14">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => load(page + 1, true)}
          >
            {__t("common.loadMore") || "Load more"}
          </Button>
        </div>
      )}

      {selected && (
        <Card
          className="mt-14"
          title={
            <span className="font-mono">{selected.deviationNumber}</span>
          }
          subtitle={selected.title}
          actions={
            <>
              <StatusPill
                status={selected.status}
                tone={
                  STATUS_TONE[String(selected.status || "").toLowerCase()] ||
                  "neutral"
                }
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelected(null)}
              >
                {__t("common.close") || "Close"}
              </Button>
            </>
          }
        >
          <dl className="dev__facts">
            <div>
              <dt>{__t("deviations.colType") || "Type"}</dt>
              <dd>{selected.type}</dd>
            </div>
            <div>
              <dt>{__t("deviations.colPart") || "Part"}</dt>
              <dd className="font-mono">
                {selected.partId != null ? `part #${selected.partId}` : "—"}
              </dd>
            </div>
            <div>
              <dt>{__t("deviations.colProject") || "Project"}</dt>
              <dd className="font-mono">
                {selected.projectId != null
                  ? `project #${selected.projectId}`
                  : "—"}
              </dd>
            </div>
            <div>
              <dt>{__t("deviations.colRisk") || "Risk"}</dt>
              <dd>{selected.riskLevel || "—"}</dd>
            </div>
            <div>
              <dt>{__t("deviations.colRequestType") || "Request type"}</dt>
              <dd>{selected.requestType || "—"}</dd>
            </div>
            <div>
              <dt>{__t("deviations.colDisposition") || "Disposition"}</dt>
              <dd>{selected.disposition || "—"}</dd>
            </div>
            <div>
              <dt>{__t("deviations.colQty") || "Affected qty"}</dt>
              <dd>{selected.affectedQuantity ?? "—"}</dd>
            </div>
            <div>
              <dt>{__t("deviations.colExpires") || "Expires"}</dt>
              <dd>{fmtDate(selected.expirationDate)}</dd>
            </div>
            <div>
              <dt>{__t("deviations.colCapa") || "Linked CAPA"}</dt>
              <dd className="font-mono">
                {selected.capaId != null ? `CAPA #${selected.capaId}` : "—"}
              </dd>
            </div>
          </dl>

          <h4 className="fs-12 fw-600 mt-14 mb-8">
            {__t("deviations.specification") || "Specification deviated from"}
          </h4>
          <p className="fs-12 fg-2">{selected.specification || "—"}</p>

          <h4 className="fs-12 fw-600 mt-14 mb-8">
            {__t("deviations.description") || "Deviation description"}
          </h4>
          <p className="fs-12 fg-2">{selected.deviationDescription || "—"}</p>

          <h4 className="fs-12 fw-600 mt-14 mb-8">
            {__t("deviations.impact") || "Impact assessment"}
          </h4>
          <p className="fs-12 fg-2">{selected.impactAssessment || "—"}</p>

          <h4 className="fs-12 fw-600 mt-14 mb-8">
            {__t("deviations.approvals") || "Approvals"}
          </h4>
          <dl className="dev__facts">
            <div>
              <dt>{__t("deviations.engineering") || "Engineering"}</dt>
              <dd>{selected.engineeringApproval || "—"}</dd>
            </div>
            <div>
              <dt>{__t("deviations.quality") || "Quality"}</dt>
              <dd>{selected.qualityApproval || "—"}</dd>
            </div>
            <div>
              <dt>{__t("deviations.customer") || "Customer"}</dt>
              <dd>{selected.customerApproval || "—"}</dd>
            </div>
            <div>
              <dt>{__t("deviations.allApprovals") || "All approvals received"}</dt>
              <dd>{selected.allApprovalsReceived || "—"}</dd>
            </div>
          </dl>

          <div className="flex gap-8 mt-14">
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => submitDeviation(selected)}
            >
              {__t("deviations.submit") || "Submit for review"}
            </Button>
            {APPROVAL_TYPES.map((t) => (
              <Button
                key={t}
                variant="primary"
                size="sm"
                disabled={busy}
                onClick={() => approve(selected, t)}
              >
                {(__t("deviations.approveAs") || "Approve") + ": " + t}
              </Button>
            ))}
          </div>
        </Card>
      )}

      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title={__t("deviations.new") || "New deviation"}
        subtitle={
          __t("deviations.newSubtitle") ||
          "Number, title and description are required; the rest can be filled in while the request is still a draft."
        }
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>
              {__t("common.cancel") || "Cancel"}
            </Button>
            <Button
              variant="primary"
              loading={creating}
              disabled={!canCreate}
              onClick={create}
            >
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
        <div
          className="d-grid gap-10"
          style={{ gridTemplateColumns: "repeat(2, 1fr)" }}
        >
          <Field
            label={__t("deviations.colNumber") || "Number"}
            htmlFor="dev-new-number"
            required
          >
            <Input
              id="dev-new-number"
              mono
              value={draft.deviationNumber}
              onChange={(e) =>
                setDraft({ ...draft, deviationNumber: e.target.value })
              }
              placeholder="DEV-2026-001"
            />
          </Field>
          <Field
            label={__t("deviations.colType") || "Type"}
            htmlFor="dev-new-type"
            required
          >
            <Select
              id="dev-new-type"
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

        <Field
          label={__t("deviations.colTitle") || "Title"}
          htmlFor="dev-new-title"
          required
        >
          <Input
            id="dev-new-title"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
        </Field>

        <Field
          label={__t("deviations.specification") || "Specification deviated from"}
          htmlFor="dev-new-spec"
        >
          <Textarea
            id="dev-new-spec"
            rows={2}
            value={draft.specification}
            onChange={(e) =>
              setDraft({ ...draft, specification: e.target.value })
            }
          />
        </Field>

        <Field
          label={__t("deviations.description") || "Deviation description"}
          htmlFor="dev-new-desc"
          required
        >
          <Textarea
            id="dev-new-desc"
            rows={3}
            value={draft.deviationDescription}
            onChange={(e) =>
              setDraft({ ...draft, deviationDescription: e.target.value })
            }
          />
        </Field>

        <Field
          label={__t("deviations.impact") || "Impact assessment"}
          htmlFor="dev-new-impact"
        >
          <Textarea
            id="dev-new-impact"
            rows={2}
            value={draft.impactAssessment}
            onChange={(e) =>
              setDraft({ ...draft, impactAssessment: e.target.value })
            }
          />
        </Field>

        <div
          className="d-grid gap-10"
          style={{ gridTemplateColumns: "repeat(3, 1fr)" }}
        >
          <Field
            label={__t("deviations.colPart") || "Part ID"}
            htmlFor="dev-new-part"
          >
            <Input
              id="dev-new-part"
              type="number"
              value={draft.partId}
              onChange={(e) => setDraft({ ...draft, partId: e.target.value })}
            />
          </Field>
          <Field
            label={__t("deviations.colRisk") || "Risk level"}
            htmlFor="dev-new-risk"
          >
            <Select
              id="dev-new-risk"
              value={draft.riskLevel}
              onChange={(e) =>
                setDraft({ ...draft, riskLevel: e.target.value })
              }
            >
              <option value="">{__t("common.none") || "Not set"}</option>
              {RISK_LEVELS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={__t("deviations.colRequestType") || "Request type"}
            htmlFor="dev-new-reqtype"
          >
            <Select
              id="dev-new-reqtype"
              value={draft.requestType}
              onChange={(e) =>
                setDraft({ ...draft, requestType: e.target.value })
              }
            >
              <option value="">{__t("common.none") || "Not set"}</option>
              {REQUEST_TYPES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={__t("deviations.colDisposition") || "Disposition"}
            htmlFor="dev-new-disp"
          >
            <Select
              id="dev-new-disp"
              value={draft.disposition}
              onChange={(e) =>
                setDraft({ ...draft, disposition: e.target.value })
              }
            >
              <option value="">{__t("common.none") || "Not set"}</option>
              {DISPOSITIONS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={__t("deviations.colQty") || "Affected quantity"}
            htmlFor="dev-new-qty"
          >
            <Input
              id="dev-new-qty"
              type="number"
              value={draft.affectedQuantity}
              onChange={(e) =>
                setDraft({ ...draft, affectedQuantity: e.target.value })
              }
            />
          </Field>
          <Field
            label={__t("deviations.colExpires") || "Expires"}
            htmlFor="dev-new-expires"
          >
            <Input
              id="dev-new-expires"
              type="date"
              value={draft.expirationDate}
              onChange={(e) =>
                setDraft({ ...draft, expirationDate: e.target.value })
              }
            />
          </Field>
        </div>
      </Modal>

      <style>{`
        .dev__facts {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: var(--sp-3, 12px);
          margin: 0;
        }
        .dev__facts dt {
          font-size: var(--fs-075, 11px);
          color: var(--text-muted, var(--fg-3));
          margin-bottom: 2px;
        }
        .dev__facts dd {
          margin: 0;
          font-size: var(--fs-100, 13px);
          color: var(--text-primary, var(--fg));
        }
      `}</style>
    </div>
  );
}

DeviationsScreen.displayName = "DeviationsScreen";
// Self-register on window so LazyScreens can resolve it after dynamic import.
window.DeviationsScreen = DeviationsScreen;
