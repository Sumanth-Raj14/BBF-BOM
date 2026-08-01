import PropTypes from "prop-types";
import { useEffect, useState } from "react";

import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import { Icon, INR } from "../../globals";
import { Badge, Button, EmptyState, Modal, Spinner } from "../ui";
import { api } from "../../../api.js";

const CRITERIA = [
  { label: "Unit price", key: "unit", kind: "money" },
  { label: "Lead time (days)", key: "lead", kind: "days" },
  { label: "MOQ", key: "moq", kind: "num" },
  { label: "Payment terms", key: "terms", kind: "text" },
  { label: "Quality score", key: "quality", kind: "pct" },
  { label: "Free samples?", key: "paid_samples", kind: "bool-inv" },
];

// The RFQ backend (app/api/endpoints/supplier_portal.py) currently returns
// only the RFQ header from getRfq()/listRfqs() — no embedded supplier quotes.
// This mapper is defensive: if/when the backend starts embedding supplier
// responses (e.g. under `responses` or `quotes`), it normalizes whatever
// shape shows up (RfqSupplierResponse-style or a flatter one) into the rows
// this table already knows how to render. Nothing here fabricates a value —
// a row is only produced when a vendor name and a price both exist.
function normalizeQuote(r) {
  if (!r || typeof r !== "object") return null;
  const vendor =
    r.vendor_name || r.supplier_name || r.vendorName || r.vendor || null;
  const unitRaw =
    r.quoted_price ?? r.unit_price ?? r.unitPrice ?? r.unit ?? null;
  const unit = unitRaw != null ? Number(unitRaw) : null;
  if (!vendor || unit == null || Number.isNaN(unit)) return null;
  const leadRaw =
    r.quoted_lead_time_days ?? r.lead_time_days ?? r.leadTime ?? r.lead ?? null;
  return {
    vendor,
    country: r.country || r.vendor_country || null,
    unit,
    qty: r.quantity ?? r.qty ?? null,
    lead: leadRaw != null ? Number(leadRaw) : null,
    moq: r.moq ?? null,
    terms: r.payment_terms || r.terms || null,
    quality: r.quality_score ?? r.quality ?? null,
    rating: r.rating ?? null,
    paid_samples: !!(r.paid_samples ?? r.paidSamples),
    preferred: !!r.preferred,
    supplierId:
      r.vendor_id ?? r.supplier_id ?? r.supplierId ?? r.supplier_user_id ?? null,
  };
}

