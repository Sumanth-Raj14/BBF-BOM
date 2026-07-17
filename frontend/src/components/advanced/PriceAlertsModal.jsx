import PropTypes from "prop-types";

import { __t } from "../../i18n";
import { INR, Modal } from "../../globals";
function PriceAlertsModal({ open, onClose }) {
  if (!open) return null;
  const [alerts] = React.useState([
    {
      pn: "EL-PSU-240W",
      name: "Power Supply 240W",
      vendor: "Mean Well",
      base: 84.0,
      current: 92.5,
      pct: 10.1,
      dir: "up",
      trend: [84, 85, 84, 86, 88, 90, 92.5],
      status: "active",
    },
    {
      pn: "EL-MCU-STM32H7",
      name: "STM32H743 MCU",
      vendor: "STMicro",
      base: 18.5,
      current: 22.8,
      pct: 23.2,
      dir: "up",
      trend: [18.5, 19.2, 20.0, 20.8, 21.5, 22.2, 22.8],
      status: "active",
    },
    {
      pn: "HW-FAS-M3-08",
      name: "M3x8 Screw A2",
      vendor: "McMaster",
      base: 0.08,
      current: 0.07,
      pct: -12.5,
      dir: "down",
      trend: [0.08, 0.08, 0.075, 0.075, 0.07, 0.07, 0.07],
      status: "resolved",
    },
  ]);
  const [filter, setFilter] = React.useState("all");
  const [threshold, setThreshold] = React.useState(5);
  const filtered = alerts
    .filter((a) => {
      if (filter === "active") return a.status === "active";
      if (filter === "resolved") return a.status === "resolved";
      if (filter === "up") return a.dir === "up";
      if (filter === "down") return a.dir === "down";
      return true;
    })
    .filter((a) => Math.abs(a.pct) >= threshold);
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Chart size={16} />}
      title="Price Alerts"
      subtitle={`${alerts.filter((a) => a.status === "active").length} active`}
      wide
      footer={
        <>
          <span className="left">Threshold: ≥{threshold}% change</span>
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <div
        className="flex gap-12 mb-14 items-center"
        style={{ flexWrap: "wrap" }}
      >
        <div className="flex gap-6">
          {[
            ["all", "All"],
            ["active", "Active"],
            ["resolved", "Resolved"],
            ["up", "Up"],
            ["down", "Down"],
          ].map(([k, l]) => (
            <span
              key={k}
              className={(
                "chip " +
                (filter === k ? "active" : "") +
                " cursor-pointer"
              ).trim()}
              onClick={() => setFilter(k)}
            >
              {l}
            </span>
          ))}
        </div>
        <div className="flex gap-6 font-mono fs-11">
          {__t("advanced.priceAlerts.threshold") || "Threshold"}:{" "}
          {[3, 5, 10, 20].map((t) => (
            <span
              key={t}
              className={(
                "chip " +
                (threshold === t ? "active" : "") +
                " cursor-pointer"
              ).trim()}
              onClick={() => setThreshold(t)}
            >
              {t}%
            </span>
          ))}
        </div>
      </div>
      <div className="border-line rounded-r2 overflow-x-a">
        <table className="bom-table table-auto">
          <thead>
            <tr>
              <th className="pl-12">Part No.</th>
              <th>Name</th>
              <th>Vendor</th>
              <th className="num">Base</th>
              <th className="num">Current</th>
              <th className="num">Change</th>
              <th>Trend</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="text-center fg-3"
                  style={{ padding: 40 }}
                >
                  No alerts matching filters
                </td>
              </tr>
            ) : (
              filtered.map((a) => (
                <tr key={a.pn}>
                  <td className="mono pl-12 fw-600">{a.pn}</td>
                  <td>{a.name}</td>
                  <td>{a.vendor}</td>
                  <td className="num mono">{INR(a.base, 2)}</td>
                  <td
                    className="num mono fw-600"
                    style={{
                      color: a.dir === "up" ? "var(--danger)" : "var(--ok)",
                    }}
                  >
                    {INR(a.current, 2)}
                  </td>
                  <td
                    className="num mono fw-700"
                    style={{ color: a.pct > 0 ? "var(--danger)" : "var(--ok)" }}
                  >
                    {a.pct > 0 ? "▲" : "▼"} {Math.abs(a.pct).toFixed(1)}%
                  </td>
                  <td>
                    <div className="flex items-end h-24" style={{ gap: 1 }}>
                      {a.trend.map((v, j) => {
                        const h =
                          ((v - Math.min(...a.trend)) /
                            (Math.max(...a.trend) - Math.min(...a.trend) ||
                              1)) *
                            18 +
                          3;
                        return (
                          <div
                            key={j}
                            style={{
                              width: 12,
                              height: h,
                              background:
                                a.dir === "up" ? "var(--danger)" : "var(--ok)",
                              borderRadius: "1px 1px 0 0",
                              opacity: 0.3 + (j / a.trend.length) * 0.7,
                            }}
                          />
                        );
                      })}
                    </div>
                  </td>
                  <td>
                    <span
                      className={
                        "status " +
                        (a.status === "active" ? "review" : "released") +
                        " fs-9"
                      }
                    >
                      {a.status.toUpperCase()}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
PriceAlertsModal.propTypes = { open: PropTypes.bool, onClose: PropTypes.func };

export { PriceAlertsModal };
export default PriceAlertsModal;
