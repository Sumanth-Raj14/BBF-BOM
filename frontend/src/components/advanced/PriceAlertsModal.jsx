import PropTypes from "prop-types";
import { useState } from "react";

import { __t } from "../../i18n";
import { INR, Icon } from "../../globals";
import { Modal } from "../ui/Modal.jsx";
import { Button } from "../ui/Button.jsx";
import { DataTable } from "../ui/DataTable.jsx";
import { StatusPill } from "../ui/Badge.jsx";
import { EmptyState } from "../ui/Feedback.jsx";

const FILTERS = [
  ["all", "All"],
  ["active", "Active"],
  ["resolved", "Resolved"],
  ["up", "Up"],
  ["down", "Down"],
];
const THRESHOLDS = [3, 5, 10, 20];

function Trend({ values, dir }) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const color = dir === "up" ? "var(--status-danger)" : "var(--status-success)";
  return (
    <div>
      <span className="sr-only">
        {dir === "up" ? "Price trending up" : "Price trending down"}
      </span>
      <div
        className="flex items-end h-24"
        style={{ gap: 1 }}
        aria-hidden="true"
      >
        {values.map((v, j) => {
          const h = ((v - min) / range) * 18 + 3;
          return (
            <div
              key={j}
              style={{
                width: 12,
                height: h,
                background: color,
                borderRadius: "1px 1px 0 0",
                opacity: 0.3 + (j / values.length) * 0.7,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function PriceAlertsModal({ open, onClose }) {
  const [alerts] = useState([
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
  const [filter, setFilter] = useState("all");
  const [threshold, setThreshold] = useState(5);

  if (!open) return null;

  const filtered = alerts
    .filter((a) => {
      if (filter === "active") return a.status === "active";
      if (filter === "resolved") return a.status === "resolved";
      if (filter === "up") return a.dir === "up";
      if (filter === "down") return a.dir === "down";
      return true;
    })
    .filter((a) => Math.abs(a.pct) >= threshold);

  const activeCount = alerts.filter((a) => a.status === "active").length;

  const columns = [
    {
      key: "pn",
      header: "Part No.",
      render: (r) => <span className="mono fw-600">{r.pn}</span>,
    },
    { key: "name", header: "Name" },
    { key: "vendor", header: "Vendor" },
    {
      key: "base",
      header: "Base",
      align: "num",
      render: (r) => <span className="mono">{INR(r.base, 2)}</span>,
    },
    {
      key: "current",
      header: "Current",
      align: "num",
      render: (r) => (
        <span
          className="mono fw-600"
          style={{
            color:
              r.dir === "up"
                ? "var(--status-danger-text)"
                : "var(--status-success-text)",
          }}
        >
          {INR(r.current, 2)}
        </span>
      ),
    },
    {
      key: "pct",
      header: "Change",
      align: "num",
      render: (r) => (
        <span
          className="mono fw-700"
          style={{
            color:
              r.pct > 0
                ? "var(--status-danger-text)"
                : "var(--status-success-text)",
          }}
        >
          {r.pct > 0 ? "▲" : "▼"} {Math.abs(r.pct).toFixed(1)}%
        </span>
      ),
    },
    {
      key: "trend",
      header: "Trend",
      render: (r) => <Trend values={r.trend} dir={r.dir} />,
    },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <StatusPill
          status={r.status}
          tone={r.status === "active" ? "warning" : "success"}
          label={r.status.toUpperCase()}
        />
      ),
    },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Chart size={16} />}
      title="Price Alerts"
      subtitle={`${activeCount} active`}
      size="xl"
      footer={
        <>
          <span
            style={{
              marginRight: "auto",
              fontSize: "var(--fs-100)",
              color: "var(--text-muted)",
            }}
          >
            Threshold: ≥{threshold}% change
          </span>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      <div
        className="flex gap-12 mb-14 items-center"
        style={{ flexWrap: "wrap" }}
      >
        <div
          className="flex gap-6"
          role="group"
          aria-label="Filter alerts by status or direction"
        >
          {FILTERS.map(([k, l]) => (
            <Button
              key={k}
              type="button"
              variant={filter === k ? "primary" : "secondary"}
              size="sm"
              aria-pressed={filter === k}
              onClick={() => setFilter(k)}
            >
              {l}
            </Button>
          ))}
        </div>
        <div
          className="flex gap-6 items-center font-mono fs-11"
          role="group"
          aria-label="Minimum change threshold"
        >
          <span aria-hidden="true">
            {__t("advanced.priceAlerts.threshold") || "Threshold"}:
          </span>
          {THRESHOLDS.map((t) => (
            <Button
              key={t}
              type="button"
              variant={threshold === t ? "primary" : "secondary"}
              size="sm"
              aria-pressed={threshold === t}
              aria-label={`${t} percent threshold`}
              onClick={() => setThreshold(t)}
            >
              {t}%
            </Button>
          ))}
        </div>
      </div>
      <DataTable
        columns={columns}
        rows={filtered}
        getRowKey={(r) => r.pn}
        ariaLabel="Price alerts"
        empty={
          <EmptyState
            title="No alerts"
            message="No alerts matching filters"
          />
        }
      />
    </Modal>
  );
}
PriceAlertsModal.propTypes = { open: PropTypes.bool, onClose: PropTypes.func };

export { PriceAlertsModal };
export default PriceAlertsModal;
