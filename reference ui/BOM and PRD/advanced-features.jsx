// Major new features: ECR/ECO workflow, RFQ comparison, Compliance tracking,
// AI Assistant chat, Calendar / Timeline view, Cost simulator, Onboarding checklist.

// ============ ECR / ECO WORKFLOW ============
function ECRScreen() {
  const ctx = window.useAppStore();
  const [filter, setFilter] = React.useState("All");
  const [ecrs, setEcrs] = React.useState([
    { id: "ECR-2026-014", title: "Replace STM32F4 with H7 in ATLAS-LITE", project: "ATLAS-LITE", impact: "high", status: "Review", requester: "R. Sato", date: "2026-05-24", cost_impact: 240000, items_affected: 3, approvals: { eng: "approved", proc: "pending", fin: "pending" } },
    { id: "ECR-2026-013", title: "Anodize finish change for chassis panels", project: "ATLAS", impact: "low", status: "Approved", requester: "M. Park", date: "2026-05-20", cost_impact: 32400, items_affected: 2, approvals: { eng: "approved", proc: "approved", fin: "approved" } },
    { id: "ECR-2026-012", title: "Add 100µF bypass cap to power rail", project: "HORIZON", impact: "med", status: "Implemented", requester: "E. Chen", date: "2026-05-15", cost_impact: 1200, items_affected: 1, approvals: { eng: "approved", proc: "approved", fin: "approved" } },
    { id: "ECR-2026-011", title: "Switch BMS supplier Daly → Texas Instruments", project: "ATLAS", impact: "high", status: "Draft", requester: "K. Singh", date: "2026-05-12", cost_impact: -82000, items_affected: 1, approvals: { eng: "pending", proc: "pending", fin: "pending" } },
    { id: "ECR-2026-010", title: "Bump M3 screws to A2 stainless workspace-wide", project: "All", impact: "low", status: "Rejected", requester: "M. Park", date: "2026-05-08", cost_impact: 12800, items_affected: 8, approvals: { eng: "approved", proc: "approved", fin: "rejected" } },
  ]);
  const counts = ecrs.reduce((a, e) => { a[e.status] = (a[e.status] || 0) + 1; return a; }, {});
  const filtered = filter === "All" ? ecrs : ecrs.filter(e => e.status === filter);
  const advance = (id) => {
    setEcrs(ecrs.map(e => e.id === id ? { ...e, status: e.status === "Draft" ? "Review" : e.status === "Review" ? "Approved" : "Implemented" } : e));
    window.toast("ECR advanced", { kind: "success" });
  };

  return (
    <div className="screen-wrap">
      <div className="screen-header">
        <div>
          <h1>Engineering Change Requests</h1>
          <div className="sub">{ecrs.length} ECRs · {counts.Review || 0} awaiting review · {counts.Approved || 0} approved</div>
        </div>
        <div style={{display: "flex", gap: 8}}>
          <button className="btn" onClick={() => window.toast("Exported ECR log")}><Icon.Export size={12}/> Export</button>
          <button className="btn primary" onClick={() => { setEcrs([{ id: "ECR-2026-" + String(15 + ecrs.length).padStart(3, "0"), title: "New change request", project: "ATLAS", impact: "med", status: "Draft", requester: "You", date: new Date().toISOString().slice(0,10), cost_impact: 0, items_affected: 0, approvals: { eng: "pending", proc: "pending", fin: "pending" } }, ...ecrs]); window.toast("ECR draft created", { kind: "success" }); }}><Icon.Plus size={12}/> New ECR</button>
        </div>
      </div>

      <div style={{display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap"}}>
        {["All","Draft","Review","Approved","Implemented","Rejected"].map(s => (
          <span key={s} className={"chip " + (s === filter ? "active" : "")} onClick={() => setFilter(s)} style={{cursor: "pointer"}}>
            {s} <span style={{color: "var(--fg-4)", marginLeft: 4}}>{s === "All" ? ecrs.length : counts[s] || 0}</span>
          </span>
        ))}
      </div>

      <div className="card" style={{overflow: "visible"}}>
        <table className="bom-table" style={{tableLayout: "auto"}}>
          <thead><tr>
            <th style={{paddingLeft: 16}}>ECR ID</th>
            <th>Title</th>
            <th>Project</th>
            <th>Impact</th>
            <th>Items</th>
            <th className="num">Cost Δ</th>
            <th>Approvals</th>
            <th>Status</th>
            <th></th>
          </tr></thead>
          <tbody>
            {filtered.map(e => (
              <tr key={e.id} onClick={() => window.toast("Opening " + e.id)} style={{cursor: "pointer"}}>
                <td className="mono" style={{paddingLeft: 16, fontWeight: 600}}>{e.id}</td>
                <td>
                  <div style={{fontWeight: 500}}>{e.title}</div>
                  <div style={{fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)"}}>{e.requester} · {e.date}</div>
                </td>
                <td className="mono">{e.project}</td>
                <td>
                  <span className={"tag-pill"} style={{borderColor: e.impact === "high" ? "var(--danger)" : e.impact === "med" ? "var(--warn)" : "var(--fg-3)", color: e.impact === "high" ? "var(--danger)" : e.impact === "med" ? "var(--warn)" : "var(--fg-3)"}}>{e.impact.toUpperCase()}</span>
                </td>
                <td className="mono num">{e.items_affected}</td>
                <td className="num mono" style={{color: e.cost_impact > 0 ? "var(--danger)" : e.cost_impact < 0 ? "var(--ok)" : "var(--fg-3)", fontWeight: 600}}>
                  {e.cost_impact > 0 ? "+" : ""}{window.INR(e.cost_impact, 0)}
                </td>
                <td>
                  <div style={{display: "inline-flex", gap: 3}}>
                    {Object.entries(e.approvals).map(([k, v]) => (
                      <span key={k} title={k.toUpperCase() + ": " + v} style={{width: 18, height: 18, borderRadius: 99, display: "inline-flex", alignItems: "center", justifyContent: "center", background: v === "approved" ? "var(--ok)" : v === "rejected" ? "var(--danger)" : "var(--bg-sunk)", color: "white", fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, border: v === "pending" ? "1px solid var(--fg-3)" : "none"}}>{k[0].toUpperCase()}</span>
                    ))}
                  </div>
                </td>
                <td><span className={"status " + (e.status === "Approved" || e.status === "Implemented" ? "released" : e.status === "Review" ? "review" : e.status === "Rejected" ? "deprecated" : "draft")}>{e.status}</span></td>
                <td onClick={ev => ev.stopPropagation()}>
                  <window.DropdownButton width={180} trigger={<button className="icon-btn" style={{width: 22, height: 22}}><Icon.Dots size={11}/></button>} items={[
                    { icon: <Icon.Check size={11}/>, label: "Advance status", onClick: () => advance(e.id) },
                    { icon: <Icon.Diff size={11}/>, label: "View diff", onClick: () => window.__nav?.("diff") },
                    { icon: <Icon.Doc size={11}/>, label: "Print ECR", onClick: () => window.toast("Printing " + e.id) },
                  ]}/>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============ RFQ COMPARISON MATRIX ============
function RFQCompareModal({ open, onClose }) {
  if (!open) return null;
  const part = { pn: "EL-PSU-240W", name: "Power Supply, 240W ATX", target_unit: 82 };
  const quotes = [
    { vendor: "Mean Well", country: "TW", unit: 84.00, qty: 50, lead: 21, moq: 25, terms: "Net 30", quality: 96, rating: 4.6, paid_samples: false, preferred: true },
    { vendor: "Delta", country: "TW", unit: 79.40, qty: 100, lead: 28, moq: 50, terms: "Prepaid", quality: 92, rating: 4.3, paid_samples: false, preferred: false },
    { vendor: "Seasonic", country: "TW", unit: 92.20, qty: 25, lead: 14, moq: 10, terms: "Net 30", quality: 98, rating: 4.8, paid_samples: true, preferred: false },
    { vendor: "FSP Group", country: "CN", unit: 71.50, qty: 200, lead: 35, moq: 100, terms: "Prepaid", quality: 88, rating: 4.0, paid_samples: false, preferred: false },
  ];
  const best = {
    unit: Math.min(...quotes.map(q => q.unit)),
    lead: Math.min(...quotes.map(q => q.lead)),
    quality: Math.max(...quotes.map(q => q.quality)),
  };
  const [picked, setPicked] = React.useState(null);
  return (
    <window.Modal open={open} onClose={onClose} icon={<Icon.Diff size={16}/>} title="RFQ Comparison" subtitle={`${part.pn} · ${part.name} · ${quotes.length} responses received`} wide
      footer={<><span className="left">Target unit: {window.INR(part.target_unit, 2)} · Best quote: {window.INR(best.unit, 2)}</span><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!picked} style={{opacity: picked ? 1 : 0.5}} onClick={() => { onClose(); window.toast(`Awarded RFQ to ${picked} · PO drafted`, { kind: "success", action: { label: "Open PO", onClick: () => window.__nav?.("procurement") } }); }}><Icon.Check size={12}/> Award to {picked || "vendor"}</button></>}>
      <div style={{overflowX: "auto"}}>
        <table style={{width: "100%", borderCollapse: "collapse", fontSize: 11}}>
          <thead>
            <tr>
              <th style={{textAlign: "left", padding: 10, borderBottom: "2px solid var(--line)", fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-3)"}}>Criterion</th>
              {quotes.map(q => (
                <th key={q.vendor} style={{padding: 10, borderBottom: "2px solid var(--line)", borderLeft: "1px solid var(--line)", textAlign: "center", minWidth: 140, background: picked === q.vendor ? "var(--accent-soft)" : "transparent", cursor: "pointer"}} onClick={() => setPicked(q.vendor)}>
                  <div style={{fontWeight: 700, fontSize: 13}}>{q.vendor}</div>
                  <div style={{fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--fg-3)", marginTop: 2}}>{q.country} · ★ {q.rating}</div>
                  {q.preferred && <span style={{display: "inline-block", marginTop: 4, fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--accent)", letterSpacing: "0.06em"}}>PREFERRED</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              ["Unit price (qty 50)", "unit", "money", "low"],
              ["Lead time (days)", "lead", "days", "low"],
              ["MOQ", "moq", "num", "low"],
              ["Payment terms", "terms", "text"],
              ["Quality score", "quality", "pct", "high"],
              ["Free samples?", "paid_samples", "bool-inv"],
            ].map(([label, key, kind, best_dir]) => (
              <tr key={key}>
                <td style={{padding: 10, borderBottom: "1px solid var(--line-soft)", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.04em"}}>{label}</td>
                {quotes.map(q => {
                  const v = q[key];
                  const isBest = (kind === "money" && v === best.unit) || (kind === "days" && v === best.lead) || (kind === "pct" && v === best.quality);
                  const display = kind === "money" ? window.INR(v, 2) : kind === "days" ? v + "d" : kind === "pct" ? v + "%" : kind === "bool-inv" ? (v ? "Paid" : "Free") : v;
                  return (
                    <td key={q.vendor} style={{padding: 10, borderBottom: "1px solid var(--line-soft)", borderLeft: "1px solid var(--line)", textAlign: "center", background: picked === q.vendor ? "var(--accent-soft)" : "transparent"}}>
                      <span style={{fontFamily: "var(--font-mono)", fontWeight: isBest ? 700 : 500, color: isBest ? "var(--ok)" : "var(--fg)"}}>
                        {display}
                        {isBest && <span style={{marginLeft: 4, fontSize: 9, color: "var(--ok)"}}>★</span>}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr>
              <td style={{padding: 14, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)", textTransform: "uppercase"}}>Total (50 units)</td>
              {quotes.map(q => (
                <td key={q.vendor} style={{padding: 14, borderLeft: "1px solid var(--line)", textAlign: "center", background: picked === q.vendor ? "var(--accent-soft)" : "transparent"}}>
                  <span style={{fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700}}>{window.INR(q.unit * 50, 0)}</span>
                </td>
              ))}
            </tr>
            <tr>
              <td style={{padding: 10}}></td>
              {quotes.map(q => (
                <td key={q.vendor} style={{padding: 10, borderLeft: "1px solid var(--line)", textAlign: "center", background: picked === q.vendor ? "var(--accent-soft)" : "transparent"}}>
                  <button className={"btn small " + (picked === q.vendor ? "primary" : "")} onClick={() => setPicked(q.vendor)}>{picked === q.vendor ? "✓ Selected" : "Select"}</button>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </window.Modal>
  );
}

// ============ COMPLIANCE TRACKING ============
function ComplianceScreen() {
  const [docs, setDocs] = React.useState([
    { pn: "EL-MCU-STM32H7", rohs: "valid", reach: "valid", conflict: "valid", reach_expires: "2027-03-15", lab: "Intertek" },
    { pn: "EL-PSU-240W", rohs: "valid", reach: "valid", conflict: "valid", reach_expires: "2026-08-22", lab: "TÜV SÜD" },
    { pn: "EL-BMS-12S", rohs: "expiring", reach: "expiring", conflict: "missing", reach_expires: "2026-06-08", lab: "SGS" },
    { pn: "EL-CAM-IMX477", rohs: "valid", reach: "valid", conflict: "valid", reach_expires: "2026-11-30", lab: "Intertek" },
    { pn: "EL-PCB-MAIN-R3", rohs: "valid", reach: "missing", conflict: "valid", reach_expires: null, lab: "JLCPCB Self-Cert" },
    { pn: "MEC-PL-040A", rohs: "valid", reach: "valid", conflict: "valid", reach_expires: "2028-01-12", lab: "Bureau Veritas" },
    { pn: "OPT-LNS-25MM", rohs: "valid", reach: "valid", conflict: "valid", reach_expires: "2027-09-04", lab: "Intertek" },
    { pn: "HW-FAS-M3-08", rohs: "expired", reach: "expired", conflict: "valid", reach_expires: "2026-04-30", lab: "McMaster Self-Cert" },
  ]);
  const totals = {
    valid: docs.filter(d => d.rohs === "valid" && d.reach === "valid" && d.conflict === "valid").length,
    expiring: docs.filter(d => Object.values(d).includes("expiring")).length,
    missing: docs.filter(d => Object.values(d).includes("missing")).length,
    expired: docs.filter(d => Object.values(d).includes("expired")).length,
  };
  const colorFor = (s) => s === "valid" ? "var(--ok)" : s === "expiring" ? "var(--warn)" : s === "expired" ? "var(--danger)" : s === "missing" ? "var(--fg-3)" : "var(--fg-4)";
  return (
    <div className="screen-wrap">
      <div className="screen-header">
        <div>
          <h1>Compliance</h1>
          <div className="sub">{docs.length} parts tracked · RoHS · REACH · Conflict Minerals</div>
        </div>
        <div style={{display: "flex", gap: 8}}>
          <button className="btn" onClick={() => window.toast("Compliance report exported", { kind: "success" })}><Icon.Export size={12}/> Export report</button>
          <button className="btn primary" onClick={() => window.toast("Sent re-cert requests to 3 vendors")}><Icon.Cart size={12}/> Request re-certs</button>
        </div>
      </div>

      <div className="kpi-grid" style={{gridTemplateColumns: "repeat(4, 1fr)"}}>
        {[
          { l: "Fully compliant", v: totals.valid, c: "var(--ok)" },
          { l: "Expiring < 90d", v: totals.expiring, c: "var(--warn)" },
          { l: "Missing certs", v: totals.missing, c: "var(--fg-3)" },
          { l: "Expired", v: totals.expired, c: "var(--danger)" },
        ].map((k, i) => (
          <div key={i} className="kpi">
            <div className="l">{k.l}</div>
            <div className="v" style={{color: k.c}}>{k.v}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <table className="bom-table" style={{tableLayout: "auto"}}>
          <thead><tr>
            <th style={{paddingLeft: 16}}>Part No.</th>
            <th>RoHS</th>
            <th>REACH</th>
            <th>Conflict Minerals</th>
            <th>Lab / Source</th>
            <th>Cert expires</th>
            <th></th>
          </tr></thead>
          <tbody>
            {docs.map(d => (
              <tr key={d.pn}>
                <td className="mono" style={{paddingLeft: 16, fontWeight: 600}}>{d.pn}</td>
                {["rohs","reach","conflict"].map(c => (
                  <td key={c}>
                    <span style={{display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-mono)", fontSize: 11, color: colorFor(d[c])}}>
                      <span style={{width: 8, height: 8, borderRadius: 99, background: colorFor(d[c])}}/>
                      {d[c].toUpperCase()}
                    </span>
                  </td>
                ))}
                <td className="mono" style={{color: "var(--fg-3)"}}>{d.lab}</td>
                <td className="mono" style={{color: d.reach_expires && new Date(d.reach_expires) < new Date("2026-08-25") ? "var(--warn)" : "var(--fg-3)"}}>{d.reach_expires || "—"}</td>
                <td>
                  <button className="icon-btn" style={{width: 22, height: 22}} onClick={() => window.toast("Re-cert requested for " + d.pn)} title="Request re-cert"><Icon.Sparkles size={11}/></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============ AI ASSISTANT CHAT ============
function AIAssistant({ open, onClose }) {
  const [messages, setMessages] = React.useState([
    { role: "assistant", text: "Hi! I'm your BOM copilot. Ask me about parts, costs, vendors, or upcoming risks." },
  ]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const bodyRef = React.useRef(null);

  React.useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight; }, [messages, loading]);

  const send = async (text) => {
    if (!text.trim()) return;
    setMessages(m => [...m, { role: "user", text }]);
    setInput("");
    setLoading(true);
    // Use window.claude if available; otherwise mock
    try {
      const ctx = window.useAppStore ? window.STORE_SNAPSHOT : null;
      const system = "You are a BOM management assistant. Answer briefly in 1-3 sentences. Be specific. The active project is ATLAS Mainframe with 87 parts, ₹4.2k BOM cost. Top risks: EL-BMS-12S (35d lead), HW-FAS-M3-08 (duplicate), EL-MCU-STM32H7 (single-source).";
      const reply = window.claude?.complete
        ? await window.claude.complete({ messages: [{ role: "user", content: system + "\n\nUser: " + text }] })
        : mockReply(text);
      setMessages(m => [...m, { role: "assistant", text: reply }]);
    } catch (e) {
      setMessages(m => [...m, { role: "assistant", text: mockReply(text) }]);
    }
    setLoading(false);
  };

  const mockReply = (q) => {
    const l = q.toLowerCase();
    if (/cost|budget|spend/.test(l)) return "ATLAS BOM cost is ₹4,218 (+2.2% vs last rev). Workspace YTD spend ₹1.84 Cr against ₹5 Cr budget — 36.8% allocated. Biggest cost drivers: Lens 25mm (₹15,687) and Power supply (₹6,972).";
    if (/risk|supply|delay/.test(l)) return "3 supply risks today: EL-BMS-12S lead time crept 28→35d (Daly, CN), HW-FAS-M3-08 has a 95% duplicate match, and EL-MCU-STM32H7 is single-sourced from France (42d lead).";
    if (/vendor|supplier/.test(l)) return "14 vendors active across 6 countries. Top scorer: McMaster (A+, 99% on-time). Risk vendor: Daly (C, 71% on-time). 8 vendors marked preferred. Would you like a scorecard report?";
    if (/lead.*time|deliver/.test(l)) return "Avg lead time across active BOM is 21 days. Critical path is EL-MCU-STM32H7 at 42 days. 4 items >30d. Consider stocking these or qualifying alternates.";
    if (/duplicat/.test(l)) return "1 high-confidence duplicate detected: HW-FAS-M3-08 vs HW-FAS-M3-08-A (95% match). Merging would consolidate ordering — saves ~12% via volume.";
    if (/help|what.*do/.test(l)) return "I can summarize costs, flag risks, compare vendors, suggest alternates, or generate reports. Try: 'show high-risk parts', 'compare power supply vendors', or 'how much have we spent this quarter?'";
    return "I don't have a precise answer for that yet. Try asking about cost, vendors, lead times, supply risk, or duplicates.";
  };

  const suggestions = ["Show high-risk parts", "What's our biggest cost driver?", "Compare power supply vendors", "How much have we spent this quarter?"];

  if (!open) return null;
  return (
    <div className="ai-panel">
      <div className="ai-head">
        <div style={{display: "flex", alignItems: "center", gap: 10}}>
          <span style={{width: 28, height: 28, borderRadius: 6, background: "linear-gradient(135deg, var(--accent), oklch(0.55 0.18 30))", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "white"}}><Icon.Sparkles size={14}/></span>
          <div>
            <div style={{fontWeight: 700, fontSize: 13}}>BOM Copilot</div>
            <div style={{fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)"}}>AI · context-aware</div>
          </div>
        </div>
        <button className="icon-btn" style={{width: 26, height: 26}} onClick={onClose}><Icon.X size={13}/></button>
      </div>
      <div className="ai-body" ref={bodyRef}>
        {messages.map((m, i) => (
          <div key={i} className={"ai-msg " + m.role}>
            {m.role === "assistant" && <span className="ai-msg-ico"><Icon.Sparkles size={11}/></span>}
            <div className="ai-msg-bub">{m.text}</div>
          </div>
        ))}
        {loading && <div className="ai-msg assistant"><span className="ai-msg-ico"><Icon.Sparkles size={11}/></span><div className="ai-msg-bub"><span className="spinner"/> Thinking…</div></div>}
        {messages.length <= 1 && (
          <div style={{display: "flex", flexDirection: "column", gap: 6, marginTop: 14}}>
            {suggestions.map(s => (
              <button key={s} onClick={() => send(s)} style={{padding: "8px 12px", background: "var(--bg-elev)", border: "1px dashed var(--line)", borderRadius: "var(--r-2)", fontSize: 11, color: "var(--fg-2)", textAlign: "left", cursor: "pointer", fontFamily: "var(--font-sans)"}}>
                💬 {s}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="ai-foot">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
          placeholder="Ask about parts, costs, vendors, risks…"
          style={{flex: 1, minHeight: 38, maxHeight: 100, padding: 8, border: "1px solid var(--line)", borderRadius: "var(--r-2)", background: "var(--bg)", color: "var(--fg)", fontSize: 12, fontFamily: "var(--font-sans)", resize: "none"}}
        />
        <button className="btn primary" disabled={!input.trim() || loading} onClick={() => send(input)} style={{height: 38}}>Send</button>
      </div>
    </div>
  );
}

// ============ CALENDAR / TIMELINE VIEW ============
function CalendarScreen() {
  const events = [
    { date: "2026-05-26", type: "po-eta", label: "Crucial DDR4 SODIMM", value: 50 },
    { date: "2026-05-27", type: "po-eta", label: "McMaster M3 screws", value: 1000 },
    { date: "2026-05-29", type: "rfq", label: "RFQ response: JLCPCB", value: null },
    { date: "2026-05-30", type: "po-eta", label: "Noctua 92mm fans", value: 50 },
    { date: "2026-06-02", type: "po-eta", label: "Edmund 25mm lens", value: 25 },
    { date: "2026-06-04", type: "po-eta", label: "Mean Well PSU", value: 25 },
    { date: "2026-06-08", type: "compliance", label: "BMS REACH cert expires" },
    { date: "2026-06-12", type: "milestone", label: "BOM v3.3 release target" },
    { date: "2026-06-18", type: "po-eta", label: "STM32H743 MCUs", value: 50 },
    { date: "2026-06-22", type: "milestone", label: "ATLAS engineering review" },
    { date: "2026-06-25", type: "approval", label: "Q3 budget review due" },
    { date: "2026-07-02", type: "milestone", label: "HORIZON pre-prod build" },
    { date: "2026-07-15", type: "milestone", label: "ATLAS Demo Day" },
  ];
  const today = new Date("2026-05-25");
  const start = new Date(today);
  start.setDate(start.getDate() - start.getDay());
  const weeks = 8;
  const days = Array.from({length: weeks * 7}, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
  const typeColor = { "po-eta": "var(--accent)", rfq: "var(--info)", compliance: "var(--warn)", milestone: "var(--ok)", approval: "var(--danger)" };
  const typeLabel = { "po-eta": "PO Delivery", rfq: "RFQ", compliance: "Compliance", milestone: "Milestone", approval: "Approval" };

  return (
    <div className="screen-wrap">
      <div className="screen-header">
        <div>
          <h1>Calendar & Timeline</h1>
          <div className="sub">{events.length} upcoming events · Next 8 weeks</div>
        </div>
        <div style={{display: "flex", gap: 8}}>
          <button className="btn" onClick={() => window.toast("Synced to Google Calendar")}><Icon.Link size={12}/> Sync calendar</button>
          <button className="btn primary" onClick={() => window.toast("Add event — pick a date")}><Icon.Plus size={12}/> Add event</button>
        </div>
      </div>

      <div style={{display: "flex", gap: 14, marginBottom: 14, fontFamily: "var(--font-mono)", fontSize: 11, flexWrap: "wrap"}}>
        {Object.entries(typeColor).map(([k, c]) => (
          <span key={k} style={{display: "inline-flex", alignItems: "center", gap: 6}}>
            <span style={{width: 10, height: 10, borderRadius: 2, background: c}}/> {typeLabel[k]}
          </span>
        ))}
      </div>

      <div className="card" style={{overflow: "hidden"}}>
        {/* Day headers */}
        <div style={{display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: "1px solid var(--line)", background: "var(--bg-sunk)"}}>
          {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => (
            <div key={d} style={{padding: 8, fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--fg-3)", textAlign: "center", borderRight: "1px solid var(--line-soft)"}}>{d}</div>
          ))}
        </div>
        {/* Day cells */}
        <div style={{display: "grid", gridTemplateColumns: "repeat(7, 1fr)"}}>
          {days.map((d, i) => {
            const iso = d.toISOString().slice(0, 10);
            const dayEvents = events.filter(e => e.date === iso);
            const isToday = d.toDateString() === today.toDateString();
            return (
              <div key={i} style={{minHeight: 80, padding: 6, borderRight: "1px solid var(--line-soft)", borderBottom: "1px solid var(--line-soft)", background: isToday ? "color-mix(in oklch, var(--accent) 6%, var(--bg))" : "var(--bg)"}}>
                <div style={{fontFamily: "var(--font-mono)", fontSize: 10, color: isToday ? "var(--accent)" : "var(--fg-3)", fontWeight: isToday ? 700 : 400, marginBottom: 4}}>
                  {d.getDate()}{isToday && " · TODAY"}
                </div>
                {dayEvents.map((e, j) => (
                  <div key={j} title={typeLabel[e.type] + ": " + e.label} onClick={() => window.toast(e.label)} style={{padding: "2px 4px", marginBottom: 2, background: typeColor[e.type], color: "white", borderRadius: 2, fontFamily: "var(--font-mono)", fontSize: 9, cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"}}>
                    {e.label}{e.value ? " ×" + e.value : ""}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============ COST SIMULATOR ============
function CostSimulatorModal({ open, onClose }) {
  if (!open) return null;
  const baseRows = window.BOM_DATA.rows[0].children.flatMap(s => s.children || []);
  const [sims, setSims] = React.useState(baseRows.slice(0, 6).map(r => ({ ...r, simQty: r.qty, simCost: r.cost, simVendor: r.vendor })));
  const baseTotal = sims.reduce((s, r) => s + r.cost * r.qty, 0);
  const simTotal = sims.reduce((s, r) => s + r.simCost * r.simQty, 0);
  const diff = simTotal - baseTotal;
  const diffPct = (diff / baseTotal) * 100;
  const updateSim = (idx, key, val) => {
    const next = [...sims];
    next[idx] = { ...next[idx], [key]: val };
    setSims(next);
  };
  return (
    <window.Modal open={open} onClose={onClose} icon={<Icon.Sparkles size={16}/>} title="Cost simulator · what-if analysis" subtitle="Tweak quantities and unit costs to forecast BOM cost" wide
      footer={<><span className="left">Current: {window.INR(baseTotal, 0)} · Simulated: <strong>{window.INR(simTotal, 0)}</strong></span><button className="btn" onClick={() => setSims(sims.map(s => ({ ...s, simQty: s.qty, simCost: s.cost })))}>Reset</button><button className="btn" onClick={onClose}>Close</button><button className="btn primary" onClick={() => { onClose(); window.toast("Saved scenario · share link copied", { kind: "success" }); }}><Icon.Link size={12}/> Save scenario</button></>}>
      {/* Summary */}
      <div style={{padding: 14, background: "var(--bg-sunk)", border: "1px solid var(--line)", borderRadius: "var(--r-2)", marginBottom: 16, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16}}>
        <div><div style={{fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-3)"}}>Baseline</div><div style={{fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700}}>{window.INR(baseTotal, 0)}</div></div>
        <div><div style={{fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-3)"}}>Simulated</div><div style={{fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: "var(--accent)"}}>{window.INR(simTotal, 0)}</div></div>
        <div><div style={{fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-3)"}}>Delta</div><div style={{fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: diff > 0 ? "var(--danger)" : diff < 0 ? "var(--ok)" : "var(--fg-3)"}}>{diff > 0 ? "+" : ""}{window.INR(diff, 0)} ({diffPct > 0 ? "+" : ""}{diffPct.toFixed(1)}%)</div></div>
      </div>

      <div style={{border: "1px solid var(--line)", borderRadius: "var(--r-2)", overflow: "auto"}}>
        <table className="bom-table" style={{tableLayout: "auto"}}>
          <thead><tr>
            <th style={{paddingLeft: 12}}>Part</th>
            <th className="num">Base qty</th>
            <th className="num">Sim qty</th>
            <th className="num">Base unit</th>
            <th className="num">Sim unit</th>
            <th className="num">Δ</th>
          </tr></thead>
          <tbody>
            {sims.map((r, i) => {
              const baseExt = r.cost * r.qty;
              const simExt = r.simCost * r.simQty;
              const d = simExt - baseExt;
              return (
                <tr key={i}>
                  <td style={{paddingLeft: 12}}>
                    <div style={{fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)"}}>{r.pn}</div>
                    <div style={{fontSize: 12, fontWeight: 500}}>{r.name}</div>
                  </td>
                  <td className="num mono" style={{color: "var(--fg-3)"}}>{r.qty}</td>
                  <td className="num">
                    <input type="number" value={r.simQty} onChange={e => updateSim(i, "simQty", +e.target.value || 0)} className="input mono" style={{width: 70, height: 26, textAlign: "right", fontSize: 11}}/>
                  </td>
                  <td className="num mono" style={{color: "var(--fg-3)"}}>{window.INR(r.cost, 2)}</td>
                  <td className="num">
                    <input type="number" step="0.01" value={r.simCost} onChange={e => updateSim(i, "simCost", +e.target.value || 0)} className="input mono" style={{width: 80, height: 26, textAlign: "right", fontSize: 11}}/>
                  </td>
                  <td className="num mono" style={{fontWeight: 600, color: d > 0 ? "var(--danger)" : d < 0 ? "var(--ok)" : "var(--fg-3)"}}>{d > 0 ? "+" : ""}{window.INR(d, 0)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{marginTop: 12, padding: 10, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)", background: "var(--bg-sunk)", borderRadius: "var(--r-2)"}}>
        💡 Try: swap a Daly BMS for TI (-12%), bump screw qty for production batch (+200), or model a 15% volume discount.
      </div>
    </window.Modal>
  );
}

// ============ ONBOARDING CHECKLIST ============
function OnboardingChecklist() {
  const ctx = window.useAppStore();
  const [collapsed, setCollapsed] = React.useState(false);
  const [done, setDone] = React.useState(() => JSON.parse(localStorage.getItem("__bbox_checklist") || "[]"));
  const tasks = [
    { id: "invite", label: "Invite a teammate", action: () => ctx?.openModal("settings") },
    { id: "vendor", label: "Add your first vendor", action: () => ctx?.openModal("new-vendor") },
    { id: "import", label: "Import an existing BOM", action: () => ctx?.openModal("bulk-import") },
    { id: "cad", label: "Connect SolidWorks", action: () => ctx?.openModal("upload-cad") },
    { id: "po", label: "Create your first PO", action: () => ctx?.openModal("new-po") },
    { id: "scan", label: "Generate a barcode label", action: () => { window.__nav?.("bom"); window.toast("Open any part → Barcode tab"); } },
  ];
  const completed = done.length;
  const total = tasks.length;
  const allDone = completed === total;
  const dismissed = localStorage.getItem("__bbox_checklist_dismissed") === "1";

  const toggle = (id) => {
    const next = done.includes(id) ? done.filter(x => x !== id) : [...done, id];
    setDone(next);
    localStorage.setItem("__bbox_checklist", JSON.stringify(next));
  };
  const dismiss = () => { localStorage.setItem("__bbox_checklist_dismissed", "1"); setCollapsed(true); };

  if (dismissed) return null;
  if (collapsed) {
    return (
      <button onClick={() => setCollapsed(false)} style={{position: "fixed", bottom: 18, left: 78, padding: "8px 14px", background: "var(--accent)", color: "white", border: "none", borderRadius: 99, fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, cursor: "pointer", boxShadow: "var(--shadow-md)", zIndex: 100, display: "inline-flex", alignItems: "center", gap: 8}}>
        <Icon.Sparkles size={12}/> {completed}/{total} setup tasks
      </button>
    );
  }

  return (
    <div style={{position: "fixed", bottom: 18, left: 78, width: 280, background: "var(--bg-elev)", border: "1px solid var(--line)", borderRadius: "var(--r-3)", boxShadow: "var(--shadow-md)", zIndex: 100, overflow: "hidden"}}>
      <div style={{padding: "12px 14px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center"}}>
        <div>
          <div style={{fontWeight: 700, fontSize: 12}}>Get started</div>
          <div style={{fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)"}}>{completed} of {total} complete</div>
        </div>
        <div style={{display: "flex", gap: 2}}>
          <button className="icon-btn" style={{width: 22, height: 22}} onClick={() => setCollapsed(true)} title="Collapse">_</button>
          <button className="icon-btn" style={{width: 22, height: 22}} onClick={dismiss} title="Dismiss"><Icon.X size={11}/></button>
        </div>
      </div>
      <div style={{height: 4, background: "var(--bg-sunk)"}}>
        <div style={{height: "100%", width: (completed / total * 100) + "%", background: allDone ? "var(--ok)" : "var(--accent)", transition: "width 0.3s"}}/>
      </div>
      <div style={{padding: 10, maxHeight: 280, overflowY: "auto"}}>
        {tasks.map(t => {
          const isDone = done.includes(t.id);
          return (
            <div key={t.id} style={{display: "flex", alignItems: "center", gap: 8, padding: "6px 4px", cursor: "pointer", borderRadius: "var(--r-2)"}} onClick={() => toggle(t.id)}>
              <span style={{width: 16, height: 16, borderRadius: 99, background: isDone ? "var(--ok)" : "transparent", border: "1.5px solid " + (isDone ? "var(--ok)" : "var(--fg-3)"), display: "inline-flex", alignItems: "center", justifyContent: "center", color: "white", flexShrink: 0}}>
                {isDone && <Icon.Check size={9}/>}
              </span>
              <span style={{flex: 1, fontSize: 11, textDecoration: isDone ? "line-through" : "none", color: isDone ? "var(--fg-3)" : "var(--fg)"}}>{t.label}</span>
              {!isDone && <button onClick={e => { e.stopPropagation(); t.action(); }} style={{background: "transparent", border: "none", color: "var(--accent)", fontFamily: "var(--font-mono)", fontSize: 10, cursor: "pointer"}}>→</button>}
            </div>
          );
        })}
      </div>
      {allDone && (
        <div style={{padding: "10px 14px", background: "color-mix(in oklch, var(--ok) 10%, var(--bg))", borderTop: "1px solid var(--line)", fontSize: 11, color: "var(--ok)", textAlign: "center", fontFamily: "var(--font-mono)"}}>
          🎉 All set! You're ready to ship.
        </div>
      )}
    </div>
  );
}

// ============ PRICE ALERTS ============
function PriceAlertsModal({ open, onClose }) {
  if (!open) return null;
  const [alerts, setAlerts] = React.useState([
    { pn: "EL-PSU-240W", name: "Power Supply 240W", vendor: "Mean Well", base: 84.00, current: 92.50, pct: 10.1, dir: "up", trend: [84, 85, 84, 86, 88, 90, 92.5], date: "2026-05-24", status: "active" },
    { pn: "EL-CAP-22UF-50V", name: "MLCC 22µF 50V", vendor: "Murata", base: 0.42, current: 0.58, pct: 38.1, dir: "up", trend: [0.42, 0.44, 0.48, 0.52, 0.55, 0.57, 0.58], date: "2026-05-22", status: "active" },
    { pn: "EL-MCU-STM32H7", name: "STM32H743 MCU", vendor: "STMicro", base: 18.50, current: 22.80, pct: 23.2, dir: "up", trend: [18.5, 19.2, 20.0, 20.8, 21.5, 22.2, 22.8], date: "2026-05-20", status: "active" },
    { pn: "HW-FAS-M3-08", name: "M3x8 Screw A2", vendor: "McMaster", base: 0.08, current: 0.07, pct: -12.5, dir: "down", trend: [0.08, 0.08, 0.075, 0.075, 0.07, 0.07, 0.07], date: "2026-05-15", status: "resolved" },
    { pn: "OPT-LNS-25MM", name: "Lens 25mm F1.4", vendor: "Edmund Optics", base: 189.00, current: 195.00, pct: 3.2, dir: "up", trend: [189, 190, 191, 192, 193, 194, 195], date: "2026-05-10", status: "acknowledged" },
    { pn: "EL-CAM-IMX477", name: "Camera Module 12MP", vendor: "Sony", base: 62.00, current: 68.00, pct: 9.7, dir: "up", trend: [62, 63, 64, 65, 66, 67, 68], date: "2026-05-08", status: "active" },
    { pn: "MEC-PL-040A", name: "Aluminum Plate 4mm", vendor: "Bossard", base: 14.20, current: 13.80, pct: -2.8, dir: "down", trend: [14.2, 14.1, 14.0, 13.9, 13.8, 13.8, 13.8], date: "2026-05-05", status: "resolved" },
  ]);
  const [filter, setFilter] = React.useState("all");
  const [threshold, setThreshold] = React.useState(5);

  const filtered = alerts.filter(a => {
    if (filter === "active") return a.status === "active";
    if (filter === "resolved") return a.status === "resolved";
    if (filter === "up") return a.dir === "up";
    if (filter === "down") return a.dir === "down";
    return true;
  }).filter(a => Math.abs(a.pct) >= threshold);

  const avgChange = filtered.reduce((s, a) => s + a.pct, 0) / (filtered.length || 1);

  const acknowledge = (pn) => {
    setAlerts(alerts.map(a => a.pn === pn ? { ...a, status: "acknowledged" } : a));
    window.toast(`Price alert acknowledged for ${pn}`, { kind: "info" });
  };

  const resolve = (pn) => {
    setAlerts(alerts.map(a => a.pn === pn ? { ...a, status: "resolved" } : a));
    window.toast(`Price alert resolved for ${pn}`, { kind: "success" });
  };

  return (
    <window.Modal open={open} onClose={onClose} icon={<Icon.Chart size={16}/>} title="Price Alerts" subtitle={`${alerts.filter(a => a.status === "active").length} active · avg change ${avgChange > 0 ? "+" : ""}${avgChange.toFixed(1)}%`} wide
      footer={<><span className="left">Threshold: ≥{threshold}% change</span><button className="btn" onClick={onClose}>Close</button><button className="btn primary" onClick={() => { setAlerts(alerts.map(a => a.status === "active" ? { ...a, status: "acknowledged" } : a)); onClose(); window.toast("All active alerts acknowledged · notifications sent", { kind: "success" }); }}><Icon.Check size={12}/> Acknowledge all</button></>}>
      <div style={{display: "flex", gap: 12, marginBottom: 14, alignItems: "center", flexWrap: "wrap"}}>
        <div style={{display: "flex", gap: 6}}>
          {[["all", "All"], ["active", "Active"], ["resolved", "Resolved"], ["up", "Price up"], ["down", "Price down"]].map(([k, l]) => (
            <span key={k} className={"chip " + (filter === k ? "active" : "")} onClick={() => setFilter(k)} style={{cursor: "pointer"}}>{l}</span>
          ))}
        </div>
        <div style={{flex: 1}}/>
        <div style={{display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-mono)", fontSize: 11}}>
          <span style={{color: "var(--fg-3)"}}>Threshold:</span>
          {[3, 5, 10, 20].map(t => (
            <span key={t} className={"chip " + (threshold === t ? "active" : "")} onClick={() => setThreshold(t)} style={{cursor: "pointer"}}>{t}%</span>
          ))}
        </div>
      </div>
      <div style={{border: "1px solid var(--line)", borderRadius: "var(--r-2)", overflow: "auto"}}>
        <table className="bom-table" style={{tableLayout: "auto"}}>
          <thead><tr>
            <th style={{paddingLeft: 12}}>Part No.</th>
            <th>Name</th>
            <th>Vendor</th>
            <th className="num">Base (USD)</th>
            <th className="num">Current (USD)</th>
            <th className="num">Change</th>
            <th>Trend</th>
            <th>Status</th>
            <th></th>
          </tr></thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={9} style={{padding: 40, textAlign: "center", color: "var(--fg-3)"}}>No alerts matching current filters</td></tr>
            ) : filtered.map((a, i) => (
              <tr key={i}>
                <td className="mono" style={{paddingLeft: 12, fontWeight: 600}}>{a.pn}</td>
                <td><span style={{fontWeight: 500}}>{a.name}</span></td>
                <td>{a.vendor}</td>
                <td className="num mono">{window.INR(a.base, 2)}</td>
                <td className="num mono" style={{fontWeight: 600, color: a.dir === "up" ? "var(--danger)" : "var(--ok)"}}>{window.INR(a.current, 2)}</td>
                <td className="num mono" style={{fontWeight: 700, color: a.pct > 0 ? "var(--danger)" : "var(--ok)"}}>
                  {a.pct > 0 ? "▲" : "▼"} {Math.abs(a.pct).toFixed(1)}%
                </td>
                <td>
                  <div style={{display: "flex", alignItems: "flex-end", gap: 1, height: 24}}>
                    {a.trend.map((v, j) => {
                      const mn = Math.min(...a.trend);
                      const mx = Math.max(...a.trend);
                      const h = ((v - mn) / (mx - mn || 1)) * 18 + 3;
                      return <div key={j} style={{width: 12, height: h, background: a.dir === "up" ? "var(--danger)" : "var(--ok)", borderRadius: "1px 1px 0 0", opacity: 0.3 + (j / a.trend.length) * 0.7}}/>;
                    })}
                  </div>
                </td>
                <td>
                  <span className={"status " + (a.status === "active" ? "review" : a.status === "resolved" ? "released" : "draft")} style={{fontSize: 9}}>{a.status.toUpperCase()}</span>
                </td>
                <td>
                  <div style={{display: "flex", gap: 4}}>
                    {a.status === "active" && <button className="btn small" onClick={() => acknowledge(a.pn)}><Icon.Check size={10}/> Ack</button>}
                    {a.status !== "resolved" && <button className="icon-btn" style={{width: 22, height: 22, color: "var(--ok)"}} onClick={() => resolve(a.pn)} title="Resolve"><Icon.Check size={10}/></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{marginTop: 12, display: "flex", gap: 14, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)", padding: "10px 14px", background: "var(--bg-sunk)", borderRadius: "var(--r-2)"}}>
        <span>Impacted parts: {filtered.filter(a => a.status === "active").length}</span>
        <span>Avg price Δ: {avgChange > 0 ? "+" : ""}{avgChange.toFixed(1)}%</span>
        <span>Est. cost impact: {window.INR(filtered.filter(a => a.dir === "up" && a.status === "active").reduce((s, a) => s + (a.current - a.base) * 50, 0) * 83, 0)}</span>
      </div>
    </window.Modal>
  );
}

// ============ INFLATION ANALYSIS ============
function InflationAnalysisModal({ open, onClose }) {
  if (!open) return null;
  const categories = [
    { name: "Semiconductors", color: "var(--danger)", values: [2.1, 2.3, 2.8, 3.2, 3.5, 3.8, 4.2, 4.5], current: 4.5, baseline: 2.1 },
    { name: "Passives (MLCC, Resistors)", color: "var(--warn)", values: [1.5, 1.6, 1.8, 2.0, 2.2, 2.5, 2.7, 2.8], current: 2.8, baseline: 1.5 },
    { name: "Fasteners & Hardware", color: "var(--info)", values: [1.2, 1.2, 1.3, 1.4, 1.4, 1.5, 1.5, 1.6], current: 1.6, baseline: 1.2 },
    { name: "Optics & Lenses", color: "var(--accent)", values: [1.8, 2.0, 2.2, 2.5, 2.7, 2.9, 3.1, 3.3], current: 3.3, baseline: 1.8 },
    { name: "Cables & Wire", color: "var(--ok)", values: [0.8, 0.9, 1.0, 1.2, 1.4, 1.6, 1.8, 2.1], current: 2.1, baseline: 0.8 },
    { name: "Mechanical (Sheet Metal)", color: "var(--fg-3)", values: [2.5, 2.6, 2.7, 2.9, 3.0, 3.2, 3.4, 3.6], current: 3.6, baseline: 2.5 },
  ];
  const months = ["Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun"];
  const totalBaseline = categories.reduce((s, c) => s + c.baseline, 0);
  const totalCurrent = categories.reduce((s, c) => s + c.current, 0);
  const overallRate = ((totalCurrent - totalBaseline) / totalBaseline) * 100;

  const bomInflation = categories.reduce((s, c) => {
    const weight = [0.35, 0.15, 0.05, 0.20, 0.10, 0.15][categories.indexOf(c)];
    return s + ((c.current - c.baseline) / c.baseline) * weight * 100;
  }, 0);

  return (
    <window.Modal open={open} onClose={onClose} icon={<Icon.Chart size={16}/>} title="Inflation Analysis" subtitle={`Overall: ${overallRate.toFixed(1)}% · BOM weighted impact: ${bomInflation.toFixed(1)}%`} wide
      footer={<><span className="left">Data sourced from industry indices · updated monthly</span><button className="btn" onClick={onClose}>Close</button><button className="btn primary" onClick={() => { onClose(); window.toast("Inflation report exported as PDF", { kind: "success" }); }}><Icon.Export size={12}/> Export report</button></>}>
      
      {/* Summary KPI cards */}
      <div style={{display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16}}>
        {[
          { l: "Overall inflation", v: `${overallRate.toFixed(1)}%`, c: overallRate > 5 ? "var(--danger)" : overallRate > 3 ? "var(--warn)" : "var(--ok)" },
          { l: "BOM cost impact", v: `${bomInflation.toFixed(1)}%`, c: bomInflation > 5 ? "var(--danger)" : "var(--warn)" },
          { l: "Highest category", v: categories.sort((a, b) => b.current - a.current)[0].name, c: "var(--accent)", small: true },
          { l: "Estimated annual Δ", v: window.INR(421800 * (bomInflation / 100) * 83, 0), c: "var(--fg)" },
        ].map((k, i) => (
          <div key={i} className="kpi">
            <div className="l">{k.l}</div>
            <div className="v" style={{color: k.c, fontSize: k.small ? 14 : 24}}>{k.v}</div>
          </div>
        ))}
      </div>

      {/* Category trend chart */}
      <div className="card" style={{overflow: "hidden", marginBottom: 14}}>
        <div style={{padding: "12px 14px", borderBottom: "1px solid var(--line)", fontWeight: 600, fontSize: 12}}>Category inflation trends (% year-over-year)</div>
        <div style={{padding: "16px 20px"}}>
          <div style={{display: "flex", gap: 0, position: "relative", height: 200}}>
            {/* Y-axis labels */}
            <div style={{display: "flex", flexDirection: "column", justifyContent: "space-between", paddingRight: 8, fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--fg-3)"}}>
              <span>5%</span>
              <span>4%</span>
              <span>3%</span>
              <span>2%</span>
              <span>1%</span>
              <span>0%</span>
            </div>
            {/* Grid + lines */}
            <div style={{flex: 1, position: "relative"}}>
              {[0, 1, 2, 3, 4, 5].map(i => (
                <div key={i} style={{position: "absolute", bottom: `${i * 20}%`, left: 0, right: 0, borderTop: "1px dashed var(--line-soft)"}}/>
              ))}
              {categories.slice(0, 4).map((cat, ci) => (
                <svg key={cat.name} style={{position: "absolute", top: 0, left: 0, width: "100%", height: "100%", overflow: "visible"}}>
                  <polyline
                    points={cat.values.map((v, i) => `${(i / (cat.values.length - 1)) * 100}% ${200 - (v / 5) * 200}`).join(" ")}
                    fill="none" stroke={cat.color} strokeWidth="1.5" opacity="0.8"
                  />
                  {cat.values.map((v, i) => (
                    <circle key={i} cx={`${(i / (cat.values.length - 1)) * 100}%`} cy={200 - (v / 5) * 200} r="2" fill={cat.color}/>
                  ))}
                </svg>
              ))}
              {/* X-axis labels */}
              <div style={{position: "absolute", bottom: -20, left: 0, right: 0, display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--fg-3)"}}>
                {months.map(m => <span key={m}>{m}</span>)}
              </div>
            </div>
          </div>
          {/* Legend */}
          <div style={{display: "flex", gap: 16, marginTop: 28, flexWrap: "wrap"}}>
            {categories.slice(0, 4).map(c => (
              <span key={c.name} style={{display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-mono)", fontSize: 10}}>
                <span style={{width: 12, height: 3, background: c.color, borderRadius: 1}}/> {c.name}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Category table */}
      <div style={{border: "1px solid var(--line)", borderRadius: "var(--r-2)", overflow: "auto"}}>
        <table className="bom-table" style={{tableLayout: "auto"}}>
          <thead><tr>
            <th style={{paddingLeft: 12}}>Category</th>
            <th className="num">Baseline</th>
            <th className="num">Current</th>
            <th className="num">Change</th>
            <th>BOM weight</th>
            <th className="num">Impact on BOM</th>
          </tr></thead>
          <tbody>
            {categories.map((c, i) => {
              const pct = ((c.current - c.baseline) / c.baseline) * 100;
              const weight = [0.35, 0.15, 0.05, 0.20, 0.10, 0.15][i];
              const impact = pct * weight;
              return (
                <tr key={c.name}>
                  <td style={{paddingLeft: 12}}>
                    <span style={{display: "inline-flex", alignItems: "center", gap: 8}}>
                      <span style={{width: 10, height: 10, borderRadius: 2, background: c.color}}/>
                      <span style={{fontWeight: 500}}>{c.name}</span>
                    </span>
                  </td>
                  <td className="num mono">{c.baseline.toFixed(1)}%</td>
                  <td className="num mono" style={{fontWeight: 600}}>{c.current.toFixed(1)}%</td>
                  <td className="num mono" style={{fontWeight: 700, color: pct > 0 ? "var(--danger)" : "var(--ok)"}}>
                    {pct > 0 ? "+" : ""}{pct.toFixed(1)}%
                  </td>
                  <td className="mono">{(weight * 100).toFixed(0)}%</td>
                  <td className="num mono" style={{color: impact > 0 ? "var(--danger)" : "var(--ok)"}}>
                    {impact > 0 ? "+" : ""}{impact.toFixed(2)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{marginTop: 12, padding: 12, background: "var(--bg-sunk)", borderRadius: "var(--r-2)", border: "1px solid var(--line)", fontSize: 11, color: "var(--fg-3)"}}>
        💡 <strong>Recommendation:</strong> Semiconductor prices driving {categories[0].current.toFixed(1)}% inflation. Consider: (1) 12-month fixed-price contracts for STM32 and power components, (2) qualify second-source for EL-MCU-STM32H7, (3) bulk-buy passives at current rates before projected 3%+ increase in Q3.
      </div>
    </window.Modal>
  );
}

// ============ INTERNET SCRAPING ENGINE ============
function InternetScrapeModal({ open, onClose }) {
  if (!open) return null;
  const [url, setUrl] = React.useState("");
  const [mode, setMode] = React.useState("auto");
  const [results, setResults] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [history, setHistory] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem("__bbox_scrape_history") || "[]"); } catch { return []; }
  });

  const saveHistory = (entry) => {
    const next = [entry, ...history].slice(0, 20);
    setHistory(next);
    localStorage.setItem("__bbox_scrape_history", JSON.stringify(next));
  };

  const scrape = async () => {
    if (!url.trim()) return;
    setLoading(true);
    const domain = url.includes("digikey") ? "digikey" : url.includes("mouser") ? "mouser" : url.includes("octopart") ? "octopart" : "generic";
    try {
      // Try API first
      const apiResult = await window.scrapingAPI?.scrape(url, mode);
      if (apiResult && apiResult.pn) {
        setResults(apiResult);
        saveHistory({ url, pn: apiResult.pn, source: apiResult.source, time: apiResult.scrapedAt });
        setLoading(false);
        window.toast("Scraped " + apiResult.pn + " from " + apiResult.source, { kind: "success" });
        return;
      }
    } catch (e) {
      // Fall through to mock
    }
    // Fallback to mock data
    const pnInput = url.split("/").pop()?.split("?")[0] || "";
    await new Promise(r => setTimeout(r, 1200 + Math.random() * 800));
    const mockResults = {
      digikey: {
        pn: pnInput || "STM32H743VIT6", mpn: "STM32H743VIT6", mfr: "STMicroelectronics",
        desc: "ARM Cortex-M7 480MHz 2MB Flash 1MB RAM LQFP-100",
        specs: { Core: "Arm Cortex-M7 @ 480 MHz", Flash: "2 MB", RAM: "1 MB", Package: "LQFP-100", "Temp Range": "-40\u00B0C to +85\u00B0C", "Supply Voltage": "1.62V - 3.6V" },
        price_breaks: [{ qty: 1, price: 22.80 }, { qty: 10, price: 20.50 }, { qty: 100, price: 17.20 }, { qty: 500, price: 14.80 }, { qty: 1000, price: 12.45 }],
        stock: 4850, lead: "12 weeks", rohs: true, datasheet: true,
      },
      mouser: {
        pn: pnInput || "EL-PSU-240W", mpn: "RPS-240-24", mfr: "Mean Well",
        desc: "240W AC/DC Power Supply 24V 10A Enclosed",
        specs: { "Output Power": "240W", "Output Voltage": "24V DC", "Output Current": "10A", "Input": "90-264V AC", Efficiency: "91%", "Operating Temp": "-30\u00B0C to +70\u00B0C" },
        price_breaks: [{ qty: 1, price: 92.50 }, { qty: 25, price: 84.30 }, { qty: 50, price: 78.00 }, { qty: 100, price: 72.50 }],
        stock: 230, lead: "8 weeks", rohs: true, datasheet: true,
      },
      generic: {
        pn: pnInput || "Unknown", mpn: pnInput || "N/A", mfr: "Unknown",
        desc: "Scraped from " + domain,
        specs: { "Manufacturer": "Unknown", "Category": "Electronic Component", "RoHS": "Compliant" },
        price_breaks: [{ qty: 1, price: 10.00 }],
        stock: null, lead: "Contact vendor", rohs: null, datasheet: false,
      },
    };
    const result = mockResults[domain] || mockResults.generic;
    result.source_url = url;
    result.source = domain;
    result.scraped_at = new Date().toISOString();
    setResults(result);
    saveHistory({ url, pn: result.pn, source: domain, time: result.scraped_at });
    setLoading(false);
    window.toast("Scraped " + result.pn + " from " + result.source, { kind: "success" });
  };

  const applyToBOM = () => {
    if (!results) return;
    onClose();
    window.toast(`Applied ${results.pn} data to BOM · ${Object.keys(results.specs).length} fields populated · audit logged`, { kind: "success" });
  };

  return (
    <window.Modal open={open} onClose={onClose} icon={<Icon.Search size={16}/>} title="Internet Scraping Engine" subtitle="Auto-pull component specs, pricing, and datasheets from distributor sites" wide
      footer={<><span className="left">{history.length} recent scrapes</span><button className="btn" onClick={onClose}>Close</button><button className="btn primary" disabled={!results} onClick={applyToBOM}><Icon.Check size={12}/> Apply to BOM</button></>}>
      
      {/* URL Input */}
      <div style={{display: "flex", gap: 8, marginBottom: 14}}>
        <div className="search" style={{flex: 1, height: 34}}>
          <Icon.Search size={11}/>
          <input
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="Paste DigiKey / Mouser / Octopart URL or part number…"
            style={{fontSize: 12, flex: 1}}
            onKeyDown={e => { if (e.key === "Enter") scrape(); }}
          />
          {url && <button className="icon-btn" style={{width:18, height:18, border:"none", background:"transparent"}} onClick={() => { setUrl(""); setResults(null); }}><Icon.X size={10}/></button>}
        </div>
        <button className="btn primary" onClick={scrape} disabled={loading || !url.trim()}>
          {loading ? <><span className="spinner"/> Scraping…</> : <><Icon.Search size={12}/> Scrape</>}
        </button>
      </div>

      {/* Mode chips */}
      <div style={{display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap"}}>
        {[["auto", "Auto-detect", "Automatically extract specs, pricing, stock, and datasheets"], ["specs", "Specs only", "Extract technical specifications and parameters"], ["pricing", "Pricing", "Extract price breaks and quantity tiers"], ["stock", "Stock & Lead", "Extract inventory levels and lead times"]].map(([k, l, d]) => (
          <span key={k} className={"chip " + (mode === k ? "active" : "")} onClick={() => setMode(k)} style={{cursor: "pointer"}} title={d}>{l}</span>
        ))}
        <div style={{flex: 1}}/>
        {history.length > 0 && (
          <window.DropdownButton
            width={220}
            trigger={<span className="chip" style={{cursor:"pointer"}}><Icon.History size={10}/> History</span>}
            items={history.map(h => ({
              label: h.pn + " · " + h.source,
              icon: <Icon.Search size={10}/>,
              onClick: () => { setUrl(h.url); },
            }))}
          />
        )}
      </div>

      {/* Results */}
      {loading && (
        <div style={{padding: 60, textAlign: "center"}}>
          <div className="spinner" style={{margin: "0 auto 14px"}}/>
          <div style={{fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)"}}>Fetching from {url.includes("digikey") ? "DigiKey" : url.includes("mouser") ? "Mouser" : "source"}…</div>
          <div style={{fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-4)", marginTop: 4}}>Parsing HTML · extracting structured data</div>
        </div>
      )}

      {results && !loading && (
        <>
          {/* Header */}
          <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "var(--bg-sunk)", borderRadius: "var(--r-2)", border: "1px solid var(--line)", marginBottom: 14}}>
            <div>
              <div style={{display: "flex", alignItems: "center", gap: 8, marginBottom: 4}}>
                <span className="tag-pill" style={{fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em"}}>{results.source}</span>
                <span style={{fontWeight: 700, fontSize: 14}}>{results.pn}</span>
                <span style={{color: "var(--fg-3)", fontSize: 12}}>{results.mfr}</span>
              </div>
              <div style={{fontSize: 11, color: "var(--fg-2)"}}>{results.desc}</div>
            </div>
            <div style={{textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)"}}>
              <div>{results.stock != null ? `${results.stock.toLocaleString()} in stock` : "Stock N/A"}</div>
              <div>Lead: {results.lead}</div>
              {results.rohs && <div style={{color: "var(--ok)"}}>✓ RoHS</div>}
            </div>
          </div>

          {/* Specs table */}
          <div style={{border: "1px solid var(--line)", borderRadius: "var(--r-2)", overflow: "hidden", marginBottom: 14}}>
            <div style={{padding: "8px 12px", background: "var(--bg-sunk)", fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-3)", borderBottom: "1px solid var(--line)"}}>Technical Specifications</div>
            <table className="bom-table" style={{tableLayout: "auto"}}>
              <tbody>
                {Object.entries(results.specs).map(([k, v]) => (
                  <tr key={k}>
                    <td style={{padding: "6px 12px", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)", width: 140}}>{k}</td>
                    <td style={{padding: "6px 12px", fontWeight: 500, fontSize: 12}}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Price breaks */}
          <div style={{border: "1px solid var(--line)", borderRadius: "var(--r-2)", overflow: "hidden"}}>
            <div style={{padding: "8px 12px", background: "var(--bg-sunk)", fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-3)", borderBottom: "1px solid var(--line)"}}>Price Breaks (USD)</div>
            <table className="bom-table" style={{tableLayout: "auto"}}>
              <thead><tr><th style={{paddingLeft: 12}}>Quantity</th><th className="num">Unit Price</th><th className="num">Extended</th></tr></thead>
              <tbody>
                {results.price_breaks.map((pb, i) => (
                  <tr key={i}>
                    <td style={{paddingLeft: 12, fontFamily: "var(--font-mono)"}}>{pb.qty}+</td>
                    <td className="num mono">{window.INR(pb.price, 2)}</td>
                    <td className="num mono" style={{fontWeight: 600}}>{window.INR(pb.price * pb.qty, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {results.datasheet && (
            <div style={{marginTop: 12, padding: 10, background: "color-mix(in oklch, var(--ok) 8%, var(--bg))", border: "1px solid var(--ok)", borderRadius: "var(--r-2)", fontSize: 11, display: "flex", alignItems: "center", gap: 8}}>
              <Icon.Doc size={14}/> Datasheet available for download · <a style={{color: "var(--accent)", cursor: "pointer"}} onClick={() => window.toast("Datasheet downloaded", { kind: "success" })}>Open PDF →</a>
            </div>
          )}
        </>
      )}

      {!results && !loading && (
        <div style={{padding: 40, textAlign: "center", color: "var(--fg-3)", border: "1px dashed var(--line)", borderRadius: "var(--r-2)"}}>
          <div style={{fontSize: 32, marginBottom: 6, fontFamily: "var(--font-mono)"}}>🕸</div>
          <div style={{fontWeight: 600, fontSize: 14, marginBottom: 4}}>Internet Scraping Engine</div>
          <div style={{fontSize: 11, maxWidth: 400, margin: "0 auto", lineHeight: 1.6}}>
            Paste a DigiKey, Mouser, Octopart, or LCSC product URL above to automatically extract specs, pricing, stock levels, and datasheets. Supports quantity-break pricing tables and parametric data.
          </div>
          <div style={{marginTop: 16, display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap"}}>
            {[
              { label: "Try DigiKey sample", url: "https://www.digikey.com/en/products/detail/stmicroelectronics/STM32H743VIT6/123456" },
              { label: "Try Mouser sample", url: "https://www.mouser.com/ProductDetail/Mean-Well/EL-PSU-240W" },
              { label: "Try Octopart sample", url: "https://octopart.com/search?q=STM32H743" },
            ].map(s => (
              <button key={s.label} className="btn small" onClick={() => { setUrl(s.url); }}>{s.label}</button>
            ))}
          </div>
        </div>
      )}
    </window.Modal>
  );
}

Object.assign(window, { ECRScreen, RFQCompareModal, ComplianceScreen, AIAssistant, CalendarScreen, CostSimulatorModal, OnboardingChecklist, PriceAlertsModal, InflationAnalysisModal, InternetScrapeModal });
