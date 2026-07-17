import PropTypes from "prop-types";
import { BOM_DATA, INR, Modal, useAppStore } from "../../globals";

function CostSimulatorModal({ open, onClose }) {
  const ctx = useAppStore();
  if (!open) return null;
  const baseRows = (ctx?.rows || BOM_DATA.rows)[0].children.flatMap(
    (s) => s.children || [],
  );
  const [sims, setSims] = React.useState(
    baseRows.slice(0, 6).map((r) => ({ ...r, simQty: r.qty, simCost: r.cost })),
  );
  const baseTotal = sims.reduce((s, r) => s + r.cost * r.qty, 0);
  const simTotal = sims.reduce((s, r) => s + r.simCost * r.simQty, 0);
  const diff = simTotal - baseTotal;
  const diffPct = (diff / baseTotal) * 100;
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Sparkles size={16} />}
      title="Cost simulator · what-if analysis"
      wide
      footer={
        <>
          <span className="left">
            Current: {INR(baseTotal, 0)} · Simulated:{" "}
            <strong>{INR(simTotal, 0)}</strong> ({diff > 0 ? "+" : ""}
            {diffPct.toFixed(1)}%)
          </span>
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <div
        className="bg-sunk border-line rounded-r2 mb-16 d-grid gap-16"
        style={{ padding: 14, gridTemplateColumns: "1fr 1fr 1fr" }}
      >
        <div>
          <div className="font-mono fs-9 uppercase letter-sp-6 fg-3">
            Baseline
          </div>
          <div className="fs-18 fw-700">{INR(baseTotal, 0)}</div>
        </div>
        <div>
          <div className="font-mono fs-9 uppercase letter-sp-6 fg-3 fg-accent">
            Simulated
          </div>
          <div className="fs-18 fw-700 fg-accent">{INR(simTotal, 0)}</div>
        </div>
        <div>
          <div className="font-mono fs-9 uppercase letter-sp-6 fg-3">Delta</div>
          <div
            style={{
              color:
                diff > 0
                  ? "var(--danger)"
                  : diff < 0
                    ? "var(--ok)"
                    : "var(--fg-3)",
            }}
          >
            {diff > 0 ? "+" : ""}
            {INR(diff, 0)}
          </div>
        </div>
      </div>
      <div className="border-line rounded-r2 overflow-x-a">
        <table className="bom-table table-auto">
          <thead>
            <tr>
              <th className="pl-12">Part</th>
              <th className="num">Base qty</th>
              <th className="num">Sim qty</th>
              <th className="num">Base unit</th>
              <th className="num">Sim unit</th>
              <th className="num">Δ</th>
            </tr>
          </thead>
          <tbody>
            {sims.map((r, i) => {
              const d = r.simCost * r.simQty - r.cost * r.qty;
              return (
                <tr key={r.pn}>
                  <td className="pl-12">
                    <div className="font-mono fs-10 fg-3">{r.pn}</div>
                    <div className="fs-12 fw-500">{r.name}</div>
                  </td>
                  <td className="num mono fg-3">{r.qty}</td>
                  <td className="num">
                    <input
                      type="number"
                      value={r.simQty}
                      onChange={(e) => {
                        const next = [...sims];
                        next[i] = { ...next[i], simQty: +e.target.value || 0 };
                        setSims(next);
                      }}
                      className="input mono h-26 text-right fs-11"
                      style={{ width: 70 }}
                    />
                  </td>
                  <td className="num mono fg-3">{INR(r.cost, 2)}</td>
                  <td className="num">
                    <input
                      type="number"
                      step="0.01"
                      value={r.simCost}
                      onChange={(e) => {
                        const next = [...sims];
                        next[i] = { ...next[i], simCost: +e.target.value || 0 };
                        setSims(next);
                      }}
                      className="input mono w-80 h-26 text-right fs-11"
                    />
                  </td>
                  <td
                    className="num mono fw-600"
                    style={{
                      color:
                        d > 0
                          ? "var(--danger)"
                          : d < 0
                            ? "var(--ok)"
                            : "var(--fg-3)",
                    }}
                  >
                    {d > 0 ? "+" : ""}
                    {INR(d, 0)}
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
CostSimulatorModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
};

export { CostSimulatorModal };
export default CostSimulatorModal;
