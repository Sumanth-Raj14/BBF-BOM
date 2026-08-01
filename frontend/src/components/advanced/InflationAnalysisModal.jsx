import PropTypes from "prop-types";
import { useEffect, useState } from "react";

import { Icon, INR } from "../../globals";
import { Button, EmptyState, Modal, Spinner } from "../ui";
import { api } from "../../../api.js";
import { toast } from "../../utils/toast";

const LINE_COLORS = [
  { line: "var(--status-danger)", text: "var(--status-danger-text)" },
  { line: "var(--status-warning)", text: "var(--status-warning-text)" },
  { line: "var(--status-info)", text: "var(--status-info-text)" },
  { line: "var(--accent)", text: "var(--accent-text)" },
  { line: "var(--status-success)", text: "var(--status-success-text)" },
];

// Rounds a positive magnitude up to a "nice" chart-axis ceiling (1/2/5 * 10^n).
function niceCeil(n) {
  if (!(n > 0)) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(n)));
  const norm = n / pow;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return step * pow;
}

// Splits a per-month series (values or null for missing months) into runs of
// consecutive present points, so the trend line breaks across real data gaps
// instead of interpolating/fabricating values that were never recorded.
function buildRuns(series) {
  const runs = [];
  let current = [];
  series.forEach((v, i) => {
    if (v == null) {
      if (current.length) runs.push(current);
      current = [];
    } else {
      current.push([i, v]);
    }
  });
  if (current.length) runs.push(current);
  return runs;
}

