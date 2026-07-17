import PropTypes from "prop-types";
import { __t } from "../i18n";
import { toast } from "../utils/toast";
// Production-tier additions: error/404/offline screens, Inventory module,
// In-app guided tour, Pricing/plans modal, optimistic-update retry toast,
// skeleton/empty illustrations.
// ============ ERROR / 404 / OFFLINE / PERMISSION-DENIED SCREENS ============
function ErrorScreen({ kind = "error", title, body, action, onAction }) {
  const presets = {
    error: {
      ico: "\u26A0",
      color: "var(--danger)",
      title: title || __t("error.somethingWentWrong") || "Something went wrong",
      body:
        body ||
        __t("error.unexpectedError") ||
        "An unexpected error occurred. Our team has been notified.",
    },
    404: {
      ico: "404",
      color: "var(--fg-3)",
      title: title || __t("error.pageNotFound") || "Page not found",
      body:
        body ||
        __t("error.couldNotFind") ||
        "We couldn't find what you're looking for.",
    },
    offline: {
      ico: "\u2327",
      color: "var(--warn)",
      title: title || __t("error.youreOffline") || "You're offline",
      body:
        body ||
        __t("error.offlineBody") ||
        "Check your connection. Your changes are saved locally and will sync when you're back.",
    },
    permission: {
      ico: "\u2298",
      color: "var(--fg-3)",
      title: title || __t("error.permissionDenied") || "Permission denied",
      body:
        body ||
        __t("error.permissionBody") ||
        "You don't have access to this. Ask an Admin to grant the required role.",
    },
    empty: {
      ico: "\u2205",
      color: "var(--fg-4)",
      title: title || __t("error.nothingHere") || "Nothing here yet",
      body:
        body ||
        __t("error.nothingHereBody") ||
        "Get started by creating your first item.",
    },
  };
  const p = presets[kind] || presets.error;
  return (
    <div className="err-screen">
      <div
        className="err-ico font-mono"
        style={{
          color: p.color,
          fontSize: kind === "404" ? 56 : 64,
          fontWeight: kind === "404" ? 700 : 400,
          letterSpacing: kind === "404" ? "-0.04em" : 0,
        }}
      >
        {p.ico}
      </div>
      <h2>{p.title}</h2>
      <p>{p.body}</p>
      {action && (
        <button className="btn primary mt-14" onClick={onAction}>
          {action}
        </button>
      )}
    </div>
  );
}
ErrorScreen.propTypes = {
  kind: PropTypes.string,
  title: PropTypes.string,
  body: PropTypes.any,
  action: PropTypes.func,
  onAction: PropTypes.func,
};
// Empty-state with illustration
function EmptyState({ icon = "\u2205", title, body, action, onAction }) {
  return (
    <div className="empty-illust">
      <svg viewBox="0 0 160 100" width="160" height="100" className="mb-14">
        <rect
          x="20"
          y="20"
          width="120"
          height="70"
          rx="6"
          fill="var(--bg-sunk)"
          stroke="var(--line)"
          strokeWidth="1.5"
        />
        <line
          x1="20"
          y1="38"
          x2="140"
          y2="38"
          stroke="var(--line)"
          strokeWidth="1"
        />
        <circle cx="30" cy="29" r="3" fill="var(--line)" />
        <circle cx="40" cy="29" r="3" fill="var(--line)" />
        <rect
          x="32"
          y="48"
          width="40"
          height="6"
          rx="1"
          fill="var(--line-soft)"
        />
        <rect
          x="32"
          y="60"
          width="60"
          height="6"
          rx="1"
          fill="var(--line-soft)"
        />
        <rect
          x="32"
          y="72"
          width="32"
          height="6"
          rx="1"
          fill="var(--line-soft)"
        />
        <circle
          cx="120"
          cy="68"
          r="14"
          fill="var(--accent-soft)"
          stroke="var(--accent)"
          strokeWidth="1.5"
        />
        <text
          x="120"
          y="74"
          textAnchor="middle"
          fontFamily="var(--font-mono)"
          fontSize="14"
          fontWeight="700"
          fill="var(--accent)"
        >
          {icon}
        </text>
      </svg>
      <h3 className="fs-14" style={{ margin: "0 0 6px" }}>
        {title || __t("error.nothingHere") || "Nothing here yet"}
      </h3>
      <p
        className="fs-12 fg-3"
        style={{ margin: 0, maxWidth: 320, lineHeight: 1.5 }}
      >
        {body ||
          __t("error.nothingHereBody") ||
          "Get started by creating your first item."}
      </p>
      {action && (
        <button className="btn primary mt-16" onClick={onAction}>
          {action}
        </button>
      )}
    </div>
  );
}
EmptyState.propTypes = {
  icon: PropTypes.string,
  title: PropTypes.string,
  body: PropTypes.any,
  action: PropTypes.func,
  onAction: PropTypes.func,
};
// Skeleton row used in lists during fetch
function SkeletonRows({ count = 6, cols = [80, 200, 80, 60, 100, 80] }) {
  return (
    <table className="bom-table table-auto">
      <tbody>
        {Array.from({ length: count }).map((_, i) => (
          <tr key={"skel-" + i}>
            {cols.map((w, j) => (
              <td key={"sc-" + j} style={{ padding: "10px 12px" }}>
                <span
                  className="skeleton"
                  style={{
                    display: "inline-block",
                    width: w + "px",
                    height: 10,
                  }}
                />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
SkeletonRows.propTypes = {
  count: PropTypes.number,
  cols: PropTypes.any,
};
// ============ INVENTORY MODULE ============
function InventoryScreen() {
  const ctx = useAppStore();
  const baseRows = ctx?.rows || BOM_DATA.rows;
  const inventory = React.useMemo(() => {
    const leaves = [];
    const walk = (rs) =>
      rs.forEach((r) => {
        if (r.children) walk(r.children);
        else leaves.push(r);
      });
    walk(baseRows);
    return leaves.map((r, i) => {
      const seed = r.pn.charCodeAt(0) + r.pn.charCodeAt(r.pn.length - 1);
      const stock = Math.max(0, ((seed * 7) % 500) - (i % 5 === 0 ? 480 : 0));
      const reorder = Math.max(10, Math.round((r.qty || 1) * 20));
      const bin = `${String.fromCharCode(65 + (seed % 6))}-${String((seed % 20) + 1).padStart(2, "0")}-${String(((seed * 3) % 30) + 1).padStart(2, "0")}`;
      return {
        ...r,
        stock,
        reorder,
        bin,
        status: stock === 0 ? "out" : stock < reorder ? "low" : "ok",
      };
    });
  }, [baseRows]);
  const [statusFilter, setStatusFilter] = React.useState("All");
  const [iSearch, setISearch] = React.useState("");
  const filtered = inventory.filter(
    (r) =>
      (statusFilter === "All" || r.status === statusFilter.toLowerCase()) &&
      (!iSearch ||
        (r.pn + " " + r.name).toLowerCase().includes(iSearch.toLowerCase())),
  );
  const totals = {
    ok: inventory.filter((r) => r.status === "ok").length,
    low: inventory.filter((r) => r.status === "low").length,
    out: inventory.filter((r) => r.status === "out").length,
    value: inventory.reduce((s, r) => s + r.stock * (r.cost || 0), 0),
  };
  return (
    <div className="screen-wrap">
      <div className="screen-header">
        <div>
          <h1>{__t("inventory.title") || "Inventory"}</h1>
          <div className="sub">
            {__t("inventory.subtitle", {
              count: inventory.length,
              value: (
                (totals.value * (window.INR_RATE || 83)) /
                100000
              ).toFixed(1),
            }) ||
              `${inventory.length} SKUs \u00B7 \u20B9${(totals.value * (window.INR_RATE || 83)).toLocaleString("en-IN", { maximumFractionDigits: 0 })} on hand \u00B7 6 warehouses`}
          </div>
        </div>
        <div className="flex gap-8">
          <div className="search w-220 h-32">
            <Icon.Search size={12} />
            <input
              id="inv-sku-search"
              name="skuSearch"
              placeholder={
                __t("inventory.searchPlaceholder") || "Search SKU\u2026"
              }
              value={iSearch}
              onChange={(e) => setISearch(e.target.value)}
              aria-label={__t("inventory.searchAriaLabel") || "Search SKU"}
            />
          </div>
          <DropdownButton
            width={180}
            trigger={
              <button className="btn">
                <Icon.Scan size={12} />{" "}
                {__t("inventory.receiveStock") || "Receive stock"}{" "}
                <Icon.ChevronDown size={10} />
              </button>
            }
            items={[
              {
                icon: <Icon.Scan size={11} />,
                label: __t("inventory.scanInbound") || "Scan inbound",
                onClick: () => ctx?.openModal("barcode-scan"),
              },
              {
                icon: <Icon.Import size={11} />,
                label: __t("inventory.bulkCsv") || "Bulk CSV",
                onClick: () => ctx?.openModal("bulk-import"),
              },
              {
                icon: <Icon.Plus size={11} />,
                label: __t("inventory.manualAdjust") || "Manual adjust",
                onClick: () =>
                  toast(__t("inventory.adjustStock") || "Adjust stock"),
              },
            ]}
          />
          <button
            className="btn primary"
            onClick={() =>
              toast(
                __t("inventory.reorderReport") ||
                  "Reorder report drafted \u00B7 4 SKUs flagged",
                {
                  kind: "success",
                  action: {
                    label: __t("inventory.openPo") || "Open PO",
                    onClick: () => ctx?.openModal("new-po"),
                  },
                },
              )
            }
          >
            <Icon.Cart size={12} />{" "}
            {__t("inventory.reorderLow") || "Reorder low"}
          </button>
        </div>
      </div>
      <div
        className="kpi-grid"
        style={{ gridTemplateColumns: "repeat(4, 1fr)" }}
      >
        {[
          {
            l: __t("inventory.inStock") || "In stock",
            v: totals.ok,
            c: "var(--ok)",
          },
          {
            l: __t("inventory.lowStock") || "Low stock",
            v: totals.low,
            c: "var(--warn)",
          },
          {
            l: __t("inventory.outOfStock") || "Out of stock",
            v: totals.out,
            c: "var(--danger)",
          },
          {
            l: __t("inventory.inventoryValue") || "Inventory value",
            v:
              "\u20B9" +
              ((totals.value * (window.INR_RATE || 83)) / 100000).toFixed(1) +
              "L",
            c: "var(--accent)",
          },
        ].map((k) => (
          <div key={k.l} className="kpi">
            <div className="l">{k.l}</div>
            <div className="v" style={{ color: k.c }}>
              {k.v}
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-6 mb-12" style={{ flexWrap: "wrap" }}>
        {[
          __t("inventory.filterAll") || "All",
          __t("inventory.filterOk") || "Ok",
          __t("inventory.filterLow") || "Low",
          __t("inventory.filterOut") || "Out",
        ].map((s) => (
          <span
            key={s}
            className={(
              (
                "chip " +
                (s === statusFilter ? "active" : "") +
                " cursor-pointer"
              ).trim() + " fg-4 ml-4"
            ).trim()}
            onClick={() => setStatusFilter(s)}
          >
            {s}{" "}
            <span>
              {s === (__t("inventory.filterAll") || "All")
                ? inventory.length
                : totals[s.toLowerCase()]}
            </span>
          </span>
        ))}
      </div>
      {filtered.length === 0 ? (
        <EmptyState
          icon={"\u2205"}
          title={__t("inventory.emptyTitle") || "No inventory items match"}
          body={
            __t("inventory.emptyBody") ||
            "Try clearing filters or scanning new stock in."
          }
        />
      ) : (
        <div className="card overflow-vis">
          <table className="bom-table table-auto">
            <thead>
              <tr>
                <th className="pl-16">
                  {__t("inventory.table.partNo") || "Part No."}
                </th>
                <th>{__t("inventory.table.name") || "Name"}</th>
                <th>{__t("inventory.table.bin") || "Bin"}</th>
                <th className="num">
                  {__t("inventory.table.onHand") || "On hand"}
                </th>
                <th className="num">
                  {__t("inventory.table.reorderPt") || "Reorder pt"}
                </th>
                <th className="num">
                  {__t("inventory.table.unitCost") || "Unit cost"}
                </th>
                <th className="num">
                  {__t("inventory.table.value") || "Value"}
                </th>
                <th>{__t("inventory.table.status") || "Status"}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className="mono pl-16 fw-600">{r.pn}</td>
                  <td>{r.name}</td>
                  <td className="mono fg-3">
                    {"\uD83D\uDCCD"} {r.bin}
                  </td>
                  <td
                    className="num mono fw-700"
                    style={{
                      color:
                        r.status === "out"
                          ? "var(--danger)"
                          : r.status === "low"
                            ? "var(--warn)"
                            : "var(--fg)",
                    }}
                  >
                    {r.stock}
                  </td>
                  <td className="num mono fg-3">{r.reorder}</td>
                  <td className="num mono">{INR(r.cost, 2)}</td>
                  <td className="num mono fw-600">
                    {INR(r.stock * (r.cost || 0), 0)}
                  </td>
                  <td>
                    <span
                      className={
                        "status " +
                        (r.status === "ok"
                          ? "released"
                          : r.status === "low"
                            ? "review"
                            : "deprecated")
                      }
                    >
                      {r.status === "ok"
                        ? __t("inventory.statusInStock") || "In stock"
                        : r.status === "low"
                          ? __t("inventory.statusLow") || "Low"
                          : __t("inventory.statusOut") || "Out"}
                    </span>
                  </td>
                  <td>
                    <DropdownButton
                      width={180}
                      trigger={
                        <button
                          className="icon-btn w-22 h-22"
                          aria-label={
                            __t("inventory.moreOptions") || "More options"
                          }
                        >
                          <Icon.Dots size={11} />
                        </button>
                      }
                      items={[
                        {
                          icon: <Icon.Cart size={11} />,
                          label: __t("inventory.reorder") || "Reorder",
                          onClick: () =>
                            toast(
                              __t("inventory.draftedPo", { pn: r.pn }) ||
                                "Drafted PO for " + r.pn,
                            ),
                        },
                        {
                          icon: <Icon.Edit size={11} />,
                          label: __t("inventory.adjustStock") || "Adjust stock",
                          onClick: () =>
                            toast(__t("inventory.adjusted") || "Adjusted"),
                        },
                        {
                          icon: <Icon.Scan size={11} />,
                          label:
                            __t("inventory.printBinLabel") || "Print bin label",
                          onClick: () =>
                            toast(
                              __t("inventory.printing", { bin: r.bin }) ||
                                "Printing " + r.bin,
                            ),
                        },
                      ]}
                    />
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
    {
      id: "free",
      name: __t("pricing.free") || "Free",
      price: "\u20B90",
      per: __t("pricing.forever") || "forever",
      desc: __t("pricing.freeDesc") || "For solo makers and hobbyists",
      features: [
        __t("pricing.freeFeature1") || "1 user",
        __t("pricing.freeFeature2") || "1 BOM project",
        __t("pricing.freeFeature3") || "100 parts",
        __t("pricing.freeFeature4") || "CSV export",
        __t("pricing.freeFeature5") || "Community support",
      ],
      cta: __t("pricing.currentPlan") || "Current plan",
    },
    {
      id: "team",
      name: __t("pricing.team") || "Team",
      price: "\u20B919,920",
      per: __t("pricing.perMonth") || "/mo",
      desc: __t("pricing.teamDesc") || "Small teams shipping hardware",
      features: [
        __t("pricing.teamFeature1") || "Up to 24 users",
        __t("pricing.teamFeature2") || "Unlimited BOMs",
        __t("pricing.teamFeature3") || "100,000 parts",
        __t("pricing.teamFeature4") || "Vendor management",
        __t("pricing.teamFeature5") || "Procurement",
        __t("pricing.teamFeature6") || "Slack + email notifications",
        __t("pricing.teamFeature7") || "Priority email support",
      ],
      cta: __t("pricing.upgrade") || "Upgrade",
      best: true,
    },
    {
      id: "biz",
      name: __t("pricing.business") || "Business",
      price: "\u20B949,800",
      per: __t("pricing.perMonth") || "/mo",
      desc: __t("pricing.bizDesc") || "Production-ready manufacturing",
      features: [
        __t("pricing.bizFeature1") || "Unlimited users",
        __t("pricing.bizFeature2") || "Unlimited BOMs",
        __t("pricing.bizFeature3") || "SolidWorks CAD sync",
        __t("pricing.bizFeature4") || "Advanced analytics",
        __t("pricing.bizFeature5") || "Audit log + SSO",
        __t("pricing.bizFeature6") || "SAML / OIDC",
        __t("pricing.bizFeature7") || "99.9% SLA",
        __t("pricing.bizFeature8") || "Dedicated CSM",
      ],
      cta: __t("pricing.talkToSales") || "Talk to sales",
    },
    {
      id: "ent",
      name: __t("pricing.enterprise") || "Enterprise",
      price: __t("pricing.custom") || "Custom",
      per: "",
      desc: __t("pricing.entDesc") || "Large orgs with custom needs",
      features: [
        __t("pricing.entFeature1") || "Everything in Business",
        __t("pricing.entFeature2") || "Self-hosted option",
        __t("pricing.entFeature3") || "SOC 2 Type II + HIPAA",
        __t("pricing.entFeature4") || "Custom contracts",
        __t("pricing.entFeature5") || "Dedicated environment",
        __t("pricing.entFeature6") || "Premium SLA",
        __t("pricing.entFeature7") || "TAM + onboarding",
      ],
      cta: __t("pricing.contactSales") || "Contact sales",
    },
  ];
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Sparkles size={16} />}
      title={__t("pricing.title") || "Plans & pricing"}
      subtitle={
        __t("pricing.subtitle") || "Choose the plan that fits your team"
      }
      wide
    >
      <div
        className="d-grid gap-10"
        style={{ gridTemplateColumns: "repeat(4, 1fr)" }}
      >
        {plans.map((p) => (
          <div
            key={p.id}
            className="rounded-r3 bg-canvas pos-relative flex flex-col"
            style={{
              border:
                "1.5px solid " + (p.best ? "var(--accent)" : "var(--line)"),
              padding: 16,
            }}
          >
            {p.best && (
              <span
                className="pos-absolute font-mono fs-9 bg-accent letter-sp-8"
                style={{
                  top: -10,
                  left: 12,
                  padding: "2px 8px",
                  color: "white",
                  borderRadius: 99,
                }}
              >
                {__t("pricing.mostPopular") || "MOST POPULAR"}
              </span>
            )}
            <div className="font-mono fs-10 fg-3 uppercase letter-sp-8">
              {p.name}
            </div>
            <div
              className="flex items-baseline gap-4"
              style={{ margin: "8px 0 4px" }}
            >
              <span className="font-mono fs-22 fw-700">{p.price}</span>
              <span className="font-mono fs-11 fg-3">{p.per}</span>
            </div>
            <div className="fs-11 fg-3 mb-12" style={{ minHeight: 30 }}>
              {p.desc}
            </div>
            <ul
              className="fs-11 fg-2 flex-1"
              style={{ listStyle: "none", padding: 0, margin: "0 0 14px" }}
            >
              {p.features.map((f) => (
                <li key={f} className="flex gap-6" style={{ padding: "3px 0" }}>
                  <span className="fg-ok">\u2713</span> {f}
                </li>
              ))}
            </ul>
            <button
              className={(
                "btn " +
                (p.best ? "primary" : "") +
                " w-100p justify-center"
              ).trim()}
              onClick={() => {
                onClose();
                toast(p.cta + " \u00B7 " + p.name);
              }}
            >
              {p.cta}
            </button>
          </div>
        ))}
      </div>
      <div
        className="mt-16 bg-sunk border-line rounded-r2 fs-11 fg-3 text-center"
        style={{ padding: 12 }}
      >
        {__t("pricing.footer") ||
          "All plans billed annually, 14-day free trial \u00B7 No credit card required \u00B7 Cancel anytime"}
      </div>
    </Modal>
  );
}
PricingModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
};
// ============ PRODUCT TOUR ============
const TOUR_STEPS = [
  {
    sel: ".nav-item.active",
    title: __t("tour.step1Title") || "BOM Editor",
    body:
      __t("tour.step1Body") ||
      "Your active workspace view. Switch between BOM Editor, Components, Vendors, Procurement, and more from this left rail.",
  },
  {
    sel: ".search",
    title: __t("tour.step2Title") || "Global search (\u2318K)",
    body:
      __t("tour.step2Body") ||
      "Find any part, vendor, BOM, or action from anywhere. Try \u2318K from any screen.",
  },
  {
    sel: ".project-pill",
    title: __t("tour.step3Title") || "Active project",
    body:
      __t("tour.step3Body") ||
      "You're working in this project's BOM. Click ATLAS in the breadcrumb to switch projects.",
  },
  {
    sel: ".ribbon",
    title: __t("tour.step4Title") || "Cost rollup",
    body:
      __t("tour.step4Body") ||
      "Live totals from your BOM \u2014 cost, lead time, vendor + country diversification, risk flags.",
  },
  {
    sel: ".bom-table tbody tr:first-child .icon-btn:last-child",
    title: __t("tour.step5Title") || "Row actions",
    body:
      __t("tour.step5Body") ||
      "Every part has Find Alternates, Send RFQ, Duplicate, Delete, and more. The chevron next to it opens full detail.",
  },
  {
    sel: ".topbar .icon-btn[title='Notifications']",
    title: __t("tour.step6Title") || "Notifications",
    body:
      __t("tour.step6Body") ||
      "@-mentions, approval requests, supply-chain alerts. Live and persistent.",
  },
];
function ProductTour({ onClose }) {
  const [step, setStep] = React.useState(0);
  const [pos, setPos] = React.useState(null);
  const stepData = TOUR_STEPS[step];
  React.useEffect(() => {
    const place = () => {
      const el = document.querySelector(stepData.sel);
      if (!el) {
        setPos({ top: 100, left: 100, w: 0, h: 0, fallback: true });
        return;
      }
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
      <div className="tour-backdrop" />
      {!pos.fallback && (
        <div
          className="tour-spotlight"
          style={{
            top: pos.top - 6,
            left: pos.left - 6,
            width: pos.w + 12,
            height: pos.h + 12,
          }}
        />
      )}
      <div className="tour-tip" style={{ top: tipTop, left: tipLeft }}>
        <div className="font-mono fs-9 uppercase letter-sp-8 fg-accent mb-6">
          {__t("tour.stepOf", { step: step + 1, total: TOUR_STEPS.length }) ||
            `Step ${step + 1} of ${TOUR_STEPS.length}`}
        </div>
        <div className="fw-700 fs-14 mb-6">{stepData.title}</div>
        <div className="fs-12 fg-2 mb-12" style={{ lineHeight: 1.5 }}>
          {stepData.body}
        </div>
        <div className="flex justify-between items-center">
          <button
            onClick={onClose}
            className="bg-transparent b-0 fg-3 fs-11 c-pointer"
          >
            {__t("tour.skip") || "Skip tour"}
          </button>
          <div className="flex gap-6">
            {step > 0 && (
              <button className="btn small" onClick={() => setStep(step - 1)}>
                {__t("common.back") || "Back"}
              </button>
            )}
            <button
              className="btn primary small"
              onClick={() =>
                step === TOUR_STEPS.length - 1 ? onClose() : setStep(step + 1)
              }
            >
              {step === TOUR_STEPS.length - 1
                ? __t("tour.finish") || "Finish"
                : __t("common.next") || "Next \u2192"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
ProductTour.propTypes = {
  onClose: PropTypes.func,
};
// ============ OPTIMISTIC RETRY HELPER ============
// Usage: optimistic(() => doMutation(), { undo: () => revert(), label: "Saved" });
// 12% chance of simulated failure for demo purposes.
export function optimistic(mutation, opts = {}) {
  try {
    mutation();
  } catch (e) {
    toast(
      __t("common.failedWithMessage", { message: e.message }) ||
        "Failed: " + e.message,
      { kind: "error" },
    );
    return;
  }
  if (Math.random() < 0.12) {
    // Simulate API failure after a delay
    setTimeout(() => {
      toast(opts.failLabel || __t("common.saveFailed") || "Save failed", {
        kind: "error",
        duration: 6000,
        action: {
          label: __t("common.retry") || "Retry",
          onClick: () => optimistic(mutation, opts),
        },
      });
      opts.undo && opts.undo();
    }, 600);
  } else if (opts.label) {
    setTimeout(
      () => toast(opts.label, { kind: "success", duration: 1800 }),
      200,
    );
  }
}
window.optimistic = optimistic;
export {
  ErrorScreen,
  EmptyState,
  SkeletonRows,
  InventoryScreen,
  PricingModal,
  ProductTour,
};
Object.assign(window, {
  ErrorScreen,
  EmptyState,
  SkeletonRows,
  InventoryScreen,
  PricingModal,
  ProductTour,
});
