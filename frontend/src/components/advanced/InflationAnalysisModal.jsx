import PropTypes from "prop-types";
import { Modal } from "../../globals";

function InflationAnalysisModal({ open, onClose }) {
  if (!open) return null;
  const categories = [
    {
      name: "Semiconductors",
      color: "var(--danger)",
      values: [2.1, 2.3, 2.8, 3.2, 3.5, 3.8, 4.2, 4.5],
      current: 4.5,
      baseline: 2.1,
    },
    {
      name: "Passives (MLCC)",
      color: "var(--warn)",
      values: [1.5, 1.6, 1.8, 2.0, 2.2, 2.5, 2.7, 2.8],
      current: 2.8,
      baseline: 1.5,
    },
    {
      name: "Fasteners & Hardware",
      color: "var(--info)",
      values: [1.2, 1.2, 1.3, 1.4, 1.4, 1.5, 1.5, 1.6],
      current: 1.6,
      baseline: 1.2,
    },
    {
      name: "Optics & Lenses",
      color: "var(--accent)",
      values: [1.8, 2.0, 2.2, 2.5, 2.7, 2.9, 3.1, 3.3],
      current: 3.3,
      baseline: 1.8,
    },
  ];
  const months = ["Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun"];
  const totalBaseline = categories.reduce((s, c) => s + c.baseline, 0);
  const totalCurrent = categories.reduce((s, c) => s + c.current, 0);
  const overallRate = ((totalCurrent - totalBaseline) / totalBaseline) * 100;
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Chart size={16} />}
      title="Inflation Analysis"
      subtitle={`Overall: ${overallRate.toFixed(1)}% · BOM weighted impact available`}
      wide
      footer={
        <>
          <span className="left">Data sourced from industry indices</span>
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <div
        className="d-grid gap-12 mb-16"
        style={{ gridTemplateColumns: "repeat(4, 1fr)" }}
      >
        {[
          {
            l: "Overall inflation",
            v: `${overallRate.toFixed(1)}%`,
            c: overallRate > 5 ? "var(--danger)" : "var(--warn)",
          },
          {
            l: "Highest category",
            v: categories.sort((a, b) => b.current - a.current)[0].name,
            c: "var(--accent)",
            small: true,
          },
        ].map((k) => (
          <div key={k.l} className="kpi">
            <div className="l">{k.l}</div>
            <div
              className="v"
              style={{ color: k.c, fontSize: k.small ? 14 : 24 }}
            >
              {k.v}
            </div>
          </div>
        ))}
      </div>
      <div className="border-line rounded-r2 overflow-h mb-14">
        <div
          className="bg-sunk font-mono fs-9 uppercase letter-sp-6 fg-3 border-bottom"
          style={{ padding: "8px 12px" }}
        >
          Category trends (YoY)
        </div>
        <div style={{ padding: "16px 20px" }}>
          <div className="flex pos-relative h-200" style={{ gap: 0 }}>
            <div className="flex flex-col justify-between pr-8 font-mono fs-9 fg-3">
              <span>5%</span>
              <span>3%</span>
              <span>1%</span>
              <span>0%</span>
            </div>
            <div className="flex-1 relative">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="pos-absolute" />
              ))}
              {categories.slice(0, 4).map((cat) => (
                <svg
                  key={cat.name}
                  className="pos-absolute w-100p h-100p"
                  style={{ top: 0, left: 0 }}
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
                {months.map((m) => (
                  <span key={m}>{m}</span>
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-16 mt-28" style={{ flexWrap: "wrap" }}>
            {categories.slice(0, 4).map((c) => (
              <span
                key={c.name}
                className="inline-flex items-center gap-6 font-mono fs-10"
              >
                <span
                  style={{
                    width: 12,
                    height: 3,
                    background: c.color,
                    borderRadius: 1,
                  }}
                />{" "}
                {c.name}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="border-line rounded-r2 overflow-x-a">
        <table className="bom-table table-auto">
          <thead>
            <tr>
              <th className="pl-12">Category</th>
              <th className="num">Baseline</th>
              <th className="num">Current</th>
              <th className="num">Change</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => {
              const pct = ((c.current - c.baseline) / c.baseline) * 100;
              return (
                <tr key={c.name}>
                  <td className="pl-12">
                    <span className="inline-flex items-center gap-8">
                      <span
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
                    style={{ color: pct > 0 ? "var(--danger)" : "var(--ok)" }}
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
