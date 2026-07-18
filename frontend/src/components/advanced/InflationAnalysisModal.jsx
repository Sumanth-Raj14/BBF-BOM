import PropTypes from "prop-types";

import { Icon } from "../../globals";
import { Button, Modal } from "../ui";

const CATEGORIES = [
  {
    name: "Semiconductors",
    color: "var(--status-danger)",
    text: "var(--status-danger-text)",
    values: [2.1, 2.3, 2.8, 3.2, 3.5, 3.8, 4.2, 4.5],
    current: 4.5,
    baseline: 2.1,
  },
  {
    name: "Passives (MLCC)",
    color: "var(--status-warning)",
    text: "var(--status-warning-text)",
    values: [1.5, 1.6, 1.8, 2.0, 2.2, 2.5, 2.7, 2.8],
    current: 2.8,
    baseline: 1.5,
  },
  {
    name: "Fasteners & Hardware",
    color: "var(--status-info)",
    text: "var(--status-info-text)",
    values: [1.2, 1.2, 1.3, 1.4, 1.4, 1.5, 1.5, 1.6],
    current: 1.6,
    baseline: 1.2,
  },
  {
    name: "Optics & Lenses",
    color: "var(--accent)",
    text: "var(--accent-text)",
    values: [1.8, 2.0, 2.2, 2.5, 2.7, 2.9, 3.1, 3.3],
    current: 3.3,
    baseline: 1.8,
  },
];
const MONTHS = ["Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun"];

function InflationAnalysisModal({ open, onClose }) {
  if (!open) return null;

  const totalBaseline = CATEGORIES.reduce((s, c) => s + c.baseline, 0);
  const totalCurrent = CATEGORIES.reduce((s, c) => s + c.current, 0);
  const overallRate = ((totalCurrent - totalBaseline) / totalBaseline) * 100;
  const highest = [...CATEGORIES].sort((a, b) => b.current - a.current)[0];

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Chart size={16} />}
      title="Inflation Analysis"
      subtitle={`Overall: ${overallRate.toFixed(1)}% · BOM weighted impact available`}
      size="xl"
      footer={
        <>
          <span
            className="font-mono fs-10 fg-3"
            style={{ marginRight: "auto" }}
          >
            Data sourced from industry indices
          </span>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      <div
        className="bg-sunk border-line rounded-r2 mb-16 d-grid gap-16"
        style={{ padding: 14, gridTemplateColumns: "1fr 1fr" }}
      >
        <div>
          <div className="font-mono fs-9 uppercase letter-sp-6 fg-3">
            Overall inflation
          </div>
          <div
            className="fs-18 fw-700"
            style={{
              color:
                overallRate > 5
                  ? "var(--status-danger-text)"
                  : "var(--status-warning-text)",
            }}
          >
            {overallRate.toFixed(1)}%
          </div>
        </div>
        <div>
          <div className="font-mono fs-9 uppercase letter-sp-6 fg-3">
            Highest category
          </div>
          <div className="fs-14 fw-700" style={{ color: "var(--accent-text)" }}>
            {highest.name}
          </div>
        </div>
      </div>

      <div className="border-line rounded-r2 overflow-h mb-14">
        <div
          className="bg-sunk font-mono fs-9 uppercase letter-sp-6 fg-3 border-bottom"
          style={{ padding: "8px 12px" }}
        >
          Category trends (YoY)
        </div>
        <div style={{ padding: "16px 20px" }}>
          <div
            className="flex pos-relative h-200"
            style={{ gap: 0 }}
            role="img"
            aria-label={`Year-over-year inflation trend by category: ${CATEGORIES.map(
              (c) => `${c.name} rising from ${c.baseline.toFixed(1)}% to ${c.current.toFixed(1)}%`,
            ).join("; ")}`}
          >
            <div className="flex flex-col justify-between pr-8 font-mono fs-9 fg-3">
              <span>5%</span>
              <span>3%</span>
              <span>1%</span>
              <span>0%</span>
            </div>
            <div className="flex-1 relative">
              {CATEGORIES.map((cat) => (
                <svg
                  key={cat.name}
                  className="pos-absolute w-100p h-100p"
                  style={{ top: 0, left: 0 }}
                  aria-hidden="true"
                >
                  <polyline
                    points={cat.values
                      .map(
                        (v, i) =>
                          `${(i / (cat.values.length - 1)) * 100}% ${200 - (v / 5) * 200}`,
                      )
                      .join(" ")}
                    fill="none"
                    stroke={cat.color}
                    strokeWidth="1.5"
                    opacity="0.8"
                  />
                </svg>
              ))}
              <div
                className="pos-absolute flex justify-between font-mono fs-9 fg-3"
                style={{ bottom: -20, left: 0, right: 0 }}
              >
                {MONTHS.map((m) => (
                  <span key={m}>{m}</span>
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-16 mt-28" style={{ flexWrap: "wrap" }}>
            {CATEGORIES.map((c) => (
              <span
                key={c.name}
                className="inline-flex items-center gap-6 font-mono fs-10"
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 12,
                    height: 3,
                    background: c.color,
                    borderRadius: 1,
                  }}
                />
                {c.name}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="border-line rounded-r2 overflow-x-a">
        <table className="bom-table table-auto">
          <caption className="sr-only">
            Inflation by category, baseline versus current
          </caption>
          <thead>
            <tr>
              <th className="pl-12" scope="col">
                Category
              </th>
              <th className="num" scope="col">
                Baseline
              </th>
              <th className="num" scope="col">
                Current
              </th>
              <th className="num" scope="col">
                Change
              </th>
            </tr>
          </thead>
          <tbody>
            {CATEGORIES.map((c) => {
              const pct = ((c.current - c.baseline) / c.baseline) * 100;
              return (
                <tr key={c.name}>
                  <td className="pl-12">
                    <span className="inline-flex items-center gap-8">
                      <span
                        aria-hidden="true"
                        className="br-2"
                        style={{ width: 10, height: 10, background: c.color }}
                      />
                      <span className="fw-500">{c.name}</span>
                    </span>
                  </td>
                  <td className="num mono">{c.baseline.toFixed(1)}%</td>
                  <td className="num mono fw-600">{c.current.toFixed(1)}%</td>
                  <td
                    className="num mono fw-700"
                    style={{
                      color:
                        pct > 0
                          ? "var(--status-danger-text)"
                          : "var(--status-success-text)",
                    }}
                  >
                    {pct > 0 ? "+" : ""}
                    {pct.toFixed(1)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
InflationAnalysisModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
};

export { InflationAnalysisModal };
export default InflationAnalysisModal;
