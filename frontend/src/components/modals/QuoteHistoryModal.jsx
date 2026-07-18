import PropTypes from "prop-types";

import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import { INR } from "../../globals";
import { Modal } from "../ui/Modal.jsx";
import { Button } from "../ui/Button.jsx";
import { StatusPill } from "../ui/Badge.jsx";
import { DataTable } from "../ui/DataTable.jsx";

// ============ QUOTE HISTORY ============
export default function QuoteHistoryModal({ open, onClose, vendor }) {
  if (!open || !vendor || !vendor.name) return null;
  const quotes = [
    {
      id: "Q-2026-0182",
      date: "2026-05-12",
      pn: "EL-PSU-240W",
      qty: 100,
      unit: 82.5,
      total: 8250,
      status: "accepted",
    },
    {
      id: "Q-2026-0167",
      date: "2026-04-28",
      pn: "EL-PSU-240W",
      qty: 50,
      unit: 84.0,
      total: 4200,
      status: "accepted",
    },
    {
      id: "Q-2026-0142",
      date: "2026-04-08",
      pn: "EL-PSU-240W",
      qty: 200,
      unit: 78.2,
      total: 15640,
      status: "accepted",
    },
    {
      id: "Q-2026-0124",
      date: "2026-03-22",
      pn: "EL-PSU-300W",
      qty: 25,
      unit: 112.0,
      total: 2800,
      status: "rejected",
    },
    {
      id: "Q-2026-0098",
      date: "2026-02-14",
      pn: "EL-PSU-240W",
      qty: 50,
      unit: 80.5,
      total: 4025,
      status: "accepted",
    },
    {
      id: "Q-2025-1842",
      date: "2025-12-05",
      pn: "EL-PSU-240W",
      qty: 100,
      unit: 75.0,
      total: 7500,
      status: "accepted",
    },
    {
      id: "Q-2025-1721",
      date: "2025-10-18",
      pn: "EL-PSU-240W",
      qty: 50,
      unit: 74.2,
      total: 3710,
      status: "accepted",
    },
    {
      id: "Q-2025-1602",
      date: "2025-09-02",
      pn: "EL-PSU-160W",
      qty: 25,
      unit: 58.0,
      total: 1450,
      status: "expired",
    },
  ];
  const accepted = quotes.filter((q) => q.status === "accepted");
  const avgUnit = accepted.reduce((s, q) => s + q.unit, 0) / accepted.length;

  const statusLabel = (status) =>
    status === "accepted"
      ? __t("quoteHistory.statusAccepted") || "Accepted"
      : status === "rejected"
        ? __t("quoteHistory.statusRejected") || "Rejected"
        : __t("quoteHistory.statusExpired") || "Expired";

  const statusTone = (status) =>
    status === "accepted"
      ? "success"
      : status === "rejected"
        ? "danger"
        : "neutral";

  const openQuote = (q) =>
    toast(
      (__t("quoteHistory.opening") || "Opening {id}").replace("{id}", q.id),
    );

  const stats = [
    {
      l: __t("quoteHistory.avgUnit") || "Avg unit",
      v: INR(avgUnit, 2),
      sub: (
        __t("quoteHistory.acrossAccepted") || "across {count} accepted"
      ).replace("{count}", accepted.length),
    },
    {
      l: __t("quoteHistory.acceptanceRate") || "Acceptance rate",
      v: Math.round((accepted.length / quotes.length) * 100) + "%",
      sub:
        accepted.length +
        (__t("quoteHistory.of") || " of ") +
        quotes.length,
    },
    {
      l: __t("quoteHistory.totalValue") || "Total value",
      v: INR(
        accepted.reduce((s, q) => s + q.total, 0),
        0,
      ),
      sub: __t("quoteHistory.lifetime") || "lifetime",
    },
    {
      l: __t("quoteHistory.bestPrice") || "Best price",
      v: INR(Math.min(...accepted.map((q) => q.unit)), 2),
      sub: __t("quoteHistory.bestPriceDate") || "Oct '25",
    },
  ];

  // Expired quotes are visually de-emphasised (matches prior row-opacity
  // affordance) without requiring the shared DataTable primitive to support
  // per-row styling.
  const dim = (q) => (q.status === "expired" ? { opacity: 0.55 } : undefined);

  const columns = [
    {
      key: "id",
      header: __t("quoteHistory.quoteId") || "Quote ID",
      render: (q) => (
        <span className="quote-history__mono fw-600" style={dim(q)}>
          {q.id}
        </span>
      ),
    },
    {
      key: "date",
      header: __t("quoteHistory.date") || "Date",
      render: (q) => (
        <span className="quote-history__mono" style={dim(q)}>
          {q.date}
        </span>
      ),
    },
    {
      key: "pn",
      header: __t("quoteHistory.partNo") || "Part No.",
      render: (q) => (
        <span className="quote-history__mono" style={dim(q)}>
          {q.pn}
        </span>
      ),
    },
    {
      key: "qty",
      header: __t("quoteHistory.qty") || "Qty",
      align: "num",
      render: (q) => (
        <span className="quote-history__mono" style={dim(q)}>
          {q.qty}
        </span>
      ),
    },
    {
      key: "unit",
      header: __t("quoteHistory.unit") || "Unit",
      align: "num",
      render: (q) => (
        <span className="quote-history__mono" style={dim(q)}>
          {INR(q.unit, 2)}
        </span>
      ),
    },
    {
      key: "total",
      header: __t("quoteHistory.total") || "Total",
      align: "num",
      render: (q) => (
        <span className="quote-history__mono fw-600" style={dim(q)}>
          {INR(q.total, 0)}
        </span>
      ),
    },
    {
      key: "status",
      header: __t("quoteHistory.status") || "Status",
      render: (q) => (
        <StatusPill
          status={q.status}
          tone={statusTone(q.status)}
          label={statusLabel(q.status)}
        />
      ),
    },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Doc size={16} />}
      title={__t("quoteHistory.title") || "Quote history"}
      subtitle={(
        __t("quoteHistory.subtitle") || "{name} · {count} quotes over 12 months"
      )
        .replace("{name}", vendor.name)
        .replace("{count}", quotes.length)}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {__t("common.close") || "Close"}
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              onClose();
              toast(
                (
                  __t("quoteHistory.newRfqToast") ||
                  "New RFQ drafted for {name}"
                ).replace("{name}", vendor.name),
              );
            }}
          >
            <Icon.Cart size={12} /> {__t("quoteHistory.newRfq") || "New RFQ"}
          </Button>
        </>
      }
    >
      {/* Stats */}
      <div className="quote-history__stats">
        {stats.map((k) => (
          <div key={k.l} className="quote-history__stat">
            <div className="quote-history__stat-label">{k.l}</div>
            <div className="quote-history__stat-value">{k.v}</div>
            <div className="quote-history__stat-sub">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Quote table */}
      <DataTable
        columns={columns}
        rows={quotes}
        getRowKey={(q) => q.id}
        onRowClick={openQuote}
        ariaLabel={
          __t("quoteHistory.tableLabel") || "Quote history for " + vendor.name
        }
        dense
      />

      <style>{`
        .quote-history__stats {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: var(--sp-3);
          margin-bottom: var(--sp-4);
        }
        .quote-history__stat {
          padding: var(--sp-3);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          background: var(--bg-canvas);
        }
        .quote-history__stat-label {
          font-family: var(--font-mono);
          font-size: var(--fs-50);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-muted);
        }
        .quote-history__stat-value {
          font-family: var(--font-mono);
          font-size: var(--fs-400);
          font-weight: var(--fw-semibold);
          margin: 2px 0;
          color: var(--text-primary);
        }
        .quote-history__stat-sub {
          font-family: var(--font-mono);
          font-size: var(--fs-100);
          color: var(--text-muted);
        }
        .quote-history__mono {
          font-family: var(--font-mono);
        }
        @media (max-width: 640px) {
          .quote-history__stats {
            grid-template-columns: repeat(2, 1fr);
          }
        }
      `}</style>
    </Modal>
  );
}

QuoteHistoryModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
  vendor: PropTypes.any,
};
