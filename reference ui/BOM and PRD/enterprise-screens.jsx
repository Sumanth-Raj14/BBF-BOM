// Enterprise Screens — Service BOM, Routing, Work Centers, Labor, Currency, Compliance, Custom Attrs, API Keys, Dashboards

const S = {
  card: { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 16 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  title: { fontSize: 18, fontWeight: 700, color: "var(--fg)", margin: 0 },
  subtitle: { fontSize: 12, color: "var(--muted)", margin: "2px 0 0" },
  grid: { display: "grid", gap: 12 },
  btn: (accent) => ({ padding: "6px 14px", borderRadius: 6, border: "none", background: accent || "var(--accent)", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }),
  btnOutline: () => ({ padding: "6px 14px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "var(--fg)", fontSize: 12, cursor: "pointer" }),
  input: { padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--fg)", fontSize: 12, width: "100%" },
  select: { padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--fg)", fontSize: 12 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 12 },
  th: { textAlign: "left", padding: "8px 10px", borderBottom: "2px solid var(--border)", color: "var(--muted)", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 },
  td: { padding: "8px 10px", borderBottom: "1px solid var(--border)", color: "var(--fg)" },
  badge: (color) => ({ display: "inline-block", padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: color + "20", color: color }),
  kpi: { textAlign: "center", padding: 16, borderRadius: 10, background: "var(--card)", border: "1px solid var(--border)" },
  kpiVal: { fontSize: 28, fontWeight: 700, color: "var(--fg)", margin: 0 },
  kpiLabel: { fontSize: 11, color: "var(--muted)", margin: "4px 0 0", textTransform: "uppercase", letterSpacing: 0.5 },
  empty: { padding: 40, textAlign: "center", color: "var(--muted)" },
  tab: (active) => ({ padding: "6px 14px", borderRadius: 6, border: "none", background: active ? "var(--accent)" : "transparent", color: active ? "#fff" : "var(--muted)", fontSize: 12, fontWeight: 600, cursor: "pointer" }),
  modal: { position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)" },
  modalBox: { background: "var(--card)", borderRadius: 12, padding: 24, minWidth: 360, maxWidth: 520, boxShadow: "0 8px 32px rgba(0,0,0,0.2)" },
};

function EnterpriseDashboardsScreen() {
  const [tab, setTab] = React.useState("executive");
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    setLoading(true);
    apiRequest("/dashboards/" + tab).then(d => { setData(d); setLoading(false); }).catch(() => { setData(null); setLoading(false); });
  }, [tab]);

  const tabs = [
    { id: "executive", label: "Executive" },
    { id: "engineering", label: "Engineering" },
    { id: "manufacturing", label: "Manufacturing" },
    { id: "procurement", label: "Procurement" },
  ];

  return React.createElement("div", { style: { padding: 24 } },
    React.createElement("div", { style: S.header },
      React.createElement("div", null,
        React.createElement("h2", { style: S.title }, "Enterprise Dashboards"),
        React.createElement("p", { style: S.subtitle }, "Real-time KPIs across your organization")
      )
    ),
    React.createElement("div", { style: { display: "flex", gap: 4, marginBottom: 16 } },
      tabs.map(t => React.createElement("button", { key: t.id, style: S.tab(tab === t.id), onClick: () => setTab(t.id) }, t.label))
    ),
    loading ? React.createElement("div", { style: S.empty }, "Loading...") :
    !data ? React.createElement("div", { style: S.empty }, "Failed to load dashboard") :
    React.createElement(React.Fragment, null,
      data.kpis && React.createElement("div", { style: { ...S.grid, gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", marginBottom: 16 } },
        Object.entries(data.kpis).map(([k, v]) =>
          React.createElement("div", { key: k, style: S.kpi },
            React.createElement("div", { style: S.kpiVal }, typeof v === "number" ? v.toLocaleString() : v),
            React.createElement("div", { style: S.kpiLabel }, k.replace(/_/g, " "))
          )
        )
      ),
      data.monthly_spend && data.monthly_spend.length > 0 && React.createElement("div", { style: S.card },
        React.createElement("h3", { style: { ...S.title, fontSize: 14, marginBottom: 12 } }, "Monthly Spend"),
        React.createElement("table", { style: S.table },
          React.createElement("thead", null, React.createElement("tr", null,
            React.createElement("th", { style: S.th }, "Month"),
            React.createElement("th", { style: { ...S.th, textAlign: "right" } }, "Spend")
          )),
          React.createElement("tbody", null,
            data.monthly_spend.map((r, i) => React.createElement("tr", { key: i },
              React.createElement("td", { style: S.td }, r.month),
              React.createElement("td", { style: { ...S.td, textAlign: "right", fontWeight: 600 } }, "$" + (r.spend || 0).toLocaleString())
            ))
          )
        )
      ),
      data.top_vendors_by_spend && data.top_vendors_by_spend.length > 0 && React.createElement("div", { style: { ...S.card, marginTop: 12 } },
        React.createElement("h3", { style: { ...S.title, fontSize: 14, marginBottom: 12 } }, "Top Vendors by Spend"),
        React.createElement("table", { style: S.table },
          React.createElement("thead", null, React.createElement("tr", null,
            React.createElement("th", { style: S.th }, "Vendor"),
            React.createElement("th", { style: { ...S.th, textAlign: "right" } }, "Total Spend"),
            React.createElement("th", { style: { ...S.th, textAlign: "right" } }, "POs")
          )),
          React.createElement("tbody", null,
            data.top_vendors_by_spend.map((r, i) => React.createElement("tr", { key: i },
              React.createElement("td", { style: S.td }, r.vendorName),
              React.createElement("td", { style: { ...S.td, textAlign: "right", fontWeight: 600 } }, "$" + (r.total_spend || 0).toLocaleString()),
              React.createElement("td", { style: { ...S.td, textAlign: "right" } }, r.po_count)
            ))
          )
        )
      ),
      data.work_center_utilization && data.work_center_utilization.length > 0 && React.createElement("div", { style: { ...S.card, marginTop: 12 } },
        React.createElement("h3", { style: { ...S.title, fontSize: 14, marginBottom: 12 } }, "Work Center Utilization"),
        React.createElement("table", { style: S.table },
          React.createElement("thead", null, React.createElement("tr", null,
            React.createElement("th", { style: S.th }, "Code"),
            React.createElement("th", { style: S.th }, "Name"),
            React.createElement("th", { style: { ...S.th, textAlign: "right" } }, "Planned Hrs"),
            React.createElement("th", { style: { ...S.th, textAlign: "right" } }, "Available Hrs")
          )),
          React.createElement("tbody", null,
            data.work_center_utilization.map((r, i) => React.createElement("tr", { key: i },
              React.createElement("td", { style: S.td }, r.code),
              React.createElement("td", { style: S.td }, r.name),
              React.createElement("td", { style: { ...S.td, textAlign: "right" } }, r.planned),
              React.createElement("td", { style: { ...S.td, textAlign: "right" } }, r.available_hours_per_day)
            ))
          )
        )
      ),
      data.status_summary && data.status_summary.length > 0 && React.createElement("div", { style: { ...S.card, marginTop: 12 } },
        React.createElement("h3", { style: { ...S.title, fontSize: 14, marginBottom: 12 } }, "Status Summary"),
        React.createElement("table", { style: S.table },
          React.createElement("thead", null, React.createElement("tr", null,
            React.createElement("th", { style: S.th }, "Status"),
            React.createElement("th", { style: { ...S.th, textAlign: "right" } }, "Count")
          )),
          React.createElement("tbody", null,
            data.status_summary.map((r, i) => React.createElement("tr", { key: i },
              React.createElement("td", { style: S.td },
                React.createElement("span", { style: S.badge(r.status === "completed" ? "#10b981" : r.status === "draft" ? "#6b7280" : "#e85d1f") }, r.status)
              ),
              React.createElement("td", { style: { ...S.td, textAlign: "right", fontWeight: 600 } }, r.cnt)
            ))
          )
        )
      ),
      data.ecos_by_type && data.ecos_by_type.length > 0 && React.createElement("div", { style: { ...S.card, marginTop: 12 } },
        React.createElement("h3", { style: { ...S.title, fontSize: 14, marginBottom: 12 } }, "ECOs by Type"),
        React.createElement("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" } },
          data.ecos_by_type.map((r, i) => React.createElement("span", { key: i, style: { ...S.badge("#3b82f6"), fontSize: 12 } }, r.change_type + ": " + r.cnt))
        )
      )
    )
  );
}

function ServiceBOMScreen() {
  const [boms, setBoms] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [selected, setSelected] = React.useState(null);
  const [showCreate, setShowCreate] = React.useState(false);
  const [form, setForm] = React.useState({ name: "", description: "", service_type: "maintenance" });

  const load = () => { setLoading(true); apiRequest("/enterprise/service-bom").then(d => { setBoms(d); setLoading(false); }).catch(() => { setBoms([]); setLoading(false); }); };
  React.useEffect(load, []);

  const create = async () => {
    try {
      await apiRequest("/enterprise/service-bom", { method: "POST", body: JSON.stringify(form) });
      window.toast("Service BOM created", { kind: "success" });
      setShowCreate(false); setForm({ name: "", description: "", service_type: "maintenance" }); load();
    } catch (e) { window.toast(e.message, { kind: "error" }); }
  };

  return React.createElement("div", { style: { padding: 24 } },
    React.createElement("div", { style: S.header },
      React.createElement("div", null,
        React.createElement("h2", { style: S.title }, "Service BOM"),
        React.createElement("p", { style: S.subtitle }, "Manage service/maintenance BOMs for field operations")
      ),
      React.createElement("button", { style: S.btn(), onClick: () => setShowCreate(true) }, "+ New Service BOM")
    ),
    showCreate && React.createElement("div", { style: S.modal, onClick: () => setShowCreate(false) },
      React.createElement("div", { style: S.modalBox, onClick: e => e.stopPropagation() },
        React.createElement("h3", { style: S.title }, "New Service BOM"),
        React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 10, marginTop: 12 } },
          React.createElement("input", { style: S.input, placeholder: "Name", value: form.name, onChange: e => setForm({ ...form, name: e.target.value }) }),
          React.createElement("input", { style: S.input, placeholder: "Description", value: form.description, onChange: e => setForm({ ...form, description: e.target.value }) }),
          React.createElement("select", { style: S.select, value: form.service_type, onChange: e => setForm({ ...form, service_type: e.target.value }) },
            React.createElement("option", { value: "maintenance" }, "Maintenance"),
            React.createElement("option", { value: "repair" }, "Repair"),
            React.createElement("option", { value: "overhaul" }, "Overhaul"),
            React.createElement("option", { value: "inspection" }, "Inspection")
          )
        ),
        React.createElement("div", { style: { display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 } },
          React.createElement("button", { style: S.btnOutline(), onClick: () => setShowCreate(false) }, "Cancel"),
          React.createElement("button", { style: S.btn(), onClick: create }, "Create")
        )
      )
    ),
    loading ? React.createElement("div", { style: S.empty }, "Loading...") :
    boms.length === 0 ? React.createElement("div", { style: S.empty }, "No service BOMs yet. Create one to get started.") :
    React.createElement("div", { style: S.card },
      React.createElement("table", { style: S.table },
        React.createElement("thead", null, React.createElement("tr", null,
          React.createElement("th", { style: S.th }, "Name"),
          React.createElement("th", { style: S.th }, "Type"),
          React.createElement("th", { style: S.th }, "Items"),
          React.createElement("th", { style: S.th }, "Created")
        )),
        React.createElement("tbody", null,
          boms.map(b => React.createElement("tr", { key: b.id, style: { cursor: "pointer" }, onClick: () => setSelected(b) },
            React.createElement("td", { style: { ...S.td, fontWeight: 600 } }, b.name),
            React.createElement("td", { style: S.td }, React.createElement("span", { style: S.badge("#3b82f6") }, b.service_type)),
            React.createElement("td", { style: S.td }, b.items_count || 0),
            React.createElement("td", { style: S.td }, b.created_at ? new Date(b.created_at).toLocaleDateString() : "-")
          ))
        )
      )
    )
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
    ]).then(([r, p]) => { setRoutings(r); setPlans(p); setLoading(false); });
  }, []);

  return React.createElement("div", { style: { padding: 24 } },
    React.createElement("div", { style: S.header },
      React.createElement("div", null,
        React.createElement("h2", { style: S.title }, "Routing & Process Plans"),
        React.createElement("p", { style: S.subtitle }, "Define manufacturing routings and process plans")
      )
    ),
    React.createElement("div", { style: { display: "flex", gap: 4, marginBottom: 16 } },
      React.createElement("button", { style: S.tab(tab === "routings"), onClick: () => setTab("routings") }, "Routings"),
      React.createElement("button", { style: S.tab(tab === "plans"), onClick: () => setTab("plans") }, "Process Plans")
    ),
    loading ? React.createElement("div", { style: S.empty }, "Loading...") :
    tab === "routings" ? (
      routings.length === 0 ? React.createElement("div", { style: S.empty }, "No routings defined yet.") :
      React.createElement("div", { style: S.card },
        React.createElement("table", { style: S.table },
          React.createElement("thead", null, React.createElement("tr", null,
            React.createElement("th", { style: S.th }, "Code"),
            React.createElement("th", { style: S.th }, "Name"),
            React.createElement("th", { style: S.th }, "Part ID"),
            React.createElement("th", { style: S.th }, "Operations"),
            React.createElement("th", { style: S.th }, "Status")
          )),
          React.createElement("tbody", null,
            routings.map(r => React.createElement("tr", { key: r.id },
              React.createElement("td", { style: { ...S.td, fontWeight: 600, fontFamily: "var(--font-mono)" } }, r.code),
              React.createElement("td", { style: S.td }, r.name),
              React.createElement("td", { style: S.td }, r.part_id),
              React.createElement("td", { style: S.td }, r.operations_count || 0),
              React.createElement("td", { style: S.td }, React.createElement("span", { style: S.badge(r.is_active !== false ? "#10b981" : "#6b7280") }, r.is_active !== false ? "Active" : "Inactive"))
            ))
          )
        )
      )
    ) : (
      plans.length === 0 ? React.createElement("div", { style: S.empty }, "No process plans defined yet.") :
      React.createElement("div", { style: S.card },
        React.createElement("table", { style: S.table },
          React.createElement("thead", null, React.createElement("tr", null,
            React.createElement("th", { style: S.th }, "Code"),
            React.createElement("th", { style: S.th }, "Name"),
            React.createElement("th", { style: S.th }, "Steps"),
            React.createElement("th", { style: S.th }, "Est. Hours")
          )),
          React.createElement("tbody", null,
            plans.map(p => React.createElement("tr", { key: p.id },
              React.createElement("td", { style: { ...S.td, fontWeight: 600, fontFamily: "var(--font-mono)" } }, p.code),
              React.createElement("td", { style: S.td }, p.name),
              React.createElement("td", { style: S.td }, p.steps_count || 0),
              React.createElement("td", { style: S.td }, p.estimated_hours || "-")
            ))
          )
        )
      )
    )
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
    ]).then(([c, cap]) => { setCenters(c); setCapacity(cap); setLoading(false); });
  }, []);

  return React.createElement("div", { style: { padding: 24 } },
    React.createElement("div", { style: S.header },
      React.createElement("div", null,
        React.createElement("h2", { style: S.title }, "Work Centers & Capacity"),
        React.createElement("p", { style: S.subtitle }, "Manage work centers and monitor capacity utilization")
      )
    ),
    loading ? React.createElement("div", { style: S.empty }, "Loading...") :
    React.createElement(React.Fragment, null,
      capacity && capacity.work_centers && capacity.work_centers.length > 0 && React.createElement("div", { style: { ...S.grid, gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", marginBottom: 16 } },
        capacity.work_centers.map(wc => React.createElement("div", { key: wc.id, style: S.card },
          React.createElement("div", { style: { fontWeight: 600, fontSize: 13, marginBottom: 4 } }, wc.name || wc.code),
          React.createElement("div", { style: { fontSize: 11, color: "var(--muted)", marginBottom: 8 } }, wc.description || "No description"),
          React.createElement("div", { style: { display: "flex", justifyContent: "space-between", fontSize: 11 } },
            React.createElement("span", null, "Capacity: ", React.createElement("strong", null, wc.capacity_per_hour || "-", " /hr")),
            React.createElement("span", { style: S.badge(wc.is_active !== false ? "#10b981" : "#6b7280") }, wc.is_active !== false ? "Active" : "Inactive")
          )
        ))
      ),
      centers.length === 0 ? React.createElement("div", { style: S.empty }, "No work centers configured.") :
      React.createElement("div", { style: S.card },
        React.createElement("h3", { style: { ...S.title, fontSize: 14, marginBottom: 12 } }, "All Work Centers"),
        React.createElement("table", { style: S.table },
          React.createElement("thead", null, React.createElement("tr", null,
            React.createElement("th", { style: S.th }, "Code"),
            React.createElement("th", { style: S.th }, "Name"),
            React.createElement("th", { style: { ...S.th, textAlign: "right" } }, "Capacity/Hr"),
            React.createElement("th", { style: { ...S.th, textAlign: "right" } }, "Available Hrs/Day"),
            React.createElement("th", { style: S.th }, "Status")
          )),
          React.createElement("tbody", null,
            centers.map(wc => React.createElement("tr", { key: wc.id },
              React.createElement("td", { style: { ...S.td, fontWeight: 600, fontFamily: "var(--font-mono)" } }, wc.code),
              React.createElement("td", { style: S.td }, wc.name),
              React.createElement("td", { style: { ...S.td, textAlign: "right" } }, wc.capacity_per_hour),
              React.createElement("td", { style: { ...S.td, textAlign: "right" } }, wc.available_hours_per_day),
              React.createElement("td", { style: S.td }, React.createElement("span", { style: S.badge(wc.is_active !== false ? "#10b981" : "#6b7280") }, wc.is_active !== false ? "Active" : "Inactive"))
            ))
          )
        )
      )
    )
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
    ]).then(([r, t, c]) => { setRates(r); setTimesheets(t); setLaborCost(c); setLoading(false); });
  }, []);

  return React.createElement("div", { style: { padding: 24 } },
    React.createElement("div", { style: S.header },
      React.createElement("div", null,
        React.createElement("h2", { style: S.title }, "Labor & Timesheets"),
        React.createElement("p", { style: S.subtitle }, "Track labor rates, timesheets, and cost summaries")
      )
    ),
    React.createElement("div", { style: { display: "flex", gap: 4, marginBottom: 16 } },
      React.createElement("button", { style: S.tab(tab === "rates"), onClick: () => setTab("rates") }, "Labor Rates"),
      React.createElement("button", { style: S.tab(tab === "timesheets"), onClick: () => setTab("timesheets") }, "Timesheets"),
      React.createElement("button", { style: S.tab(tab === "cost"), onClick: () => setTab("cost") }, "Cost Summary")
    ),
    loading ? React.createElement("div", { style: S.empty }, "Loading...") :
    tab === "rates" ? (
      rates.length === 0 ? React.createElement("div", { style: S.empty }, "No labor rates defined.") :
      React.createElement("div", { style: S.card },
        React.createElement("table", { style: S.table },
          React.createElement("thead", null, React.createElement("tr", null,
            React.createElement("th", { style: S.th }, "Employee"),
            React.createElement("th", { style: S.th }, "Skill Level"),
            React.createElement("th", { style: { ...S.th, textAlign: "right" } }, "Regular Rate"),
            React.createElement("th", { style: { ...S.th, textAlign: "right" } }, "OT Rate"),
            React.createElement("th", { style: S.th }, "Status")
          )),
          React.createElement("tbody", null,
            rates.map(r => React.createElement("tr", { key: r.id },
              React.createElement("td", { style: { ...S.td, fontWeight: 600 } }, r.employee_name),
              React.createElement("td", { style: S.td }, r.skill_level || "-"),
              React.createElement("td", { style: { ...S.td, textAlign: "right" } }, "$" + (r.regular_rate || 0)),
              React.createElement("td", { style: { ...S.td, textAlign: "right" } }, "$" + (r.overtime_rate || 0)),
              React.createElement("td", { style: S.td }, React.createElement("span", { style: S.badge(r.is_active !== false ? "#10b981" : "#6b7280") }, r.is_active !== false ? "Active" : "Inactive"))
            ))
          )
        )
      )
    ) : tab === "timesheets" ? (
      timesheets.length === 0 ? React.createElement("div", { style: S.empty }, "No timesheet entries.") :
      React.createElement("div", { style: S.card },
        React.createElement("table", { style: S.table },
          React.createElement("thead", null, React.createElement("tr", null,
            React.createElement("th", { style: S.th }, "Employee"),
            React.createElement("th", { style: S.th }, "Date"),
            React.createElement("th", { style: { ...S.th, textAlign: "right" } }, "Hours"),
            React.createElement("th", { style: S.th }, "OT"),
            React.createElement("th", { style: S.th }, "Activity")
          )),
          React.createElement("tbody", null,
            timesheets.map(t => React.createElement("tr", { key: t.id },
              React.createElement("td", { style: S.td }, t.employee_id),
              React.createElement("td", { style: S.td }, t.date ? new Date(t.date).toLocaleDateString() : "-"),
              React.createElement("td", { style: { ...S.td, textAlign: "right", fontWeight: 600 } }, t.hours_worked),
              React.createElement("td", { style: S.td }, t.is_overtime ? React.createElement("span", { style: S.badge("#e85d1f") }, "OT") : "-"),
              React.createElement("td", { style: S.td }, t.activity_type || "-")
            ))
          )
        )
      )
    ) : (
      laborCost.length === 0 ? React.createElement("div", { style: S.empty }, "No labor cost data.") :
      React.createElement("div", { style: S.card },
        React.createElement("table", { style: S.table },
          React.createElement("thead", null, React.createElement("tr", null,
            React.createElement("th", { style: S.th }, "Employee"),
            React.createElement("th", { style: { ...S.th, textAlign: "right" } }, "Reg Hours"),
            React.createElement("th", { style: { ...S.th, textAlign: "right" } }, "OT Hours"),
            React.createElement("th", { style: { ...S.th, textAlign: "right" } }, "Reg Cost"),
            React.createElement("th", { style: { ...S.th, textAlign: "right" } }, "OT Cost"),
            React.createElement("th", { style: { ...S.th, textAlign: "right" } }, "Total")
          )),
          React.createElement("tbody", null,
            laborCost.map(c => React.createElement("tr", { key: c.employee_id },
              React.createElement("td", { style: { ...S.td, fontWeight: 600 } }, c.employee_name || c.employee_id),
              React.createElement("td", { style: { ...S.td, textAlign: "right" } }, c.regular_hours || 0),
              React.createElement("td", { style: { ...S.td, textAlign: "right" } }, c.overtime_hours || 0),
              React.createElement("td", { style: { ...S.td, textAlign: "right" } }, "$" + (c.regular_cost || 0).toFixed(2)),
              React.createElement("td", { style: { ...S.td, textAlign: "right" } }, "$" + (c.overtime_cost || 0).toFixed(2)),
              React.createElement("td", { style: { ...S.td, textAlign: "right", fontWeight: 700 } }, "$" + ((Number(c.regular_cost) || 0) + (Number(c.overtime_cost) || 0)).toFixed(2))
            ))
          )
        )
      )
    )
  );
}

