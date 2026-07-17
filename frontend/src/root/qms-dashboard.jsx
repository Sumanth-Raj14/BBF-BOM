import React, { useState, useEffect } from "react";
import { __t } from "../i18n";
import { apiRequest } from "../../api";
import { toast } from "../utils/toast";

const S = {
  container: { padding: 24, maxWidth: 1200, margin: "0 auto", color: "var(--fg)" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 },
  title: { fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: "-0.5px" },
  subtitle: { fontSize: 14, color: "var(--muted)", marginTop: 4 },
  tabs: { display: "flex", gap: 16, borderBottom: "1px solid var(--border)", marginBottom: 24 },
  tab: (active) => ({
    padding: "8px 16px",
    cursor: "pointer",
    borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
    color: active ? "var(--fg)" : "var(--muted)",
    fontWeight: active ? 600 : 500,
    fontSize: 14,
    transition: "all 0.2s",
  }),
  card: { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: 16, marginBottom: 16 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 },
  badge: (status) => {
    let bg = "var(--bg)";
    let fg = "var(--fg)";
    if (status === "Open" || status === "Pending") { bg = "rgba(234, 179, 8, 0.1)"; fg = "#eab308"; }
    else if (status === "Closed" || status === "Pass") { bg = "rgba(34, 197, 94, 0.1)"; fg = "#22c55e"; }
    else if (status === "Fail" || status === "Rejected") { bg = "rgba(239, 68, 68, 0.1)"; fg = "#ef4444"; }
    else if (status === "In Progress") { bg = "rgba(59, 130, 246, 0.1)"; fg = "#3b82f6"; }
    return {
      display: "inline-block",
      padding: "2px 10px",
      borderRadius: 12,
      fontSize: 12,
      fontWeight: 600,
      background: bg,
      color: fg,
    };
  },
};

export function QMSDashboard() {
  const [activeTab, setActiveTab] = React.useState("NCR");
  const [data, setData] = React.useState({ ncrs: [], capas: [], fais: [] });
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    // Mock fetch
    setTimeout(() => {
      setData({
        ncrs: [
          { id: "NCR-001", part: "PT-998", issue: "Dimension out of spec", status: "Open", date: "2024-03-01" },
          { id: "NCR-002", part: "PT-112", issue: "Surface scratch", status: "Closed", date: "2024-02-15" }
        ],
        capas: [
          { id: "CAPA-40", title: "Update calibration process", status: "In Progress", dueDate: "2024-04-10" }
        ],
        fais: [
          { id: "FAI-901", part: "PT-998-A", result: "Pass", inspector: "J. Doe" }
        ]
      });
      setLoading(false);
    }, 400);
  }, []);

  return (
    <div className="main flex flex-col h-100">
      <div className="screen-header">
        <div className="flex items-center gap-3">
          <h2>{__t("enterprise.qms.title") || "Quality Management (QMS)"}</h2>
          <span className="fs-12 fg-3">{__t("enterprise.qms.subtitle") || "Manage NCRs, CAPAs, and First Article Inspections"}</span>
        </div>
      </div>
      
      <div className="tabs">
        {["NCR", "CAPA", "FAI"].map(tab => (
          <button 
            key={tab} 
            className={`tab ${activeTab === tab ? "active" : ""}`} 
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="bom-scroll bg-surface">
        {loading ? (
          <div className="empty-state">Loading {activeTab}...</div>
        ) : (
          <div className="p-4">
            {activeTab === "NCR" && <NCRTable ncrs={data.ncrs} />}
            {activeTab === "CAPA" && <CAPATable capas={data.capas} />}
            {activeTab === "FAI" && <FAITable fais={data.fais} />}
          </div>
        )}
      </div>
    </div>
  );
}

function NCRTable({ ncrs }) {
  if (!ncrs || !ncrs.length) return <div className="empty-state">No Non-Conformances found.</div>;
  return (
    <table className="bom-table">
      <thead>
        <tr>
          <th>ID</th>
          <th>Part</th>
          <th>Issue</th>
          <th>Status</th>
          <th>Date</th>
        </tr>
      </thead>
      <tbody>
        {ncrs.map(n => (
          <tr key={n.id}>
            <td className="font-mono">{n.id}</td>
            <td>{n.part}</td>
            <td>{n.issue}</td>
            <td><span className={`status ${n.status === "Closed" ? "released" : "draft"}`}>{n.status}</span></td>
            <td className="font-mono">{n.date}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CAPATable({ capas }) {
  if (!capas || !capas.length) return <div className="empty-state">No Corrective Actions found.</div>;
  return (
    <table className="bom-table">
      <thead>
        <tr>
          <th>ID</th>
          <th>Title</th>
          <th>Status</th>
          <th>Due Date</th>
        </tr>
      </thead>
      <tbody>
        {capas.map(c => (
          <tr key={c.id}>
            <td className="font-mono">{c.id}</td>
            <td>{c.title}</td>
            <td><span className={`status ${c.status === "In Progress" ? "draft" : "released"}`}>{c.status}</span></td>
            <td className="font-mono">{c.dueDate}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FAITable({ fais }) {
  if (!fais || !fais.length) return <div className="empty-state">No First Article Inspections found.</div>;
  return (
    <table className="bom-table">
      <thead>
        <tr>
          <th>ID</th>
          <th>Part</th>
          <th>Result</th>
          <th>Inspector</th>
        </tr>
      </thead>
      <tbody>
        {fais.map(f => (
          <tr key={f.id}>
            <td className="font-mono">{f.id}</td>
            <td>{f.part}</td>
            <td><span className={`status ${f.result === "Pass" ? "released" : "draft"}`}>{f.result}</span></td>
            <td>{f.inspector}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

window.QMSScreen = QMSDashboard;
