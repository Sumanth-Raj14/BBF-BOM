import PropTypes from "prop-types";

import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import { api } from "../../../api.js";
import { Icon } from "../../globals";
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

// ============ SUPPLIER SCORECARDS ============
//
// CRUD surface for /supplier-scorecards. The backend has had the full set
// (GET list/get, POST, PUT, DELETE) since phase 3, but nothing in the UI
// called it, so a scorecard could only be created straight in the database.
//
// Not to be confused with the read-only "Vendor scorecards" tile on the
// analytics screen (api.analytics.vendorScorecards) — that is a computed
// report over a different endpoint. This screen is the record itself.

const WEIGHT_KEYS = [
  "qualityWeight",
  "deliveryWeight",
  "costWeight",
  "responsivenessWeight",
  "complianceWeight",
];

const SCORE_KEYS = [
  "qualityScore",
  "deliveryScore",
  "costScore",
  "responsivenessScore",
  "complianceScore",
];

// Mirrors the server defaults in SupplierScorecardBase (they sum to 1.0).
const BLANK_FORM = {
  vendorId: "",
  period: "",
  year: String(new Date().getFullYear()),
  quarter: "",
  qualityScore: "0",
  deliveryScore: "0",
  costScore: "0",
  responsivenessScore: "0",
  complianceScore: "0",
  qualityWeight: "0.30",
  deliveryWeight: "0.25",
  costWeight: "0.20",
  responsivenessWeight: "0.15",
  complianceWeight: "0.10",
  weightedScore: "",
  totalOrders: "0",
  onTimeDeliveries: "0",
  defectCount: "0",
  totalUnitsReceived: "0",
  avgLeadTimeDays: "0",
  avgResponseTimeHours: "0",
  trend: "",
  notes: "",
};

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const int = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
};
const fmt = (v, digits = 1) =>
  v == null || v === "" || Number.isNaN(Number(v))
    ? "—"
    : Number(v).toFixed(digits);

