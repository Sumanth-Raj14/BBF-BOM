import PropTypes from "prop-types";

import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import { api } from "../../../api.js";
import { Icon, fmt } from "../../globals";
import {
  Button,
  EmptyState,
  Field,
  Input,
  Modal,
  ScreenHeader,
  Select,
  StatusPill,
  Textarea,
} from "../ui";
import { DataTable } from "../ui/DataTable.jsx";

// ============ MAKE VS BUY ============
//
// Sourcing decision analyses: cost to make a part in-house against the cost to
// buy it. The backend has had the full surface for a while (GET/POST
// /make-vs-buy, PUT/DELETE /make-vs-buy/{id}, POST /make-vs-buy/{id}/approve)
// but nothing in the UI called it, so analyses could only be created against
// the API directly. This screen is that missing surface.
//
// Totals note: the server recomputes makeTotalCost / buyTotalCost from their
// components on every create and update, so the totals here are read-only
// mirrors of that arithmetic — a hand-typed total would be silently discarded
// on save.
//
// partId / projectId note: MakeVsBuyUpdate (backend schema) carries neither, so
// PUT ignores them. They are editable on create and locked on edit rather than
// offered as controls that quietly do nothing.

const asList = (res) => (Array.isArray(res) ? res : res?.items || res?.data || []);

/** null for anything that isn't a real number, so "missing" stays missing. */
const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const sum = (...vals) => vals.reduce((acc, v) => acc + (num(v) || 0), 0);

const EMPTY_FORM = {
  partId: "",
  projectId: "",
  decision: "TBD",
  makeMaterialCost: "",
  makeLaborCost: "",
  makeOverheadCost: "",
  makeToolingCost: "",
  buyUnitPrice: "",
  buyNreCost: "",
  qualityScore: 5,
  leadTimeDays: 0,
  capacityScore: 5,
  ipRiskScore: 5,
  supplyRiskScore: 5,
  recommendation: "",
  rationale: "",
  status: "Draft",
};

const DECISIONS = ["TBD", "Make", "Buy"];
// Exactly the values make_vs_buy_analyses.status allows in the DB CHECK
// constraint. "In Review" is NOT one of them — sending it fails the
// constraint and the API returns 500.
const STATUSES = ["Draft", "Submitted", "Approved", "Rejected"];

const formFromRow = (row) => ({
  ...EMPTY_FORM,
  ...Object.fromEntries(
    Object.keys(EMPTY_FORM)
      .filter((k) => row[k] !== null && row[k] !== undefined)
      .map((k) => [k, row[k]]),
  ),
});

