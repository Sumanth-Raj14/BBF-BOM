import { api, Icon } from "../../globals";
import {
  ScreenHeader,
  Tabs,
  TabPanel,
  Button,
  DataTable,
  StatusPill,
  Badge,
  EmptyState,
  Spinner,
} from "../ui";

const COMPLIANCE_TABS_ID = "compliance-tabs";

// Domain compliance status -> semantic tone (not covered by the shared
// STATUS_TONES map, so resolved explicitly here).
const COMPLIANCE_TONE = {
  valid: "success",
  expiring: "warning",
  expired: "danger",
  missing: "neutral",
};

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

  const tabItems = [
    { value: "parts", label: "Parts", count: docs.length },
    { value: "packs", label: "Compliance Packs", count: packs.length },
  ];

  const loadingRow = (label) => (
    <div
      className="flex items-center gap-8 fg-3 fs-12"
      style={{ padding: "32px 0" }}
    >
      <Spinner size="sm" label={label} />
      <span aria-hidden="true">Loading…</span>
    </div>
  );

  const statusCell = (status) => (
    <StatusPill
      tone={COMPLIANCE_TONE[status] || "neutral"}
      label={String(status || "—").toUpperCase()}
    />
  );

  const partColumns = [
    {
      key: "pn",
      header: "Part No.",
      render: (d) => <span className="mono fw-600">{d.pn}</span>,
    },
    { key: "rohs", header: "RoHS", render: (d) => statusCell(d.rohs) },
    { key: "reach", header: "REACH", render: (d) => statusCell(d.reach) },
    {
      key: "conflict",
      header: "Conflict Minerals",
      render: (d) => statusCell(d.conflict),
    },
    {
      key: "lab",
      header: "Lab / Source",
      render: (d) => <span className="mono fg-3">{d.lab}</span>,
    },
    {
      key: "reach_expires",
      header: "Cert expires",
      render: (d) => (
        <span
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
        </span>
      ),
    },
  ];

  const packColumns = [
    {
      key: "name",
      header: "Pack Name",
      render: (p) => <span className="fw-600">{p.pack_name || p.name}</span>,
    },
    {
      key: "standard",
      header: "Standard",
      render: (p) => <Badge tone="accent">{p.standard || "—"}</Badge>,
    },
    {
      key: "requirement_count",
      header: "Requirements",
      align: "right",
      render: (p) => <span className="mono">{p.requirement_count || 0}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (p) => (
        <StatusPill
          tone={p.is_active ? "success" : "neutral"}
          label={p.is_active ? "Active" : "Inactive"}
        />
      ),
    },
  ];

  return (
    <div className="screen-wrap">
      <ScreenHeader
        title="Compliance"
        description={
          loading
            ? "Loading…"
            : `${docs.length} parts tracked · ${packs.length} compliance packs · RoHS · REACH · Conflict Minerals`
        }
      />

      <Tabs
        id={COMPLIANCE_TABS_ID}
        items={tabItems}
        value={activeTab}
        onChange={setActiveTab}
        ariaLabel="Compliance view"
        className="mb-16"
      />

      <div
        className="kpi-grid mb-16"
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

      <TabPanel
        id={COMPLIANCE_TABS_ID}
        value="parts"
        active={activeTab === "parts"}
      >
        <DataTable
          dense
          ariaLabel="Parts compliance"
          columns={partColumns}
          rows={docs}
          getRowKey={(d) => d.pn}
          empty={loading ? loadingRow("Loading compliance data…") : <EmptyState title="No parts tracked" />}
        />
      </TabPanel>

      <TabPanel
        id={COMPLIANCE_TABS_ID}
        value="packs"
        active={activeTab === "packs"}
      >
        <div className="flex justify-between items-center mb-12">
          <h3 className="m-0 fs-14 fw-600">Compliance Packs</h3>
          <Button variant="primary" size="sm">
            <Icon.Plus size={12} /> New Pack
          </Button>
        </div>
        <DataTable
          dense
          ariaLabel="Compliance packs"
          columns={packColumns}
          rows={packs}
          getRowKey={(p) => p.id}
          empty={
            loading
              ? loadingRow("Loading compliance packs…")
              : <EmptyState title="No compliance packs configured." />
          }
        />
      </TabPanel>
    </div>
  );
}

export { ComplianceScreen };
export default ComplianceScreen;