// Same thresholds the server uses in _calculate_grade.
function gradeFor(score) {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

const GRADE_TONES = {
  A: "success",
  B: "info",
  C: "warning",
  D: "warning",
  F: "danger",
};

export default function SupplierScorecardsScreen() {
  const [cards, setCards] = React.useState([]);
  const [vendors, setVendors] = React.useState([]);
  const [vendorsFailed, setVendorsFailed] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [editing, setEditing] = React.useState(null);
  const [form, setForm] = React.useState(BLANK_FORM);
  const [weightedTouched, setWeightedTouched] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [busyId, setBusyId] = React.useState(null);
  const [confirmId, setConfirmId] = React.useState(null);
  const [formError, setFormError] = React.useState(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.supplierScorecard.list({ per_page: 200 });
      setCards(Array.isArray(res) ? res : res?.items || res?.data || []);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // Vendors are only needed to label rows and populate the picker — a failure
  // here must not blank the scorecard list, so it is loaded separately and
  // degrades to a plain numeric vendorId input.
  const loadVendors = React.useCallback(async () => {
    try {
      const res = await api.vendors.list({ per_page: 200 });
      const list = Array.isArray(res) ? res : res?.items || res?.data || [];
      setVendors(list);
      setVendorsFailed(false);
    } catch {
      setVendors([]);
      setVendorsFailed(true);
    }
  }, []);

  React.useEffect(() => {
    load();
    loadVendors();
  }, [load, loadVendors]);

  const vendorName = (id) => {
    const v = vendors.find((x) => String(x.id) === String(id));
    return v ? v.name || v.code || `#${id}` : id == null ? "—" : `#${id}`;
  };

  const setField = (key, value) => {
    if (key === "weightedScore") setWeightedTouched(true);
    setForm((f) => ({ ...f, [key]: value }));
  };

  const weightTotal = WEIGHT_KEYS.reduce((sum, k) => sum + num(form[k]), 0);
  const weightsOnUnitScale = Math.abs(weightTotal - 1) < 0.001;
  const weightsOnPercentScale = Math.abs(weightTotal - 100) < 0.01;
  const weightsValid = weightsOnUnitScale || weightsOnPercentScale;

  // Computed exactly the way the server computes it (raw Σ score × weight),
  // so the preview cannot disagree with what gets stored.
  const computedWeighted = SCORE_KEYS.reduce(
    (sum, k, i) => sum + num(form[k]) * num(form[WEIGHT_KEYS[i]]),
    0,
  );
  const weightedValue = weightedTouched
    ? form.weightedScore
    : computedWeighted.toFixed(2);

  const openCreate = () => {
    setEditing(null);
    setForm(BLANK_FORM);
    setWeightedTouched(false);
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    setForm({
      ...BLANK_FORM,
      ...Object.keys(BLANK_FORM).reduce((acc, k) => {
        acc[k] = row[k] == null ? BLANK_FORM[k] : String(row[k]);
        return acc;
      }, {}),
    });
    setWeightedTouched(false);
    setFormError(null);
    setModalOpen(true);
  };

  const save = async () => {
    if (!editing) {
      if (!String(form.vendorId).trim()) {
        setFormError(__t("scorecards.vendorRequired") || "Vendor is required.");
        return;
      }
      if (!form.period.trim()) {
        setFormError(__t("scorecards.periodRequired") || "Period is required.");
        return;
      }
      if (!String(form.year).trim() || !Number.isFinite(parseInt(form.year, 10))) {
        setFormError(__t("scorecards.yearRequired") || "Year is required.");
        return;
      }
    }
    setFormError(null);
    setSaving(true);

    const shared = {
      qualityScore: num(form.qualityScore),
      deliveryScore: num(form.deliveryScore),
      costScore: num(form.costScore),
      responsivenessScore: num(form.responsivenessScore),
      complianceScore: num(form.complianceScore),
      qualityWeight: num(form.qualityWeight),
      deliveryWeight: num(form.deliveryWeight),
      costWeight: num(form.costWeight),
      responsivenessWeight: num(form.responsivenessWeight),
      complianceWeight: num(form.complianceWeight),
      weightedScore: num(weightedValue),
      totalOrders: int(form.totalOrders),
      onTimeDeliveries: int(form.onTimeDeliveries),
      defectCount: int(form.defectCount),
      totalUnitsReceived: int(form.totalUnitsReceived),
      avgLeadTimeDays: num(form.avgLeadTimeDays),
      avgResponseTimeHours: num(form.avgResponseTimeHours),
      trend: form.trend || null,
      notes: form.notes || null,
    };

    try {
      if (editing) {
        // Vendor / period / year / quarter are not in SupplierScorecardUpdate,
        // so they are not sent (and are locked in the form).
        await api.supplierScorecard.update(editing.id, shared);
        toast(__t("scorecards.updated") || "Scorecard updated", {
          kind: "success",
        });
      } else {
        await api.supplierScorecard.create({
          vendorId: int(form.vendorId),
          period: form.period.trim(),
          year: int(form.year),
          quarter: form.quarter === "" ? null : int(form.quarter),
          ...shared,
        });
        toast(__t("scorecards.created") || "Scorecard created", {
          kind: "success",
        });
      }
      setModalOpen(false);
      await load();
    } catch (e) {
      const msg = e?.message || String(e);
      setFormError(msg);
      toast(
        (__t("scorecards.saveFailed") || "Could not save scorecard") +
          ": " +
          msg,
        { kind: "error" },
      );
    } finally {
      setSaving(false);
    }
  };

  // Two-step delete: the first click arms the row, the second performs it.
  const remove = async (row) => {
    if (confirmId !== row.id) {
      setConfirmId(row.id);
      return;
    }
    setBusyId(row.id);
    try {
      await api.supplierScorecard.delete(row.id);
      toast(__t("scorecards.deleted") || "Scorecard deleted", {
        kind: "success",
      });
      await load();
    } catch (e) {
      toast(
        (__t("scorecards.deleteFailed") || "Could not delete scorecard") +
          ": " +
          (e?.message || String(e)),
        { kind: "error" },
      );
    } finally {
      setBusyId(null);
      setConfirmId(null);
    }
  };

  const scoreCol = (key, header) => ({
    key,
    header,
    align: "num",
    render: (row) => fmt(row[key]),
  });

  const columns = [
    {
      key: "vendor",
      header: __t("scorecards.vendor") || "Vendor",
      render: (row) => (
        <div>
          <div className="scorecards__vendor">{vendorName(row.vendorId)}</div>
          {row.trend && <div className="scorecards__trend">{row.trend}</div>}
        </div>
      ),
    },
    {
      key: "period",
      header: __t("scorecards.period") || "Period",
      render: (row) => (
        <div>
          <div className="scorecards__period">{row.period || "—"}</div>
          <div className="scorecards__year">
            {row.year}
            {row.quarter ? ` · Q${row.quarter}` : ""}
          </div>
        </div>
      ),
    },
    scoreCol("qualityScore", __t("scorecards.quality") || "Quality"),
    scoreCol("deliveryScore", __t("scorecards.delivery") || "Delivery"),
    scoreCol("costScore", __t("scorecards.cost") || "Cost"),
    scoreCol(
      "responsivenessScore",
      __t("scorecards.responsiveness") || "Respons.",
    ),
    scoreCol("complianceScore", __t("scorecards.compliance") || "Compliance"),
    {
      key: "weightedScore",
      header: __t("scorecards.weighted") || "Weighted",
      align: "num",
      render: (row) => (
        <strong className="scorecards__weighted">
          {fmt(row.weightedScore, 2)}
        </strong>
      ),
    },
    {
      key: "grade",
      header: __t("scorecards.grade") || "Grade",
      render: (row) =>
        row.grade ? (
          <StatusPill
            tone={GRADE_TONES[String(row.grade).toUpperCase()] || "neutral"}
            label={row.grade}
          />
        ) : (
          "—"
        ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (row) => (
        <div className="scorecards__row-actions">
          <Button
            variant="secondary"
            disabled={busyId === row.id}
            onClick={() => openEdit(row)}
          >
            {__t("common.edit") || "Edit"}
          </Button>
          <Button
            variant="secondary"
            disabled={busyId === row.id}
            onClick={() => remove(row)}
          >
            {confirmId === row.id
              ? __t("scorecards.confirmDelete") || "Confirm delete"
              : __t("common.delete") || "Delete"}
          </Button>
        </div>
      ),
    },
  ];

  const numberField = (key, label, step = "1") => (
    <Field key={key} label={label}>
      <Input
        type="number"
        step={step}
        name={key}
        value={form[key]}
        onChange={(e) => setField(key, e.target.value)}
      />
    </Field>
  );

  return (
    <div className="scorecards">
      <ScreenHeader
        title={__t("scorecards.title") || "Supplier Scorecards"}
        description={
          __t("scorecards.subtitle") ||
          "Record and maintain periodic performance scorecards for each vendor"
        }
      />

      <div className="scorecards__toolbar">
        <Button variant="secondary" onClick={load} disabled={loading}>
          <Icon.Refresh size={12} /> {__t("common.refresh") || "Refresh"}
        </Button>
        <Button onClick={openCreate}>
          <Icon.Plus size={12} />{" "}
          {__t("scorecards.new") || "New scorecard"}
        </Button>
      </div>

      {loading && (
        <div className="scorecards__state" role="status">
          {__t("common.loading") || "Loading…"}
        </div>
      )}

      {!loading && error && (
        <div className="scorecards__state scorecards__state--error" role="alert">
          {(__t("scorecards.loadFailed") || "Could not load scorecards") +
            ": " +
            error}
        </div>
      )}

      {!loading && !error && cards.length === 0 && (
        <EmptyState
          title={__t("scorecards.emptyTitle") || "No scorecards yet"}
          message={
            __t("scorecards.empty") ||
            "No supplier scorecard has been recorded. Create one to start tracking vendor performance."
          }
        />
      )}

      {!loading && !error && cards.length > 0 && (
        <DataTable
          columns={columns}
          rows={cards}
          getRowKey={(row) => row.id}
          ariaLabel={__t("scorecards.tableLabel") || "Supplier scorecards"}
          dense
        />
      )}

      <Modal
        open={modalOpen}
        onClose={() => (saving ? null : setModalOpen(false))}
        size="lg"
        title={
          editing
            ? (__t("scorecards.editTitle") || "Edit scorecard") +
              " · " +
              vendorName(editing.vendorId)
            : __t("scorecards.createTitle") || "New supplier scorecard"
        }
        subtitle={
          __t("scorecards.modalSubtitle") ||
          "Scores are on a 0–100 scale; weights must total 1 (or 100)."
        }
        footer={
          <div className="scorecards__footer">
            <Button
              variant="secondary"
              onClick={() => setModalOpen(false)}
              disabled={saving}
            >
              {__t("common.cancel") || "Cancel"}
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving
                ? __t("common.saving") || "Saving…"
                : editing
                  ? __t("common.saveChanges") || "Save changes"
                  : __t("scorecards.create") || "Create scorecard"}
            </Button>
          </div>
        }
      >
        <div className="scorecards__form">
          <div className="scorecards__grid">
            <Field
              label={__t("scorecards.vendor") || "Vendor"}
              required={!editing}
              hint={
                editing
                  ? __t("scorecards.vendorLocked") ||
                    "Vendor cannot be changed after creation."
                  : vendorsFailed
                    ? __t("scorecards.vendorsUnavailable") ||
                      "Vendor list unavailable — enter the vendor ID."
                    : undefined
              }
            >
              {vendors.length > 0 && !editing ? (
                <Select
                  name="vendorId"
                  value={form.vendorId}
                  onChange={(e) => setField("vendorId", e.target.value)}
                >
                  <option value="">
                    {__t("scorecards.selectVendor") || "Select a vendor…"}
                  </option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name || `#${v.id}`}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  type="number"
                  step="1"
                  name="vendorId"
                  value={form.vendorId}
                  disabled={!!editing}
                  onChange={(e) => setField("vendorId", e.target.value)}
                />
              )}
            </Field>

            <Field
              label={__t("scorecards.period") || "Period"}
              required={!editing}
              hint={
                editing
                  ? __t("scorecards.periodLocked") ||
                    "Period cannot be changed after creation."
                  : "e.g. 2026-Q1"
              }
            >
              <Input
                name="period"
                value={form.period}
                disabled={!!editing}
                onChange={(e) => setField("period", e.target.value)}
              />
            </Field>

            <Field label={__t("scorecards.year") || "Year"} required={!editing}>
              <Input
                type="number"
                step="1"
                name="year"
                value={form.year}
                disabled={!!editing}
                onChange={(e) => setField("year", e.target.value)}
              />
            </Field>

            <Field label={__t("scorecards.quarter") || "Quarter"}>
              <Input
                type="number"
                step="1"
                min="1"
                max="4"
                name="quarter"
                value={form.quarter}
                disabled={!!editing}
                onChange={(e) => setField("quarter", e.target.value)}
              />
            </Field>
          </div>

          <h3 className="scorecards__section">
            {__t("scorecards.scoresSection") || "Scores & weights"}
          </h3>
          <div className="scorecards__grid scorecards__grid--pairs">
            {SCORE_KEYS.flatMap((sk, i) => [
              numberField(
                sk,
                __t(`scorecards.${sk}`) ||
                  `${sk.replace("Score", "").replace(/^./, (c) => c.toUpperCase())} score`,
                "0.1",
              ),
              numberField(
                WEIGHT_KEYS[i],
                __t(`scorecards.${WEIGHT_KEYS[i]}`) ||
                  `${sk.replace("Score", "").replace(/^./, (c) => c.toUpperCase())} weight`,
                "0.01",
              ),
            ])}
          </div>

          <div
            className={
              "scorecards__weights" +
              (weightsValid ? "" : " scorecards__weights--bad")
            }
            role={weightsValid ? undefined : "alert"}
          >
            {(__t("scorecards.weightTotal") || "Weight total") +
              ": " +
              String(Number(weightTotal.toFixed(4)))}
            {!weightsValid &&
              " — " +
                (__t("scorecards.weightTotalBad") ||
                  "weights must sum to 1 (or 100). Until they do, the weighted score below is not a meaningful 0–100 value.")}
            {weightsOnPercentScale &&
              " — " +
                (__t("scorecards.weightPercentScale") ||
                  "weights are on a 0–100 scale, and the server multiplies them as-is, so the stored weighted score will be 100× the 0–100 figure.")}
          </div>

          <div className="scorecards__grid">
            <Field
              label={__t("scorecards.weighted") || "Weighted score"}
              hint={
                (__t("scorecards.weightedHint") ||
                  "Computed live from the scores × weights. You can type over it, but the server recomputes weightedScore and grade on save.") +
                (weightedTouched
                  ? " " +
                    (__t("scorecards.weightedComputedIs") || "Computed:") +
                    " " +
                    computedWeighted.toFixed(2)
                  : "")
              }
            >
              <Input
                type="number"
                step="0.01"
                name="weightedScore"
                value={weightedValue}
                onChange={(e) => setField("weightedScore", e.target.value)}
              />
            </Field>

            <Field
              label={__t("scorecards.gradePreview") || "Grade (server will set)"}
              hint={
                __t("scorecards.gradeHint") ||
                "Derived from the computed weighted score."
              }
            >
              <div className="scorecards__grade-preview">
                <StatusPill
                  tone={GRADE_TONES[gradeFor(computedWeighted)]}
                  label={gradeFor(computedWeighted)}
                />
                <span className="scorecards__grade-num">
                  {computedWeighted.toFixed(2)}
                </span>
              </div>
            </Field>
          </div>

          <h3 className="scorecards__section">
            {__t("scorecards.statsSection") || "Delivery & quality stats"}
          </h3>
          <div className="scorecards__grid">
            {numberField(
              "totalOrders",
              __t("scorecards.totalOrders") || "Total orders",
            )}
            {numberField(
              "onTimeDeliveries",
              __t("scorecards.onTimeDeliveries") || "On-time deliveries",
            )}
            {numberField(
              "defectCount",
              __t("scorecards.defectCount") || "Defect count",
            )}
            {numberField(
              "totalUnitsReceived",
              __t("scorecards.totalUnitsReceived") || "Units received",
            )}
            {numberField(
              "avgLeadTimeDays",
              __t("scorecards.avgLeadTimeDays") || "Avg lead time (days)",
              "0.1",
            )}
            {numberField(
              "avgResponseTimeHours",
              __t("scorecards.avgResponseTimeHours") ||
                "Avg response time (hours)",
              "0.1",
            )}
          </div>

          <div className="scorecards__grid">
            <Field label={__t("scorecards.trend") || "Trend"}>
              <Select
                name="trend"
                value={form.trend}
                onChange={(e) => setField("trend", e.target.value)}
              >
                <option value="">{__t("scorecards.noTrend") || "—"}</option>
                <option value="improving">
                  {__t("scorecards.improving") || "Improving"}
                </option>
                <option value="stable">
                  {__t("scorecards.stable") || "Stable"}
                </option>
                <option value="declining">
                  {__t("scorecards.declining") || "Declining"}
                </option>
              </Select>
            </Field>
          </div>

          <Field label={__t("scorecards.notes") || "Notes"}>
            <Textarea
              name="notes"
              rows={3}
              value={form.notes}
              onChange={(e) => setField("notes", e.target.value)}
            />
          </Field>

          {formError && (
            <div className="scorecards__form-error" role="alert">
              {formError}
            </div>
          )}
        </div>
      </Modal>

      <style>{`
        .scorecards__toolbar {
          display: flex;
          gap: var(--sp-2);
          align-items: center;
          justify-content: flex-end;
          margin-bottom: var(--sp-3);
        }
        .scorecards__vendor { font-weight: var(--fw-medium); color: var(--text-primary); }
        .scorecards__trend,
        .scorecards__year { font-size: var(--fs-075); color: var(--text-muted); }
        .scorecards__period { color: var(--text-primary); }
        .scorecards__weighted { color: var(--text-primary); }
        .scorecards__row-actions {
          display: inline-flex;
          gap: var(--sp-2);
          justify-content: flex-end;
        }
        .scorecards__state {
          padding: var(--sp-5);
          text-align: center;
          color: var(--text-secondary);
          font-size: var(--fs-100);
        }
        .scorecards__state--error { color: var(--danger-text, #b42318); }
        .scorecards__form {
          display: flex;
          flex-direction: column;
          gap: var(--sp-3);
        }
        .scorecards__grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: var(--sp-3);
        }
        .scorecards__grid--pairs {
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        }
        .scorecards__section {
          margin: var(--sp-2) 0 0;
          font-size: var(--fs-100);
          font-weight: var(--fw-medium);
          color: var(--text-secondary);
        }
        .scorecards__weights {
          font-size: var(--fs-075);
          color: var(--text-secondary);
        }
        .scorecards__weights--bad { color: var(--danger-text, #b42318); }
        .scorecards__grade-preview {
          display: flex;
          align-items: center;
          gap: var(--sp-2);
          min-height: var(--control-h);
        }
        .scorecards__grade-num { font-size: var(--fs-075); color: var(--text-muted); }
        .scorecards__footer {
          display: flex;
          gap: var(--sp-2);
          justify-content: flex-end;
        }
        .scorecards__form-error {
          font-size: var(--fs-075);
          color: var(--danger-text, #b42318);
        }
      `}</style>
    </div>
  );
}

SupplierScorecardsScreen.propTypes = {
  data: PropTypes.object,
  openModal: PropTypes.func,
};
