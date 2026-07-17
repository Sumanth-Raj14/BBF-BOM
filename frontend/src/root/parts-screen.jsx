import PropTypes from "prop-types";
import { storage } from "../utils/storage.js";
import { __t } from "../i18n";
import { toast } from "../utils/toast";
import {
  Button,
  Badge,
  StatusPill,
  ScreenHeader,
  EmptyState,
  DataTable,
  Tabs,
} from "../components/ui/index.js";
// Component Library — full catalog with facets, search, grid/list, dups.
// Keyboard operability for the active-filter removal chips (role="button"
// spans): mirror the click handler on Enter/Space, same as a native button.
function chipKeyDown(handler) {
  return (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handler();
    }
  };
}
// Flatten BOM tree into unique parts list with where-used count
function buildCatalog(data) {
  const map = new Map();
  const walk = (rs, lineage = []) =>
    rs.forEach((r) => {
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
    {
      id: "lib1",
      pn: "EL-CAP-100UF-25V",
      name: "Capacitor, 100µF 25V Electrolytic",
      rev: "A",
      qty: 0,
      uom: "EA",
      category: "Electrical",
      vendor: "Nichicon",
      manufacturer: "Nichicon",
      cost: 0.14,
      lead: 14,
      origin: "JP",
      status: "Released",
      trend: [0.13, 0.14, 0.14, 0.14, 0.14, 0.14, 0.14],
      whereUsed: [],
      totalQty: 0,
      instances: 0,
      material: "Aluminum/Electrolyte",
      weight: 2,
      dimensions: "Ø10 × 16 mm",
      tags: ["passive", "capacitor"],
      compliance: ["RoHS"],
      freight: 0.02,
      tax: 0.03,
      landedCost: 0.19,
    },
    {
      id: "lib2",
      pn: "EL-RES-10K-1%",
      name: "Resistor, 10kΩ ±1% 0805",
      rev: "—",
      qty: 0,
      uom: "EA",
      category: "Electrical",
      vendor: "Yageo",
      manufacturer: "Yageo",
      cost: 0.01,
      lead: 7,
      origin: "TW",
      status: "Released",
      trend: null,
      whereUsed: [],
      totalQty: 0,
      instances: 0,
      material: "Thick Film/Ceramic",
      weight: 0.03,
      dimensions: "2.0 × 1.25 mm (0805)",
      tags: ["passive", "resistor"],
      compliance: ["RoHS"],
      freight: 0.001,
      tax: 0.002,
      landedCost: 0.013,
    },
    {
      id: "lib3",
      pn: "MEC-SPR-08X20",
      name: "Compression Spring, 8mm × 20mm",
      rev: "A",
      qty: 0,
      uom: "EA",
      category: "Mechanical",
      vendor: "Lee Spring",
      manufacturer: "Lee Spring",
      cost: 1.2,
      lead: 10,
      origin: "US",
      status: "Released",
      trend: [1.15, 1.15, 1.18, 1.2, 1.2, 1.2, 1.2],
      whereUsed: [],
      totalQty: 0,
      instances: 0,
      material: "Spring Steel",
      weight: 4,
      dimensions: "Ø8 × 20 mm",
      customFields: { "Wire Diameter": "0.8 mm", "Max Load": "12 N" },
      tags: ["spring", "mechanical"],
      compliance: ["RoHS"],
      freight: 0.1,
      tax: 0.22,
      landedCost: 1.52,
    },
    {
      id: "lib4",
      pn: "HW-WSH-M3-FL",
      name: "Washer, M3 Flat Stainless",
      rev: "—",
      qty: 0,
      uom: "EA",
      category: "Hardware",
      vendor: "McMaster",
      manufacturer: "McMaster-Carr",
      cost: 0.03,
      lead: 2,
      origin: "US",
      status: "Released",
      trend: null,
      whereUsed: [],
      totalQty: 0,
      instances: 0,
      material: "Stainless Steel 304",
      weight: 0.3,
      dimensions: "M3 × Ø7 × 0.5 mm",
      tags: ["hardware", "washer"],
      compliance: ["RoHS"],
      freight: 0.004,
      tax: 0.006,
      landedCost: 0.04,
    },
    {
      id: "lib5",
      pn: "OPT-FLT-IR850",
      name: "IR Bandpass Filter, 850nm Ø25mm",
      rev: "B",
      qty: 0,
      uom: "EA",
      category: "Optical",
      vendor: "Thorlabs",
      manufacturer: "Thorlabs",
      cost: 42.0,
      lead: 21,
      origin: "US",
      status: "Released",
      trend: [40, 40, 41, 41, 42, 42, 42],
      whereUsed: [],
      totalQty: 0,
      instances: 0,
      material: "Soda Lime Glass",
      weight: 3,
      dimensions: "Ø25 × 1 mm",
      customFields: { Bandwidth: "850±10 nm", Transmission: ">90%" },
      tags: ["filter", "ir", "optical"],
      compliance: ["RoHS"],
      freight: 3.2,
      tax: 7.7,
      landedCost: 52.9,
    },
    {
      id: "lib6",
      pn: "CB-HDMI-50CM",
      name: "Cable, HDMI 2.1 50cm Shielded",
      rev: "—",
      qty: 0,
      uom: "EA",
      category: "Cable",
      vendor: "Belkin",
      manufacturer: "Belkin",
      cost: 8.4,
      lead: 9,
      origin: "CN",
      status: "Released",
      trend: null,
      whereUsed: [],
      totalQty: 0,
      instances: 0,
      material: "PVC/Copper",
      weight: 42,
      dimensions: "500 mm length",
      tags: ["cable", "hdmi"],
      compliance: ["RoHS"],
      freight: 0.6,
      tax: 1.5,
      landedCost: 10.5,
    },
    {
      id: "lib7",
      pn: "EL-MCU-STM32F4",
      name: "MCU, STM32F407VGT6 (legacy)",
      rev: "D",
      qty: 0,
      uom: "EA",
      category: "Electrical",
      vendor: "STMicro",
      manufacturer: "STMicroelectronics",
      cost: 7.2,
      lead: 35,
      origin: "FR",
      status: "Deprecated",
      trend: [8, 7.8, 7.6, 7.4, 7.2, 7.2, 7.2],
      whereUsed: [],
      totalQty: 0,
      instances: 0,
      material: "Silicon/LQFP-100",
      weight: 4,
      dimensions: "14 × 14 mm (LQFP-100)",
      tags: ["mcu", "legacy", "deprecated"],
      compliance: ["RoHS", "REACH"],
      freight: 0.6,
      tax: 1.3,
      landedCost: 9.1,
    },
    {
      id: "lib8",
      pn: "HW-FAS-M3-08-A",
      name: "Screw, M3×8 Socket Head A2",
      rev: "—",
      qty: 0,
      uom: "EA",
      category: "Hardware",
      vendor: "Bossard",
      manufacturer: "Bossard",
      cost: 0.09,
      lead: 5,
      origin: "DE",
      status: "Released",
      trend: null,
      whereUsed: [],
      totalQty: 0,
      instances: 0,
      dupOf: "HW-FAS-M3-08",
      material: "Stainless Steel A2-70",
      weight: 1.3,
      dimensions: "M3 × 8 mm",
      tags: ["hardware", "screw", "fastener"],
      compliance: ["RoHS"],
      freight: 0.01,
      tax: 0.02,
      landedCost: 0.12,
    },
  ];
  libraryOnly.forEach((p) => map.set(p.pn, p));
  return Array.from(map.values());
}
// Duplicate detection (simplified: by name similarity)
function detectDuplicates(parts) {
  const groups = [];
  // Hard-coded one duplicate group for demo
  const a = parts.find((p) => p.pn === "HW-FAS-M3-08");
  const b = parts.find((p) => p.pn === "HW-FAS-M3-08-A");
  if (a && b)
    groups.push({
      similarity: 0.95,
      parts: [a, b],
      reason: "Name + dimensions match",
    });
  const c = parts.find((p) => p.pn === "EL-MCU-STM32F4");
  const d = parts.find((p) => p.pn === "EL-MCU-STM32H7");
  if (c && d)
    groups.push({
      similarity: 0.62,
      parts: [c, d],
      reason: "Same family, different generation",
    });
  return groups;
}
function PartsScreen({ openModal, onOpenDetail }) {
  PartsScreen.propTypes = {
    openModal: PropTypes.func,
    onOpenDetail: PropTypes.func,
  };
  const data = BOM_DATA;
  const ctx = useAppStore();
  const rows = ctx?.rows || data.rows;
  const allParts = React.useMemo(() => buildCatalog({ rows }), [rows]);
  const addPartToBom = React.useCallback(
    (p) => {
      const currentRows = ctx?.rows || data.rows;
      const setRows = ctx?.setRows || (() => {});
      const newRow = {
        id: "added-" + Date.now() + "-" + p.pn.replace(/[^a-zA-Z0-9-]/g, ""),
        pn: p.pn,
        name: p.name,
        rev: p.rev || "—",
        qty: 1,
        uom: p.uom || "EA",
        category: p.category || "",
        subCategory: p.subCategory || "",
        vendor: p.vendor || "",
        manufacturer: p.manufacturer || "",
        cost: p.cost || 0,
        lead: p.lead || null,
        origin: p.origin || "",
        status: p.status || "Draft",
        trend: p.trend || null,
        material: p.material || "",
        weight: p.weight || null,
        dimensions: p.dimensions || "",
        imageUrl: p.imageUrl || null,
        tags: p.tags || [],
        compliance: p.compliance || [],
        freight: p.freight || 0,
        tax: p.tax || 0,
        landedCost: p.landedCost || 0,
        countryHistory: p.countryHistory || [],
        vendorPrices: p.vendorPrices || [],
        cadUrl: p.cadUrl || null,
        barcode: p.barcode || null,
        customFields: p.customFields || {},
        assembly: false,
      };
      const rootAssembly = currentRows.find(
        (r) => r.assembly && Array.isArray(r.children),
      );
      let next;
      if (rootAssembly) {
        next = currentRows.map((r) =>
          r.id === rootAssembly.id
            ? { ...r, children: [...r.children, newRow] }
            : r,
        );
      } else {
        next = [...currentRows, newRow];
      }
      setRows(next);
      toast(p.pn + " " + (__t("parts.addedToBom") || "added to BOM"), {
        kind: "success",
        action: {
          label: __t("common.undo") || "Undo",
          onClick: () => {
            const undo = next.map((r) =>
              r.id === rootAssembly?.id
                ? {
                    ...r,
                    children: r.children.filter((c) => c.id !== newRow.id),
                  }
                : r,
            );
            setRows(undo);
            toast(
              p.pn + " " + (__t("parts.removedFromBom") || "removed from BOM"),
              { kind: "warn" },
            );
          },
        },
      });
    },
    [ctx, data.rows],
  );
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
    allParts.forEach((p) => {
      c.cat[p.category] = (c.cat[p.category] || 0) + 1;
      c.status[p.status] = (c.status[p.status] || 0) + 1;
      c.origin[p.origin] = (c.origin[p.origin] || 0) + 1;
      c.vendor[p.vendor] = (c.vendor[p.vendor] || 0) + 1;
    });
    return c;
  }, [allParts]);
  const allCats = Object.keys(counts.cat).sort();
  const allStatuses = [
    "Released",
    "Approved",
    "Review",
    "Draft",
    "Deprecated",
    "Obsolete",
  ].filter((s) => counts.status[s]);
  const allOrigins = Object.keys(counts.origin)
    .filter((o) => o !== "—")
    .sort();
  const topVendors = Object.entries(counts.vendor)
    .filter(([k]) => k !== "—")
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([k]) => k);
  const toggleSet = (set, val, setter) => {
    const next = new Set(set);
    next.has(val) ? next.delete(val) : next.add(val);
    setter(next);
  };
  const filtered = React.useMemo(() => {
    const list = allParts.filter((p) => {
      if (
        search &&
        !(p.pn + " " + p.name + " " + p.vendor)
          .toLowerCase()
          .includes(search.toLowerCase())
      )
        return false;
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
  }, [
    allParts,
    search,
    selectedCats,
    selectedStatus,
    selectedOrigins,
    selectedVendors,
    showOnlyUnused,
    sort,
  ]);
  const clearAll = () => {
    setSearch("");
    setSelectedCats(new Set());
    setSelectedStatus(new Set());
    setSelectedOrigins(new Set());
    setSelectedVendors(new Set());
    setShowOnlyUnused(false);
  };
  const totalFilters =
    selectedCats.size +
    selectedStatus.size +
    selectedOrigins.size +
    selectedVendors.size +
    (showOnlyUnused ? 1 : 0) +
    (search ? 1 : 0);
  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map((p) => p.pn)));
  };
  return (
    <div
      className="parts-page"
      data-screen-label="Components"
      data-density={ctx?.gridDensity || "dense"}
    >
      {/* Top bar */}
      <ScreenHeader
        className="parts-topbar"
        title={__t("parts.title") || "Component Library"}
        description={
          <span className="font-mono fs-11 fg-3">
            {filtered.length} {__t("common.of") || "of"} {allParts.length}{" "}
            {__t("parts.parts") || "parts"} · {Object.keys(counts.cat).length}{" "}
            {__t("parts.categories") || "categories"} ·{" "}
            {Object.keys(counts.vendor).length - 1}{" "}
            {__t("parts.vendors") || "vendors"}
          </span>
        }
        actions={
          <>
        <div className="search w-280" style={{ height: "var(--control-h)" }}>
          <Icon.Search size={12} />
          <input
            id="parts-search"
            name="partsSearch"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              __t("parts.searchPlaceholder") || "Search PN, name, vendor\u2026"
            }
            aria-label={__t("parts.searchParts") || "Search parts"}
          />
          {search && (
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              aria-label={__t("common.clearSearch") || "Clear search"}
              onClick={() => setSearch("")}
            >
              <Icon.X size={10} />
            </Button>
          )}
        </div>
        <Tabs
          ariaLabel={__t("parts.viewMode") || "View mode"}
          value={view}
          onChange={setView}
          items={[
            { value: "grid", label: __t("parts.grid") || "Grid" },
            { value: "list", label: __t("parts.list") || "List" },
          ]}
        />
        <DropdownButton
          width={180}
          trigger={
            <Button variant="secondary" size="sm">
              {__t("common.sort") || "Sort"}: {__t("parts.sortName") || "Name"}{" "}
              <Icon.ChevronDown size={10} />
            </Button>
          }
          items={[
            {
              label: __t("parts.sortNameAZ") || "Name A-Z",
              icon:
                sort === "name" ? (
                  <Icon.Check size={11} />
                ) : (
                  <span className="w-11" />
                ),
              onClick: () => setSort("name"),
            },
            {
              label: __t("parts.sortPn") || "Part No.",
              icon:
                sort === "pn" ? (
                  <Icon.Check size={11} />
                ) : (
                  <span className="w-11" />
                ),
              onClick: () => setSort("pn"),
            },
            {
              label: __t("parts.sortCost") || "Cost (high \u2192 low)",
              icon:
                sort === "cost" ? (
                  <Icon.Check size={11} />
                ) : (
                  <span className="w-11" />
                ),
              onClick: () => setSort("cost"),
            },
            {
              label: __t("parts.sortLead") || "Lead time",
              icon:
                sort === "lead" ? (
                  <Icon.Check size={11} />
                ) : (
                  <span className="w-11" />
                ),
              onClick: () => setSort("lead"),
            },
            {
              label: __t("parts.sortUsage") || "Where-used count",
              icon:
                sort === "used" ? (
                  <Icon.Check size={11} />
                ) : (
                  <span className="w-11" />
                ),
              onClick: () => setSort("used"),
            },
          ]}
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            openModal("barcode-scan", { onFound: (pn) => setSearch(pn) })
          }
        >
          <Icon.Scan size={12} /> {__t("parts.scan") || "Scan"}
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => openModal("new-part")}
        >
          <Icon.Plus size={12} /> {__t("part.newPart") || "New part"}
        </Button>
          </>
        }
      />
      {/* Duplicate banner */}
      {showDupsBanner && dupGroups.length > 0 && (
        <div className="dup-banner">
          <span className="ico">
            <Icon.Sparkles size={14} />
          </span>
          <div>
            <strong>
              {dupGroups.length}{" "}
              {__t("parts.potentialDuplicates") ||
                "potential duplicates detected"}
            </strong>
            <span className="fg-3 ml-8 fs-11 font-mono">
              {dupGroups
                .map((g) => g.parts[0].pn + " ≈ " + g.parts[1].pn)
                .join(" · ")}
            </span>
          </div>
          <div className="flex-1" />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setFocusedDup(dupGroups[0])}
          >
            {__t("parts.review") || "Review"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            aria-label={__t("parts.dismiss") || "Dismiss"}
            onClick={() => setShowDupsBanner(false)}
          >
            <Icon.X size={11} />
          </Button>
        </div>
      )}
      <div className="parts-body">
        {/* Left facets */}
        <aside className="parts-facets">
          <div className="facet-section">
            <div className="facet-h">
              <span>{__t("parts.filters") || "Filters"}</span>
              {totalFilters > 0 && (
                <button type="button" onClick={clearAll}>
                  {__t("parts.clearWithCount") || "Clear"} ({totalFilters})
                </button>
              )}
            </div>
          </div>
          <div className="facet-section">
            <div className="facet-h">
              <span>{__t("part.category") || "Category"}</span>
            </div>
            {allCats.map((c) => (
              <label key={c} className="facet-row">
                <input
                  id={"parts-cat-" + c}
                  name="partsCategory"
                  type="checkbox"
                  checked={selectedCats.has(c)}
                  onChange={() => toggleSet(selectedCats, c, setSelectedCats)}
                />
                <span
                  className={("cat " + c.toLowerCase() + " fs-9").trim()}
                  style={{ padding: "1px 4px" }}
                >
                  {c}
                </span>
                <span className="cnt">{counts.cat[c]}</span>
              </label>
            ))}
          </div>
          <div className="facet-section">
            <div className="facet-h">
              <span>{__t("part.status") || "Status"}</span>
            </div>
            {allStatuses.map((s) => (
              <label key={s} className="facet-row">
                <input
                  id={"parts-status-" + s}
                  name="partsStatus"
                  type="checkbox"
                  checked={selectedStatus.has(s)}
                  onChange={() =>
                    toggleSet(selectedStatus, s, setSelectedStatus)
                  }
                />
                <StatusPill status={s} />
                <span className="cnt">{counts.status[s]}</span>
              </label>
            ))}
          </div>
          <div className="facet-section">
            <div className="facet-h">
              <span>{__t("part.origin") || "Origin"}</span>
            </div>
            {allOrigins.map((o) => (
              <label key={o} className="facet-row">
                <input
                  id={"parts-origin-" + o}
                  name="partsOrigin"
                  type="checkbox"
                  checked={selectedOrigins.has(o)}
                  onChange={() =>
                    toggleSet(selectedOrigins, o, setSelectedOrigins)
                  }
                />
                <span
                  className="font-mono fs-10 border-line br-2 bg-sunk"
                  style={{ padding: "1px 5px" }}
                >
                  {o}
                </span>
                <span className="cnt">{counts.origin[o]}</span>
              </label>
            ))}
          </div>
          <div className="facet-section">
            <div className="facet-h">
              <span>{__t("part.vendor") || "Vendor"}</span>
            </div>
            {topVendors.map((v) => (
              <label key={v} className="facet-row">
                <input
                  id={"parts-vendor-" + v}
                  name="partsVendor"
                  type="checkbox"
                  checked={selectedVendors.has(v)}
                  onChange={() =>
                    toggleSet(selectedVendors, v, setSelectedVendors)
                  }
                />
                <span className="lbl">{v}</span>
                <span className="cnt">{counts.vendor[v]}</span>
              </label>
            ))}
          </div>
          <div className="facet-section">
            <div className="facet-h">
              <span>{__t("parts.library") || "Library"}</span>
            </div>
            <label className="facet-row">
              <input
                id="parts-unused"
                name="showUnused"
                type="checkbox"
                checked={showOnlyUnused}
                onChange={(e) => setShowOnlyUnused(e.target.checked)}
              />
              <span className="lbl">
                {__t("parts.notInBom") || "Not in any active BOM"}
              </span>
            </label>
          </div>
        </aside>
        {/* Main content */}
        <main className="parts-main">
          {selectedIds.size > 0 && (
            <div className="parts-bulk">
              <span className="count">
                {selectedIds.size} {__t("parts.selected") || "selected"}
              </span>
              <button
                onClick={() => {
                  const selected = allParts.filter((p) =>
                    selectedIds.has(p.pn),
                  );
                  selected.forEach((p) => addPartToBom(p));
                  toast(
                    __t("parts.addedPartsToBom") ||
                      "Added " + selectedIds.size + " parts to BOM",
                    { kind: "success" },
                  );
                }}
              >
                <Icon.Plus size={12} /> {__t("parts.addToBom") || "Add to BOM"}
              </button>
              <button
                onClick={() => {
                  const pns = [...selectedIds];
                  openModal("bulk-edit", {
                    count: pns.length,
                    onApply: (patch) => {
                      const next = ctx?.rows || data.rows;
                      const patched = next.map((r) => {
                        const n = { ...r };
                        if (selectedIds.has(n.pn)) Object.assign(n, patch);
                        return n;
                      });
                      ctx?.setRows?.(patched);
                      setSelectedIds(new Set());
                      toast(
                        __t("parts.updatedParts") ||
                          "Updated " + pns.length + " parts",
                        { kind: "success" },
                      );
                    },
                  });
                }}
              >
                <Icon.Edit size={12} /> {__t("parts.bulkEdit") || "Bulk edit"}
              </button>
              <button
                onClick={() => {
                  const selected = allParts.filter((p) =>
                    selectedIds.has(p.pn),
                  );
                  const csvRows = selected.map((p) => ({
                    pn: p.pn,
                    name: p.name,
                    category: p.category,
                    vendor: p.vendor,
                    cost: p.cost,
                    lead: p.lead,
                    origin: p.origin,
                    status: p.status,
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
                  downloadBlob(csv, "parts_export.csv", "text/csv");
                  toast(
                    __t("parts.exportedCsv") ||
                      "Exported " + selectedIds.size + " parts as CSV",
                    { kind: "success" },
                  );
                }}
              >
                <Icon.Export size={12} /> {__t("common.export") || "Export"}
              </button>
              <span className="flex-1" />
              <button
                onClick={() => {
                  const next = ctx?.rows || data.rows;
                  const patched = next.map((r) => {
                    if (!selectedIds.has(r.pn)) return r;
                    return { ...r, status: "Obsolete" };
                  });
                  ctx?.setRows?.(patched);
                  setSelectedIds(new Set());
                  toast(
                    __t("parts.markedObsolete") ||
                      selectedIds.size + " parts marked obsolete",
                    { kind: "warn" },
                  );
                }}
              >
                <Icon.Trash size={12} />{" "}
                {__t("parts.markObsolete") || "Mark obsolete"}
              </button>
              <button
                className="x"
                onClick={() => setSelectedIds(new Set())}
                aria-label={__t("parts.clearSelection") || "Clear selection"}
              >
                <Icon.X size={12} />
              </button>
            </div>
          )}
          {/* Quick chips of active filters */}
          {totalFilters > 0 && (
            <div className="active-filters">
              {search && (
                <span
                  className="chip active"
                  role="button"
                  tabIndex={0}
                  aria-label={
                    (__t("parts.removeFilter") || "Remove filter") + ": " + search
                  }
                  onClick={() => setSearch("")}
                  onKeyDown={chipKeyDown(() => setSearch(""))}
                >
                  “{search}” <Icon.X size={9} />
                </span>
              )}
              {[...selectedCats].map((c) => (
                <span
                  key={c}
                  className="chip active"
                  role="button"
                  tabIndex={0}
                  aria-label={
                    (__t("parts.removeFilter") || "Remove filter") + ": " + c
                  }
                  onClick={() => toggleSet(selectedCats, c, setSelectedCats)}
                  onKeyDown={chipKeyDown(() =>
                    toggleSet(selectedCats, c, setSelectedCats),
                  )}
                >
                  {c} <Icon.X size={9} />
                </span>
              ))}
              {[...selectedStatus].map((s) => (
                <span
                  key={s}
                  className="chip active"
                  role="button"
                  tabIndex={0}
                  aria-label={
                    (__t("parts.removeFilter") || "Remove filter") + ": " + s
                  }
                  onClick={() =>
                    toggleSet(selectedStatus, s, setSelectedStatus)
                  }
                  onKeyDown={chipKeyDown(() =>
                    toggleSet(selectedStatus, s, setSelectedStatus),
                  )}
                >
                  {s} <Icon.X size={9} />
                </span>
              ))}
              {[...selectedOrigins].map((o) => (
                <span
                  key={o}
                  className="chip active"
                  role="button"
                  tabIndex={0}
                  aria-label={
                    (__t("parts.removeFilter") || "Remove filter") + ": " + o
                  }
                  onClick={() =>
                    toggleSet(selectedOrigins, o, setSelectedOrigins)
                  }
                  onKeyDown={chipKeyDown(() =>
                    toggleSet(selectedOrigins, o, setSelectedOrigins),
                  )}
                >
                  {o} <Icon.X size={9} />
                </span>
              ))}
              {[...selectedVendors].map((v) => (
                <span
                  key={v}
                  className="chip active"
                  role="button"
                  tabIndex={0}
                  aria-label={
                    (__t("parts.removeFilter") || "Remove filter") + ": " + v
                  }
                  onClick={() =>
                    toggleSet(selectedVendors, v, setSelectedVendors)
                  }
                  onKeyDown={chipKeyDown(() =>
                    toggleSet(selectedVendors, v, setSelectedVendors),
                  )}
                >
                  {v} <Icon.X size={9} />
                </span>
              ))}
              {showOnlyUnused && (
                <span
                  className="chip active"
                  role="button"
                  tabIndex={0}
                  aria-label={
                    (__t("parts.removeFilter") || "Remove filter") +
                    ": " +
                    (__t("parts.unusedParts") || "Unused parts")
                  }
                  onClick={() => setShowOnlyUnused(false)}
                  onKeyDown={chipKeyDown(() => setShowOnlyUnused(false))}
                >
                  {__t("parts.unusedParts") || "Unused parts"}{" "}
                  <Icon.X size={9} />
                </span>
              )}
              <Button variant="ghost" size="sm" onClick={clearAll}>
                {__t("parts.clearAll") || "Clear all"}
              </Button>
            </div>
          )}
          {filtered.length === 0 ? (
            <EmptyState
              icon="∅"
              title={__t("parts.noMatch") || "No parts match these filters"}
              message={
                __t("parts.tryClearingFilters") ||
                "Try clearing some filters or searching for a different term."
              }
              actions={
                <Button variant="secondary" size="sm" onClick={clearAll}>
                  {__t("parts.clearFilters") || "Clear filters"}
                </Button>
              }
            />
          ) : view === "grid" ? (
            <PartsGrid
              parts={filtered}
              selectedIds={selectedIds}
              setSelectedIds={setSelectedIds}
              onOpenDetail={onOpenDetail}
              dupGroups={dupGroups}
              addPartToBom={addPartToBom}
            />
          ) : (
            <PartsList
              parts={filtered}
              selectedIds={selectedIds}
              setSelectedIds={setSelectedIds}
              onOpenDetail={onOpenDetail}
              toggleSelectAll={toggleSelectAll}
              dupGroups={dupGroups}
              addPartToBom={addPartToBom}
            />
          )}
        </main>
      </div>
      {/* Duplicate review modal */}
      <Modal
        open={!!focusedDup}
        onClose={() => setFocusedDup(null)}
        icon={<Icon.Sparkles size={16} />}
        title={__t("parts.reviewDuplicate") || "Review potential duplicate"}
        subtitle={
          focusedDup
            ? `${Math.round(focusedDup.similarity * 100)}% ${__t("parts.similarity") || "similarity"} · ${focusedDup.reason}`
            : ""
        }
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => setFocusedDup(null)}>
              {__t("app.cancel") || "Cancel"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                const dismissed = storage.dupDismissed.get();
                focusedDup?.parts?.forEach((p) => {
                  if (!dismissed.includes(p.pn)) dismissed.push(p.pn);
                });
                storage.dupDismissed.set(dismissed);
                setFocusedDup(null);
                toast(
                  __t("parts.duplicateDismissed") || "Duplicate dismissed",
                  { kind: "info" },
                );
              }}
            >
              {__t("parts.notDuplicate") || "Not a duplicate"}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                const next = ctx?.rows || data.rows;
                const patched = next.map((r) => {
                  if (
                    focusedDup?.parts?.length >= 2 &&
                    r.pn === focusedDup.parts[1].pn
                  ) {
                    return {
                      ...r,
                      status: "Deprecated",
                      dupOf: focusedDup.parts[0].pn,
                    };
                  }
                  return r;
                });
                ctx?.setRows?.(patched);
                setFocusedDup(null);
                toast(
                  __t("parts.partsMerged") ||
                    "Parts merged — older PN deprecated",
                  { kind: "success" },
                );
              }}
            >
              <Icon.Check size={12} />{" "}
              {__t("parts.mergeKeepNewer") || "Merge → keep newer"}
            </Button>
          </>
        }
      >
        {focusedDup && (
          <div
            className="d-grid border-line rounded-r2 overflow-h"
            style={{
              gridTemplateColumns: "1fr 1fr",
              gap: 1,
              background: "var(--line)",
            }}
          >
            {focusedDup.parts.map((p, i) => (
              <div key={p.pn} className="bg-canvas" style={{ padding: 16 }}>
                <div className="flex justify-between items-baseline">
                  <div className="font-mono fs-11 fg-3">
                    {p.pn} · Rev {p.rev}
                  </div>
                  {i === 0 && (
                    <Badge tone="accent" pill>
                      {__t("parts.newer") || "NEWER"}
                    </Badge>
                  )}
                </div>
                <h4 className="fs-14" style={{ margin: "4px 0 12px" }}>
                  {p.name}
                </h4>
                <dl
                  className="kv-grid"
                  style={{ gridTemplateColumns: "90px 1fr" }}
                >
                  <dt>Category</dt>
                  <dd className="sans">
                    <span className={"cat " + p.category.toLowerCase()}>
                      {p.category}
                    </span>
                  </dd>
                  <dt>Vendor</dt>
                  <dd className="sans">{p.vendor}</dd>
                  <dt>Cost</dt>
                  <dd>{INR(p.cost, 2)}</dd>
                  <dt>Lead</dt>
                  <dd>{p.lead} days</dd>
                  <dt>Origin</dt>
                  <dd>{p.origin}</dd>
                  <dt>Status</dt>
                  <dd className="sans">
                    <StatusPill status={p.status} />
                  </dd>
                  <dt>Used in</dt>
                  <dd>
                    {p.instances} BOM{p.instances !== 1 ? "s" : ""}
                  </dd>
                </dl>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
// ============ Grid view ============
function PartsGrid({
  parts,
  selectedIds,
  setSelectedIds,
  onOpenDetail,
  dupGroups,
  addPartToBom,
}) {
  const ctx = useAppStore();
  const data = BOM_DATA;
  const dupSet = new Set(dupGroups.flatMap((g) => g.parts.map((p) => p.pn)));
  return (
    <div className="parts-grid">
      {parts.map((p) => {
        const isSel = selectedIds.has(p.pn);
        const isDup = dupSet.has(p.pn);
        return (
          <div key={p.pn} className={"part-card " + (isSel ? "selected" : "")}>
            <div className="part-card-thumb" data-pn={p.pn}>
              <input
                type="checkbox"
                checked={isSel}
                className="pos-absolute row-checkbox"
                onChange={() => {
                  const next = new Set(selectedIds);
                  next.has(p.pn) ? next.delete(p.pn) : next.add(p.pn);
                  setSelectedIds(next);
                }}
                style={{ top: 6, left: 6, zIndex: 2 }}
                onClick={(e) => e.stopPropagation()}
              />
              {isDup && (
                <Badge
                  tone="warning"
                  className="pos-absolute"
                  style={{ top: 6, right: 6 }}
                >
                  {__t("parts.dup") || "DUP"}
                </Badge>
              )}
              {p.imageUrl ? (
                <img
                  src={p.imageUrl}
                  alt={p.pn}
                  loading="lazy"
                  className="w-100p h-100p"
                  style={{ objectFit: "cover" }}
                />
              ) : (
                <div className="thumb-pattern" />
              )}
              <div className="thumb-label">{p.pn}</div>
            </div>
            <div
              className="part-card-body cursor-pointer"
              onClick={() => onOpenDetail(p)}
            >
              <div className="part-name">{p.name}</div>
              <div className="part-meta">
                <span className={"cat " + p.category.toLowerCase()}>
                  {p.category}
                </span>
                <StatusPill status={p.status} />
              </div>
              <dl className="part-kv">
                <dt>{__t("part.vendor") || "Vendor"}</dt>
                <dd>{p.vendor}</dd>
                <dt>{__t("part.cost") || "Cost"}</dt>
                <dd>
                  {INR(p.cost, 2)} <span className="fg-3">/{p.uom}</span>
                </dd>
                <dt>{__t("part.leadTime") || "Lead"}</dt>
                <dd>{p.lead ? p.lead + "d" : "—"}</dd>
                <dt>{__t("part.origin") || "Origin"}</dt>
                <dd>{p.origin}</dd>
              </dl>
              <div className="part-foot">
                <span
                  className="font-mono fs-10"
                  style={{
                    color: p.instances === 0 ? "var(--fg-4)" : "var(--fg-3)",
                  }}
                >
                  {p.instances === 0
                    ? __t("parts.libraryOnly") || "Library only"
                    : p.instances === 1
                      ? __t("parts.usedInOneBom") || "Used in 1 BOM"
                      : (__t("parts.usedInBoms") || "Used in {n} BOMs").replace(
                          "{n}",
                          p.instances,
                        )}
                </span>
                <Sparkline data={p.trend} />
              </div>
            </div>
            <div
              className="part-card-actions"
              onClick={(e) => e.stopPropagation()}
            >
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                onClick={() => onOpenDetail(p)}
                title={__t("parts.openDetail") || "Open detail"}
                aria-label={__t("parts.openDetails") || "Open details"}
              >
                <Icon.Chevron size={11} />
              </Button>
              <DropdownButton
                width={200}
                trigger={
                  <Button
                    variant="ghost"
                    size="sm"
                    iconOnly
                    aria-label={__t("parts.moreOptions") || "More options"}
                  >
                    <Icon.Dots size={11} />
                  </Button>
                }
                items={[
                  {
                    icon: <Icon.Chevron size={11} />,
                    label: __t("parts.openDetail") || "Open detail",
                    onClick: () => onOpenDetail(p),
                  },
                  {
                    icon: <Icon.Plus size={11} />,
                    label: __t("parts.addToBomShort") || "Add to BOM",
                    onClick: () => addPartToBom(p),
                  },
                  {
                    icon: <Icon.Cart size={11} />,
                    label: __t("parts.addToPoDraft") || "Add to PO draft",
                    onClick: () => {
                      const poDraft = window.__poDraft || [];
                      poDraft.push({
                        pn: p.pn,
                        name: p.name,
                        cost: p.cost,
                        vendor: p.vendor,
                      });
                      window.__poDraft = poDraft;
                      toast(
                        p.pn +
                          " " +
                          (__t("parts.addedToPoDraft") || "added to PO draft") +
                          " (" +
                          poDraft.length +
                          " " +
                          (__t("parts.items") || "items") +
                          ")",
                        { kind: "success" },
                      );
                    },
                  },
                  {
                    icon: <Icon.Search size={11} />,
                    label: __t("parts.findAlternates") || "Find alternates",
                    onClick: () => {
                      if (ctx?.openModal) ctx.openModal("find-alternates", p);
                      else
                        toast(
                          __t("parts.searchingAlternates") ||
                            "Searching alternates for " + p.pn,
                        );
                    },
                  },
                  "divider",
                  {
                    icon: <Icon.Edit size={11} />,
                    label: __t("common.edit") || "Edit",
                    onClick: () => onOpenDetail(p),
                  },
                  {
                    icon: <Icon.Trash size={11} />,
                    label: __t("parts.markObsolete") || "Mark obsolete",
                    danger: true,
                    onClick: () => {
                      const next = ctx?.rows || data.rows;
                      const patched = next.map((r) =>
                        r.pn === p.pn ? { ...r, status: "Obsolete" } : r,
                      );
                      ctx?.setRows?.(patched);
                      toast(
                        p.pn +
                          " " +
                          (__t("parts.markedObsolete") || "marked obsolete"),
                        { kind: "warn" },
                      );
                    },
                  },
                ]}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
PartsGrid.propTypes = {
  parts: PropTypes.any,
  selectedIds: PropTypes.any,
  setSelectedIds: PropTypes.any,
  onOpenDetail: PropTypes.func,
  dupGroups: PropTypes.any,
  addPartToBom: PropTypes.any,
};
// ============ List view ============
function PartsList({
  parts,
  selectedIds,
  setSelectedIds,
  onOpenDetail,
  toggleSelectAll,
  dupGroups,
  addPartToBom,
}) {
  const ctx = useAppStore();
  const data = BOM_DATA;
  const dupSet = new Set(dupGroups.flatMap((g) => g.parts.map((p) => p.pn)));
  const allSelected =
    parts.length > 0 && parts.every((p) => selectedIds.has(p.pn));
  const someSelected = !allSelected && parts.some((p) => selectedIds.has(p.pn));

  const columns = [
    {
      key: "select",
      header: (
        <input
          id="parts-select-all"
          name="selectAll"
          type="checkbox"
          className={"row-checkbox " + (someSelected ? "indeterminate" : "")}
          checked={allSelected}
          onChange={toggleSelectAll}
          aria-label={__t("parts.selectAll") || "Select all parts"}
          onClick={(e) => e.stopPropagation()}
        />
      ),
      width: 28,
      render: (p) => (
        <input
          type="checkbox"
          className="row-checkbox"
          checked={selectedIds.has(p.pn)}
          aria-label={
            (__t("parts.selectPart") || "Select") + " " + p.pn
          }
          onChange={() => {
            const next = new Set(selectedIds);
            next.has(p.pn) ? next.delete(p.pn) : next.add(p.pn);
            setSelectedIds(next);
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ),
    },
    {
      key: "thumb",
      header: "",
      width: 32,
      render: (p) =>
        p.imageUrl ? (
          <img
            src={p.imageUrl}
            alt=""
            loading="lazy"
            className="w-28 h-28 br-4 d-block"
            style={{ objectFit: "cover" }}
          />
        ) : (
          <span className="d-iblock w-28 h-28 br-4 bg-sunk" />
        ),
    },
    {
      key: "pn",
      header: __t("part.partNumber") || "Part No.",
      render: (p) => (
        <span className="mono inline-flex items-center gap-6">
          {p.pn}
          {dupSet.has(p.pn) && (
            <Badge tone="warning" style={{ fontSize: 8, padding: "0 3px" }}>
              {__t("parts.dup") || "DUP"}
            </Badge>
          )}
        </span>
      ),
    },
    { key: "name", header: __t("common.name") || "Name" },
    {
      key: "category",
      header: __t("part.category") || "Category",
      render: (p) => (
        <span className={"cat " + p.category.toLowerCase()}>
          {p.category}
        </span>
      ),
    },
    { key: "vendor", header: __t("part.vendor") || "Vendor" },
    {
      key: "cost",
      header: __t("part.unit") || "Unit",
      align: "num",
      render: (p) => <span className="mono">{INR(p.cost, 2)}</span>,
    },
    {
      key: "lead",
      header: __t("part.leadTime") || "Lead",
      render: (p) => <LeadHeat days={p.lead} />,
    },
    {
      key: "origin",
      header: __t("part.origin") || "Origin",
      render: (p) => <span className="mono">{p.origin}</span>,
    },
    {
      key: "status",
      header: __t("part.status") || "Status",
      render: (p) => <StatusPill status={p.status} />,
    },
    {
      key: "usedIn",
      header: __t("parts.usedIn") || "Used in",
      render: (p) => (
        <span
          className="mono"
          style={{ color: p.instances === 0 ? "var(--fg-4)" : "var(--fg-2)" }}
        >
          {p.instances === 0
            ? "—"
            : p.instances +
              " " +
              (__t("parts.bomCount") || "BOM") +
              (p.instances !== 1 ? "s" : "")}
        </span>
      ),
    },
    {
      key: "trend",
      header: __t("parts.trend") || "Trend",
      render: (p) => <Sparkline data={p.trend} />,
    },
    {
      key: "actions",
      header: "",
      render: (p) => (
        <span className="inline-flex gap-2" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            aria-label={__t("parts.openDetails") || "Open details"}
            onClick={() => onOpenDetail(p)}
          >
            <Icon.Chevron size={11} />
          </Button>
          <DropdownButton
            width={200}
            trigger={
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                aria-label={__t("parts.moreOptions") || "More options"}
              >
                <Icon.Dots size={11} />
              </Button>
            }
            items={[
              {
                icon: <Icon.Plus size={11} />,
                label: __t("parts.addToBomShort") || "Add to BOM",
                onClick: () => addPartToBom(p),
              },
              {
                icon: <Icon.Cart size={11} />,
                label: __t("parts.addToPoDraft") || "Add to PO draft",
                onClick: () => {
                  const poDraft = window.__poDraft || [];
                  poDraft.push({
                    pn: p.pn,
                    name: p.name,
                    cost: p.cost,
                    vendor: p.vendor,
                  });
                  window.__poDraft = poDraft;
                  toast(
                    p.pn +
                      " " +
                      (__t("parts.addedToPoDraft") || "added to PO draft") +
                      " (" +
                      poDraft.length +
                      " " +
                      (__t("parts.items") || "items") +
                      ")",
                    { kind: "success" },
                  );
                },
              },
              {
                icon: <Icon.Search size={11} />,
                label: __t("parts.findAlternates") || "Find alternates",
                onClick: () => {
                  if (ctx?.openModal) ctx.openModal("find-alternates", p);
                  else
                    toast(
                      __t("parts.searchingAlternates") ||
                        "Searching alternates for " + p.pn,
                    );
                },
              },
              "divider",
              {
                icon: <Icon.Trash size={11} />,
                label: __t("parts.markObsolete") || "Mark obsolete",
                danger: true,
                onClick: () => {
                  const next = ctx?.rows || data.rows;
                  const patched = next.map((r) =>
                    r.pn === p.pn ? { ...r, status: "Obsolete" } : r,
                  );
                  ctx?.setRows?.(patched);
                  toast(
                    p.pn + " " + (__t("parts.markedObsolete") || "marked obsolete"),
                    { kind: "warn" },
                  );
                },
              },
            ]}
          />
        </span>
      ),
    },
  ];

  return (
    <DataTable
      className="parts-list-table"
      ariaLabel={__t("parts.title") || "Component Library"}
      columns={columns}
      rows={parts}
      getRowKey={(p) => p.pn}
      isRowSelected={(p) => selectedIds.has(p.pn)}
      onRowClick={(p) => onOpenDetail(p)}
      zebra
    />
  );
}
PartsList.propTypes = {
  parts: PropTypes.any,
  selectedIds: PropTypes.any,
  setSelectedIds: PropTypes.any,
  onOpenDetail: PropTypes.func,
  toggleSelectAll: PropTypes.any,
  dupGroups: PropTypes.any,
  addPartToBom: PropTypes.any,
};
export { PartsScreen };
window.PartsScreen = PartsScreen;
