import PropTypes from "prop-types";

import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import { api } from "../../../api.js";
import { Icon } from "../../globals";
import {
  Button,
  Checkbox,
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

// ============ SUPPLIER CONTRACTS ============
//
// GET/POST /contracts and PUT/DELETE /contracts/{id} have always existed, but
// nothing in the UI called them, so a blanket PO or long-term agreement could
// only be created by writing to the database. This screen is that missing
// surface: list, create, edit, delete.
//
// Expiry note: the API has no "isExpired" field, so it is derived here from
// expirationDate. A contract whose date has passed while its status still says
// Active is flagged, because that mismatch is what burns a buyer.
//
// Scope note: pricing agreements (api.contract.pricing / *PricingAgreement)
// are a separate per-part concern and are not managed here.

// Values documented on the Contract model (status / contractType columns).
const STATUSES = ["Draft", "Active", "Suspended", "Expired", "Terminated"];
// These are the EXACT values the database CHECK constraint allows
// (contracts."contractType" IN ('blanket_po','volume_discount','annual',
// 'fixed_price','other')). Sending anything else — including a nicer-looking
// "Blanket PO" — fails the constraint and the API returns 500, so the label
// shown to the user and the value sent to the server are kept separate here.
const CONTRACT_TYPES = [
  { value: "blanket_po", label: "Blanket PO" },
  { value: "volume_discount", label: "Volume Discount" },
  { value: "annual", label: "Annual Agreement" },
  { value: "fixed_price", label: "Fixed Price" },
  { value: "other", label: "Other" },
];

const EMPTY_FORM = {
  contractNumber: "",
  title: "",
  vendorId: "",
  contractType: "",
  effectiveDate: "",
  expirationDate: "",
  autoRenew: false,
  paymentTerms: "",
  minimumOrderQty: "",
  maximumOrderValue: "",
  currency: "USD",
  leadTimeDays: "",
  qualityRequirements: "",
  status: "Draft",
};

// The API returns ISO datetimes; <input type="date"> wants YYYY-MM-DD.
const toDateInput = (v) => (v ? String(v).slice(0, 10) : "");
const fmtDate = (v) => (v ? String(v).slice(0, 10) : "—");

const expiryDate = (row) => {
  if (!row?.expirationDate) return null;
  const d = new Date(row.expirationDate);
  return Number.isNaN(d.getTime()) ? null : d;
};
const isExpired = (row) => {
  const d = expiryDate(row);
  return !!d && d.getTime() < Date.now();
};

const numOrNull = (v) => (v === "" || v == null ? null : Number(v));
const strOrNull = (v) => {
  const s = String(v ?? "").trim();
  return s || null;
};

export default function ContractsScreen() {
  const [contracts, setContracts] = React.useState([]);
  const [vendors, setVendors] = React.useState([]);
  const [vendorsUnavailable, setVendorsUnavailable] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [search, setSearch] = React.useState("");
  const [expiredOnly, setExpiredOnly] = React.useState(false);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [editing, setEditing] = React.useState(null);
  const [form, setForm] = React.useState(EMPTY_FORM);
  const [formError, setFormError] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [confirmId, setConfirmId] = React.useState(null);
  const [deletingId, setDeletingId] = React.useState(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Vendors are only used to label/pick a supplier, so a failure there
      // degrades the form to a raw id input instead of failing the screen.
      const [res, vendorRes] = await Promise.all([
        api.contract.list({ per_page: 200 }),
        api.vendors.list({ per_page: 500 }).catch(() => null),
      ]);
      setContracts(res?.items || res?.data || []);
      if (vendorRes == null) {
        setVendors([]);
        setVendorsUnavailable(true);
      } else {
        setVendors(vendorRes?.items || vendorRes?.data || []);
        setVendorsUnavailable(false);
      }
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const vendorName = (id) => {
    const v = vendors.find((x) => String(x.id) === String(id));
    return v?.name || (id != null ? `#${id}` : "—");
  };

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    setForm({
      contractNumber: row.contractNumber || "",
      title: row.title || "",
      vendorId: row.vendorId ?? "",
      contractType: row.contractType || "",
      effectiveDate: toDateInput(row.effectiveDate),
      expirationDate: toDateInput(row.expirationDate),
      autoRenew: !!row.autoRenew,
      paymentTerms: row.paymentTerms || "",
      minimumOrderQty: row.minimumOrderQty ?? "",
      maximumOrderValue: row.maximumOrderValue ?? "",
      currency: row.currency || "USD",
      leadTimeDays: row.leadTimeDays ?? "",
      qualityRequirements: row.qualityRequirements || "",
      status: row.status || "Draft",
    });
    setFormError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
    setEditing(null);
    setFormError(null);
  };

  // ContractUpdate accepts only these keys; contractNumber, vendorId and
  // currency are create-only on the backend, so edit never sends them.
  const editablePayload = () => ({
    title: form.title.trim(),
    contractType: strOrNull(form.contractType),
    effectiveDate: strOrNull(form.effectiveDate),
    expirationDate: strOrNull(form.expirationDate),
    autoRenew: !!form.autoRenew,
    paymentTerms: strOrNull(form.paymentTerms),
    minimumOrderQty: numOrNull(form.minimumOrderQty),
    maximumOrderValue: numOrNull(form.maximumOrderValue),
    leadTimeDays: numOrNull(form.leadTimeDays),
    qualityRequirements: strOrNull(form.qualityRequirements),
    status: form.status,
  });

  const submit = async (e) => {
    e.preventDefault();
    if (!form.contractNumber.trim() || !form.title.trim() || !form.vendorId) {
      setFormError(
        __t("contracts.requiredFields") ||
          "Contract number, title and supplier are required.",
      );
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await api.contract.update(editing.id, editablePayload());
      } else {
        await api.contract.create({
          ...editablePayload(),
          contractNumber: form.contractNumber.trim(),
          vendorId: Number(form.vendorId),
          currency: strOrNull(form.currency) || "USD",
        });
      }
      toast(
        (editing
          ? __t("contracts.updated") || "Contract updated"
          : __t("contracts.created") || "Contract created") +
          ": " +
          form.contractNumber.trim(),
        { kind: "success" },
      );
      setModalOpen(false);
      setEditing(null);
      await load();
    } catch (err) {
      const msg = err?.message || String(err);
      setFormError(msg);
      toast(
        (__t("contracts.saveFailed") || "Could not save contract") + ": " + msg,
        { kind: "error" },
      );
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row) => {
    setDeletingId(row.id);
    try {
      await api.contract.delete(row.id);
      toast(
        (__t("contracts.deleted") || "Contract deleted") +
          ": " +
          (row.contractNumber || row.id),
        { kind: "success" },
      );
      await load();
    } catch (e) {
      toast(
        (__t("contracts.deleteFailed") || "Could not delete contract") +
          ": " +
          (e?.message || String(e)),
        { kind: "error" },
      );
    } finally {
      setDeletingId(null);
      setConfirmId(null);
    }
  };

  // Past expiry but still presented as live — the case worth surfacing.
  const staleActive = contracts.filter(
    (c) => isExpired(c) && !["Expired", "Terminated"].includes(c.status),
  );

  const filtered = contracts.filter((c) => {
    if (expiredOnly && !isExpired(c)) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [
      c.contractNumber,
      c.title,
      c.contractType,
      c.status,
      vendorName(c.vendorId),
    ]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q));
  });

  const columns = [
    {
      key: "contractNumber",
      header: __t("contracts.number") || "Contract",
      render: (row) => (
        <div>
          <div className="contracts__number">{row.contractNumber || "—"}</div>
          <div className="contracts__title">{row.title}</div>
        </div>
      ),
    },
    {
      key: "vendorId",
      header: __t("contracts.supplier") || "Supplier",
      render: (row) => vendorName(row.vendorId),
    },
    {
      key: "contractType",
      header: __t("contracts.type") || "Type",
      // Show the label, not the raw enum token the DB stores.
      render: (row) =>
        CONTRACT_TYPES.find((t) => t.value === row.contractType)?.label ||
        row.contractType ||
        "—",
    },
    {
      key: "effectiveDate",
      header: __t("contracts.effective") || "Effective",
      render: (row) => fmtDate(row.effectiveDate),
    },
    {
      key: "expirationDate",
      header: __t("contracts.expires") || "Expires",
      render: (row) => (
        <span className={isExpired(row) ? "contracts__date--expired" : undefined}>
          {fmtDate(row.expirationDate)}
          {row.autoRenew && (
            <span className="contracts__renew">
              {" "}
              {__t("contracts.autoRenew") || "auto-renew"}
            </span>
          )}
        </span>
      ),
    },
    {
      key: "status",
      header: __t("contracts.status") || "Status",
      render: (row) => (
        <span className="contracts__status">
          <StatusPill status={row.status || "Draft"} />
          {isExpired(row) && !["Expired", "Terminated"].includes(row.status) && (
            <StatusPill
              tone="danger"
              label={__t("contracts.expired") || "Past expiry"}
            />
          )}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (row) => (
        <span className="contracts__actions">
          <Button
            variant="secondary"
            size="sm"
            disabled={deletingId === row.id}
            onClick={() => openEdit(row)}
          >
            <Icon.Edit size={12} /> {__t("common.edit") || "Edit"}
          </Button>
          {confirmId === row.id ? (
            <>
              <Button
                variant="danger"
                size="sm"
                loading={deletingId === row.id}
                onClick={() => remove(row)}
              >
                {__t("common.confirm") || "Confirm"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={deletingId === row.id}
                onClick={() => setConfirmId(null)}
              >
                {__t("common.cancel") || "Cancel"}
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              disabled={deletingId != null}
              onClick={() => setConfirmId(row.id)}
            >
              <Icon.Trash size={12} /> {__t("common.delete") || "Delete"}
            </Button>
          )}
        </span>
      ),
    },
  ];

  return (
    <div className="contracts">
      <ScreenHeader
        title={__t("contracts.title") || "Supplier Contracts"}
        description={
          __t("contracts.subtitle") ||
          "Blanket POs, volume agreements and the terms they carry"
        }
      />

      <div className="contracts__toolbar">
        <input
          id="contracts-search"
          name="contractsSearch"
          type="search"
          className="contracts__search"
          placeholder={__t("contracts.search") || "Search contracts…"}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label={__t("contracts.search") || "Search contracts"}
        />
        <Button variant="secondary" onClick={load} disabled={loading}>
          <Icon.Refresh size={12} /> {__t("common.refresh") || "Refresh"}
        </Button>
        <Button variant="primary" onClick={openCreate} disabled={loading}>
          <Icon.Plus size={12} /> {__t("contracts.new") || "New contract"}
        </Button>
      </div>

      {!loading && !error && staleActive.length > 0 && (
        <div className="contracts__banner" role="status">
          <span>
            {staleActive.length}{" "}
            {__t("contracts.staleWarning") ||
              "contract(s) are past their expiration date but not marked Expired."}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setExpiredOnly((v) => !v)}
          >
            {expiredOnly
              ? __t("contracts.showAll") || "Show all"
              : __t("contracts.showExpired") || "Show expired only"}
          </Button>
        </div>
      )}

      {loading && (
        <div className="contracts__state" role="status">
          {__t("common.loading") || "Loading…"}
        </div>
      )}

      {!loading && error && (
        <div className="contracts__state contracts__state--error" role="alert">
          {(__t("contracts.loadFailed") || "Could not load contracts") +
            ": " +
            error}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <EmptyState
          title={__t("contracts.emptyTitle") || "No contracts found"}
          message={
            search || expiredOnly
              ? __t("contracts.emptyFilter") ||
                "No contract matches the current search or filter."
              : __t("contracts.empty") ||
                "No supplier contracts have been recorded yet."
          }
        />
      )}

      {!loading && !error && filtered.length > 0 && (
        <DataTable
          columns={columns}
          rows={filtered}
          getRowKey={(row) => row.id}
          ariaLabel={__t("contracts.tableLabel") || "Supplier contracts"}
          dense
        />
      )}

      <Modal
        open={modalOpen}
        onClose={closeModal}
        size="lg"
        title={
          editing
            ? __t("contracts.editTitle") || "Edit contract"
            : __t("contracts.newTitle") || "New contract"
        }
        subtitle={
          editing
            ? __t("contracts.editSubtitle") ||
              "Contract number and supplier are fixed once the contract exists"
            : __t("contracts.newSubtitle") ||
              "Record a supplier agreement and the terms it carries"
        }
        footer={
          <>
            <Button variant="ghost" onClick={closeModal} disabled={saving}>
              {__t("common.cancel") || "Cancel"}
            </Button>
            <Button
              variant="primary"
              type="submit"
              form="contracts-form"
              loading={saving}
            >
              {editing
                ? __t("common.save") || "Save"
                : __t("contracts.create") || "Create contract"}
            </Button>
          </>
        }
      >
        <form id="contracts-form" onSubmit={submit} className="contracts__form">
          {formError && (
            <div className="contracts__form-error" role="alert">
              {formError}
            </div>
          )}

          <div className="contracts__grid">
            <Field
              label={__t("contracts.number") || "Contract number"}
              required
              hint={
                editing
                  ? __t("contracts.numberLocked") ||
                    "Cannot be changed after creation"
                  : undefined
              }
            >
              <Input
                name="contractNumber"
                value={form.contractNumber}
                disabled={!!editing || saving}
                placeholder="CTR-2026-001"
                onChange={(e) => setField("contractNumber", e.target.value)}
              />
            </Field>

            <Field label={__t("contracts.titleField") || "Title"} required>
              <Input
                name="title"
                value={form.title}
                disabled={saving}
                onChange={(e) => setField("title", e.target.value)}
              />
            </Field>

            <Field
              label={__t("contracts.supplier") || "Supplier"}
              required
              hint={
                vendorsUnavailable
                  ? __t("contracts.vendorFallback") ||
                    "Supplier list unavailable — enter the vendor id"
                  : editing
                    ? __t("contracts.supplierLocked") ||
                      "Cannot be changed after creation"
                    : undefined
              }
            >
              {vendorsUnavailable ? (
                <Input
                  name="vendorId"
                  type="number"
                  min="1"
                  value={form.vendorId}
                  disabled={!!editing || saving}
                  onChange={(e) => setField("vendorId", e.target.value)}
                />
              ) : (
                <Select
                  name="vendorId"
                  value={form.vendorId}
                  disabled={!!editing || saving}
                  onChange={(e) => setField("vendorId", e.target.value)}
                >
                  <option value="">
                    {__t("contracts.selectSupplier") || "Select a supplier…"}
                  </option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label={__t("contracts.type") || "Contract type"}>
              <Select
                name="contractType"
                value={form.contractType}
                disabled={saving}
                onChange={(e) => setField("contractType", e.target.value)}
              >
                <option value="">{__t("common.none") || "—"}</option>
                {CONTRACT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label={__t("contracts.effective") || "Effective date"}>
              <Input
                name="effectiveDate"
                type="date"
                value={form.effectiveDate}
                disabled={saving}
                onChange={(e) => setField("effectiveDate", e.target.value)}
              />
            </Field>

            <Field label={__t("contracts.expires") || "Expiration date"}>
              <Input
                name="expirationDate"
                type="date"
                value={form.expirationDate}
                disabled={saving}
                onChange={(e) => setField("expirationDate", e.target.value)}
              />
            </Field>

            <Field label={__t("contracts.paymentTerms") || "Payment terms"}>
              <Input
                name="paymentTerms"
                value={form.paymentTerms}
                disabled={saving}
                placeholder="Net 30"
                onChange={(e) => setField("paymentTerms", e.target.value)}
              />
            </Field>

            <Field label={__t("contracts.currency") || "Currency"}>
              <Input
                name="currency"
                value={form.currency}
                maxLength={8}
                disabled={!!editing || saving}
                onChange={(e) => setField("currency", e.target.value)}
              />
            </Field>

            <Field label={__t("contracts.minQty") || "Minimum order qty"}>
              <Input
                name="minimumOrderQty"
                type="number"
                min="0"
                value={form.minimumOrderQty}
                disabled={saving}
                onChange={(e) => setField("minimumOrderQty", e.target.value)}
              />
            </Field>

            <Field label={__t("contracts.maxValue") || "Maximum order value"}>
              <Input
                name="maximumOrderValue"
                type="number"
                min="0"
                step="0.01"
                value={form.maximumOrderValue}
                disabled={saving}
                onChange={(e) => setField("maximumOrderValue", e.target.value)}
              />
            </Field>

            <Field label={__t("contracts.leadTime") || "Lead time (days)"}>
              <Input
                name="leadTimeDays"
                type="number"
                min="0"
                value={form.leadTimeDays}
                disabled={saving}
                onChange={(e) => setField("leadTimeDays", e.target.value)}
              />
            </Field>

            <Field label={__t("contracts.status") || "Status"}>
              <Select
                name="status"
                value={form.status}
                disabled={saving}
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

          <Checkbox
            name="autoRenew"
            label={__t("contracts.autoRenewLabel") || "Auto-renew on expiry"}
            checked={form.autoRenew}
            disabled={saving}
            onChange={(e) => setField("autoRenew", e.target.checked)}
          />

          <Field
            label={__t("contracts.quality") || "Quality requirements"}
          >
            <Textarea
              name="qualityRequirements"
              rows={3}
              value={form.qualityRequirements}
              disabled={saving}
              onChange={(e) => setField("qualityRequirements", e.target.value)}
            />
          </Field>
        </form>
      </Modal>

      <style>{`
        .contracts__toolbar {
          display: flex;
          gap: var(--sp-2);
          align-items: center;
          margin-bottom: var(--sp-3);
        }
        .contracts__search {
          flex: 1;
          height: var(--control-h);
          padding: 0 var(--sp-3);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-sm);
          background: var(--bg-surface);
          color: var(--text-primary);
          font-size: var(--fs-100);
        }
        .contracts__banner {
          display: flex;
          gap: var(--sp-3);
          align-items: center;
          justify-content: space-between;
          padding: var(--sp-2) var(--sp-3);
          margin-bottom: var(--sp-3);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-sm);
          font-size: var(--fs-075);
          color: var(--danger-text, #b42318);
        }
        .contracts__number { font-weight: var(--fw-medium); color: var(--text-primary); }
        .contracts__title { font-size: var(--fs-075); color: var(--text-muted); }
        .contracts__date--expired { color: var(--danger-text, #b42318); font-weight: var(--fw-medium); }
        .contracts__renew { font-size: var(--fs-075); color: var(--text-muted); }
        .contracts__status { display: inline-flex; gap: var(--sp-1); align-items: center; flex-wrap: wrap; }
        .contracts__actions { display: inline-flex; gap: var(--sp-1); justify-content: flex-end; }
        .contracts__state {
          padding: var(--sp-5);
          text-align: center;
          color: var(--text-secondary);
          font-size: var(--fs-100);
        }
        .contracts__state--error { color: var(--danger-text, #b42318); }
        .contracts__form { display: flex; flex-direction: column; gap: var(--sp-3); }
        .contracts__form-error {
          font-size: var(--fs-075);
          color: var(--danger-text, #b42318);
        }
        .contracts__grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: var(--sp-3);
        }
      `}</style>
    </div>
  );
}

ContractsScreen.propTypes = {
  data: PropTypes.object,
  openModal: PropTypes.func,
};
