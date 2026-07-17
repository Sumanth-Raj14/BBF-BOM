// Component Library — full catalog with facets, search, grid/list, dups.

// Flatten BOM tree into unique parts list with where-used count
function buildCatalog(data) {
  const map = new Map();
  const walk = (rs, lineage = []) => rs.forEach(r => {
    if (r.assembly && r.children) {
      walk(r.children, [...lineage, r.name]);
    } else {
      const key = r.pn;
      if (!map.has(key)) {
        map.set(key, { ...r, whereUsed: [], totalQty: 0, instances: 0 });
      }
      const entry = map.get(key);
      entry.whereUsed.push(lineage.join(" / "));
      entry.totalQty += r.qty || 0;
      entry.instances += 1;
    }
  });
  walk(data.rows);

  // Add some "library-only" parts (not currently in active BOM) for realism
  const libraryOnly = [
    { id:"lib1", pn:"EL-CAP-100UF-25V", name:"Capacitor, 100µF 25V Electrolytic", rev:"A", qty:0, uom:"EA", category:"Electrical", vendor:"Nichicon", manufacturer:"Nichicon", cost:0.14, lead:14, origin:"JP", status:"Released", trend:[0.13,0.14,0.14,0.14,0.14,0.14,0.14], whereUsed:[], totalQty:0, instances:0, material:"Aluminum/Electrolyte", weight:2, dimensions:"Ø10 × 16 mm", tags:["passive","capacitor"], compliance:["RoHS"], freight:0.02, tax:0.03, landedCost:0.19 },
    { id:"lib2", pn:"EL-RES-10K-1%", name:"Resistor, 10kΩ ±1% 0805", rev:"—", qty:0, uom:"EA", category:"Electrical", vendor:"Yageo", manufacturer:"Yageo", cost:0.01, lead:7, origin:"TW", status:"Released", trend:null, whereUsed:[], totalQty:0, instances:0, material:"Thick Film/Ceramic", weight:0.03, dimensions:"2.0 × 1.25 mm (0805)", tags:["passive","resistor"], compliance:["RoHS"], freight:0.001, tax:0.002, landedCost:0.013 },
    { id:"lib3", pn:"MEC-SPR-08X20", name:"Compression Spring, 8mm × 20mm", rev:"A", qty:0, uom:"EA", category:"Mechanical", vendor:"Lee Spring", manufacturer:"Lee Spring", cost:1.20, lead:10, origin:"US", status:"Released", trend:[1.15,1.15,1.18,1.20,1.20,1.20,1.20], whereUsed:[], totalQty:0, instances:0, material:"Spring Steel", weight:4, dimensions:"Ø8 × 20 mm", customFields:{"Wire Diameter":"0.8 mm","Max Load":"12 N"}, tags:["spring","mechanical"], compliance:["RoHS"], freight:0.10, tax:0.22, landedCost:1.52 },
    { id:"lib4", pn:"HW-WSH-M3-FL", name:"Washer, M3 Flat Stainless", rev:"—", qty:0, uom:"EA", category:"Hardware", vendor:"McMaster", manufacturer:"McMaster-Carr", cost:0.03, lead:2, origin:"US", status:"Released", trend:null, whereUsed:[], totalQty:0, instances:0, material:"Stainless Steel 304", weight:0.3, dimensions:"M3 × Ø7 × 0.5 mm", tags:["hardware","washer"], compliance:["RoHS"], freight:0.004, tax:0.006, landedCost:0.04 },
    { id:"lib5", pn:"OPT-FLT-IR850", name:"IR Bandpass Filter, 850nm Ø25mm", rev:"B", qty:0, uom:"EA", category:"Optical", vendor:"Thorlabs", manufacturer:"Thorlabs", cost:42.00, lead:21, origin:"US", status:"Released", trend:[40,40,41,41,42,42,42], whereUsed:[], totalQty:0, instances:0, material:"Soda Lime Glass", weight:3, dimensions:"Ø25 × 1 mm", customFields:{"Bandwidth":"850±10 nm","Transmission":">90%"}, tags:["filter","ir","optical"], compliance:["RoHS"], freight:3.20, tax:7.70, landedCost:52.90 },
    { id:"lib6", pn:"CB-HDMI-50CM", name:"Cable, HDMI 2.1 50cm Shielded", rev:"—", qty:0, uom:"EA", category:"Cable", vendor:"Belkin", manufacturer:"Belkin", cost:8.40, lead:9, origin:"CN", status:"Released", trend:null, whereUsed:[], totalQty:0, instances:0, material:"PVC/Copper", weight:42, dimensions:"500 mm length", tags:["cable","hdmi"], compliance:["RoHS"], freight:0.60, tax:1.50, landedCost:10.50 },
    { id:"lib7", pn:"EL-MCU-STM32F4", name:"MCU, STM32F407VGT6 (legacy)", rev:"D", qty:0, uom:"EA", category:"Electrical", vendor:"STMicro", manufacturer:"STMicroelectronics", cost:7.20, lead:35, origin:"FR", status:"Deprecated", trend:[8,7.8,7.6,7.4,7.2,7.2,7.2], whereUsed:[], totalQty:0, instances:0, material:"Silicon/LQFP-100", weight:4, dimensions:"14 × 14 mm (LQFP-100)", tags:["mcu","legacy","deprecated"], compliance:["RoHS","REACH"], freight:0.60, tax:1.30, landedCost:9.10 },
    { id:"lib8", pn:"HW-FAS-M3-08-A", name:"Screw, M3×8 Socket Head A2", rev:"—", qty:0, uom:"EA", category:"Hardware", vendor:"Bossard", manufacturer:"Bossard", cost:0.09, lead:5, origin:"DE", status:"Released", trend:null, whereUsed:[], totalQty:0, instances:0, dupOf: "HW-FAS-M3-08", material:"Stainless Steel A2-70", weight:1.3, dimensions:"M3 × 8 mm", tags:["hardware","screw","fastener"], compliance:["RoHS"], freight:0.01, tax:0.02, landedCost:0.12 },
  ];
  libraryOnly.forEach(p => map.set(p.pn, p));

  return Array.from(map.values());
}