export default function MakeVsBuyScreen() {
  const [rows, setRows] = React.useState([]);
  const [parts, setParts] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [busyId, setBusyId] = React.useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = React.useState(null);
  const [editing, setEditing] = React.useState(null); // row | "new" | null
  const [form, setForm] = React.useState(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // The parts lookup is only for labels and the part picker — a failure
      // there must not take the analyses down with it.
      const [analysisRes, partRes] = await Promise.all([
        api.makeVsBuy.list({ per_page: 200 }),
        api.parts.list({ per_page: 500 }).catch(() => null),
      ]);
      setRows(asList(analysisRes));
      setParts(asList(partRes));
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const partsById = React.useMemo(() => {
    const map = {};
    parts.forEach((p) => {
      if (p?.id != null) map[p.id] = p;
    });
    return map;
  }, [parts]);

  const partLabel = (partId) => {
    if (partId === null || partId === undefined) return "—";
    const p = partsById[partId];
    if (!p) return (__t("mvb.part") || "Part") + " #" + partId;
    return [p.pn, p.name].filter(Boolean).join(" — ");
  };

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setEditing("new");
  };

  const openEdit = (row) => {
    setForm(formFromRow(row));
    setEditing(row);
  };

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  // Live totals — the same arithmetic the server applies on save.
  const makeAuto = sum(
    form.makeMaterialCost,
    form.makeLaborCost,
    form.makeOverheadCost,
    form.makeToolingCost,
  );
  const buyAuto = sum(form.buyUnitPrice, form.buyNreCost);
  const isEdit = editing !== null && editing !== "new";

  const save = async () => {
    const partId = num(form.partId);
    if (partId === null) {
      toast(__t("mvb.partRequired") || "Pick a part first", { kind: "error" });
      return;
    }
    const payload = {
      partId,
      projectId: num(form.projectId),
      decision: form.decision || "TBD",
      makeMaterialCost: num(form.makeMaterialCost) || 0,
      makeLaborCost: num(form.makeLaborCost) || 0,
      makeOverheadCost: num(form.makeOverheadCost) || 0,
      makeToolingCost: num(form.makeToolingCost) || 0,
      makeTotalCost: makeAuto,
      buyUnitPrice: num(form.buyUnitPrice) || 0,
      buyNreCost: num(form.buyNreCost) || 0,
      buyTotalCost: buyAuto,
      qualityScore: num(form.qualityScore) || 0,
      leadTimeDays: num(form.leadTimeDays) || 0,
      capacityScore: num(form.capacityScore) || 0,
      ipRiskScore: num(form.ipRiskScore) || 0,
      supplyRiskScore: num(form.supplyRiskScore) || 0,
      recommendation: form.recommendation || null,
      rationale: form.rationale || null,
      status: form.status || "Draft",
    };
    setSaving(true);
    try {
      if (editing === "new") {
        await api.makeVsBuy.create(payload);
        toast(__t("mvb.created") || "Analysis created", { kind: "success" });
      } else {
        await api.makeVsBuy.update(editing.id, payload);
        toast(__t("mvb.updated") || "Analysis updated", { kind: "success" });
      }
      setEditing(null);
      await load();
    } catch (e) {
      toast(
        (__t("mvb.saveFailed") || "Could not save analysis") +
          ": " +
          (e?.message || String(e)),
        { kind: "error" },
      );
    } finally {
      setSaving(false);
    }
  };

  const approve = async (row) => {
    setBusyId(row.id);
    try {
      await api.makeVsBuy.approve(row.id);
      toast(__t("mvb.approved") || "Analysis approved", { kind: "success" });
      await load();
    } catch (e) {
      toast(
        (__t("mvb.approveFailed") || "Could not approve analysis") +
          ": " +
          (e?.message || String(e)),
        { kind: "error" },
      );
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (row) => {
    setBusyId(row.id);
    try {
      await api.makeVsBuy.delete(row.id);
      toast(__t("mvb.deleted") || "Analysis deleted", { kind: "success" });
      setConfirmDeleteId(null);
      await load();
    } catch (e) {
      toast(
        (__t("mvb.deleteFailed") || "Could not delete analysis") +
          ": " +
          (e?.message || String(e)),
        { kind: "error" },
      );
    } finally {
      setBusyId(null);
    }
  };

  const columns = [
    {
      key: "part",
      header: __t("mvb.part") || "Part",
      render: (row) => (
        <div>
          <div className="mvb__part">{partLabel(row.partId)}</div>
          {row.recommendation && (
            <div className="mvb__sub">{row.recommendation}</div>
          )}
        </div>
      ),
    },
    {
      key: "decision",
      header: __t("mvb.decision") || "Decision",
      render: (row) => row.decision || "—",
    },
    {
      key: "makeTotalCost",
      header: __t("mvb.makeTotal") || "Make total",
      align: "right",
      render: (row) => fmt.money(num(row.makeTotalCost)),
    },
    {
      key: "buyTotalCost",
      header: __t("mvb.buyTotal") || "Buy total",
      align: "right",
      render: (row) => fmt.money(num(row.buyTotalCost)),
    },
    {
      key: "delta",
      header: __t("mvb.delta") || "Delta (make − buy)",
      align: "right",
      render: (row) => {
        const make = num(row.makeTotalCost);
        const buy = num(row.buyTotalCost);
        if (make === null || buy === null) return "—";
        const delta = make - buy;
        return (
          <span
            className={
              "mvb__delta" +
              (delta < 0 ? " mvb__delta--down" : delta > 0 ? " mvb__delta--up" : "")
            }
          >
            {fmt.money(delta)}
          </span>
        );
      },
    },
    {
      key: "cheaper",
      header: __t("mvb.cheaper") || "Cheaper",
      render: (row) => {
        const make = num(row.makeTotalCost);
        const buy = num(row.buyTotalCost);
        // Missing total = unknown. Never guess a winner from half the numbers.
        if (make === null || buy === null) return "—";
        if (Math.abs(make - buy) < 0.005) {
          return <StatusPill tone="neutral" label={__t("mvb.even") || "Even"} />;
        }
        // StatusPill renders `label`, not children.
        return (
          <StatusPill
            tone="info"
            label={
              make < buy ? __t("mvb.make") || "Make" : __t("mvb.buy") || "Buy"
            }
          />
        );
      },
    },
    {
      key: "status",
      header: __t("mvb.status") || "Status",
      render: (row) => (
        <StatusPill status={row.status} label={row.status || "—"} />
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (row) => (
        <div className="mvb__actions">
          {row.status !== "Approved" && (
            <Button
              variant="secondary"
              disabled={busyId === row.id}
              onClick={() => approve(row)}
            >
              <Icon.Check size={12} /> {__t("mvb.approve") || "Approve"}
            </Button>
          )}
          <Button
            variant="secondary"
            disabled={busyId === row.id}
            onClick={() => openEdit(row)}
          >
            <Icon.Edit size={12} /> {__t("common.edit") || "Edit"}
          </Button>
          {confirmDeleteId === row.id ? (
            <>
              <Button
                variant="danger"
                disabled={busyId === row.id}
                onClick={() => remove(row)}
              >
                {__t("mvb.confirmDelete") || "Confirm delete"}
              </Button>
              <Button
                variant="secondary"
                disabled={busyId === row.id}
                onClick={() => setConfirmDeleteId(null)}
              >
                {__t("common.cancel") || "Cancel"}
              </Button>
            </>
          ) : (
            <Button
              variant="secondary"
              disabled={busyId === row.id}
              onClick={() => setConfirmDeleteId(row.id)}
            >
              <Icon.Trash size={12} /> {__t("common.delete") || "Delete"}
            </Button>
          )}
        </div>
      ),
    },
  ];

  const costField = (key, label) => (
    <Field label={label}>
      <Input
        type="number"
        step="0.01"
        name={key}
        value={form[key]}
        onChange={(e) => setField(key, e.target.value)}
      />
    </Field>
  );

  const scoreField = (key, label, hint) => (
    <Field label={label} hint={hint}>
      <Input
        type="number"
        step="1"
        name={key}
        value={form[key]}
        onChange={(e) => setField(key, e.target.value)}
      />
    </Field>
  );

  return (
    <div className="mvb">
      <ScreenHeader
        title={__t("mvb.title") || "Make vs Buy"}
        description={
          __t("mvb.subtitle") ||
          "Compare the cost of making a part in-house against buying it"
        }
      />

      <div className="mvb__toolbar">
        <Button variant="primary" onClick={openCreate}>
          <Icon.Plus size={12} /> {__t("mvb.new") || "New analysis"}
        </Button>
        <Button variant="secondary" onClick={load} disabled={loading}>
          <Icon.Refresh size={12} /> {__t("common.refresh") || "Refresh"}
        </Button>
      </div>

      {loading && (
        <div className="mvb__state" role="status">
          {__t("common.loading") || "Loading…"}
        </div>
      )}

      {!loading && error && (
        <div className="mvb__state mvb__state--error" role="alert">
          {(__t("mvb.loadFailed") || "Could not load make-vs-buy analyses") +
            ": " +
            error}
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <EmptyState
          title={__t("mvb.emptyTitle") || "No analyses yet"}
          message={
            __t("mvb.empty") ||
            "Create an analysis to compare in-house cost against a supplier quote."
          }
        />
      )}

      {!loading && !error && rows.length > 0 && (
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(row) => row.id}
          ariaLabel={__t("mvb.tableLabel") || "Make vs buy analyses"}
          dense
        />
      )}

      <Modal
        open={editing !== null}
        onClose={() => (saving ? null : setEditing(null))}
        size="lg"
        title={
          editing === "new"
            ? __t("mvb.newTitle") || "New make-vs-buy analysis"
            : __t("mvb.editTitle") || "Edit make-vs-buy analysis"
        }
        subtitle={
          __t("mvb.modalSubtitle") ||
          "Totals are calculated from their components as you type."
        }
        footer={
          <>
            <Button
              variant="secondary"
              disabled={saving}
              onClick={() => setEditing(null)}
            >
              {__t("common.cancel") || "Cancel"}
            </Button>
            <Button variant="primary" onClick={save} disabled={saving}>
              {saving
                ? __t("common.saving") || "Saving…"
                : __t("common.save") || "Save"}
            </Button>
          </>
        }
      >
        <div className="mvb__grid">
          <Field
            label={__t("mvb.part") || "Part"}
            required
            hint={
              isEdit
                ? __t("mvb.partLocked") ||
                  "Part cannot be changed after the analysis is created"
                : undefined
            }
          >
            {parts.length > 0 ? (
              <Select
                name="partId"
                value={form.partId}
                disabled={isEdit}
                onChange={(e) => setField("partId", e.target.value)}
              >
                <option value="">
                  {__t("mvb.selectPart") || "Select a part…"}
                </option>
                {parts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {[p.pn, p.name].filter(Boolean).join(" — ")}
                  </option>
                ))}
              </Select>
            ) : (
              // Parts list unavailable — fall back to the raw id rather than
              // an empty picker that can never be satisfied.
              <Input
                type="number"
                name="partId"
                placeholder={__t("mvb.partIdPlaceholder") || "Part ID"}
                value={form.partId}
                disabled={isEdit}
                onChange={(e) => setField("partId", e.target.value)}
              />
            )}
          </Field>
          <Field
            label={__t("mvb.projectId") || "Project ID"}
            hint={
              isEdit
                ? __t("mvb.projectLocked") ||
                  "Project cannot be changed after the analysis is created"
                : undefined
            }
          >
            <Input
              type="number"
              name="projectId"
              value={form.projectId}
              disabled={isEdit}
              onChange={(e) => setField("projectId", e.target.value)}
            />
          </Field>
          <Field label={__t("mvb.decision") || "Decision"}>
            <Select
              name="decision"
              value={form.decision}
              onChange={(e) => setField("decision", e.target.value)}
            >
              {DECISIONS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={__t("mvb.status") || "Status"}>
            <Select
              name="status"
              value={form.status}
              onChange={(e) => setField("status", e.target.value)}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="mvb__group">
          <h3 className="mvb__group-title">
            {__t("mvb.makeCosts") || "Make (in-house) costs"}
          </h3>
          <div className="mvb__grid">
            {costField("makeMaterialCost", __t("mvb.material") || "Material")}
            {costField("makeLaborCost", __t("mvb.labor") || "Labor")}
            {costField("makeOverheadCost", __t("mvb.overhead") || "Overhead")}
            {costField("makeToolingCost", __t("mvb.tooling") || "Tooling")}
          </div>
          <Field
            label={__t("mvb.makeTotal") || "Make total"}
            hint={__t("mvb.autoHint") || "Material + labor + overhead + tooling"}
          >
            <Input
              readOnly
              name="makeTotalCost"
              value={makeAuto.toFixed(2)}
            />
          </Field>
        </div>

        <div className="mvb__group">
          <h3 className="mvb__group-title">
            {__t("mvb.buyCosts") || "Buy (supplier) costs"}
          </h3>
          <div className="mvb__grid">
            {costField("buyUnitPrice", __t("mvb.unitPrice") || "Unit price")}
            {costField("buyNreCost", __t("mvb.nre") || "NRE")}
          </div>
          <Field
            label={__t("mvb.buyTotal") || "Buy total"}
            hint={__t("mvb.autoHintBuy") || "Unit price + NRE"}
          >
            <Input readOnly name="buyTotalCost" value={buyAuto.toFixed(2)} />
          </Field>
        </div>

        <p className="mvb__verdict" role="status">
          {__t("mvb.liveVerdict") || "Cheaper option"}:{" "}
          <strong>
            {Math.abs(makeAuto - buyAuto) < 0.005
              ? __t("mvb.even") || "Even"
              : makeAuto < buyAuto
                ? __t("mvb.make") || "Make"
                : __t("mvb.buy") || "Buy"}
          </strong>
        </p>

        <div className="mvb__group">
          <h3 className="mvb__group-title">
            {__t("mvb.scores") || "Scores & risk"}
          </h3>
          <div className="mvb__grid">
            {scoreField("qualityScore", __t("mvb.quality") || "Quality", "1–10")}
            {scoreField(
              "leadTimeDays",
              __t("mvb.leadTime") || "Lead time (days)",
            )}
            {scoreField(
              "capacityScore",
              __t("mvb.capacity") || "Capacity",
              "1–10",
            )}
            {scoreField("ipRiskScore", __t("mvb.ipRisk") || "IP risk", "1–10")}
            {scoreField(
              "supplyRiskScore",
              __t("mvb.supplyRisk") || "Supply risk",
              "1–10",
            )}
          </div>
        </div>

        <Field label={__t("mvb.recommendation") || "Recommendation"}>
          <Input
            name="recommendation"
            value={form.recommendation}
            onChange={(e) => setField("recommendation", e.target.value)}
          />
        </Field>
        <Field label={__t("mvb.rationale") || "Rationale"}>
          <Textarea
            name="rationale"
            rows={3}
            value={form.rationale}
            onChange={(e) => setField("rationale", e.target.value)}
          />
        </Field>
      </Modal>

      <style>{`
        .mvb__toolbar {
          display: flex;
          gap: var(--sp-2);
          align-items: center;
          margin-bottom: var(--sp-3);
        }
        .mvb__part { font-weight: var(--fw-medium); color: var(--text-primary); }
        .mvb__sub { font-size: var(--fs-075); color: var(--text-muted); }
        .mvb__delta { font-variant-numeric: tabular-nums; }
        .mvb__delta--down { color: var(--success-text, #067647); }
        .mvb__delta--up { color: var(--danger-text, #b42318); }
        .mvb__actions {
          display: flex;
          gap: var(--sp-1);
          justify-content: flex-end;
          flex-wrap: wrap;
        }
        .mvb__state {
          padding: var(--sp-5);
          text-align: center;
          color: var(--text-secondary);
          font-size: var(--fs-100);
        }
        .mvb__state--error { color: var(--danger-text, #b42318); }
        .mvb__grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: var(--sp-3);
        }
        .mvb__group {
          margin-top: var(--sp-4);
          padding-top: var(--sp-3);
          border-top: 1px solid var(--border-default);
        }
        .mvb__group-title {
          margin: 0 0 var(--sp-2);
          font-size: var(--fs-100);
          font-weight: var(--fw-medium);
          color: var(--text-secondary);
        }
        .mvb__verdict {
          margin-top: var(--sp-3);
          font-size: var(--fs-100);
          color: var(--text-secondary);
        }
      `}</style>
    </div>
  );
}

MakeVsBuyScreen.propTypes = {
  data: PropTypes.object,
  openModal: PropTypes.func,
};
