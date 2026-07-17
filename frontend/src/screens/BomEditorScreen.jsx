import PropTypes from "prop-types";

import { __t } from "../i18n";
import { toast } from "../utils/toast";
import {
  BomEditor,
  BomShell,
  Drawer,
  DropdownButton,
  INR,
  Icon,
  ROLES,
  downloadCSV,
  downloadJSON,
  generateXLSX,
  printBOM,
  useAppStore,
} from "../globals";
function BomEditorScreen({
  data,
  search,
  activeCats,
  setActiveCats,
  density,
  onOpenDetail,
  selectedRow,
  onCloseDetail,
  bomTab,
  setBomTab,
  openModal,
}) {
  const ctx = useAppStore();
  // Client-side role is UI-only; backend must enforce authorization server-side.
  const perms = ctx?.perms || ROLES.Viewer;
  const userRole = ctx?.userRole || "Viewer";
  const p = ctx?.project || data.project;
  const r = ctx?.rollup || data.rollup;
  const deltaPct = ((r.bomCost - r.lastCost) / r.lastCost) * 100;

  const allCats = [
    "Assembly",
    "Electrical",
    "Mechanical",
    "Hardware",
    "Cable",
    "Optical",
  ];
  const statusFilterRef = React.useRef(null);
  const vendorFilterRef = React.useRef(null);
  const originFilterRef = React.useRef(null);
  const [statusFilters, setStatusFilters] = React.useState([]);
  const [vendorFilters, setVendorFilters] = React.useState([]);
  const [originFilters, setOriginFilters] = React.useState([]);

  const toggleCat = (c) => {
    if (activeCats.includes(c))
      setActiveCats(activeCats.filter((x) => x !== c));
    else setActiveCats([...activeCats, c]);
  };

  const applyView = (v) => {
    setActiveCats(v.filters.cats || []);
    setStatusFilters(v.filters.statuses || []);
    setVendorFilters(v.filters.vendors || []);
    setOriginFilters(v.filters.origins || []);
    toast(__t("common.filter") + ": " + v.name);
  };
  const deleteView = (id) => {
    ctx?.setSavedViews(ctx.savedViews.filter((v) => v.id !== id));
    toast(__t("common.delete") + " view", { kind: "warn" });
  };

  return (
    <>
      <div className="bom-identity-header flex items-center gap-12" style={{ padding: "var(--sp-2) var(--sp-4)", borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-surface)" }}>
        <div className="flex items-center gap-6">
          <span className="font-bold fs-14" style={{ color: "var(--fg)" }}>{p.name}</span>
          <span className="fs-12 fg-3">{p.code}</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="status released">{p.status}</span>
          <span className="badge fs-10" style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)" }}>
            {__t("part.revision")} {p.rev}
          </span>
        </div>
        <span className="fs-12 fg-3">{p.version}</span>
        <span className="fs-12 fg-3">{__t("bomShell.owner")} {p.owner}</span>
        <span className="fs-12 fg-3">{__t("bomShell.updated")} {p.updated}</span>
        <div className="flex-1" />
        <div className="flex items-center gap-6">
          <DropdownButton
            width={220}
            trigger={
              <button className="btn small">
                <Icon.Import size={11} /> {__t("bomShell.import")}{" "}
                <Icon.ChevronDown size={10} />
              </button>
            }
            items={[
              {
                icon: <Icon.Bom size={11} />,
                label: __t("bomShell.importFromCad"),
                onClick: () => openModal("upload-cad"),
              },
              {
                icon: <Icon.Doc size={11} />,
                label: __t("bomShell.importFromCsv"),
                onClick: () => openModal("bulk-import"),
              },
              {
                icon: <Icon.Scan size={11} />,
                label: __t("bomShell.importViaBarcode"),
                onClick: () => openModal("barcode-scan"),
              },
              "divider",
              {
                icon: <Icon.Sparkles size={11} />,
                label: __t("bomShell.autoScrapeParts"),
                onClick: () => openModal("auto-scrape", { pn: "" }),
              },
              {
                icon: <Icon.Search size={11} />,
                label: __t("bomShell.internetScraping"),
                onClick: () => openModal("scraping"),
              },
            ]}
          />
          <DropdownButton
            width={200}
            trigger={
              <button className="btn small">
                <Icon.Tools size={11} /> {__t("bomShell.tools")}{" "}
                <Icon.ChevronDown size={10} />
              </button>
            }
            items={[
              {
                icon: <Icon.Doc size={11} />,
                label: __t("bomShell.bomTemplates"),
                onClick: () => openModal("bom-templates"),
              },
              {
                icon: <Icon.Bom size={11} />,
                label: __t("bomShell.duplicateBom"),
                onClick: () => openModal("bom-duplication"),
              },
              {
                icon: <Icon.Diff size={11} />,
                label: __t("bomShell.rollbackRevision"),
                onClick: () => openModal("rollback"),
              },
            ]}
          />
          <DropdownButton
            width={200}
            trigger={
              <button className="btn small">
                <Icon.Export size={11} /> {__t("bomShell.export")}{" "}
                <Icon.ChevronDown size={10} />
              </button>
            }
            items={[
              { header: __t("bomShell.format") },
              {
                icon: <Icon.Doc size={11} />,
                label: __t("bomShell.pdfReport"),
                onClick: () => {
                  toast("Generating PDF report…");
                  setTimeout(
                    () =>
                      toast("BOM_v3.2.0.pdf ready", {
                        kind: "success",
                        action: {
                          label: "Download",
                          onClick: () => toast("Downloaded BOM_v3.2.0.pdf"),
                        },
                      }),
                    900,
                  );
                },
              },
              {
                icon: <Icon.Doc size={11} />,
                label: __t("bomShell.excel"),
                onClick: () => {
                  generateXLSX(ctx?.rows || data.rows, "BOM_v3.2.0.xls");
                  toast(__t("bomShell.excel") + " downloaded", {
                    kind: "success",
                  });
                },
              },
              {
                icon: <Icon.Doc size={11} />,
                label: __t("bomShell.csv"),
                onClick: () => {
                  downloadCSV(ctx?.rows || data.rows, "BOM_v3.2.0.csv");
                  toast(__t("bomShell.csv") + " downloaded", { kind: "success" });
                },
              },
              {
                icon: <Icon.Doc size={11} />,
                label: __t("bomShell.json"),
                onClick: () => {
                  downloadJSON(ctx?.rows || data.rows, "BOM_v3.2.0.json");
                  toast(__t("bomShell.json") + " downloaded", {
                    kind: "success",
                  });
                },
              },
              "divider",
              {
                icon: <Icon.Doc size={11} />,
                label: __t("bomShell.printBom"),
                onClick: () => printBOM(ctx?.rows || data.rows, p),
              },
              {
                icon: <Icon.Link size={11} />,
                label: __t("bomShell.copyShareLink"),
                onClick: () => openModal("share-link"),
              },
            ]}
          />
          <button
            className={"btn primary small " + (perms.canRelease ? "" : "locked")}
            data-locked={__t("app.releaseRequires")}
            onClick={() =>
              perms.canRelease
                ? openModal("release")
                : toast(__t("app.noPermissionRelease", { role: userRole }), {
                    kind: "warn",
                  })
            }
          >
            <Icon.Check size={11} /> {__t("bomShell.release")}
          </button>
        </div>
      </div>

      <div className="ribbon">
        <div className="ribbon-cell">
          <div className="label">{__t("bomShell.totalParts")}</div>
          <div className="value">{r.parts}</div>
          <div className="delta flat">
            {r.unique} {__t("bomShell.unique")}
          </div>
        </div>
        <div className="ribbon-cell">
          <div className="label">{__t("bomShell.bomCost")}</div>
          <div className="value">{INR(r.bomCost, 2)}</div>
          <div className={"delta " + (deltaPct > 0 ? "up" : "down")}>
            {deltaPct > 0 ? "▲" : "▼"} {deltaPct.toFixed(2)}% vs last rev
          </div>
        </div>
        <div className="ribbon-cell">
          <div className="label">{__t("bomShell.criticalLead")}</div>
          <div className="value">
            {r.lead}
            <span style={{ fontSize: 12, color: "var(--fg-3)", marginLeft: 4 }}>
              {__t("bomShell.days")}
            </span>
          </div>
          <div className="delta up">▲ +3d STM32H7</div>
        </div>
        <div className="ribbon-cell">
          <div className="label">{__t("bomShell.vendors")}</div>
          <div className="value">{r.vendors}</div>
          <div className="delta flat">
            {r.countries} {__t("bomShell.countries")}
          </div>
        </div>
        <div className="ribbon-cell">
          <div className="label">{__t("bomShell.riskFlags")}</div>
          <div className="value">{r.risk}</div>
          <div className="delta up">▲ 1 supplier · 1 dup · 1 origin</div>
        </div>
        <div className="ribbon-cell" style={{ background: "var(--bg-sunk)" }}>
          <div className="label">{__t("bomShell.status")}</div>
          <div className="value" style={{ fontSize: 13, marginTop: 2 }}>
            <span className="status released">{p.status}</span>
          </div>
          <div className="delta flat">3 of 4 sub-assys approved</div>
        </div>
      </div>

      <div className="tabs">
        <button
          className={"tab " + (bomTab === "hierarchy" ? "active" : "")}
          onClick={() => setBomTab("hierarchy")}
        >
          {__t("bomShell.tabHierarchy")} <span className="count">87</span>
        </button>
        <button
          className={"tab " + (bomTab === "flat" ? "active" : "")}
          onClick={() => setBomTab("flat")}
        >
          {__t("bomShell.tabFlatList")} <span className="count">64</span>
        </button>
        <button
          className={"tab " + (bomTab === "cost" ? "active" : "")}
          onClick={() => setBomTab("cost")}
        >
          {__t("bomShell.tabCostRollup")}
        </button>
        <button
          className={"tab " + (bomTab === "sourcing" ? "active" : "")}
          onClick={() => setBomTab("sourcing")}
        >
          {__t("bomShell.tabSourcing")}
        </button>
        <div className="flex-1" />
        <button
          className="tab fg-3"
          onClick={() =>
            openModal("save-view", {
              filters: {
                cats: activeCats,
                statuses: statusFilters,
                vendors: vendorFilters,
                origins: originFilters,
              },
            })
          }
        >
          <Icon.Plus size={11} /> {__t("bomShell.addView")}
        </button>
      </div>

      {(bomTab === "hierarchy" || bomTab === "flat") && (
        <div className="filterbar">
          <div className="search w-200 h-26">
            <Icon.Search size={11} />
            <input
              placeholder={__t("bomShell.filterPlaceholder")}
              value={search}
              onChange={(e) => window.__setBomSearch?.(e.target.value)}
              aria-label="Filter BOM rows"
              className="fs-11"
            />
            {search && (
              <button
                className="icon-btn w-18 h-18 b-0 bg-transparent"
                aria-label="Clear search"
                onClick={() => window.__setBomSearch?.("")}
              >
                <Icon.X size={10} />
              </button>
            )}
          </div>
          <span
            className="w-1 h-16"
            style={{ background: "var(--line)", margin: "0 2px" }}
          />
          {allCats.map((c) => (
            <span
              key={c}
              onClick={() => toggleCat(c)}
              className={
                "chip cursor-pointer " +
                (activeCats.includes(c) ? "active" : "")
              }
            >
              {c}
              {activeCats.includes(c) && <Icon.X size={9} />}
            </span>
          ))}
          <span ref={statusFilterRef}>
            <DropdownButton
              width={200}
              trigger={
                <span className="chip chip-add cursor-pointer">
                  <Icon.Plus size={10} /> Status{" "}
                  {statusFilters.length ? `(${statusFilters.length})` : ""}
                </span>
              }
              items={[
                "Released",
                "Draft",
                "Review",
                "Approved",
                "Deprecated",
              ].map((s) => ({
                icon: statusFilters.includes(s) ? (
                  <Icon.Check size={11} />
                ) : (
                  <span className="w-11" />
                ),
                label: s,
                onClick: () =>
                  setStatusFilters(
                    statusFilters.includes(s)
                      ? statusFilters.filter((x) => x !== s)
                      : [...statusFilters, s],
                  ),
              }))}
            />
          </span>
          <span ref={vendorFilterRef}>
            <DropdownButton
              width={220}
              trigger={
                <span className="chip chip-add cursor-pointer">
                  <Icon.Plus size={10} /> Vendor{" "}
                  {vendorFilters.length ? `(${vendorFilters.length})` : ""}
                </span>
              }
              items={data.vendors.slice(0, 8).map((v) => ({
                icon: vendorFilters.includes(v.name) ? (
                  <Icon.Check size={11} />
                ) : (
                  <span className="w-11" />
                ),
                label: v.name,
                onClick: () =>
                  setVendorFilters(
                    vendorFilters.includes(v.name)
                      ? vendorFilters.filter((x) => x !== v.name)
                      : [...vendorFilters, v.name],
                  ),
              }))}
            />
          </span>
          <span ref={originFilterRef}>
            <DropdownButton
              width={180}
              trigger={
                <span className="chip chip-add cursor-pointer">
                  <Icon.Plus size={10} /> Origin{" "}
                  {originFilters.length ? `(${originFilters.length})` : ""}
                </span>
              }
              items={["US", "CN", "JP", "TW", "FR", "AT", "DE"].map((o) => ({
                icon: originFilters.includes(o) ? (
                  <Icon.Check size={11} />
                ) : (
                  <span className="w-11" />
                ),
                label: o,
                onClick: () =>
                  setOriginFilters(
                    originFilters.includes(o)
                      ? originFilters.filter((x) => x !== o)
                      : [...originFilters, o],
                  ),
              }))}
            />
          </span>
          {activeCats.length +
            statusFilters.length +
            vendorFilters.length +
            originFilters.length >
            0 && (
            <button
              className="btn small h-22 fs-10 fg-3"
              onClick={() => {
                setActiveCats([]);
                setStatusFilters([]);
                setVendorFilters([]);
                setOriginFilters([]);
              }}
            >
              {__t("bomShell.clearAll")}
            </button>
          )}
          {ctx?.savedViews?.length > 0 && (
            <>
              <span
                className="w-1 h-16"
                style={{ background: "var(--line)", margin: "0 2px" }}
              />
              <span className="hint">{__t("bomShell.savedViews")}</span>
              {ctx.savedViews.map((v) => (
                <span
                  key={v.id}
                  className="chip c-pointer fg-accent border-color-accent border-solid"
                  onClick={() => applyView(v)}
                >
                  {v.name}
                  <span
                    className="x"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteView(v.id);
                    }}
                  >
                    <Icon.X size={9} />
                  </span>
                </span>
              ))}
            </>
          )}
          <div className="flex-1" />
          <span className="hint">
            {bomTab === "flat" ? "64" : "87"} rows \u00B7 64 unique
          </span>
          <button
            className="btn small"
            onClick={() =>
              openModal("save-view", {
                filters: {
                  cats: activeCats,
                  statuses: statusFilters,
                  vendors: vendorFilters,
                  origins: originFilters,
                },
              })
            }
          >
            <Icon.Filter size={11} /> {__t("bomShell.saveView")}
          </button>
        </div>
      )}

      <div className="bom-area flex flex-1 min-h-0 min-w-0 pos-relative">
        {bomTab === "hierarchy" && (
          <BomEditor
            data={data}
            density={density}
            search={search}
            activeCats={activeCats}
            statusFilters={statusFilters}
            vendorFilters={vendorFilters}
            originFilters={originFilters}
            onOpenDetail={onOpenDetail}
            mode="hierarchy"
          />
        )}
        {bomTab === "flat" && (
          <BomEditor
            data={data}
            density={density}
            search={search}
            activeCats={activeCats}
            statusFilters={statusFilters}
            vendorFilters={vendorFilters}
            originFilters={originFilters}
            onOpenDetail={onOpenDetail}
            mode="flat"
          />
        )}
        {bomTab === "cost" && <window.CostRollupView data={data} />}
        {bomTab === "sourcing" && (
          <window.SourcingView data={data} onOpenDetail={onOpenDetail} />
        )}
        {selectedRow && (
          <Drawer
            row={selectedRow}
            onClose={onCloseDetail}
            data={data}
            openModal={openModal}
          />
        )}
      </div>
    </>
  );
}

BomEditorScreen.propTypes = {
  data: PropTypes.object,
  search: PropTypes.any,
  activeCats: PropTypes.any,
  setActiveCats: PropTypes.any,
  density: PropTypes.any,
  onOpenDetail: PropTypes.func,
  selectedRow: PropTypes.any,
  onCloseDetail: PropTypes.func,
  bomTab: PropTypes.any,
  setBomTab: PropTypes.any,
  openModal: PropTypes.func,
};

export default BomEditorScreen;
window.BomShell = BomEditorScreen;
