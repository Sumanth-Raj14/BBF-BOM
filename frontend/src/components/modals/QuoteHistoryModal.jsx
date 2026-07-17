import PropTypes from "prop-types";

import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import { INR, Modal } from "../../globals";
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
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {__t("common.close") || "Close"}
          </button>
          <button
            className="btn primary"
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
          </button>
        </>
      }
    >
      {/* Stats */}
      <div
        className="d-grid gap-12 mb-16"
        style={{ gridTemplateColumns: "repeat(4, 1fr)" }}
      >
        {[
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
        ].map((k) => (
          <div
            key={k.l}
            className="border-line rounded-r2 bg-canvas"
            style={{ padding: 10 }}
          >
            <div className="font-mono fs-9 uppercase letter-sp-6 fg-3">
              {k.l}
            </div>
            <div className="font-mono fs-16 fw-600" style={{ margin: "2px 0" }}>
              {k.v}
            </div>
            <div className="font-mono fs-10 fg-3">{k.sub}</div>
          </div>
        ))}
      </div>
      {/* Quote table */}
      <div className="border-line rounded-r2 overflow-h">
        <table className="bom-table table-auto">
          <thead>
            <tr>
              <th className="pl-12">
                {__t("quoteHistory.quoteId") || "Quote ID"}
              </th>
              <th>{__t("quoteHistory.date") || "Date"}</th>
              <th>{__t("quoteHistory.partNo") || "Part No."}</th>
              <th className="num">{__t("quoteHistory.qty") || "Qty"}</th>
              <th className="num">{__t("quoteHistory.unit") || "Unit"}</th>
              <th className="num">{__t("quoteHistory.total") || "Total"}</th>
              <th>{__t("quoteHistory.status") || "Status"}</th>
            </tr>
          </thead>
          <tbody>
            {quotes.map((q) => (
              <tr
                key={q.id}
                onClick={() =>
                  toast(
                    (__t("quoteHistory.opening") || "Opening {id}").replace(
                      "{id}",
                      q.id,
                    ),
                  )
                }
                className="c-pointer"
                style={{ opacity: q.status === "expired" ? 0.5 : 1 }}
              >
                <td className="mono pl-12 fw-600">{q.id}</td>
                <td className="mono">{q.date}</td>
                <td className="mono">{q.pn}</td>
                <td className="num mono">{q.qty}</td>
                <td className="num mono">{INR(q.unit, 2)}</td>
                <td className="num mono fw-600">{INR(q.total, 0)}</td>
                <td>
                  <span
                    className={
                      "status " +
                      (q.status === "accepted"
                        ? "released"
                        : q.status === "rejected"
                          ? "deprecated"
                          : "obsolete")
                    }
                  >
                    {q.status === "accepted"
                      ? __t("quoteHistory.statusAccepted") || "Accepted"
                      : q.status === "rejected"
                        ? __t("quoteHistory.statusRejected") || "Rejected"
                        : __t("quoteHistory.statusExpired") || "Expired"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

QuoteHistoryModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
  vendor: PropTypes.any,
};