function CurrencyScreen() {
  const [currencies, setCurrencies] = React.useState([]);
  const [rates, setRates] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [convertFrom, setConvertFrom] = React.useState("USD");
  const [convertTo, setConvertTo] = React.useState("INR");
  const [convertAmt, setConvertAmt] = React.useState("1000");
  const [convertResult, setConvertResult] = React.useState(null);

  React.useEffect(() => {
    setLoading(true);
    Promise.all([
      apiRequest("/enterprise/exchange-rates").catch(() => []),
    ]).then(([r]) => {
      setRates(Array.isArray(r) ? r : r.rates || []);
      setLoading(false);
    });
  }, []);

  const doConvert = async () => {
    try {
      const r = await apiRequest("/enterprise/exchange-rates/convert?from_currency=" + convertFrom + "&to_currency=" + convertTo + "&amount=" + convertAmt);
      setConvertResult(r);
    } catch (e) { window.toast(e.message, { kind: "error" }); }
  };

  return React.createElement("div", { style: { padding: 24 } },
    React.createElement("div", { style: S.header },
      React.createElement("div", null,
        React.createElement("h2", { style: S.title }, "Currency & Exchange Rates"),
        React.createElement("p", { style: S.subtitle }, "Multi-currency support with live exchange rates")
      )
    ),
    React.createElement("div", { style: { ...S.card, marginBottom: 16 } },
      React.createElement("h3", { style: { ...S.title, fontSize: 14, marginBottom: 12 } }, "Quick Convert"),
      React.createElement("div", { style: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" } },
        React.createElement("input", { style: { ...S.input, width: 100 }, type: "number", value: convertAmt, onChange: e => setConvertAmt(e.target.value) }),
        React.createElement("select", { style: S.select, value: convertFrom, onChange: e => setConvertFrom(e.target.value) },
          React.createElement("option", { value: "USD" }, "USD"),
          React.createElement("option", { value: "INR" }, "INR"),
          React.createElement("option", { value: "EUR" }, "EUR"),
          React.createElement("option", { value: "GBP" }, "GBP"),
          React.createElement("option", { value: "JPY" }, "JPY")
        ),
        React.createElement("span", { style: { color: "var(--muted)", fontSize: 12 } }, "to"),
        React.createElement("select", { style: S.select, value: convertTo, onChange: e => setConvertTo(e.target.value) },
          React.createElement("option", { value: "INR" }, "INR"),
          React.createElement("option", { value: "USD" }, "USD"),
          React.createElement("option", { value: "EUR" }, "EUR"),
          React.createElement("option", { value: "GBP" }, "GBP"),
          React.createElement("option", { value: "JPY" }, "JPY")
        ),
        React.createElement("button", { style: S.btn(), onClick: doConvert }, "Convert")
      ),
      convertResult && React.createElement("div", { style: { marginTop: 10, fontSize: 14, fontWeight: 600 } },
        convertAmt + " " + convertFrom + " = " + (convertResult.converted_amount || convertResult.result || "?") + " " + convertTo,
        convertResult.rate && React.createElement("span", { style: { fontWeight: 400, color: "var(--muted)", marginLeft: 8, fontSize: 12 } }, "(rate: " + convertResult.rate + ")")
      )
    ),
    loading ? React.createElement("div", { style: S.empty }, "Loading...") :
    rates.length === 0 ? React.createElement("div", { style: S.empty }, "No exchange rates configured.") :
    React.createElement("div", { style: S.card },
      React.createElement("h3", { style: { ...S.title, fontSize: 14, marginBottom: 12 } }, "Exchange Rates"),
      React.createElement("table", { style: S.table },
        React.createElement("thead", null, React.createElement("tr", null,
          React.createElement("th", { style: S.th }, "From"),
          React.createElement("th", { style: S.th }, "To"),
          React.createElement("th", { style: { ...S.th, textAlign: "right" } }, "Rate"),
          React.createElement("th", { style: S.th }, "Source"),
          React.createElement("th", { style: S.th }, "Date")
        )),
        React.createElement("tbody", null,
          rates.map((r, i) => React.createElement("tr", { key: r.id || i },
            React.createElement("td", { style: { ...S.td, fontWeight: 600 } }, r.from_currency),
            React.createElement("td", { style: { ...S.td, fontWeight: 600 } }, r.to_currency),
            React.createElement("td", { style: { ...S.td, textAlign: "right" } }, r.rate),
            React.createElement("td", { style: S.td }, r.source || "manual"),
            React.createElement("td", { style: S.td }, r.effective_date || r.created_at ? new Date(r.effective_date || r.created_at).toLocaleDateString() : "-")
          ))
        )
      )
    )
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
    ]).then(([c, s]) => { setCerts(c); setSchemes(s); setLoading(false); });
  }, []);

  return React.createElement("div", { style: { padding: 24 } },
    React.createElement("div", { style: S.header },
      React.createElement("div", null,
        React.createElement("h2", { style: S.title }, "Compliance & Auto-Numbering"),
        React.createElement("p", { style: S.subtitle }, "Track compliance certificates and manage auto-numbering schemes")
      )
    ),
    React.createElement("div", { style: { display: "flex", gap: 4, marginBottom: 16 } },
      React.createElement("button", { style: S.tab(tab === "compliance"), onClick: () => setTab("compliance") }, "Compliance Certificates"),
      React.createElement("button", { style: S.tab(tab === "numbering"), onClick: () => setTab("numbering") }, "Auto-Numbering")
    ),
    loading ? React.createElement("div", { style: S.empty }, "Loading...") :
    tab === "compliance" ? (
      certs.length === 0 ? React.createElement("div", { style: S.empty }, "No compliance certificates tracked.") :
      React.createElement("div", { style: S.card },
        React.createElement("table", { style: S.table },
          React.createElement("thead", null, React.createElement("tr", null,
            React.createElement("th", { style: S.th }, "Part ID"),
            React.createElement("th", { style: S.th }, "Type"),
            React.createElement("th", { style: S.th }, "Status"),
            React.createElement("th", { style: S.th }, "Expiry")
          )),
          React.createElement("tbody", null,
            certs.map(c => React.createElement("tr", { key: c.id },
              React.createElement("td", { style: S.td }, c.part_id),
              React.createElement("td", { style: S.td }, c.certificate_type || "-"),
              React.createElement("td", { style: S.td }, React.createElement("span", { style: S.badge(c.status === "valid" ? "#10b981" : c.status === "expired" ? "#ef4444" : "#eab308") }, c.status || "-")),
              React.createElement("td", { style: S.td }, c.expiry_date ? new Date(c.expiry_date).toLocaleDateString() : "-")
            ))
          )
        )
      )
    ) : (
      schemes.length === 0 ? React.createElement("div", { style: S.empty }, "No auto-numbering schemes configured.") :
      React.createElement("div", { style: S.card },
        React.createElement("table", { style: S.table },
          React.createElement("thead", null, React.createElement("tr", null,
            React.createElement("th", { style: S.th }, "Entity Type"),
            React.createElement("th", { style: S.th }, "Prefix"),
            React.createElement("th", { style: { ...S.th, textAlign: "right" } }, "Next Number"),
            React.createElement("th", { style: { ...S.th, textAlign: "right" } }, "Padding")
          )),
          React.createElement("tbody", null,
            schemes.map(s => React.createElement("tr", { key: s.id },
              React.createElement("td", { style: { ...S.td, fontWeight: 600 } }, s.entity_type),
              React.createElement("td", { style: { ...S.td, fontFamily: "var(--font-mono)" } }, s.prefix || "-"),
              React.createElement("td", { style: { ...S.td, textAlign: "right" } }, s.next_number),
              React.createElement("td", { style: { ...S.td, textAlign: "right" } }, s.padding || 5)
            ))
          )
        )
      )
    )
  );
}

