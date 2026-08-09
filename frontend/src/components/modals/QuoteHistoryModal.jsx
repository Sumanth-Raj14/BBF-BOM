import PropTypes from "prop-types";

import { __t } from "../../i18n";
import { INR, Icon, api } from "../../globals";
import { Button, DataTable, EmptyState, Modal, Spinner } from "../ui";

// Fix (dead-fakes cleanup): this modal used to show the same fixed 8 fake
// quotes for every vendor. There is no "quotes" table, but there IS a real
// per-vendor price history (GET /price-history?vendorId=), which is the
// honest analog: real recorded prices over time instead of invented RFQ
// quote numbers/status. Loading/error/empty states never fall back to a
// made-up number, and the "New RFQ" button (which only toasted, never sent
// anything) is dropped rather than replaced with a second fake action.
export default function QuoteHistoryModal({ open, onClose, vendor }) {
  const [state, setState] = React.useState({ loading: true, rows: null, error: null });

  React.useEffect(() => {
    if (!open || !vendor?.id) return undefined;
    if (!api?.priceHistory?.list) {
      setState({ loading: false, rows: null, error: "unavailable" });
      return undefined;
    }
    let cancelled = false;
    setState({ loading: true, rows: null, error: null });
    api.priceHistory
      .list({ vendorId: vendor.id, per_page: 100 })
      .then((res) => {
        if (cancelled) return;
        setState({ loading: false, rows: (res && res.items) || [], error: null });
      })
      .catch((e) => {
        if (cancelled) return;
        setState({ loading: false, rows: null, error: e?.message || "Failed to load price history" });
      });
    return () => {
      cancelled = true;
    };
  }, [open, vendor?.id]);

  if (!open || !vendor || !vendor.name) return null;

  const { loading, rows, error } = state;
  const prices = (rows || []).map((r) => Number(r.price)).filter((n) => !isNaN(n));
  const avgPrice = prices.length ? prices.reduce((s, n) => s + n, 0) / prices.length : null;
  const minPrice = prices.length ? Math.min(...prices) : null;

  const stats = rows
    ? [
        { l: __t("quoteHistory.recordCount") || "Records", v: String(rows.length) },
        {
          l: __t("quoteHistory.avgUnit") || "Avg price",
          v: avgPrice != null ? INR(avgPrice, 2) : "—",
        },
        {
          l: __t("quoteHistory.bestPrice") || "Best price",
          v: minPrice != null ? INR(minPrice, 2) : "—",
        },
      ]
    : [];

  const columns = [
    {
      key: "partId",
      header: __t("quoteHistory.partNo") || "Part ID",
      render: (r) => <span className="quote-history__mono">{r.partId}</span>,
    },
    {
      key: "price",
      header: __t("quoteHistory.unit") || "Price",
      align: "num",
      render: (r) => (
        <span className="quote-history__mono fw-600">{INR(Number(r.price), 2)}</span>
      ),
    },
    {
      key: "currency",
      header: __t("common.currency") || "Currency",
      render: (r) => <span className="quote-history__mono">{r.currency || "USD"}</span>,
    },
    {
      key: "source",
      header: __t("quoteHistory.source") || "Source",
      render: (r) => <span className="fs-11 fg-3">{r.source || "—"}</span>,
    },
    {
      key: "effectiveDate",
      header: __t("quoteHistory.date") || "Date",
      render: (r) => (
        <span className="quote-history__mono">
          {(r.effectiveDate || r.recordedAt || "").slice(0, 10) || "—"}
        </span>
      ),
    },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Doc size={16} />}
      title={__t("quoteHistory.title") || "Price history"}
      subtitle={vendor.name}
      size="lg"
      footer={
        <Button variant="secondary" onClick={onClose}>
          {__t("common.close") || "Close"}
        </Button>
      }
    >
      {loading && <Spinner label={__t("common.loading") || "Loading…"} />}
      {!loading && error && (
        <p className="fs-12 fg-3">
          {__t("common.loadFailed") || "Load failed"}: {error}
        </p>
      )}
      {!loading && !error && (
        <>
          {stats.length > 0 && (
            <div className="quote-history__stats">
              {stats.map((k) => (
                <div key={k.l} className="quote-history__stat">
                  <div className="quote-history__stat-label">{k.l}</div>
                  <div className="quote-history__stat-value">{k.v}</div>
                </div>
              ))}
            </div>
          )}
          <DataTable
            columns={columns}
            rows={rows || []}
            getRowKey={(r) => r.id}
            ariaLabel={
              __t("quoteHistory.tableLabel") || "Price history for " + vendor.name
            }
            dense
            empty={<EmptyState message={__t("common.noData") || "No price history for this vendor yet."} />}
          />
        </>
      )}
      <style>{`
        .quote-history__stats {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
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
