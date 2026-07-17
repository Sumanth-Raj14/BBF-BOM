import PropTypes from "prop-types";
import { __t } from "../i18n";
import { toast } from "../utils/toast";
import {
  Button,
  Badge,
  StatusPill,
  Tabs,
  Card,
  Field,
  Textarea,
  EmptyState,
} from "../components/ui/index.js";
// Component Detail Drawer — opens when a row is selected.
function Drawer({ row, onClose, data, openModal, overlay }) {
  const ctx = useAppStore();
  const [tab, setTab] = React.useState("specs");
  if (!row) return null;
  const ext = (row.cost || 0) * (row.qty || 0);
  const commentList = (ctx?.comments && ctx.comments[row.pn]) || [];
  const approvalKey = row.assembly
    ? row.pn
    : data.rows[0].children.find((s) =>
        s.children?.some((c) => c.id === row.id),
      )?.pn;
  const approval = approvalKey && ctx?.approvals?.[approvalKey];
  return (
    <>
      {overlay && (
        <div
          className="drawer-backdrop"
          onClick={onClose}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.3)",
            zIndex: 70,
          }}
        />
      )}
      <div className={"drawer " + (overlay ? "overlay" : "")}>
        <div className="drawer-header">
          {row.imageUrl ? (
            <img
              src={row.imageUrl}
              alt={row.pn}
              loading="lazy"
              style={{
                width: 48,
                height: 48,
                borderRadius: 8,
                objectFit: "cover",
                border: "1px solid var(--line)",
                flexShrink: 0,
              }}
            />
          ) : (
            <div
              className="drawer-image"
              data-pn={row.pn}
              style={{
                width: 48,
                height: 48,
                borderRadius: 8,
                background:
                  row.category === "Electrical"
                    ? "oklch(0.55 0.13 240)"
                    : row.category === "Mechanical"
                      ? "oklch(0.55 0.08 60)"
                      : row.category === "Optical"
                        ? "oklch(0.55 0.13 320)"
                        : row.category === "Hardware"
                          ? "oklch(0.6 0.10 30)"
                          : row.category === "Cable"
                            ? "oklch(0.55 0.06 280)"
                            : "var(--accent-strong)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "var(--font-mono)",
                fontWeight: 700,
                fontSize: 18,
                color: "white",
                flexShrink: 0,
              }}
            >
              {row.category === "Electrical"
                ? "⚡"
                : row.category === "Mechanical"
                  ? "⚙"
                  : row.category === "Optical"
                    ? "◉"
                    : row.category === "Hardware"
                      ? "⊘"
                      : row.category === "Cable"
                        ? "≡"
                        : "📦"}
            </div>
          )}
          <div className="drawer-title">
            <div className="pn">
              {row.pn} · {__t("detailDrawer.rev") || "Rev"} {row.rev}
            </div>
            <h3>{row.name}</h3>
            <div className="meta">
              <Badge tone="neutral">{row.category}</Badge>
              <StatusPill status={row.status} />
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            onClick={onClose}
            title={__t("common.close") || "Close"}
            aria-label={__t("common.close") || "Close"}
          >
            <Icon.X />
          </Button>
        </div>
        <Tabs
          ariaLabel={__t("detailDrawer.tabs") || "Component detail tabs"}
          value={tab}
          onChange={setTab}
          items={[
            { value: "specs", label: __t("detailDrawer.specs") || "Specs" },
            { value: "vendors", label: __t("detailDrawer.vendors") || "Vendors" },
            {
              value: "where-used",
              label: __t("detailDrawer.whereUsed") || "Where used",
            },
            { value: "files", label: __t("detailDrawer.files") || "Files" },
            { value: "barcode", label: __t("detailDrawer.barcode") || "Barcode" },
            {
              value: "comments",
              label: __t("detailDrawer.comments") || "Comments",
              count: commentList.length || undefined,
            },
            { value: "history", label: __t("detailDrawer.history") || "History" },
          ]}
        />
        <div className="drawer-body">
          {tab === "specs" && (
            <SpecsTab
              row={row}
              ext={ext}
              approval={approval}
              approvalKey={approvalKey}
            />
          )}
          {tab === "vendors" && (
            <VendorsTab row={row} data={data} openModal={openModal} />
          )}
          {tab === "where-used" && <WhereUsedTab row={row} />}
          {tab === "files" && <FilesTab row={row} openModal={openModal} />}
          {tab === "barcode" && <BarcodeTab row={row} />}
          {tab === "comments" && <CommentsTab row={row} />}
          {tab === "history" && <HistoryTab row={row} />}
        </div>
      </div>
    </>
  );
}
Drawer.propTypes = {
  row: PropTypes.object,
  onClose: PropTypes.func,
  data: PropTypes.object,
  openModal: PropTypes.func,
  overlay: PropTypes.any,
};
function SpecsTab({ row, ext, approval, approvalKey }) {
  const ctx = useAppStore();
  const advance = (role) => {
    if (!ctx?.setApprovals || !approvalKey) return;
    const cur = ctx.approvals[approvalKey] || {};
    const next = {
      ...cur,
      [role]: cur[role] === "approved" ? "pending" : "approved",
    };
    ctx.setApprovals({ ...ctx.approvals, [approvalKey]: next });
    toast(
      role[0].toUpperCase() +
        role.slice(1) +
        " · " +
        (next[role] === "approved"
          ? __t("detailDrawer.approved") || "approved"
          : __t("detailDrawer.resetToPending") || "reset to pending"),
      { kind: next[role] === "approved" ? "success" : "info" },
    );
  };
  return (
    <>
      {/* Approval widget — appears for assemblies or parts under an assembly */}
      {approval && (
        <Card
          className="mb-16"
          title={__t("detailDrawer.approvalWorkflow") || "Approval workflow"}
          actions={
            <span className="font-mono fs-10 fg-3">
              {Object.values(approval).filter((v) => v === "approved").length}{" "}
              {__t("detailDrawer.of") || "of"} {Object.keys(approval).length}{" "}
              {__t("detailDrawer.signedOff") || "signed off"}
            </span>
          }
        >
          <div
            className="d-grid border-line rounded-r2 overflow-h"
            style={{
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 1,
              background: "var(--line)",
            }}
          >
            {[
              ["engineering", "ENG", "E. Chen", "user-2"],
              ["procurement", "PROC", "K. Singh", "user-4"],
              ["finance", "FIN", "T. Reyes", "user-3"],
            ].map(([key, lbl, who, color]) => {
              const state = approval[key];
              return (
                <button
                  key={key}
                  onClick={() => advance(key)}
                  style={{
                    padding: "10px 8px",
                    background:
                      state === "approved"
                        ? "color-mix(in oklch, var(--ok) 16%, var(--bg))"
                        : "var(--bg)",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <div className="flex items-center gap-6">
                    <span
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: 99,
                        background:
                          state === "approved" ? "var(--ok)" : "var(--bg-sunk)",
                        border:
                          state === "approved"
                            ? "none"
                            : "1px dashed var(--fg-3)",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "white",
                      }}
                    >
                      {state === "approved" && <Icon.Check size={9} />}
                    </span>
                    <span className="font-mono fs-10 fw-700 letter-sp-6">
                      {lbl}
                    </span>
                  </div>
                  <div className="mt-6 fs-11 fw-500">{who}</div>
                  <div
                    className="font-mono fs-9"
                    style={{
                      color: state === "approved" ? "var(--ok)" : "var(--fg-3)",
                      marginTop: 1,
                    }}
                  >
                    {state === "approved"
                      ? __t("detailDrawer.approvedLabel") || "APPROVED"
                      : __t("detailDrawer.pendingLabel") || "PENDING"}
                  </div>
                </button>
              );
            })}
          </div>
        </Card>
      )}
      <dl className="kv-grid">
        <dt>{__t("detailDrawer.partNo") || "Part No."}</dt>
        <dd>{row.pn}</dd>
        <dt>{__t("detailDrawer.revision") || "Revision"}</dt>
        <dd>{row.rev}</dd>
        <dt>{__t("detailDrawer.quantity") || "Quantity"}</dt>
        <dd>
          {fmt.qty(row.qty)} {row.uom}
        </dd>
        <dt>{__t("detailDrawer.category") || "Category"}</dt>
        <dd>
          {row.category}
          {row.subCategory ? (
            <span className="fg-3"> / {row.subCategory}</span>
          ) : (
            ""
          )}
        </dd>
        <dt>{__t("detailDrawer.unitCost") || "Unit Cost"}</dt>
        <dd>{fmt.money(row.cost)}</dd>
        <dt>{__t("detailDrawer.extCost") || "Ext. Cost"}</dt>
        <dd className="fw-600 fg-accent">{fmt.money(ext)}</dd>
        <dt>{__t("detailDrawer.leadTime") || "Lead Time"}</dt>
        <dd>
          {row.lead
            ? row.lead + " " + (__t("detailDrawer.days") || "days")
            : "—"}
        </dd>
        <dt>{__t("detailDrawer.origin") || "Origin"}</dt>
        <dd>{row.origin}</dd>
        <dt>{__t("detailDrawer.manufacturer") || "Manufacturer"}</dt>
        <dd className="sans">{row.manufacturer || row.vendor || "—"}</dd>
        <dt>{__t("detailDrawer.vendor") || "Vendor"}</dt>
        <dd className="sans">{row.vendor}</dd>
      </dl>
      <div className="section-title">
        {__t("detailDrawer.engineering") || "Engineering"}
      </div>
      <dl className="kv-grid">
        <dt>{__t("detailDrawer.material") || "Material"}</dt>
        <dd className="sans">{row.material || "—"}</dd>
        <dt>{__t("detailDrawer.weight") || "Weight"}</dt>
        <dd>
          {row.weight
            ? typeof row.weight === "number"
              ? row.weight + " " + (__t("detailDrawer.grams") || "g")
              : row.weight
            : "—"}
        </dd>
        <dt>{__t("detailDrawer.dimensions") || "Dimensions"}</dt>
        <dd>{row.dimensions || "—"}</dd>
        <dt>{__t("detailDrawer.finish") || "Finish"}</dt>
        <dd className="sans">
          {__t("detailDrawer.blackAnodized") || "Black anodized"}
        </dd>
        <dt>{__t("detailDrawer.tolerance") || "Tolerance"}</dt>
        <dd>{__t("detailDrawer.toleranceValue") || "±0.05 mm"}</dd>
      </dl>
      {row.cadUrl && (
        <div className="mb-16">
          <div className="section-title">
            {__t("detailDrawer.cadReference") || "CAD Reference"}
          </div>
          <div className="flex gap-8 items-center">
            <span
              className="font-mono fs-10 fg-accent br-4"
              style={{ padding: "4px 8px", background: "var(--accent-soft)" }}
            >
              {row.cadUrl.split("/").pop()}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const a = document.createElement("a");
                a.href = row.cadUrl;
                a.target = "_blank";
                a.click();
                toast(
                  __t("detailDrawer.openingCadFile") || "Opening CAD file",
                  { kind: "info" },
                );
              }}
            >
              <Icon.Import size={10} />{" "}
              {__t("detailDrawer.openCad") || "Open CAD"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                ctx?.openModal?.("doc-preview", {
                  name: row.cadUrl?.split("/").pop() || row.pn + ".stp",
                  url: row.cadUrl,
                })
              }
            >
              <Icon.Search size={10} /> {__t("common.preview") || "Preview"}
            </Button>
          </div>
        </div>
      )}
      {row.tags && row.tags.length > 0 && (
        <div className="mb-16">
          <div className="section-title">
            {__t("detailDrawer.tags") || "Tags"}
          </div>
          <div className="flex gap-4" style={{ flexWrap: "wrap" }}>
            {row.tags.map((t) => (
              <Badge key={t} tone="neutral" pill className="fs-10">
                {t}
              </Badge>
            ))}
          </div>
        </div>
      )}
      {row.compliance && row.compliance.length > 0 && (
        <div className="mb-16">
          <div className="section-title">
            {__t("detailDrawer.compliance") || "Compliance"}
          </div>
          <div className="flex gap-4" style={{ flexWrap: "wrap" }}>
            {row.compliance.map((c) => (
              <Badge key={c} tone="success" className="font-mono fs-10">
                {c}
              </Badge>
            ))}
          </div>
        </div>
      )}
      {row.customFields && Object.keys(row.customFields).length > 0 && (
        <>
          <div className="section-title">
            {__t("detailDrawer.customFields") || "Custom Fields"}
          </div>
          <dl className="kv-grid">
            {Object.entries(row.customFields).map(([key, value]) => (
              <React.Fragment key={key}>
                <dt>{key}</dt>
                <dd className="sans">{String(value)}</dd>
              </React.Fragment>
            ))}
          </dl>
        </>
      )}
      <div className="section-title">
        {__t("detailDrawer.costTrend") || "Cost trend (12 wk)"}
      </div>
      <div style={{ padding: "8px 0" }}>
        {row.trend ? (
          <div className="flex items-center gap-12">
            <svg className="spark w-100p h-60" viewBox="0 0 240 60">
              {(() => {
                const data = row.trend;
                const min = Math.min(...data),
                  max = Math.max(...data);
                const range = max - min || 1;
                const w = 240,
                  h = 60,
                  pad = 6;
                const pts = data.map((v, i) => {
                  const x = pad + (i / (data.length - 1)) * (w - pad * 2);
                  const y = pad + (1 - (v - min) / range) * (h - pad * 2);
                  return [x, y];
                });
                const linePath = pts
                  .map(
                    (p, i) =>
                      (i === 0 ? "M" : "L") +
                      p[0].toFixed(1) +
                      " " +
                      p[1].toFixed(1),
                  )
                  .join(" ");
                const areaPath =
                  linePath +
                  ` L ${pts[pts.length - 1][0]} ${h - pad} L ${pts[0][0]} ${h - pad} Z`;
                return (
                  <>
                    <path className="area" d={areaPath} />
                    <path
                      className="line"
                      d={linePath}
                      style={{ strokeWidth: 1.5 }}
                    />
                    {pts.map((p, i) => (
                      <circle
                        key={"pt-" + i}
                        cx={p[0]}
                        cy={p[1]}
                        r={i === pts.length - 1 ? 2.5 : 1.5}
                        fill={
                          i === pts.length - 1 ? "var(--accent)" : "var(--fg-3)"
                        }
                      />
                    ))}
                  </>
                );
              })()}
            </svg>
          </div>
        ) : (
          <span className="fg-3 fs-11">
            {__t("detailDrawer.noPriceHistory") ||
              "No price history for this part."}
          </span>
        )}
      </div>
      <div className="section-title">
        {__t("detailDrawer.notes") || "Notes"}
      </div>
      <Card bodyClassName="fs-12 fg-2" style={{ lineHeight: 1.5 }}>
        {row.category === "Electrical"
          ? __t("detailDrawer.noteElectrical") ||
            "Validated against the H743 errata sheet ES0392. Stock 100 units min — lead time creep observed Q1-Q2."
          : row.category === "Optical"
            ? __t("detailDrawer.noteOptical") ||
              "Lens is critical for the August field demo. Order in pairs."
            : __t("detailDrawer.noteDefault") ||
              "Refer to drawing in Files tab. Confirm finish on PO."}
      </Card>
      {row.freight !== undefined && (
        <>
          <div className="section-title">
            {__t("detailDrawer.costBreakdown") || "Cost Breakdown"}
          </div>
          <dl className="kv-grid">
            <dt>{__t("detailDrawer.unitCost") || "Unit Cost"}</dt>
            <dd>{fmt.money(row.cost)}</dd>
            {row.freight !== undefined && (
              <React.Fragment key="f">
                <dt>{__t("detailDrawer.freight") || "Freight"}</dt>
                <dd>{fmt.money(row.freight)}</dd>
              </React.Fragment>
            )}
            {row.tax !== undefined && (
              <React.Fragment key="t">
                <dt>{__t("detailDrawer.taxDuties") || "Tax / Duties"}</dt>
                <dd>{fmt.money(row.tax)}</dd>
              </React.Fragment>
            )}
            {row.landedCost !== undefined && (
              <React.Fragment key="l">
                <dt>{__t("detailDrawer.landedCost") || "Landed Cost"}</dt>
                <dd className="fw-600 fg-accent">
                  {fmt.money(row.landedCost)}
                </dd>
              </React.Fragment>
            )}
          </dl>
        </>
      )}
      {row.countryHistory && row.countryHistory.length > 0 && (
        <div className="mb-16">
          <div className="section-title">
            {__t("detailDrawer.countryHistory") || "Country History"}
          </div>
          <div className="pos-relative" style={{ paddingLeft: 18 }}>
            <div
              className="pos-absolute w-1"
              style={{ left: 6, top: 4, bottom: 4, background: "var(--line)" }}
            />
            {row.countryHistory.map((ch, i) => (
              <div key={ch.country + "-" + ch.date} className="relative mb-10">
                <div className="pos-absolute" />
                <div>
                  <span
                    className="chip fs-11 fw-600 fs-9 mr-4"
                    style={{ padding: "0 4px" }}
                  >
                    {ch.country}
                  </span>{" "}
                  {ch.reason}
                </div>
                <div className="font-mono fs-10 fg-3" style={{ marginTop: 1 }}>
                  {ch.date}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-8 mt-16" style={{ flexWrap: "wrap" }}>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => ctx?.openModal("auto-scrape", row)}
        >
          <Icon.Sparkles size={11} />{" "}
          {__t("detailDrawer.autoScrape") || "Auto-scrape from web"}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => ctx?.openModal("find-alternates", row)}
        >
          <Icon.Search size={11} />{" "}
          {__t("detailDrawer.findAlternates") || "Find alternates"}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => ctx?.openModal("send-rfq", row)}
        >
          <Icon.Cart size={11} /> {__t("detailDrawer.sendRfq") || "Send RFQ"}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => ctx?.openModal("change-owner", row)}
        >
          <Icon.User size={11} />{" "}
          {__t("detailDrawer.changeOwner") || "Change owner"}
        </Button>
      </div>
    </>
  );
}
SpecsTab.propTypes = {
  row: PropTypes.object,
  ext: PropTypes.any,
  approval: PropTypes.any,
  approvalKey: PropTypes.any,
};
function VendorsTab({ row, data, openModal }) {
  const vp = row.vendorPrices || [];
  const matched = vp.length > 0 ? vp.slice(0, 5) : data.vendors.slice(0, 3);
  return (
    <>
      <div className="flex justify-between items-center mb-10">
        <div className="hint">
          {matched.length}{" "}
          {matched.length !== 1
            ? __t("detailDrawer.vendors") || "vendors"
            : __t("detailDrawer.vendor") || "vendor"}{" "}
          ·{" "}
          {vp.length > 0 && (
            <span>
              {__t("detailDrawer.pricesFromCatalog") || "prices from catalog"}
            </span>
          )}
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => openModal && openModal("new-vendor")}
        >
          <Icon.Plus size={11} />{" "}
          {__t("detailDrawer.addVendor") || "Add vendor"}
        </Button>
      </div>
      <table className="bom-table dense fs-11" style={{ width: "100%" }}>
        <thead>
          <tr>
            <th>Vendor</th>
            <th className="num">Unit</th>
            <th className="num">Lead</th>
            <th className="num">MOQ</th>
          </tr>
        </thead>
        <tbody>
          {matched.map((it, i) => {
            const isPricing = vp.length > 0;
            const v = isPricing
              ? data.vendors.find((dv) => dv.name === it.vendor) || {
                  name: it.vendor,
                  terms: "—",
                  country: "—",
                  rating: 0,
                  lead: it.lead,
                  moq: it.moq || 1,
                }
              : it;
            return (
              <tr key={it.vendor} className={i === 0 ? "preferred" : ""}>
                <td>
                  <div className="font-bold">{v.name}</div>
                  <div className="fg-3 fs-9 font-mono">{v.terms || "—"} · {v.country}</div>
                </td>
                <td className="num">
                  {fmt.money(isPricing ? it.cost : row.cost * (1 + (i * 0.08 - 0.04)), 2)}
                </td>
                <td className="num">{v.lead || "—"}d</td>
                <td className="num">{v.moq || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
VendorsTab.propTypes = {
  row: PropTypes.object,
  data: PropTypes.object,
  openModal: PropTypes.func,
};
function WhereUsedTab({ row }) {
  const go = (project) => {
    toast((__t("detailDrawer.navigatedTo") || "Navigated to ") + project, {
      kind: "info",
    });
    window.__nav?.("bom");
  };
  return (
    <>
      <div className="hint mb-10">
        {__t("detailDrawer.usedInAssemblies") ||
          "Used in 3 assemblies across 2 projects."}
      </div>
      <div className="deptree">
        <button
          type="button"
          className="node parent"
          onClick={() => go("ATLAS / Mainframe")}
        >
          ATLAS / Mainframe / Rev C
        </button>
        <div className="branch">
          <button
            type="button"
            className="node parent"
            onClick={() => go("ATL-MFR-CTL")}
          >
            ATL-MFR-CTL / Control Subsystem · Rev D
          </button>
          <div className="branch">
            <div className="node self">{row.pn}</div>
          </div>
        </div>
        <div className="h-8" />
        <button
          type="button"
          className="node parent"
          onClick={() => go("HORIZON / Sensor Pod")}
        >
          HORIZON / Sensor Pod / Rev B
        </button>
        <div className="branch">
          <button
            type="button"
            className="node parent"
            onClick={() => go("HZN-POD-CTL")}
          >
            HZN-POD-CTL · Rev A
          </button>
          <div className="branch">
            <div className="node self">{row.pn} (qty 2)</div>
          </div>
        </div>
        <div className="h-8" />
        <button
          type="button"
          className="node parent"
          onClick={() => go("ATLAS-LITE")}
        >
          ATLAS-LITE / Eval Board · Rev A
        </button>
        <div className="branch">
          <div className="node self">{row.pn}</div>
        </div>
      </div>
    </>
  );
}
WhereUsedTab.propTypes = {
  row: PropTypes.object,
};
function FilesTab({ row, openModal }) {
  const ctx = useAppStore();
  const files = [
    {
      name: `${row.pn}_datasheet.pdf`,
      ext: "PDF",
      size: "1.2 MB",
      date: "05-12",
      tag: "Datasheet",
      updated: "05-12",
      icon: "DS",
    },
    {
      name: `${row.pn}_drawing_v2.dwg`,
      ext: "DWG",
      size: "324 KB",
      date: "05-09",
      tag: "Drawing",
      updated: "05-09",
      icon: "⌗",
    },
    {
      name: `${row.pn}_specs_extracted.json`,
      ext: "JSON",
      size: "4 KB",
      date: "05-09",
      tag: "Extracted",
      updated: "05-09",
      icon: "{}",
    },
    {
      name: `Quote_${row.pn}_2026Q2.pdf`,
      ext: "PDF",
      size: "88 KB",
      date: "04-22",
      tag: "Quote",
      updated: "04-22",
      icon: "$",
    },
  ];
  const open = (f) => (ctx || { openModal })?.openModal?.("doc-preview", f);
  return (
    <>
      <div className="flex justify-between items-center mb-10">
        <div className="hint">
          {__t("detailDrawer.filesVersioned") || "4 files · versioned"}
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => (ctx || { openModal }).openModal?.("upload")}
        >
          <Icon.Plus size={11} /> {__t("common.upload") || "Upload"}
        </Button>
      </div>
      {files.map((f, i) => (
        <div
          key={f.name}
          style={{
            display: "grid",
            gridTemplateColumns: "44px 1fr auto",
            gap: 10,
            alignItems: "center",
            padding: "8px 10px",
            border: "1px solid var(--line)",
            borderRadius: "var(--r-2)",
            marginBottom: 6,
            background: "var(--bg)",
          }}
        >
          <Badge tone="neutral" className="font-mono fs-9 text-center">
            {f.ext}
          </Badge>
          <button
            type="button"
            onClick={() => open(f)}
            className="text-left"
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
          >
            <div className="fs-12 font-mono">{f.name}</div>
            <div className="fs-10 fg-3 font-mono">
              {f.size} · {f.date}
            </div>
          </button>
          <DropdownButton
            width={170}
            trigger={
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                aria-label={__t("common.moreOptions") || "More options"}
              >
                <Icon.Dots size={12} />
              </Button>
            }
            items={[
              {
                icon: <Icon.Chevron size={11} />,
                label: __t("common.preview") || "Preview",
                onClick: () => open(f),
              },
              {
                icon: <Icon.Export size={11} />,
                label: __t("common.download") || "Download",
                onClick: () => {
                  toast(
                    (__t("detailDrawer.downloadNotAvailable") || "Download ") +
                      f.name +
                      (__t("detailDrawer.notAvailable") ||
                        " not available — fetch from server"),
                    { kind: "info" },
                  );
                },
              },
              {
                icon: <Icon.Link size={11} />,
                label: __t("common.copyLink") || "Copy link",
                onClick: () =>
                  navigator.clipboard
                    ?.writeText?.(window.location.origin + "/files/" + f.name)
                    .then(() => toast(__t("common.copied") || "Link copied"))
                    .catch(() => toast(__t("common.copied") || "Link copied")),
              },
              "divider",
              {
                icon: <Icon.Trash size={11} />,
                label: __t("common.delete") || "Delete",
                danger: true,
                onClick: () =>
                  toast(
                    f.name + " " + (__t("detailDrawer.deleted") || "deleted"),
                    { kind: "warn" },
                  ),
              },
            ]}
          />
        </div>
      ))}
    </>
  );
}
FilesTab.propTypes = {
  row: PropTypes.object,
  openModal: PropTypes.func,
};
function CommentsTab({ row }) {
  const ctx = useAppStore();
  const [draft, setDraft] = React.useState("");
  const [mentionOpen, setMentionOpen] = React.useState(false);
  const [mentionQ, setMentionQ] = React.useState("");
  const [mentionIdx, setMentionIdx] = React.useState(0);
  const textareaRef = React.useRef(null);
  const list = (ctx?.comments && ctx.comments[row.pn]) || [];
  const TEAM = [
    {
      handle: "elena",
      name: "Elena Chen",
      role: "ENG LEAD",
      init: "EC",
      color: "",
    },
    {
      handle: "marie",
      name: "Marie Park",
      role: "ENG",
      init: "MP",
      color: "user-2",
    },
    {
      handle: "karan",
      name: "Karan Singh",
      role: "PROC",
      init: "KS",
      color: "user-4",
    },
    {
      handle: "ryo",
      name: "Ryo Sato",
      role: "ENG",
      init: "RS",
      color: "user-3",
    },
    {
      handle: "tom",
      name: "Tom Reyes",
      role: "FIN",
      init: "TR",
      color: "user-2",
    },
  ];
  const filteredMentions = TEAM.filter(
    (t) =>
      !mentionQ ||
      t.handle.includes(mentionQ.toLowerCase()) ||
      t.name.toLowerCase().includes(mentionQ.toLowerCase()),
  );
  const onChange = (e) => {
    const v = e.target.value;
    setDraft(v);
    const pos = e.target.selectionStart;
    const upto = v.slice(0, pos);
    const m = upto.match(/(?:^|\s)@([\w]*)$/);
    if (m) {
      setMentionOpen(true);
      setMentionQ(m[1]);
      setMentionIdx(0);
    } else {
      setMentionOpen(false);
    }
  };
  const pickMention = (t) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const pos = ta.selectionStart;
    const upto = draft.slice(0, pos);
    const rest = draft.slice(pos);
    const replaced = upto.replace(/@[\w]*$/, "@" + t.handle + " ");
    const next = replaced + rest;
    setDraft(next);
    setMentionOpen(false);
    setTimeout(() => {
      ta.focus();
      const caret = replaced.length;
      ta.setSelectionRange(caret, caret);
    }, 0);
  };
  const onKeyDown = (e) => {
    if (mentionOpen && filteredMentions.length) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIdx((i) => Math.min(filteredMentions.length - 1, i + 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIdx((i) => Math.max(0, i - 1));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        pickMention(filteredMentions[mentionIdx]);
        return;
      }
      if (e.key === "Escape") {
        setMentionOpen(false);
        return;
      }
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") post();
  };
  const post = async () => {
    if (!draft.trim() || !ctx) return;
    const mentions = [...draft.matchAll(/@(\w+)/g)].map((m) => m[1]);
    const newComment = {
      id: Date.now(),
      who: "E. Chen",
      init: "EC",
      color: "",
      text: draft.trim(),
      time: "just now",
    };
    // Optimistic update
    ctx.setComments({ ...ctx.comments, [row.pn]: [...list, newComment] });
    // Save to API
    try {
      if (api?.comments?.create) {
        await api.comments.create({
          content: draft.trim(),
          entityType: "part",
          entityId: row.id || 0,
          mentions: mentions.length ? mentions : undefined,
        });
      }
    } catch (_e) {
      console.warn("Failed to post comment with mentions:", _e);
    }
    if (mentions.length && ctx.setNotifications) {
      ctx.setNotifications([
        {
          id: Date.now(),
          who: "E. Chen",
          init: "EC",
          color: "",
          action: "mentioned you on",
          obj: row.pn,
          time: "just now",
          read: false,
          route: "bom",
        },
        ...ctx.notifications,
      ]);
    }
    setDraft("");
  };
  const renderText = (text) => {
    const parts = text.split(/(@\w+)/g);
    return parts.map((p, i) =>
      p.startsWith("@") ? (
        <span key={p} className="fg-accent fw-600 br-2 bg-accent-soft">
          {p}
        </span>
      ) : (
        <React.Fragment key={"txt-" + i}>{p}</React.Fragment>
      ),
    );
  };
  return (
    <>
      {list.length === 0 ? (
        <EmptyState
          icon={<span className="font-mono fs-28">“ ”</span>}
          message={
            __t("detailDrawer.noComments") ||
            "No comments yet. Start the conversation."
          }
        />
      ) : (
        <div className="flex flex-col gap-12 mb-14">
          {list.map((c) => (
            <div
              key={c.id}
              className="d-grid gap-10"
              style={{ gridTemplateColumns: "26px 1fr" }}
            >
              <span
                className={(
                  "ava " +
                  (c.color || "") +
                  " w-24 h-24 fs-10"
                ).trim()}
              >
                {c.init}
              </span>
              <div>
                <div className="flex items-baseline gap-6 mb-2">
                  <span className="fw-600 fs-12">{c.who}</span>
                  <span className="font-mono fs-10 fg-3">{c.time}</span>
                </div>
                <div className="fs-12 fg-2" style={{ lineHeight: 1.5 }}>
                  {renderText(c.text)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="border-top pt-12 pos-relative">
        <div
          className="d-grid gap-10 items-start"
          style={{ gridTemplateColumns: "26px 1fr" }}
        >
          <span className="ava w-24 h-24 fs-10">EC</span>
          <div className="relative">
            <Field>
              <Textarea
                id="comment-input"
                name="commentText"
                ref={textareaRef}
                aria-label={__t("detailDrawer.comment") || "Add a comment"}
                placeholder={
                  __t("detailDrawer.commentPlaceholder") ||
                  "Add a comment…  Type @ to mention. Markdown supported."
                }
                value={draft}
                onChange={onChange}
                onKeyDown={onKeyDown}
                className="fs-12 font-sans"
              />
            </Field>
            {mentionOpen && filteredMentions.length > 0 && (
              <div className="pos-absolute">
                <div
                  className="font-mono fs-9 uppercase letter-sp-6 fg-3 border-bottom"
                  style={{ padding: "6px 10px" }}
                >
                  {__t("detailDrawer.mention") || "Mention"}
                </div>
                {filteredMentions.map((t, i) => (
                  <button
                    key={t.handle}
                    onClick={() => pickMention(t)}
                    onMouseEnter={() => setMentionIdx(i)}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "26px 1fr auto",
                      gap: 8,
                      alignItems: "center",
                      width: "100%",
                      padding: "6px 10px",
                      background:
                        i === mentionIdx ? "var(--bg-sunk)" : "transparent",
                      border: "none",
                      textAlign: "left",
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                  >
                    <span
                      className={(
                        "ava " +
                        (t.color || "") +
                        " w-22 h-22 fs-9"
                      ).trim()}
                    >
                      {t.init}
                    </span>
                    <div className="min-w-0">
                      <div className="fw-500">{t.name}</div>
                      <div className="font-mono fs-10 fg-3">@{t.handle}</div>
                    </div>
                    <span className="font-mono fs-9 fg-4 letter-sp-6">
                      {t.role}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <div className="flex justify-between items-center mt-6">
              <div className="flex gap-6">
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  className="font-mono fw-600 fs-12"
                  title={__t("detailDrawer.mentionUser") || "Mention @user"}
                  aria-label={__t("detailDrawer.mentionUser") || "Mention user"}
                  onClick={() => {
                    setDraft(
                      draft + (draft.endsWith(" ") || !draft ? "" : " ") + "@",
                    );
                    setMentionOpen(true);
                    setMentionQ("");
                    setTimeout(() => textareaRef.current?.focus(), 0);
                  }}
                >
                  <span>@</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  title={__t("detailDrawer.attachFile") || "Attach file"}
                  aria-label={__t("detailDrawer.attachFile") || "Attach file"}
                  onClick={() => ctx?.openModal("upload")}
                >
                  <Icon.Import size={11} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  title={
                    __t("detailDrawer.markAsDecision") || "Mark as decision"
                  }
                  aria-label={
                    __t("detailDrawer.markAsDecision") || "Mark as decision"
                  }
                  onClick={() => {
                    const v = draft.trim();
                    if (!v) {
                      toast(
                        __t("detailDrawer.writeCommentFirst") ||
                          "Write a comment first",
                        { kind: "warn" },
                      );
                      return;
                    }
                    const flagged = "**DECISION:** " + v;
                    setDraft(flagged);
                    toast(
                      __t("detailDrawer.markedAsDecision") ||
                        "Comment will be marked as decision",
                      { kind: "info" },
                    );
                  }}
                >
                  <Icon.Flag size={11} />
                </Button>
              </div>
              <div className="flex items-center gap-8">
                <span className="hint">
                  {__t("detailDrawer.cmdEnterToSend") || "⌘↵ to send"}
                </span>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={post}
                  disabled={!draft.trim()}
                >
                  {__t("detailDrawer.comment") || "Comment"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
CommentsTab.propTypes = {
  row: PropTypes.object,
};
function BarcodeTab({ row }) {
  const bars = React.useMemo(() => {
    const s = (row.pn || "X").repeat(6);
    return [...s].map((c, i) => ((c.charCodeAt(0) + i * 7) % 4) + 1);
  }, [row.pn]);
  const qrCells = React.useMemo(() => {
    const size = 21;
    const cells = Array.from({ length: size }, () => Array(size).fill(0));
    const isFinder = (x, y) => {
      const inSquare = (cx, cy) =>
        x >= cx && x < cx + 7 && y >= cy && y < cy + 7;
      return inSquare(0, 0) || inSquare(size - 7, 0) || inSquare(0, size - 7);
    };
    const drawFinder = (cx, cy) => {
      for (let y = 0; y < 7; y++)
        for (let x = 0; x < 7; x++) {
          const edge = x === 0 || x === 6 || y === 0 || y === 6;
          const inner = x >= 2 && x <= 4 && y >= 2 && y <= 4;
          cells[cy + y][cx + x] = edge || inner ? 1 : 0;
        }
    };
    drawFinder(0, 0);
    drawFinder(size - 7, 0);
    drawFinder(0, size - 7);
    const seed = (row.pn || "X")
      .split("")
      .reduce((a, c) => a * 31 + c.charCodeAt(0), 7);
    let s = seed;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (isFinder(x, y)) continue;
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        cells[y][x] = s % 3 === 0 ? 1 : 0;
      }
    }
    for (let i = 8; i < size - 8; i++) {
      cells[6][i] = i % 2 === 0 ? 1 : 0;
      cells[i][6] = i % 2 === 0 ? 1 : 0;
    }
    return cells;
  }, [row.pn]);
  const downloadSVG = (svgEl, name) => {
    const xml = new window.XMLSerializer().serializeToString(svgEl);
    const blob = new Blob([xml], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
    toast((__t("detailDrawer.downloaded") || "Downloaded ") + name, {
      kind: "success",
    });
  };
  const printOne = (svgHTML, title) => {
    // Build markup via escapeHtml + openPrintWindow, consistent with the other
    // print paths (utils/download.js). svgHTML is generated (barcode/QR) markup;
    // interpolated fields (title, row.pn, row.name) are escaped.
    const esc = window.escapeHtml;
    const html =
      "<!doctype html><html><head><title>" +
      esc(title) +
      "</title><style>body{font-family:monospace;text-align:center;padding:30px}</style></head><body>" +
      svgHTML +
      "<div style='margin-top:14px;font-size:14px'>" +
      esc(row.pn) +
      "</div>" +
      "<div style='font-size:11px;color:#666'>" +
      esc(row.name) +
      "</div>" +
      "<" +
      "script>setTimeout(function(){window.print()},200)<\/" +
      "script></body></html>";
    window.openPrintWindow(title, html, { printDelay: 200 });
  };
  const barcodeRef = React.useRef(null);
  const qrRef = React.useRef(null);
  const cell = 6;
  const qrSize = qrCells.length * cell;
  return (
    <>
      <div className="hint mb-14">
        {(__t("detailDrawer.traceabilityCodes") ||
          "Auto-generated traceability codes for ") + row.pn}
        .
      </div>
      <div
        className="border-line rounded-r3 text-center mb-12"
        style={{ padding: 16, background: "white", color: "#000" }}
      >
        <div
          className="font-mono fs-9 letter-sp-6 uppercase mb-6"
          style={{ color: "#666" }}
        >
          {__t("detailDrawer.code128") || "CODE 128"}
        </div>
        <svg
          ref={barcodeRef}
          width="320"
          height="74"
          viewBox={`0 0 ${bars.reduce((s, b) => s + b, 0) + 4} 60`}
          className="d-block mx-auto"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect x="0" y="0" width="100%" height="100%" fill="white" />
          {(() => {
            let x = 2;
            return bars.map((w, i) => {
              const fill = i % 2 === 0 ? "#000" : "#fff";
              const r = (
                <rect
                  key={"bar-" + i}
                  x={x}
                  y="6"
                  width={w}
                  height="42"
                  fill={fill}
                />
              );
              x += w;
              return r;
            });
          })()}
        </svg>
        <div
          className="font-mono fs-12 mt-4"
          style={{ letterSpacing: "0.15em", color: "#000" }}
        >
          {row.pn}
        </div>
      </div>
      <div
        className="border-line rounded-r3 text-center mb-12"
        style={{ padding: 16, background: "white", color: "#000" }}
      >
        <div
          className="font-mono fs-9 letter-sp-6 uppercase mb-6"
          style={{ color: "#666" }}
        >
          {__t("detailDrawer.qrLinks") || "QR · LINKS TO PART RECORD"}
        </div>
        <svg
          ref={qrRef}
          width={qrSize + 24}
          height={qrSize + 24}
          viewBox={`0 0 ${qrSize + 24} ${qrSize + 24}`}
          className="d-block mx-auto"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect x="0" y="0" width="100%" height="100%" fill="white" />
          {qrCells.map((r, y) =>
            r.map((v, x) =>
              v ? (
                <rect
                  key={`${x}-${y}`}
                  x={12 + x * cell}
                  y={12 + y * cell}
                  width={cell}
                  height={cell}
                  fill="#000"
                />
              ) : null,
            ),
          )}
        </svg>
        <div className="font-mono fs-10 mt-4" style={{ color: "#666" }}>
          bbox.dev/p/{row.pn}
        </div>
      </div>
      <div className="d-grid gap-8" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            barcodeRef.current &&
            downloadSVG(barcodeRef.current, row.pn + "_barcode.svg")
          }
        >
          <Icon.Export size={11} />{" "}
          {__t("detailDrawer.downloadBarcode") || "Download barcode"}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            qrRef.current && downloadSVG(qrRef.current, row.pn + "_qr.svg")
          }
        >
          <Icon.Export size={11} />{" "}
          {__t("detailDrawer.downloadQr") || "Download QR"}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            barcodeRef.current &&
            printOne(barcodeRef.current.outerHTML, row.pn + " barcode")
          }
        >
          {__t("detailDrawer.printBarcodeLabel") || "Print barcode label"}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            qrRef.current && printOne(qrRef.current.outerHTML, row.pn + " QR")
          }
        >
          {__t("detailDrawer.printQrLabel") || "Print QR label"}
        </Button>
      </div>
      <div
        className="mt-10 bg-sunk border-line rounded-r2 fs-11 fg-3 font-mono"
        style={{ padding: 10 }}
      >
        {__t("detailDrawer.wmsCompat") ||
          "WMS compat: GS1-128 · QR points to internal part record · scan with the Scan button in topbar/Components to look up."}
      </div>
    </>
  );
}
BarcodeTab.propTypes = {
  row: PropTypes.object,
};
function HistoryTab({ row }) {
  const events = [
    {
      ver: "Rev " + row.rev,
      who: "E. Chen",
      what: "Current revision",
      when: "2026-05-12",
      current: true,
    },
    {
      ver:
        "Rev " +
        (row.rev === "A"
          ? "—"
          : String.fromCharCode(row.rev.charCodeAt(0) - 1)),
      who: "M. Park",
      what: "Updated specifications + datasheet",
      when: "2026-04-28",
    },
    {
      ver: "Rev A",
      who: "E. Chen",
      what: "Initial release",
      when: "2026-02-14",
    },
  ];
  return (
    <>
      <div className="hint mb-10">
        {__t("detailDrawer.revisionHistory") || "Revision history"}
      </div>
      <div className="pos-relative" style={{ paddingLeft: 18 }}>
        <div
          className="pos-absolute w-1"
          style={{ left: 6, top: 4, bottom: 4, background: "var(--line)" }}
        />
        {events.map((e) => (
          <div key={e.ver} className="relative mb-14">
            <div className="pos-absolute" />
            <div className="font-mono fs-11 fw-600">{e.ver}</div>
            <div className="fs-12 fg-2 mt-2">{e.what}</div>
            <div className="font-mono fs-10 fg-3 mt-2">
              {e.who} · {e.when}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
HistoryTab.propTypes = {
  row: PropTypes.object,
};
export { Drawer };
window.Drawer = Drawer;
