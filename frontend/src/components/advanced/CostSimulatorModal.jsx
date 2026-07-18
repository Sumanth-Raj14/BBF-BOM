import PropTypes from "prop-types";

import { BOM_DATA, Icon, INR, useAppStore } from "../../globals";
import { Button, DataTable, Input, Modal } from "../ui";

function CostSimulatorModal({ open, onClose }) {
  const ctx = useAppStore();
  const [sims, setSims] = React.useState([]);

  // Re-seed the simulation whenever the modal is (re)opened, rather than
  // conditionally calling hooks after an early return.
  React.useEffect(() => {
    if (!open) return;
    const baseRows = (ctx?.rows || BOM_DATA.rows)[0].children.flatMap(
      (s) => s.children || [],
    );
    setSims(
      baseRows.slice(0, 6).map((r) => ({ ...r, simQty: r.qty, simCost: r.cost })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const updateSim = (pn, patch) =>
    setSims((prev) => prev.map((r) => (r.pn === pn ? { ...r, ...patch } : r)));

  const baseTotal = sims.reduce((s, r) => s + r.cost * r.qty, 0);
  const simTotal = sims.reduce((s, r) => s + r.simCost * r.simQty, 0);
  const diff = simTotal - baseTotal;
  const diffPct = baseTotal ? (diff / baseTotal) * 100 : 0;

  const columns = [
    {
      key: "part",
      header: "Part",
      render: (r) => (
        <div>
          <div className="font-mono fs-10 fg-3">{r.pn}</div>
          <div className="fs-12 fw-500">{r.name}</div>
        </div>
      ),
    },
    {
      key: "baseQty",
      header: "Base qty",
      align: "num",
      render: (r) => <span className="font-mono fg-3">{r.qty}</span>,
    },
    {
      key: "simQty",
      header: "Sim qty",
      align: "num",
      render: (r) => (
        <Input
          type="number"
          min="0"
          mono
          value={r.simQty}
          aria-label={`Simulated quantity for ${r.name}`}
          onChange={(e) =>
            updateSim(r.pn, { simQty: +e.target.value || 0 })
          }
          style={{ width: 70, textAlign: "right" }}
        />
      ),
    },
    {
      key: "baseUnit",
      header: "Base unit",
      align: "num",
      render: (r) => <span className="font-mono fg-3">{INR(r.cost, 2)}</span>,
    },
    {
      key: "simUnit",
      header: "Sim unit",
      align: "num",
      render: (r) => (
        <Input
          type="number"
          step="0.01"
          min="0"
          mono
          value={r.simCost}
          aria-label={`Simulated unit cost for ${r.name}`}
          onChange={(e) =>
            updateSim(r.pn, { simCost: +e.target.value || 0 })
          }
          style={{ width: 80, textAlign: "right" }}
        />
      ),
    },
    {
      key: "delta",
      header: "Δ",
      align: "num",
      render: (r) => {
        const d = r.simCost * r.simQty - r.cost * r.qty;
        return (
          <span
            className="font-mono fw-600"
            style={{
              color:
                d > 0
                  ? "var(--danger-text)"
                  : d < 0
                    ? "var(--ok-text)"
                    : "var(--fg-3)",
            }}
          >
            {d > 0 ? "+" : ""}
            {INR(d, 0)}
          </span>
        );
      },
    },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Sparkles size={16} />}
      title="Cost simulator · what-if analysis"
      size="xl"
      footer={
        <>
          <span
            className="font-mono fs-10 fg-3"
            style={{ marginRight: "auto" }}
          >
            Current: {INR(baseTotal, 0)} · Simulated:{" "}
            <strong>{INR(simTotal, 0)}</strong> (
            {diff > 0 ? "+" : ""}
            {diffPct.toFixed(1)}%)
          </span>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
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
          <div className="font-mono fs-9 uppercase letter-sp-6 fg-accent">
            Simulated
          </div>
          <div className="fs-18 fw-700 fg-accent">{INR(simTotal, 0)}</div>
        </div>
        <div>
          <div className="font-mono fs-9 uppercase letter-sp-6 fg-3">Delta</div>
          <div
            className="fs-18 fw-700"
            style={{
              color:
                diff > 0
                  ? "var(--danger-text)"
                  : diff < 0
                    ? "var(--ok-text)"
                    : "var(--fg-3)",
            }}
          >
            {diff > 0 ? "+" : ""}
            {INR(diff, 0)}
          </div>
        </div>
      </div>
      <DataTable
        columns={columns}
        rows={sims}
        getRowKey={(r) => r.pn}
        dense
        ariaLabel="Cost simulation, base versus simulated quantity and unit cost per part"
      />
    </Modal>
  );
}
CostSimulatorModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
};

export { CostSimulatorModal };
export default CostSimulatorModal;
