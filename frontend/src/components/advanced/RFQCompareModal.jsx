import PropTypes from "prop-types";

import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import { Icon, INR } from "../../globals";
import { Badge, Button, Modal } from "../ui";

const CRITERIA = [
  { label: "Unit price (qty 50)", key: "unit", kind: "money" },
  { label: "Lead time (days)", key: "lead", kind: "days" },
  { label: "MOQ", key: "moq", kind: "num" },
  { label: "Payment terms", key: "terms", kind: "text" },
  { label: "Quality score", key: "quality", kind: "pct" },
  { label: "Free samples?", key: "paid_samples", kind: "bool-inv" },
];

function RFQCompareModal({ open, onClose }) {
  const [picked, setPicked] = React.useState(null);
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

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Diff size={16} />}
      title={__t("advanced.rfqCompare.title") || "RFQ Comparison"}
      subtitle={`${part.pn} · ${part.name} · ${quotes.length} responses received`}
      size="xl"
      footer={
        <>
          <span
            className="font-mono fs-10 fg-3"
            style={{ marginRight: "auto" }}
          >
            Target unit: {INR(part.target_unit, 2)} · Best quote:{" "}
            {INR(best.unit, 2)}
          </span>
          <Button variant="secondary" onClick={onClose}>
            {__t("common.cancel") || "Cancel"}
          </Button>
          <Button
            variant="primary"
            disabled={!picked}
            onClick={() => {
              onClose();
              toast("Awarded RFQ to " + picked, { kind: "success" });
            }}
          >
            Award to {picked || "vendor"}
          </Button>
        </>
      }
    >
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
                        {q.country} · ★ {q.rating}
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
            <tr>
              <td className="font-mono fs-10 fg-3 uppercase" style={{ padding: 14 }}>
                Total (50 units)
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
                      {INR(q.unit * 50, 0)}
                    </span>
                  </td>
                );
              })}
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
