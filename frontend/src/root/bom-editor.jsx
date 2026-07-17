import PropTypes from "prop-types";
import { storage } from "../utils/storage.js";
import { __t } from "../i18n";
import { toast } from "../utils/toast";
// BOM editor — multi-level table with hierarchy, expand/collapse, inline edit,
// bulk select, drag-reorder, sparkline cost trend, lead-time heatbar.
function getRate() {
  return storage.inrRate.get();
}
export const fmt = {
  money: (n, dec = 2) => {
    if (n == null) return "—";
    const sign = n < 0 ? "-" : "";
    return (
      sign +
      "₹" +
      (Math.abs(n) * getRate()).toLocaleString("en-IN", {
        minimumFractionDigits: dec,
        maximumFractionDigits: dec,
      })
    );
  },
  qty: (n) =>
    n == null ? "—" : Number.isInteger(n) ? n.toString() : n.toFixed(2),
  num: (n) => (n == null ? "—" : n.toLocaleString("en-IN")),
};
export const INR = fmt.money;
export const USD_TO_INR = getRate();
export function setConversionRate(r) {
  storage.inrRate.set(r);
  window.USD_TO_INR = r;
  window.location.reload();
}
window.INR = INR;
window.USD_TO_INR = USD_TO_INR;
window.setConversionRate = setConversionRate;
// Flatten tree into ordered list of rows w/ depth + lineage flags for guides
function flatten(rows, depth = 0, expanded, ancestorsLast = []) {
  const out = [];
  rows.forEach((r, i) => {
    const isLast = i === rows.length - 1;
    out.push({ ...r, depth, isLast, ancestorsLast });
    if (r.children && expanded.has(r.id)) {
      out.push(
        ...flatten(r.children, depth + 1, expanded, [...ancestorsLast, isLast]),
      );
    }
  });
  return out;
}
// Return modified BOM JSON
function updateRow(rows, id, patch) {
  return rows.map((r) => {
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
export function Sparkline({ data }) {
  if (!data || data.length < 2) return <span className="fg-4">—</span>;
  const min = Math.min(...data),
    max = Math.max(...data);
  const range = max - min || 1;
  const w = 70,
    h = 22,
    pad = 2;
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2);
    const y = pad + (1 - (v - min) / range) * (h - pad * 2);
    return [x, y];
  });
  const linePath = pts
    .map(
      (p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + " " + p[1].toFixed(1),
    )
    .join(" ");
  const areaPath =
    linePath +
    ` L ${pts[pts.length - 1][0]} ${h - pad} L ${pts[0][0]} ${h - pad} Z`;
  const last = pts[pts.length - 1];
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`}>
      <path className="area" d={areaPath} />
      <path className="line" d={linePath} />
      <circle className="dot" cx={last[0]} cy={last[1]} r="1.6" />
    </svg>
  );
}
Sparkline.propTypes = {
  data: PropTypes.array,
};
export function LeadHeat({ days }) {
  if (days == null) return <span className="fg-4">—</span>;
  const max = 45;
  const pct = Math.min(100, (days / max) * 100);
  let color = "var(--ok)";
  if (days >= 30) color = "var(--danger)";
  else if (days >= 14) color = "var(--warn)";
  return (
    <span className="lt-heat">
      <span className="bar" style={{ "--w": pct + "%", "--lt-c": color }} />
      <span>{days}d</span>
    </span>
  );
}
LeadHeat.propTypes = {
  days: PropTypes.any,
};
function HierGuides({ depth, ancestorsLast, isLast }) {
  if (depth === 0) return null;
  const guides = [];
  for (let i = 0; i < depth - 1; i++) {
    guides.push(
      <span
        key={"guide-" + i}
        className={"hier-guide " + (ancestorsLast[i] ? "last" : "")}
      />,
    );
  }
  guides.push(
    <span
      key={"guide-" + (depth - 1)}
      className={"hier-guide elbow " + (isLast ? "last" : "")}
    />,
  );
  return <>{guides}</>;
}
HierGuides.propTypes = {
  depth: PropTypes.any,
  ancestorsLast: PropTypes.any,
  isLast: PropTypes.bool,
};
function EditableCell({
  value,
  onCommit,
  mono = false,
  align = "left",
  prefix = "",
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  React.useEffect(() => setDraft(value), [value]);
  const ref = React.useRef(null);
  const cellId = React.useId();
  React.useEffect(() => {
    if (editing && ref.current) ref.current.select();
  }, [editing]);
  if (editing) {
    return (
      <input
        id={cellId}
        name="editable"
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
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          onCommit && onCommit(draft);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          }
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
      />
    );
  }
  return (
    <span
      className="editable"
      onDoubleClick={() => onCommit && setEditing(true)}
      title={__t("bom.doubleClickToEdit") || "Double-click to edit"}
    >
      {prefix}
      {value}
    </span>
  );
}
EditableCell.propTypes = {
  value: PropTypes.any,
  onCommit: PropTypes.func,
  mono: PropTypes.bool,
  align: PropTypes.string,
  prefix: PropTypes.string,
};
export const STATUS_CLASS = {
  Released: "released",
  Draft: "draft",
  Review: "review",
  Approved: "approved",
  Deprecated: "deprecated",
  Obsolete: "obsolete",
  Archived: "archived",
};
export function BomEditor({
  data,
  onOpenDetail,
  density,
  search,
  activeCats,
  statusFilters = [],
  vendorFilters = [],
  originFilters = [],
  mode = "hierarchy",
  collabChannel,
  collabDocId,
}) {
  const ctx = useAppStore();
  const rows = ctx?.rows || data.rows;
  const setRows = ctx?.setRows || (() => {});
  const [expanded, setExpanded] = React.useState(
    () => new Set(["r1", "r1.1", "r1.2", "r1.3", "r1.4"]),
  );
  const [selected, setSelected] = React.useState(new Set());
  const [focused, setFocused] = React.useState(null);
  const [dragId, setDragId] = React.useState(null);
  const [dropId, setDropId] = React.useState(null);
  const [dirty, setDirty] = React.useState(false);
  const dirtyRef = React.useRef(false);
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => {
    const onBefore = (e) => {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue =
          __t("bom.unsavedChangesConfirm") || "You have unsaved changes.";
      }
    };
    window.addEventListener("beforeunload", onBefore);
    return () => window.removeEventListener("beforeunload", onBefore);
  }, []);
  const markClean = React.useCallback(() => {
    setDirty(false);
    dirtyRef.current = false;
  }, []);
  const markDirty = React.useCallback(() => {
    setDirty(true);
    dirtyRef.current = true;
  }, []);
  const addItem = React.useCallback(() => {
    const newId = "new-" + Date.now();
    const newRow = {
      id: newId,
      pn: "NEW-" + Date.now().toString(36).toUpperCase(),
      name: "New Item",
      rev: "A",
      qty: 1,
      uom: "EA",
      category: "Electrical",
      vendor: "\u2014",
      cost: 0,
      lead: null,
      origin: "US",
      status: "Draft",
      assembly: false,
    };
    const next = [...rows, newRow];
    setRows(next);
    markDirty();
    toast(
      __t("bom.itemAdded") ||
        "New item added \u2014 double-click cells to edit",
      { kind: "success" },
    );
  }, [rows, setRows, markDirty]);
  // Match filtering — show ancestors of any matching descendant
  const filterMatch = React.useMemo(() => {
    const hasFilter =
      search ||
      activeCats?.length ||
      statusFilters.length ||
      vendorFilters.length ||
      originFilters.length;
    if (!hasFilter) return null;
    const ids = new Set();
    const visit = (rs) =>
      rs.forEach((r) => {
        const sm =
          !search ||
          (r.pn + " " + r.name + " " + (r.vendor || ""))
            .toLowerCase()
            .includes(search.toLowerCase());
        const cm =
          !activeCats?.length ||
          activeCats.includes(r.category) ||
          (mode === "hierarchy" && r.assembly);
        const stm =
          !statusFilters.length ||
          statusFilters.includes(r.status) ||
          (mode === "hierarchy" && r.assembly);
        const vm =
          !vendorFilters.length ||
          vendorFilters.includes(r.vendor) ||
          (mode === "hierarchy" && r.assembly);
        const om =
          !originFilters.length ||
          originFilters.includes(r.origin) ||
          (mode === "hierarchy" && r.assembly);
        if (sm && cm && stm && vm && om) ids.add(r.id);
        if (r.children) visit(r.children);
      });
    visit(rows);
    if (mode !== "hierarchy") return ids;
    const withAncestors = new Set(ids);
    const addAncestors = (rs, ancestors = []) =>
      rs.forEach((r) => {
        if (ids.has(r.id)) ancestors.forEach((a) => withAncestors.add(a));
        if (r.children) addAncestors(r.children, [...ancestors, r.id]);
      });
    addAncestors(rows);
    return withAncestors;
  }, [
    search,
    activeCats,
    statusFilters,
    vendorFilters,
    originFilters,
    rows,
    mode,
  ]);
  const flat = React.useMemo(() => {
    if (mode === "flat") {
      const leaves = [];
      const walk = (rs) =>
        rs.forEach((r) => {
          if (r.children) walk(r.children);
          else
            leaves.push({ ...r, depth: 0, isLast: false, ancestorsLast: [] });
        });
      walk(rows);
      let f = leaves;
      if (filterMatch) f = f.filter((r) => filterMatch.has(r.id));
      return f;
    }
    let f = flatten(rows, 0, expanded, []);
    if (filterMatch) f = f.filter((r) => filterMatch.has(r.id));
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
  const allLeafIds = React.useMemo(
    () => flat.filter((r) => !r.children).map((r) => r.id),
    [flat],
  );
  const allSelected =
    allLeafIds.length > 0 && allLeafIds.every((id) => selected.has(id));
  const someSelected =
    !allSelected && allLeafIds.some((id) => selected.has(id));
  const toggleAll = () => {
    if (allSelected) clearSelection();
    else setSelected(new Set(allLeafIds));
  };
  // Drag & drop reorder (sibling-level within same parent)
  const handleDragStart = (id) => setDragId(id);
  const handleDragOver = (e, id) => {
    if (id !== dragId) {
      e.preventDefault();
      setDropId(id);
    }
  };
  const handleDrop = (id) => {
    if (!dragId || dragId === id) {
      setDragId(null);
      setDropId(null);
      return;
    }
    const prev = JSON.parse(JSON.stringify(rows));
    const dragId_ = dragId;
    setRows((current) => {
      const moveInSiblings = (rs) => {
        const ids = rs.map((r) => r.id);
        if (ids.includes(dragId_) && ids.includes(id)) {
          const from = ids.indexOf(dragId_);
          const to = ids.indexOf(id);
          const next = [...rs];
          const [moved] = next.splice(from, 1);
          next.splice(to, 0, moved);
          return next;
        }
        return rs.map((r) =>
          r.children ? { ...r, children: moveInSiblings(r.children) } : r,
        );
      };
      const next = moveInSiblings(current);
      return next;
    });
    recordUndo?.("reorder rows", () =>
      setRows(JSON.parse(JSON.stringify(prev))),
    );
    markDirty();
    setDragId(null);
    setDropId(null);
  };
  const syncToApi = React.useCallback((id, patch) => {
    if (id && id.startsWith("api-")) {
      const realId = parseInt(id.replace("api-", ""), 10);
      if (!isNaN(realId)) {
        api.parts.update(realId, patch).catch((e) => {
          console.warn("[BomEditor] API sync failed for", id, e.message);
          toast(
            __t("bom.saveFailed") || "Edit saved locally — server sync failed",
            { kind: "warn" },
          );
        });
      }
    }
  }, []);
  const inlineEdit = (id, patch) => {
    const prev = JSON.parse(JSON.stringify(rows));
    const next = updateRow(rows, id, patch);
    setRows(next);
    syncToApi(id, patch);
    recordUndo?.("edit " + (patch.name || patch.vendor || "field"), () =>
      setRows(prev),
    );
    markDirty();
  };
  const cellQty = (row) => (
    <EditableCell
      value={row.qty}
      mono
      align="right"
      onCommit={(v) => inlineEdit(row.id, { qty: parseFloat(v) || 0 })}
    />
  );
  return (
    <>
      {typeof CollabProvider !== "undefined" && CollaborationBar ? (
        <CollaborationBar
          channel={collabChannel || "bom-editor"}
          docId={collabDocId}
        />
      ) : null}
      <div className="bom-wrap" data-density={density}>
        {dirty && (
          <div
            className="flex items-center gap-8 fs-11 font-mono"
            style={{
              padding: "6px 12px",
              borderBottom: "1px solid var(--warn)",
              background: "color-mix(in oklch, var(--warn) 10%, var(--bg))",
            }}
          >
            <span
              className="bg-warn d-iblock"
              style={{ width: 6, height: 6, borderRadius: 99 }}
            />
            <span>{__t("bom.unsavedChanges") || "Unsaved changes"}</span>
            <button
              className="btn small"
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                try {
                  const apiRows = rows.filter(
                    (r) => r.id && r.id.startsWith("api-"),
                  );
                  let synced = 0,
                    failed = 0;
                  await Promise.allSettled(
                    apiRows.map((r) => {
                      const realId = parseInt(r.id.replace("api-", ""), 10);
                      if (isNaN(realId)) {
                        failed++;
                        return;
                      }
                      return api.parts
                        .update(realId, {
                          pn: r.pn,
                          name: r.name,
                          rev: r.rev,
                          qty: r.qty,
                          uom: r.uom,
                          category: r.category,
                          vendor: r.vendor,
                          cost: r.cost,
                          lead: r.lead,
                          origin: r.origin,
                          status: r.status,
                          material: r.material,
                          weight: r.weight,
                          dimensions: r.dimensions,
                        })
                        .then(() => synced++)
                        .catch(() => failed++);
                    }),
                  );
                  markClean();
                  toast(
                    `${__t("bom.saved") || "Saved"} \u00B7 ${synced} ${__t("bom.synced") || "synced"}${failed ? `, ${failed} ${__t("bom.failed") || "failed"}` : ""}`,
                    { kind: failed ? "warn" : "success" },
                  );
                } finally {
                  setSaving(false);
                }
              }}
            >
              {saving ? (
                <>
                  <span className="spinner" style={{ width: 10, height: 10 }} />{" "}
                  {__t("bom.saving") || "Saving..."}
                </>
              ) : (
                __t("bom.save") || "Save"
              )}
            </button>
            <button
              className="btn small"
              onClick={() => {
                setRows(JSON.parse(JSON.stringify(data.rows)));
                markClean();
              }}
            >
              {__t("bom.discard") || "Discard"}
            </button>
          </div>
        )}
        <div className="bom-toolbar">
          <button className="btn small" onClick={addItem}>
            <Icon.Plus size={11} /> {__t("bom.addItem") || "Add Item"}
          </button>
          <span
            className="w-1 h-14"
            style={{ background: "var(--line)", margin: "0 6px" }}
          />
          <button
            className="btn small"
            onClick={() =>
              ctx?.openModal?.("barcode-scan", {
                onFound: (pn) => window.__setBomSearch?.(pn),
              })
            }
          >
            <Icon.Scan size={11} /> {__t("bom.scan") || "Scan"}
          </button>
          <div className="flex-1" />
          <span className="hint">
            {flat.length}{" "}
            {flat.length === 1
              ? __t("bom.row") || "row"
              : __t("bom.rows") || "rows"}
          </span>
        </div>
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
                  <input
                    id="bom-select-all"
                    name="selectAll"
                    type="checkbox"
                    className={
                      "row-checkbox " + (someSelected ? "indeterminate" : "")
                    }
                    checked={allSelected}
                    onChange={toggleAll}
                  />
                </th>
                <th>{__t("bom.colPartNo") || "Part No."}</th>
                <th>{__t("bom.colName") || "Name"}</th>
                <th>{__t("bom.colRev") || "Rev"}</th>
                <th className="num">{__t("bom.colQty") || "Qty"}</th>
                <th>{__t("bom.colUom") || "UoM"}</th>
                <th>{__t("bom.colCategory") || "Category"}</th>
                <th>{__t("bom.colVendor") || "Vendor"}</th>
                <th className="num">{__t("bom.colUnit") || "Unit"}</th>
                <th className="num">{__t("bom.colExt") || "Ext."}</th>
                <th>{__t("bom.colLead") || "Lead"}</th>
                <th>{__t("bom.colOrigin") || "Origin"}</th>
                <th>{__t("bom.colStatus") || "Status"}</th>
                <th>{__t("bom.colTrend") || "Cost Trend"}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {flat.length === 0 ? (
                <tr>
                  <td colSpan={16} className="text-center p-0">
                    <div className="empty-state">
                      <div className="fg-3 mb-12">
                        {search ||
                        activeCats?.length ||
                        statusFilters.length ||
                        vendorFilters.length ||
                        originFilters.length
                          ? __t("bom.noMatchFilter") ||
                            "No parts match these filters"
                          : __t("bom.noPartsInBom") || "No parts in this BOM yet"}
                      </div>
                      <div className="fs-11 fg-4">
                        {search ||
                        activeCats?.length ||
                        statusFilters.length ||
                        vendorFilters.length ||
                        originFilters.length
                          ? __t("bom.clearFilters") ||
                            "Try clearing some filters or search terms"
                          : __t("bom.importParts") ||
                            "Import parts or add components to get started"}
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                flat.map((row) => {
                  const isSelected = selected.has(row.id);
                  const ext = row.children
                    ? rollupExt(row)
                    : (row.cost || 0) * (row.qty || 0);
                  return (
                    <tr
                      key={row.id}
                      className={
                        (isSelected ? "selected " : "") +
                        (focused === row.id ? "focused " : "") +
                        (dragId === row.id ? "dragging " : "") +
                        (dropId === row.id ? "drop-target " : "")
                      }
                      draggable
                      onDragStart={() => handleDragStart(row.id)}
                      onDragOver={(e) => handleDragOver(e, row.id)}
                      onDrop={() => handleDrop(row.id)}
                      onDragEnd={() => {
                        setDragId(null);
                        setDropId(null);
                      }}
                      onClick={(e) => {
                        // Avoid focus on checkbox clicks
                        if (e.target.tagName === "INPUT") return;
                        setFocused(row.id);
                      }}
                    >
                      <td className="col-drag">
                        <span className="drag-handle">
                          <Icon.Drag size={12} />
                        </span>
                      </td>
                      <td className="col-check">
                        <input
                          id={"bom-row-" + row.id}
                          name="bomRowSelect"
                          type="checkbox"
                          className="row-checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(row.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                      <td
                        className="mono"
                        style={{
                          color: row.assembly ? "var(--fg)" : "var(--fg-2)",
                        }}
                      >
                        <span style={{ fontWeight: row.assembly ? 600 : 400 }}>
                          {row.pn}
                        </span>
                      </td>
                      <td>
                        <span className="hier">
                          <HierGuides
                            depth={row.depth}
                            ancestorsLast={row.ancestorsLast}
                            isLast={row.isLast}
                          />
                          {row.children ? (
                            <button
                              className={
                                "hier-expand " +
                                (expanded.has(row.id) ? "expanded" : "")
                              }
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleExpand(row.id);
                              }}
                            >
                              <Icon.Chevron size={10} />
                            </button>
                          ) : (
                            <span className="hier-leaf" />
                          )}
                          <span
                            className={
                              "row-name " + (row.assembly ? "assembly" : "")
                            }
                          >
                            <EditableCell
                              value={row.name}
                              onCommit={(v) => inlineEdit(row.id, { name: v })}
                            />
                            {row.assembly && row.children && (
                              <span className="badge">
                                {row.children.length}
                              </span>
                            )}
                          </span>
                        </span>
                      </td>
                      <td className="mono">{row.rev}</td>
                      <td className="num">{cellQty(row)}</td>
                      <td className="mono fg-3">{row.uom}</td>
                      <td>
                        <span className={"cat " + row.category.toLowerCase()}>
                          {row.category}
                        </span>
                      </td>
                      <td
                        style={{
                          color:
                            row.vendor === "—" ? "var(--fg-4)" : "var(--fg)",
                        }}
                      >
                        {row.vendor}
                      </td>
                      <td className="num">
                        {row.cost ? fmt.money(row.cost) : "—"}
                      </td>
                      <td
                        className="num"
                        style={{ fontWeight: row.assembly ? 600 : 500 }}
                      >
                        {fmt.money(ext)}
                      </td>
                      <td>
                        <LeadHeat days={row.lead} />
                      </td>
                      <td className="mono fg-3">{row.origin}</td>
                      <td>
                        <span
                          className={
                            "status " + (STATUS_CLASS[row.status] || "")
                          }
                        >
                          {row.status}
                        </span>
                      </td>
                      <td>
                        <Sparkline data={row.trend} />
                      </td>
                      <td>
                        <span className="inline-flex gap-2">
                          <button
                            className="icon-btn w-22 h-22 op-06"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenDetail && onOpenDetail(row);
                            }}
                            title={
                              __t("bom.openPartDetail") ||
                              "Open part detail (specs, vendors, where-used, files, comments, history)"
                            }
                            aria-label={__t("bom.openDetail") || "Open detail"}
                          >
                            <Icon.Chevron size={11} />
                          </button>
                          <DropdownButton
                            width={200}
                            trigger={
                              <button
                                className="icon-btn w-22 h-22"
                                title={__t("bom.rowActions") || "Row actions"}
                                aria-label={
                                  __t("bom.moreOptions") || "More options"
                                }
                              >
                                <Icon.Dots size={12} />
                              </button>
                            }
                            items={[
                              {
                                icon: <Icon.Chevron size={11} />,
                                label: __t("bom.openDetail") || "Open detail",
                                onClick: () => onOpenDetail(row),
                              },
                              {
                                icon: <Icon.Edit size={11} />,
                                label: __t("bom.editInline") || "Edit inline",
                                onClick: () =>
                                  toast(
                                    __t("bom.doubleClickToEdit") ||
                                      "Double-click any cell to edit",
                                  ),
                              },
                              {
                                icon: <Icon.Search size={11} />,
                                label:
                                  __t("bom.findAlternates") ||
                                  "Find alternates",
                                onClick: () =>
                                  ctx?.openModal("find-alternates", row),
                              },
                              {
                                icon: <Icon.Cart size={11} />,
                                label: __t("bom.sendRfq") || "Send RFQ",
                                onClick: () => ctx?.openModal("send-rfq", row),
                              },
                              {
                                icon: <Icon.Cart size={11} />,
                                label: __t("bom.addToPo") || "Add to PO",
                                onClick: () => {
                                  const poDraft = window.__poDraft || [];
                                  poDraft.push({
                                    pn: row.pn,
                                    name: row.name,
                                    qty: row.qty || 1,
                                    cost: row.cost,
                                    vendor: row.vendor,
                                  });
                                  window.__poDraft = poDraft;
                                  toast(
                                    row.pn +
                                      " " +
                                      (__t("bom.addedToPoDraft") ||
                                        "added to PO draft") +
                                      " (" +
                                      poDraft.length +
                                      " " +
                                      (__t("bom.items") || "items") +
                                      ")",
                                    {
                                      kind: "success",
                                      action: {
                                        label: __t("common.view") || "View",
                                        onClick: () =>
                                          window.__nav?.("procurement"),
                                      },
                                    },
                                  );
                                },
                              },
                              "divider",
                              {
                                icon: <Icon.Plus size={11} />,
                                label:
                                  __t("bom.duplicateRow") || "Duplicate row",
                                onClick: () => {
                                  const dup = (rs) =>
                                    rs.map((r) => {
                                      if (r.id === row.id) {
                                        const copy = {
                                          ...r,
                                          id: r.id + "-dup-" + Date.now(),
                                          pn: r.pn + "-COPY",
                                        };
                                        delete copy.children;
                                        return [r, copy];
                                      }
                                      if (r.children)
                                        return {
                                          ...r,
                                          children: dup(r.children).flat(),
                                        };
                                      return r;
                                    });
                                  const next = dup(rows).flat();
                                  setRows(next);
                                  markDirty();
                                  toast(
                                    row.pn +
                                      " " +
                                      (__t("bom.duplicated") || "duplicated"),
                                    { kind: "success" },
                                  );
                                },
                              },
                              {
                                icon: <Icon.Trash size={11} />,
                                label:
                                  __t("bom.deleteFromBom") || "Delete from BOM",
                                danger: true,
                                onClick: () => {
                                  const remove = (rs) =>
                                    rs
                                      .filter((r) => r.id !== row.id)
                                      .map((r) =>
                                        r.children
                                          ? {
                                              ...r,
                                              children: remove(r.children),
                                            }
                                          : r,
                                      );
                                  const next = remove(rows);
                                  setRows(next);
                                  markDirty();
                                  toast(
                                    row.pn +
                                      " " +
                                      (__t("bom.removedFromBom") ||
                                        "removed from BOM"),
                                    {
                                      kind: "warn",
                                      action: {
                                        label: __t("common.undo") || "Undo",
                                        onClick: () => {
                                          setRows(data.rows);
                                          toast(
                                            __t("bom.restored") || "Restored",
                                          );
                                        },
                                      },
                                    },
                                  );
                                },
                              },
                            ]}
                          />
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {selected.size > 0 && (
          <div className="bulk-bar">
            <span className="count">
              {selected.size} {__t("bom.selected") || "selected"}
            </span>
            <button
              onClick={() =>
                ctx?.openModal("bulk-edit", {
                  count: selected.size,
                  onApply: (patch) => {
                    const update = (rs) =>
                      rs.map((r) => {
                        if (selected.has(r.id))
                          return {
                            ...r,
                            ...patch,
                            children: r.children
                              ? update(r.children)
                              : undefined,
                          };
                        if (r.children)
                          return { ...r, children: update(r.children) };
                        return r;
                      });
                    setRows(update(rows));
                  },
                })
              }
            >
              <Icon.Edit size={12} /> {__t("bom.editFields") || "Edit fields"}
            </button>
            <button
              onClick={() => {
                const selectedRows = flat.filter(
                  (r) => selected.has(r.id) && !r.assembly,
                );
                const poDraft = window.__poDraft || [];
                selectedRows.forEach((r) =>
                  poDraft.push({
                    pn: r.pn,
                    name: r.name,
                    qty: r.qty || 1,
                    cost: r.cost,
                    vendor: r.vendor,
                  }),
                );
                window.__poDraft = poDraft;
                toast(
                  `${selectedRows.length} ${__t("bom.partsAddedToPoDraft") || "parts added to PO draft"} (${poDraft.length} ${__t("bom.total") || "total"})`,
                  {
                    kind: "success",
                    action: {
                      label: __t("common.view") || "View",
                      onClick: () => window.__nav?.("procurement"),
                    },
                  },
                );
              }}
            >
              <Icon.Cart size={12} /> {__t("bom.addToPo") || "Add to PO"}
            </button>
            <button
              onClick={() => {
                const exportRows = flat.filter((r) => selected.has(r.id));
                const csvRows = exportRows.map((r) => ({
                  pn: r.pn,
                  name: r.name,
                  rev: r.rev,
                  qty: r.qty,
                  uom: r.uom,
                  category: r.category,
                  vendor: r.vendor,
                  cost: r.cost,
                  lead: r.lead,
                  origin: r.origin,
                  status: r.status,
                }));
                const headers = Object.keys(csvRows[0] || {});
                const csv = [
                  headers.join(","),
                  ...csvRows.map((r) =>
                    headers
                      .map((h) => {
                        const v = r[h];
                        if (v == null) return "";
                        const s = String(v);
                        return s.includes(",") || s.includes('"')
                          ? `"${s.replace(/"/g, '""')}"`
                          : s;
                      })
                      .join(","),
                  ),
                ].join("\n");
                downloadBlob(csv, "bom_export.csv", "text/csv");
                toast(
                  `${__t("bom.exportedRows") || "Exported"} ${exportRows.length} ${__t("bom.rows") || "rows"} ${__t("bom.asCsv") || "as CSV"}`,
                  { kind: "success" },
                );
              }}
            >
              <Icon.Export size={12} /> {__t("common.export") || "Export"}
            </button>
            <span className="divider" />
            <button
              onClick={() => {
                const n = selected.size;
                const remove = (rs) =>
                  rs
                    .filter((r) => !selected.has(r.id))
                    .map((r) =>
                      r.children ? { ...r, children: remove(r.children) } : r,
                    );
                const next = remove(rows);
                setRows(next);
                markDirty();
                setSelected(new Set());
                toast(
                  `${n} ${__t("bom.partsRemoved") || "parts removed from BOM"}`,
                  {
                    kind: "warn",
                    action: {
                      label: __t("common.undo") || "Undo",
                      onClick: () => {
                        setRows(data.rows);
                        toast(__t("bom.restored") || "Restored");
                      },
                    },
                  },
                );
              }}
            >
              <Icon.Trash size={12} /> {__t("common.delete") || "Delete"}
            </button>
            <span className="divider" />
            <button
              onClick={clearSelection}
              title={__t("bom.clearSelection") || "Clear selection"}
              aria-label={__t("bom.clearSelection") || "Clear selection"}
            >
              <Icon.X size={12} />
            </button>
          </div>
        )}
      </div>
    </>
  );
}
BomEditor.propTypes = {
  data: PropTypes.object,
  onOpenDetail: PropTypes.func,
  density: PropTypes.any,
  search: PropTypes.any,
  activeCats: PropTypes.any,
  statusFilters: PropTypes.array,
  vendorFilters: PropTypes.array,
  originFilters: PropTypes.array,
  mode: PropTypes.string,
  collabChannel: PropTypes.string,
  collabDocId: PropTypes.string,
};
window.BomEditor = BomEditor;
window.fmt = fmt;
window.Sparkline = Sparkline;
window.LeadHeat = LeadHeat;
window.STATUS_CLASS = STATUS_CLASS;
