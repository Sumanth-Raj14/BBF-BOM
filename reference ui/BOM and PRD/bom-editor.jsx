// BOM editor — multi-level table with hierarchy, expand/collapse, inline edit,
// bulk select, drag-reorder, sparkline cost trend, lead-time heatbar.

function getRate() {
  try { return parseFloat(localStorage.getItem("__bbox_rate") || "83") || 83; } catch { return 83; }
}
const fmt = {
  money: (n, dec = 2) => {
    if (n == null) return "—";
    const sign = n < 0 ? "-" : "";
    return sign + "₹" + (Math.abs(n) * getRate()).toLocaleString("en-IN", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  },
  qty: (n) => n == null ? "—" : Number.isInteger(n) ? n.toString() : n.toFixed(2),
  num: (n) => n == null ? "—" : n.toLocaleString("en-IN"),
};
const USD_TO_INR = getRate();
window.INR = fmt.money;
window.USD_TO_INR = USD_TO_INR;
window.setConversionRate = (r) => { localStorage.setItem("__bbox_rate", String(r)); window.USD_TO_INR = r; window.location.reload(); };

// Flatten tree into ordered list of rows w/ depth + lineage flags for guides
function flatten(rows, depth = 0, expanded, ancestorsLast = []) {
  const out = [];
  rows.forEach((r, i) => {
    const isLast = i === rows.length - 1;
    out.push({ ...r, depth, isLast, ancestorsLast });
    if (r.children && expanded.has(r.id)) {
      out.push(...flatten(r.children, depth + 1, expanded, [...ancestorsLast, isLast]));
    }
  });
  return out;
}

// Recursive find / update by id
function findRow(rows, id) {
  for (const r of rows) {
    if (r.id === id) return r;
    if (r.children) { const f = findRow(r.children, id); if (f) return f; }
  }
  return null;
}
function updateRow(rows, id, patch) {
  return rows.map(r => {
    if (r.id === id) return { ...r, ...patch };
    if (r.children) return { ...r, children: updateRow(r.children, id, patch) };
    return r;
  });
}

// Compute ext-cost rollup by visiting all leaves
function rollupExt(row) {
  if (!row.children) return (row.cost || 0) * (row.qty || 0);
  return row.children.reduce((s, c) => s + rollupExt(c), 0);
}

// Mini sparkline
function Sparkline({ data }) {
  if (!data || data.length < 2) return <span style={{color: "var(--fg-4)"}}>—</span>;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const w = 70, h = 22, pad = 2;
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2);
    const y = pad + (1 - (v - min) / range) * (h - pad * 2);
    return [x, y];
  });
  const linePath = pts.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const areaPath = linePath + ` L ${pts[pts.length-1][0]} ${h-pad} L ${pts[0][0]} ${h-pad} Z`;
  const last = pts[pts.length - 1];
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`}>
      <path className="area" d={areaPath}/>
      <path className="line" d={linePath}/>
      <circle className="dot" cx={last[0]} cy={last[1]} r="1.6"/>
    </svg>
  );
}

function LeadHeat({ days }) {
  if (days == null) return <span style={{color: "var(--fg-4)"}}>—</span>;
  const max = 45; const pct = Math.min(100, (days / max) * 100);
  let color = "var(--ok)";
  if (days >= 30) color = "var(--danger)";
  else if (days >= 14) color = "var(--warn)";
  return (
    <span className="lt-heat">
      <span className="bar" style={{ "--w": pct + "%", "--lt-c": color }}/>
      <span>{days}d</span>
    </span>
  );
}

function HierGuides({ depth, ancestorsLast, isLast }) {
  if (depth === 0) return null;
  const guides = [];
  for (let i = 0; i < depth - 1; i++) {
    guides.push(<span key={i} className={"hier-guide " + (ancestorsLast[i] ? "last" : "")} />);
  }
  guides.push(<span key={depth - 1} className={"hier-guide elbow " + (isLast ? "last" : "")} />);
  return <>{guides}</>;
}

function EditableCell({ value, onCommit, mono = false, align = "left", prefix = "" }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  React.useEffect(() => setDraft(value), [value]);
  const ref = React.useRef(null);
  React.useEffect(() => { if (editing && ref.current) ref.current.select(); }, [editing]);
  if (editing) {
    return (
      <input
        ref={ref}
        className="editable editing"
        style={{
          fontFamily: mono ? "var(--font-mono)" : "inherit",
          fontVariantNumeric: mono ? "tabular-nums" : undefined,
          textAlign: align,
          width: "100%",
          background: "var(--bg-elev)",
        }}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { setEditing(false); onCommit && onCommit(draft); }}
        onKeyDown={e => {
          if (e.key === "Enter") { e.currentTarget.blur(); }
          if (e.key === "Escape") { setDraft(value); setEditing(false); }
        }}
      />
    );
  }
  return (
    <span className="editable" onDoubleClick={() => onCommit && setEditing(true)} title="Double-click to edit">
      {prefix}{value}
    </span>
  );
}

const STATUS_CLASS = {
  "Released": "released",
  "Draft": "draft",
  "Review": "review",
  "Approved": "approved",
  "Deprecated": "deprecated",
  "Obsolete": "obsolete",
  "Archived": "archived",
};

function BomEditor({ data, onOpenDetail, density, search, activeCats, statusFilters = [], vendorFilters = [], originFilters = [], mode = "hierarchy" }) {
  const ctx = window.useAppStore();
  const rows = ctx?.rows || data.rows;
  const setRows = ctx?.setRows || (() => {});
  const [expanded, setExpanded] = React.useState(() => new Set(["r1", "r1.1", "r1.2", "r1.3", "r1.4"]));
  const [selected, setSelected] = React.useState(new Set());
  const [focused, setFocused] = React.useState(null);
  const [dragId, setDragId] = React.useState(null);
  const [dropId, setDropId] = React.useState(null);
  const [dirty, setDirty] = React.useState(false);
  const dirtyRef = React.useRef(false);

  React.useEffect(() => {
    const onBefore = (e) => {
      if (dirtyRef.current) { e.preventDefault(); e.returnValue = "You have unsaved changes."; }
    };
    window.addEventListener("beforeunload", onBefore);
    return () => window.removeEventListener("beforeunload", onBefore);
  }, []);

  const markClean = React.useCallback(() => { setDirty(false); dirtyRef.current = false; }, []);
  const markDirty = React.useCallback(() => { setDirty(true); dirtyRef.current = true; }, []);

  // Match filtering — show ancestors of any matching descendant
  const filterMatch = React.useMemo(() => {
    const hasFilter = search || activeCats?.length || statusFilters.length || vendorFilters.length || originFilters.length;
    if (!hasFilter) return null;
    const ids = new Set();
    const visit = (rs) => rs.forEach(r => {
      const sm = !search || (r.pn + " " + r.name + " " + (r.vendor || "")).toLowerCase().includes(search.toLowerCase());
      const cm = !activeCats?.length || activeCats.includes(r.category) || (mode === "hierarchy" && r.assembly);
      const stm = !statusFilters.length || statusFilters.includes(r.status) || (mode === "hierarchy" && r.assembly);
      const vm = !vendorFilters.length || vendorFilters.includes(r.vendor) || (mode === "hierarchy" && r.assembly);
      const om = !originFilters.length || originFilters.includes(r.origin) || (mode === "hierarchy" && r.assembly);
      if (sm && cm && stm && vm && om) ids.add(r.id);
      if (r.children) visit(r.children);
    });
    visit(rows);
    if (mode !== "hierarchy") return ids;
    const withAncestors = new Set(ids);
    const addAncestors = (rs, ancestors = []) => rs.forEach(r => {
      if (ids.has(r.id)) ancestors.forEach(a => withAncestors.add(a));
      if (r.children) addAncestors(r.children, [...ancestors, r.id]);
    });
    addAncestors(rows);
    return withAncestors;
  }, [search, activeCats, statusFilters, vendorFilters, originFilters, rows, mode]);

  const flat = React.useMemo(() => {
    if (mode === "flat") {
      const leaves = [];
      const walk = (rs) => rs.forEach(r => { if (r.children) walk(r.children); else leaves.push({ ...r, depth: 0, isLast: false, ancestorsLast: [] }); });
      walk(rows);
      let f = leaves;
      if (filterMatch) f = f.filter(r => filterMatch.has(r.id));
      return f;
    }
    let f = flatten(rows, 0, expanded, []);
    if (filterMatch) f = f.filter(r => filterMatch.has(r.id));
    return f;
  }, [rows, expanded, filterMatch, mode]);

  const toggleExpand = (id) => {
    const next = new Set(expanded);
    next.has(id) ? next.delete(id) : next.add(id);
    setExpanded(next);
  };
  const toggleSelect = (id) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };
  const clearSelection = () => setSelected(new Set());

  const allLeafIds = React.useMemo(() => flat.filter(r => !r.children).map(r => r.id), [flat]);
  const allSelected = allLeafIds.length > 0 && allLeafIds.every(id => selected.has(id));
  const someSelected = !allSelected && allLeafIds.some(id => selected.has(id));
  const toggleAll = () => {
    if (allSelected) clearSelection();
    else setSelected(new Set(allLeafIds));
  };

  // Drag & drop reorder (sibling-level within same parent)
  const handleDragStart = (id) => setDragId(id);
  const handleDragOver = (e, id) => {
    if (id !== dragId) { e.preventDefault(); setDropId(id); }
  };
  const handleDrop = (id) => {
    if (!dragId || dragId === id) { setDragId(null); setDropId(null); return; }
    const prev = JSON.parse(JSON.stringify(rows));
    const dragId_ = dragId;
    setRows(current => {
      const moveInSiblings = (rs) => {
        const ids = rs.map(r => r.id);
        if (ids.includes(dragId_) && ids.includes(id)) {
          const from = ids.indexOf(dragId_);
          const to = ids.indexOf(id);
          const next = [...rs];
          const [moved] = next.splice(from, 1);
          next.splice(to, 0, moved);
          return next;
        }
        return rs.map(r => r.children ? { ...r, children: moveInSiblings(r.children) } : r);
      };
      const next = moveInSiblings(current);
      localStorage.setItem("__bbox_rows", JSON.stringify(next));
      return next;
    });
    window.recordUndo?.("reorder rows", () => setRows(JSON.parse(JSON.stringify(prev))));
    markDirty();
    setDragId(null); setDropId(null);
  };

  const inlineEdit = (id, patch) => {
    const prev = JSON.parse(JSON.stringify(rows));
    const next = updateRow(rows, id, patch);
    setRows(next);
    localStorage.setItem("__bbox_rows", JSON.stringify(next));
    window.recordUndo?.("edit " + (patch.name || patch.vendor || "field"), () => setRows(prev));
    markDirty();
  };

  const cellQty = (row) => (
    <EditableCell
      value={row.qty}
      mono align="right"
      onCommit={(v) => inlineEdit(row.id, { qty: parseFloat(v) || 0 })}
    />
  );

  return (
    <div className="bom-wrap" data-density={density}>
      {dirty && (
        <div style={{display:"flex", alignItems:"center", gap: 8, padding:"6px 12px", borderBottom:"1px solid var(--warn)", background:"color-mix(in oklch, var(--warn) 10%, var(--bg))", fontSize: 11, fontFamily:"var(--font-mono)"}}>
          <span style={{width: 6, height: 6, borderRadius: 99, background: "var(--warn)", display: "inline-block"}}/>
          <span>Unsaved changes</span>
          <span style={{flex: 1}}/>
          <button className="btn small" onClick={() => { window.toast("Changes saved to browser storage", { kind: "success" }); markClean(); }}>Save</button>
          <button className="btn small" onClick={() => { setRows(JSON.parse(JSON.stringify(data.rows))); localStorage.removeItem("__bbox_rows"); markClean(); }}>Discard</button>
        </div>
      )}
      <div className="bom-scroll">
        <table className="bom-table">
          <colgroup>
            <col className="col-drag" />
            <col className="col-check" />
            <col className="col-pn" />
            <col className="col-name" />
            <col className="col-rev" />
            <col className="col-qty" />
            <col className="col-uom" />
            <col className="col-cat" />
            <col className="col-vendor" />
            <col className="col-cost" />
            <col className="col-extcost" />
            <col className="col-lead" />
            <col className="col-origin" />
            <col className="col-status" />
            <col className="col-trend" />
            <col className="col-actions" />
          </colgroup>
          <thead>
            <tr>
              <th className="col-drag"></th>
              <th className="col-check">
                <input type="checkbox" className={"row-checkbox " + (someSelected ? "indeterminate" : "")}
                       checked={allSelected} onChange={toggleAll} />
              </th>
              <th>Part No.</th>
              <th>Name</th>
              <th>Rev</th>
              <th className="num">Qty</th>
              <th>UoM</th>
              <th>Category</th>
              <th>Vendor</th>
              <th className="num">Unit</th>
              <th className="num">Ext.</th>
              <th>Lead</th>
              <th>Origin</th>
              <th>Status</th>
              <th>Cost Trend</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {flat.length === 0 ? (
              <tr>
                <td colSpan={16} style={{padding: 60, textAlign: "center"}}>
                  <div style={{fontSize: 13, color: "var(--fg-3)", marginBottom: 8}}>
                    {search || activeCats?.length || statusFilters.length || vendorFilters.length || originFilters.length
                      ? "No parts match these filters"
                      : "No parts in this BOM yet"}
                  </div>
                  <div style={{fontSize: 11, color: "var(--fg-4)"}}>
                    {search || activeCats?.length || statusFilters.length || vendorFilters.length || originFilters.length
                      ? "Try clearing some filters or search terms"
                      : "Import parts or add components to get started"}
                  </div>
                </td>
              </tr>
            ) : flat.map(row => {
              const isSelected = selected.has(row.id);
              const ext = row.children ? rollupExt(row) : (row.cost || 0) * (row.qty || 0);
              return (
                <tr
                  key={row.id}
                  className={(isSelected ? "selected " : "") + (focused === row.id ? "focused " : "") + (dragId === row.id ? "dragging " : "") + (dropId === row.id ? "drop-target " : "")}
                  draggable
                  onDragStart={() => handleDragStart(row.id)}
                  onDragOver={(e) => handleDragOver(e, row.id)}
                  onDrop={() => handleDrop(row.id)}
                  onDragEnd={() => { setDragId(null); setDropId(null); }}
                  onClick={(e) => {
                    // Avoid focus on checkbox clicks
                    if (e.target.tagName === "INPUT") return;
                    setFocused(row.id);
                  }}
                >
                  <td className="col-drag">
                    <span className="drag-handle"><Icon.Drag size={12} /></span>
                  </td>
                  <td className="col-check">
                    <input
                      type="checkbox"
                      className="row-checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(row.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                  <td className="mono" style={{color: row.assembly ? "var(--fg)" : "var(--fg-2)"}}>
                    <span style={{fontWeight: row.assembly ? 600 : 400}}>{row.pn}</span>
                  </td>
                  <td>
                    <span className="hier">
                      <HierGuides depth={row.depth} ancestorsLast={row.ancestorsLast} isLast={row.isLast}/>
                      {row.children ? (
                        <button
                          className={"hier-expand " + (expanded.has(row.id) ? "expanded" : "")}
                          onClick={(e) => { e.stopPropagation(); toggleExpand(row.id); }}
                        >
                          <Icon.Chevron size={10} />
                        </button>
                      ) : <span className="hier-leaf" />}
                      <span className={"row-name " + (row.assembly ? "assembly" : "")}>
                        <EditableCell
                          value={row.name}
                          onCommit={(v) => inlineEdit(row.id, { name: v })}
                        />
                        {row.assembly && row.children && <span className="badge">{row.children.length}</span>}
                      </span>
                    </span>
                  </td>
                  <td className="mono">{row.rev}</td>
                  <td className="num">{cellQty(row)}</td>
                  <td className="mono" style={{color: "var(--fg-3)"}}>{row.uom}</td>
                  <td>
                    <span className={"cat " + row.category.toLowerCase()}>{row.category}</span>
                  </td>
                  <td style={{color: row.vendor === "—" ? "var(--fg-4)" : "var(--fg)"}}>{row.vendor}</td>
                  <td className="num">{row.cost ? fmt.money(row.cost) : "—"}</td>
                  <td className="num" style={{fontWeight: row.assembly ? 600 : 500}}>
                    {fmt.money(ext)}
                  </td>
                  <td><LeadHeat days={row.lead} /></td>
                  <td className="mono" style={{color: "var(--fg-3)"}}>{row.origin}</td>
                  <td>
                    <span className={"status " + (STATUS_CLASS[row.status] || "")}>{row.status}</span>
                  </td>
                  <td>
                    <Sparkline data={row.trend} />
                  </td>
                  <td>
                    <span style={{display:"inline-flex", gap: 2}}>
                      <button
                        className="icon-btn"
                        style={{width: 22, height: 22, opacity: 0.6}}
                        onClick={(e) => { e.stopPropagation(); onOpenDetail && onOpenDetail(row); }}
                        title="Open part detail (specs, vendors, where-used, files, comments, history)"
                      >
                        <Icon.Chevron size={11}/>
                      </button>
                      <window.DropdownButton
                        width={200}
                        trigger={<button className="icon-btn" style={{width: 22, height: 22}} title="Row actions"><Icon.Dots size={12}/></button>}
                        items={[
                          { icon: <Icon.Chevron size={11}/>, label: "Open detail", onClick: () => onOpenDetail(row) },
                          { icon: <Icon.Edit size={11}/>, label: "Edit inline", onClick: () => window.toast("Double-click any cell to edit") },
                          { icon: <Icon.Search size={11}/>, label: "Find alternates", onClick: () => ctx?.openModal("find-alternates", row) },
                          { icon: <Icon.Cart size={11}/>, label: "Send RFQ", onClick: () => ctx?.openModal("send-rfq", row) },
                          { icon: <Icon.Cart size={11}/>, label: "Add to PO", onClick: () => window.toast(row.pn + " added to draft PO", { kind: "success", action: { label: "View", onClick: () => window.__nav?.("procurement") } }) },
                          "divider",
                          {
                            icon: <Icon.Plus size={11}/>,
                            label: "Duplicate row",
                              onClick: () => {
                                const dup = (rs) => rs.map(r => {
                                  if (r.id === row.id) {
                                    const copy = { ...r, id: r.id + "-dup-" + Date.now(), pn: r.pn + "-COPY" };
                                    delete copy.children;
                                    return [r, copy];
                                  }
                                  if (r.children) return { ...r, children: dup(r.children).flat() };
                                  return r;
                                });
                                const next = dup(rows).flat();
                                setRows(next);
                                localStorage.setItem("__bbox_rows", JSON.stringify(next));
                                markDirty();
                                window.toast(row.pn + " duplicated", { kind: "success" });
                              },
                            },
                            {
                              icon: <Icon.Trash size={11}/>,
                              label: "Delete from BOM",
                              danger: true,
                              onClick: () => {
                                const remove = (rs) => rs.filter(r => r.id !== row.id).map(r => r.children ? { ...r, children: remove(r.children) } : r);
                                const next = remove(rows);
                                setRows(next);
                                localStorage.setItem("__bbox_rows", JSON.stringify(next));
                                markDirty();
                                window.toast(row.pn + " removed from BOM", { kind: "warn", action: { label: "Undo", onClick: () => { setRows(data.rows); localStorage.setItem("__bbox_rows", JSON.stringify(data.rows)); } } });
                              },
                          },
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

      {selected.size > 0 && (
        <div className="bulk-bar">
          <span className="count">{selected.size} selected</span>
          <button onClick={() => ctx?.openModal("bulk-edit", {
            count: selected.size,
            onApply: (patch) => {
              const update = (rs) => rs.map(r => {
                if (selected.has(r.id)) return { ...r, ...patch, children: r.children ? update(r.children) : undefined };
                if (r.children) return { ...r, children: update(r.children) };
                return r;
              });
              setRows(update(rows));
            },
          })}><Icon.Edit size={12} /> Edit fields</button>
          <button onClick={() => window.toast(`${selected.size} parts added to draft PO`, { kind: "success", action: { label: "View", onClick: () => window.__nav?.("procurement") } })}><Icon.Cart size={12} /> Add to PO</button>
          <button onClick={() => window.toast(`Exporting ${selected.size} rows as CSV…`)}><Icon.Export size={12} /> Export</button>
          <span className="divider" />
          <button onClick={() => {
            const n = selected.size;
            const remove = (rs) => rs.filter(r => !selected.has(r.id)).map(r => r.children ? { ...r, children: remove(r.children) } : r);
            const next = remove(rows);
            setRows(next);
            localStorage.setItem("__bbox_rows", JSON.stringify(next));
            markDirty();
            setSelected(new Set());
            window.toast(`${n} parts removed from BOM`, { kind: "warn", action: { label: "Undo", onClick: () => { setRows(data.rows); localStorage.setItem("__bbox_rows", JSON.stringify(data.rows)); window.toast("Restored"); } } });
          }}><Icon.Trash size={12} /> Delete</button>
          <span className="divider" />
          <button onClick={clearSelection} title="Clear selection"><Icon.X size={12} /></button>
        </div>
      )}
    </div>
  );
}

window.BomEditor = BomEditor;
window.fmt = fmt;
window.Sparkline = Sparkline;
window.LeadHeat = LeadHeat;
window.STATUS_CLASS = STATUS_CLASS;
