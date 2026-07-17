// Production-tier additions: error/404/offline screens, Inventory module,
// In-app guided tour, Pricing/plans modal, optimistic-update retry toast,
// skeleton/empty illustrations.

// ============ ERROR / 404 / OFFLINE / PERMISSION-DENIED SCREENS ============
function ErrorScreen({ kind = "error", title, body, action, onAction }) {
  const presets = {
    error: { ico: "⚠", color: "var(--danger)", title: title || "Something went wrong", body: body || "An unexpected error occurred. Our team has been notified." },
    "404": { ico: "404", color: "var(--fg-3)", title: title || "Page not found", body: body || "We couldn't find what you're looking for." },
    offline: { ico: "⌥", color: "var(--warn)", title: title || "You're offline", body: body || "Check your connection. Your changes are saved locally and will sync when you're back." },
    permission: { ico: "⊘", color: "var(--fg-3)", title: title || "Permission denied", body: body || "You don't have access to this. Ask an Admin to grant the required role." },
    empty: { ico: "∅", color: "var(--fg-4)", title: title || "Nothing here yet", body: body || "Get started by creating your first item." },
  };
  const p = presets[kind] || presets.error;
  return (
    <div className="err-screen">
      <div className="err-ico" style={{color: p.color, fontFamily: "var(--font-mono)", fontSize: kind === "404" ? 56 : 64, fontWeight: kind === "404" ? 700 : 400, letterSpacing: kind === "404" ? "-0.04em" : 0}}>{p.ico}</div>
      <h2>{p.title}</h2>
      <p>{p.body}</p>
      {action && <button className="btn primary" onClick={onAction} style={{marginTop: 14}}>{action}</button>}
    </div>
  );
}

// Empty-state with illustration
function EmptyState({ icon = "∅", title, body, action, onAction }) {
  return (
    <div className="empty-illust">
      <svg viewBox="0 0 160 100" width="160" height="100" style={{marginBottom: 14}}>
        <rect x="20" y="20" width="120" height="70" rx="6" fill="var(--bg-sunk)" stroke="var(--line)" strokeWidth="1.5"/>
        <line x1="20" y1="38" x2="140" y2="38" stroke="var(--line)" strokeWidth="1"/>
        <circle cx="30" cy="29" r="3" fill="var(--line)"/>
        <circle cx="40" cy="29" r="3" fill="var(--line)"/>
        <rect x="32" y="48" width="40" height="6" rx="1" fill="var(--line-soft)"/>
        <rect x="32" y="60" width="60" height="6" rx="1" fill="var(--line-soft)"/>
        <rect x="32" y="72" width="32" height="6" rx="1" fill="var(--line-soft)"/>
        <circle cx="120" cy="68" r="14" fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth="1.5"/>
        <text x="120" y="74" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="14" fontWeight="700" fill="var(--accent)">{icon}</text>
      </svg>
      <h3 style={{margin: "0 0 6px", fontSize: 14}}>{title}</h3>
      <p style={{margin: 0, fontSize: 12, color: "var(--fg-3)", maxWidth: 320, lineHeight: 1.5}}>{body}</p>
      {action && <button className="btn primary" onClick={onAction} style={{marginTop: 16}}>{action}</button>}
    </div>
  );
}

// Skeleton row used in lists during fetch
function SkeletonRows({ count = 6, cols = [80, 200, 80, 60, 100, 80] }) {
  return (
    <table className="bom-table" style={{tableLayout: "auto"}}><tbody>
      {Array.from({length: count}).map((_, i) => (
        <tr key={i}>
          {cols.map((w, j) => (
            <td key={j} style={{padding: "10px 12px"}}><span className="skeleton" style={{display: "inline-block", width: w + "px", height: 10}}/></td>
          ))}
        </tr>
      ))}
    </tbody></table>
  );
}

