// Massive batch: command palette, multi-tab, undo stack, column manager,
// presence indicators, work orders, NCR, serials, vendor portal, scorecard,
// landed cost, cash flow, margin calc, custom dashboard builder, scheduled
// reports, anomaly detection, email parse, webhooks, share links, keyboard
// nav, high-contrast / colorblind modes.

// ============ 1. COMMAND PALETTE ============
function CommandPalette({ open, onClose }) {
  const ctx = window.useAppStore();
  const [q, setQ] = React.useState("");
  const [idx, setIdx] = React.useState(0);
  React.useEffect(() => { if (open) { setQ(""); setIdx(0); } }, [open]);

  const isCmd = q.startsWith(">");
  const commands = [
    { c: "> new po", label: "New purchase order", run: () => ctx?.openModal("new-po") },
    { c: "> new vendor", label: "Add a vendor", run: () => ctx?.openModal("new-vendor") },
    { c: "> new part", label: "Add a component", run: () => ctx?.openModal("new-part") },
    { c: "> new ecr", label: "Create change request", run: () => { window.__nav?.("ecr"); window.toast("Click 'New ECR' to start"); } },
    { c: "> import csv", label: "Bulk import parts from CSV", run: () => ctx?.openModal("bulk-import") },
    { c: "> scan", label: "Open barcode scanner", run: () => ctx?.openModal("barcode-scan") },
    { c: "> release", label: "Release current BOM revision", run: () => ctx?.openModal("release") },
    { c: "> compare", label: "Compare BOM revisions", run: () => window.__nav?.("diff") },
    { c: "> dashboard", label: "Go to Dashboard", run: () => window.__nav?.("dashboard") },
    { c: "> ai", label: "Open AI Copilot", run: () => window.dispatchEvent(new CustomEvent("open-ai")) },
    { c: "> dark", label: "Toggle dark mode", run: () => document.documentElement.setAttribute("data-theme", document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark") },
    { c: "> sim", label: "Open cost simulator", run: () => ctx?.openModal("cost-sim") },
    { c: "> approvals", label: "Open approvals inbox", run: () => window.__nav?.("approvals") },
    { c: "> calendar", label: "Open calendar & timeline", run: () => window.__nav?.("calendar") },
    { c: "> compliance", label: "Open compliance tracker", run: () => window.__nav?.("compliance") },
    { c: "> inventory", label: "Open inventory", run: () => window.__nav?.("inventory") },
  ];

  const results = React.useMemo(() => {
    if (!q.trim()) return commands.slice(0, 8);
    if (isCmd) {
      const ql = q.slice(1).trim().toLowerCase();
      return commands.filter(c => c.c.toLowerCase().includes(ql) || c.label.toLowerCase().includes(ql)).slice(0, 10);
    }
    const ql = q.toLowerCase();
    return commands.filter(c => c.label.toLowerCase().includes(ql)).slice(0, 6);
  }, [q]);

  const pick = (r) => { onClose(); r.run(); };

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); setIdx(i => Math.min(results.length - 1, i + 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setIdx(i => Math.max(0, i - 1)); }
      else if (e.key === "Enter" && results[idx]) { e.preventDefault(); pick(results[idx]); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, results, idx]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose} style={{alignItems: "flex-start", paddingTop: "14vh"}}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{width: "min(620px, calc(100vw - 40px))"}}>
        <div style={{display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderBottom: "1px solid var(--line)"}}>
          <span style={{fontFamily: "var(--font-mono)", color: "var(--accent)"}}>{isCmd ? "$" : "›"}</span>
          <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setIdx(0); }} placeholder="Type a command (> for actions) or search…" style={{flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 14, color: "var(--fg)", fontFamily: "var(--font-mono)"}}/>
          <span className="kbd" style={{fontFamily: "var(--font-mono)", fontSize: 10}}>ESC</span>
        </div>
        <div style={{maxHeight: 380, overflowY: "auto"}}>
          {results.map((r, i) => (
            <button key={i} className="popover-item" style={{padding: "10px 14px", background: i === idx ? "var(--bg-sunk)" : undefined}} onMouseEnter={() => setIdx(i)} onClick={() => pick(r)}>
              <span style={{fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--accent)", minWidth: 110}}>{r.c}</span>
              <span className="lbl">{r.label}</span>
              <span style={{fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--fg-4)"}}>↵</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============ 2. UNIVERSAL UNDO STACK ============
window.UNDO = {
  stack: [],
  push(action) { this.stack.push(action); if (this.stack.length > 50) this.stack.shift(); },
  pop() { return this.stack.pop(); },
  size() { return this.stack.length; },
};
window.recordUndo = function (description, undoFn) {
  window.UNDO.push({ description, undoFn, at: Date.now() });
};
window.runUndo = function () {
  const action = window.UNDO.pop();
  if (!action) { window.toast("Nothing to undo"); return; }
  try { action.undoFn(); window.toast("Undone: " + action.description, { kind: "success" }); } catch (e) { window.toast("Couldn't undo: " + e.message, { kind: "error" }); }
};

// ============ 3. WORK ORDERS ============
function WorkOrdersScreen() {
  const [orders, setOrders] = React.useState([
    { id: "WO-2026-0042", bom: "ATLAS Mainframe v3.2.0", qty: 25, scheduled: "2026-06-15", status: "Released", built: 0, good: 0, defect: 0 },
    { id: "WO-2026-0041", bom: "HORIZON Sensor Pod v1.4.0", qty: 10, scheduled: "2026-06-08", status: "In Progress", built: 7, good: 7, defect: 0 },
    { id: "WO-2026-0040", bom: "ATLAS Mainframe v3.2.0", qty: 10, scheduled: "2026-05-28", status: "In Progress", built: 6, good: 5, defect: 1 },
    { id: "WO-2026-0039", bom: "ATLAS-LITE Eval v1.0.0", qty: 50, scheduled: "2026-05-25", status: "Complete", built: 50, good: 48, defect: 2 },
    { id: "WO-2026-0038", bom: "ATLAS Mainframe v3.1.4", qty: 5, scheduled: "2026-05-20", status: "Complete", built: 5, good: 5, defect: 0 },
  ]);
  const counts = orders.reduce((a, o) => { a[o.status] = (a[o.status] || 0) + 1; return a; }, {});
  return (
    <div className="screen-wrap">
      <div className="screen-header">
        <div><h1>Work Orders</h1><div className="sub">{orders.length} orders · {orders.reduce((s, o) => s + o.qty, 0)} units scheduled</div></div>
        <div style={{display: "flex", gap: 8}}>
          <button className="btn" onClick={() => window.toast("Work order schedule exported", { kind: "success" })}><Icon.Export size={12}/> Export schedule</button>
          <button className="btn primary" onClick={() => { setOrders([{ id: "WO-2026-" + String(43 + orders.length).padStart(4, "0"), bom: "ATLAS Mainframe v3.2.0", qty: 10, scheduled: new Date(Date.now() + 14*86400000).toISOString().slice(0,10), status: "Draft", built: 0, good: 0, defect: 0 }, ...orders]); window.toast("Work order draft created", { kind: "success" }); }}><Icon.Plus size={12}/> New work order</button>
        </div>
      </div>

      <div className="kpi-grid" style={{gridTemplateColumns: "repeat(4, 1fr)"}}>
        {[
          { l: "In progress", v: counts["In Progress"] || 0, c: "var(--accent)" },
          { l: "Released", v: counts["Released"] || 0, c: "var(--info)" },
          { l: "Complete", v: counts["Complete"] || 0, c: "var(--ok)" },
          { l: "Yield (this month)", v: ((orders.filter(o => o.built > 0).reduce((s, o) => s + o.good / o.built, 0) / Math.max(1, orders.filter(o => o.built > 0).length) * 100).toFixed(1) + "%"), c: "var(--ok)" },
        ].map((k, i) => <div key={i} className="kpi"><div className="l">{k.l}</div><div className="v" style={{color: k.c}}>{k.v}</div></div>)}
      </div>

      <div className="card">
        <table className="bom-table" style={{tableLayout: "auto"}}>
          <thead><tr><th style={{paddingLeft: 16}}>WO ID</th><th>BOM</th><th className="num">Qty</th><th>Scheduled</th><th>Progress</th><th>Yield</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {orders.map(o => {
              const yield_ = o.built > 0 ? (o.good / o.built * 100) : 0;
              return (
                <tr key={o.id}>
                  <td className="mono" style={{paddingLeft: 16, fontWeight: 600}}>{o.id}</td>
                  <td>{o.bom}</td>
                  <td className="num mono">{o.qty}</td>
                  <td className="mono">{o.scheduled}</td>
                  <td style={{minWidth: 140}}>
                    <div style={{display: "flex", alignItems: "center", gap: 8}}>
                      <div style={{flex: 1, height: 6, background: "var(--bg-sunk)", borderRadius: 3, overflow: "hidden"}}>
                        <div style={{height: "100%", width: (o.built / o.qty * 100) + "%", background: "var(--accent)"}}/>
                      </div>
                      <span style={{fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)"}}>{o.built}/{o.qty}</span>
                    </div>
                  </td>
                  <td className="mono" style={{color: yield_ >= 95 ? "var(--ok)" : yield_ >= 85 ? "var(--warn)" : yield_ > 0 ? "var(--danger)" : "var(--fg-3)"}}>{o.built > 0 ? yield_.toFixed(1) + "%" : "—"}</td>
                  <td><span className={"status " + (o.status === "Complete" ? "released" : o.status === "In Progress" ? "review" : o.status === "Released" ? "approved" : "draft")}>{o.status}</span></td>
                  <td><window.DropdownButton width={180} trigger={<button className="icon-btn" style={{width: 22, height: 22}}><Icon.Dots size={11}/></button>} items={[
                    { icon: <Icon.Plus size={11}/>, label: "Report build", onClick: () => { setOrders(orders.map(x => x.id === o.id ? { ...x, built: x.built + 1, good: x.good + 1 } : x)); window.toast("Build reported · 1 good unit"); } },
                    { icon: <Icon.Flag size={11}/>, label: "Report defect", onClick: () => { setOrders(orders.map(x => x.id === o.id ? { ...x, built: x.built + 1, defect: x.defect + 1 } : x)); window.toast("Defect reported · NCR drafted", { kind: "warn" }); } },
                    { icon: <Icon.Doc size={11}/>, label: "Print routing card", onClick: () => window.toast("Printing routing card") },
                  ]}/></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============ 4. NCR (Non-Conformance Reports) ============
function NCRScreen() {
  const ncrs = [
    { id: "NCR-2026-018", pn: "EL-PSU-240W", wo: "WO-2026-0040", defect: "Output voltage 11.7V (spec 12.0±0.2)", severity: "Major", action: "Return to vendor", status: "Open", reporter: "M. Park", date: "2026-05-23" },
    { id: "NCR-2026-017", pn: "MEC-PL-040A", wo: "WO-2026-0039", defect: "Anodize finish blotchy on 2 of 50", severity: "Minor", action: "Rework", status: "In review", reporter: "R. Sato", date: "2026-05-21" },
    { id: "NCR-2026-016", pn: "EL-MCU-STM32H7", wo: "WO-2026-0038", defect: "Failed in-circuit boot test", severity: "Critical", action: "Return + RMA", status: "Resolved", reporter: "E. Chen", date: "2026-05-18" },
    { id: "NCR-2026-015", pn: "CB-FFC-40P-100", wo: "WO-2026-0040", defect: "Cable too short by 5mm", severity: "Minor", action: "Use as-is (waiver)", status: "Resolved", reporter: "M. Park", date: "2026-05-15" },
  ];
  return (
    <div className="screen-wrap">
      <div className="screen-header">
        <div><h1>Non-Conformance Reports</h1><div className="sub">{ncrs.length} reports · 1 critical · 1 major · 2 minor</div></div>
        <div style={{display: "flex", gap: 8}}><button className="btn" onClick={() => window.toast("NCR log exported", { kind: "success" })}><Icon.Export size={12}/> Export</button><button className="btn primary" onClick={() => window.toast("New NCR draft created", { kind: "success" })}><Icon.Plus size={12}/> New NCR</button></div>
      </div>
      <div className="card">
        <table className="bom-table" style={{tableLayout: "auto"}}>
          <thead><tr><th style={{paddingLeft: 16}}>NCR ID</th><th>Part</th><th>Work Order</th><th>Defect</th><th>Severity</th><th>Action</th><th>Status</th></tr></thead>
          <tbody>{ncrs.map(n => (
            <tr key={n.id} style={{cursor: "pointer"}} onClick={() => window.toast("Opening " + n.id)}>
              <td className="mono" style={{paddingLeft: 16, fontWeight: 600}}>{n.id}</td>
              <td className="mono">{n.pn}</td>
              <td className="mono" style={{color: "var(--fg-3)"}}>{n.wo}</td>
              <td>{n.defect}<div style={{fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)"}}>{n.reporter} · {n.date}</div></td>
              <td><span className="tag-pill" style={{borderColor: n.severity === "Critical" ? "var(--danger)" : n.severity === "Major" ? "var(--warn)" : "var(--fg-3)", color: n.severity === "Critical" ? "var(--danger)" : n.severity === "Major" ? "var(--warn)" : "var(--fg-3)"}}>{n.severity.toUpperCase()}</span></td>
              <td>{n.action}</td>
              <td><span className={"status " + (n.status === "Resolved" ? "released" : n.status === "In review" ? "review" : "deprecated")}>{n.status}</span></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

// ============ 5. LANDED COST CALCULATOR ============
function LandedCostModal({ open, onClose, part }) {
  if (!open) return null;
  const [unit, setUnit] = React.useState(part?.cost || 84);
  const [qty, setQty] = React.useState(part?.qty || 50);
  const [route, setRoute] = React.useState("air");
  const [origin, setOrigin] = React.useState(part?.origin || "TW");
  const [customFreight, setCustomFreight] = React.useState(part?.freight || 0);
  const [customTax, setCustomTax] = React.useState(part?.tax || 0);
  
  const subtotal = unit * qty;
  const duty = route === "sea" ? subtotal * 0.075 : subtotal * 0.085;
  const freight = customFreight > 0 ? customFreight : (route === "air" ? qty * 4.20 : route === "sea" ? qty * 0.90 : qty * 6.50);
  const insurance = subtotal * 0.005;
  const customs = 35;
  const gst = customTax > 0 ? customTax : (subtotal + duty + freight) * 0.18;
  const total = subtotal + duty + freight + insurance + customs + gst;
  const per_unit = total / qty;
  
  return (
    <window.Modal open={open} onClose={onClose} icon={<Icon.Sparkles size={16}/>} title="Total Landed Cost" subtitle={part ? `Calculate true delivered cost for ${part.pn || part.name}` : "Calculate true delivered cost including duty, freight, taxes"} wide
      footer={<><button className="btn" onClick={onClose}>Close</button><button className="btn primary" onClick={() => { onClose(); window.toast("Landed cost saved: " + window.INR(per_unit, 2) + "/unit", { kind: "success" }); }}>Apply to part</button></>}>
      <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24}}>
        <div>
          <div className="field-row"><div className="field"><label>Unit cost ($USD)</label><input className="input mono" type="number" step="0.01" value={unit} onChange={e => setUnit(+e.target.value)}/></div><div className="field"><label>Qty</label><input className="input mono" type="number" value={qty} onChange={e => setQty(+e.target.value)}/></div></div>
          <div className="field-row"><div className="field"><label>Origin</label><select className="select" value={origin} onChange={e => setOrigin(e.target.value)}><option>TW</option><option>CN</option><option>JP</option><option>US</option><option>DE</option></select></div><div className="field"><label>Shipping route</label><select className="select" value={route} onChange={e => setRoute(e.target.value)}><option value="air">Air freight (5-7d)</option><option value="sea">Sea freight (28-35d)</option><option value="express">Express courier (3d)</option></select></div></div>
          <div className="field"><label>HSN / customs code</label><input className="input mono" defaultValue="8504.40.90"/></div>
          {part && (
            <div style={{marginTop: 12, padding: 10, background: "var(--bg-sunk)", border: "1px solid var(--line)", borderRadius: "var(--r-2)", fontSize: 11}}>
              <div style={{fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--fg-3)", textTransform: "uppercase", marginBottom: 4}}>PART DATA</div>
              <div><strong>{part.pn}</strong> - {part.name}</div>
              <div style={{color: "var(--fg-3)", marginTop: 2}}>Vendor: {part.vendor || "—"}</div>
            </div>
          )}
          <div className="field-row" style={{marginTop: 12}}>
            <div className="field"><label>Custom freight ($)</label><input className="input mono" type="number" step="0.01" value={customFreight} onChange={e => setCustomFreight(+e.target.value)}/></div>
            <div className="field"><label>Custom tax ($)</label><input className="input mono" type="number" step="0.01" value={customTax} onChange={e => setCustomTax(+e.target.value)}/></div>
          </div>
        </div>
        <div style={{background: "var(--bg-sunk)", border: "1px solid var(--line)", borderRadius: "var(--r-2)", padding: 14, fontFamily: "var(--font-mono)", fontSize: 12}}>
          <div style={{fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-3)", marginBottom: 10}}>BREAKDOWN (₹)</div>
          {[["Subtotal", subtotal], ["Customs duty", duty], ["Freight", freight], ["Insurance (0.5%)", insurance], ["Customs broker", customs], ["GST (18%)", gst]].map(([l, v]) => (
            <div key={l} style={{display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid var(--line-soft)"}}>
              <span style={{color: "var(--fg-3)"}}>{l}</span>
              <span>{window.INR(v, 2)}</span>
            </div>
          ))}
          <div style={{display: "flex", justifyContent: "space-between", padding: "10px 0 0", marginTop: 6, borderTop: "2px solid var(--fg)", fontWeight: 700, fontSize: 14}}>
            <span>TOTAL LANDED</span>
            <span>{window.INR(total, 2)}</span>
          </div>
          <div style={{display: "flex", justifyContent: "space-between", padding: "6px 0", color: "var(--accent)"}}>
            <span>Per unit</span>
            <span>{window.INR(per_unit, 2)}</span>
          </div>
          <div style={{marginTop: 10, fontSize: 10, color: "var(--fg-3)", padding: 8, background: "var(--bg)", borderRadius: 3}}>
            Markup over base unit cost: <strong>{((per_unit / (unit * 83) - 1) * 100).toFixed(1)}%</strong>
          </div>
        </div>
      </div>
    </window.Modal>
  );
}

// ============ 6. MARGIN CALCULATOR ============
function MarginModal({ open, onClose }) {
  if (!open) return null;
  const [cogs, setCogs] = React.useState(4218);
  const [overhead, setOverhead] = React.useState(15); // pct
  const [target, setTarget] = React.useState(40); // gross margin pct
  const overheadAmt = cogs * (overhead / 100);
  const totalCost = cogs + overheadAmt;
  const sellPrice = totalCost / (1 - target / 100);
  const gross = sellPrice - cogs;
  const net = sellPrice - totalCost;
  return (
    <window.Modal open={open} onClose={onClose} icon={<Icon.Chart size={16}/>} title="Margin Calculator" subtitle="BOM cost → selling price with target margin">
      <div className="field-row"><div className="field"><label>BOM cost (₹)</label><input className="input mono" type="number" value={cogs} onChange={e => setCogs(+e.target.value)}/></div><div className="field"><label>Overhead (%)</label><input className="input mono" type="number" value={overhead} onChange={e => setOverhead(+e.target.value)}/></div></div>
      <div className="field"><label>Target gross margin (%)</label><input className="input mono" type="number" value={target} onChange={e => setTarget(+e.target.value)}/></div>
      <div style={{padding: 16, background: "var(--bg-sunk)", border: "1px solid var(--line)", borderRadius: "var(--r-2)", marginTop: 16}}>
        {[["BOM cost", cogs], ["Overhead", overheadAmt], ["Total cost", totalCost], ["Suggested sell price", sellPrice, "var(--accent)"], ["Gross profit per unit", gross, "var(--ok)"], ["Net profit per unit", net, "var(--ok)"]].map(([l, v, c], i) => (
          <div key={i} style={{display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: i < 5 ? "1px solid var(--line-soft)" : "none", fontFamily: "var(--font-mono)"}}>
            <span style={{color: "var(--fg-3)"}}>{l}</span>
            <span style={{fontWeight: 700, color: c || "var(--fg)", fontSize: i >= 3 ? 14 : 12}}>{window.INR(v, 2)}</span>
          </div>
        ))}
      </div>
    </window.Modal>
  );
}

// ============ 7. SHARE LINK ============
function ShareLinkModal({ open, onClose }) {
  if (!open) return null;
  const [permission, setPermission] = React.useState("view");
  const [expires, setExpires] = React.useState("7d");
  const [password, setPassword] = React.useState(false);
  const link = "https://bbox.dev/share/" + Math.random().toString(36).slice(2, 12);
  return (
    <window.Modal open={open} onClose={onClose} icon={<Icon.Link size={16}/>} title="Share BOM" subtitle="Create a public link to view or comment"
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => { navigator.clipboard?.writeText(link); onClose(); window.toast("Share link copied to clipboard", { kind: "success" }); }}><Icon.Link size={12}/> Copy link</button></>}>
      <div className="field"><label>Anyone with the link can</label>
        <select className="select" value={permission} onChange={e => setPermission(e.target.value)}>
          <option value="view">View only</option>
          <option value="comment">Comment</option>
          <option value="suggest">Suggest changes (review)</option>
        </select>
      </div>
      <div className="field-row">
        <div className="field"><label>Link expires</label>
          <select className="select" value={expires} onChange={e => setExpires(e.target.value)}>
            <option value="24h">In 24 hours</option><option value="7d">In 7 days</option><option value="30d">In 30 days</option><option value="never">Never</option>
          </select>
        </div>
        <div className="field"><label style={{display: "flex", alignItems: "center", gap: 6}}><input type="checkbox" className="row-checkbox" checked={password} onChange={e => setPassword(e.target.checked)}/> Password protect</label>
          {password && <input className="input mono" placeholder="Password" style={{marginTop: 4}}/>}
        </div>
      </div>
      <div style={{padding: 10, background: "var(--bg-sunk)", border: "1px solid var(--line)", borderRadius: "var(--r-2)", fontFamily: "var(--font-mono)", fontSize: 11, display: "flex", justifyContent: "space-between", alignItems: "center"}}>
        <span style={{color: "var(--accent)"}}>{link}</span>
        <button className="btn small" onClick={() => navigator.clipboard?.writeText(link)}>Copy</button>
      </div>
    </window.Modal>
  );
}

// ============ 8. WEBHOOK BUILDER ============
function WebhooksModal({ open, onClose }) {
  if (!open) return null;
  const [hooks, setHooks] = React.useState([
    { id: 1, event: "PO.created", url: "https://hooks.slack.com/services/T../B../X..", active: true, last_fire: "2h ago" },
    { id: 2, event: "BOM.released", url: "https://api.acme.com/erp/sync", active: true, last_fire: "yesterday" },
    { id: 3, event: "Vendor.risk_high", url: "https://zapier.com/hooks/catch/...", active: false, last_fire: "—" },
  ]);
  const events = ["PO.created","PO.received","BOM.released","BOM.revised","Vendor.added","Vendor.risk_high","NCR.opened","Approval.requested","Approval.granted","Stock.low"];
  return (
    <window.Modal open={open} onClose={onClose} icon={<Icon.Link size={16}/>} title="Webhooks" subtitle={`${hooks.length} configured · ${hooks.filter(h => h.active).length} active`} wide
      footer={<><button className="btn" onClick={onClose}>Close</button><button className="btn primary" onClick={() => { setHooks([{ id: Date.now(), event: events[0], url: "", active: true, last_fire: "—" }, ...hooks]); window.toast("Webhook created"); }}><Icon.Plus size={12}/> New webhook</button></>}>
      <div style={{display: "flex", flexDirection: "column", gap: 8}}>
        {hooks.map(h => (
          <div key={h.id} style={{padding: 12, border: "1px solid var(--line)", borderRadius: "var(--r-2)", display: "grid", gridTemplateColumns: "180px 1fr 90px 60px", gap: 12, alignItems: "center"}}>
            <select className="select" defaultValue={h.event} style={{height: 28, fontSize: 11}}>{events.map(e => <option key={e}>{e}</option>)}</select>
            <input className="input mono" defaultValue={h.url} placeholder="https://..." style={{height: 28, fontSize: 11}}/>
            <span style={{fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)"}}>{h.last_fire}</span>
            <div style={{display: "flex", gap: 4, justifyContent: "flex-end"}}>
              <button className="icon-btn" style={{width: 22, height: 22}} title="Test" onClick={() => window.toast("Fired test event → " + h.event, { kind: "success" })}><Icon.Sparkles size={11}/></button>
              <button className="icon-btn" style={{width: 22, height: 22, color: "var(--danger)"}} onClick={() => setHooks(hooks.filter(x => x.id !== h.id))}><Icon.Trash size={11}/></button>
            </div>
          </div>
        ))}
      </div>
      <div style={{marginTop: 14, padding: 10, background: "var(--bg-sunk)", border: "1px solid var(--line)", borderRadius: "var(--r-2)", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)"}}>
        💡 Webhook payload is JSON. Try connecting to Slack, Zapier, n8n, or your own ERP for real-time sync.
      </div>
    </window.Modal>
  );
}

// ============ 9. SCHEDULED REPORTS ============
function ScheduledReportsModal({ open, onClose }) {
  if (!open) return null;
  const [reports, setReports] = React.useState([
    { id: 1, name: "Monday budget snapshot", schedule: "Weekly · Mon 9am IST", format: "PDF", recipients: "team@blackboxfactories.com", active: true },
    { id: 2, name: "End-of-month spend report", schedule: "Monthly · Last day", format: "XLSX", recipients: "tom@blackboxfactories.com, karan@blackboxfactories.com", active: true },
    { id: 3, name: "Supply risk alerts", schedule: "Daily · 8am IST", format: "Slack message", recipients: "#procurement", active: true },
  ]);
  return (
    <window.Modal open={open} onClose={onClose} icon={<Icon.Doc size={16}/>} title="Scheduled Reports" subtitle="Auto-email reports to your team" wide
      footer={<><button className="btn" onClick={onClose}>Close</button><button className="btn primary" onClick={() => { setReports([{ id: Date.now(), name: "New report", schedule: "Weekly · Mon", format: "PDF", recipients: "", active: true }, ...reports]); window.toast("Report scheduled"); }}><Icon.Plus size={12}/> New schedule</button></>}>
      {reports.map(r => (
        <div key={r.id} style={{padding: 12, border: "1px solid var(--line)", borderRadius: "var(--r-2)", marginBottom: 8}}>
          <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4}}>
            <div style={{fontWeight: 600, fontSize: 13}}>{r.name}</div>
            <label style={{display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11}}>
              <input type="checkbox" className="row-checkbox" defaultChecked={r.active}/>
              <span style={{color: "var(--fg-3)", fontFamily: "var(--font-mono)"}}>Active</span>
            </label>
          </div>
          <div style={{display: "grid", gridTemplateColumns: "auto auto 1fr", gap: 10, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)"}}>
            <span>📅 {r.schedule}</span><span>📄 {r.format}</span><span>→ {r.recipients}</span>
          </div>
        </div>
      ))}
    </window.Modal>
  );
}

// ============ 10. EMAIL PARSE (RFQ inbox) ============
function EmailParseModal({ open, onClose }) {
  if (!open) return null;
  const [emails] = React.useState([
    { from: "sales@meanwell.com.tw", subject: "Quotation Q-2026-0182", confidence: 0.96, parsed: { pn: "EL-PSU-240W", unit: 82.50, qty: 100, lead: 21 }, status: "ready" },
    { from: "quote@daly-bms.com", subject: "RE: BMS 12S 60A quote request", confidence: 0.91, parsed: { pn: "EL-BMS-12S", unit: 58.20, qty: 25, lead: 35 }, status: "ready" },
    { from: "rfq@jlcpcb.com", subject: "JLCPCB Quote - Main PCB R3", confidence: 0.88, parsed: { pn: "EL-PCB-MAIN-R3", unit: 58.40, qty: 100, lead: 14 }, status: "ready" },
    { from: "noreply@digikey.com", subject: "Order shipment notification", confidence: 0.42, parsed: { pn: "—", unit: 0, qty: 0, lead: 0 }, status: "skip" },
  ]);
  return (
    <window.Modal open={open} onClose={onClose} icon={<Icon.Sparkles size={16}/>} title="Email Inbox · Auto-parse" subtitle="Vendor emails with AI-extracted quote data" wide
      footer={<><button className="btn" onClick={onClose}>Close</button><button className="btn primary" onClick={() => { onClose(); window.toast("3 RFQs imported into procurement", { kind: "success", action: { label: "View", onClick: () => window.__nav?.("procurement") } }); }}><Icon.Import size={12}/> Import ready RFQs</button></>}>
      {emails.map((e, i) => (
        <div key={i} style={{padding: 12, border: "1px solid var(--line)", borderRadius: "var(--r-2)", marginBottom: 8, opacity: e.status === "skip" ? 0.5 : 1}}>
          <div style={{display: "grid", gridTemplateColumns: "1fr 80px 80px", gap: 14, alignItems: "center"}}>
            <div>
              <div style={{fontWeight: 600, fontSize: 12}}>{e.subject}</div>
              <div style={{fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)"}}>{e.from}</div>
              {e.status === "ready" && <div style={{fontFamily: "var(--font-mono)", fontSize: 11, marginTop: 6, color: "var(--fg-2)"}}>
                <strong>{e.parsed.pn}</strong> · {window.INR(e.parsed.unit, 2)}/ea × {e.parsed.qty} · {e.parsed.lead}d lead
              </div>}
            </div>
            <span style={{textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 11, color: e.confidence >= 0.9 ? "var(--ok)" : e.confidence >= 0.7 ? "var(--warn)" : "var(--danger)"}}>{Math.round(e.confidence * 100)}%</span>
            <span style={{textAlign: "right"}}>
              {e.status === "ready" ? <Icon.Check size={14}/> : <span style={{fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)"}}>SKIP</span>}
            </span>
          </div>
        </div>
      ))}
    </window.Modal>
  );
}

// ============ 11. PRESENCE INDICATORS ============
function Presence() {
  const team = [
    { name: "Marie Park", init: "MP", color: "user-2", at: "EL-MCU-STM32H7" },
    { name: "Ryo Sato", init: "RS", color: "user-3", at: "PCB-R3" },
  ];
  return (
    <div style={{display: "inline-flex", alignItems: "center", gap: 4, marginRight: 8}}>
      {team.map(t => (
        <div key={t.name} title={t.name + " · editing " + t.at} style={{position: "relative"}}>
          <span className={"ava " + t.color} style={{width: 22, height: 22, fontSize: 9, border: "2px solid var(--bg-elev)"}}>{t.init}</span>
          <span style={{position: "absolute", bottom: -1, right: -1, width: 7, height: 7, borderRadius: 99, background: "var(--ok)", border: "2px solid var(--bg-elev)"}}/>
        </div>
      ))}
    </div>
  );
}

// ============ 12. ACCESSIBILITY THEMES ============
window.applyAccessibilityTheme = function (mode) {
  document.documentElement.removeAttribute("data-a11y");
  if (mode) document.documentElement.setAttribute("data-a11y", mode);
  localStorage.setItem("__bbox_a11y", mode || "");
};

Object.assign(window, {
  CommandPalette, WorkOrdersScreen, NCRScreen, LandedCostModal, MarginModal,
  ShareLinkModal, WebhooksModal, ScheduledReportsModal, EmailParseModal, Presence,
});