function RFQCompareModal({ open, onClose, rfqId, rfq: rfqProp }) {
  const [picked, setPicked] = useState(null);
  const [rfq, setRfq] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [awarding, setAwarding] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!open) return;
    setPicked(null);

    if (rfqProp) {
      setRfq(rfqProp);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const load = async () => {
      try {
        let target = null;
        if (rfqId != null) {
          target = await api.supplierPortal.getRfq(rfqId);
        } else {
          const list = await api.supplierPortal.listRfqs();
          const items = Array.isArray(list?.items) ? list.items : [];
          target =
            items.find((r) => r.status === "responded") ||
            items.find((r) => r.status === "sent") ||
            items.find((r) => r.status === "awarded") ||
            items[0] ||
            null;
        }
        if (!cancelled) setRfq(target);
      } catch (err) {
        if (!cancelled) {
          setRfq(null);
          const msg = err?.message || "Failed to load RFQ";
          setError(msg);
          toast(msg, { kind: "error" });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();

    return () => {
      cancelled = true;
    };
  }, [open, rfqId, rfqProp, reloadKey]);

  if (!open) return null;

  const rawQuotes = Array.isArray(rfq?.responses)
    ? rfq.responses
    : Array.isArray(rfq?.quotes)
      ? rfq.quotes
      : [];
  const quotes = rawQuotes.map(normalizeQuote).filter(Boolean);
  const hasQuotes = quotes.length > 0;

  const best = hasQuotes
    ? {
        unit: Math.min(...quotes.map((q) => q.unit)),
        lead: quotes.some((q) => q.lead != null)
          ? Math.min(...quotes.filter((q) => q.lead != null).map((q) => q.lead))
          : null,
        quality: quotes.some((q) => q.quality != null)
          ? Math.max(
              ...quotes.filter((q) => q.quality != null).map((q) => q.quality),
            )
          : null,
      }
    : { unit: null, lead: null, quality: null };

  const pickedQuote = quotes.find((q) => q.vendor === picked) || null;

  const handleAward = async () => {
    if (!pickedQuote || !rfq?.id || awarding) return;
    if (pickedQuote.supplierId == null) {
      toast(
        __t("advanced.rfqCompare.noSupplierId") ||
          "Cannot award: this quote has no linked supplier id",
        { kind: "error" },
      );
      return;
    }
    setAwarding(true);
    try {
      await api.supplierPortal.awardRfq(rfq.id, pickedQuote.supplierId);
      onClose();
      toast(
        (__t("advanced.rfqCompare.awarded") || "Awarded RFQ to") +
          " " +
          picked,
        { kind: "success" },
      );
    } catch (err) {
      toast(
        (__t("advanced.rfqCompare.awardFailed") || "Failed to award RFQ") +
          ": " +
          (err?.message || "unknown error"),
        { kind: "error" },
      );
    } finally {
      setAwarding(false);
    }
  };

  const subtitle = rfq
    ? `${rfq.rfq_number ? rfq.rfq_number + " · " : ""}${rfq.title || ""} · ${quotes.length} response${quotes.length === 1 ? "" : "s"} received`
    : loading
      ? "Loading RFQ…"
      : "No RFQ available to compare";

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Diff size={16} />}
      title={__t("advanced.rfqCompare.title") || "RFQ Comparison"}
      subtitle={subtitle}
      size="xl"
      footer={
        <>
          <span
            className="font-mono fs-10 fg-3"
            style={{ marginRight: "auto" }}
          >
            {hasQuotes
              ? `Best quote: ${INR(best.unit, 2)}`
              : rfq?.response_deadline
                ? `Response deadline: ${rfq.response_deadline}`
                : "No quotes recorded yet"}
          </span>
          <Button variant="secondary" onClick={onClose}>
            {__t("common.cancel") || "Cancel"}
          </Button>
          <Button
            variant="primary"
            disabled={!picked || awarding}
            onClick={handleAward}
          >
            {awarding ? "Awarding…" : `Award to ${picked || "vendor"}`}
          </Button>
        </>
      }
    >
      {loading && (
        <div className="text-center" style={{ padding: 60 }}>
          <Spinner size="lg" label="Loading RFQ" />
          <div className="font-mono fs-11 fg-3 mt-14" aria-hidden="true">
            Loading RFQ…
          </div>
        </div>
      )}

      {!loading && !hasQuotes && (
        <EmptyState
          icon={<Icon.Diff size={28} />}
          title={
            error
              ? "Unable to load RFQ"
              : rfq
                ? "No quotes to compare yet"
                : "No RFQ to compare"
          }
          message={
            error ||
            (rfq
              ? "No supplier responses have been recorded for this RFQ yet. Once suppliers submit quotes, they'll appear here for comparison."
              : "There are no RFQs available. Send an RFQ to suppliers first, then come back here to compare their quotes.")
          }
          actions={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setReloadKey((k) => k + 1)}
            >
              Retry
            </Button>
          }
        />
      )}

      {!loading && hasQuotes && (
        <div className="ui-table-wrap">
          <table
            className="ui-table"
            aria-label={
              __t("advanced.rfqCompare.tableLabel") ||
              "RFQ comparison by vendor"
            }
          >
            <thead>
              <tr>
                <th scope="col" className="font-mono fs-9 uppercase letter-sp-6 fg-3 text-left">
                  Criterion
                </th>
                {quotes.map((q) => {
                  const selected = picked === q.vendor;
                  return (
                    <th
                      key={q.vendor}
                      scope="col"
                      className="text-center"
                      style={{
                        borderLeft: "1px solid var(--border-subtle)",
                        minWidth: 140,
                        padding: 0,
                        background: selected ? "var(--bg-selected)" : "transparent",
                      }}
                    >
                      <button
                        type="button"
                        className="ui-focusable"
                        onClick={() => setPicked(q.vendor)}
                        aria-pressed={selected}
                        style={{
                          display: "block",
                          width: "100%",
                          border: "none",
                          background: "transparent",
                          cursor: "pointer",
                          padding: "10px",
                          font: "inherit",
                          color: "inherit",
                        }}
                      >
                        <div className="fw-700 fs-13">{q.vendor}</div>
                        <div className="font-mono fs-9 fg-3 mt-2">
                          {q.country || "—"}
                          {q.rating != null ? ` · ★ ${q.rating}` : ""}
                        </div>
                        {q.preferred && (
                          <Badge tone="accent" pill className="mt-4">
                            Preferred
                          </Badge>
                        )}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {CRITERIA.map(({ label, key, kind }) => (
                <tr key={key}>
                  <td className="font-mono fs-10 fg-3 uppercase letter-sp-4">
                    {label}
                  </td>
                  {quotes.map((q) => {
                    const v = q[key];
                    const selected = picked === q.vendor;
                    const isBest =
                      v != null &&
                      ((kind === "money" && v === best.unit) ||
                        (kind === "days" && v === best.lead) ||
                        (kind === "pct" && v === best.quality));
                    const display =
                      v == null
                        ? "—"
                        : kind === "money"
                          ? INR(v, 2)
                          : kind === "days"
                            ? v + "d"
                            : kind === "pct"
                              ? v + "%"
                              : kind === "bool-inv"
                                ? v
                                  ? "Paid"
                                  : "Free"
                                : v;
                    return (
                      <td
                        key={q.vendor}
                        className="text-center"
                        style={{
                          borderLeft: "1px solid var(--border-subtle)",
                          background: selected ? "var(--bg-selected)" : "transparent",
                        }}
                      >
                        <span
                          className="font-mono"
                          style={{
                            fontWeight: isBest ? 700 : 500,
                            color: isBest ? "var(--ok-text)" : "var(--text-primary)",
                          }}
                        >
                          {display}
                          {isBest && (
                            <span
                              className="ml-4 fs-9"
                              style={{ color: "var(--ok-text)" }}
                            >
                              ★
                            </span>
                          )}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {quotes.some((q) => q.qty != null) && (
                <tr>
                  <td className="font-mono fs-10 fg-3 uppercase" style={{ padding: 14 }}>
                    Total ({quotes.find((q) => q.qty != null)?.qty} units)
                  </td>
                  {quotes.map((q) => {
                    const selected = picked === q.vendor;
                    return (
                      <td
                        key={q.vendor}
                        className="text-center"
                        style={{
                          borderLeft: "1px solid var(--border-subtle)",
                          padding: 14,
                          background: selected ? "var(--bg-selected)" : "transparent",
                        }}
                      >
                        <span className="font-mono fs-14 fw-700">
                          {q.qty != null ? INR(q.unit * q.qty, 0) : "—"}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
RFQCompareModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
  rfqId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  rfq: PropTypes.object,
};

export { RFQCompareModal };
export default RFQCompareModal;
