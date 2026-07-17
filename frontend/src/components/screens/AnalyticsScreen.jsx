import PropTypes from "prop-types";

import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import {
  BOM_DATA,
  DropdownButton,
  INR,
  analyticsAPI,
  downloadBlob,
  useAppStore,
} from "../../globals";
// ============ ANALYTICS ============
export default function AnalyticsScreen({ data }) {
  const ctx = useAppStore();
  const [range, setRange] = React.useState("6 mo");
  const [apiData, setApiData] = React.useState(null);
  const [, setLoading] = React.useState(false);

  // Load analytics from API on mount
  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([analyticsAPI?.dashboard(), analyticsAPI?.categories()])
      .then(([dash, cats]) => {
        if (!cancelled) {
          setApiData({ dashboard: dash, categories: cats });
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Range-dependent data
  const rangeData = {
    "1 mo": {
      months: ["W1", "W2", "W3", "W4"],
      costs: [4126, 4150, 4180, 4218],
      delta: "+2.2%",
    },
    "3 mo": {
      months: ["Mar", "Apr", "May"],
      costs: [4040, 4126, 4218],
      delta: "+4.4%",
    },
    "6 mo": {
      months: ["Dec", "Jan", "Feb", "Mar", "Apr", "May"],
      costs: [3820, 3905, 3960, 4040, 4126, 4218],
      delta: "+10.4%",
    },
    "1 yr": {
      months: ["Jun", "Aug", "Oct", "Dec", "Feb", "Apr"],
      costs: [3650, 3720, 3780, 3820, 3960, 4218],
      delta: "+15.6%",
    },
    "All time": {
      months: [
        "2024",
        "Q3'24",
        "Q4'24",
        "2025",
        "Q1'25",
        "Q2'25",
        "Q3'25",
        "Q4'25",
        "Q1'26",
        "2026",
      ],
      costs: [3200, 3340, 3480, 3520, 3650, 3780, 3820, 3960, 4126, 4218],
      delta: "+31.8%",
    },
  };
  const { months, costs, delta } = rangeData[range] || rangeData["6 mo"];

  const baseKpis = [
    {
      l: __t("analytics.totalParts") || "Total Parts",
      v: apiData?.dashboard?.totalParts?.toLocaleString() || "1,284",
      d: "+12",
      up: false,
    },
    {
      l: __t("analytics.activeBoms") || "Active BOMs",
      v: apiData?.dashboard?.totalPOs?.toString() || "23",
      d: "+2",
      up: false,
    },
    {
      l: __t("analytics.currentBomCost") || "Current BOM Cost",
      v: INR(costs[costs.length - 1], 0),
      d: delta,
      up: true,
    },
    {
      l: __t("analytics.avgLead") || "Avg Lead",
      v: "21d",
      d: range === "1 mo" ? "+1d" : "+3d",
      up: true,
    },
    {
      l: __t("analytics.preferredVendors") || "Preferred Vendors",
      v: "8 / " + (apiData?.dashboard?.totalVendors || 14),
      d: "\u2014",
      up: false,
    },
    {
      l: __t("analytics.countryRisk") || "Country Risk",
      v: "Med",
      d: "3 high",
      up: true,
    },
    {
      l: __t("analytics.duplicatesFlagged") || "Duplicates Flagged",
      v: "5",
      d: "\u22122",
      up: false,
    },
    {
      l: __t("analytics.onTimePoRate") || "On-time PO Rate",
      v: range === "All time" ? "89%" : "94%",
      d: range === "All time" ? "\u22123.4%" : "+1.2%",
      up: range === "All time",
    },
  ];

  const max = Math.max(...costs),
    min = Math.min(...costs);

  return (
    <div className="screen-wrap">
      <div className="screen-header">
        <div>
          <h1>{__t("nav.analytics") || "Analytics"}</h1>
          <div className="sub">
            {__t("analytics.projectAtlas") || "Project ATLAS"} ·{" "}
            {__t("analytics.last") || "Last"} {range}
          </div>
        </div>
        <div className="flex gap-8">
          <DropdownButton
            width={160}
            trigger={
              <button className="btn">
                {range} <Icon.ChevronDown size={10} />
              </button>
            }
            items={["1 mo", "3 mo", "6 mo", "1 yr", "All time"].map((r) => ({
              icon:
                r === range ? (
                  <Icon.Check size={11} />
                ) : (
                  <span className="w-11" />
                ),
              label:
                r === "All time" ? __t("analytics.allTime") || "All time" : r,
              onClick: () => setRange(r),
            }))}
          />
          <button
            className="btn"
            onClick={() => ctx?.openModal("price-alerts")}
          >
            <Icon.Chart size={12} />{" "}
            {__t("analytics.priceAlerts") || "Price alerts"}
          </button>
          <button className="btn" onClick={() => ctx?.openModal("inflation")}>
            <Icon.Chart size={12} /> {__t("analytics.inflation") || "Inflation"}
          </button>
          <DropdownButton
            width={180}
            trigger={
              <button className="btn">
                <Icon.Export size={12} /> {__t("common.export") || "Export"}{" "}
                <Icon.ChevronDown size={10} />
              </button>
            }
            items={[
              {
                icon: <Icon.Doc size={11} />,
                label: __t("analytics.pdfReport") || "PDF report",
                onClick: () => {
                  toast(
                    __t("analytics.generatingPdf") || "Generating PDF\u2026",
                  );
                  setTimeout(() => {
                    downloadBlob &&
                      downloadBlob(
                        __t("analytics.reportContent") ||
                          "Analytics report (mock PDF)\nProject ATLAS \u00B7 " +
                            range +
                            "\n\nPeriod: " +
                            months[0] +
                            " \u2013 " +
                            months[months.length - 1] +
                            "\nCurrent BOM: " +
                            INR(costs[costs.length - 1], 0) +
                            "\nDelta: " +
                            delta +
                            "\n\nCharts and KPI data included.",
                        "analytics_report.pdf",
                        "application/pdf",
                      );
                    toast(
                      __t("analytics.downloadedReport") ||
                        "Downloaded analytics_report.pdf",
                      { kind: "success" },
                    );
                  }, 800);
                },
              },
              {
                icon: <Icon.Doc size={11} />,
                label: __t("analytics.pngCharts") || "PNG charts",
                onClick: () => {
                  toast(
                    __t("analytics.generatingChart") ||
                      "Generating chart image\u2026",
                  );
                  setTimeout(() => {
                    const c = document.createElement("canvas");
                    c.width = 800;
                    c.height = 360;
                    const cx = c.getContext("2d");
                    if (!cx) {
                      toast(
                        __t("analytics.pngNotAvailable") ||
                          "PNG export not available",
                        { kind: "warn" },
                      );
                      return;
                    }
                    const pad = { t: 30, r: 20, b: 40, l: 60 };
                    const w = c.width - pad.l - pad.r,
                      h = c.height - pad.t - pad.b;
                    const cRange = Math.max(...costs) - Math.min(...costs) || 1;
                    const cMin = Math.min(...costs);
                    cx.fillStyle = "#fff";
                    cx.fillRect(0, 0, c.width, c.height);
                    cx.strokeStyle = "#e0e0e0";
                    cx.lineWidth = 0.5;
                    for (let i = 0; i < 4; i++) {
                      const y = pad.t + (i / 3) * h;
                      cx.beginPath();
                      cx.moveTo(pad.l, y);
                      cx.lineTo(pad.l + w, y);
                      cx.stroke();
                    }
                    cx.fillStyle = "#666";
                    cx.font = "10px monospace";
                    cx.textAlign = "right";
                    [
                      cMin,
                      (cMin + Math.max(...costs)) / 2,
                      Math.max(...costs),
                    ].forEach((v, i) => {
                      cx.fillText(
                        "\u20B9" +
                          ((v * (window.INR_RATE || 83)) / 100000).toFixed(1) +
                          "L",
                        pad.l - 6,
                        pad.t + (i / 2) * h + 4,
                      );
                    });
                    cx.strokeStyle = "#6366f1";
                    cx.lineWidth = 2;
                    const pts = costs.map((v, i) => ({
                      x: pad.l + (i / (costs.length - 1)) * w,
                      y: pad.t + (1 - (v - cMin) / cRange) * h,
                    }));
                    cx.beginPath();
                    pts.forEach((p, i) => {
                      i === 0 ? cx.moveTo(p.x, p.y) : cx.lineTo(p.x, p.y);
                    });
                    cx.stroke();
                    pts.forEach((p, i) => {
                      cx.fillStyle = "#6366f1";
                      cx.beginPath();
                      cx.arc(p.x, p.y, 3, 0, Math.PI * 2);
                      cx.fill();
                    });
                    cx.fillStyle = "#999";
                    cx.font = "9px monospace";
                    cx.textAlign = "center";
                    months.forEach((m, i) => {
                      cx.fillText(m, pts[i].x, c.height - pad.b + 16);
                    });
                    cx.fillStyle = "#222";
                    cx.font = "bold 12px sans-serif";
                    cx.textAlign = "left";
                    cx.fillText(
                      (__t("analytics.bomCostTrend") || "BOM Cost Trend") +
                        " \u00B7 " +
                        range,
                      pad.l,
                      18,
                    );
                    c.toBlob((blob) => {
                      if (blob) {
                        downloadBlob &&
                          downloadBlob(
                            blob,
                            "analytics_charts.png",
                            "image/png",
                          );
                        toast(
                          __t("analytics.downloadedPng") ||
                            "Downloaded analytics_charts.png",
                          { kind: "success" },
                        );
                      }
                    });
                  }, 200);
                },
              },
              {
                icon: <Icon.Doc size={11} />,
                label: __t("analytics.csvData") || "CSV data",
                onClick: () => {
                  downloadBlob &&
                    downloadBlob(
                      "month,cost_usd\n" +
                        months.map((m, i) => m + "," + costs[i]).join("\n"),
                      "analytics_" + range.replace(" ", "_") + ".csv",
                      "text/csv",
                    );
                  toast(__t("analytics.csvDownloaded") || "CSV downloaded", {
                    kind: "success",
                  });
                },
              },
            ]}
          />
        </div>
      </div>

      <div
        className="kpi-grid"
        style={{ gridTemplateColumns: "repeat(4, 1fr)" }}
      >
        {baseKpis.map((k) => (
          <div key={k.l} className="kpi">
            <div className="l">{k.l}</div>
            <div className="v">{k.v}</div>
            <div
              className="d"
              style={{
                color:
                  k.d === "—"
                    ? "var(--fg-3)"
                    : k.up
                      ? "var(--danger)"
                      : "var(--ok)",
              }}
            >
              {k.up
                ? "▲"
                : k.d.startsWith("−") || k.d.startsWith("-")
                  ? "▼"
                  : "•"}{" "}
              {k.d}
            </div>
          </div>
        ))}
      </div>

      <div className="charts-grid">
        <div className="card">
          <div className="card-h">
            <h3>
              {__t("analytics.bomCost") || "BOM cost"} ·{" "}
              {__t("analytics.last") || "last"} {range}
            </h3>
            <span className="hint">
              {delta} vs {months[0]}
            </span>
          </div>
          <div className="trend">
            <svg viewBox="0 0 600 180" className="w-100p h-180">
              {[0, 1, 2, 3].map((i) => (
                <line
                  key={"grid-" + i}
                  x1="40"
                  x2="590"
                  y1={20 + i * 40}
                  y2={20 + i * 40}
                  stroke="var(--line-soft)"
                  strokeWidth="1"
                />
              ))}
              {[max, (max + min) / 2, min].map((v, i) => (
                <text
                  key={"ylbl-" + i}
                  x="32"
                  y={24 + i * 60}
                  textAnchor="end"
                  fontSize="9"
                  fontFamily="var(--font-mono)"
                  fill="var(--fg-3)"
                >
                  ₹{((v * (window.INR_RATE || 83)) / 100000).toFixed(1)}L
                </text>
              ))}
              {(() => {
                const w = 550,
                  h = 140,
                  pad = 20;
                const x0 = 40;
                const range = max - min || 1;
                const pts = costs.map((v, i) => {
                  const x = x0 + (i / (costs.length - 1)) * w;
                  const y = pad + (1 - (v - min) / range) * (h - pad);
                  return [x, y];
                });
                const linePath = pts
                  .map((p, i) => (i === 0 ? "M" : "L") + p[0] + " " + p[1])
                  .join(" ");
                const areaPath =
                  linePath +
                  ` L ${pts[pts.length - 1][0]} ${pad + h} L ${pts[0][0]} ${pad + h} Z`;
                return (
                  <>
                    <path
                      d={areaPath}
                      fill="var(--accent-soft)"
                      opacity="0.6"
                    />
                    <path
                      d={linePath}
                      fill="none"
                      stroke="var(--accent)"
                      strokeWidth="2"
                    />
                    {pts.map((p, i) => (
                      <g key={"pt-" + i}>
                        <circle
                          cx={p[0]}
                          cy={p[1]}
                          r={i === pts.length - 1 ? 4 : 2.5}
                          fill="var(--accent)"
                        />
                        <text
                          x={p[0]}
                          y={170}
                          textAnchor="middle"
                          fontSize="9"
                          fontFamily="var(--font-mono)"
                          fill="var(--fg-3)"
                        >
                          {months[i]}
                        </text>
                      </g>
                    ))}
                  </>
                );
              })()}
            </svg>
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <h3>{__t("analytics.costByCategory") || "Cost by category"}</h3>
          </div>
          <div
            style={{ gridTemplateColumns: "1fr 1fr", padding: 12 }}
            className="gap-12 d-grid"
          >
            <div>
              <svg
                viewBox="0 0 100 100"
                className="w-100p d-block"
                style={{ maxWidth: 160, margin: "0 auto" }}
              >
                {(() => {
                  const cats = [
                    { l: "Electrical", v: 38, c: "oklch(0.55 0.13 240)" },
                    { l: "Optical", v: 24, c: "oklch(0.55 0.13 320)" },
                    { l: "Mechanical", v: 19, c: "oklch(0.55 0.08 60)" },
                    { l: "Cable", v: 11, c: "oklch(0.55 0.10 280)" },
                    { l: "Hardware", v: 5, c: "oklch(0.55 0.10 145)" },
                    { l: "Other", v: 3, c: "var(--fg-3)" },
                  ];
                  const total = cats.reduce((s, c) => s + c.v, 0);
                  const r = 38,
                    cx = 50,
                    cy = 50;
                  let cum = 0;
                  return cats.map((c, i) => {
                    const a1 = (cum / total) * 360;
                    cum += c.v;
                    const a2 = (cum / total) * 360;
                    const toRad = (d) => ((d - 90) * Math.PI) / 180;
                    const x1 = cx + r * Math.cos(toRad(a1));
                    const y1 = cy + r * Math.sin(toRad(a1));
                    const x2 = cx + r * Math.cos(toRad(a2));
                    const y2 = cy + r * Math.sin(toRad(a2));
                    const large = a2 - a1 > 180 ? 1 : 0;
                    const d = `M${cx} ${cy} L${x1.toFixed(1)} ${y1.toFixed(1)} A${r} ${r} 0 ${large} 1 ${x2.toFixed(1)} ${y2.toFixed(1)} Z`;
                    return (
                      <path
                        key={"slice-" + i}
                        d={d}
                        fill={c.c}
                        stroke="var(--bg)"
                        strokeWidth="0.5"
                      />
                    );
                  });
                })()}
                <circle cx="50" cy="50" r="18" fill="var(--bg)" />
                <text
                  x="50"
                  y="47"
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="700"
                  fill="var(--fg)"
                >
                  ₹{((4218.4 * (window.INR_RATE || 83)) / 100000).toFixed(1)}L
                </text>
                <text
                  x="50"
                  y="58"
                  textAnchor="middle"
                  fontSize="5"
                  fill="var(--fg-3)"
                >
                  {__t("analytics.totalBom") || "Total BOM"}
                </text>
              </svg>
            </div>
            <div className="flex gap-6 flex-col justify-center">
              {[
                { l: "Electrical", v: 38, c: "oklch(0.55 0.13 240)" },
                { l: "Optical", v: 24, c: "oklch(0.55 0.13 320)" },
                { l: "Mechanical", v: 19, c: "oklch(0.55 0.08 60)" },
                { l: "Cable", v: 11, c: "oklch(0.55 0.10 280)" },
                { l: "Hardware", v: 5, c: "oklch(0.55 0.10 145)" },
                { l: "Other", v: 3, c: "var(--fg-3)" },
              ].map((c) => (
                <div
                  key={c.l}
                  className="flex items-center gap-6 font-mono fs-10"
                >
                  <span
                    style={{ background: c.c }}
                    className="flex-shrink-0 w-8 h-8 br-2"
                  />
                  <span className="flex-1">{c.l}</span>
                  <span className="fw-600">{c.v}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="charts-grid">
        <div className="card">
          <div className="card-h">
            <h3>
              {__t("analytics.vendorScorecards") || "Vendor scorecards"} · top 6
            </h3>
          </div>
          <div style={{ padding: 4 }}>
            <table className="bom-table table-auto">
              <thead>
                <tr>
                  <th className="pl-12">
                    {__t("analytics.vendor") || "Vendor"}
                  </th>
                  <th className="num">
                    {__t("analytics.onTime") || "On-time"}
                  </th>
                  <th className="num">
                    {__t("analytics.quality") || "Quality"}
                  </th>
                  <th className="num">{__t("analytics.cost") || "Cost"}</th>
                  <th className="num">{__t("analytics.lead") || "Lead"}</th>
                  <th>{__t("analytics.score") || "Score"}</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["McMaster", 99, 99, 92, 95, "A+"],
                  ["Noctua", 96, 98, 88, 87, "A"],
                  ["Panasonic", 94, 96, 85, 78, "A"],
                  ["Mean Well", 92, 95, 90, 75, "A"],
                  ["Protolabs", 89, 94, 82, 92, "B+"],
                  ["Daly", 71, 82, 95, 60, "C"],
                ].map((r, i) => (
                  <tr
                    key={r[0]}
                    onClick={() => window.__nav?.("vendors")}
                    className="cursor-pointer"
                  >
                    <td className="pl-12 fw-600">{r[0]}</td>
                    {[1, 2, 3, 4].map((j) => (
                      <td key={j} className="num">
                        <span className="items-center gap-6 inline-flex">
                          <span className="bg-sunk relative overflow-h d-iblock w-28 h-4 br-2">
                            <span
                              style={{
                                inset: 0,
                                width: r[j] + "%",
                                background:
                                  r[j] >= 90
                                    ? "var(--ok)"
                                    : r[j] >= 75
                                      ? "var(--warn)"
                                      : "var(--danger)",
                              }}
                              className="absolute"
                            />
                          </span>
                          {r[j]}
                        </span>
                      </td>
                    ))}
                    <td>
                      <span
                        style={{
                          color: r[5].startsWith("A")
                            ? "var(--ok)"
                            : r[5].startsWith("B")
                              ? "var(--warn)"
                              : "var(--danger)",
                        }}
                        className="font-mono fw-700"
                      >
                        {r[5]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <h3>
              {__t("analytics.countryDependency") || "Country dependency"}
            </h3>
          </div>
          <div style={{ padding: 16 }}>
            {[
              { c: "US", n: "United States", pct: 42 },
              { c: "CN", n: "China", pct: 24 },
              { c: "JP", n: "Japan", pct: 12 },
              { c: "TW", n: "Taiwan", pct: 10 },
              { c: "FR", n: "France", pct: 8 },
              { c: "AT", n: "Austria", pct: 4 },
            ].map((c) => (
              <div
                key={c.c}
                style={{ gridTemplateColumns: "36px 1fr 50px" }}
                className="gap-8 items-center mb-6 fs-11 font-mono d-grid"
              >
                <span className="bg-sunk items-center fs-9 fw-600 fg w-28 h-18 br-2 border-line inline-flex justify-center">
                  {c.c}
                </span>
                <span className="fg-2">{c.n}</span>
                <span className="text-right fg">{c.pct}%</span>
                <span />
                <div
                  style={{ gridColumn: "2 / 4" }}
                  className="bg-sunk overflow-h h-4 br-2"
                >
                  <div
                    className="h-100p bg-accent"
                    style={{ width: c.pct + "%" }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="charts-grid">
        <div className="card">
          <div className="card-h">
            <h3>
              {__t("analytics.vendorLeadHeatmap") ||
                "Vendor \u00D7 Lead time heat map"}
            </h3>
          </div>
          <div className="ox-auto" style={{ padding: 12 }}>
            {(() => {
              const rows = [
                {
                  v: "McMaster",
                  cats: {
                    Electrical: 2,
                    Mechanical: 3,
                    Hardware: 22,
                    Cable: 0,
                    Optical: 0,
                  },
                },
                {
                  v: "Protolabs",
                  cats: {
                    Electrical: 0,
                    Mechanical: 14,
                    Hardware: 0,
                    Cable: 0,
                    Optical: 0,
                  },
                },
                {
                  v: "STMicro",
                  cats: {
                    Electrical: 4,
                    Mechanical: 0,
                    Hardware: 0,
                    Cable: 0,
                    Optical: 0,
                  },
                },
                {
                  v: "JLCPCB",
                  cats: {
                    Electrical: 6,
                    Mechanical: 0,
                    Hardware: 0,
                    Cable: 0,
                    Optical: 0,
                  },
                },
                {
                  v: "Mean Well",
                  cats: {
                    Electrical: 8,
                    Mechanical: 0,
                    Hardware: 0,
                    Cable: 0,
                    Optical: 0,
                  },
                },
                {
                  v: "Panasonic",
                  cats: {
                    Electrical: 5,
                    Mechanical: 0,
                    Hardware: 0,
                    Cable: 0,
                    Optical: 0,
                  },
                },
                {
                  v: "Edmund",
                  cats: {
                    Electrical: 0,
                    Mechanical: 0,
                    Hardware: 0,
                    Cable: 0,
                    Optical: 3,
                  },
                },
                {
                  v: "Arducam",
                  cats: {
                    Electrical: 0,
                    Mechanical: 0,
                    Hardware: 0,
                    Cable: 0,
                    Optical: 2,
                  },
                },
                {
                  v: "Noctua",
                  cats: {
                    Electrical: 3,
                    Mechanical: 0,
                    Hardware: 0,
                    Cable: 0,
                    Optical: 0,
                  },
                },
              ];
              const catKeys = [
                "Electrical",
                "Mechanical",
                "Hardware",
                "Cable",
                "Optical",
              ];
              const maxVal = Math.max(
                ...rows.flatMap((r) => catKeys.map((k) => r.cats[k])),
              );
              return (
                <div style={{ minWidth: 520 }}>
                  <div
                    style={{
                      gridTemplateColumns:
                        "100px repeat(" + catKeys.length + ", 1fr)",
                    }}
                    className="font-mono fs-9 d-grid gap-2"
                  >
                    <div style={{ padding: "4px 6px" }} className="fg-3">
                      Vendor
                    </div>
                    {catKeys.map((k) => (
                      <div
                        key={k}
                        style={{ padding: "4px 6px" }}
                        className="text-center fg-3 fw-600"
                      >
                        {k.slice(0, 4)}
                      </div>
                    ))}
                    {rows.map((r) => (
                      <React.Fragment key={r.v}>
                        <div
                          style={{ padding: "4px 6px" }}
                          className="fw-600 fs-10 nowrap"
                        >
                          {r.v}
                        </div>
                        {catKeys.map((k) => {
                          const v = r.cats[k] || 0;
                          const intensity = maxVal > 0 ? v / maxVal : 0;
                          const hue = 240 - intensity * 200;
                          return (
                            <div
                              key={k}
                              style={{
                                padding: "6px 4px",
                                textAlign: "center",
                                borderRadius: 3,
                                background:
                                  v > 0
                                    ? `oklch(${0.85 - intensity * 0.45} 0.08 ${hue})`
                                    : "var(--bg-sunk)",
                                color: intensity > 0.5 ? "white" : "var(--fg)",
                                fontWeight: v > 0 ? 600 : 400,
                                fontSize: 11,
                              }}
                            >
                              {v > 0 ? v : "—"}
                            </div>
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </div>
                  <div className="mt-8 flex items-center gap-4 font-mono fs-9 fg-3 justify-center">
                    <span>{__t("analytics.low") || "Low"}</span>
                    {[0.1, 0.25, 0.4, 0.55, 0.7, 0.85].map((v) => (
                      <span
                        key={v}
                        style={{
                          width: 14,
                          height: 10,
                          borderRadius: 2,
                          background: `oklch(${0.85 - v * 0.45} 0.08 ${240 - v * 200})`,
                        }}
                      />
                    ))}
                    <span>{__t("analytics.high") || "High"}</span>
                    <span className="ml-12">
                      {__t("analytics.partsPerVendor") ||
                        "Parts per vendor \u00D7 category"}
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <h3>{__t("analytics.procurementAging") || "Procurement aging"}</h3>
          </div>
          <div style={{ padding: 12 }}>
            {(() => {
              const data = BOM_DATA.procurement;
              const now = new Date();
              const parseETA = (eta) => {
                if (eta === "✓" || eta === "—" || !eta) return null;
                const [m, d] = eta.split("-").map(Number);
                return new Date(2026, m - 1, d);
              };
              const items = [];
              Object.entries(data).forEach(([col, list]) => {
                list.forEach((it) => {
                  const etaDate = parseETA(it.eta);
                  if (!etaDate) return;
                  const daysDiff = Math.round(
                    (etaDate - now) / (1000 * 60 * 60 * 24),
                  );
                  items.push({ ...it, status: col, daysLeft: daysDiff });
                });
              });
              const bands = [
                {
                  label: __t("analytics.overdue") || "Overdue",
                  range: [-Infinity, 0],
                  color: "var(--danger)",
                },
                {
                  label: __t("analytics.days0to7") || "0-7 days",
                  range: [1, 7],
                  color: "var(--warn)",
                },
                {
                  label: __t("analytics.days8to14") || "8-14 days",
                  range: [8, 14],
                  color: "var(--info)",
                },
                {
                  label: __t("analytics.days15to30") || "15-30 days",
                  range: [15, 30],
                  color: "var(--accent-text)",
                },
                {
                  label: __t("analytics.days30plus") || "30+ days",
                  range: [31, Infinity],
                  color: "var(--ok)",
                },
              ];
              const bandCounts = bands.map((b) => ({
                ...b,
                count: items.filter(
                  (it) =>
                    it.daysLeft >= b.range[0] && it.daysLeft <= b.range[1],
                ).length,
              }));
              const maxCount = Math.max(...bandCounts.map((b) => b.count), 1);
              return (
                <>
                  <div className="flex gap-8 flex-col">
                    {bandCounts.map((b) => (
                      <div
                        key={b.label}
                        style={{ gridTemplateColumns: "70px 1fr 40px" }}
                        className="gap-8 items-center font-mono fs-11 d-grid"
                      >
                        <span style={{ color: b.color }} className="fw-600">
                          {b.label}
                        </span>
                        <div
                          style={{ height: 12, borderRadius: 3 }}
                          className="bg-sunk overflow-h"
                        >
                          <div
                            className="h-100p"
                            style={{
                              width: (b.count / maxCount) * 100 + "%",
                              background: b.color,
                              borderRadius: 3,
                              transition: "width 0.3s",
                            }}
                          />
                        </div>
                        <span className="text-right fw-600">{b.count}</span>
                      </div>
                    ))}
                  </div>
                  <div
                    style={{ padding: "8px 10px" }}
                    className="mt-10 bg-sunk fs-10 font-mono fg-3 border-line rounded-r2"
                  >
                    {items.filter((it) => it.daysLeft < 0).length}{" "}
                    {__t("analytics.overdue") || "overdue"} ·{" "}
                    {
                      items.filter((it) => it.daysLeft >= 0 && it.daysLeft <= 7)
                        .length
                    }{" "}
                    {__t("analytics.dueWithin7d") || "due within 7d"}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      </div>

      <div className="charts-grid">
        <div className="card">
          <div className="card-h">
            <h3>
              {__t("analytics.countryOfOrigin") ||
                "Country of origin \u2014 parts"}
            </h3>
          </div>
          <div style={{ padding: 16 }}>
            {(() => {
              const parts = (ctx?.rows || BOM_DATA.rows)[0].children.flatMap(
                (s) => s.children || [],
              );
              const counts = {};
              parts.forEach((p) => {
                const c = p.origin || "Unknown";
                counts[c] = (counts[c] || 0) + 1;
              });
              const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
              const total = sorted.reduce((s, [, c]) => s + c, 0);
              const maxCnt = Math.max(...sorted.map(([, c]) => c), 1);
              const flags = {
                US: "🇺🇸",
                CN: "🇨🇳",
                JP: "🇯🇵",
                TW: "🇹🇼",
                FR: "🇫🇷",
                AT: "🇦🇹",
                DE: "🇩🇪",
              };
              return (
                <>
                  <div className="flex gap-8 flex-col">
                    {sorted.map(([code, cnt]) => (
                      <div
                        key={code}
                        style={{ gridTemplateColumns: "28px 1fr 36px" }}
                        className="gap-8 items-center font-mono fs-11 d-grid"
                      >
                        <span className="fs-16">{flags[code] || code}</span>
                        <div
                          style={{ height: 10, borderRadius: 3 }}
                          className="bg-sunk overflow-h"
                        >
                          <div
                            className="h-100p bg-accent"
                            style={{
                              width: (cnt / maxCnt) * 100 + "%",
                              borderRadius: 3,
                            }}
                          />
                        </div>
                        <span className="text-right fw-600">{cnt}</span>
                      </div>
                    ))}
                  </div>
                  <div
                    style={{ flexWrap: "wrap" }}
                    className="mt-10 flex font-mono fs-10 fg-3 gap-10 justify-center"
                  >
                    {sorted.map(([code, cnt]) => (
                      <span key={code}>
                        {flags[code] || code} {code} —{" "}
                        {Math.round((cnt / total) * 100)}%
                      </span>
                    ))}
                  </div>
                </>
              );
            })()}
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <h3>{__t("analytics.riskByOrigin") || "Risk by origin"}</h3>
          </div>
          <div style={{ padding: 16 }}>
            <svg viewBox="0 0 300 160" className="w-100p h-160">
              {(() => {
                const hmData = [
                  { c: "CN", r: "High", v: 1 },
                  { c: "FR", r: "Med", v: 1 },
                  { c: "TW", r: "Low", v: 2 },
                  { c: "US", r: "Low", v: 9 },
                  { c: "JP", r: "Low", v: 2 },
                  { c: "AT", r: "Low", v: 1 },
                ];
                const risks = ["High", "Med", "Low"];
                const countries = ["CN", "FR", "TW", "US", "JP", "AT"];
                const cellW = 300 / (countries.length + 1);
                const cellH = 160 / (risks.length + 2);
                const maxV = Math.max(...hmData.map((d) => d.v), 1);
                return (
                  <>
                    {countries.map((c, i) => (
                      <text
                        key={c}
                        x={cellW * (i + 1) + cellW / 2}
                        y={cellH * 0.6}
                        textAnchor="middle"
                        fontSize="8"
                        fontFamily="var(--font-mono)"
                        fill="var(--fg-3)"
                      >
                        {c}
                      </text>
                    ))}
                    {risks.map((r, i) => (
                      <text
                        key={r}
                        x={cellW * 0.5}
                        y={cellH * (i + 1.5)}
                        textAnchor="middle"
                        fontSize="8"
                        fontFamily="var(--font-mono)"
                        fill="var(--fg-3)"
                      >
                        {r}
                      </text>
                    ))}
                    {hmData.map((d, i) => {
                      const col = countries.indexOf(d.c);
                      const row = risks.indexOf(d.r);
                      const intensity = d.v / maxV;
                      const hue = row === 0 ? 0 : row === 1 ? 40 : 140;
                      return (
                        <g key={d.c + "-" + d.r}>
                          <rect
                            x={cellW * (col + 1) + 2}
                            y={cellH * (row + 1) + 4}
                            width={cellW - 4}
                            height={cellH - 8}
                            rx={3}
                            fill={`oklch(${0.85 - intensity * 0.4} 0.1 ${hue})`}
                          />
                          <text
                            x={cellW * (col + 1) + cellW / 2}
                            y={cellH * (row + 1.5)}
                            textAnchor="middle"
                            fontSize="10"
                            fontFamily="var(--font-mono)"
                            fill={intensity > 0.5 ? "white" : "var(--fg)"}
                            fontWeight={600}
                          >
                            {d.v}
                          </text>
                        </g>
                      );
                    })}
                  </>
                );
              })()}
            </svg>
            <div className="mt-4 flex items-center gap-6 font-mono fs-9 fg-3 justify-center">
              <span
                className="br-2"
                style={{
                  width: 10,
                  height: 10,
                  background: "oklch(0.85 0.1 140)",
                }}
              />{" "}
              {__t("analytics.low") || "Low"}
              <span
                className="br-2"
                style={{
                  width: 10,
                  height: 10,
                  background: "oklch(0.65 0.1 40)",
                }}
              />{" "}
              {__t("analytics.med") || "Med"}
              <span
                className="br-2"
                style={{
                  width: 10,
                  height: 10,
                  background: "oklch(0.45 0.1 0)",
                }}
              />{" "}
              {__t("analytics.high") || "High"}
              <span className="ml-8">
                {__t("analytics.vendorsPerCountry") ||
                  "Vendors per country \u00D7 risk level"}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="charts-grid">
        <div className="card">
          <div className="card-h">
            <h3>{__t("analytics.bomSummaryReport") || "BOM summary report"}</h3>
            <span
              className="hint cursor-pointer"
              onClick={() => {
                const bomData = {
                  project: ctx?.project || BOM_DATA.project,
                  rows: ctx?.rows || BOM_DATA.rows,
                };
                const parts = bomData.rows[0].children.flatMap(
                  (s) => s.children || [],
                );
                const totalCost = parts.reduce(
                  (s, p) => s + (p.cost || 0) * (p.qty || 0),
                  0,
                );
                const totalParts = parts.reduce((s, p) => s + (p.qty || 0), 0);
                const catCosts = {};
                parts.forEach((p) => {
                  const c = p.category || "Other";
                  catCosts[c] =
                    (catCosts[c] || 0) + (p.cost || 0) * (p.qty || 0);
                });
                const lines = [
                  __t("analytics.bomSummaryReport") || "BOM Summary Report",
                  (__t("analytics.project") || "Project") +
                    ": " +
                    bomData.project.name +
                    " (" +
                    bomData.project.code +
                    ")",
                  (__t("analytics.version") || "Version") +
                    ": " +
                    bomData.project.version,
                  (__t("analytics.totalParts") || "Total parts") +
                    ": " +
                    totalParts,
                  (__t("analytics.uniqueParts") || "Unique parts") +
                    ": " +
                    parts.length,
                  (__t("analytics.totalBomCostUsd") || "Total BOM cost (USD)") +
                    ": $" +
                    totalCost.toFixed(2),
                  (__t("analytics.totalBomCostInr") || "Total BOM cost (INR)") +
                    ": " +
                    INR(totalCost, 2),
                  "",
                  "=== " +
                    (__t("analytics.costByCategory") || "Cost by category") +
                    " ===",
                  ...Object.entries(catCosts).map(
                    ([k, v]) =>
                      k +
                      ": $" +
                      v.toFixed(2) +
                      " (" +
                      ((v / totalCost) * 100).toFixed(1) +
                      "%)",
                  ),
                  "",
                  (__t("analytics.generated") || "Generated") +
                    ": " +
                    new Date().toISOString().slice(0, 10),
                ];
                downloadBlob(
                  lines.join("\n"),
                  "BOM_Summary_Report.txt",
                  "text/plain",
                );
                toast(
                  __t("analytics.reportDownloaded") ||
                    "BOM summary report downloaded",
                  { kind: "success" },
                );
              }}
            >
              <Icon.Export size={11} />{" "}
              {__t("analytics.downloadReport") || "Download report"}
            </span>
          </div>
          <div style={{ padding: "12px 16px" }}>
            {(() => {
              const parts = (ctx?.rows || BOM_DATA.rows)[0].children.flatMap(
                (s) => s.children || [],
              );
              const totalCost = parts.reduce(
                (s, p) => s + (p.cost || 0) * (p.qty || 0),
                0,
              );
              const totalParts = parts.reduce((s, p) => s + (p.qty || 0), 0);
              const unique = parts.length;
              const catCounts = {};
              parts.forEach((p) => {
                const c = p.category || "Other";
                catCounts[c] = (catCounts[c] || 0) + 1;
              });
              const catCosts = {};
              parts.forEach((p) => {
                const c = p.category || "Other";
                catCosts[c] = (catCosts[c] || 0) + (p.cost || 0) * (p.qty || 0);
              });
              return (
                <div className="flex flex-col gap-10">
                  <div
                    className="d-grid gap-10"
                    style={{ gridTemplateColumns: "repeat(3, 1fr)" }}
                  >
                    {[
                      {
                        l: __t("analytics.totalParts") || "Total parts",
                        v: totalParts,
                        sub:
                          unique + " " + (__t("analytics.unique") || "unique"),
                      },
                      {
                        l: __t("analytics.bomCostUsd") || "BOM cost (USD)",
                        v: "$" + totalCost.toFixed(2),
                        sub: INR(totalCost, 2),
                      },
                      {
                        l: __t("analytics.avgUnitCost") || "Avg unit cost",
                        v: INR(totalCost / totalParts, 2),
                        sub: "$" + (totalCost / totalParts).toFixed(2),
                      },
                    ].map((k) => (
                      <div
                        key={k.l}
                        style={{ padding: "10px 12px" }}
                        className="bg-canvas border-line rounded-r2"
                      >
                        <div className="font-mono fs-9 uppercase letter-sp-6 fg-3">
                          {k.l}
                        </div>
                        <div
                          style={{ margin: "2px 0" }}
                          className="font-mono fs-16 fw-600"
                        >
                          {k.v}
                        </div>
                        <div className="font-mono fs-10 fg-3">{k.sub}</div>
                      </div>
                    ))}
                  </div>
                  <div
                    className="d-grid gap-10"
                    style={{ gridTemplateColumns: "repeat(3, 1fr)" }}
                  >
                    {[
                      {
                        l: __t("analytics.riskItems") || "Risk items",
                        v: parts.filter((p) => p.lead > 30).length,
                        sub:
                          __t("analytics.longLeadParts") || "long-lead parts",
                      },
                      {
                        l: __t("analytics.duplicates") || "Duplicates",
                        v: parts.filter((p) => p.dupOf).length,
                        sub:
                          __t("analytics.potentialMerges") ||
                          "potential merges",
                      },
                      {
                        l: __t("analytics.obsolete") || "Obsolete",
                        v: parts.filter(
                          (p) =>
                            p.status === "Deprecated" ||
                            p.status === "Obsolete",
                        ).length,
                        sub: __t("analytics.needsReview") || "needs review",
                      },
                    ].map((k) => (
                      <div
                        key={k.l}
                        style={{ padding: "10px 12px" }}
                        className="bg-canvas border-line rounded-r2"
                      >
                        <div className="font-mono fs-9 uppercase letter-sp-6 fg-3">
                          {k.l}
                        </div>
                        <div
                          style={{ margin: "2px 0" }}
                          className="font-mono fs-16 fw-600"
                        >
                          {k.v}
                        </div>
                        <div className="font-mono fs-10 fg-3">{k.sub}</div>
                      </div>
                    ))}
                  </div>
                  <div
                    className="d-grid gap-14"
                    style={{ gridTemplateColumns: "1fr 1fr" }}
                  >
                    <div>
                      <div className="font-mono fs-9 uppercase letter-sp-6 fg-3 mb-6">
                        {__t("analytics.partsByCategory") ||
                          "Parts by category"}
                      </div>
                      {Object.entries(catCounts).map(([k, v]) => (
                        <div
                          key={k}
                          style={{ gridTemplateColumns: "80px 1fr 30px" }}
                          className="gap-6 items-center mb-4 font-mono fs-10 d-grid"
                        >
                          <span className="fg-2">{k}</span>
                          <div
                            style={{ height: 6, borderRadius: 3 }}
                            className="bg-sunk overflow-h"
                          >
                            <div
                              className="h-100p bg-accent"
                              style={{
                                width: (v / unique) * 100 + "%",
                                borderRadius: 3,
                              }}
                            />
                          </div>
                          <span className="text-right fw-600">{v}</span>
                        </div>
                      ))}
                    </div>
                    <div>
                      <div className="font-mono fs-9 uppercase letter-sp-6 fg-3 mb-6">
                        {__t("analytics.costByCategory") || "Cost by category"}
                      </div>
                      {Object.entries(catCosts).map(([k, v]) => (
                        <div
                          key={k}
                          style={{ gridTemplateColumns: "80px 1fr 50px" }}
                          className="gap-6 items-center mb-4 font-mono fs-10 d-grid"
                        >
                          <span className="fg-2">{k}</span>
                          <div
                            style={{ height: 6, borderRadius: 3 }}
                            className="bg-sunk overflow-h"
                          >
                            <div
                              className="h-100p bg-accent"
                              style={{
                                width: (v / totalCost) * 100 + "%",
                                borderRadius: 3,
                              }}
                            />
                          </div>
                          <span className="text-right fw-600">{INR(v, 0)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <h3>
              {__t("analytics.vendorCostComparison") ||
                "Vendor cost comparison"}
            </h3>
            <span
              className="hint cursor-pointer"
              onClick={() => {
                const lines = [
                  __t("analytics.vendorCostComparison") ||
                    "Vendor Cost Comparison",
                  (__t("analytics.date") || "Date") +
                    ": " +
                    new Date().toISOString().slice(0, 10),
                  "",
                  ...(ctx?.rows || BOM_DATA.rows)[0].children
                    .flatMap((s) => s.children || [])
                    .filter((p) => p.vendorPrices)
                    .map((p) => {
                      return (
                        p.pn +
                        " (" +
                        p.name +
                        ")\n  " +
                        (__t("analytics.current") || "Current") +
                        ": " +
                        p.vendor +
                        " @ $" +
                        p.cost +
                        "\n" +
                        p.vendorPrices
                          .map(
                            (vp) =>
                              "  " +
                              (__t("analytics.alt") || "Alt") +
                              ": " +
                              vp.vendor +
                              " @ $" +
                              vp.cost +
                              " (" +
                              vp.lead +
                              "d " +
                              (__t("analytics.lead") || "lead") +
                              ", MOQ " +
                              vp.moq +
                              ")",
                          )
                          .join("\n")
                      );
                    })
                    .join("\n\n"),
                  "",
                  __t("analytics.generatedAutomatically") ||
                    "Generated automatically",
                ];
                downloadBlob(
                  lines.join("\n"),
                  "Vendor_Cost_Comparison.txt",
                  "text/plain",
                );
                toast(
                  __t("analytics.comparisonDownloaded") ||
                    "Vendor comparison report downloaded",
                  { kind: "success" },
                );
              }}
            >
              <Icon.Export size={11} />{" "}
              {__t("analytics.downloadComparison") || "Download comparison"}
            </span>
          </div>
          <div className="ox-auto" style={{ padding: 12 }}>
            {(() => {
              const parts = (ctx?.rows || BOM_DATA.rows)[0].children
                .flatMap((s) => s.children || [])
                .filter((p) => p.vendorPrices);
              return parts.length === 0 ? (
                <div
                  style={{ padding: 24 }}
                  className="text-center fg-3 font-mono fs-11"
                >
                  {__t("analytics.noPricingData") ||
                    "No vendor pricing data available"}
                </div>
              ) : (
                <table className="bom-table table-auto">
                  <thead>
                    <tr>
                      <th className="pl-12">
                        {__t("analytics.part") || "Part"}
                      </th>
                      <th>
                        {__t("analytics.currentVendor") || "Current vendor"}
                      </th>
                      <th className="num">
                        {__t("analytics.currentCost") || "Current cost"}
                      </th>
                      <th>{__t("analytics.altVendor") || "Alt vendor"}</th>
                      <th className="num">
                        {__t("analytics.altCost") || "Alt cost"}
                      </th>
                      <th className="num">
                        {__t("analytics.deltaPercent") || "\u0394%"}
                      </th>
                      <th className="num">{__t("analytics.lead") || "Lead"}</th>
                      <th className="num">{__t("vendor.moq") || "MOQ"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parts.flatMap((p) =>
                      p.vendorPrices
                        .filter((vp) => vp.vendor !== p.vendor)
                        .map((vp, i) => {
                          const delta = ((vp.cost - p.cost) / p.cost) * 100;
                          return (
                            <tr key={p.id + "-" + i}>
                              <td className="mono pl-12 fw-600">{p.pn}</td>
                              <td className="fs-11">{p.vendor}</td>
                              <td className="num mono">{INR(p.cost, 2)}</td>
                              <td className="fs-11">{vp.vendor}</td>
                              <td
                                className="num mono"
                                style={{
                                  color:
                                    delta < 0
                                      ? "var(--ok)"
                                      : delta > 0
                                        ? "var(--danger)"
                                        : "var(--fg)",
                                }}
                              >
                                {INR(vp.cost, 2)}
                              </td>
                              <td className="num mono fw-600">
                                {delta > 0 ? "+" : ""}
                                {delta.toFixed(1)}%
                              </td>
                              <td className="num mono">{vp.lead}d</td>
                              <td className="num mono">{vp.moq}</td>
                            </tr>
                          );
                        }),
                    )}
                  </tbody>
                </table>
              );
            })()}
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <h3>{__t("analytics.partsHealth") || "Parts health"}</h3>
          </div>
          <div style={{ padding: 16 }}>
            {(() => {
              const parts = (ctx?.rows || BOM_DATA.rows)[0].children.flatMap(
                (s) => s.children || [],
              );
              const dupCount = parts.filter((p) => p.dupOf).length;
              const obsCount = parts.filter(
                (p) => p.status === "Deprecated" || p.status === "Obsolete",
              ).length;
              const singleSource = parts.filter(
                (p) =>
                  !p.vendorPrices &&
                  !p.dupOf &&
                  p.status !== "Deprecated" &&
                  p.status !== "Obsolete" &&
                  p.status !== "Draft",
              ).length;
              const longLead = parts.filter((p) => p.lead > 30).length;
              const total = parts.length;
              const score = Math.max(
                0,
                Math.round(
                  100 -
                    ((dupCount + obsCount + singleSource + longLead) / total) *
                      100,
                ),
              );
              const rows = [
                {
                  l: __t("analytics.healthDuplicates") || "Duplicates",
                  v: dupCount,
                  c: dupCount > 0 ? "var(--warn)" : "var(--ok)",
                },
                {
                  l: __t("analytics.healthObsolete") || "Obsolete / Deprecated",
                  v: obsCount,
                  c: obsCount > 0 ? "var(--danger)" : "var(--ok)",
                },
                {
                  l:
                    __t("analytics.healthSingleSource") || "Single-source risk",
                  v: singleSource,
                  c:
                    singleSource > total * 0.3
                      ? "var(--danger)"
                      : singleSource > 0
                        ? "var(--warn)"
                        : "var(--ok)",
                },
                {
                  l: __t("analytics.healthLongLead") || "Long lead (>30d)",
                  v: longLead,
                  c: longLead > 0 ? "var(--warn)" : "var(--ok)",
                },
              ];
              return (
                <div className="flex flex-col gap-10">
                  <div className="flex items-center gap-10">
                    <div
                      style={{
                        border:
                          "3px solid " +
                          (score >= 80
                            ? "var(--ok)"
                            : score >= 60
                              ? "var(--warn)"
                              : "var(--danger)"),
                      }}
                      className="flex items-center font-mono fs-16 fw-700 w-48 h-48 br-50p justify-center"
                    >
                      {score}
                    </div>
                    <div>
                      <div className="fw-600 fs-13">
                        {score >= 80
                          ? __t("analytics.healthy") || "Healthy"
                          : score >= 60
                            ? __t("analytics.needsAttention") ||
                              "Needs attention"
                            : __t("analytics.atRisk") || "At risk"}
                      </div>
                      <div className="fs-10 fg-3">
                        {__t("analytics.healthScore") ||
                          "Health score \u00B7 lower is better"}
                      </div>
                    </div>
                  </div>
                  <div
                    style={{ gridTemplateColumns: "1fr 1fr" }}
                    className="gap-6 d-grid"
                  >
                    {rows.map((r) => (
                      <div
                        key={r.l}
                        style={{ padding: "8px 10px" }}
                        className="bg-canvas border-line rounded-r2"
                      >
                        <div
                          style={{ letterSpacing: "0.05em" }}
                          className="fs-9 font-mono uppercase fg-3 mb-2"
                        >
                          {r.l}
                        </div>
                        <div
                          style={{ color: r.c }}
                          className="font-mono fw-600 fs-18"
                        >
                          {r.v}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}
AnalyticsScreen.propTypes = {
  data: PropTypes.object,
};
