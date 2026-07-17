import React from "react";
import { storage } from "../utils/storage.js";
import { Z } from "../utils/design-tokens.js";
import { __t } from "../i18n";
import { toast } from "../utils/toast";

// Shared modal a11y helper: closes an open modal on Escape.
function useEscToClose(active, onClose) {
  React.useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active, onClose]);
}

// Enterprise Screens — Service BOM, Routing, Work Centers, Labor, Currency, Compliance, Custom Attrs, API Keys, Dashboards
// Hoist window registrations early (function declarations are hoisted)
window.EnterpriseDashboardsScreen = EnterpriseDashboardsScreen;
window.ServiceBOMScreen = ServiceBOMScreen;
window.RoutingScreen = RoutingScreen;
window.WorkCentersScreen = WorkCentersScreen;
window.LaborScreen = LaborScreen;
window.CurrencyScreen = CurrencyScreen;
window.ComplianceAutoNumberScreen = ComplianceAutoNumberScreen;
window.CustomAttributesScreen = CustomAttributesScreen;
window.APIKeysScreen = APIKeysScreen;
const S = {
  card: {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: 16,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  title: { fontSize: 18, fontWeight: 700, color: "var(--fg)", margin: 0 },
  subtitle: { fontSize: 12, color: "var(--muted)", margin: "2px 0 0" },
  grid: { display: "grid", gap: 12 },
  btn: (accent) => ({
    padding: "6px 14px",
    borderRadius: 6,
    border: "none",
    background: accent || "var(--accent)",
    color: "#fff",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  }),
  btnOutline: () => ({
    padding: "6px 14px",
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--fg)",
    fontSize: 12,
    cursor: "pointer",
  }),
  input: {
    padding: "6px 10px",
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "var(--bg)",
    color: "var(--fg)",
    fontSize: 12,
    width: "100%",
  },
  select: {
    padding: "6px 10px",
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "var(--bg)",
    color: "var(--fg)",
    fontSize: 12,
  },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 12 },
  th: {
    textAlign: "left",
    padding: "8px 10px",
    borderBottom: "2px solid var(--border)",
    color: "var(--muted)",
    fontWeight: 600,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  td: {
    padding: "8px 10px",
    borderBottom: "1px solid var(--border)",
    color: "var(--fg)",
  },
  badge: (color) => ({
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 10,
    fontSize: 11,
    fontWeight: 600,
    background: color + "20",
    color: color,
  }),
  kpi: {
    textAlign: "center",
    padding: 16,
    borderRadius: 10,
    background: "var(--card)",
    border: "1px solid var(--border)",
  },
  kpiVal: { fontSize: 28, fontWeight: 700, color: "var(--fg)", margin: 0 },
  kpiLabel: {
    fontSize: 11,
    color: "var(--muted)",
    margin: "4px 0 0",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  empty: { padding: 40, textAlign: "center", color: "var(--muted)" },
  tab: (active) => ({
    padding: "6px 14px",
    borderRadius: 6,
    border: "none",
    background: active ? "var(--accent)" : "transparent",
    color: active ? "#fff" : "var(--muted)",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  }),
  modal: {
    position: "fixed",
    inset: 0,
    zIndex: Z.MODAL,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0,0,0,0.5)",
  },
  modalBox: {
    background: "var(--card)",
    borderRadius: 12,
    padding: 24,
    minWidth: 360,
    maxWidth: 520,
    boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
  },
};
function EnterpriseDashboardsScreen() {
  const [tab, setTab] = React.useState("executive");
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    setLoading(true);
    apiRequest("/dashboards/" + tab)
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => {
        console.error("Failed to load dashboard");
        setData(null);
        setLoading(false);
      });
  }, [tab]);
  const tabs = [
    {
      id: "executive",
      label: __t("enterprise.dashboards.tabExecutive") || "Executive",
    },
    {
      id: "engineering",
      label: __t("enterprise.dashboards.tabEngineering") || "Engineering",
    },
    {
      id: "manufacturing",
      label: __t("enterprise.dashboards.tabManufacturing") || "Manufacturing",
    },
    {
      id: "procurement",
      label: __t("enterprise.dashboards.tabProcurement") || "Procurement",
    },
  ];
  return (
    <div className="overflow-y-a" style={{ padding: 24, height: "100%" }}>
      <div className="flex justify-between items-center mb-16">
        <div>
          <h2 className="fs-18 fw-700 fg m-0">
            {__t("enterprise.dashboards.title") || "Enterprise Dashboards"}
          </h2>
          <p className="fs-12 fg-3 m-0 mt-2">
            {__t("enterprise.dashboards.subtitle") ||
              "Real-time KPIs across your organization"}
          </p>
        </div>
      </div>
      <div className="flex gap-4 mb-16">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={"ent-tab" + (tab === t.id ? " ent-tab-active" : "")}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {loading ? (
        <SkeletonCards />
      ) : !data ? (
        <div className="p-40 text-center fg-3">
          {__t("enterprise.dashboards.failedToLoad") ||
            "Failed to load dashboard"}
        </div>
      ) : (
        <>
          {data.kpis && (
            <div
              className="mb-16"
              style={{
                gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
              }}
            >
              {Object.entries(data.kpis).map(([k, v]) => (
                <div key={k} className="text-center p-16 bg-elev border-line">
                  <div className="fs-28 fw-700 fg m-0">
                    {typeof v === "number" ? v.toLocaleString() : v}
                  </div>
                  <div className="fs-11 fg-3 m-0 mt-4 uppercase">
                    {k.replace(/_/g, " ")}
                  </div>
                </div>
              ))}
            </div>
          )}
          {data.monthly_spend && data.monthly_spend.length > 0 && (
            <div className="bg-elev border-line p-16">
              <h3 className="fs-14 mb-12">
                {__t("enterprise.dashboards.monthlySpend") || "Monthly Spend"}
              </h3>
              <table className="w-100p fs-12">
                <thead>
                  <tr>
                    <th className="ent-th">
                      {__t("enterprise.dashboards.month") || "Month"}
                    </th>
                    <th className="text-right">
                      {__t("enterprise.dashboards.spend") || "Spend"}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.monthly_spend.map((r, i) => (
                    <tr key={i}>
                      <td className="ent-td">{r.month}</td>
                      <td className="text-right fw-600">
                        ${(r.spend || 0).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data.top_vendors_by_spend &&
            data.top_vendors_by_spend.length > 0 && (
              <div className="bg-elev border-line p-16">
                <h3 className="fs-14 mb-12">
                  {__t("enterprise.dashboards.topVendors") ||
                    "Top Vendors by Spend"}
                </h3>
                <table className="w-100p fs-12">
                  <thead>
                    <tr>
                      <th className="ent-th">
                        {__t("enterprise.dashboards.vendor") || "Vendor"}
                      </th>
                      <th className="ent-th">
                        {__t("enterprise.dashboards.spend") || "Spend"}
                      </th>
                      <th className="ent-th">
                        {__t("enterprise.dashboards.poCount") || "POs"}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.top_vendors_by_spend || []).map((v, i) => (
                      <tr key={i}>
                        <td className="ent-td">{v.vendorName}</td>
                        <td className="ent-td">
                          ${(v.total_spend || 0).toLocaleString()}
                        </td>
                        <td className="ent-td">{v.po_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          {data.status_summary && data.status_summary.length > 0 && (
            <div className="bg-elev border-line p-16">
              <h3 className="fs-14 mb-12">
                {__t("enterprise.dashboards.statusSummary") || "Status Summary"}
              </h3>
              <table className="w-100p fs-12">
                <thead>
                  <tr>
                    <th className="ent-th">
                      {__t("enterprise.dashboards.status") || "Status"}
                    </th>
                    <th className="ent-th">
                      {__t("enterprise.dashboards.count") || "Count"}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(data.status_summary || []).map((s, i) => (
                    <tr key={i}>
                      <td className="ent-td">{s.status}</td>
                      <td className="ent-td">{s.cnt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
function ServiceBOMScreen() {
  const [boms, setBoms] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [_selected, setSelected] = React.useState(null);
  const [showCreate, setShowCreate] = React.useState(false);
  useEscToClose(showCreate, () => setShowCreate(false));
  const [form, setForm] = React.useState({
    name: "",
    description: "",
    service_type: "maintenance",
  });
  const load = () => {
    setLoading(true);
    apiRequest("/enterprise/service-bom")
      .then((d) => {
        setBoms(d);
        setLoading(false);
      })
      .catch(() => {
        console.error("Failed to load service BOMs");
        setBoms([]);
        setLoading(false);
      });
  };
  React.useEffect(load, []);
  const create = async () => {
    try {
      await apiRequest("/enterprise/service-bom", {
        method: "POST",
        body: JSON.stringify(form),
      });
      toast(__t("enterprise.serviceBom.created") || "Service BOM created", {
        kind: "success",
      });
      setShowCreate(false);
      setForm({ name: "", description: "", service_type: "maintenance" });
      load();
    } catch (e) {
      toast(e.message, { kind: "error" });
    }
  };
  return (
    <div className="p-24">
      <div className="flex justify-between items-center mb-16">
        <div>
          <h2 className="fs-18 fw-700 fg m-0">
            {__t("enterprise.serviceBom.title") || "Service BOM"}
          </h2>
          <p className="fs-12 fg-3 m-0 mt-2">
            {__t("enterprise.serviceBom.subtitle") ||
              "Manage service/maintenance BOMs for field operations"}
          </p>
        </div>
        <button className="ent-btn" onClick={() => setShowCreate(true)}>
          {__t("enterprise.serviceBom.new") || "+ New Service BOM"}
        </button>
      </div>
      {showCreate && (
        <div
          className="ent-modal"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowCreate(false)}
        >
          <div className="ent-modal-box" onClick={(e) => e.stopPropagation()}>
            <h3 className="fs-18 fw-700 fg m-0">
              {__t("enterprise.serviceBom.create.title") || "New Service BOM"}
            </h3>
            <div className="flex flex-col gap-10 mt-12">
              <input
                className="px-10 py-6 br-6 border-line bg-canvas fg fs-12 w-100p"
                placeholder={
                  __t("enterprise.serviceBom.create.namePlaceholder") || "Name"
                }
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <input
                className="px-10 py-6 br-6 border-line bg-canvas fg fs-12 w-100p"
                placeholder={
                  __t("enterprise.serviceBom.create.descriptionPlaceholder") ||
                  "Description"
                }
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />
              <select
                className="px-10 py-6 br-6 border-line bg-canvas fg fs-12"
                value={form.service_type}
                onChange={(e) =>
                  setForm({ ...form, service_type: e.target.value })
                }
              >
                <option value="maintenance">
                  {__t("enterprise.serviceBom.type.maintenance") ||
                    "Maintenance"}
                </option>
                <option value="repair">
                  {__t("enterprise.serviceBom.type.repair") || "Repair"}
                </option>
                <option value="overhaul">
                  {__t("enterprise.serviceBom.type.overhaul") || "Overhaul"}
                </option>
                <option value="inspection">
                  {__t("enterprise.serviceBom.type.inspection") || "Inspection"}
                </option>
              </select>
            </div>
            <div className="flex gap-8 justify-end mt-16">
              <button
                className="ent-btn-outline"
                onClick={() => setShowCreate(false)}
              >
                {__t("common.cancel") || "Cancel"}
              </button>
              <button className="ent-btn" onClick={create}>
                {__t("common.create") || "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
      {loading ? (
        <SkeletonTable />
      ) : boms.length === 0 ? (
        <EmptyState
          icon="📋"
          title={__t("enterprise.serviceBom.empty.title") || "No Service BOMs"}
          description={
            __t("enterprise.serviceBom.empty.description") ||
            "Get started by creating your first service BOM."
          }
          action={
            __t("enterprise.serviceBom.empty.action") || "Create Service BOM"
          }
          onAction={() => setShowCreate(true)}
        />
      ) : (
        <div className="bg-elev border-line p-16">
          <table className="w-100p fs-12">
            <thead>
              <tr>
                <th className="ent-th">
                  {__t("enterprise.serviceBom.table.name") || "Name"}
                </th>
                <th className="ent-th">
                  {__t("enterprise.serviceBom.table.type") || "Type"}
                </th>
                <th className="ent-th">
                  {__t("enterprise.serviceBom.table.items") || "Items"}
                </th>
                <th className="ent-th">
                  {__t("enterprise.serviceBom.table.created") || "Created"}
                </th>
              </tr>
            </thead>
            <tbody>
              {boms.map((b) => (
                <tr
                  key={b.id}
                  className="cursor-pointer"
                  onClick={() => setSelected(b)}
                >
                  <td className="fw-600">{b.name}</td>
                  <td className="ent-td">
                    <span
                      className="ent-badge"
                      style={{
                        "--badge-bg": "#3b82f620",
                        "--badge-fg": "#3b82f6",
                      }}
                    >
                      {b.service_type}
                    </span>
                  </td>
                  <td className="ent-td">{b.items_count || 0}</td>
                  <td className="ent-td">
                    {b.created_at
                      ? (function () {
                          try {
                            const d = new Date(b.created_at);
                            return isNaN(d.getTime())
                              ? "-"
                              : d.toLocaleDateString();
                          } catch (_e) {
                            return "-";
                          }
                        })()
                      : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
function RoutingScreen() {
  const [tab, setTab] = React.useState("routings");
  const [routings, setRoutings] = React.useState([]);
  const [plans, setPlans] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    setLoading(true);
    Promise.all([
      apiRequest("/manufacturing/routings").catch(() => []),
      apiRequest("/manufacturing/process-plans").catch(() => []),
    ])
      .then(([r, p]) => {
        setRoutings(r || []);
        setPlans(p || []);
        setLoading(false);
      })
      .catch(() => {
        console.error("Failed to load routing data");
        setLoading(false);
      });
  }, []);
  return (
    <div className="p-24">
      <div className="flex justify-between items-center mb-16">
        <div>
          <h2 className="fs-18 fw-700 fg m-0">
            {__t("enterprise.routing.title") || "Routing & Process Plans"}
          </h2>
          <p className="fs-12 fg-3 m-0 mt-2">
            {__t("enterprise.routing.subtitle") ||
              "Define manufacturing routings and process plans"}
          </p>
        </div>
      </div>
      <div className="flex gap-4 mb-16">
        <button
          className={"ent-tab" + (tab === "routings" ? " ent-tab-active" : "")}
          onClick={() => setTab("routings")}
        >
          {__t("enterprise.routing.tabRoutings") || "Routings"}
        </button>
        <button
          className={"ent-tab" + (tab === "plans" ? " ent-tab-active" : "")}
          onClick={() => setTab("plans")}
        >
          {__t("enterprise.routing.tabPlans") || "Process Plans"}
        </button>
      </div>
      {loading ? (
        <SkeletonTable />
      ) : tab === "routings" ? (
        routings.length === 0 ? (
          <EmptyState
            icon="📋"
            title={
              __t("enterprise.routing.emptyRoutings.title") || "No Routings"
            }
            description={
              __t("enterprise.routing.emptyRoutings.description") ||
              "No manufacturing routings have been defined yet."
            }
          />
        ) : (
          <div className="bg-elev border-line p-16">
            <table className="w-100p fs-12">
              <thead>
                <tr>
                  <th className="ent-th">
                    {__t("enterprise.routing.table.code") || "Code"}
                  </th>
                  <th className="ent-th">
                    {__t("enterprise.routing.table.name") || "Name"}
                  </th>
                  <th className="ent-th">
                    {__t("enterprise.routing.table.partId") || "Part ID"}
                  </th>
                  <th className="ent-th">
                    {__t("enterprise.routing.table.operations") || "Operations"}
                  </th>
                  <th className="ent-th">
                    {__t("enterprise.routing.table.status") || "Status"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {routings.map((r) => (
                  <tr key={r.id}>
                    <td className="fw-600 font-mono">{r.code}</td>
                    <td className="ent-td">{r.name}</td>
                    <td className="ent-td">{r.part_id}</td>
                    <td className="ent-td">{r.operations_count || 0}</td>
                    <td className="ent-td">
                      <span
                        className="ent-badge"
                        style={{
                          "--badge-bg":
                            (r.is_active !== false ? "#10b981" : "#6b7280") +
                            "20",
                          "--badge-fg":
                            r.is_active !== false ? "#10b981" : "#6b7280",
                        }}
                      >
                        {r.is_active !== false
                          ? __t("enterprise.routing.active") || "Active"
                          : __t("enterprise.routing.inactive") || "Inactive"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : plans.length === 0 ? (
        <EmptyState
          icon="📝"
          title={
            __t("enterprise.routing.emptyPlans.title") || "No Process Plans"
          }
          description={
            __t("enterprise.routing.emptyPlans.description") ||
            "No process plans have been defined yet."
          }
        />
      ) : (
        <div className="bg-elev border-line p-16">
          <table className="w-100p fs-12">
            <thead>
              <tr>
                <th className="ent-th">
                  {__t("enterprise.routing.table.code") || "Code"}
                </th>
                <th className="ent-th">
                  {__t("enterprise.routing.table.name") || "Name"}
                </th>
                <th className="ent-th">
                  {__t("enterprise.routing.table.steps") || "Steps"}
                </th>
                <th className="ent-th">
                  {__t("enterprise.routing.table.estHours") || "Est. Hours"}
                </th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id}>
                  <td className="fw-600 font-mono">{p.code}</td>
                  <td className="ent-td">{p.name}</td>
                  <td className="ent-td">{p.steps_count || 0}</td>
                  <td className="ent-td">{p.estimated_hours || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
function WorkCentersScreen() {
  const [centers, setCenters] = React.useState([]);
  const [capacity, setCapacity] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    setLoading(true);
    Promise.all([
      apiRequest("/manufacturing/work-centers").catch(() => []),
      apiRequest("/manufacturing/work-centers/capacity").catch(() => null),
    ])
      .then(([c, cap]) => {
        setCenters(c || []);
        setCapacity(cap);
        setLoading(false);
      })
      .catch(() => {
        console.error("Failed to load work centers");
        setLoading(false);
      });
  }, []);
  return (
    <div className="p-24">
      <div className="flex justify-between items-center mb-16">
        <div>
          <h2 className="fs-18 fw-700 fg m-0">
            {__t("enterprise.workCenters.title") || "Work Centers & Capacity"}
          </h2>
          <p className="fs-12 fg-3 m-0 mt-2">
            {__t("enterprise.workCenters.subtitle") ||
              "Manage work centers and monitor capacity utilization"}
          </p>
        </div>
      </div>
      {loading ? (
        <SkeletonTable />
      ) : (
        <>
          {capacity &&
            capacity.work_centers &&
            capacity.work_centers.length > 0 && (
              <div
                className="mb-16"
                style={{
                  gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                }}
              >
                {capacity.work_centers.map((wc) => (
                  <div key={wc.id} className="bg-elev border-line p-16">
                    <div className="fw-600 fs-13 mb-4">
                      {wc.name || wc.code}
                    </div>
                    <div
                      className="fs-11 mb-8"
                      style={{ color: "var(--muted)" }}
                    >
                      {wc.description ||
                        __t("enterprise.workCenters.noDescription") ||
                        "No description"}
                    </div>
                    <div className="flex justify-between fs-11">
                      <span>
                        {__t("enterprise.workCenters.capacity") || "Capacity"}:{" "}
                        <strong>
                          {wc.capacity_per_hour || "-"}{" "}
                          {__t("enterprise.workCenters.perHr") || "/hr"}
                        </strong>
                      </span>
                      <span
                        className="ent-badge"
                        style={{
                          "--badge-bg":
                            (wc.is_active !== false ? "#10b981" : "#6b7280") +
                            "20",
                          "--badge-fg":
                            wc.is_active !== false ? "#10b981" : "#6b7280",
                        }}
                      >
                        {wc.is_active !== false
                          ? __t("enterprise.workCenters.active") || "Active"
                          : __t("enterprise.workCenters.inactive") ||
                            "Inactive"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          {centers.length === 0 ? (
            <EmptyState
              icon="⚙️"
              title={
                __t("enterprise.workCenters.empty.title") || "No Work Centers"
              }
              description={
                __t("enterprise.workCenters.empty.description") ||
                "No work centers have been configured yet."
              }
            />
          ) : (
            <div className="bg-elev border-line p-16">
              <h3 className="fs-14 mb-12">
                {__t("enterprise.workCenters.allWorkCenters") ||
                  "All Work Centers"}
              </h3>
              <table className="w-100p fs-12">
                <thead>
                  <tr>
                    <th className="ent-th">
                      {__t("enterprise.workCenters.table.code") || "Code"}
                    </th>
                    <th className="ent-th">
                      {__t("enterprise.workCenters.table.name") || "Name"}
                    </th>
                    <th className="text-right">
                      {__t("enterprise.workCenters.table.capacityHr") ||
                        "Capacity/Hr"}
                    </th>
                    <th className="text-right">
                      {__t("enterprise.workCenters.table.availableHrsDay") ||
                        "Available Hrs/Day"}
                    </th>
                    <th className="ent-th">
                      {__t("enterprise.workCenters.table.status") || "Status"}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {centers.map((wc) => (
                    <tr key={wc.id}>
                      <td className="fw-600 font-mono">{wc.code}</td>
                      <td className="ent-td">{wc.name}</td>
                      <td className="text-right">{wc.capacity_per_hour}</td>
                      <td className="text-right">
                        {wc.available_hours_per_day}
                      </td>
                      <td className="ent-td">
                        <span
                          className="ent-badge"
                          style={{
                            "--badge-bg":
                              (wc.is_active !== false ? "#10b981" : "#6b7280") +
                              "20",
                            "--badge-fg":
                              wc.is_active !== false ? "#10b981" : "#6b7280",
                          }}
                        >
                          {wc.is_active !== false
                            ? __t("enterprise.workCenters.active") || "Active"
                            : __t("enterprise.workCenters.inactive") ||
                              "Inactive"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
function LaborScreen() {
  const [tab, setTab] = React.useState("rates");
  const [rates, setRates] = React.useState([]);
  const [timesheets, setTimesheets] = React.useState([]);
  const [laborCost, setLaborCost] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    setLoading(true);
    Promise.all([
      apiRequest("/manufacturing/labor-rates").catch(() => []),
      apiRequest("/manufacturing/timesheets").catch(() => []),
      apiRequest("/manufacturing/timesheets/labor-cost").catch(() => []),
    ])
      .then(([r, t, c]) => {
        setRates(r || []);
        setTimesheets(t || []);
        setLaborCost(c || []);
        setLoading(false);
      })
      .catch(() => {
        console.error("Failed to load labor data");
        setLoading(false);
      });
  }, []);
  return (
    <div className="p-24">
      <div className="flex justify-between items-center mb-16">
        <div>
          <h2 className="fs-18 fw-700 fg m-0">
            {__t("enterprise.labor.title") || "Labor & Timesheets"}
          </h2>
          <p className="fs-12 fg-3 m-0 mt-2">
            {__t("enterprise.labor.subtitle") ||
              "Track labor rates, timesheets, and cost summaries"}
          </p>
        </div>
      </div>
      <div className="flex gap-4 mb-16">
        <button
          className={"ent-tab" + (tab === "rates" ? " ent-tab-active" : "")}
          onClick={() => setTab("rates")}
        >
          {__t("enterprise.labor.tabRates") || "Labor Rates"}
        </button>
        <button
          className={
            "ent-tab" + (tab === "timesheets" ? " ent-tab-active" : "")
          }
          onClick={() => setTab("timesheets")}
        >
          {__t("enterprise.labor.tabTimesheets") || "Timesheets"}
        </button>
        <button
          className={"ent-tab" + (tab === "cost" ? " ent-tab-active" : "")}
          onClick={() => setTab("cost")}
        >
          {__t("enterprise.labor.tabCost") || "Cost Summary"}
        </button>
      </div>
      {loading ? (
        <SkeletonTable />
      ) : tab === "rates" ? (
        rates.length === 0 ? (
          <EmptyState
            icon="💰"
            title={__t("enterprise.labor.emptyRates.title") || "No Labor Rates"}
            description={
              __t("enterprise.labor.emptyRates.description") ||
              "No labor rates have been defined yet."
            }
          />
        ) : (
          <div className="bg-elev border-line p-16">
            <table className="w-100p fs-12">
              <thead>
                <tr>
                  <th className="ent-th">
                    {__t("enterprise.labor.table.employee") || "Employee"}
                  </th>
                  <th className="ent-th">
                    {__t("enterprise.labor.table.skillLevel") || "Skill Level"}
                  </th>
                  <th className="text-right">
                    {__t("enterprise.labor.table.regularRate") ||
                      "Regular Rate"}
                  </th>
                  <th className="text-right">
                    {__t("enterprise.labor.table.otRate") || "OT Rate"}
                  </th>
                  <th className="ent-th">
                    {__t("enterprise.labor.table.status") || "Status"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rates.map((r) => (
                  <tr key={r.id}>
                    <td className="fw-600">{r.employee_name}</td>
                    <td className="ent-td">{r.skill_level || "-"}</td>
                    <td className="text-right">${r.regular_rate || 0}</td>
                    <td className="text-right">${r.overtime_rate || 0}</td>
                    <td className="ent-td">
                      <span
                        className="ent-badge"
                        style={{
                          "--badge-bg":
                            (r.is_active !== false ? "#10b981" : "#6b7280") +
                            "20",
                          "--badge-fg":
                            r.is_active !== false ? "#10b981" : "#6b7280",
                        }}
                      >
                        {r.is_active !== false
                          ? __t("enterprise.labor.active") || "Active"
                          : __t("enterprise.labor.inactive") || "Inactive"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : tab === "timesheets" ? (
        timesheets.length === 0 ? (
          <EmptyState
            icon="📅"
            title={
              __t("enterprise.labor.emptyTimesheets.title") || "No Timesheets"
            }
            description={
              __t("enterprise.labor.emptyTimesheets.description") ||
              "No timesheet entries found."
            }
          />
        ) : (
          <div className="bg-elev border-line p-16">
            <table className="w-100p fs-12">
              <thead>
                <tr>
                  <th className="ent-th">
                    {__t("enterprise.labor.table.employee") || "Employee"}
                  </th>
                  <th className="ent-th">
                    {__t("enterprise.labor.table.date") || "Date"}
                  </th>
                  <th className="text-right">
                    {__t("enterprise.labor.table.hours") || "Hours"}
                  </th>
                  <th className="ent-th">
                    {__t("enterprise.labor.table.ot") || "OT"}
                  </th>
                  <th className="ent-th">
                    {__t("enterprise.labor.table.activity") || "Activity"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {timesheets.map((t) => (
                  <tr key={t.id}>
                    <td className="ent-td">{t.employee_id}</td>
                    <td className="ent-td">
                      {t.date
                        ? (function () {
                            try {
                              const d = new Date(t.date);
                              return isNaN(d.getTime())
                                ? "-"
                                : d.toLocaleDateString();
                            } catch (_e) {
                              return "-";
                            }
                          })()
                        : "-"}
                    </td>
                    <td className="text-right fw-600">{t.hours_worked}</td>
                    <td className="ent-td">
                      {t.is_overtime ? (
                        <span
                          className="ent-badge"
                          style={{
                            "--badge-bg": "#e85d1f20",
                            "--badge-fg": "#e85d1f",
                          }}
                        >
                          {__t("enterprise.labor.otBadge") || "OT"}
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="ent-td">{t.activity_type || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : laborCost.length === 0 ? (
        <EmptyState
          icon="📊"
          title={
            __t("enterprise.labor.emptyCost.title") || "No Labor Cost Data"
          }
          description={
            __t("enterprise.labor.emptyCost.description") ||
            "No labor cost data is available."
          }
        />
      ) : (
        <div className="bg-elev border-line p-16">
          <table className="w-100p fs-12">
            <thead>
              <tr>
                <th className="ent-th">
                  {__t("enterprise.labor.table.employee") || "Employee"}
                </th>
                <th className="text-right">
                  {__t("enterprise.labor.table.regHours") || "Reg Hours"}
                </th>
                <th className="text-right">
                  {__t("enterprise.labor.table.otHours") || "OT Hours"}
                </th>
                <th className="text-right">
                  {__t("enterprise.labor.table.regCost") || "Reg Cost"}
                </th>
                <th className="text-right">
                  {__t("enterprise.labor.table.otCost") || "OT Cost"}
                </th>
                <th className="text-right">
                  {__t("enterprise.labor.table.total") || "Total"}
                </th>
              </tr>
            </thead>
            <tbody>
              {laborCost.map((c) => (
                <tr key={c.employee_id}>
                  <td className="fw-600">{c.employee_name || c.employee_id}</td>
                  <td className="text-right">{c.regular_hours || 0}</td>
                  <td className="text-right">{c.overtime_hours || 0}</td>
                  <td className="text-right">
                    ${(c.regular_cost || 0).toFixed(2)}
                  </td>
                  <td className="text-right">
                    ${(c.overtime_cost || 0).toFixed(2)}
                  </td>
                  <td className="text-right fw-700">
                    $
                    {(
                      (Number(c.regular_cost) || 0) +
                      (Number(c.overtime_cost) || 0)
                    ).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
function CurrencyScreen() {
  const [rates, setRates] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [lastUpdated, setLastUpdated] = React.useState(null);
  const [convertFrom, setConvertFrom] = React.useState("INR");
  const [convertTo, setConvertTo] = React.useState("USD");
  const [convertAmt, setConvertAmt] = React.useState("1000");
  const [convertResult, setConvertResult] = React.useState(null);
  const fetchLiveRates = async () => {
    setLoading(true);
    try {
      const resp = await fetch(
        "https://v6.exchangerate-api.com/v6/69e3376010b559f3ff846fdb/latest/INR",
      );
      if (!resp.ok) throw new Error("API error");
      const data = await resp.json();
      if (data.result === "success" && data.conversion_rates) {
        const mapped = Object.entries(data.conversion_rates).map(
          ([to, rate], i) => ({
            id: i + 1,
            from_currency: "INR",
            to_currency: to,
            rate: rate,
            source: "exchangerate-api.com",
            effective_date: data.time_last_update_utc
              ? data.time_last_update_utc.slice(0, 10)
              : new Date().toISOString().slice(0, 10),
          }),
        );
        setRates(mapped);
        setLastUpdated(new Date().toISOString());
        toast(
          __t("enterprise.currency.ratesUpdated") || "Exchange rates updated",
          { kind: "success" },
        );
      } else {
        throw new Error("Invalid response");
      }
    } catch (e) {
      console.error("Live rates failed:", e);
      toast(
        __t("enterprise.currency.fetchFailed") ||
          "Failed to fetch exchange rates",
        { kind: "error" },
      );
    } finally {
      setLoading(false);
    }
  };
  const doConvert = () => {
    const fromRate = rates.find(
      (r) => r.from_currency === "INR" && r.to_currency === convertFrom,
    );
    const toRate = rates.find(
      (r) => r.from_currency === "INR" && r.to_currency === convertTo,
    );
    if (!fromRate || !toRate) {
      toast(
        __t("enterprise.currency.ratesNotAvailable") ||
          "Rates not available for selected currencies",
        { kind: "error" },
      );
      return;
    }
    const amount = parseFloat(convertAmt) || 0;
    const fromVal = convertFrom === "INR" ? 1 : fromRate.rate;
    const toVal = convertTo === "INR" ? 1 : toRate.rate;
    const result = (amount / fromVal) * toVal;
    const effectiveRate = toVal / fromVal;
    setConvertResult({
      converted_amount: result.toFixed(4),
      rate: effectiveRate.toFixed(6),
    });
  };
  React.useEffect(() => {
    fetchLiveRates();
  }, []);
  const fmtDate = function (d) {
    try {
      if (!d) return "-";
      const dt = new Date(d);
      return isNaN(dt.getTime()) ? "-" : dt.toLocaleString();
    } catch (_e) {
      return d || "-";
    }
  };
  return (
    <div className="overflow-x-a h-100p" style={{ padding: 24 }}>
      <div className="flex justify-between items-center mb-16">
        <div>
          <h2 className="fs-18 fw-700 fg m-0">
            {__t("enterprise.currency.title") || "Currency & Exchange Rates"}
          </h2>
          <p className="fs-12 fg-3 m-0 mt-2">
            {__t("enterprise.currency.subtitle") ||
              "Multi-currency support with live INR exchange rates"}
          </p>
        </div>
        <button className="ent-btn" onClick={fetchLiveRates}>
          {loading
            ? __t("enterprise.currency.fetching") || "Fetching..."
            : __t("enterprise.currency.refresh") || "Refresh rates"}
        </button>
      </div>
      {lastUpdated && (
        <div className="mb-12 fs-11" style={{ color: "var(--muted)" }}>
          {__t("enterprise.currency.lastUpdated") || "Last updated:"}{" "}
          {fmtDate(lastUpdated)}
        </div>
      )}
      <div className="mb-16">
        <h3 className="fs-14 mb-12">
          {__t("enterprise.currency.quickConvert") || "Quick Convert"}
        </h3>
        <div className="flex gap-8 items-center" style={{ flexWrap: "wrap" }}>
          <input
            className="w-100"
            type="number"
            value={convertAmt}
            onChange={(e) => setConvertAmt(e.target.value)}
          />
          <select
            className="px-10 py-6 br-6 border-line bg-canvas fg fs-12"
            value={convertFrom}
            onChange={(e) => setConvertFrom(e.target.value)}
          >
            <option value="USD">USD</option>
            <option value="INR">INR</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
            <option value="JPY">JPY</option>
            <option value="CAD">CAD</option>
            <option value="AUD">AUD</option>
            <option value="CHF">CHF</option>
            <option value="CNY">CNY</option>
            <option value="BRL">BRL</option>
            <option value="KRW">KRW</option>
          </select>
          <span className="fs-12" style={{ color: "var(--muted)" }}>
            {__t("enterprise.currency.to") || "to"}
          </span>
          <select
            className="px-10 py-6 br-6 border-line bg-canvas fg fs-12"
            value={convertTo}
            onChange={(e) => setConvertTo(e.target.value)}
          >
            <option value="INR">INR</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
            <option value="JPY">JPY</option>
            <option value="CAD">CAD</option>
            <option value="AUD">AUD</option>
            <option value="CHF">CHF</option>
            <option value="CNY">CNY</option>
            <option value="BRL">BRL</option>
            <option value="KRW">KRW</option>
          </select>
          <button className="ent-btn" onClick={doConvert}>
            {__t("enterprise.currency.convert") || "Convert"}
          </button>
        </div>
        {convertResult && (
          <div className="mt-10 fs-14 fw-600">
            {convertAmt} {convertFrom} = {convertResult.converted_amount}{" "}
            {convertTo}
            {convertResult.rate && (
              <span
                className="fw-400 ml-8 fs-12"
                style={{ color: "var(--muted)" }}
              >
                ({__t("enterprise.currency.rate") || "rate"}:{" "}
                {convertResult.rate})
              </span>
            )}
          </div>
        )}
      </div>
      {loading ? (
        <SkeletonTable />
      ) : rates.length === 0 ? (
        <EmptyState
          icon="💱"
          title={__t("enterprise.currency.empty.title") || "No Exchange Rates"}
          description={
            __t("enterprise.currency.empty.description") ||
            "No exchange rates are available. Try refreshing."
          }
        />
      ) : (
        <div className="bg-elev border-line p-16">
          <h3 className="fs-14 mb-12">
            {__t("enterprise.currency.exchangeRatesBase") ||
              "Exchange Rates (Base: INR)"}
          </h3>
          <table className="w-100p fs-12">
            <thead>
              <tr>
                <th className="ent-th">
                  {__t("enterprise.currency.table.from") || "From"}
                </th>
                <th className="ent-th">
                  {__t("enterprise.currency.table.to") || "To"}
                </th>
                <th className="text-right">
                  {__t("enterprise.currency.table.rate") || "Rate"}
                </th>
                <th className="ent-th">
                  {__t("enterprise.currency.table.source") || "Source"}
                </th>
                <th className="ent-th">
                  {__t("enterprise.currency.table.date") || "Date"}
                </th>
              </tr>
            </thead>
            <tbody>
              {rates.map((r, i) => (
                <tr key={r.id || i}>
                  <td className="fw-600">{r.from_currency}</td>
                  <td className="fw-600">{r.to_currency}</td>
                  <td className="text-right">{r.rate}</td>
                  <td className="ent-td">
                    {r.source || __t("enterprise.currency.manual") || "manual"}
                  </td>
                  <td className="ent-td">
                    {r.effective_date ? fmtDate(r.effective_date) : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
function ComplianceAutoNumberScreen() {
  const [tab, setTab] = React.useState("compliance");
  const [certs, setCerts] = React.useState([]);
  const [schemes, setSchemes] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    setLoading(true);
    Promise.all([
      apiRequest("/enterprise/compliance-certificates").catch(() => []),
      apiRequest("/enterprise/auto-number-schemes").catch(() => []),
    ])
      .then(([c, s]) => {
        setCerts(c || []);
        setSchemes(s || []);
        setLoading(false);
      })
      .catch(() => {
        console.error("Failed to load compliance data");
        setLoading(false);
      });
  }, []);
  return (
    <div className="p-24">
      <div className="flex justify-between items-center mb-16">
        <div>
          <h2 className="fs-18 fw-700 fg m-0">
            {__t("enterprise.compliance.title") ||
              "Compliance & Auto-Numbering"}
          </h2>
          <p className="fs-12 fg-3 m-0 mt-2">
            {__t("enterprise.compliance.subtitle") ||
              "Track compliance certificates and manage auto-numbering schemes"}
          </p>
        </div>
      </div>
      <div className="flex gap-4 mb-16">
        <button
          className={
            "ent-tab" + (tab === "compliance" ? " ent-tab-active" : "")
          }
          onClick={() => setTab("compliance")}
        >
          {__t("enterprise.compliance.tabCertificates") ||
            "Compliance Certificates"}
        </button>
        <button
          className={"ent-tab" + (tab === "numbering" ? " ent-tab-active" : "")}
          onClick={() => setTab("numbering")}
        >
          {__t("enterprise.compliance.tabNumbering") || "Auto-Numbering"}
        </button>
      </div>
      {loading ? (
        <SkeletonTable />
      ) : tab === "compliance" ? (
        certs.length === 0 ? (
          <EmptyState
            icon="📜"
            title={
              __t("enterprise.compliance.emptyCerts.title") ||
              "No Compliance Certificates"
            }
            description={
              __t("enterprise.compliance.emptyCerts.description") ||
              "No compliance certificates are being tracked."
            }
          />
        ) : (
          <div className="bg-elev border-line p-16">
            <table className="w-100p fs-12">
              <thead>
                <tr>
                  <th className="ent-th">
                    {__t("enterprise.compliance.table.partId") || "Part ID"}
                  </th>
                  <th className="ent-th">
                    {__t("enterprise.compliance.table.type") || "Type"}
                  </th>
                  <th className="ent-th">
                    {__t("enterprise.compliance.table.status") || "Status"}
                  </th>
                  <th className="ent-th">
                    {__t("enterprise.compliance.table.expiry") || "Expiry"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {certs.map((c) => (
                  <tr key={c.id}>
                    <td className="ent-td">{c.part_id}</td>
                    <td className="ent-td">{c.certificate_type || "-"}</td>
                    <td className="ent-td">
                      <span
                        className="ent-badge"
                        style={{
                          "--badge-bg":
                            (c.status === "valid"
                              ? "#10b981"
                              : c.status === "expired"
                                ? "#ef4444"
                                : "#eab308") + "20",
                          "--badge-fg":
                            c.status === "valid"
                              ? "#10b981"
                              : c.status === "expired"
                                ? "#ef4444"
                                : "#eab308",
                        }}
                      >
                        {c.status || "-"}
                      </span>
                    </td>
                    <td className="ent-td">
                      {c.expiry_date
                        ? (function () {
                            try {
                              const d = new Date(c.expiry_date);
                              return isNaN(d.getTime())
                                ? "-"
                                : d.toLocaleDateString();
                            } catch (_e) {
                              return "-";
                            }
                          })()
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : schemes.length === 0 ? (
        <EmptyState
          icon="🔢"
          title={
            __t("enterprise.compliance.emptySchemes.title") ||
            "No Numbering Schemes"
          }
          description={
            __t("enterprise.compliance.emptySchemes.description") ||
            "No auto-numbering schemes have been configured."
          }
        />
      ) : (
        <div className="bg-elev border-line p-16">
          <table className="w-100p fs-12">
            <thead>
              <tr>
                <th className="ent-th">
                  {__t("enterprise.compliance.table.entityType") ||
                    "Entity Type"}
                </th>
                <th className="ent-th">
                  {__t("enterprise.compliance.table.prefix") || "Prefix"}
                </th>
                <th className="text-right">
                  {__t("enterprise.compliance.table.nextNumber") ||
                    "Next Number"}
                </th>
                <th className="text-right">
                  {__t("enterprise.compliance.table.padding") || "Padding"}
                </th>
              </tr>
            </thead>
            <tbody>
              {schemes.map((s) => (
                <tr key={s.id}>
                  <td className="fw-600">{s.entity_type}</td>
                  <td className="font-mono">{s.prefix || "-"}</td>
                  <td className="text-right">{s.next_number}</td>
                  <td className="text-right">{s.padding || 5}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
function CustomAttributesScreen() {
  const [attrs, setAttrs] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [showCreate, setShowCreate] = React.useState(false);
  useEscToClose(showCreate, () => setShowCreate(false));
  const [form, setForm] = React.useState({
    name: "",
    entity_type: "part",
    data_type: "string",
    description: "",
  });
  const load = () => {
    setLoading(true);
    apiRequest("/enterprise/custom-attributes")
      .then((d) => {
        setAttrs(d);
        setLoading(false);
      })
      .catch(() => {
        console.error("Failed to load custom attributes");
        setAttrs([]);
        setLoading(false);
      });
  };
  React.useEffect(load, []);
  const create = async () => {
    try {
      await apiRequest("/enterprise/custom-attributes", {
        method: "POST",
        body: JSON.stringify(form),
      });
      toast(
        __t("enterprise.customAttributes.created") ||
          "Custom attribute created",
        { kind: "success" },
      );
      setShowCreate(false);
      setForm({
        name: "",
        entity_type: "part",
        data_type: "string",
        description: "",
      });
      load();
    } catch (e) {
      toast(e.message, { kind: "error" });
    }
  };
  return (
    <div className="p-24">
      <div className="flex justify-between items-center mb-16">
        <div>
          <h2 className="fs-18 fw-700 fg m-0">
            {__t("enterprise.customAttributes.title") || "Custom Attributes"}
          </h2>
          <p className="fs-12 fg-3 m-0 mt-2">
            {__t("enterprise.customAttributes.subtitle") ||
              "Define custom fields for parts, vendors, and other entities"}
          </p>
        </div>
        <button className="ent-btn" onClick={() => setShowCreate(true)}>
          {__t("enterprise.customAttributes.new") || "+ New Attribute"}
        </button>
      </div>
      {showCreate && (
        <div
          className="ent-modal"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowCreate(false)}
        >
          <div className="ent-modal-box" onClick={(e) => e.stopPropagation()}>
            <h3 className="fs-18 fw-700 fg m-0">
              {__t("enterprise.customAttributes.create.title") ||
                "New Custom Attribute"}
            </h3>
            <div className="flex flex-col gap-10 mt-12">
              <input
                className="px-10 py-6 br-6 border-line bg-canvas fg fs-12 w-100p"
                placeholder={
                  __t("enterprise.customAttributes.create.namePlaceholder") ||
                  "Name"
                }
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <select
                className="px-10 py-6 br-6 border-line bg-canvas fg fs-12"
                value={form.entity_type}
                onChange={(e) =>
                  setForm({ ...form, entity_type: e.target.value })
                }
              >
                <option value="part">
                  {__t("enterprise.customAttributes.create.entityPart") ||
                    "Part"}
                </option>
                <option value="vendor">
                  {__t("enterprise.customAttributes.create.entityVendor") ||
                    "Vendor"}
                </option>
                <option value="bom">
                  {__t("enterprise.customAttributes.create.entityBom") || "BOM"}
                </option>
                <option value="project">
                  {__t("enterprise.customAttributes.create.entityProject") ||
                    "Project"}
                </option>
              </select>
              <select
                className="px-10 py-6 br-6 border-line bg-canvas fg fs-12"
                value={form.data_type}
                onChange={(e) =>
                  setForm({ ...form, data_type: e.target.value })
                }
              >
                <option value="string">
                  {__t("enterprise.customAttributes.create.typeString") ||
                    "String"}
                </option>
                <option value="number">
                  {__t("enterprise.customAttributes.create.typeNumber") ||
                    "Number"}
                </option>
                <option value="boolean">
                  {__t("enterprise.customAttributes.create.typeBoolean") ||
                    "Boolean"}
                </option>
                <option value="date">
                  {__t("enterprise.customAttributes.create.typeDate") || "Date"}
                </option>
                <option value="json">
                  {__t("enterprise.customAttributes.create.typeJson") || "JSON"}
                </option>
              </select>
              <input
                className="px-10 py-6 br-6 border-line bg-canvas fg fs-12 w-100p"
                placeholder={
                  __t(
                    "enterprise.customAttributes.create.descriptionPlaceholder",
                  ) || "Description (optional)"
                }
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />
            </div>
            <div className="flex gap-8 justify-end mt-16">
              <button
                className="ent-btn-outline"
                onClick={() => setShowCreate(false)}
              >
                {__t("common.cancel") || "Cancel"}
              </button>
              <button className="ent-btn" onClick={create}>
                {__t("common.create") || "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
      {loading ? (
        <SkeletonTable />
      ) : attrs.length === 0 ? (
        <EmptyState
          icon="🏷️"
          title={
            __t("enterprise.customAttributes.empty.title") ||
            "No Custom Attributes"
          }
          description={
            __t("enterprise.customAttributes.empty.description") ||
            "Create custom attributes to extend your data model."
          }
          action={() => setShowCreate(true)}
          actionLabel={
            __t("enterprise.customAttributes.empty.action") ||
            "Create Attribute"
          }
        />
      ) : (
        <div className="bg-elev border-line p-16">
          <table className="w-100p fs-12">
            <thead>
              <tr>
                <th className="ent-th">
                  {__t("enterprise.customAttributes.table.name") || "Name"}
                </th>
                <th className="ent-th">
                  {__t("enterprise.customAttributes.table.entity") || "Entity"}
                </th>
                <th className="ent-th">
                  {__t("enterprise.customAttributes.table.type") || "Type"}
                </th>
                <th className="ent-th">
                  {__t("enterprise.customAttributes.table.description") ||
                    "Description"}
                </th>
              </tr>
            </thead>
            <tbody>
              {attrs.map((a) => (
                <tr key={a.id}>
                  <td className="fw-600">{a.name}</td>
                  <td className="ent-td">
                    <span
                      className="ent-badge"
                      style={{
                        "--badge-bg": "#3b82f620",
                        "--badge-fg": "#3b82f6",
                      }}
                    >
                      {a.entity_type}
                    </span>
                  </td>
                  <td className="ent-td">{a.data_type}</td>
                  <td className="ent-td">{a.description || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
function APIKeysScreen() {
  const [keys, setKeys] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [showCreate, setShowCreate] = React.useState(false);
  useEscToClose(showCreate, () => setShowCreate(false));
  const [form, setForm] = React.useState({
    name: "",
    description: "",
    expires_in_days: 90,
  });
  const [confirmRevokeId, setConfirmRevokeId] = React.useState(null);
  const STORAGE_KEY = "enterprise_api_keys";
  const loadSavedKeys = () => {
    try {
      const saved = storage.get(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch (_e) {
      return [];
    }
  };
  const saveKeys = (keysToSave) => {
    try {
      storage.set(STORAGE_KEY, JSON.stringify(keysToSave));
    } catch (_e) {
      /* ignore */
    }
  };
  const load = () => {
    setLoading(true);
    apiRequest("/api-keys/")
      .then((d) => {
        const saved = loadSavedKeys();
        const merged = [
          ...(Array.isArray(d) ? d : []),
          ...saved.filter((s) => !d.some((k) => k.id === s.id)),
        ];
        setKeys(merged);
        setLoading(false);
      })
      .catch(() => {
        const saved = loadSavedKeys();
        setKeys(saved);
        setLoading(false);
      });
  };
  React.useEffect(load, []);
  const create = async () => {
    try {
      const r = await apiRequest("/api-keys/", {
        method: "POST",
        body: JSON.stringify(form),
      });
      toast(__t("enterprise.apiKeys.created") || "API key created", {
        kind: "success",
      });
      setShowCreate(false);
      setForm({ name: "", description: "", expires_in_days: 90 });
      load();
      // Real keys must only ever come from the backend response.
      if (r && r.key) {
        toast("API Key: " + r.key, { kind: "info" });
      }
    } catch (_e) {
      // Do NOT fabricate or store a fake key on failure — surface the error only.
      toast(
        __t("enterprise.apiKeys.createFailed") ||
          "Could not create API key — please retry",
        { kind: "error" },
      );
    }
  };
  const revoke = (id) => {
    setConfirmRevokeId(id);
  };
  const executeRevoke = async () => {
    const id = confirmRevokeId;
    setConfirmRevokeId(null);
    try {
      await apiRequest("/api-keys/" + id, { method: "DELETE" });
      toast(__t("enterprise.apiKeys.revoked") || "API key revoked", {
        kind: "success",
      });
      load();
    } catch (_e) {
      const saved = loadSavedKeys();
      const updated = saved.filter((k) => k.id !== id);
      saveKeys(updated);
      toast(
        __t("enterprise.apiKeys.revokedLocal") ||
          "API key revoked (local only)",
        { kind: "success" },
      );
      load();
    }
  };
  return (
    <div className="p-24">
      <div className="flex justify-between items-center mb-16">
        <div>
          <h2 className="fs-18 fw-700 fg m-0">
            {__t("enterprise.apiKeys.title") || "API Keys"}
          </h2>
          <p className="fs-12 fg-3 m-0 mt-2">
            {__t("enterprise.apiKeys.subtitle") ||
              "Manage API keys for programmatic access"}
          </p>
        </div>
        <button className="ent-btn" onClick={() => setShowCreate(true)}>
          {__t("enterprise.apiKeys.generateKey") || "+ Generate Key"}
        </button>
      </div>
      {showCreate && (
        <div
          className="ent-modal"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowCreate(false)}
        >
          <div className="ent-modal-box" onClick={(e) => e.stopPropagation()}>
            <h3 className="fs-18 fw-700 fg m-0">
              {__t("enterprise.apiKeys.generate.title") || "Generate API Key"}
            </h3>
            <div className="flex flex-col gap-10 mt-12">
              <input
                className="px-10 py-6 br-6 border-line bg-canvas fg fs-12 w-100p"
                placeholder={
                  __t("enterprise.apiKeys.create.namePlaceholder") ||
                  "Name (e.g., CI Pipeline)"
                }
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <input
                className="px-10 py-6 br-6 border-line bg-canvas fg fs-12 w-100p"
                placeholder={
                  __t("enterprise.apiKeys.create.descriptionPlaceholder") ||
                  "Description (optional)"
                }
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />
              <input
                className="px-10 py-6 br-6 border-line bg-canvas fg fs-12 w-100p"
                type="number"
                placeholder={
                  __t("enterprise.apiKeys.create.expiresPlaceholder") ||
                  "Expires in days"
                }
                value={form.expires_in_days}
                onChange={(e) =>
                  setForm({
                    ...form,
                    expires_in_days: parseInt(e.target.value) || 90,
                  })
                }
              />
            </div>
            <div className="flex gap-8 justify-end mt-16">
              <button
                className="ent-btn-outline"
                onClick={() => setShowCreate(false)}
              >
                {__t("common.cancel") || "Cancel"}
              </button>
              <button className="ent-btn" onClick={create}>
                {__t("enterprise.apiKeys.generate") || "Generate"}
              </button>
            </div>
          </div>
        </div>
      )}
      {loading ? (
        <SkeletonTable />
      ) : keys.length === 0 ? (
        <EmptyState
          icon="🔑"
          title={__t("enterprise.apiKeys.empty.title") || "No API Keys"}
          description={
            __t("enterprise.apiKeys.empty.description") ||
            "Generate an API key to start integrating with the platform."
          }
          action={() => setShowCreate(true)}
          actionLabel={__t("enterprise.apiKeys.empty.action") || "Generate Key"}
        />
      ) : (
        <div className="bg-elev border-line p-16">
          <table className="w-100p fs-12">
            <thead>
              <tr>
                <th className="ent-th">
                  {__t("enterprise.apiKeys.table.name") || "Name"}
                </th>
                <th className="ent-th">
                  {__t("enterprise.apiKeys.table.keyPrefix") || "Key Prefix"}
                </th>
                <th className="ent-th">
                  {__t("enterprise.apiKeys.table.description") || "Description"}
                </th>
                <th className="ent-th">
                  {__t("enterprise.apiKeys.table.created") || "Created"}
                </th>
                <th className="ent-th">
                  {__t("enterprise.apiKeys.table.actions") || "Actions"}
                </th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id}>
                  <td className="fw-600">{k.name}</td>
                  <td className="font-mono">{k.key_prefix}...</td>
                  <td className="ent-td">{k.description || "-"}</td>
                  <td className="ent-td">
                    {k.created_at
                      ? (function () {
                          try {
                            const d = new Date(k.created_at);
                            return isNaN(d.getTime())
                              ? "-"
                              : d.toLocaleDateString();
                          } catch (_e) {
                            return "-";
                          }
                        })()
                      : "-"}
                  </td>
                  <td className="ent-td">
                    <button
                      style={{
                        ...S.btnOutline(),
                        color: "#ef4444",
                        borderColor: "#ef4444",
                      }}
                      onClick={() => revoke(k.id)}
                    >
                      {__t("enterprise.apiKeys.revoke") || "Revoke"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {confirmRevokeId !== null && (
        <window.ConfirmModal
          open
          onClose={() => setConfirmRevokeId(null)}
          title={__t("enterprise.apiKeys.confirmRevoke") || "Revoke API key?"}
          body={
            __t("enterprise.apiKeys.confirmRevokeBody") ||
            "Are you sure you want to revoke this API key? This cannot be undone."
          }
          danger
          confirmLabel={__t("enterprise.apiKeys.revoke") || "Revoke"}
          onConfirm={executeRevoke}
        />
      )}
    </div>
  );
}
export {
  EnterpriseDashboardsScreen,
  ServiceBOMScreen,
  RoutingScreen,
  WorkCentersScreen,
  LaborScreen,
  CurrencyScreen,
  ComplianceAutoNumberScreen,
  CustomAttributesScreen,
  APIKeysScreen,
};
window.EnterpriseDashboardsScreen = EnterpriseDashboardsScreen;
window.ServiceBOMScreen = ServiceBOMScreen;
window.RoutingScreen = RoutingScreen;
window.WorkCentersScreen = WorkCentersScreen;
window.LaborScreen = LaborScreen;
window.CurrencyScreen = CurrencyScreen;
window.ComplianceAutoNumberScreen = ComplianceAutoNumberScreen;
window.CustomAttributesScreen = CustomAttributesScreen;
window.APIKeysScreen = APIKeysScreen;
