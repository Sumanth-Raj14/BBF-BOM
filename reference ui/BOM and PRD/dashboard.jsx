// Role-specific Dashboard + Workspace Budget tracker.

window.WORKSPACE_BUDGET = {
  annual: 50000000,   // ₹5 Cr annual procurement budget
  spent: 18420000,    // ₹1.84 Cr spent YTD
  committed: 6240000, // ₹62.4L in-flight POs
  byProject: {
    "ATLAS":      { spent: 9840000, committed: 3120000, budget: 28000000 },
    "HORIZON":    { spent: 5240000, committed: 1840000, budget: 12000000 },
    "ATLAS-LITE": { spent: 1820000, committed: 480000,  budget: 6000000 },
    "NEBULA":     { spent: 1520000, committed: 800000,  budget: 4000000 },
  },
  byCategory: {
    Electrical: 0.42, Optical: 0.18, Mechanical: 0.20, Hardware: 0.06, Cable: 0.08, Other: 0.06,
  },
  monthly: [1.2, 1.4, 1.3, 1.6, 1.8, 1.9, 1.7, 1.9, 2.1, 2.0, 1.8, 1.9], // ₹Cr per month
};

function DashboardScreen() {
  const ctx = window.useAppStore();
  const role = ctx?.userRole || "Admin";
  const [period, setPeriod] = React.useState("FY 2026");
  const [editingBudget, setEditingBudget] = React.useState(false);
  const [budgetEdits, setBudgetEdits] = React.useState(null);

  const startBudgetEdit = () => {
    setBudgetEdits({
      annual: window.WORKSPACE_BUDGET.annual,
      byProject: Object.fromEntries(Object.entries(window.WORKSPACE_BUDGET.byProject).map(([k, v]) => [k, { ...v }])),
    });
    setEditingBudget(true);
  };

  const saveBudget = () => {
    if (!budgetEdits) return;
    window.WORKSPACE_BUDGET.annual = budgetEdits.annual;
    Object.entries(budgetEdits.byProject).forEach(([k, v]) => { window.WORKSPACE_BUDGET.byProject[k] = v; });
    setEditingBudget(false);
    window.toast("Workspace budget updated", { kind: "success" });
  };

  // Period-scaled budget — same annual; spent/committed scale to the period
  const PERIODS = {
    "FY 2026":   { spent: 1.0, committed: 1.0, label: "FY 2026" },
    "Q3 2026":   { spent: 0.28, committed: 0.42, label: "Q3 2026 (Jul–Sep)" },
    "Q2 2026":   { spent: 0.34, committed: 0.18, label: "Q2 2026 (Apr–Jun)" },
    "Q1 2026":   { spent: 0.24, committed: 0.08, label: "Q1 2026 (Jan–Mar)" },
    "Last 30d":  { spent: 0.09, committed: 0.42, label: "Last 30 days" },
    "Last 7d":   { spent: 0.024, committed: 0.42, label: "Last 7 days" },
  };
  const scale = PERIODS[period] || PERIODS["FY 2026"];
  const wb = {
    ...window.WORKSPACE_BUDGET,
    spent: Math.round(window.WORKSPACE_BUDGET.spent * scale.spent),
    committed: Math.round(window.WORKSPACE_BUDGET.committed * scale.committed),
  };
  const pctSpent = (wb.spent / wb.annual) * 100;
  const pctCommitted = ((wb.spent + wb.committed) / wb.annual) * 100;
  const remaining = wb.annual - wb.spent - wb.committed;
  const overBudget = pctCommitted > 100;

  // Role-specific tile set
  const tilesByRole = {
    Admin: ["budget","at-risk","approvals","activity","vendors","spend-mix"],
    Engineering: ["budget","my-boms","approvals","at-risk","activity","spend-mix"],
    Procurement: ["budget","in-flight","at-risk","vendors","approvals","spend-mix"],
    Finance: ["budget","spend-mix","at-risk","cost-trend","approvals","activity"],
    Viewer: ["budget","activity","spend-mix"],
  };
  const tiles = tilesByRole[role] || tilesByRole.Admin;

  return (
    <div className="screen-wrap" data-screen-label="Dashboard">
      <div className="screen-header">
        <div>
          <h1>Dashboard</h1>
          <div className="sub">{role} view · FY 2026 · Updated just now</div>
        </div>
        <div style={{display: "flex", gap: 8}}>
          <window.DropdownButton
            width={200}
            trigger={<button className="btn">{period} <Icon.ChevronDown size={10}/></button>}
            items={Object.keys(PERIODS).map(k => ({
              icon: period === k ? <Icon.Check size={11}/> : <span style={{width: 11}}/>,
              label: PERIODS[k].label,
              onClick: () => setPeriod(k),
            }))}
          />
          <button className="btn" onClick={() => window.__nav?.("analytics")}><Icon.Chart size={12}/> Deep analytics</button>
        </div>
      </div>

      {/* Workspace Budget — always at top, shared across all projects */}
      <div style={{padding: 18, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: "var(--r-3)", marginBottom: 14, position: "relative", overflow: "hidden"}}>
        <div style={{display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14}}>
          <div style={{flex: 1}}>
            <div style={{display: "flex", alignItems: "center", gap: 8, marginBottom: 4}}>
              <span style={{fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--fg-3)"}}>Workspace Budget · {scale.label}</span>
              {!editingBudget && <button className="icon-btn" style={{width: 20, height: 20}} onClick={startBudgetEdit} title="Edit budget"><Icon.Edit size={10}/></button>}
            </div>
            {editingBudget ? (
              <div style={{display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap"}}>
                <div>
                  <label style={{fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-3)", display: "block", marginBottom: 2}}>Annual budget (USD)</label>
                  <input type="number" className="input mono" value={budgetEdits.annual} onChange={e => setBudgetEdits({ ...budgetEdits, annual: Number(e.target.value) || 0 })} style={{width: 160, height: 28, fontSize: 12}}/>
                </div>
                {Object.entries(budgetEdits.byProject).map(([k, v]) => (
                  <div key={k}>
                    <label style={{fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-3)", display: "block", marginBottom: 2}}>{k}</label>
                    <input type="number" className="input mono" value={v.budget} onChange={e => setBudgetEdits({ ...budgetEdits, byProject: { ...budgetEdits.byProject, [k]: { ...v, budget: Number(e.target.value) || 0 } } })} style={{width: 120, height: 28, fontSize: 11}}/>
                  </div>
                ))}
                <div style={{display: "flex", gap: 4, alignSelf: "flex-end"}}>
                  <button className="btn small" onClick={() => setEditingBudget(false)}>Cancel</button>
                  <button className="btn small primary" onClick={saveBudget}><Icon.Check size={10}/> Save</button>
                </div>
              </div>
            ) : (
              <div style={{display: "flex", alignItems: "baseline", gap: 12}}>
                <span style={{fontFamily: "var(--font-mono)", fontSize: 32, fontWeight: 700, letterSpacing: "-0.02em"}}>{window.INR(wb.spent, 0)}</span>
                <span style={{fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--fg-3)"}}>of {window.INR(wb.annual, 0)}</span>
                <span style={{padding: "3px 8px", borderRadius: 99, fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, background: overBudget ? "color-mix(in oklch, var(--danger) 14%, var(--bg))" : pctCommitted > 80 ? "color-mix(in oklch, var(--warn) 14%, var(--bg))" : "color-mix(in oklch, var(--ok) 14%, var(--bg))", color: overBudget ? "var(--danger)" : pctCommitted > 80 ? "var(--warn)" : "var(--ok)"}}>
                  {pctCommitted.toFixed(1)}% allocated
                </span>
              </div>
            )}
          </div>
          {!editingBudget && (
            <div style={{textAlign: "right", flexShrink: 0}}>
              <div style={{fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.06em"}}>Remaining</div>
              <div style={{fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 700, color: remaining < 0 ? "var(--danger)" : "var(--ok)"}}>{window.INR(remaining, 0)}</div>
              <div style={{fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)"}}>{(remaining / wb.annual * 100).toFixed(1)}% headroom</div>
            </div>
          )}
        </div>

        {/* Stacked progress bar: spent vs committed vs remaining */}
        <div style={{height: 16, background: "var(--bg-sunk)", borderRadius: 4, overflow: "hidden", display: "flex", marginBottom: 8}}>
          <div style={{width: pctSpent + "%", background: "var(--accent)", display: "flex", alignItems: "center", paddingLeft: 8, color: "white", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700}}>
            {pctSpent > 8 ? "SPENT " + pctSpent.toFixed(0) + "%" : ""}
          </div>
          <div style={{width: (wb.committed / wb.annual * 100) + "%", background: "color-mix(in oklch, var(--accent) 50%, var(--bg-sunk))", display: "flex", alignItems: "center", paddingLeft: 6, color: "var(--fg)", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600}}>
            {(wb.committed / wb.annual * 100) > 5 ? "COMMITTED" : ""}
          </div>
        </div>
        <div style={{display: "flex", gap: 18, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)"}}>
          <span style={{display: "inline-flex", alignItems: "center", gap: 6}}><span style={{width: 10, height: 10, borderRadius: 2, background: "var(--accent)"}}/> Spent {window.INR(wb.spent, 0)}</span>
          <span style={{display: "inline-flex", alignItems: "center", gap: 6}}><span style={{width: 10, height: 10, borderRadius: 2, background: "color-mix(in oklch, var(--accent) 50%, var(--bg-sunk))"}}/> Committed {window.INR(wb.committed, 0)}</span>
          <span style={{display: "inline-flex", alignItems: "center", gap: 6}}><span style={{width: 10, height: 10, borderRadius: 2, background: "var(--bg-sunk)", border: "1px solid var(--line)"}}/> Available {window.INR(remaining, 0)}</span>
        </div>

        {/* Per-project breakdown */}
        <div style={{marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--line)"}}>
          <div style={{fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-3)", marginBottom: 10}}>By project</div>
          <div style={{display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10}}>
            {Object.entries(wb.byProject).map(([k, p]) => {
              const used = (p.spent + p.committed) / p.budget * 100;
              const c = used > 100 ? "var(--danger)" : used > 80 ? "var(--warn)" : "var(--ok)";
              return (
                <div key={k} onClick={() => { ctx?.switchProject?.(k); window.__nav?.("bom"); }} style={{padding: 10, background: "var(--bg-elev)", border: "1px solid var(--line)", borderRadius: "var(--r-2)", cursor: "pointer", transition: "border-color 0.1s"}} onMouseEnter={e => e.currentTarget.style.borderColor = "var(--accent)"} onMouseLeave={e => e.currentTarget.style.borderColor = "var(--line)"}>
                  <div style={{display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4}}>
                    <span style={{fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700}}>{k}</span>
                    <span style={{fontFamily: "var(--font-mono)", fontSize: 10, color: c, fontWeight: 600}}>{used.toFixed(0)}%</span>
                  </div>
                  <div style={{height: 4, background: "var(--bg-sunk)", borderRadius: 2, overflow: "hidden", marginBottom: 4}}>
                    <div style={{height: "100%", width: Math.min(100, used) + "%", background: c}}/>
                  </div>
                  <div style={{fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)"}}>{window.INR(p.spent, 0)} / {window.INR(p.budget, 0)}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Role-specific tile grid */}
      <div style={{display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12}}>
        {tiles.includes("at-risk") && <RiskTile/>}
        {tiles.includes("approvals") && <ApprovalsTile role={role}/>}
        {tiles.includes("in-flight") && <InFlightTile/>}
        {tiles.includes("my-boms") && <MyBOMsTile/>}
        {tiles.includes("vendors") && <VendorsTile/>}
        {tiles.includes("spend-mix") && <SpendMixTile/>}
        {tiles.includes("cost-trend") && <CostTrendTile/>}
        {tiles.includes("activity") && <ActivityTile/>}
      </div>
    </div>
  );
}

function Tile({ title, action, onAction, children }) {
  return (
    <div style={{padding: 14, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: "var(--r-3)"}}>
      <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12}}>
        <span style={{fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--fg-3)", fontWeight: 700}}>{title}</span>
        {action && <button onClick={onAction} style={{background: "transparent", border: "none", color: "var(--accent)", fontSize: 10, fontFamily: "var(--font-mono)", cursor: "pointer", letterSpacing: "0.04em"}}>{action} →</button>}
      </div>
      {children}
    </div>
  );
}

function RiskTile() {
  const items = [
    { pn: "EL-BMS-12S", reason: "Lead time 28d → 35d", sev: "high" },
    { pn: "HW-FAS-M3-08", reason: "Duplicate detected", sev: "med" },
    { pn: "EL-MCU-STM32H7", reason: "Single-source CN", sev: "med" },
  ];
  return (
    <Tile title="Supply Risk" action="View all" onAction={() => window.__nav?.("bom")}>
      {items.map((it, i) => (
        <div key={i} style={{display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: i < items.length - 1 ? "1px solid var(--line-soft)" : "none"}}>
          <span style={{width: 6, height: 6, borderRadius: 99, background: it.sev === "high" ? "var(--danger)" : "var(--warn)"}}/>
          <div>
            <div style={{fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600}}>{it.pn}</div>
            <div style={{fontSize: 10, color: "var(--fg-3)"}}>{it.reason}</div>
          </div>
          <span style={{fontFamily: "var(--font-mono)", fontSize: 9, padding: "2px 6px", borderRadius: 2, background: it.sev === "high" ? "var(--danger)" : "var(--warn)", color: "white"}}>{it.sev.toUpperCase()}</span>
        </div>
      ))}
    </Tile>
  );
}

function ApprovalsTile({ role }) {
  const counts = { engineering: 2, procurement: 3, finance: 1 };
  const my = role === "Engineering" ? counts.engineering : role === "Procurement" ? counts.procurement : role === "Finance" ? counts.finance : counts.engineering + counts.procurement + counts.finance;
  return (
    <Tile title="Approvals Inbox" action="Open" onAction={() => window.__nav?.("approvals")}>
      <div style={{display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10}}>
        <span style={{fontFamily: "var(--font-mono)", fontSize: 28, fontWeight: 700, color: my > 0 ? "var(--accent)" : "var(--fg)"}}>{my}</span>
        <span style={{fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)"}}>awaiting {role === "Admin" ? "team" : "you"}</span>
      </div>
      {["Engineering","Procurement","Finance"].map(r => (
        <div key={r} style={{display: "flex", justifyContent: "space-between", padding: "4px 0", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-2)"}}>
          <span>{r}</span>
          <span style={{color: counts[r.toLowerCase()] ? "var(--accent)" : "var(--fg-4)"}}>{counts[r.toLowerCase()]}</span>
        </div>
      ))}
    </Tile>
  );
}

function InFlightTile() {
  return (
    <Tile title="In Flight" action="Procurement" onAction={() => window.__nav?.("procurement")}>
      <div style={{display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 8}}>
        {[["RFQ", 2], ["PO", 3], ["Transit", 4]].map(([l, v], i) => (
          <div key={i} style={{padding: 8, background: "var(--bg-sunk)", borderRadius: "var(--r-2)", textAlign: "center"}}>
            <div style={{fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700}}>{v}</div>
            <div style={{fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.06em"}}>{l}</div>
          </div>
        ))}
      </div>
      <div style={{fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)", paddingTop: 6, borderTop: "1px solid var(--line-soft)"}}>
        Total in flight: <strong style={{color: "var(--fg)"}}>{window.INR(window.WORKSPACE_BUDGET.committed, 0)}</strong>
      </div>
    </Tile>
  );
}

function MyBOMsTile() {
  const list = [
    { name: "ATLAS · Mainframe Rev D", status: "Draft", updated: "2h" },
    { name: "HORIZON · Sensor Pod Rev B", status: "Review", updated: "5h" },
    { name: "NEBULA · IO Module v0.3", status: "Draft", updated: "1d" },
  ];
  return (
    <Tile title="My BOMs" action="Open editor" onAction={() => window.__nav?.("bom")}>
      {list.map((b, i) => (
        <div key={i} style={{display: "grid", gridTemplateColumns: "1fr auto", gap: 8, padding: "6px 0", borderBottom: i < list.length - 1 ? "1px solid var(--line-soft)" : "none", alignItems: "center"}}>
          <div>
            <div style={{fontSize: 12, fontWeight: 500}}>{b.name}</div>
            <div style={{fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)"}}>Updated {b.updated} ago</div>
          </div>
          <span className={"status " + (b.status === "Draft" ? "draft" : "review")}>{b.status}</span>
        </div>
      ))}
    </Tile>
  );
}

function VendorsTile() {
  return (
    <Tile title="Vendors" action="All" onAction={() => window.__nav?.("vendors")}>
      <div style={{display: "flex", justifyContent: "space-between", padding: "4px 0", fontFamily: "var(--font-mono)", fontSize: 11}}>
        <span style={{color: "var(--fg-3)"}}>Active</span><span style={{fontWeight: 600}}>14</span>
      </div>
      <div style={{display: "flex", justifyContent: "space-between", padding: "4px 0", fontFamily: "var(--font-mono)", fontSize: 11}}>
        <span style={{color: "var(--fg-3)"}}>Preferred</span><span style={{fontWeight: 600, color: "var(--accent)"}}>8</span>
      </div>
      <div style={{display: "flex", justifyContent: "space-between", padding: "4px 0", fontFamily: "var(--font-mono)", fontSize: 11}}>
        <span style={{color: "var(--fg-3)"}}>High risk</span><span style={{fontWeight: 600, color: "var(--danger)"}}>1</span>
      </div>
      <div style={{marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--line-soft)", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)"}}>
        Top: McMaster · A+ score · 99% on-time
      </div>
    </Tile>
  );
}

function SpendMixTile() {
  const data = window.WORKSPACE_BUDGET.byCategory;
  const colors = {Electrical:"oklch(0.55 0.13 240)",Optical:"oklch(0.55 0.13 320)",Mechanical:"oklch(0.55 0.08 60)",Hardware:"oklch(0.55 0.10 145)",Cable:"oklch(0.55 0.10 280)",Other:"var(--fg-3)"};
  return (
    <Tile title="Spend Mix" action="Analytics" onAction={() => window.__nav?.("analytics")}>
      <div style={{display: "flex", height: 14, borderRadius: 4, overflow: "hidden", marginBottom: 10}}>
        {Object.entries(data).map(([k, v]) => <div key={k} style={{width: (v * 100) + "%", background: colors[k]}} title={`${k}: ${(v*100).toFixed(0)}%`}/>)}
      </div>
      {Object.entries(data).map(([k, v]) => (
        <div key={k} style={{display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 10, padding: "2px 0"}}>
          <span style={{display: "inline-flex", alignItems: "center", gap: 6}}><span style={{width: 8, height: 8, borderRadius: 2, background: colors[k]}}/> {k}</span>
          <span style={{color: "var(--fg-3)"}}>{(v*100).toFixed(0)}%</span>
        </div>
      ))}
    </Tile>
  );
}

function CostTrendTile() {
  const data = window.WORKSPACE_BUDGET.monthly;
  const max = Math.max(...data);
  return (
    <Tile title="Monthly Spend (₹Cr)" action="Analytics" onAction={() => window.__nav?.("analytics")}>
      <div style={{display: "flex", alignItems: "flex-end", height: 80, gap: 4, marginBottom: 8}}>
        {data.map((v, i) => (
          <div key={i} style={{flex: 1, height: (v/max*100) + "%", background: i === data.length - 1 ? "var(--accent)" : "color-mix(in oklch, var(--accent) 50%, var(--bg-sunk))", borderRadius: "2px 2px 0 0"}} title={`Month ${i+1}: ₹${v}Cr`}/>
        ))}
      </div>
      <div style={{display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)"}}>
        <span>Jan</span><span>Avg ₹{(data.reduce((s,v)=>s+v,0)/data.length).toFixed(1)}Cr</span><span>Dec</span>
      </div>
    </Tile>
  );
}

function ActivityTile() {
  const items = [
    { who: "M. Park", what: "edited", obj: "STM32H7", time: "12m" },
    { who: "K. Singh", what: "approved", obj: "PO-0481", time: "2h" },
    { who: "System", what: "flagged", obj: "EL-BMS-12S", time: "5h" },
  ];
  return (
    <Tile title="Recent Activity" action="View all" onAction={() => window.__nav?.("activity")}>
      {items.map((a, i) => (
        <div key={i} style={{padding: "6px 0", borderBottom: i < items.length - 1 ? "1px solid var(--line-soft)" : "none", fontSize: 11}}>
          <strong>{a.who}</strong> <span style={{color: "var(--fg-3)"}}>{a.what}</span> <span style={{fontFamily: "var(--font-mono)", padding: "0 4px", background: "var(--bg-sunk)", borderRadius: 2}}>{a.obj}</span>
          <span style={{fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)", marginLeft: 6}}>{a.time}</span>
        </div>
      ))}
    </Tile>
  );
}

window.DashboardScreen = DashboardScreen;
