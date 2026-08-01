import PropTypes from "prop-types";
import { useEffect, useState } from "react";

import { __t } from "../../i18n";
import { INR, Icon } from "../../globals";
import { Modal } from "../ui/Modal.jsx";
import { Button } from "../ui/Button.jsx";
import { DataTable } from "../ui/DataTable.jsx";
import { StatusPill } from "../ui/Badge.jsx";
import { EmptyState, Spinner } from "../ui/Feedback.jsx";
import { api } from "../../../api.js";
import { toast } from "../../utils/toast";

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
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all");
  const [threshold, setThreshold] = useState(5);

  // Derived from real /price-history records (grouped per part, oldest vs.
  // newest recorded price). There is no backend concept of an alert being
  // "resolved"/dismissed yet — every computed entry is reported as "active"
  // so the Resolved filter honestly returns empty instead of fabricating a
  // resolution state.
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const history = await api.priceHistory.list({ per_page: 500 });
        const records = Array.isArray(history?.items) ? history.items : [];

        const byPart = new Map();
        for (const rec of records) {
          if (rec == null || rec.partId == null || rec.price == null) continue;
          const list = byPart.get(rec.partId) || [];
          list.push(rec);
          byPart.set(rec.partId, list);
        }
        // Only parts with 2+ recorded price points have a real change to show.
        const partIds = [...byPart.keys()].filter(
          (id) => byPart.get(id).length >= 2,
        );

        const parts = await Promise.all(
          partIds.map((id) => api.parts.get(id).catch(() => null)),
        );
        const partById = new Map(partIds.map((id, i) => [id, parts[i]]));

        const computed = partIds
          .map((id) => {
            const recs = byPart
              .get(id)
              .slice()
              .sort(
                (a, b) =>
                  new Date(a.effectiveDate || a.recordedAt) -
                  new Date(b.effectiveDate || b.recordedAt),
              );
            const base = Number(recs[0].price);
            const current = Number(recs[recs.length - 1].price);
            const trend = recs.map((r) => Number(r.price)).filter(Number.isFinite);
            if (!Number.isFinite(base) || !Number.isFinite(current) || base === 0) {
              return null;
            }
            const part = partById.get(id);
            return {
              key: id,
              pn: part?.pn || `Part #${id}`,
              name: part?.name || "—",
              vendor: part?.vendor || "—",
              base,
              current,
              pct: ((current - base) / base) * 100,
              dir: current >= base ? "up" : "down",
              trend,
              status: "active",
            };
          })
          .filter(Boolean);

        if (!cancelled) setAlerts(computed);
      } catch (e) {
        if (!cancelled) {
          setAlerts([]);
          setError(e?.message || "Failed to load price alerts");
          toast(`Failed to load price alerts: ${e?.message || "unknown error"}`, {
            kind: "error",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

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
      {loading && (
        <div className="text-center" style={{ padding: 60 }}>
          <Spinner size="lg" label="Loading price alerts" />
          <div className="font-mono fs-11 fg-3 mt-14" aria-hidden="true">
            Loading price alerts…
          </div>
        </div>
      )}
      {!loading && error && (
        <EmptyState
          title="Couldn't load price alerts"
          message={error}
        />
      )}
      {!loading && !error && (
        <DataTable
          columns={columns}
          rows={filtered}
          getRowKey={(r) => r.key}
          ariaLabel="Price alerts"
          empty={
            <EmptyState
              title="No alerts"
              message={
                alerts.length === 0
                  ? "No parts have more than one recorded price point yet, so there's no price change to alert on. Record prices via purchase orders or quotes to start tracking."
                  : "No alerts matching filters"
              }
            />
          }
        />
      )}
    </Modal>
  );
}
PriceAlertsModal.propTypes = { open: PropTypes.bool, onClose: PropTypes.func };

export { PriceAlertsModal };
export default PriceAlertsModal;
