// Final polish layer: Approvals inbox, Roadmap, Bulk vendor import,
// Offline indicator, URL-synced filters, Saved searches, Notif prefs, PO PDF.

// ============ APPROVALS INBOX ============
function ApprovalsScreen() {
  const ctx = window.useAppStore();
  const [filter, setFilter] = React.useState("All");

  const approvalsList = React.useMemo(() => {
    const out = [];
    if (ctx?.approvals) {
      Object.entries(ctx.approvals).forEach(([pn, stages]) => {
        Object.entries(stages).forEach(([role, status]) => {
          if (status !== "approved") {
            out.push({ kind: "BOM Revision", target: pn, role, status, requester: "M. Park", date: "2026-05-24", value: null });
          }
        });
      });
    }
    out.push(
      { kind: "Purchase Order", target: "PO-2026-0491", role: "procurement", status: "pending", requester: "K. Singh", date: "2026-05-25", value: 174300 },
      { kind: "Purchase Order", target: "PO-2026-0488", role: "finance", status: "pending", requester: "K. Singh", date: "2026-05-25", value: 89400 },
      { kind: "Vendor Onboarding", target: "Bossard GmbH", role: "procurement", status: "pending", requester: "E. Chen", date: "2026-05-23", value: null },
      { kind: "Part Release", target: "OPT-LNS-25MM Rev B", role: "engineering", status: "pending", requester: "R. Sato", date: "2026-05-22", value: null },
      { kind: "Cost Variance", target: "EL-PSU-240W +12%", role: "finance", status: "pending", requester: "System", date: "2026-05-22", value: 8400 },
    );
    return out;
  }, [ctx?.approvals]);

  const filtered = approvalsList.filter(a =>
    filter === "All" ? true :
    filter === "Mine" ? ["engineering"].includes(a.role) :
    filter.toLowerCase() === a.role
  );

  const act = (a, action) => {
    if (action === "approve" && a.kind === "BOM Revision" && ctx?.setApprovals) {
      const next = { ...ctx.approvals };
      next[a.target] = { ...next[a.target], [a.role]: "approved" };
      ctx.setApprovals(next);
    }
    window.toast(`${action === "approve" ? "Approved" : "Rejected"} · ${a.target}`, { kind: action === "approve" ? "success" : "warn" });
  };

  return (
    <div className="screen-wrap">
      <div className="screen-header">
        <div>
          <h1>Approvals Inbox</h1>
          <div className="sub">{filtered.length} pending across BOMs, POs, vendors, and parts</div>
        </div>
        <div style={{display: "flex", gap: 8}}>
          <button className="btn" onClick={() => window.toast("Subscribed · email + Slack alerts on")}><Icon.Bell size={12}/> Notify settings</button>
          <button className="btn primary" onClick={() => { filtered.forEach(a => act(a, "approve")); window.toast(`Bulk approved ${filtered.length} items`, { kind: "success" }); }}><Icon.Check size={12}/> Approve all visible</button>
        </div>
      </div>

      <div style={{display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap"}}>
        {["All","Mine","Engineering","Procurement","Finance"].map(f => (
          <span key={f} className={"chip " + (f === filter ? "active" : "")} onClick={() => setFilter(f)} style={{cursor: "pointer"}}>
            {f} <span style={{color: "var(--fg-4)", marginLeft: 4}}>{approvalsList.filter(a => f === "All" ? true : f === "Mine" ? a.role === "engineering" : a.role === f.toLowerCase()).length}</span>
          </span>
        ))}
      </div>

      {filtered.length === 0 ? (
        <window.EmptyState icon="✓" title="Inbox zero" body="You're all caught up. New approval requests will appear here."/>
      ) : (
        <div style={{display: "flex", flexDirection: "column", gap: 8}}>
          {filtered.map((a, i) => (
            <div key={i} style={{display: "grid", gridTemplateColumns: "120px 1fr 130px auto", gap: 14, padding: 14, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: "var(--r-3)", alignItems: "center"}}>
              <span className="tag-pill" style={{justifySelf: "start"}}>{a.kind}</span>
              <div>
                <div style={{fontWeight: 600, fontSize: 13}}>{a.target}</div>
                <div style={{fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)", marginTop: 2}}>
                  Requested by {a.requester} · {a.date} · Awaiting {a.role.toUpperCase()}
                  {a.value && <> · <strong style={{color: "var(--fg)"}}>{window.INR(a.value, 0)}</strong></>}
                </div>
              </div>
              <span className="status review">{a.status}</span>
              <div style={{display: "flex", gap: 6}}>
                <button className="btn small" onClick={() => act(a, "reject")}>Reject</button>
                <button className="btn small primary" onClick={() => act(a, "approve")}><Icon.Check size={11}/> Approve</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============ ROADMAP MODAL ============
function RoadmapModal({ open, onClose }) {
  const items = [
    { q: "Now (v3.x)", color: "var(--ok)", items: ["BOM editor + procurement", "Vendor management", "OCR + auto-scrape", "Multi-project workspace", "Audit log + API keys"] },
    { q: "Next (Q3 2026)", color: "var(--accent)", items: ["ERP integration (NetSuite, SAP)", "Inventory management v2 (multi-warehouse)", "Supplier portal (vendor self-service)", "Auto-generated RFQs from low stock"] },
    { q: "Later (Q4 2026)", color: "var(--info)", items: ["AI procurement recommendations", "Forecasting + shortage prediction", "Part interchangeability suggestions", "Poka-yoke validation rules"] },
    { q: "Future (2027)", color: "var(--fg-3)", items: ["Native iOS / Android scanner app", "Approval automation engine", "BOM cost simulation sandbox", "Sustainability + carbon footprint tracking"] },
  ];
  return (
    <window.Modal open={open} onClose={onClose} icon={<Icon.Sparkles size={16}/>} title="Product Roadmap" subtitle="What we're building next" wide>
      <div style={{display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12}}>
        {items.map(col => (
          <div key={col.q} style={{padding: 12, background: "var(--bg-sunk)", border: "1px solid var(--line)", borderRadius: "var(--r-3)"}}>
            <div style={{fontFamily: "var(--font-mono)", fontSize: 10, color: col.color, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 12, paddingBottom: 8, borderBottom: "2px solid " + col.color}}>{col.q}</div>
            {col.items.map((it, i) => (
              <div key={i} style={{padding: "8px 10px", background: "var(--bg)", borderRadius: "var(--r-2)", marginBottom: 6, fontSize: 12, border: "1px solid var(--line)"}}>{it}</div>
            ))}
            {col.q.startsWith("Future") && (
              <button className="btn small" style={{width: "100%", marginTop: 8, justifyContent: "center"}} onClick={() => window.toast("Vote recorded · we'll prioritize based on demand")}><Icon.Sparkles size={11}/> Vote</button>
            )}
          </div>
        ))}
      </div>
      <div style={{marginTop: 14, padding: 12, background: "var(--bg-sunk)", border: "1px dashed var(--line)", borderRadius: "var(--r-2)", textAlign: "center", fontSize: 11, color: "var(--fg-3)"}}>
        Have an idea? <a style={{color: "var(--accent)", cursor: "pointer"}} onClick={() => { onClose(); window.toast("Idea submitted · thank you!"); }}>Suggest a feature →</a>
      </div>
    </window.Modal>
  );
}

// ============ BULK VENDOR IMPORT ============
function BulkVendorImportModal({ open, onClose }) {
  const ctx = window.useAppStore();
  const [step, setStep] = React.useState("upload");
  const [csvText, setCsvText] = React.useState("");
  const [rows, setRows] = React.useState([]);
  const [headers, setHeaders] = React.useState([]);
  const [mapping, setMapping] = React.useState({});

  React.useEffect(() => { if (open) { setStep("upload"); setCsvText(""); setRows([]); } }, [open]);

  const FIELDS = ["name", "country", "lead", "moq", "rating", "terms", "risk"];

  const loadSample = () => {
    const sample = `Vendor Name,Country,Lead Days,MOQ,Rating,Terms,Risk
Würth Elektronik,DE,12,25,4.7,Net 30,Low
TDK Corporation,JP,21,100,4.6,Net 45,Low
Murata,JP,28,500,4.8,Net 45,Low
Texas Instruments,US,18,1,4.7,Net 30,Low
LCSC Electronics,CN,7,1,4.2,Prepaid,Med`;
    parseCSV(sample);
  };

  const parseCSV = (text) => {
    const lines = text.trim().split(/\r?\n/);
    const hdrs = lines[0].split(",").map(h => h.trim());
    const data = lines.slice(1).map(l => l.split(",").map(c => c.trim()));
    setHeaders(hdrs);
    setRows(data);
    const m = {};
    hdrs.forEach((h, i) => {
      const l = h.toLowerCase();
      if (/name/.test(l)) m.name = i;
      if (/country/.test(l)) m.country = i;
      if (/lead/.test(l)) m.lead = i;
      if (/moq|min.?order/.test(l)) m.moq = i;
      if (/rating|score/.test(l)) m.rating = i;
      if (/terms|payment/.test(l)) m.terms = i;
      if (/risk/.test(l)) m.risk = i;
    });
    setMapping(m);
    setStep("review");
  };

  const apply = () => {
    if (ctx?.setVendors) {
      const newVendors = rows.map((r, i) => ({
        id: "vi" + Date.now() + i,
        name: r[mapping.name] || "Unnamed",
        country: r[mapping.country] || "—",
        lead: Number(r[mapping.lead]) || 14,
        moq: Number(r[mapping.moq]) || 1,
        rating: Number(r[mapping.rating]) || 4.0,
        terms: r[mapping.terms] || "Net 30",
        risk: r[mapping.risk] || "Low",
        parts: 0, preferred: false,
      }));
      ctx.setVendors([...ctx.vendors, ...newVendors]);
    }
    onClose();
    window.toast(`Imported ${rows.length} vendors`, { kind: "success" });
  };

  return (
    <window.Modal open={open} onClose={onClose} icon={<Icon.Vendor size={16}/>} title="Bulk import vendors" subtitle={step === "upload" ? "Drop a CSV or use sample" : `Review ${rows.length} vendors`} wide
      footer={step === "review" ? <><button className="btn" onClick={() => setStep("upload")}>Back</button><button className="btn primary" onClick={apply}><Icon.Check size={12}/> Import {rows.length}</button></> : null}>
      {step === "upload" && (
        <>
          <textarea className="input" style={{minHeight: 180, fontFamily: "var(--font-mono)"}} placeholder="Vendor Name,Country,Lead Days,MOQ,Rating,Terms,Risk" value={csvText} onChange={e => setCsvText(e.target.value)}/>
          <div style={{display: "flex", justifyContent: "space-between", marginTop: 12}}>
            <button className="btn small" onClick={loadSample}><Icon.Sparkles size={11}/> Use sample data</button>
            <button className="btn primary" onClick={() => parseCSV(csvText)} disabled={!csvText.trim()}>Parse →</button>
          </div>
        </>
      )}
      {step === "review" && (
        <div style={{border: "1px solid var(--line)", borderRadius: "var(--r-2)", overflow: "auto", maxHeight: 360}}>
          <table className="bom-table" style={{tableLayout: "auto"}}>
            <thead><tr>{FIELDS.map(f => <th key={f} style={{paddingLeft: 12}}>{f}</th>)}</tr></thead>
            <tbody>
              {rows.map((r, i) => <tr key={i}>{FIELDS.map(f => <td key={f} className="mono" style={{paddingLeft: 12}}>{r[mapping[f]] || "—"}</td>)}</tr>)}
            </tbody>
          </table>
        </div>
      )}
    </window.Modal>
  );
}

// ============ NOTIFICATION PREFERENCES ============
function NotifPrefsModal({ open, onClose }) {
  const [prefs, setPrefs] = React.useState(() => JSON.parse(localStorage.getItem("__bbox_notif") || "null") || {
    mentions: { inapp: true, email: true, slack: false },
    approvals: { inapp: true, email: true, slack: true },
    cost_alerts: { inapp: true, email: false, slack: false },
    supply_risk: { inapp: true, email: true, slack: true },
    weekly_digest: { inapp: false, email: true, slack: false },
    new_vendors: { inapp: false, email: false, slack: false },
  });
  const toggle = (event, channel) => {
    const next = { ...prefs, [event]: { ...prefs[event], [channel]: !prefs[event][channel] } };
    setPrefs(next);
  };
  const save = () => {
    localStorage.setItem("__bbox_notif", JSON.stringify(prefs));
    onClose();
    window.toast("Notification preferences saved", { kind: "success" });
  };
  const events = [
    ["mentions", "@ Mentions", "When someone tags you in a comment"],
    ["approvals", "Approval requests", "Approvals awaiting your action"],
    ["cost_alerts", "Cost alerts", "When a part's cost changes >10%"],
    ["supply_risk", "Supply chain risk", "Lead-time spikes, vendor issues"],
    ["weekly_digest", "Weekly digest", "Mon morning summary of activity"],
    ["new_vendors", "New vendor onboarded", "When a vendor joins the workspace"],
  ];
  return (
    <window.Modal open={open} onClose={onClose} icon={<Icon.Bell size={16}/>} title="Notification preferences" subtitle="Choose where you get notified for each event"
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save preferences</button></>}>
      <div style={{display: "grid", gridTemplateColumns: "1fr 60px 60px 60px", gap: 0, alignItems: "center", border: "1px solid var(--line)", borderRadius: "var(--r-2)", overflow: "hidden"}}>
        <div style={{padding: "10px 12px", background: "var(--bg-sunk)", fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-3)"}}>Event</div>
        <div style={{padding: "10px 12px", background: "var(--bg-sunk)", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", color: "var(--fg-3)"}}>In-app</div>
        <div style={{padding: "10px 12px", background: "var(--bg-sunk)", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", color: "var(--fg-3)"}}>Email</div>
        <div style={{padding: "10px 12px", background: "var(--bg-sunk)", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", color: "var(--fg-3)"}}>Slack</div>
        {events.map(([key, name, desc], i) => (
          <React.Fragment key={key}>
            <div style={{padding: "10px 12px", borderTop: "1px solid var(--line-soft)"}}>
              <div style={{fontWeight: 500, fontSize: 12}}>{name}</div>
              <div style={{fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)", marginTop: 2}}>{desc}</div>
            </div>
            {["inapp", "email", "slack"].map(ch => (
              <div key={ch} style={{padding: 10, textAlign: "center", borderTop: "1px solid var(--line-soft)"}}>
                <input type="checkbox" className="row-checkbox" style={{width: 16, height: 16}} checked={prefs[key][ch]} onChange={() => toggle(key, ch)}/>
              </div>
            ))}
          </React.Fragment>
        ))}
      </div>
      <div style={{marginTop: 14, padding: 10, background: "var(--bg-sunk)", border: "1px solid var(--line)", borderRadius: "var(--r-2)", fontSize: 11, color: "var(--fg-3)", display: "flex", justifyContent: "space-between"}}>
        <span>Quiet hours</span>
        <span style={{fontFamily: "var(--font-mono)"}}>8pm — 8am IST · weekends off</span>
      </div>
    </window.Modal>
  );
}

// ============ OFFLINE INDICATOR / NETWORK STATUS ============
function NetworkBadge() {
  const [online, setOnline] = React.useState(navigator.onLine);
  const [simulate, setSimulate] = React.useState(false);
  React.useEffect(() => {
    const onOff = () => setOnline(navigator.onLine);
    window.addEventListener("online", onOff);
    window.addEventListener("offline", onOff);
    return () => { window.removeEventListener("online", onOff); window.removeEventListener("offline", onOff); };
  }, []);
  const effective = !simulate && online;
  // Expose toggle for demo
  React.useEffect(() => { window.__toggleOffline = () => setSimulate(s => !s); return () => { delete window.__toggleOffline; }; }, []);
  if (effective) return null;
  return (
    <div style={{
      position: "fixed", bottom: 12, left: "50%", transform: "translateX(-50%)",
      background: "var(--warn)", color: "white",
      padding: "6px 14px", borderRadius: 99, fontSize: 11,
      fontFamily: "var(--font-mono)", letterSpacing: "0.06em",
      display: "inline-flex", alignItems: "center", gap: 8,
      zIndex: 200, boxShadow: "var(--shadow-md)",
    }}>
      <span style={{width: 8, height: 8, borderRadius: 99, background: "white", animation: "pulse 1s infinite"}}/>
      OFFLINE · Changes saved locally and will sync when reconnected
      {simulate && <button onClick={() => setSimulate(false)} style={{marginLeft: 6, background: "rgba(255,255,255,0.25)", color: "white", border: "none", borderRadius: 3, padding: "2px 8px", fontSize: 10, cursor: "pointer"}}>Reconnect</button>}
    </div>
  );
}

// ============ PO PDF (templated, professional layout) ============
window.printPO = function (item, vendor) {
  if (!item) return;
  const w = window.open("", "_blank", "width=900,height=900");
  if (!w) { window.toast("Pop-up blocked", { kind: "warn" }); return; }
  const lineCost = (item.qty || 0) * (item.cost || 12);
  const tax = lineCost * 0.08;
  const ship = 12.50;
  const total = lineCost + tax + ship;
  var poNum = String(item.pn ? item.pn.charCodeAt(0) * 7 : 491).padStart(4, "0");
  var poTitle = item.pn ? "PO · " + item.pn : "Purchase Order";
  var html = "<!doctype html><html><head><title>" + poTitle + "</title>" +
    "<style>@page{size:A4;margin:16mm}body{font-family:-apple-system,sans-serif;color:#000;font-size:11px;margin:0;padding:20px}" +
    ".head{display:grid;grid-template-columns:1fr 200px;gap:20px;padding-bottom:16px;border-bottom:3px solid #000}" +
    ".logo{font-family:monospace;font-weight:700;letter-spacing:0.18em;font-size:14px}h1{font-size:28px;margin:4px 0 0;font-weight:700}" +
    ".meta-box{font-family:monospace;font-size:10px}.meta-box .row{display:flex;justify-content:space-between;padding:3px 0}" +
    ".meta-box strong{color:#000}.parties{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin:20px 0}" +
    ".party h3{font-family:monospace;font-size:9px;text-transform:uppercase;letter-spacing:0.08em;color:#888;margin:0 0 6px}" +
    ".party .name{font-weight:700;font-size:14px;margin-bottom:4px}.party div{font-size:11px;color:#444}" +
    "table{width:100%;border-collapse:collapse;margin:20px 0}" +
    "th{text-align:left;padding:8px 10px;background:#f5f5f5;font-family:monospace;font-size:9px;text-transform:uppercase;letter-spacing:0.06em}" +
    "td{padding:8px 10px;border-bottom:1px solid #eee}td.r{text-align:right;font-family:monospace}" +
    ".totals{display:flex;justify-content:flex-end}.totals table{width:300px}" +
    ".totals td{border:none;padding:4px 0;font-family:monospace}" +
    ".totals .total td{border-top:2px solid #000;padding-top:8px;font-weight:700;font-size:14px}" +
    ".terms{margin-top:30px;padding:14px;background:#fafafa;border-left:3px solid #000;font-size:10px;line-height:1.6}" +
    ".foot{margin-top:40px;display:flex;justify-content:space-between;font-size:9px;color:#666;padding-top:14px;border-top:1px solid #ddd}" +
    ".sign-row{margin-top:30px;display:grid;grid-template-columns:1fr 1fr;gap:50px}" +
    ".sign-row .sig{padding-top:30px;border-top:1px solid #000;font-size:10px;color:#666}</style></head><body>" +
    "<div class='head'><div><div class='logo'>BLACKBOX FACTORIES</div><h1>Purchase Order</h1></div>" +
    "<div class='meta-box'>" +
    "<div class='row'><span>PO Number</span><strong>PO-2026-" + poNum + "</strong></div>" +
    "<div class='row'><span>Issue Date</span><strong>" + new Date().toISOString().slice(0,10) + "</strong></div>" +
    "<div class='row'><span>Required By</span><strong>" + (item.eta || "TBD") + "</strong></div>" +
    "<div class='row'><span>Currency</span><strong>INR</strong></div>" +
    "<div class='row'><span>Status</span><strong style='color:#e85d1f'>ISSUED</strong></div>" +
    "</div></div>" +
    "<div class='parties'>" +
    "<div class='party'><h3>Vendor</h3><div class='name'>" + (item.vendor || "Mean Well") + "</div>" +
    "<div>orders@" + (item.vendor || "vendor").toLowerCase().replace(/\s+/g, "") + ".com</div>" +
    "<div>1234 Industrial Park</div><div>" + (vendor?.country || "TW") + "</div></div>" +
    "<div class='party'><h3>Ship to</h3><div class='name'>Blackbox Factories · Receiving</div>" +
    "<div>2451 Engineering Way</div><div>Mountain View, CA 94043 · USA</div><div>Attn: Receiving Dock</div></div>" +
    "</div>" +
    "<table><thead><tr><th>Part No.</th><th>Description</th><th class='r'>Qty</th><th class='r'>Unit (₹)</th><th class='r'>Ext. (₹)</th></tr></thead>" +
    "<tbody><tr><td style='font-weight:600'>" + item.pn + "</td><td>" + item.name + "</td><td class='r'>" + item.qty + "</td>" +
    "<td class='r'>₹" + ((item.cost || 12) * 83).toLocaleString("en-IN", {minimumFractionDigits: 2}) + "</td>" +
    "<td class='r' style='font-weight:600'>₹" + (lineCost * 83).toLocaleString("en-IN", {minimumFractionDigits: 2}) + "</td></tr></tbody></table>" +
    "<div class='totals'><table>" +
    "<tr><td>Subtotal</td><td class='r'>₹" + (lineCost * 83).toLocaleString("en-IN", {minimumFractionDigits: 2}) + "</td></tr>" +
    "<tr><td>Tax (GST 18%)</td><td class='r'>₹" + (tax * 83).toLocaleString("en-IN", {minimumFractionDigits: 2}) + "</td></tr>" +
    "<tr><td>Shipping</td><td class='r'>₹" + (ship * 83).toLocaleString("en-IN", {minimumFractionDigits: 2}) + "</td></tr>" +
    "<tr class='total'><td>TOTAL</td><td class='r'>₹" + (total * 83).toLocaleString("en-IN", {minimumFractionDigits: 2}) + "</td></tr>" +
    "</table></div>" +
    "<div class='terms'><strong>Terms & Conditions:</strong> Payment Net 30 from receipt of invoice. Goods must conform to specifications, RoHS-compliant, with country-of-origin labelling. Late delivery beyond ETA may incur 0.5%/week penalty. All items subject to inspection at receiving. Reference PO number on packing slip and invoice.</div>" +
    "<div class='sign-row'><div class='sig'>Authorized by Buyer · K. Singh, Procurement Lead</div><div class='sig'>Acknowledged by Vendor · Date</div></div>" +
    "<div class='foot'><span>Blackbox Factories · GST 29AABCB1234C1Z5</span><span>Page 1 of 1 · Generated " + new Date().toLocaleString() + "</span></div>" +
    "<script>setTimeout(function(){window.print()},400)<\/script></body></html>";
  w.document.write(html);
  w.document.close();
  window.toast("PO PDF preview opened", { kind: "success" });
};

// ============ URL FILTER SYNC HOOK ============
window.useURLState = function (key, initial) {
  const [val, setVal] = React.useState(() => {
    const p = new URLSearchParams(window.location.search);
    const v = p.get(key);
    return v != null ? v : initial;
  });
  React.useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (val === initial || val === "" || val == null) p.delete(key);
    else p.set(key, String(val));
    const q = p.toString();
    history.replaceState(null, "", q ? "?" + q : window.location.pathname);
  }, [val, key, initial]);
  return [val, setVal];
};

// ============ SAVED SEARCHES (for ⌘K) ============
window.SAVED_SEARCHES_KEY = "__bbox_saved_searches";
window.getSavedSearches = () => JSON.parse(localStorage.getItem(window.SAVED_SEARCHES_KEY) || "[]");
window.saveSavedSearch = (q) => {
  const list = window.getSavedSearches();
  if (list.includes(q) || !q.trim()) return;
  list.unshift(q);
  localStorage.setItem(window.SAVED_SEARCHES_KEY, JSON.stringify(list.slice(0, 8)));
};

Object.assign(window, {
  ApprovalsScreen, RoadmapModal, BulkVendorImportModal,
  NotifPrefsModal, NetworkBadge,
});