function CustomAttributesScreen() {
  const [attrs, setAttrs] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [showCreate, setShowCreate] = React.useState(false);
  const [form, setForm] = React.useState({ name: "", entity_type: "part", data_type: "string", description: "" });

  const load = () => { setLoading(true); apiRequest("/enterprise/custom-attributes").then(d => { setAttrs(d); setLoading(false); }).catch(() => { setAttrs([]); setLoading(false); }); };
  React.useEffect(load, []);

  const create = async () => {
    try {
      await apiRequest("/enterprise/custom-attributes", { method: "POST", body: JSON.stringify(form) });
      window.toast("Custom attribute created", { kind: "success" });
      setShowCreate(false); setForm({ name: "", entity_type: "part", data_type: "string", description: "" }); load();
    } catch (e) { window.toast(e.message, { kind: "error" }); }
  };

  return React.createElement("div", { style: { padding: 24 } },
    React.createElement("div", { style: S.header },
      React.createElement("div", null,
        React.createElement("h2", { style: S.title }, "Custom Attributes"),
        React.createElement("p", { style: S.subtitle }, "Define custom fields for parts, vendors, and other entities")
      ),
      React.createElement("button", { style: S.btn(), onClick: () => setShowCreate(true) }, "+ New Attribute")
    ),
    showCreate && React.createElement("div", { style: S.modal, onClick: () => setShowCreate(false) },
      React.createElement("div", { style: S.modalBox, onClick: e => e.stopPropagation() },
        React.createElement("h3", { style: S.title }, "New Custom Attribute"),
        React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 10, marginTop: 12 } },
          React.createElement("input", { style: S.input, placeholder: "Name", value: form.name, onChange: e => setForm({ ...form, name: e.target.value }) }),
          React.createElement("select", { style: S.select, value: form.entity_type, onChange: e => setForm({ ...form, entity_type: e.target.value }) },
            React.createElement("option", { value: "part" }, "Part"),
            React.createElement("option", { value: "vendor" }, "Vendor"),
            React.createElement("option", { value: "bom" }, "BOM"),
            React.createElement("option", { value: "project" }, "Project")
          ),
          React.createElement("select", { style: S.select, value: form.data_type, onChange: e => setForm({ ...form, data_type: e.target.value }) },
            React.createElement("option", { value: "string" }, "String"),
            React.createElement("option", { value: "number" }, "Number"),
            React.createElement("option", { value: "boolean" }, "Boolean"),
            React.createElement("option", { value: "date" }, "Date"),
            React.createElement("option", { value: "json" }, "JSON")
          ),
          React.createElement("input", { style: S.input, placeholder: "Description (optional)", value: form.description, onChange: e => setForm({ ...form, description: e.target.value }) })
        ),
        React.createElement("div", { style: { display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 } },
          React.createElement("button", { style: S.btnOutline(), onClick: () => setShowCreate(false) }, "Cancel"),
          React.createElement("button", { style: S.btn(), onClick: create }, "Create")
        )
      )
    ),
    loading ? React.createElement("div", { style: S.empty }, "Loading...") :
    attrs.length === 0 ? React.createElement("div", { style: S.empty }, "No custom attributes defined. Create one to extend your data model.") :
    React.createElement("div", { style: S.card },
      React.createElement("table", { style: S.table },
        React.createElement("thead", null, React.createElement("tr", null,
          React.createElement("th", { style: S.th }, "Name"),
          React.createElement("th", { style: S.th }, "Entity"),
          React.createElement("th", { style: S.th }, "Type"),
          React.createElement("th", { style: S.th }, "Description")
        )),
        React.createElement("tbody", null,
          attrs.map(a => React.createElement("tr", { key: a.id },
            React.createElement("td", { style: { ...S.td, fontWeight: 600 } }, a.name),
            React.createElement("td", { style: S.td }, React.createElement("span", { style: S.badge("#3b82f6") }, a.entity_type)),
            React.createElement("td", { style: S.td }, a.data_type),
            React.createElement("td", { style: S.td }, a.description || "-")
          ))
        )
      )
    )
  );
}