function InflationAnalysisModal({ open, onClose }) {
  const [categories, setCategories] = useState(null); // null = not fetched yet
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.analytics
      .inflation()
      .then((data) => {
        if (cancelled) return;
        setCategories(Array.isArray(data?.categories) ? data.categories : []);
      })
      .catch((e) => {
        if (cancelled) return;
        setCategories([]);
        const msg = e?.message || "Failed to load inflation data";
        setError(msg);
        toast(msg, { kind: "error" });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, reloadKey]);

  if (!open) return null;

  const cats = (categories || []).map((c, i) => ({
    ...c,
    color: LINE_COLORS[i % LINE_COLORS.length].line,
    text: LINE_COLORS[i % LINE_COLORS.length].text,
  }));
  const hasData = cats.length > 0;

  const overallRate = hasData
    ? cats.reduce((s, c) => s + (c.changePct || 0), 0) / cats.length
    : null;
  const highest = hasData
    ? [...cats].sort((a, b) => (b.changePct || 0) - (a.changePct || 0))[0]
    : null;

  // Unified month axis so every category's line shares the same x-position
  // scale, even when categories have recorded prices in different months.
  const allMonths = hasData
    ? Array.from(
        new Set(cats.flatMap((c) => (c.points || []).map((p) => p.month))),
      ).sort()
    : [];

  // Per-category % change from that category's own baseline, aligned to
  // allMonths (null where that category has no recorded price that month).
  const seriesByCategory = cats.map((c) => {
    const byMonth = new Map((c.points || []).map((p) => [p.month, p]));
    return allMonths.map((m) => {
      const p = byMonth.get(m);
      if (!p || !c.baseline) return null;
      return ((p.avgPrice - c.baseline) / c.baseline) * 100;
    });
  });

  const allValues = seriesByCategory.flat().filter((v) => v != null);
  const hasNegative = allValues.some((v) => v < 0);
  const rangeMax = niceCeil(Math.max(1, ...allValues.map((v) => Math.abs(v))));
  const rangeMin = hasNegative ? -rangeMax : 0;
  const span = rangeMax - rangeMin || 1;
  const toY = (v) => 200 - ((v - rangeMin) / span) * 200;
  const yTicks = hasNegative
    ? [rangeMax, rangeMax / 2, 0, -rangeMax / 2, -rangeMax]
    : [rangeMax, (rangeMax * 2) / 3, rangeMax / 3, 0];

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Chart size={16} />}
      title="Inflation Analysis"
      subtitle={
        hasData
          ? `Overall: ${overallRate.toFixed(1)}% · ${cats.length} categor${cats.length === 1 ? "y" : "ies"} tracked`
          : "Category price-trend data"
      }
      size="xl"
      footer={
        <>
          <span
            className="font-mono fs-10 fg-3"
            style={{ marginRight: "auto" }}
          >
            Data sourced from recorded part price history
          </span>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      {loading && (
        <div className="text-center" style={{ padding: 60 }}>
          <Spinner size="lg" label="Loading inflation data" />
          <div className="font-mono fs-11 fg-3 mt-14" aria-hidden="true">
            Loading inflation data…
          </div>
        </div>
      )}

      {!loading && !hasData && (
        <EmptyState
          icon={<Icon.Chart size={28} />}
          title={error ? "Unable to load inflation data" : "No inflation data yet"}
          message={
            error ||
            "No categories have at least two months of recorded price history yet. Record part prices over time (Price History) to see category trends here."
          }
          actions={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setReloadKey((k) => k + 1)}
            >
              Retry
            </Button>
          }
        />
      )}

      {!loading && hasData && (
        <>
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
              <div
                className="fs-14 fw-700"
                style={{ color: "var(--accent-text)" }}
              >
                {highest.category}
              </div>
            </div>
          </div>

          {allMonths.length >= 2 && (
            <div className="border-line rounded-r2 overflow-h mb-14">
              <div
                className="bg-sunk font-mono fs-9 uppercase letter-sp-6 fg-3 border-bottom"
                style={{ padding: "8px 12px" }}
              >
                Category trends (% change from baseline)
              </div>
              <div style={{ padding: "16px 20px" }}>
                <div
                  className="flex pos-relative h-200"
                  style={{ gap: 0 }}
                  role="img"
                  aria-label={`Price trend by category, percent change from baseline: ${cats
                    .map(
                      (c) =>
                        `${c.category} moved from ${INR(c.baseline, 2)} to ${INR(c.current, 2)} (${c.changePct > 0 ? "+" : ""}${c.changePct.toFixed(1)}%)`,
                    )
                    .join("; ")}`}
                >
                  <div className="flex flex-col justify-between pr-8 font-mono fs-9 fg-3">
                    {yTicks.map((t) => (
                      <span key={t}>{t.toFixed(0)}%</span>
                    ))}
                  </div>
                  <div className="flex-1 relative">
                    {cats.map((cat, ci) => (
                      <svg
                        key={cat.category}
                        className="pos-absolute w-100p h-100p"
                        style={{ top: 0, left: 0 }}
                        aria-hidden="true"
                      >
                        {buildRuns(seriesByCategory[ci]).map((run, ri) => (
                          <polyline
                            key={ri}
                            points={run
                              .map(
                                ([i, v]) =>
                                  `${(i / Math.max(allMonths.length - 1, 1)) * 100}% ${toY(v)}`,
                              )
                              .join(" ")}
                            fill="none"
                            stroke={cat.color}
                            strokeWidth="1.5"
                            opacity="0.8"
                          />
                        ))}
                      </svg>
                    ))}
                    <div
                      className="pos-absolute flex justify-between font-mono fs-9 fg-3"
                      style={{ bottom: -20, left: 0, right: 0 }}
                    >
                      {allMonths.map((m) => (
                        <span key={m}>{m}</span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex gap-16 mt-28" style={{ flexWrap: "wrap" }}>
                  {cats.map((c) => (
                    <span
                      key={c.category}
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
                      {c.category}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="border-line rounded-r2 overflow-x-a">
            <table className="bom-table table-auto">
              <caption className="sr-only">
                Inflation by category, baseline versus current average price
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
                {cats.map((c) => {
                  const pct = c.changePct || 0;
                  return (
                    <tr key={c.category}>
                      <td className="pl-12">
                        <span className="inline-flex items-center gap-8">
                          <span
                            aria-hidden="true"
                            className="br-2"
                            style={{
                              width: 10,
                              height: 10,
                              background: c.color,
                            }}
                          />
                          <span className="fw-500">{c.category}</span>
                        </span>
                      </td>
                      <td className="num mono">{INR(c.baseline, 2)}</td>
                      <td className="num mono fw-600">{INR(c.current, 2)}</td>
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
        </>
      )}
    </Modal>
  );
}
InflationAnalysisModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
};

export { InflationAnalysisModal };
export default InflationAnalysisModal;