// Duplicate detection (simplified: by name similarity)
function detectDuplicates(parts) {
  const groups = [];
  // Hard-coded one duplicate group for demo
  const a = parts.find(p => p.pn === "HW-FAS-M3-08");
  const b = parts.find(p => p.pn === "HW-FAS-M3-08-A");
  if (a && b) groups.push({ similarity: 0.95, parts: [a, b], reason: "Name + dimensions match" });

  const c = parts.find(p => p.pn === "EL-MCU-STM32F4");
  const d = parts.find(p => p.pn === "EL-MCU-STM32H7");
  if (c && d) groups.push({ similarity: 0.62, parts: [c, d], reason: "Same family, different generation" });

  return groups;
}

function PartsScreen({ openModal, onOpenDetail }) {
  const data = window.BOM_DATA;
  const allParts = React.useMemo(() => buildCatalog(data), []);
  const dupGroups = React.useMemo(() => detectDuplicates(allParts), [allParts]);

  // Filters
  const [search, setSearch] = React.useState("");
  const [view, setView] = React.useState("grid"); // grid | list
  const [sort, setSort] = React.useState("name");
  const [selectedCats, setSelectedCats] = React.useState(new Set());
  const [selectedStatus, setSelectedStatus] = React.useState(new Set());
  const [selectedOrigins, setSelectedOrigins] = React.useState(new Set());
  const [selectedVendors, setSelectedVendors] = React.useState(new Set());
  const [showOnlyUnused, setShowOnlyUnused] = React.useState(false);
  const [showDupsBanner, setShowDupsBanner] = React.useState(true);
  const [selectedIds, setSelectedIds] = React.useState(new Set());
  const [focusedDup, setFocusedDup] = React.useState(null);

  // Build category counts
  const counts = React.useMemo(() => {
    const c = { cat: {}, status: {}, origin: {}, vendor: {} };
    allParts.forEach(p => {
      c.cat[p.category] = (c.cat[p.category] || 0) + 1;
      c.status[p.status] = (c.status[p.status] || 0) + 1;
      c.origin[p.origin] = (c.origin[p.origin] || 0) + 1;
      c.vendor[p.vendor] = (c.vendor[p.vendor] || 0) + 1;
    });
    return c;
  }, [allParts]);

  const allCats = Object.keys(counts.cat).sort();
  const allStatuses = ["Released", "Approved", "Review", "Draft", "Deprecated", "Obsolete"].filter(s => counts.status[s]);
  const allOrigins = Object.keys(counts.origin).filter(o => o !== "—").sort();
  const topVendors = Object.entries(counts.vendor).filter(([k]) => k !== "—").sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k]) => k);

  const toggleSet = (set, val, setter) => {
    const next = new Set(set);
    next.has(val) ? next.delete(val) : next.add(val);
    setter(next);
  };

  const filtered = React.useMemo(() => {
    let list = allParts.filter(p => {
      if (search && !((p.pn + " " + p.name + " " + p.vendor).toLowerCase().includes(search.toLowerCase()))) return false;
      if (selectedCats.size && !selectedCats.has(p.category)) return false;
      if (selectedStatus.size && !selectedStatus.has(p.status)) return false;
      if (selectedOrigins.size && !selectedOrigins.has(p.origin)) return false;
      if (selectedVendors.size && !selectedVendors.has(p.vendor)) return false;
      if (showOnlyUnused && p.instances > 0) return false;
      return true;
    });
    list.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "pn") return a.pn.localeCompare(b.pn);
      if (sort === "cost") return (b.cost || 0) - (a.cost || 0);
      if (sort === "lead") return (b.lead || 0) - (a.lead || 0);
      if (sort === "used") return b.instances - a.instances;
      return 0;
    });
    return list;
  }, [allParts, search, selectedCats, selectedStatus, selectedOrigins, selectedVendors, showOnlyUnused, sort]);

  const clearAll = () => {
    setSearch(""); setSelectedCats(new Set()); setSelectedStatus(new Set()); setSelectedOrigins(new Set()); setSelectedVendors(new Set()); setShowOnlyUnused(false);
  };
  const totalFilters = selectedCats.size + selectedStatus.size + selectedOrigins.size + selectedVendors.size + (showOnlyUnused ? 1 : 0) + (search ? 1 : 0);

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map(p => p.pn)));
  };

  return (
    <div className="parts-page" data-screen-label="Components">
      {/* Top bar */}
      <div className="parts-topbar">
        <div>
          <h1 style={{margin: 0, fontSize: 20, fontWeight: 600, letterSpacing: "-0.01em"}}>Component Library</h1>
          <div style={{fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)", marginTop: 2}}>
            {filtered.length} of {allParts.length} parts · {Object.keys(counts.cat).length} categories · {Object.keys(counts.vendor).length - 1} vendors
          </div>
        </div>
        <div style={{flex: 1}}/>
        <div className="search" style={{width: 280, height: 30}}>
          <Icon.Search size={12}/>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search PN, name, vendor…"/>
          {search && <button className="icon-btn" style={{width:18, height:18, border:"none", background:"transparent"}} onClick={() => setSearch("")}><Icon.X size={10}/></button>}
        </div>
        <div className="segctl">
          <button className={view === "grid" ? "active" : ""} onClick={() => setView("grid")}>GRID</button>
          <button className={view === "list" ? "active" : ""} onClick={() => setView("list")}>LIST</button>
        </div>
        <window.DropdownButton
          width={180}
          trigger={<button className="btn">Sort: {({name:"Name",pn:"PN",cost:"Cost",lead:"Lead",used:"Usage"})[sort]} <Icon.ChevronDown size={10}/></button>}
          items={[
            { label: "Name A-Z", icon: sort === "name" ? <Icon.Check size={11}/> : <span style={{width:11}}/>, onClick: () => setSort("name") },
            { label: "Part No.", icon: sort === "pn" ? <Icon.Check size={11}/> : <span style={{width:11}}/>, onClick: () => setSort("pn") },
            { label: "Cost (high → low)", icon: sort === "cost" ? <Icon.Check size={11}/> : <span style={{width:11}}/>, onClick: () => setSort("cost") },
            { label: "Lead time", icon: sort === "lead" ? <Icon.Check size={11}/> : <span style={{width:11}}/>, onClick: () => setSort("lead") },
            { label: "Where-used count", icon: sort === "used" ? <Icon.Check size={11}/> : <span style={{width:11}}/>, onClick: () => setSort("used") },
          ]}
        />
        <button className="btn" onClick={() => openModal("barcode-scan", { onFound: (pn) => setSearch(pn) })}>
          <Icon.Scan size={12}/> Scan
        </button>
        <button className="btn primary" onClick={() => openModal("new-part")}><Icon.Plus size={12}/> New part</button>
      </div>

      {/* Duplicate banner */}
      {showDupsBanner && dupGroups.length > 0 && (
        <div className="dup-banner">
          <span className="ico"><Icon.Sparkles size={14}/></span>
          <div>
            <strong>{dupGroups.length} potential duplicates detected</strong>
            <span style={{color: "var(--fg-3)", marginLeft: 8, fontSize: 11, fontFamily: "var(--font-mono)"}}>
              {dupGroups.map(g => g.parts[0].pn + " ≈ " + g.parts[1].pn).join(" · ")}
            </span>
          </div>
          <div style={{flex: 1}}/>
          <button className="btn small" onClick={() => setFocusedDup(dupGroups[0])}>Review</button>
          <button className="icon-btn" style={{width: 22, height: 22, border: "none", background: "transparent"}} onClick={() => setShowDupsBanner(false)}><Icon.X size={11}/></button>
        </div>
      )}

      <div className="parts-body">
        {/* Left facets */}
        <aside className="parts-facets">
          <div className="facet-section">
            <div className="facet-h">
              <span>Filters</span>
              {totalFilters > 0 && <button onClick={clearAll}>Clear ({totalFilters})</button>}
            </div>
          </div>

          <div className="facet-section">
            <div className="facet-h"><span>Category</span></div>
            {allCats.map(c => (
              <label key={c} className="facet-row">
                <input type="checkbox" checked={selectedCats.has(c)} onChange={() => toggleSet(selectedCats, c, setSelectedCats)}/>
                <span className={"cat " + c.toLowerCase()} style={{padding: "1px 4px", fontSize: 9}}>{c}</span>
                <span className="cnt">{counts.cat[c]}</span>
              </label>
            ))}
          </div>

          <div className="facet-section">
            <div className="facet-h"><span>Status</span></div>
            {allStatuses.map(s => (
              <label key={s} className="facet-row">
                <input type="checkbox" checked={selectedStatus.has(s)} onChange={() => toggleSet(selectedStatus, s, setSelectedStatus)}/>
                <span className={"status " + (STATUS_CLASS[s] || "")}>{s}</span>
                <span className="cnt">{counts.status[s]}</span>
              </label>
            ))}
          </div>

          <div className="facet-section">
            <div className="facet-h"><span>Origin</span></div>
            {allOrigins.map(o => (
              <label key={o} className="facet-row">
                <input type="checkbox" checked={selectedOrigins.has(o)} onChange={() => toggleSet(selectedOrigins, o, setSelectedOrigins)}/>
                <span style={{fontFamily: "var(--font-mono)", fontSize: 10, padding: "1px 5px", border: "1px solid var(--line)", borderRadius: 2, background: "var(--bg-sunk)"}}>{o}</span>
                <span className="cnt">{counts.origin[o]}</span>
              </label>
            ))}
          </div>

          <div className="facet-section">
            <div className="facet-h"><span>Vendor</span></div>
            {topVendors.map(v => (
              <label key={v} className="facet-row">
                <input type="checkbox" checked={selectedVendors.has(v)} onChange={() => toggleSet(selectedVendors, v, setSelectedVendors)}/>
                <span className="lbl">{v}</span>
                <span className="cnt">{counts.vendor[v]}</span>
              </label>
            ))}
          </div>

          <div className="facet-section">
            <div className="facet-h"><span>Library</span></div>
            <label className="facet-row">
              <input type="checkbox" checked={showOnlyUnused} onChange={e => setShowOnlyUnused(e.target.checked)}/>
              <span className="lbl">Not in any active BOM</span>
            </label>
          </div>
        </aside>

        {/* Main content */}
        <main className="parts-main">
          {selectedIds.size > 0 && (
            <div className="parts-bulk">
              <span className="count">{selectedIds.size} selected</span>
              <button onClick={() => window.toast(`Added ${selectedIds.size} parts to BOM draft`, { kind: "success" })}><Icon.Plus size={12}/> Add to BOM</button>
              <button onClick={() => window.toast(`${selectedIds.size} parts tagged`)}><Icon.Edit size={12}/> Bulk edit</button>
              <button onClick={() => window.toast(`Exporting ${selectedIds.size} parts as CSV…`)}><Icon.Export size={12}/> Export</button>
              <span style={{flex: 1}}/>
              <button onClick={() => window.toast(`${selectedIds.size} parts marked obsolete`, { kind: "warn" })}><Icon.Trash size={12}/> Mark obsolete</button>
              <button className="x" onClick={() => setSelectedIds(new Set())}><Icon.X size={12}/></button>
            </div>
          )}

          {/* Quick chips of active filters */}
          {totalFilters > 0 && (
            <div className="active-filters">
              {search && <span className="chip active" onClick={() => setSearch("")}>“{search}” <Icon.X size={9}/></span>}
              {[...selectedCats].map(c => <span key={c} className="chip active" onClick={() => toggleSet(selectedCats, c, setSelectedCats)}>{c} <Icon.X size={9}/></span>)}
              {[...selectedStatus].map(s => <span key={s} className="chip active" onClick={() => toggleSet(selectedStatus, s, setSelectedStatus)}>{s} <Icon.X size={9}/></span>)}
              {[...selectedOrigins].map(o => <span key={o} className="chip active" onClick={() => toggleSet(selectedOrigins, o, setSelectedOrigins)}>{o} <Icon.X size={9}/></span>)}
              {[...selectedVendors].map(v => <span key={v} className="chip active" onClick={() => toggleSet(selectedVendors, v, setSelectedVendors)}>{v} <Icon.X size={9}/></span>)}
              {showOnlyUnused && <span className="chip active" onClick={() => setShowOnlyUnused(false)}>Unused parts <Icon.X size={9}/></span>}
              <button className="btn small" style={{height: 22, fontSize: 10}} onClick={clearAll}>Clear all</button>
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="empty" style={{padding: 60}}>
              <div className="ico">∅</div>
              <h3>No parts match these filters</h3>
              <p>Try clearing some filters or searching for a different term.</p>
              <button className="btn" onClick={clearAll}>Clear filters</button>
            </div>
          ) : view === "grid" ? (
            <PartsGrid parts={filtered} selectedIds={selectedIds} setSelectedIds={setSelectedIds} onOpenDetail={onOpenDetail} dupGroups={dupGroups}/>
          ) : (
            <PartsList parts={filtered} selectedIds={selectedIds} setSelectedIds={setSelectedIds} onOpenDetail={onOpenDetail} toggleSelectAll={toggleSelectAll} dupGroups={dupGroups}/>
          )}
        </main>
      </div>

      {/* Duplicate review modal */}
      <window.Modal
        open={!!focusedDup}
        onClose={() => setFocusedDup(null)}
        icon={<Icon.Sparkles size={16}/>}
        title="Review potential duplicate"
        subtitle={focusedDup ? `${Math.round(focusedDup.similarity * 100)}% similarity · ${focusedDup.reason}` : ""}
        wide
        footer={
          <>
            <button className="btn" onClick={() => setFocusedDup(null)}>Cancel</button>
            <button className="btn" onClick={() => { window.toast("Marked as not duplicate"); setFocusedDup(null); }}>Not a duplicate</button>
            <button className="btn primary" onClick={() => { window.toast("Parts merged — older PN deprecated", { kind: "success" }); setFocusedDup(null); }}><Icon.Check size={12}/> Merge → keep newer</button>
          </>
        }
      >
        {focusedDup && (
          <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "var(--line)", border: "1px solid var(--line)", borderRadius: "var(--r-2)", overflow: "hidden"}}>
            {focusedDup.parts.map((p, i) => (
              <div key={p.pn} style={{background: "var(--bg)", padding: 16}}>
                <div style={{display: "flex", justifyContent: "space-between", alignItems: "baseline"}}>
                  <div style={{fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)"}}>{p.pn} · Rev {p.rev}</div>
                  {i === 0 && <span className="tag-pill" style={{background: "var(--accent-soft)", color: "var(--accent)", borderColor: "var(--accent)"}}>NEWER</span>}
                </div>
                <h4 style={{margin: "4px 0 12px", fontSize: 14}}>{p.name}</h4>
                <dl className="kv-grid" style={{gridTemplateColumns: "90px 1fr"}}>
                  <dt>Category</dt><dd className="sans"><span className={"cat " + p.category.toLowerCase()}>{p.category}</span></dd>
                  <dt>Vendor</dt><dd className="sans">{p.vendor}</dd>
                  <dt>Cost</dt><dd>{window.INR(p.cost, 2)}</dd>
                  <dt>Lead</dt><dd>{p.lead} days</dd>
                  <dt>Origin</dt><dd>{p.origin}</dd>
                  <dt>Status</dt><dd className="sans"><span className={"status " + (STATUS_CLASS[p.status] || "")}>{p.status}</span></dd>
                  <dt>Used in</dt><dd>{p.instances} BOM{p.instances !== 1 ? "s" : ""}</dd>
                </dl>
              </div>
            ))}
          </div>
        )}
      </window.Modal>
    </div>
  );
}

