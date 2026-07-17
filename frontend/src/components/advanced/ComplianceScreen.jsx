import { api } from "../../globals";
function ComplianceScreen() {
  const [docs, setDocs] = React.useState([]);
  const [packs, setPacks] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState("parts");

  React.useEffect(() => {
    setLoading(true);
    Promise.all([
      api.compliance.dashboard().catch(() => null),
      api.compliance.packs.list().catch(() => []),
      api.parts.list({ limit: 100 }).catch(() => ({ items: [] })),
      api.compliance.list().catch(() => []),
    ])
      .then(([dash, packsData, partsData]) => {
        setPacks(packsData);
        const items = partsData.items || [];
        const mapped = items.map((p) => ({
          pn: p.pn,
          id: p.id,
          rohs: "valid",
          reach: "valid",
          conflict: "valid",
          reach_expires: null,
          lab: "—",
        }));
        setDocs(
          mapped.length
            ? mapped
            : [
                {
                  pn: "EL-MCU-STM32H7",
                  rohs: "valid",
                  reach: "valid",
                  conflict: "valid",
                  reach_expires: "2027-03-15",
                  lab: "Intertek",
                },
                {
                  pn: "EL-PSU-240W",
                  rohs: "valid",
                  reach: "valid",
                  conflict: "valid",
                  reach_expires: "2026-08-22",
                  lab: "TÜV SÜD",
                },
                {
                  pn: "EL-BMS-12S",
                  rohs: "expiring",
                  reach: "expiring",
                  conflict: "missing",
                  reach_expires: "2026-06-08",
                  lab: "SGS",
                },
              ],
        );
      })
      .finally(() => setLoading(false));
  }, []);

  const totals = {
    valid: docs.filter(
      (d) =>
        d.rohs === "valid" && d.reach === "valid" && d.conflict === "valid",
    ).length,
    expiring: docs.filter((d) => Object.values(d).includes("expiring")).length,
    missing: docs.filter((d) => Object.values(d).includes("missing")).length,
    expired: docs.filter((d) => Object.values(d).includes("expired")).length,
  };
  const colorFor = (s) =>
    s === "valid"
      ? "var(--ok)"
      : s === "expiring"
        ? "var(--warn)"
        : s === "expired"
          ? "var(--danger)"
          : "var(--fg-3)";
  return (
    <div className="screen-wrap">
      <div className="screen-header">
        <div>
          <h1>Compliance</h1>
          <div className="sub">
            {loading
              ? "Loading\u2026"
              : `${docs.length} parts tracked · ${packs.length} compliance packs · RoHS · REACH · Conflict Minerals`}
          </div>
        </div>
        <div className="flex gap-8">
          <div className="tabs flex">
            {["parts", "packs"].map((t) => (
              <button
                key={t}
                className={"tab " + (activeTab === t ? "active" : "")}
                onClick={() => setActiveTab(t)}
                style={{
                  padding: "4px 12px",
                  borderRadius: "var(--r-2)",
                  fontSize: 11,
                  fontWeight: 600,
                  border: "none",
                  cursor: "pointer",
                  background:
                    activeTab === t ? "var(--bg-elev)" : "transparent",
                }}
              >
                {t === "parts" ? "Parts" : "Compliance Packs"}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div
        className="kpi-grid"
        style={{ gridTemplateColumns: "repeat(4, 1fr)" }}
      >
        {[
          { l: "Fully compliant", v: totals.valid, c: "var(--ok)" },
          { l: "Expiring < 90d", v: totals.expiring, c: "var(--warn)" },
          { l: "Missing certs", v: totals.missing, c: "var(--fg-3)" },
          { l: "Expired", v: totals.expired, c: "var(--danger)" },
        ].map((k) => (
          <div key={k.l} className="kpi">
            <div className="l">{k.l}</div>
            <div className="v" style={{ color: k.c }}>
              {k.v}
            </div>
          </div>
        ))}
      </div>
      {activeTab === "parts" && (
        <div className="card">
          <table className="bom-table table-auto">
            <thead>
              <tr>
                <th className="pl-16">Part No.</th>
                <th>RoHS</th>
                <th>REACH</th>
                <th>Conflict Minerals</th>
                <th>Lab / Source</th>
                <th>Cert expires</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.pn}>
                  <td className="mono pl-16 fw-600">{d.pn}</td>
                  {["rohs", "reach", "conflict"].map((c) => (
                    <td key={c}>
                      <span
                        className="inline-flex items-center gap-6 font-mono fs-11"
                        style={{ color: colorFor(d[c]) }}
                      >
                        <span
                          className="w-8 h-8"
                          style={{
                            borderRadius: 99,
                            background: colorFor(d[c]),
                          }}
                        />
                        {d[c].toUpperCase()}
                      </span>
                    </td>
                  ))}
                  <td className="mono fg-3">{d.lab}</td>
                  <td
                    className="mono"
                    style={{
                      color:
                        d.reach_expires &&
                        new Date(d.reach_expires) < new Date("2026-08-25")
                          ? "var(--warn)"
                          : "var(--fg-3)",
                    }}
                  >
                    {d.reach_expires || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {activeTab === "packs" && (
        <div className="card">
          <div className="flex justify-between items-center mb-12">
            <h3 className="m-0 fs-14 fw-600">Compliance Packs</h3>
            <button className="btn">New Pack</button>
          </div>
          <table className="bom-table table-auto">
            <thead>
              <tr>
                <th className="pl-16">Pack Name</th>
                <th>Standard</th>
                <th>Requirements</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {packs.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="empty p-16"
                    style={{ textAlign: "center", color: "var(--fg-3)" }}
                  >
                    No compliance packs configured.
                  </td>
                </tr>
              ) : (
                packs.map((p) => (
                  <tr key={p.id}>
                    <td className="pl-16 fw-600">{p.pack_name || p.name}</td>
                    <td>
                      <span className="cat assembly">{p.standard || "—"}</span>
                    </td>
                    <td className="mono">{p.requirement_count || 0}</td>
                    <td>
                      <span
                        className={
                          "status " + (p.is_active ? "active" : "draft")
                        }
                      >
                        {p.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export { ComplianceScreen };
export default ComplianceScreen;
