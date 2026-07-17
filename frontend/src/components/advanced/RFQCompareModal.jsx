import PropTypes from "prop-types";

import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import { INR, Modal } from "../../globals";
function RFQCompareModal({ open, onClose }) {
  if (!open) return null;
  const part = {
    pn: "EL-PSU-240W",
    name: "Power Supply, 240W ATX",
    target_unit: 82,
  };
  const quotes = [
    {
      vendor: "Mean Well",
      country: "TW",
      unit: 84.0,
      qty: 50,
      lead: 21,
      moq: 25,
      terms: "Net 30",
      quality: 96,
      rating: 4.6,
      paid_samples: false,
      preferred: true,
    },
    {
      vendor: "Delta",
      country: "TW",
      unit: 79.4,
      qty: 100,
      lead: 28,
      moq: 50,
      terms: "Prepaid",
      quality: 92,
      rating: 4.3,
      paid_samples: false,
      preferred: false,
    },
    {
      vendor: "Seasonic",
      country: "TW",
      unit: 92.2,
      qty: 25,
      lead: 14,
      moq: 10,
      terms: "Net 30",
      quality: 98,
      rating: 4.8,
      paid_samples: true,
      preferred: false,
    },
    {
      vendor: "FSP Group",
      country: "CN",
      unit: 71.5,
      qty: 200,
      lead: 35,
      moq: 100,
      terms: "Prepaid",
      quality: 88,
      rating: 4.0,
      paid_samples: false,
      preferred: false,
    },
  ];
  const best = {
    unit: Math.min(...quotes.map((q) => q.unit)),
    lead: Math.min(...quotes.map((q) => q.lead)),
    quality: Math.max(...quotes.map((q) => q.quality)),
  };
  const [picked, setPicked] = React.useState(null);
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Diff size={16} />}
      title={__t("advanced.rfqCompare.title") || "RFQ Comparison"}
      subtitle={`${part.pn} · ${part.name} · ${quotes.length} responses received`}
      wide
      footer={
        <>
          <span className="left">
            Target unit: {INR(part.target_unit, 2)} · Best quote:{" "}
            {INR(best.unit, 2)}
          </span>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={!picked}
            onClick={() => {
              onClose();
              toast("Awarded RFQ to " + picked, { kind: "success" });
            }}
          >
            Award to {picked || "vendor"}
          </button>
        </>
      }
    >
      <div className="ox-auto">
        <table className="w-100p fs-11" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th
                className="text-left font-mono fs-9 uppercase letter-sp-6 fg-3"
                style={{ padding: 10, borderBottom: "2px solid var(--line)" }}
              >
                Criterion
              </th>
              {quotes.map((q) => (
                <th
                  key={q.vendor}
                  className="bl-1 text-center c-pointer"
                  style={{
                    padding: 10,
                    borderBottom: "2px solid var(--line)",
                    minWidth: 140,
                    background:
                      picked === q.vendor
                        ? "var(--accent-soft)"
                        : "transparent",
                  }}
                  onClick={() => setPicked(q.vendor)}
                >
                  <div className="fw-700 fs-13">{q.vendor}</div>
                  <div className="font-mono fs-9 fg-3 mt-2">
                    {q.country} · ★ {q.rating}
                  </div>
                  {q.preferred && (
                    <span
                      className="d-iblock mt-4 font-mono fg-accent letter-sp-6"
                      style={{ fontSize: 8 }}
                    >
                      PREFERRED
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              ["Unit price (qty 50)", "unit", "money", "low"],
              ["Lead time (days)", "lead", "days", "low"],
              ["MOQ", "moq", "num", "low"],
              ["Payment terms", "terms", "text"],
              ["Quality score", "quality", "pct", "high"],
              ["Free samples?", "paid_samples", "bool-inv"],
            ].map(([label, key, kind]) => (
              <tr key={key}>
                <td
                  className="font-mono fs-10 fg-3 uppercase letter-sp-4"
                  style={{
                    padding: 10,
                    borderBottom: "1px solid var(--line-soft)",
                  }}
                >
                  {label}
                </td>
                {quotes.map((q) => {
                  const v = q[key];
                  const isBest =
                    (kind === "money" && v === best.unit) ||
                    (kind === "days" && v === best.lead) ||
                    (kind === "pct" && v === best.quality);
                  const display =
                    kind === "money"
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
                      className="bl-1 text-center"
                      style={{
                        padding: 10,
                        borderBottom: "1px solid var(--line-soft)",
                        background:
                          picked === q.vendor
                            ? "var(--accent-soft)"
                            : "transparent",
                      }}
                    >
                      <span
                        style={{
                          fontWeight: isBest ? 700 : 500,
                          color: isBest ? "var(--ok)" : "var(--fg)",
                        }}
                      >
                        {display}
                        {isBest && <span className="ml-4 fs-9 fg-ok">★</span>}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr>
              <td
                className="font-mono fs-10 fg-3 uppercase"
                style={{ padding: 14 }}
              >
                Total (50 units)
              </td>
              {quotes.map((q) => (
                <td
                  key={q.vendor}
                  className="bl-1 text-center"
                  style={{
                    padding: 14,
                    background:
                      picked === q.vendor
                        ? "var(--accent-soft)"
                        : "transparent",
                  }}
                >
                  <span className="font-mono fs-14 fw-700">
                    {INR(q.unit * 50, 0)}
                  </span>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
RFQCompareModal.propTypes = { open: PropTypes.bool, onClose: PropTypes.func };

export { RFQCompareModal };
export default RFQCompareModal;