function APIKeysScreen() {
  const [keys, setKeys] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [showCreate, setShowCreate] = React.useState(false);
  const [form, setForm] = React.useState({ name: "", description: "", expires_in_days: 90 });

  const load = () => { setLoading(true); apiRequest("/api-keys/").then(d => { setKeys(d); setLoading(false); }).catch(() => { setKeys([]); setLoading(false); }); };
  React.useEffect(load, []);

  const create = async () => {
    try {
      const r = await apiRequest("/api-keys/", { method: "POST", body: JSON.stringify(form) });
      window.toast("API key created", { kind: "success" });
      setShowCreate(false); setForm({ name: "", description: "", expires_in_days: 90 }); load();
      if (r && r.key) {
        window.alert("Your API key (copy it now, it won't be shown again):\n\n" + r.key);
      }
    } catch (e) { window.toast(e.message, { kind: "error" }); }
  };

  const revoke = async (id) => {
    if (!confirm("Revoke this API key?")) return;
    try {
      await apiRequest("/api-keys/" + id, { method: "DELETE" });
      window.toast("API key revoked", { kind: "success" }); load();
    } catch (e) { window.toast(e.message, { kind: "error" }); }
  };

  return React.createElement("div", { style: { padding: 24 } },
    React.createElement("div", { style: S.header },
      React.createElement("div", null,
        React.createElement("h2", { style: S.title }, "API Keys"),
        React.createElement("p", { style: S.subtitle }, "Manage API keys for programmatic access")
      ),
      React.createElement("button", { style: S.btn(), onClick: () => setShowCreate(true) }, "+ Generate Key")
    ),
    showCreate && React.createElement("div", { style: S.modal, onClick: () => setShowCreate(false) },
      React.createElement("div", { style: S.modalBox, onClick: e => e.stopPropagation() },
        React.createElement("h3", { style: S.title }, "Generate API Key"),
        React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 10, marginTop: 12 } },
          React.createElement("input", { style: S.input, placeholder: "Name (e.g., CI Pipeline)", value: form.name, onChange: e => setForm({ ...form, name: e.target.value }) }),
          React.createElement("input", { style: S.input, placeholder: "Description (optional)", value: form.description, onChange: e => setForm({ ...form, description: e.target.value }) }),
          React.createElement("input", { style: S.input, type: "number", placeholder: "Expires in days", value: form.expires_in_days, onChange: e => setForm({ ...form, expires_in_days: parseInt(e.target.value) || 90 }) })
        ),
        React.createElement("div", { style: { display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 } },
          React.createElement("button", { style: S.btnOutline(), onClick: () => setShowCreate(false) }, "Cancel"),
          React.createElement("button", { style: S.btn(), onClick: create }, "Generate")
        )
      )
    ),
    loading ? React.createElement("div", { style: S.empty }, "Loading...") :
    keys.length === 0 ? React.createElement("div", { style: S.empty }, "No API keys. Generate one to get started.") :
    React.createElement("div", { style: S.card },
      React.createElement("table", { style: S.table },
        React.createElement("thead", null, React.createElement("tr", null,
          React.createElement("th", { style: S.th }, "Name"),
          React.createElement("th", { style: S.th }, "Key Prefix"),
          React.createElement("th", { style: S.th }, "Description"),
          React.createElement("th", { style: S.th }, "Created"),
          React.createElement("th", { style: S.th }, "Actions")
        )),
        React.createElement("tbody", null,
          keys.map(k => React.createElement("tr", { key: k.id },
            React.createElement("td", { style: { ...S.td, fontWeight: 600 } }, k.name),
            React.createElement("td", { style: { ...S.td, fontFamily: "var(--font-mono)" } }, k.key_prefix + "..."),
            React.createElement("td", { style: S.td }, k.description || "-"),
            React.createElement("td", { style: S.td }, k.created_at ? new Date(k.created_at).toLocaleDateString() : "-"),
            React.createElement("td", { style: S.td },
              React.createElement("button", { style: { ...S.btnOutline(), color: "#ef4444", borderColor: "#ef4444" }, onClick: () => revoke(k.id) }, "Revoke")
            )
          ))
        )
      )
    )
  );
}

window.EnterpriseDashboardsScreen = EnterpriseDashboardsScreen;
window.ServiceBOMScreen = ServiceBOMScreen;
window.RoutingScreen = RoutingScreen;
window.WorkCentersScreen = WorkCentersScreen;
window.LaborScreen = LaborScreen;
window.CurrencyScreen = CurrencyScreen;
window.ComplianceAutoNumberScreen = ComplianceAutoNumberScreen;
window.CustomAttributesScreen = CustomAttributesScreen;
window.APIKeysScreen = APIKeysScreen;