// ============ Grid view ============
function PartsGrid({ parts, selectedIds, setSelectedIds, onOpenDetail, dupGroups }) {
  const dupSet = new Set(dupGroups.flatMap(g => g.parts.map(p => p.pn)));
  return (
    <div className="parts-grid">
      {parts.map(p => {
        const isSel = selectedIds.has(p.pn);
        const isDup = dupSet.has(p.pn);
        return (
          <div key={p.pn} className={"part-card " + (isSel ? "selected" : "")}>
              <div className="part-card-thumb" data-pn={p.pn}>
                <input
                  type="checkbox" className="row-checkbox"
                  checked={isSel}
                  onChange={() => {
                    const next = new Set(selectedIds);
                    next.has(p.pn) ? next.delete(p.pn) : next.add(p.pn);
                    setSelectedIds(next);
                  }}
                  style={{position: "absolute", top: 6, left: 6, zIndex: 2}}
                  onClick={(e) => e.stopPropagation()}
                />
                {isDup && (
                  <span style={{position:"absolute", top: 6, right: 6, fontFamily:"var(--font-mono)", fontSize: 9, padding:"1px 5px", background:"var(--warn)", color:"white", borderRadius: 2, letterSpacing: "0.06em"}}>
                    DUP
                  </span>
                )}
                {p.imageUrl ? (
                  <img src={p.imageUrl} alt={p.pn} style={{width:"100%", height:"100%", objectFit:"cover"}}/>
                ) : (
                  <div className="thumb-pattern"/>
                )}
                <div className="thumb-label">{p.pn}</div>
              </div>
            <div className="part-card-body" onClick={() => onOpenDetail(p)} style={{cursor: "pointer"}}>
              <div className="part-name">{p.name}</div>
              <div className="part-meta">
                <span className={"cat " + p.category.toLowerCase()}>{p.category}</span>
                <span className={"status " + (STATUS_CLASS[p.status] || "")}>{p.status}</span>
              </div>
              <dl className="part-kv">
                <dt>Vendor</dt><dd>{p.vendor}</dd>
                <dt>Cost</dt><dd>{window.INR(p.cost, 2)} <span style={{color: "var(--fg-3)"}}>/{p.uom}</span></dd>
                <dt>Lead</dt><dd>{p.lead ? p.lead + "d" : "—"}</dd>
                <dt>Origin</dt><dd>{p.origin}</dd>
              </dl>
              <div className="part-foot">
                <span style={{fontFamily: "var(--font-mono)", fontSize: 10, color: p.instances === 0 ? "var(--fg-4)" : "var(--fg-3)"}}>
                  {p.instances === 0 ? "Library only" : p.instances === 1 ? "Used in 1 BOM" : `Used in ${p.instances} BOMs`}
                </span>
                <Sparkline data={p.trend}/>
              </div>
            </div>
            <div className="part-card-actions" onClick={(e) => e.stopPropagation()}>
              <button className="icon-btn" style={{width: 22, height: 22}} onClick={() => onOpenDetail(p)} title="Open detail"><Icon.Chevron size={11}/></button>
              <window.DropdownButton
                width={200}
                trigger={<button className="icon-btn" style={{width: 22, height: 22}}><Icon.Dots size={11}/></button>}
                items={[
                  { icon: <Icon.Chevron size={11}/>, label: "Open detail", onClick: () => onOpenDetail(p) },
                  { icon: <Icon.Plus size={11}/>, label: "Add to BOM", onClick: () => window.toast(p.pn + " added to BOM") },
                  { icon: <Icon.Cart size={11}/>, label: "Add to PO draft", onClick: () => window.toast(p.pn + " added to draft PO") },
                  { icon: <Icon.Search size={11}/>, label: "Find alternates", onClick: () => window.toast("Searching alternates for " + p.pn) },
                  "divider",
                  { icon: <Icon.Edit size={11}/>, label: "Edit", onClick: () => onOpenDetail(p) },
                  { icon: <Icon.Trash size={11}/>, label: "Mark obsolete", danger: true, onClick: () => window.toast(p.pn + " marked obsolete", { kind: "warn" }) },
                ]}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============ List view ============
function PartsList({ parts, selectedIds, setSelectedIds, onOpenDetail, toggleSelectAll, dupGroups }) {
  const dupSet = new Set(dupGroups.flatMap(g => g.parts.map(p => p.pn)));
  const allSelected = parts.length > 0 && parts.every(p => selectedIds.has(p.pn));
  const someSelected = !allSelected && parts.some(p => selectedIds.has(p.pn));
  return (
    <div style={{border: "1px solid var(--line)", borderRadius: "var(--r-3)", overflow: "hidden", background: "var(--bg)"}}>
      <table className="bom-table" style={{tableLayout: "auto"}}>
        <thead>
          <tr>
            <th className="col-check"><input type="checkbox" className={"row-checkbox " + (someSelected ? "indeterminate" : "")} checked={allSelected} onChange={toggleSelectAll}/></th>
            <th style={{width: 32}}></th>
            <th>Part No.</th>
            <th>Name</th>
            <th>Category</th>
            <th>Vendor</th>
            <th className="num">Unit</th>
            <th>Lead</th>
            <th>Origin</th>
            <th>Status</th>
            <th>Used in</th>
            <th>Trend</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {parts.map(p => {
            const isSel = selectedIds.has(p.pn);
            const isDup = dupSet.has(p.pn);
            return (
              <tr key={p.pn} className={isSel ? "selected" : ""} onClick={() => onOpenDetail(p)} style={{cursor:"pointer"}}>
                <td className="col-check" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox" className="row-checkbox" checked={isSel}
                    onChange={() => {
                      const next = new Set(selectedIds);
                      next.has(p.pn) ? next.delete(p.pn) : next.add(p.pn);
                      setSelectedIds(next);
                    }}
                  />
                </td>
                <td style={{width: 32, padding: "2px 4px"}}>
                  {p.imageUrl ? (
                    <img src={p.imageUrl} alt="" style={{width: 28, height: 28, borderRadius: 4, objectFit: "cover", display: "block"}}/>
                  ) : (
                    <span style={{display:"inline-block", width: 28, height: 28, borderRadius: 4, background: "var(--bg-sunk)"}}/>
                  )}
                </td>
                <td className="mono">
                  <span style={{display:"inline-flex", alignItems:"center", gap: 6}}>
                    {p.pn}
                    {isDup && <span style={{fontFamily:"var(--font-mono)", fontSize: 8, padding:"0 3px", background:"var(--warn)", color:"white", borderRadius: 2, letterSpacing: "0.06em"}}>DUP</span>}
                  </span>
                </td>
                <td>{p.name}</td>
                <td><span className={"cat " + p.category.toLowerCase()}>{p.category}</span></td>
                <td>{p.vendor}</td>
                <td className="num mono">{window.INR(p.cost, 2)}</td>
                <td><LeadHeat days={p.lead}/></td>
                <td className="mono">{p.origin}</td>
                <td><span className={"status " + (STATUS_CLASS[p.status] || "")}>{p.status}</span></td>
                <td className="mono" style={{color: p.instances === 0 ? "var(--fg-4)" : "var(--fg-2)"}}>
                  {p.instances === 0 ? "—" : `${p.instances} BOM${p.instances === 1 ? "" : "s"}`}
                </td>
                <td><Sparkline data={p.trend}/></td>
                <td onClick={(e) => e.stopPropagation()}>
                  <span style={{display: "inline-flex", gap: 2}}>
                    <button className="icon-btn" style={{width: 22, height: 22, opacity: 0.6}} onClick={() => onOpenDetail(p)}><Icon.Chevron size={11}/></button>
                    <window.DropdownButton
                      width={200}
                      trigger={<button className="icon-btn" style={{width: 22, height: 22}}><Icon.Dots size={11}/></button>}
                      items={[
                        { icon: <Icon.Plus size={11}/>, label: "Add to BOM", onClick: () => window.toast(p.pn + " added to BOM") },
                        { icon: <Icon.Cart size={11}/>, label: "Add to PO draft", onClick: () => window.toast(p.pn + " added to draft PO") },
                        { icon: <Icon.Search size={11}/>, label: "Find alternates", onClick: () => window.toast("Searching alternates for " + p.pn) },
                        "divider",
                        { icon: <Icon.Trash size={11}/>, label: "Mark obsolete", danger: true, onClick: () => window.toast(p.pn + " marked obsolete", { kind: "warn" }) },
                      ]}
                    />
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

window.PartsScreen = PartsScreen;
