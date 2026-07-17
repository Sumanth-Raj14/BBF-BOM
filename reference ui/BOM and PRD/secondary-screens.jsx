// Secondary screens: Vendors, Procurement, Documents, OCR, Analytics, Activity, Diff

// ============ VENDORS ============
function VendorsScreen({ data, openModal }) {
  const ctx = window.useAppStore();
  const vendors = ctx?.vendors || data.vendors;
  const setVendors = ctx?.setVendors || (() => {});
  const [riskFilter, setRiskFilter] = React.useState("All");
  const [vSearch, setVSearch] = React.useState("");

  const filtered = vendors.filter(v => {
    if (riskFilter !== "All" && v.risk !== riskFilter) return false;
    if (vSearch && !v.name.toLowerCase().includes(vSearch.toLowerCase())) return false;
    return true;
  });

  const togglePreferred = (id) => {
    const next = vendors.map(v => v.id === id ? { ...v, preferred: !v.preferred } : v);
    setVendors(next);
    const v = vendors.find(x => x.id === id);
    window.toast(v.name + (v.preferred ? " · unmarked preferred" : " · marked preferred"), { kind: "success" });
  };
  const toggleActive = (id) => {
    const next = vendors.map(v => v.id === id ? { ...v, active: v.active === false ? true : false } : v);
    setVendors(next);
    const v = vendors.find(x => x.id === id);
    window.toast(v.name + " " + (v.active === false ? "reactivated" : "deactivated"), { kind: "warn" });
  };

  return (
    <div className="screen-wrap">
      <div className="screen-header">
        <div>
          <h1>Vendors</h1>
          <div className="sub">{vendors.length} vendors \u00B7 {new Set(vendors.map(v => v.country)).size} countries \u00B7 {vendors.filter(v => v.preferred).length} preferred</div>
        </div>
        <div style={{display:"flex", gap: 8}}>
          <div className="search" style={{width: 220, height: 32}}>
            <Icon.Search size={12}/>
            <input value={vSearch} onChange={e => setVSearch(e.target.value)} placeholder="Filter vendors…"/>
          </div>
          <window.DropdownButton
            width={180}
            trigger={<button className="btn"><Icon.Filter size={12}/> Risk: {riskFilter} <Icon.ChevronDown size={10}/></button>}
            items={["All","Low","Med","High"].map(r => ({
              icon: r === riskFilter ? <Icon.Check size={11}/> : <span style={{width: 11}}/>,
              label: r === "All" ? "All risks" : r + " risk",
              onClick: () => setRiskFilter(r),
            }))}
          />
          <button className="btn primary" onClick={() => openModal("new-vendor")}><Icon.Plus size={12}/> New vendor</button>
          <window.DropdownButton width={200} trigger={<button className="icon-btn" style={{width: 30, height: 30, marginLeft: -4}}><Icon.Dots size={12}/></button>} items={[
            { icon: <Icon.Import size={11}/>, label: "Bulk import (CSV)", onClick: () => (ctx?.openModal || (() => {}))("bulk-vendor-import") },
            { icon: <Icon.Export size={11}/>, label: "Export all", onClick: () => window.toast("Exported vendors.csv", { kind: "success" }) },
          ]}/>
        </div>
      </div>

      <div className="card" style={{overflow: "visible"}}>
        <table className="bom-table" style={{tableLayout: "auto"}}>
          <thead>
            <tr>
              <th style={{paddingLeft: 16}}>Vendor</th>
              <th>Country</th>
              <th>Terms</th>
              <th>Rating</th>
              <th>Lead</th>
              <th className="num">MOQ</th>
              <th className="num">Parts</th>
              <th>Risk</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={10} style={{padding: 40, textAlign: "center"}}>
                  <div style={{color: "var(--fg-3)", fontSize: 13, marginBottom: 8}}>{vSearch || riskFilter !== "All" ? "No vendors match your filters" : "No vendors yet"}</div>
                  {!vSearch && riskFilter === "All" && (
                    <button className="btn primary" onClick={() => openModal("new-vendor")}><Icon.Plus size={12}/> Add first vendor</button>
                  )}
                </td>
              </tr>
            ) : filtered.map(v => (
              <tr key={v.id} onClick={() => (ctx || {openModal}).openModal?.("vendor-detail", v)} style={{cursor:"pointer", opacity: v.active === false ? 0.5 : 1}}>
                <td style={{paddingLeft: 16}}>
                  <div style={{display: "flex", alignItems: "center", gap: 8}}>
                    <span style={{
                      width: 22, height: 22,
                      borderRadius: 4,
                      background: "var(--bg-sunk)",
                      border: "1px solid var(--line)",
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 600, color: "var(--fg-2)",
                    }}>{v.name.split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase()}</span>
                    <div>
                      <div style={{fontWeight: 600, fontSize: 13}}>{v.name}</div>
                      {v.preferred && <div style={{fontFamily:"var(--font-mono)", fontSize: 9, color:"var(--accent)", letterSpacing:"0.08em"}}>PREFERRED</div>}
                    </div>
                  </div>
                </td>
                <td className="mono">{v.country}</td>
                <td className="mono" style={{color:"var(--fg-2)"}}>{v.terms}</td>
                <td className="mono"><span style={{color:"var(--accent)"}}>★</span> {v.rating}</td>
                <td><LeadHeat days={v.lead}/></td>
                <td className="num">{v.moq}</td>
                <td className="num">{v.parts}</td>
                <td>
                  <span className={"status " + (v.risk === "Low" ? "released" : v.risk === "Med" ? "review" : "deprecated")}>{v.risk}</span>
                </td>
                <td>
                  <span className={"status " + (v.active === false ? "deprecated" : "released")}>{v.active === false ? "Inactive" : "Active"}</span>
                </td>
                <td onClick={(e) => e.stopPropagation()}>
                  <window.DropdownButton
                    width={200}
                    trigger={<button className="icon-btn" style={{width:22, height:22}}><Icon.Dots size={12}/></button>}
                    items={[
                      { icon: <Icon.Chevron size={11}/>, label: "Open vendor", onClick: () => (ctx?.openModal || openModal)?.("vendor-detail", v) },
                      { icon: <Icon.Cart size={11}/>, label: "Send RFQ", onClick: () => (ctx?.openModal || openModal)?.("send-rfq", { pn: "RFQ-" + v.id.toUpperCase(), name: "Multi-part RFQ", cost: 10, lead: v.lead, origin: v.country, vendor: v.name }) },
                      { icon: <Icon.Doc size={11}/>, label: "Quote history", onClick: () => (ctx?.openModal || openModal)?.("quote-history", v) },
                      "divider",
                      { icon: <Icon.Flag size={11}/>, label: v.preferred ? "Unmark preferred" : "Mark preferred", onClick: () => togglePreferred(v.id) },
                      { icon: v.active === false ? <Icon.Check size={11}/> : <Icon.Trash size={11}/>, label: v.active === false ? "Reactivate" : "Deactivate", danger: v.active !== false, onClick: () => toggleActive(v.id) },
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============ PROCUREMENT ============
function ProcurementScreen({ data, openModal }) {
  const ctx = window.useAppStore();
  const [poData, setPoData] = React.useState([]);
  const [stats, setStats] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [expandedRow, setExpandedRow] = React.useState(null);
  const [statusFilter, setStatusFilter] = React.useState("All");
  const [projectFilter, setProjectFilter] = React.useState("All");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [sortField, setSortField] = React.useState("poDate");
  const [sortDir, setSortDir] = React.useState("desc");

  // Load PO data from API
  React.useEffect(() => {
    setLoading(true);
    Promise.all([
      window.poOrdersAPI?.list({ limit: 200 }),
      window.poOrdersAPI?.stats(),
    ]).then(([listResult, statsResult]) => {
      if (listResult && listResult.items) setPoData(listResult.items);
      if (statsResult) setStats(statsResult);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // Normalize status for filtering
  const normalizeStatus = (s) => {
    if (!s) return "Unknown";
    if (s.startsWith("Consignment Received")) return "Received";
    if (s.startsWith("All Consignments")) return "Received";
    if (s.startsWith("Order Placed")) return "Order Placed";
    if (s.startsWith("Payment Completed")) return "Completed";
    if (s.startsWith("Order Cancelled")) return "Cancelled";
    if (s.startsWith("50% Advance")) return "Advance Paid";
    if (s === "Completed") return "Completed";
    return s;
  };

  // Get unique values for filters
  const statuses = React.useMemo(() => {
    const set = new Set(poData.map(p => normalizeStatus(p.status)));
    return ["All", ...Array.from(set).sort()];
  }, [poData]);

  const projects = React.useMemo(() => {
    const set = new Set(poData.filter(p => p.project).map(p => p.project));
    return ["All", ...Array.from(set).sort()];
  }, [poData]);

  // Filter and sort
  const filteredPOs = React.useMemo(() => {
    let result = poData;

    if (statusFilter !== "All") {
      result = result.filter(p => normalizeStatus(p.status) === statusFilter);
    }
    if (projectFilter !== "All") {
      result = result.filter(p => p.project === projectFilter);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(p =>
        p.poNumber.toLowerCase().includes(q) ||
        p.vendorName.toLowerCase().includes(q) ||
        (p.project && p.project.toLowerCase().includes(q))
      );
    }

    // Sort
    result.sort((a, b) => {
      let va = a[sortField] || "";
      let vb = b[sortField] || "";
      if (sortField === "poTotal") { va = Number(va); vb = Number(vb); }
      if (sortField === "poDate") { va = va || ""; vb = vb || ""; }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [poData, statusFilter, projectFilter, searchQuery, sortField, sortDir]);

  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const toggleExpand = (id) => {
    setExpandedRow(expandedRow === id ? null : id);
  };

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <Icon.ChevronDown size={8} style={{opacity: 0.3}}/>;
    return <Icon.ChevronDown size={8} style={{transform: sortDir === "asc" ? "rotate(180deg)" : "none", transition: "transform 0.15s"}}/>;
  };

  // Summary stats
  const totalValue = filteredPOs.reduce((s, p) => s + (p.poTotal || 0), 0);
  const totalItems = filteredPOs.reduce((s, p) => s + (p.items?.length || 0), 0);

  // Status color
  const statusColor = (s) => {
    const n = normalizeStatus(s);
    if (n === "Received") return "released";
    if (n === "Completed") return "released";
    if (n === "Order Placed") return "approved";
    if (n === "Cancelled") return "deprecated";
    if (n === "Advance Paid") return "review";
    return "draft";
  };

  return (
    <div className="screen-wrap">
      <div className="screen-header">
        <div>
          <h1>Purchase Orders</h1>
          <div className="sub">{loading ? "Loading..." : `${filteredPOs.length} orders \u00B7 ${totalItems} items \u00B7 ${window.INR(totalValue, 0)} total`}</div>
        </div>
        <div style={{display:"flex", gap: 8}}>
          <div className="search" style={{width: 220, height: 32}}>
            <Icon.Search size={12}/>
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search POs..."/>
          </div>
          <window.DropdownButton
            width={180}
            trigger={<button className="btn"><Icon.Filter size={12}/> Status: {statusFilter} <Icon.ChevronDown size={10}/></button>}
            items={statuses.map(s => ({
              icon: statusFilter === s ? <Icon.Check size={11}/> : <span style={{width:11}}/>,
              label: s,
              onClick: () => setStatusFilter(s),
            }))}
          />
          <window.DropdownButton
            width={200}
            trigger={<button className="btn"><Icon.Folder size={12}/> Project: {projectFilter === "All" ? "All" : projectFilter.slice(0, 20)} <Icon.ChevronDown size={10}/></button>}
            items={projects.map(p => ({
              icon: projectFilter === p ? <Icon.Check size={11}/> : <span style={{width:11}}/>,
              label: p === "All" ? "All projects" : p,
              onClick: () => setProjectFilter(p),
            }))}
          />
          <button className="btn" onClick={() => openModal("import-rfqs")}><Icon.Import size={12}/> Import</button>
        </div>
      </div>

      {/* Summary KPIs */}
      {stats && (
        <div className="kpi-grid" style={{gridTemplateColumns: "repeat(4, 1fr)", marginBottom: 14}}>
          <div className="kpi"><div className="l">Total POs</div><div className="v">{stats.totalPOs}</div></div>
          <div className="kpi"><div className="l">Total Value</div><div className="v" style={{color: "var(--accent)"}}>{window.INR(stats.totalValue, 0)}</div></div>
          <div className="kpi"><div className="l">Total Line Items</div><div className="v">{stats.totalItems}</div></div>
          <div className="kpi"><div className="l">Unique Vendors</div><div className="v">{Object.keys(stats.byVendor || {}).length}</div></div>
        </div>
      )}

      {/* PO Table with Expandable Rows */}
      <div className="card" style={{overflow: "visible"}}>
        <table className="bom-table" style={{tableLayout: "auto"}}>
          <thead>
            <tr>
              <th style={{width: 30, paddingLeft: 16}}></th>
              <th style={{cursor: "pointer"}} onClick={() => toggleSort("poDate")}>Date <SortIcon field="poDate"/></th>
              <th style={{cursor: "pointer"}} onClick={() => toggleSort("poNumber")}>PO Number <SortIcon field="poNumber"/></th>
              <th style={{cursor: "pointer"}} onClick={() => toggleSort("vendorName")}>Vendor <SortIcon field="vendorName"/></th>
              <th>Project</th>
              <th>Items</th>
              <th className="num" style={{cursor: "pointer"}} onClick={() => toggleSort("poTotal")}>PO Total <SortIcon field="poTotal"/></th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{textAlign: "center", padding: 40}}><span className="spinner"/> Loading purchase orders...</td></tr>
            ) : filteredPOs.length === 0 ? (
              <tr><td colSpan={8} style={{textAlign: "center", padding: 40, color: "var(--fg-3)"}}>No purchase orders match your filters</td></tr>
            ) : filteredPOs.map(po => {
              const isExpanded = expandedRow === po.id;
              return (
                <React.Fragment key={po.id}>
                  <tr
                    onClick={() => toggleExpand(po.id)}
                    style={{cursor: "pointer", background: isExpanded ? "var(--accent-soft)" : undefined}}
                  >
                    <td style={{paddingLeft: 16, width: 30}}>
                      <span style={{display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, borderRadius: 4, background: "var(--bg-sunk)", transition: "transform 0.15s", transform: isExpanded ? "rotate(90deg)" : "none"}}>
                        <Icon.Chevron size={10}/>
                      </span>
                    </td>
                    <td className="mono" style={{fontSize: 11}}>{po.poDate || "\u2014"}</td>
                    <td className="mono" style={{fontWeight: 600, fontSize: 12}}>{po.poNumber}</td>
                    <td>
                      <div style={{fontWeight: 500, fontSize: 12, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"}}>{po.vendorName}</div>
                    </td>
                    <td>
                      {po.project ? <span className="tag-pill" style={{fontSize: 9}}>{po.project.length > 25 ? po.project.slice(0, 25) + "\u2026" : po.project}</span> : <span style={{color: "var(--fg-4)"}}>\u2014</span>}
                    </td>
                    <td className="mono" style={{fontSize: 11}}>{po.items?.length || 0}</td>
                    <td className="num mono" style={{fontWeight: 700, fontSize: 13}}>{window.INR(po.poTotal, 0)}</td>
                    <td><span className={"status " + statusColor(po.status)} style={{fontSize: 9, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "inline-block"}} title={po.status}>{normalizeStatus(po.status)}</span></td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={8} style={{padding: 0, background: "var(--bg-sunk)"}}>
                        <div style={{padding: "12px 16px 12px 46px"}}>
                          <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8}}>
                            <div style={{fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-3)"}}>
                              Line Items \u00B7 {po.items?.length || 0} items
                            </div>
                            <div style={{display: "flex", gap: 6}}>
                              <button className="btn small" onClick={(e) => { e.stopPropagation(); window.toast("Exported " + po.poNumber, { kind: "success" }); }}><Icon.Export size={10}/> Export</button>
                              <button className="btn small" onClick={(e) => { e.stopPropagation(); window.routeSetter ? window.routeSetter("order-tracking") : window.toast("Go to Order Tracking screen"); }}><Icon.Cart size={10}/> Track Order</button>
                              <button className="btn small" onClick={(e) => { e.stopPropagation(); window.toast("Viewing vendor scorecard for " + po.vendorName); }}><Icon.Chart size={10}/> Vendor scorecard</button>
                            </div>
                          </div>
                          {po.items && po.items.length > 0 ? (
                            <table className="bom-table" style={{tableLayout: "auto", background: "var(--bg)", border: "1px solid var(--line)", borderRadius: "var(--r-2)"}}>
                              <thead>
                                <tr>
                                  <th style={{paddingLeft: 12, fontSize: 9}}>Item Name</th>
                                  <th style={{fontSize: 9}}>Description</th>
                                  <th className="num" style={{fontSize: 9}}>Qty</th>
                                  <th className="num" style={{fontSize: 9}}>Unit Price</th>
                                  <th className="num" style={{fontSize: 9}}>Amount</th>
                                  <th className="num" style={{fontSize: 9}}>GST</th>
                                  <th className="num" style={{fontSize: 9}}>Total</th>
                                </tr>
                              </thead>
                              <tbody>
                                {po.items.map((item, idx) => (
                                  <tr key={idx}>
                                    <td style={{paddingLeft: 12}}>
                                      <span style={{fontWeight: 500, fontSize: 11, color: "var(--accent)", cursor: "pointer"}} onClick={(e) => { e.stopPropagation(); window.toast("Opening component: " + item.itemName.slice(0, 40)); }}>
                                        {item.itemName.length > 50 ? item.itemName.slice(0, 50) + "\u2026" : item.itemName}
                                      </span>
                                    </td>
                                    <td style={{fontSize: 10, color: "var(--fg-3)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"}}>{item.itemDesc || "\u2014"}</td>
                                    <td className="num mono" style={{fontSize: 11}}>{item.quantity}</td>
                                    <td className="num mono" style={{fontSize: 11}}>{window.INR(item.itemPrice, 2)}</td>
                                    <td className="num mono" style={{fontSize: 11}}>{window.INR(item.amount, 2)}</td>
                                    <td className="num mono" style={{fontSize: 11, color: "var(--fg-3)"}}>{window.INR(item.gst, 2)}</td>
                                    <td className="num mono" style={{fontSize: 12, fontWeight: 600}}>{window.INR(item.total, 2)}</td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr style={{background: "var(--bg-elev)"}}>
                                  <td colSpan={2} style={{paddingLeft: 12, fontWeight: 600, fontSize: 11}}>PO Total</td>
                                  <td></td>
                                  <td></td>
                                  <td className="num mono" style={{fontSize: 11, fontWeight: 600}}>
                                    {window.INR(po.items.reduce((s, i) => s + (i.amount || 0), 0), 2)}
                                  </td>
                                  <td className="num mono" style={{fontSize: 11, fontWeight: 600}}>
                                    {window.INR(po.items.reduce((s, i) => s + (i.gst || 0), 0), 2)}
                                  </td>
                                  <td className="num mono" style={{fontSize: 12, fontWeight: 700, color: "var(--accent)"}}>
                                    {window.INR(po.items.reduce((s, i) => s + (i.total || 0), 0), 2)}
                                  </td>
                                </tr>
                              </tfoot>
                            </table>
                          ) : (
                            <div style={{padding: 16, textAlign: "center", color: "var(--fg-3)", fontSize: 11}}>No line items for this PO</div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============ DOCUMENTS ============
function DocumentsScreen({ data, openModal, perms }) {
  const ctx = window.useAppStore();
  const tags = ["All", "Datasheet", "Drawing", "CAD", "Quote", "Compliance", "Test"];
  const [tag, setTag] = React.useState("All");
  const [sort, setSort] = React.useState("Recent");
  const [selectedFolder, setSelectedFolder] = React.useState(null);
  const [showTree, setShowTree] = React.useState(true);
  const [apiDocs, setApiDocs] = React.useState(null);
  const [apiFolders, setApiFolders] = React.useState(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    setLoading(true);
    Promise.all([
      window.api?.documents?.list?.() || Promise.resolve(null),
      window.api?.documents?.folders?.() || Promise.resolve(null),
    ]).then(([docs, folders]) => {
      if (docs && docs.length) setApiDocs(docs);
      if (folders && folders.length) setApiFolders(folders);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const mockFolders = React.useMemo(() => [
    { path: "/", label: "All Documents", icon: "\uD83D\uDCC1", count: 182, children: [
      { path: "/Electrical", label: "Electrical", icon: "\u26A1", count: 48, children: [
        { path: "/Electrical/Datasheets", label: "Datasheets", icon: "\uD83D\uDCC4", count: 22 },
        { path: "/Electrical/Schematics", label: "Schematics", icon: "\uD83D\uDCD0", count: 14 },
        { path: "/Electrical/CAD Models", label: "CAD Models", icon: "\uD83E\uDDCA", count: 12 },
      ]},
      { path: "/Mechanical", label: "Mechanical", icon: "\u2699", count: 36, children: [
        { path: "/Mechanical/Drawings", label: "Drawings", icon: "\uD83D\uDCD0", count: 18 },
        { path: "/Mechanical/CAD", label: "CAD", icon: "\uD83E\uDDCA", count: 10 },
        { path: "/Mechanical/Specs", label: "Specs", icon: "\uD83D\uDCC4", count: 8 },
      ]},
      { path: "/Procurement", label: "Procurement", icon: "\uD83D\uDCE6", count: 41, children: [
        { path: "/Procurement/Quotes", label: "Quotes", icon: "\uD83D\uDCB0", count: 28 },
        { path: "/Procurement/POs", label: "POs", icon: "\uD83D\uDCCB", count: 13 },
      ]},
      { path: "/Compliance", label: "Compliance", icon: "\u2705", count: 29, children: [
        { path: "/Compliance/RoHS", label: "RoHS", icon: "\u267B", count: 15 },
        { path: "/Compliance/REACH", label: "REACH", icon: "\uD83E\uDDEA", count: 10 },
        { path: "/Compliance/Conflict Minerals", label: "Conflict Minerals", icon: "\u26CF", count: 4 },
      ]},
      { path: "/Software", label: "Software", icon: "\uD83D\uDCBE", count: 18, children: [
        { path: "/Software/Firmware", label: "Firmware", icon: "\uD83D\uDD0C", count: 10 },
        { path: "/Software/Drivers", label: "Drivers", icon: "\uD83D\uDDA5", count: 5 },
        { path: "/Software/Tools", label: "Tools", icon: "\uD83D\uDD27", count: 3 },
      ]},
      { path: "/Test", label: "Test Reports", icon: "\uD83D\uDCCA", count: 10 },
    ]},
  ], []);

  const folders = apiFolders && apiFolders.length ? (() => {
    const byPath = {};
    apiFolders.forEach(f => { byPath[f.path] = { ...f, children: [] }; });
    apiFolders.forEach(f => {
      if (f.path !== "/") {
        const parts = f.path.split("/").slice(0, -1);
        const parentPath = parts.length > 1 ? parts.join("/") : "/";
        if (byPath[parentPath]) byPath[parentPath].children.push(byPath[f.path]);
      }
    });
    return byPath["/"] ? [byPath["/"]] : mockFolders;
  })() : mockFolders;

  const folderTagMap = {
    "/Electrical/Datasheets": "Datasheet",
    "/Electrical/Schematics": "Drawing",
    "/Electrical/CAD Models": "CAD",
    "/Mechanical/Drawings": "Drawing",
    "/Mechanical/CAD": "CAD",
    "/Mechanical/Specs": "Datasheet",
    "/Procurement/Quotes": "Quote",
    "/Procurement/POs": "Quote",
    "/Compliance/RoHS": "Compliance",
    "/Compliance/REACH": "Compliance",
    "/Compliance/Conflict Minerals": "Compliance",
    "/Software/Firmware": "Test",
    "/Software/Drivers": "Test",
    "/Software/Tools": "Test",
    "/Test": "Test",
  };

  const sourceDocs = React.useMemo(() => {
    if (apiDocs && apiDocs.length) {
      return apiDocs.map(d => ({
        id: d.id,
        name: d.originalName,
        tag: d.category || "Other",
        ext: (d.fileType || "").toUpperCase(),
        size: d.fileSize ? (d.fileSize < 1024 * 1024 ? (d.fileSize / 1024).toFixed(1) + " KB" : (d.fileSize / (1024 * 1024)).toFixed(1) + " MB") : "—",
        updated: d.updatedAt ? new Date(d.updatedAt).toLocaleDateString() : new Date(d.createdAt).toLocaleDateString(),
        icon: "📄",
        apiId: d.id,
        version: d.version,
        accessLevel: d.accessLevel,
      }));
    }
    return data.docs;
  }, [apiDocs, data.docs]);

  const filtered = sourceDocs.filter(d => {
    if (tag !== "All" && d.tag !== tag) return false;
    if (selectedFolder && selectedFolder.path !== "/") {
      const folderTag = folderTagMap[selectedFolder.path];
      if (folderTag && d.tag !== folderTag) return false;
    }
    return true;
  }).sort((a, b) => {
    if (sort === "Name A-Z") return a.name.localeCompare(b.name);
    if (sort === "Size") {
      const parseSize = (s) => {
        if (!s || s === "\u2014") return 0;
        const m = s.match(/([\d.]+)\s*(KB|MB|GB)?/i);
        if (!m) return 0;
        const n = parseFloat(m[1]);
        const u = (m[2] || "KB").toUpperCase();
        return n * (u === "GB" ? 1024 * 1024 : u === "MB" ? 1024 : 1);
      };
      return parseSize(b.size) - parseSize(a.size);
    }
    if (sort === "Type") return (a.ext || "").localeCompare(b.ext || "");
    return (b.updated || "").localeCompare(a.updated || "");
  });

  return (
    <div className="screen-wrap" style={{display: "flex", flexDirection: "column", height: "100%"}}>
      <div className="screen-header">
        <div>
          <h1>Documents</h1>
          <div className="sub">{loading ? "Loading..." : `${filtered.length} files`}{selectedFolder && selectedFolder.path !== "/" ? ` \u00B7 ${selectedFolder.label}` : ""}</div>
        </div>
        <div style={{display:"flex", gap: 8}}>
          <button className="btn" onClick={() => setShowTree(!showTree)} style={{color: showTree ? "var(--accent)" : "var(--fg-3)"}}><Icon.Folder size={12}/> Folders</button>
          <window.DropdownButton
            width={180}
            trigger={<button className="btn">{sort} <Icon.ChevronDown size={10}/></button>}
            items={["Recent","Name A-Z","Size","Type"].map(s => ({
              icon: s === sort ? <Icon.Check size={11}/> : <span style={{width:11}}/>,
              label: s,
              onClick: () => setSort(s),
            }))}
          />
          <button className="btn primary" onClick={() => openModal("upload")}><Icon.Import size={12}/> Upload</button>
        </div>
      </div>
      <div style={{display:"flex", gap: 8, marginBottom: 14, flexWrap: "wrap"}}>
        {tags.map(t => (
          <span key={t} className={"chip " + (t === tag ? "active" : "")} onClick={() => setTag(t)} style={{cursor:"pointer"}}>{t}</span>
        ))}
      </div>
      <div style={{display: "flex", flex: 1, minHeight: 0, gap: 14}}>
        {showTree && (
          <div className="card" style={{width: 220, flexShrink: 0, overflow: "auto", padding: 8}}>
            <window.DocumentFolderTree folders={folders} onSelect={setSelectedFolder} selected={selectedFolder}/>
          </div>
        )}
        <div className="doc-grid" style={{flex: 1}}>
          {filtered.length === 0 ? (
            <div style={{gridColumn: "1 / -1", padding: 60, textAlign: "center", color: "var(--fg-3)"}}>
              <div style={{fontSize: 32, fontFamily: "var(--font-mono)", marginBottom: 6}}>∅</div>
              <div>No documents in this view</div>
            </div>
          ) : filtered.map((d, i) => (
            <div key={i} className="doc-card" onClick={() => (ctx || {openModal}).openModal?.("doc-preview", d)} style={{cursor: "pointer"}}>
              <div className="doc-thumb" data-ext={d.ext} data-icon={d.icon}/>
              <div className="doc-meta">
                <div className="nm" style={{fontFamily:"var(--font-mono)", fontSize: 11}}>{d.name}</div>
                <div className="sub" style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
                  <span>{d.tag} · {d.size} · {d.updated}</span>
                  <span onClick={(e) => e.stopPropagation()}>
                    <window.DropdownButton
                      width={180}
                      align="right"
                      trigger={<button className="icon-btn" style={{width:18, height:18, border:"none", background:"transparent"}}><Icon.Dots size={11}/></button>}
                      items={[
                        { label: "Open", icon: <Icon.Chevron size={11}/>, onClick: () => (ctx || {openModal}).openModal?.("doc-preview", d) },
                        { label: "Download", icon: <Icon.Export size={11}/>, onClick: () => window.toast("Downloaded " + d.name, { kind: "success" }) },
                        { label: "Copy link", icon: <Icon.Link size={11}/>, onClick: () => window.toast("Link copied") },
                        "divider",
                        ...(perms?.canDelete ? [{ label: "Delete", icon: <Icon.Trash size={11}/>, danger: true, onClick: () => window.toast(d.name + " deleted", { kind: "warn" }) }] : []),
                      ]}
                    />
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============ OCR ============
function OCRScreen() {
  const ctx = window.useAppStore();
  const [extracted, setExtracted] = React.useState([]);
  const [editing, setEditing] = React.useState(null);
  const [reextracting, setReextracting] = React.useState(false);
  const [confirmed, setConfirmed] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [docId, setDocId] = React.useState(null);
  const [partPn, setPartPn] = React.useState(null);

  const runExtraction = React.useCallback((documentId, partId) => {
    setLoading(true);
    (window.api?.ocr?.extract?.(documentId, partId) || Promise.resolve(null))
      .then(data => {
        if (data && data.fields) {
          setExtracted(data.fields.map(f => ({ label: f.label, value: f.value, conf: f.confidence })));
          setDocId(data.documentId);
          setPartPn(data.partPn);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    runExtraction(null, null);
  }, []);

  const reextract = () => {
    setReextracting(true);
    runExtraction(docId, null);
    setTimeout(() => setReextracting(false), 1100);
  };

  const confirm = () => {
    setConfirmed(true);
    if (ctx?.setNotifications) {
      ctx.setNotifications([
        { id: Date.now(), who: "System", init: "\u230C", color: "sys", action: "OCR applied to", obj: partPn || "part", time: "just now", read: false, route: "bom" },
        ...ctx.notifications,
      ]);
    }
    window.toast(`${extracted.length} fields applied to part ${partPn || "part"} \u00B7 audit logged`, { kind: "success", action: { label: "Open part", onClick: () => window.__nav?.("bom") } });
    setTimeout(() => setConfirmed(false), 1500);
  };

  const updateField = (i, value) => {
    const next = [...extracted];
    next[i] = { ...next[i], value, conf: Math.max(next[i].conf, 0.99) };
    setExtracted(next);
  };

  return (
    <div className="screen-wrap">
      <div className="screen-header">
        <div>
          <h1>Datasheet OCR</h1>
          <div className="sub">{loading ? "Extracting..." : `${extracted.length} fields \u00B7 ${extracted.filter(e => e.conf >= 0.9).length} high confidence`}{partPn ? ` \u00B7 ${partPn}` : ""}</div>
        </div>
        <div style={{display:"flex", gap: 8}}>
          <button className="btn" onClick={reextract} disabled={reextracting}>
            {reextracting ? <><span className="spinner"/> Re-extracting…</> : <><Icon.Sparkles size={12}/> Re-extract</>}
          </button>
          <button className="btn primary" onClick={confirm}><Icon.Check size={12}/> Confirm & Apply</button>
        </div>
      </div>

      <div className="ocr-grid" style={{minHeight: 520}}>
        <div className="ocr-doc">
          <div className="ocr-text">
{`STM32H743VIT6
HIGH-PERFORMANCE MCU WITH ARM CORTEX-M7

Manufacturer: `}<span className="hl" data-tag="Manufacturer">STMicroelectronics</span>{`
Package:      `}<span className="hl" data-tag="Package">LQFP-100, 14×14mm</span>{`

OVERVIEW
The `}<span className="hl" data-tag="Part No.">STM32H743VIT6</span>{` is a 32-bit
high-performance microcontroller based on the
`}<span className="hl" data-tag="Core">Arm® Cortex®-M7 core running at 480 MHz</span>{`,
delivering up to 1027 DMIPS / 2400 CoreMark®.

MEMORY
• `}<span className="hl" data-tag="Flash">2 MB Flash memory</span>{` (dual-bank)
• `}<span className="hl" data-tag="RAM">1 MB SRAM</span>{` (with ECC)
• External memory interface

ELECTRICAL CHARACTERISTICS
Operating voltage:  1.62 V – 3.6 V
Operating temp:     `}<span className="hl" data-tag="Op. Temp">−40 °C to +85 °C</span>{`
Power consumption:  280 µA / MHz typ.

COMPLIANCE
RoHS: `}<span className="hl" data-tag="RoHS">Compliant per Directive 2011/65/EU</span>{`
REACH: Compliant`}
          </div>
        </div>

        <div>
          <div className="section-title" style={{marginTop: 0}}>Extracted Fields</div>
          <div className="extract-list">
            {extracted.map((e, i) => {
              const level = e.conf >= 0.9 ? "" : e.conf >= 0.7 ? "med" : "low";
              const isEd = editing === i;
              return (
                <div key={i} className={"extract-row " + (confirmed ? "flash-ok" : "")}>
                  <div className="l">{e.label}</div>
                  <div>
                    {isEd ? (
                      <input
                        className="input mono"
                        style={{height: 24, fontSize: 11, padding: "0 6px"}}
                        autoFocus
                        defaultValue={e.value}
                        onBlur={(ev) => { updateField(i, ev.target.value); setEditing(null); }}
                        onKeyDown={(ev) => {
                          if (ev.key === "Enter") { updateField(i, ev.target.value); setEditing(null); }
                          if (ev.key === "Escape") setEditing(null);
                        }}
                      />
                    ) : (
                      <div className="v">{e.value}</div>
                    )}
                    <div className={"conf-bar " + level}><div style={{width: (e.conf * 100) + "%"}}/></div>
                  </div>
                  <div className="conf" style={{color: e.conf >= 0.9 ? "var(--ok)" : e.conf >= 0.7 ? "var(--warn)" : "var(--danger)"}}>
                    {Math.round(e.conf * 100)}%
                  </div>
                  <button className="icon-btn" style={{width:22, height:22}} title="Edit" onClick={() => setEditing(isEd ? null : i)}><Icon.Edit size={11}/></button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============ ANALYTICS ============
function AnalyticsScreen({ data }) {
  const ctx = window.useAppStore();
  const [range, setRange] = React.useState("6 mo");
  const [apiData, setApiData] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [exporting, setExporting] = React.useState(null);

  // Load analytics from API on mount
  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      window.analyticsAPI?.dashboard(),
      window.analyticsAPI?.categories(),
    ]).then(([dash, cats]) => {
      if (!cancelled) {
        setApiData({ dashboard: dash, categories: cats });
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  // Range-dependent data
  const rangeData = {
    "1 mo":   { months: ["W1","W2","W3","W4"], costs: [4126,4150,4180,4218], delta: "+2.2%" },
    "3 mo":   { months: ["Mar","Apr","May"], costs: [4040,4126,4218], delta: "+4.4%" },
    "6 mo":   { months: ["Dec","Jan","Feb","Mar","Apr","May"], costs: [3820,3905,3960,4040,4126,4218], delta: "+10.4%" },
    "1 yr":   { months: ["Jun","Aug","Oct","Dec","Feb","Apr"], costs: [3650,3720,3780,3820,3960,4218], delta: "+15.6%" },
    "All time": { months: ["2024","Q3'24","Q4'24","2025","Q1'25","Q2'25","Q3'25","Q4'25","Q1'26","2026"], costs: [3200,3340,3480,3520,3650,3780,3820,3960,4126,4218], delta: "+31.8%" },
  };
  const { months, costs, delta } = rangeData[range] || rangeData["6 mo"];

  const baseKpis = [
    { l: "Total Parts", v: apiData?.dashboard?.totalParts?.toLocaleString() || "1,284", d: "+12", up: false },
    { l: "Active BOMs", v: apiData?.dashboard?.totalPOs?.toString() || "23", d: "+2", up: false },
    { l: "Current BOM Cost", v: window.INR(costs[costs.length - 1], 0), d: delta, up: true },
    { l: "Avg Lead", v: "21d", d: range === "1 mo" ? "+1d" : "+3d", up: true },
    { l: "Preferred Vendors", v: "8 / " + (apiData?.dashboard?.totalVendors || 14), d: "—", up: false },
    { l: "Country Risk", v: "Med", d: "3 high", up: true },
    { l: "Duplicates Flagged", v: "5", d: "\u22122", up: false },
    { l: "On-time PO Rate", v: range === "All time" ? "89%" : "94%", d: range === "All time" ? "\u22123.4%" : "+1.2%", up: range === "All time" },
  ];

  const max = Math.max(...costs), min = Math.min(...costs);

  return (
    <div className="screen-wrap">
      <div className="screen-header">
        <div>
          <h1>Analytics</h1>
          <div className="sub">Project ATLAS · Last {range}</div>
        </div>
        <div style={{display:"flex", gap: 8}}>
          <window.DropdownButton
            width={160}
            trigger={<button className="btn">{range} <Icon.ChevronDown size={10}/></button>}
            items={["1 mo","3 mo","6 mo","1 yr","All time"].map(r => ({
              icon: r === range ? <Icon.Check size={11}/> : <span style={{width:11}}/>,
              label: r,
              onClick: () => setRange(r),
            }))}
          />
          <button className="btn" onClick={() => ctx?.openModal("price-alerts")}><Icon.Chart size={12}/> Price alerts</button>
          <button className="btn" onClick={() => ctx?.openModal("inflation")}><Icon.Chart size={12}/> Inflation</button>
          <window.DropdownButton
            width={180}
            trigger={<button className="btn"><Icon.Export size={12}/> Export <Icon.ChevronDown size={10}/></button>}
            items={[
              { icon: <Icon.Doc size={11}/>, label: "PDF report", onClick: () => { window.toast("Generating PDF…"); setTimeout(() => { window.downloadBlob && window.downloadBlob("Analytics report (mock PDF)\nProject ATLAS · " + range + "\n\nPeriod: " + months[0] + " – " + months[months.length - 1] + "\nCurrent BOM: " + window.INR(costs[costs.length - 1], 0) + "\nDelta: " + delta + "\n\nCharts and KPI data included.", "analytics_report.pdf", "application/pdf"); window.toast("Downloaded analytics_report.pdf", { kind: "success" }); }, 800); } },
              { icon: <Icon.Doc size={11}/>, label: "PNG charts", onClick: () => {
                window.toast("Generating chart image…");
                setTimeout(() => {
                  const c = document.createElement("canvas"); c.width = 800; c.height = 360;
                  const cx = c.getContext("2d"); if (!cx) { window.toast("PNG export not available", { kind: "warn" }); return; }
                  const pad = { t: 30, r: 20, b: 40, l: 60 };
                  const w = c.width - pad.l - pad.r, h = c.height - pad.t - pad.b;
                  const cRange = Math.max(...costs) - Math.min(...costs) || 1;
                  const cMin = Math.min(...costs);
                  cx.fillStyle = "#fff"; cx.fillRect(0, 0, c.width, c.height);
                  cx.strokeStyle = "#e0e0e0"; cx.lineWidth = 0.5;
                  for (let i = 0; i < 4; i++) { const y = pad.t + (i / 3) * h; cx.beginPath(); cx.moveTo(pad.l, y); cx.lineTo(pad.l + w, y); cx.stroke(); }
                  cx.fillStyle = "#666"; cx.font = "10px monospace"; cx.textAlign = "right";
                  [cMin, (cMin + Math.max(...costs)) / 2, Math.max(...costs)].forEach((v, i) => { cx.fillText("₹" + ((v * 83) / 100000).toFixed(1) + "L", pad.l - 6, pad.t + (i / 2) * h + 4); });
                  cx.strokeStyle = "#6366f1"; cx.lineWidth = 2;
                  const pts = costs.map((v, i) => ({ x: pad.l + (i / (costs.length - 1)) * w, y: pad.t + (1 - (v - cMin) / cRange) * h }));
                  cx.beginPath(); pts.forEach((p, i) => { i === 0 ? cx.moveTo(p.x, p.y) : cx.lineTo(p.x, p.y); }); cx.stroke();
                  pts.forEach((p, i) => { cx.fillStyle = "#6366f1"; cx.beginPath(); cx.arc(p.x, p.y, 3, 0, Math.PI * 2); cx.fill(); });
                  cx.fillStyle = "#999"; cx.font = "9px monospace"; cx.textAlign = "center";
                  months.forEach((m, i) => { cx.fillText(m, pts[i].x, c.height - pad.b + 16); });
                  cx.fillStyle = "#222"; cx.font = "bold 12px sans-serif"; cx.textAlign = "left";
                  cx.fillText("BOM Cost Trend · " + range, pad.l, 18);
                  c.toBlob(blob => { if (blob) { window.downloadBlob && window.downloadBlob(blob, "analytics_charts.png", "image/png"); window.toast("Downloaded analytics_charts.png", { kind: "success" }); } });
                }, 200);
              }},
              { icon: <Icon.Doc size={11}/>, label: "CSV data", onClick: () => { window.downloadBlob && window.downloadBlob("month,cost_usd\n" + months.map((m, i) => m + "," + costs[i]).join("\n"), "analytics_" + range.replace(" ", "_") + ".csv", "text/csv"); window.toast("CSV downloaded", { kind: "success" }); } },
            ]}
          />
        </div>
      </div>

      <div className="kpi-grid" style={{gridTemplateColumns: "repeat(4, 1fr)"}}>
        {baseKpis.map((k, i) => (
          <div key={i} className="kpi">
            <div className="l">{k.l}</div>
            <div className="v">{k.v}</div>
            <div className="d" style={{color: k.d === "—" ? "var(--fg-3)" : k.up ? "var(--danger)" : "var(--ok)"}}>
              {k.up ? "▲" : k.d.startsWith("−") || k.d.startsWith("-") ? "▼" : "•"} {k.d}
            </div>
          </div>
        ))}
      </div>

      <div className="charts-grid">
        <div className="card">
          <div className="card-h">
            <h3>BOM cost · last {range}</h3>
            <span className="hint">{delta} vs {months[0]}</span>
          </div>
          <div className="trend">
            <svg viewBox="0 0 600 180" style={{width: "100%", height: 180}}>
              {[0, 1, 2, 3].map(i => (
                <line key={i} x1="40" x2="590" y1={20 + i * 40} y2={20 + i * 40} stroke="var(--line-soft)" strokeWidth="1"/>
              ))}
              {[max, (max+min)/2, min].map((v, i) => (
                <text key={i} x="32" y={24 + i * 60} textAnchor="end" fontSize="9" fontFamily="var(--font-mono)" fill="var(--fg-3)">₹{((v * 83) / 100000).toFixed(1)}L</text>
              ))}
              {(() => {
                const w = 550, h = 140, pad = 20;
                const x0 = 40;
                const range = max - min || 1;
                const pts = costs.map((v, i) => {
                  const x = x0 + (i / (costs.length - 1)) * w;
                  const y = pad + (1 - (v - min) / range) * (h - pad);
                  return [x, y];
                });
                const linePath = pts.map((p, i) => (i === 0 ? "M" : "L") + p[0] + " " + p[1]).join(" ");
                const areaPath = linePath + ` L ${pts[pts.length-1][0]} ${pad+h} L ${pts[0][0]} ${pad+h} Z`;
                return (
                  <>
                    <path d={areaPath} fill="var(--accent-soft)" opacity="0.6"/>
                    <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth="2"/>
                    {pts.map((p, i) => (
                      <g key={i}>
                        <circle cx={p[0]} cy={p[1]} r={i === pts.length - 1 ? 4 : 2.5} fill="var(--accent)"/>
                        <text x={p[0]} y={170} textAnchor="middle" fontSize="9" fontFamily="var(--font-mono)" fill="var(--fg-3)">{months[i]}</text>
                      </g>
                    ))}
                  </>
                );
              })()}
            </svg>
          </div>
        </div>

        <div className="card">
          <div className="card-h"><h3>Cost by category</h3></div>
          <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: 12}}>
            <div>
              <svg viewBox="0 0 100 100" style={{width: "100%", maxWidth: 160, display: "block", margin: "0 auto"}}>
                {(() => {
                  const cats = [
                    { l: "Electrical", v: 38, c: "oklch(0.55 0.13 240)" },
                    { l: "Optical", v: 24, c: "oklch(0.55 0.13 320)" },
                    { l: "Mechanical", v: 19, c: "oklch(0.55 0.08 60)" },
                    { l: "Cable", v: 11, c: "oklch(0.55 0.10 280)" },
                    { l: "Hardware", v: 5, c: "oklch(0.55 0.10 145)" },
                    { l: "Other", v: 3, c: "var(--fg-3)" },
                  ];
                  const total = cats.reduce((s, c) => s + c.v, 0);
                  const r = 38, cx = 50, cy = 50;
                  let cum = 0;
                  return cats.map((c, i) => {
                    const a1 = (cum / total) * 360;
                    cum += c.v;
                    const a2 = (cum / total) * 360;
                    const toRad = (d) => (d - 90) * Math.PI / 180;
                    const x1 = cx + r * Math.cos(toRad(a1));
                    const y1 = cy + r * Math.sin(toRad(a1));
                    const x2 = cx + r * Math.cos(toRad(a2));
                    const y2 = cy + r * Math.sin(toRad(a2));
                    const large = (a2 - a1) > 180 ? 1 : 0;
                    const d = `M${cx} ${cy} L${x1.toFixed(1)} ${y1.toFixed(1)} A${r} ${r} 0 ${large} 1 ${x2.toFixed(1)} ${y2.toFixed(1)} Z`;
                    return <path key={i} d={d} fill={c.c} stroke="var(--bg)" strokeWidth="0.5"/>;
                  });
                })()}
                <circle cx="50" cy="50" r="18" fill="var(--bg)"/>
                <text x="50" y="47" textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--fg)">₹{(4218.40 * 83 / 100000).toFixed(1)}L</text>
                <text x="50" y="58" textAnchor="middle" fontSize="5" fill="var(--fg-3)">Total BOM</text>
              </svg>
            </div>
            <div style={{display: "flex", flexDirection: "column", justifyContent: "center", gap: 6}}>
              {[
                { l: "Electrical", v: 38, c: "oklch(0.55 0.13 240)" },
                { l: "Optical", v: 24, c: "oklch(0.55 0.13 320)" },
                { l: "Mechanical", v: 19, c: "oklch(0.55 0.08 60)" },
                { l: "Cable", v: 11, c: "oklch(0.55 0.10 280)" },
                { l: "Hardware", v: 5, c: "oklch(0.55 0.10 145)" },
                { l: "Other", v: 3, c: "var(--fg-3)" },
              ].map(c => (
                <div key={c.l} style={{display:"flex", alignItems:"center", gap: 6, fontFamily:"var(--font-mono)", fontSize: 10}}>
                  <span style={{width: 8, height: 8, borderRadius: 2, background: c.c, flexShrink: 0}}/>
                  <span style={{flex:1}}>{c.l}</span>
                  <span style={{fontWeight: 600}}>{c.v}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="charts-grid">
        <div className="card">
          <div className="card-h"><h3>Vendor scorecards · top 6</h3></div>
          <div style={{padding: 4}}>
            <table className="bom-table" style={{tableLayout: "auto"}}>
              <thead>
                <tr>
                  <th style={{paddingLeft: 12}}>Vendor</th>
                  <th className="num">On-time</th>
                  <th className="num">Quality</th>
                  <th className="num">Cost</th>
                  <th className="num">Lead</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["McMaster", 99, 99, 92, 95, "A+"],
                  ["Noctua", 96, 98, 88, 87, "A"],
                  ["Panasonic", 94, 96, 85, 78, "A"],
                  ["Mean Well", 92, 95, 90, 75, "A"],
                  ["Protolabs", 89, 94, 82, 92, "B+"],
                  ["Daly", 71, 82, 95, 60, "C"],
                ].map((r, i) => (
                  <tr key={i} onClick={() => window.__nav?.("vendors")} style={{cursor:"pointer"}}>
                    <td style={{paddingLeft: 12, fontWeight: 600}}>{r[0]}</td>
                    {[1,2,3,4].map(j => (
                      <td key={j} className="num">
                        <span style={{display:"inline-flex", alignItems:"center", gap: 6}}>
                          <span style={{display:"inline-block", width: 28, height: 4, borderRadius: 2, background: "var(--bg-sunk)", position: "relative", overflow: "hidden"}}>
                            <span style={{position:"absolute", inset: 0, width: r[j] + "%", background: r[j] >= 90 ? "var(--ok)" : r[j] >= 75 ? "var(--warn)" : "var(--danger)"}}/>
                          </span>
                          {r[j]}
                        </span>
                      </td>
                    ))}
                    <td>
                      <span style={{fontFamily: "var(--font-mono)", fontWeight: 700, color: r[5].startsWith("A") ? "var(--ok)" : r[5].startsWith("B") ? "var(--warn)" : "var(--danger)"}}>{r[5]}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-h"><h3>Country dependency</h3></div>
          <div style={{padding: 16}}>
            {[
              { c: "US", n: "United States", pct: 42 },
              { c: "CN", n: "China", pct: 24 },
              { c: "JP", n: "Japan", pct: 12 },
              { c: "TW", n: "Taiwan", pct: 10 },
              { c: "FR", n: "France", pct: 8 },
              { c: "AT", n: "Austria", pct: 4 },
            ].map(c => (
              <div key={c.c} style={{display:"grid", gridTemplateColumns:"36px 1fr 50px", gap:8, alignItems:"center", marginBottom: 6, fontSize: 11, fontFamily: "var(--font-mono)"}}>
                <span style={{width: 28, height: 18, borderRadius: 2, background: "var(--bg-sunk)", border: "1px solid var(--line)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 600, color: "var(--fg)"}}>{c.c}</span>
                <span style={{color: "var(--fg-2)"}}>{c.n}</span>
                <span style={{textAlign:"right", color: "var(--fg)"}}>{c.pct}%</span>
                <span/>
                <div style={{height: 4, background: "var(--bg-sunk)", borderRadius: 2, overflow:"hidden", gridColumn: "2 / 4"}}>
                  <div style={{height:"100%", width: c.pct + "%", background: "var(--accent)"}}/>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="charts-grid">
        <div className="card">
          <div className="card-h"><h3>Vendor × Lead time heat map</h3></div>
          <div style={{padding: 12, overflowX: "auto"}}>
            {(() => {
              const rows = [
                { v: "McMaster", cats: { "Electrical": 2, "Mechanical": 3, "Hardware": 22, "Cable": 0, "Optical": 0 } },
                { v: "Protolabs", cats: { "Electrical": 0, "Mechanical": 14, "Hardware": 0, "Cable": 0, "Optical": 0 } },
                { v: "STMicro", cats: { "Electrical": 4, "Mechanical": 0, "Hardware": 0, "Cable": 0, "Optical": 0 } },
                { v: "JLCPCB", cats: { "Electrical": 6, "Mechanical": 0, "Hardware": 0, "Cable": 0, "Optical": 0 } },
                { v: "Mean Well", cats: { "Electrical": 8, "Mechanical": 0, "Hardware": 0, "Cable": 0, "Optical": 0 } },
                { v: "Panasonic", cats: { "Electrical": 5, "Mechanical": 0, "Hardware": 0, "Cable": 0, "Optical": 0 } },
                { v: "Edmund", cats: { "Electrical": 0, "Mechanical": 0, "Hardware": 0, "Cable": 0, "Optical": 3 } },
                { v: "Arducam", cats: { "Electrical": 0, "Mechanical": 0, "Hardware": 0, "Cable": 0, "Optical": 2 } },
                { v: "Noctua", cats: { "Electrical": 3, "Mechanical": 0, "Hardware": 0, "Cable": 0, "Optical": 0 } },
              ];
              const catKeys = ["Electrical", "Mechanical", "Hardware", "Cable", "Optical"];
              const maxVal = Math.max(...rows.flatMap(r => catKeys.map(k => r.cats[k])));
              return (
                <div style={{minWidth: 520}}>
                  <div style={{display:"grid", gridTemplateColumns: "100px repeat(" + catKeys.length + ", 1fr)", gap: 2, fontFamily:"var(--font-mono)", fontSize: 9}}>
                    <div style={{padding: "4px 6px", color: "var(--fg-3)"}}>Vendor</div>
                    {catKeys.map(k => <div key={k} style={{padding: "4px 6px", textAlign:"center", color: "var(--fg-3)", fontWeight: 600}}>{k.slice(0, 4)}</div>)}
                    {rows.map(r => (
                      <React.Fragment key={r.v}>
                        <div style={{padding: "4px 6px", fontWeight: 600, fontSize: 10, whiteSpace:"nowrap"}}>{r.v}</div>
                        {catKeys.map(k => {
                          const v = r.cats[k] || 0;
                          const intensity = maxVal > 0 ? v / maxVal : 0;
                          const hue = 240 - intensity * 200;
                          return (
                            <div key={k} style={{
                              padding: "6px 4px", textAlign:"center", borderRadius: 3,
                              background: v > 0 ? `oklch(${0.85 - intensity * 0.45} 0.08 ${hue})` : "var(--bg-sunk)",
                              color: intensity > 0.5 ? "white" : "var(--fg)",
                              fontWeight: v > 0 ? 600 : 400,
                              fontSize: 11,
                            }}>{v > 0 ? v : "—"}</div>
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </div>
                  <div style={{marginTop: 8, display:"flex", alignItems:"center", gap: 4, justifyContent:"center", fontFamily:"var(--font-mono)", fontSize: 9, color:"var(--fg-3)"}}>
                    <span>Low</span>
                    {[0.1,0.25,0.4,0.55,0.7,0.85].map(i => <span key={i} style={{width:14,height:10,borderRadius:2,background:`oklch(${0.85 - i * 0.45} 0.08 ${240 - i * 200})`}}/>)}
                    <span>High</span>
                    <span style={{marginLeft: 12}}>Parts per vendor × category</span>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        <div className="card">
          <div className="card-h"><h3>Procurement aging</h3></div>
          <div style={{padding: 12}}>
            {(() => {
              const data = window.BOM_DATA.procurement;
              const now = new Date();
              const parseETA = (eta) => {
                if (eta === "✓" || eta === "—" || !eta) return null;
                const [m,d] = eta.split("-").map(Number);
                return new Date(2026, m - 1, d);
              };
              const items = [];
              Object.entries(data).forEach(([col, list]) => {
                list.forEach(it => {
                  const etaDate = parseETA(it.eta);
                  if (!etaDate) return;
                  const daysDiff = Math.round((etaDate - now) / (1000 * 60 * 60 * 24));
                  items.push({ ...it, status: col, daysLeft: daysDiff });
                });
              });
              const bands = [
                { label: "Overdue", range: [-Infinity, 0], color: "var(--danger)" },
                { label: "0-7 days", range: [1, 7], color: "var(--warn)" },
                { label: "8-14 days", range: [8, 14], color: "var(--info)" },
                { label: "15-30 days", range: [15, 30], color: "var(--accent)" },
                { label: "30+ days", range: [31, Infinity], color: "var(--ok)" },
              ];
              const bandCounts = bands.map(b => ({
                ...b,
                count: items.filter(it => it.daysLeft >= b.range[0] && it.daysLeft <= b.range[1]).length,
              }));
              const maxCount = Math.max(...bandCounts.map(b => b.count), 1);
              return (
                <>
                  <div style={{display: "flex", flexDirection: "column", gap: 8}}>
                    {bandCounts.map(b => (
                      <div key={b.label} style={{display:"grid", gridTemplateColumns: "70px 1fr 40px", gap: 8, alignItems:"center", fontFamily:"var(--font-mono)", fontSize: 11}}>
                        <span style={{color: b.color, fontWeight: 600}}>{b.label}</span>
                        <div style={{height: 12, background: "var(--bg-sunk)", borderRadius: 3, overflow:"hidden"}}>
                          <div style={{height:"100%", width: (b.count / maxCount * 100) + "%", background: b.color, borderRadius: 3, transition: "width 0.3s"}}/>
                        </div>
                        <span style={{textAlign:"right", fontWeight: 600}}>{b.count}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{marginTop: 10, padding: "8px 10px", background: "var(--bg-sunk)", border:"1px solid var(--line)", borderRadius:"var(--r-2)", fontSize: 10, fontFamily:"var(--font-mono)", color:"var(--fg-3)"}}>
                    {items.filter(it => it.daysLeft < 0).length} overdue · {items.filter(it => it.daysLeft >= 0 && it.daysLeft <= 7).length} due within 7d
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      </div>

      <div className="charts-grid">
        <div className="card">
          <div className="card-h"><h3>Country of origin — parts</h3></div>
          <div style={{padding: 16}}>
            {(() => {
              const parts = window.BOM_DATA.rows[0].children.flatMap(s => s.children || []);
              const counts = {};
              parts.forEach(p => {
                const c = p.origin || "Unknown";
                counts[c] = (counts[c] || 0) + 1;
              });
              const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
              const total = sorted.reduce((s, [,c]) => s + c, 0);
              const maxCnt = Math.max(...sorted.map(([,c]) => c), 1);
              const flags = { US: "🇺🇸", CN: "🇨🇳", JP: "🇯🇵", TW: "🇹🇼", FR: "🇫🇷", AT: "🇦🇹", DE: "🇩🇪" };
              return (
                <>
                  <div style={{display: "flex", flexDirection: "column", gap: 8}}>
                    {sorted.map(([code, cnt]) => (
                      <div key={code} style={{display:"grid", gridTemplateColumns: "28px 1fr 36px", gap: 8, alignItems:"center", fontFamily:"var(--font-mono)", fontSize: 11}}>
                        <span style={{fontSize: 16}}>{flags[code] || code}</span>
                        <div style={{height: 10, background: "var(--bg-sunk)", borderRadius: 3, overflow:"hidden"}}>
                          <div style={{height:"100%", width: (cnt / maxCnt * 100) + "%", background: "var(--accent)", borderRadius: 3}}/>
                        </div>
                        <span style={{textAlign:"right", fontWeight: 600}}>{cnt}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{marginTop: 10, display:"flex", gap: 10, flexWrap:"wrap", justifyContent:"center", fontFamily:"var(--font-mono)", fontSize: 10, color:"var(--fg-3)"}}>
                    {sorted.map(([code, cnt]) => (
                      <span key={code}>{flags[code] || code} {code} — {Math.round(cnt / total * 100)}%</span>
                    ))}
                  </div>
                </>
              );
            })()}
          </div>
        </div>

        <div className="card">
          <div className="card-h"><h3>Risk by origin</h3></div>
          <div style={{padding: 16}}>
            <svg viewBox="0 0 300 160" style={{width: "100%", height: 160}}>
              {(() => {
                const hmData = [
                  { c: "CN", r: "High", v: 1 },
                  { c: "FR", r: "Med", v: 1 },
                  { c: "TW", r: "Low", v: 2 },
                  { c: "US", r: "Low", v: 9 },
                  { c: "JP", r: "Low", v: 2 },
                  { c: "AT", r: "Low", v: 1 },
                ];
                const risks = ["High", "Med", "Low"];
                const countries = ["CN", "FR", "TW", "US", "JP", "AT"];
                const cellW = 300 / (countries.length + 1);
                const cellH = 160 / (risks.length + 2);
                const maxV = Math.max(...hmData.map(d => d.v), 1);
                return (
                  <>
                    {countries.map((c, i) => (
                      <text key={c} x={cellW * (i + 1) + cellW / 2} y={cellH * 0.6} textAnchor="middle" fontSize="8" fontFamily="var(--font-mono)" fill="var(--fg-3)">{c}</text>
                    ))}
                    {risks.map((r, i) => (
                      <text key={r} x={cellW * 0.5} y={cellH * (i + 1.5)} textAnchor="middle" fontSize="8" fontFamily="var(--font-mono)" fill="var(--fg-3)">{r}</text>
                    ))}
                    {hmData.map((d, i) => {
                      const col = countries.indexOf(d.c);
                      const row = risks.indexOf(d.r);
                      const intensity = d.v / maxV;
                      const hue = row === 0 ? 0 : row === 1 ? 40 : 140;
                      return (
                        <g key={i}>
                          <rect
                            x={cellW * (col + 1) + 2}
                            y={cellH * (row + 1) + 4}
                            width={cellW - 4}
                            height={cellH - 8}
                            rx={3}
                            fill={`oklch(${0.85 - intensity * 0.4} 0.1 ${hue})`}
                          />
                          <text
                            x={cellW * (col + 1) + cellW / 2}
                            y={cellH * (row + 1.5)}
                            textAnchor="middle" fontSize="10"
                            fontFamily="var(--font-mono)"
                            fill={intensity > 0.5 ? "white" : "var(--fg)"}
                            fontWeight={600}
                          >{d.v}</text>
                        </g>
                      );
                    })}
                  </>
                );
              })()}
            </svg>
            <div style={{marginTop: 4, display:"flex", alignItems:"center", gap: 6, justifyContent:"center", fontFamily:"var(--font-mono)", fontSize: 9, color:"var(--fg-3)"}}>
              <span style={{width:10,height:10,borderRadius:2,background:"oklch(0.85 0.1 140)"}}/> Low
              <span style={{width:10,height:10,borderRadius:2,background:"oklch(0.65 0.1 40)"}}/> Med
              <span style={{width:10,height:10,borderRadius:2,background:"oklch(0.45 0.1 0)"}}/> High
              <span style={{marginLeft:8}}>Vendors per country × risk level</span>
            </div>
          </div>
        </div>
      </div>

      <div className="charts-grid">
        <div className="card">
          <div className="card-h">
            <h3>BOM summary report</h3>
            <span className="hint" style={{cursor:"pointer"}} onClick={() => {
              const data = window.BOM_DATA;
              const parts = data.rows[0].children.flatMap(s => s.children || []);
              const totalCost = parts.reduce((s, p) => s + (p.cost || 0) * (p.qty || 0), 0);
              const totalParts = parts.reduce((s, p) => s + (p.qty || 0), 0);
              const catCosts = {};
              parts.forEach(p => {
                const c = p.category || "Other";
                catCosts[c] = (catCosts[c] || 0) + (p.cost || 0) * (p.qty || 0);
              });
              const lines = ["BOM Summary Report", "Project: " + data.project.name + " (" + data.project.code + ")", "Version: " + data.project.version, "Total parts: " + totalParts, "Unique parts: " + parts.length, "Total BOM cost (USD): $" + totalCost.toFixed(2), "Total BOM cost (INR): " + window.INR(totalCost, 2), "", "=== Cost by category ===", ...Object.entries(catCosts).map(([k, v]) => k + ": $" + v.toFixed(2) + " (" + (v / totalCost * 100).toFixed(1) + "%)"), "", "Generated: " + new Date().toISOString().slice(0, 10)];
              window.downloadBlob(lines.join("\n"), "BOM_Summary_Report.txt", "text/plain");
              window.toast("BOM summary report downloaded", { kind: "success" });
            }}><Icon.Export size={11}/> Download report</span>
          </div>
          <div style={{padding: "12px 16px"}}>
            {(() => {
              const parts = window.BOM_DATA.rows[0].children.flatMap(s => s.children || []);
              const totalCost = parts.reduce((s, p) => s + (p.cost || 0) * (p.qty || 0), 0);
              const totalParts = parts.reduce((s, p) => s + (p.qty || 0), 0);
              const unique = parts.length;
              const catCounts = {};
              parts.forEach(p => {
                const c = p.category || "Other";
                catCounts[c] = (catCounts[c] || 0) + 1;
              });
              const catCosts = {};
              parts.forEach(p => {
                const c = p.category || "Other";
                catCosts[c] = (catCosts[c] || 0) + (p.cost || 0) * (p.qty || 0);
              });
              return (
                <div style={{display:"flex", flexDirection:"column", gap: 10}}>
                  <div style={{display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap: 10}}>
                    {[
                      { l:"Total parts", v: totalParts, sub: unique + " unique" },
                      { l:"BOM cost (USD)", v: "$" + totalCost.toFixed(2), sub: window.INR(totalCost, 2) },
                      { l:"Avg unit cost", v: window.INR(totalCost / totalParts, 2), sub: "$" + (totalCost / totalParts).toFixed(2) },
                    ].map(k => (
                      <div key={k.l} style={{padding:"10px 12px", border:"1px solid var(--line)", borderRadius:"var(--r-2)", background:"var(--bg)"}}>
                        <div style={{fontFamily:"var(--font-mono)", fontSize:9, textTransform:"uppercase", letterSpacing:"0.06em", color:"var(--fg-3)"}}>{k.l}</div>
                        <div style={{fontFamily:"var(--font-mono)", fontSize:16, fontWeight:600, margin:"2px 0"}}>{k.v}</div>
                        <div style={{fontFamily:"var(--font-mono)", fontSize:10, color:"var(--fg-3)"}}>{k.sub}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap: 10}}>
                    {[
                      { l:"Risk items", v: parts.filter(p => p.lead > 30).length, sub: "long-lead parts" },
                      { l:"Duplicates", v: parts.filter(p => p.dupOf).length, sub: "potential merges" },
                      { l:"Obsolete", v: parts.filter(p => p.status === "Deprecated" || p.status === "Obsolete").length, sub: "needs review" },
                    ].map(k => (
                      <div key={k.l} style={{padding:"10px 12px", border:"1px solid var(--line)", borderRadius:"var(--r-2)", background:"var(--bg)"}}>
                        <div style={{fontFamily:"var(--font-mono)", fontSize:9, textTransform:"uppercase", letterSpacing:"0.06em", color:"var(--fg-3)"}}>{k.l}</div>
                        <div style={{fontFamily:"var(--font-mono)", fontSize:16, fontWeight:600, margin:"2px 0"}}>{k.v}</div>
                        <div style={{fontFamily:"var(--font-mono)", fontSize:10, color:"var(--fg-3)"}}>{k.sub}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap: 14}}>
                    <div>
                      <div style={{fontFamily:"var(--font-mono)", fontSize:9, textTransform:"uppercase", letterSpacing:"0.06em", color:"var(--fg-3)", marginBottom:6}}>Parts by category</div>
                      {Object.entries(catCounts).map(([k, v]) => (
                        <div key={k} style={{display:"grid", gridTemplateColumns:"80px 1fr 30px", gap:6, alignItems:"center", marginBottom:4, fontFamily:"var(--font-mono)", fontSize:10}}>
                          <span style={{color:"var(--fg-2)"}}>{k}</span>
                          <div style={{height:6, background:"var(--bg-sunk)", borderRadius:3, overflow:"hidden"}}>
                            <div style={{height:"100%", width:(v / unique * 100)+"%", background:"var(--accent)", borderRadius:3}}/>
                          </div>
                          <span style={{textAlign:"right", fontWeight:600}}>{v}</span>
                        </div>
                      ))}
                    </div>
                    <div>
                      <div style={{fontFamily:"var(--font-mono)", fontSize:9, textTransform:"uppercase", letterSpacing:"0.06em", color:"var(--fg-3)", marginBottom:6}}>Cost by category</div>
                      {Object.entries(catCosts).map(([k, v]) => (
                        <div key={k} style={{display:"grid", gridTemplateColumns:"80px 1fr 50px", gap:6, alignItems:"center", marginBottom:4, fontFamily:"var(--font-mono)", fontSize:10}}>
                          <span style={{color:"var(--fg-2)"}}>{k}</span>
                          <div style={{height:6, background:"var(--bg-sunk)", borderRadius:3, overflow:"hidden"}}>
                            <div style={{height:"100%", width:(v / totalCost * 100)+"%", background:"var(--accent)", borderRadius:3}}/>
                          </div>
                          <span style={{textAlign:"right", fontWeight:600}}>{window.INR(v, 0)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <h3>Vendor cost comparison</h3>
            <span className="hint" style={{cursor:"pointer"}} onClick={() => {
              const lines = ["Vendor Cost Comparison", "Date: " + new Date().toISOString().slice(0,10), "", ...window.BOM_DATA.rows[0].children.flatMap(s => s.children || []).filter(p => p.vendorPrices).map(p => {
                return p.pn + " (" + p.name + ")\n  Current: " + p.vendor + " @ $" + p.cost + "\n" + p.vendorPrices.map(vp => "  Alt: " + vp.vendor + " @ $" + vp.cost + " (" + vp.lead + "d lead, MOQ " + vp.moq + ")").join("\n");
              }).join("\n\n"), "", "Generated automatically"];
              window.downloadBlob(lines.join("\n"), "Vendor_Cost_Comparison.txt", "text/plain");
              window.toast("Vendor comparison report downloaded", { kind: "success" });
            }}><Icon.Export size={11}/> Download comparison</span>
          </div>
          <div style={{padding: 12, overflowX: "auto"}}>
            {(() => {
              const parts = window.BOM_DATA.rows[0].children.flatMap(s => s.children || []).filter(p => p.vendorPrices);
              return parts.length === 0 ? (
                <div style={{padding: 24, textAlign:"center", color:"var(--fg-3)", fontFamily:"var(--font-mono)", fontSize: 11}}>No vendor pricing data available</div>
              ) : (
                <table className="bom-table" style={{tableLayout:"auto"}}>
                  <thead>
                    <tr>
                      <th style={{paddingLeft: 12}}>Part</th>
                      <th>Current vendor</th>
                      <th className="num">Current cost</th>
                      <th>Alt vendor</th>
                      <th className="num">Alt cost</th>
                      <th className="num">Δ%</th>
                      <th className="num">Lead</th>
                      <th className="num">MOQ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parts.flatMap(p =>
                      p.vendorPrices.filter(vp => vp.vendor !== p.vendor).map((vp, i) => {
                        const delta = ((vp.cost - p.cost) / p.cost * 100);
                        return (
                          <tr key={p.id + "-" + i}>
                            <td className="mono" style={{paddingLeft: 12, fontWeight: 600}}>{p.pn}</td>
                            <td style={{fontSize: 11}}>{p.vendor}</td>
                            <td className="num mono">{window.INR(p.cost, 2)}</td>
                            <td style={{fontSize: 11}}>{vp.vendor}</td>
                            <td className="num mono" style={{color: delta < 0 ? "var(--ok)" : delta > 0 ? "var(--danger)" : "var(--fg)"}}>{window.INR(vp.cost, 2)}</td>
                            <td className="num mono" style={{color: delta < 0 ? "var(--ok)" : delta > 0 ? "var(--danger)" : "var(--fg)", fontWeight: 600}}>{delta > 0 ? "+" : ""}{delta.toFixed(1)}%</td>
                            <td className="num mono">{vp.lead}d</td>
                            <td className="num mono">{vp.moq}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              );
            })()}
          </div>
        </div>

        <div className="card">
          <div className="card-h"><h3>Parts health</h3></div>
          <div style={{padding: 16}}>
            {(() => {
              const parts = window.BOM_DATA.rows[0].children.flatMap(s => s.children || []);
              const dupCount = parts.filter(p => p.dupOf).length;
              const obsCount = parts.filter(p => p.status === "Deprecated" || p.status === "Obsolete").length;
              const singleSource = parts.filter(p => !p.vendorPrices && !p.dupOf && p.status !== "Deprecated" && p.status !== "Obsolete" && p.status !== "Draft").length;
              const longLead = parts.filter(p => p.lead > 30).length;
              const total = parts.length;
              const score = Math.max(0, Math.round(100 - ((dupCount + obsCount + singleSource + longLead) / total) * 100));
              const rows = [
                { l:"Duplicates", v: dupCount, c: dupCount > 0 ? "var(--warn)" : "var(--ok)" },
                { l:"Obsolete / Deprecated", v: obsCount, c: obsCount > 0 ? "var(--danger)" : "var(--ok)" },
                { l:"Single-source risk", v: singleSource, c: singleSource > total * 0.3 ? "var(--danger)" : singleSource > 0 ? "var(--warn)" : "var(--ok)" },
                { l:"Long lead (>30d)", v: longLead, c: longLead > 0 ? "var(--warn)" : "var(--ok)" },
              ];
              return (
                <div style={{display:"flex", flexDirection:"column", gap: 10}}>
                  <div style={{display:"flex", alignItems:"center", gap: 10}}>
                    <div style={{width: 48, height: 48, borderRadius: "50%", border: "3px solid " + (score >= 80 ? "var(--ok)" : score >= 60 ? "var(--warn)" : "var(--danger)"), display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"var(--font-mono)", fontSize: 16, fontWeight: 700}}>{score}</div>
                    <div>
                      <div style={{fontWeight: 600, fontSize: 13}}>{score >= 80 ? "Healthy" : score >= 60 ? "Needs attention" : "At risk"}</div>
                      <div style={{fontSize: 10, color:"var(--fg-3)"}}>Health score · lower is better</div>
                    </div>
                  </div>
                  <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap: 6}}>
                    {rows.map(r => (
                      <div key={r.l} style={{padding:"8px 10px", border:"1px solid var(--line)", borderRadius:"var(--r-2)", background:"var(--bg)"}}>
                        <div style={{fontSize:9, fontFamily:"var(--font-mono)", textTransform:"uppercase", letterSpacing:"0.05em", color:"var(--fg-3)", marginBottom:2}}>{r.l}</div>
                        <div style={{fontFamily:"var(--font-mono)", fontSize:18, fontWeight:600, color: r.c}}>{r.v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============ ACTIVITY ============
function ActivityScreen({ data }) {
  const [filter, setFilter] = React.useState("All");

  const matches = (a) => {
    if (filter === "All") return true;
    if (filter === "Mine only") return a.who === "E. Chen";
    if (filter === "System") return a.who === "System";
    if (filter === "Comments") return /comment/i.test(a.action);
    if (filter === "Approvals") return /approv/i.test(a.action) || /requested approval/i.test(a.action) || /released/i.test(a.action);
    if (filter === "Edits") return /chang|updat|edit|uploaded/i.test(a.action);
    return true;
  };
  const filtered = data.activity.filter(matches);

  return (
    <div className="screen-wrap" style={{maxWidth: 820}}>
      <div className="screen-header">
        <div>
          <h1>Team Activity</h1>
          <div className="sub">{filtered.length} of {data.activity.length} events · {filter === "All" ? "" : filter + " · "}this week</div>
        </div>
        <div style={{display:"flex", gap: 8}}>
          <window.DropdownButton
            width={180}
            trigger={<button className="btn">{filter} <Icon.ChevronDown size={10}/></button>}
            items={["All","Edits","Approvals","Comments","System","Mine only"].map(f => ({
              icon: f === filter ? <Icon.Check size={11}/> : <span style={{width:11}}/>,
              label: f,
              onClick: () => setFilter(f),
            }))}
          />
        </div>
      </div>
      <div className="feed">
        {filtered.length === 0 ? (
          <div className="empty" style={{padding: 80}}>
            <div className="ico">∅</div>
            <h3>No events match this filter</h3>
            <button className="btn" onClick={() => setFilter("All")}>Show all</button>
          </div>
        ) : filtered.map((a, i) => (
          <div key={i} className="feed-item">
            <span className={"ava " + a.color}>{a.init}</span>
            <div className="body">
              <span className="who">{a.who}</span>{" "}
              <span className="what">{a.action}</span>{" "}
              <span className="obj" style={{cursor:"pointer"}} onClick={() => {
                // Route to appropriate view based on obj content
                const obj = a.obj.toLowerCase();
                if (/po-/.test(obj)) window.__nav?.("procurement");
                else if (/v\d/.test(obj)) window.__nav?.("diff");
                else if (/^[A-Z]+-/.test(a.obj)) window.__nav?.("bom");
                else if (/duplicate|part/.test(obj)) window.__nav?.("parts");
                else if (/\.pdf|\.dwg|\.xlsx/.test(obj)) window.__nav?.("docs");
                else window.toast("Opening " + a.obj);
              }}>{a.obj}</span>
              {a.note && <span className="what dot-sep">{a.note}</span>}
              {a.quote && <div className="quote">{a.quote}</div>}
            </div>
            <span className="time">{a.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============ DIFF ============
function DiffScreen({ data }) {
  const [swapped, setSwapped] = React.useState(false);
  const [versionA, setVersionA] = React.useState("v3.1.4");

  const diffsBySource = {
    "v3.1.4": data.diff,
    "v3.1.0": {
      a: { ver: "v3.1.0", date: "2026-03-15", author: "M. Park" },
      b: data.diff.b,
      changes: [
        { kind: "added", pn: "EL-PCB-MAIN-R3", desc: "Main PCB R3 added (was R2)", side: "b" },
        { kind: "removed", pn: "EL-PCB-MAIN-R2", desc: "Main PCB R2", side: "a" },
        { kind: "changed", pn: "EL-PSU-240W", desc: "Cost ₹5,644 → ₹6,972", side: "both" },
        { kind: "added", pn: "EL-MEM-DDR4-8G", desc: "Memory upgrade DDR3 → DDR4", side: "b" },
        { kind: "added", pn: "OPT-LNS-25MM", desc: "Lens 25mm f/1.8", side: "b" },
        { kind: "unchanged", pn: "HW-FAS-M3-08", desc: "Screw, M3×8" },
        { kind: "changed", pn: "EL-FAN-92", desc: "80mm → 92mm fan upgrade", side: "both" },
      ],
    },
    "v3.0.0": {
      a: { ver: "v3.0.0", date: "2026-01-20", author: "E. Chen" },
      b: data.diff.b,
      changes: [
        { kind: "added", pn: "ATL-MFR-CTL", desc: "New control subsystem", side: "b" },
        { kind: "removed", pn: "ATL-MFR-CTL-OLD", desc: "Legacy controller", side: "a" },
        { kind: "changed", pn: "ATL-MFR-CHS", desc: "Major redesign — 2 plates replaced", side: "both" },
        { kind: "added", pn: "OPT-LNS-25MM", desc: "Lens added", side: "b" },
        { kind: "added", pn: "EL-CAM-IMX477", desc: "Camera added", side: "b" },
        { kind: "removed", pn: "EL-CAM-OV5640", desc: "Old camera", side: "a" },
      ],
    },
  };
  const baseDiff = diffsBySource[versionA] || data.diff;
  const a = swapped ? baseDiff.b : baseDiff.a;
  const b = swapped ? baseDiff.a : baseDiff.b;
  const flipKind = (k) => swapped ? (k === "added" ? "removed" : k === "removed" ? "added" : k) : k;
  const flipSide = (s) => swapped ? (s === "a" ? "b" : s === "b" ? "a" : s) : s;
  const changes = baseDiff.changes.map(c => ({ ...c, kind: flipKind(c.kind), side: flipSide(c.side) }));
  const counts = changes.reduce((acc, c) => { acc[c.kind] = (acc[c.kind] || 0) + 1; return acc; }, {});
  return (
    <div className="screen-wrap">
      <div className="screen-header">
        <div>
          <h1>Compare Revisions</h1>
          <div className="sub">
            <span style={{color: "var(--ok)"}}>+{counts.added || 0} added</span> ·{" "}
            <span style={{color: "var(--danger)"}}>−{counts.removed || 0} removed</span> ·{" "}
            <span style={{color: "var(--warn)"}}>↻{counts.changed || 0} changed</span>
          </div>
        </div>
        <div style={{display:"flex", gap: 8}}>
          <window.DropdownButton
            width={220}
            trigger={<button className="btn">{a.ver} ↔ {b.ver} <Icon.ChevronDown size={10}/></button>}
            items={[
              { header: "Compare with…" },
              { icon: versionA === "v3.1.4" ? <Icon.Check size={11}/> : <span style={{width:11}}/>, label: "v3.1.4 (prev release)", onClick: () => setVersionA("v3.1.4") },
              { icon: versionA === "v3.1.0" ? <Icon.Check size={11}/> : <span style={{width:11}}/>, label: "v3.1.0", onClick: () => setVersionA("v3.1.0") },
              { icon: versionA === "v3.0.0" ? <Icon.Check size={11}/> : <span style={{width:11}}/>, label: "v3.0.0 (initial)", onClick: () => setVersionA("v3.0.0") },
            ]}
          />
          <button className="btn" onClick={() => setSwapped(s => !s)}><Icon.Diff size={12}/> Swap A↔B</button>
          <button className="btn" onClick={() => window.toast("Diff exported as PDF", { kind: "success", action: { label: "Download", onClick: () => window.toast("Downloaded diff_" + a.ver + "_to_" + b.ver + ".pdf") } })}><Icon.Export size={12}/> Export diff</button>
          <button className="btn primary" onClick={() => window.__open_approve_b?.()}><Icon.Check size={12}/> Approve B</button>
        </div>
      </div>
      <div className="diff-wrap">
        <div className="diff-side">
          <div className="diff-head">
            <span className="ver">A · {a.ver}</span>
            <span className="date">{a.date} · {a.author}</span>
          </div>
          {changes.map((c, i) => {
            if (c.side === "b") return <div key={i} className="diff-row" style={{visibility: "hidden"}}>—</div>;
            const cls = c.kind === "removed" ? "removed" : c.kind === "changed" ? "changed" : c.kind === "unchanged" ? "unchanged" : "";
            return (
              <div key={i} className={"diff-row " + cls}>
                <span className="tag" style={cls === "unchanged" ? {opacity: 0.5} : {}}>
                  {c.kind === "removed" ? "REMOVED" : c.kind === "changed" ? "WAS" : c.kind.toUpperCase()}
                </span>
                <div>
                  <div style={{fontWeight: 600}}>{c.pn}</div>
                  <div style={{fontSize: 10, color: "var(--fg-3)", marginTop: 2}}>{c.desc}</div>
                </div>
                <span/>
              </div>
            );
          })}
        </div>
        <div className="diff-side">
          <div className="diff-head">
            <span className="ver" style={{color: "var(--accent)"}}>B · {b.ver}</span>
            <span className="date">{b.date} · {b.author}</span>
          </div>
          {changes.map((c, i) => {
            if (c.side === "a") return <div key={i} className="diff-row" style={{visibility: "hidden"}}>—</div>;
            const cls = c.kind === "added" ? "added" : c.kind === "changed" ? "changed" : c.kind === "unchanged" ? "unchanged" : "";
            return (
              <div key={i} className={"diff-row " + cls}>
                <span className="tag" style={cls === "unchanged" ? {opacity: 0.5} : {}}>
                  {c.kind === "added" ? "ADDED" : c.kind === "changed" ? "NOW" : c.kind.toUpperCase()}
                </span>
                <div>
                  <div style={{fontWeight: 600}}>{c.pn}</div>
                  <div style={{fontSize: 10, color: "var(--fg-3)", marginTop: 2}}>{c.desc}</div>
                </div>
                <span/>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, {
  VendorsScreen, ProcurementScreen, DocumentsScreen,
  OCRScreen, AnalyticsScreen, ActivityScreen, DiffScreen,
});