// ============ INVENTORY MODULE ============
function InventoryScreen() {
  const ctx = window.useAppStore();
  const baseRows = ctx?.rows || window.BOM_DATA.rows;
  const inventory = React.useMemo(() => {
    const leaves = [];
    const walk = (rs) => rs.forEach(r => { if (r.children) walk(r.children); else leaves.push(r); });
    walk(baseRows);
    return leaves.map((r, i) => {
      const seed = r.pn.charCodeAt(0) + r.pn.charCodeAt(r.pn.length - 1);
      const stock = Math.max(0, ((seed * 7) % 500) - (i % 5 === 0 ? 480 : 0));
      const reorder = Math.max(10, Math.round((r.qty || 1) * 20));
      const bin = `${String.fromCharCode(65 + (seed % 6))}-${String((seed % 20) + 1).padStart(2, "0")}-${String((seed * 3) % 30 + 1).padStart(2, "0")}`;
      return { ...r, stock, reorder, bin, status: stock === 0 ? "out" : stock < reorder ? "low" : "ok" };
    });
  }, [baseRows]);
  const [statusFilter, setStatusFilter] = React.useState("All");
  const [iSearch, setISearch] = React.useState("");
  const filtered = inventory.filter(r => (statusFilter === "All" || r.status === statusFilter.toLowerCase()) && (!iSearch || (r.pn + " " + r.name).toLowerCase().includes(iSearch.toLowerCase())));
  const totals = {
    ok: inventory.filter(r => r.status === "ok").length,
    low: inventory.filter(r => r.status === "low").length,
    out: inventory.filter(r => r.status === "out").length,
    value: inventory.reduce((s, r) => s + r.stock * (r.cost || 0), 0),
  };
  return (
    <div className="screen-wrap">
      <div className="screen-header">
        <div>
          <h1>Inventory</h1>
          <div className="sub">{inventory.length} SKUs · ₹{(totals.value * 83).toLocaleString("en-IN", {maximumFractionDigits: 0})} on hand · 6 warehouses</div>
        </div>
        <div style={{display: "flex", gap: 8}}>
          <div className="search" style={{width: 220, height: 32}}>
            <Icon.Search size={12}/>
            <input placeholder="Search SKU…" value={iSearch} onChange={e => setISearch(e.target.value)}/>
          </div>
          <window.DropdownButton width={180} trigger={<button className="btn"><Icon.Scan size={12}/> Receive stock <Icon.ChevronDown size={10}/></button>} items={[
            { icon: <Icon.Scan size={11}/>, label: "Scan inbound", onClick: () => ctx?.openModal("barcode-scan") },
            { icon: <Icon.Import size={11}/>, label: "Bulk CSV", onClick: () => ctx?.openModal("bulk-import") },
            { icon: <Icon.Plus size={11}/>, label: "Manual adjust", onClick: () => window.toast("Adjust stock") },
          ]}/>
          <button className="btn primary" onClick={() => window.toast("Reorder report drafted · 4 SKUs flagged", { kind: "success", action: { label: "Open PO", onClick: () => ctx?.openModal("new-po") } })}><Icon.Cart size={12}/> Reorder low</button>
        </div>
      </div>
      <div className="kpi-grid" style={{gridTemplateColumns: "repeat(4, 1fr)"}}>
        {[
          { l: "In stock", v: totals.ok, c: "var(--ok)" },
          { l: "Low stock", v: totals.low, c: "var(--warn)" },
          { l: "Out of stock", v: totals.out, c: "var(--danger)" },
          { l: "Inventory value", v: "₹" + (totals.value * 83 / 100000).toFixed(1) + "L", c: "var(--accent)" },
        ].map((k, i) => (
          <div key={i} className="kpi">
            <div className="l">{k.l}</div>
            <div className="v" style={{color: k.c}}>{k.v}</div>
          </div>
        ))}
      </div>
      <div style={{display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap"}}>
        {["All","Ok","Low","Out"].map(s => (
          <span key={s} className={"chip " + (s === statusFilter ? "active" : "")} onClick={() => setStatusFilter(s)} style={{cursor: "pointer"}}>{s} <span style={{color:"var(--fg-4)", marginLeft: 4}}>{s === "All" ? inventory.length : totals[s.toLowerCase()]}</span></span>
        ))}
      </div>
      {filtered.length === 0 ? (
        <EmptyState icon="∅" title="No inventory items match" body="Try clearing filters or scanning new stock in."/>
      ) : (
        <div className="card" style={{overflow: "visible"}}>
          <table className="bom-table" style={{tableLayout: "auto"}}>
            <thead><tr>
              <th style={{paddingLeft: 16}}>Part No.</th>
              <th>Name</th>
              <th>Bin</th>
              <th className="num">On hand</th>
              <th className="num">Reorder pt</th>
              <th className="num">Unit cost</th>
              <th className="num">Value</th>
              <th>Status</th>
              <th></th>
            </tr></thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id}>
                  <td className="mono" style={{paddingLeft: 16, fontWeight: 600}}>{r.pn}</td>
                  <td>{r.name}</td>
                  <td className="mono" style={{color:"var(--fg-3)"}}>📍 {r.bin}</td>
                  <td className="num mono" style={{fontWeight: 700, color: r.status === "out" ? "var(--danger)" : r.status === "low" ? "var(--warn)" : "var(--fg)"}}>{r.stock}</td>
                  <td className="num mono" style={{color:"var(--fg-3)"}}>{r.reorder}</td>
                  <td className="num mono">{window.INR(r.cost, 2)}</td>
                  <td className="num mono" style={{fontWeight: 600}}>{window.INR(r.stock * (r.cost || 0), 0)}</td>
                  <td>
                    <span className={"status " + (r.status === "ok" ? "released" : r.status === "low" ? "review" : "deprecated")}>
                      {r.status === "ok" ? "In stock" : r.status === "low" ? "Low" : "Out"}
                    </span>
                  </td>
                  <td>
                    <window.DropdownButton width={180} trigger={<button className="icon-btn" style={{width: 22, height: 22}}><Icon.Dots size={11}/></button>} items={[
                      { icon: <Icon.Cart size={11}/>, label: "Reorder", onClick: () => window.toast("Drafted PO for " + r.pn) },
                      { icon: <Icon.Edit size={11}/>, label: "Adjust stock", onClick: () => window.toast("Adjusted") },
                      { icon: <Icon.Scan size={11}/>, label: "Print bin label", onClick: () => window.toast("Printing " + r.bin) },
                    ]}/>
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

// ============ PRICING MODAL ============
function PricingModal({ open, onClose }) {
  const plans = [
    { id: "free", name: "Free", price: "₹0", per: "forever", desc: "For solo makers and hobbyists", features: ["1 user","1 BOM project","100 parts","CSV export","Community support"], cta: "Current plan" },
    { id: "team", name: "Team", price: "₹19,920", per: "/mo", desc: "Small teams shipping hardware", features: ["Up to 24 users","Unlimited BOMs","100,000 parts","Vendor management","Procurement","Slack + email notifications","Priority email support"], cta: "Upgrade", best: true },
    { id: "biz", name: "Business", price: "₹49,800", per: "/mo", desc: "Production-ready manufacturing", features: ["Unlimited users","Unlimited BOMs","SolidWorks CAD sync","Advanced analytics","Audit log + SSO","SAML / OIDC","99.9% SLA","Dedicated CSM"], cta: "Talk to sales" },
    { id: "ent", name: "Enterprise", price: "Custom", per: "", desc: "Large orgs with custom needs", features: ["Everything in Business","Self-hosted option","SOC 2 Type II + HIPAA","Custom contracts","Dedicated environment","Premium SLA","TAM + onboarding"], cta: "Contact sales" },
  ];
  return (
    <window.Modal open={open} onClose={onClose} icon={<Icon.Sparkles size={16}/>} title="Plans & pricing" subtitle="Choose the plan that fits your team" wide>
      <div style={{display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10}}>
        {plans.map(p => (
          <div key={p.id} style={{border: "1.5px solid " + (p.best ? "var(--accent)" : "var(--line)"), borderRadius: "var(--r-3)", padding: 16, background: "var(--bg)", position: "relative", display: "flex", flexDirection: "column"}}>
            {p.best && <span style={{position: "absolute", top: -10, left: 12, fontFamily: "var(--font-mono)", fontSize: 9, padding: "2px 8px", background: "var(--accent)", color: "white", borderRadius: 99, letterSpacing: "0.08em"}}>MOST POPULAR</span>}
            <div style={{fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.08em"}}>{p.name}</div>
            <div style={{display: "flex", alignItems: "baseline", gap: 4, margin: "8px 0 4px"}}>
              <span style={{fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 700}}>{p.price}</span>
              <span style={{fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)"}}>{p.per}</span>
            </div>
            <div style={{fontSize: 11, color: "var(--fg-3)", marginBottom: 12, minHeight: 30}}>{p.desc}</div>
            <ul style={{listStyle: "none", padding: 0, margin: "0 0 14px", fontSize: 11, color: "var(--fg-2)", flex: 1}}>
              {p.features.map((f, i) => <li key={i} style={{padding: "3px 0", display: "flex", gap: 6}}><span style={{color: "var(--ok)"}}>✓</span> {f}</li>)}
            </ul>
            <button className={"btn " + (p.best ? "primary" : "")} style={{width: "100%", justifyContent: "center"}} onClick={() => { onClose(); window.toast(p.cta + " · " + p.name); }}>{p.cta}</button>
          </div>
        ))}
      </div>
      <div style={{marginTop: 16, padding: 12, background: "var(--bg-sunk)", border: "1px solid var(--line)", borderRadius: "var(--r-2)", fontSize: 11, color: "var(--fg-3)", textAlign: "center"}}>
        All plans billed annually, 14-day free trial · No credit card required · Cancel anytime
      </div>
    </window.Modal>
  );
}

// ============ PRODUCT TOUR ============
const TOUR_STEPS = [
  { sel: ".nav-item.active", title: "BOM Editor", body: "Your active workspace view. Switch between BOM Editor, Components, Vendors, Procurement, and more from this left rail." },
  { sel: ".search", title: "Global search (⌘K)", body: "Find any part, vendor, BOM, or action from anywhere. Try ⌘K from any screen." },
  { sel: ".project-pill", title: "Active project", body: "You're working in this project's BOM. Click ATLAS in the breadcrumb to switch projects." },
  { sel: ".ribbon", title: "Cost rollup", body: "Live totals from your BOM — cost, lead time, vendor + country diversification, risk flags." },
  { sel: ".bom-table tbody tr:first-child .icon-btn:last-child", title: "Row actions", body: "Every part has Find Alternates, Send RFQ, Duplicate, Delete, and more. The chevron next to it opens full detail." },
  { sel: ".topbar .icon-btn[title='Notifications']", title: "Notifications", body: "@-mentions, approval requests, supply-chain alerts. Live and persistent." },
];

function ProductTour({ onClose }) {
  const [step, setStep] = React.useState(0);
  const [pos, setPos] = React.useState(null);
  const stepData = TOUR_STEPS[step];
  React.useEffect(() => {
    const place = () => {
      const el = document.querySelector(stepData.sel);
      if (!el) { setPos({ top: 100, left: 100, w: 0, h: 0, fallback: true }); return; }
      const r = el.getBoundingClientRect();
      setPos({ top: r.top, left: r.left, w: r.width, h: r.height });
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [step]);
  if (!pos) return null;
  const tipTop = pos.top + pos.h + 12;
  const tipLeft = Math.max(20, Math.min(window.innerWidth - 340, pos.left));
  return (
    <>
      <div className="tour-backdrop"/>
      {!pos.fallback && <div className="tour-spotlight" style={{top: pos.top - 6, left: pos.left - 6, width: pos.w + 12, height: pos.h + 12}}/>}
      <div className="tour-tip" style={{top: tipTop, left: tipLeft}}>
        <div style={{fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--accent)", marginBottom: 6}}>Step {step + 1} of {TOUR_STEPS.length}</div>
        <div style={{fontWeight: 700, fontSize: 14, marginBottom: 6}}>{stepData.title}</div>
        <div style={{fontSize: 12, color: "var(--fg-2)", lineHeight: 1.5, marginBottom: 12}}>{stepData.body}</div>
        <div style={{display: "flex", justifyContent: "space-between", alignItems: "center"}}>
          <button onClick={onClose} style={{background: "transparent", border: "none", color: "var(--fg-3)", fontSize: 11, cursor: "pointer"}}>Skip tour</button>
          <div style={{display: "flex", gap: 6}}>
            {step > 0 && <button className="btn small" onClick={() => setStep(step - 1)}>Back</button>}
            <button className="btn primary small" onClick={() => step === TOUR_STEPS.length - 1 ? onClose() : setStep(step + 1)}>
              {step === TOUR_STEPS.length - 1 ? "Finish" : "Next →"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ============ OPTIMISTIC RETRY HELPER ============
// Usage: window.optimistic(() => doMutation(), { undo: () => revert(), label: "Saved" });
// 12% chance of simulated failure for demo purposes.
window.optimistic = function (mutation, opts = {}) {
  try { mutation(); } catch (e) { window.toast("Failed: " + e.message, { kind: "error" }); return; }
  if (Math.random() < 0.12) {
    // Simulate API failure after a delay
    setTimeout(() => {
      window.toast(opts.failLabel || "Save failed", {
        kind: "error",
        duration: 6000,
        action: {
          label: "Retry",
          onClick: () => window.optimistic(mutation, opts),
        },
      });
      opts.undo && opts.undo();
    }, 600);
  } else if (opts.label) {
    setTimeout(() => window.toast(opts.label, { kind: "success", duration: 1800 }), 200);
  }
};

Object.assign(window, { ErrorScreen, EmptyState, SkeletonRows, InventoryScreen, PricingModal, ProductTour });
