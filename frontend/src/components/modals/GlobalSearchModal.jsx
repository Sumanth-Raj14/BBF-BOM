import PropTypes from "prop-types";

import { __t } from "../../i18n";
import { BOM_DATA, Icon, useAppStore } from "../../globals";
import { Modal, Input } from "../ui";
// ============ GLOBAL SEARCH (⌘K) ============
export default function GlobalSearchModal({ open, onClose }) {
  const ctx = useAppStore();
  const [q, setQ] = React.useState("");
  const [idx, setIdx] = React.useState(0);
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) return undefined;
    setQ("");
    setIdx(0);
    // Modal's own initial-focus effect runs first and lands on its close
    // button (first focusable in the header); defer so the search field
    // wins focus once the dialog has finished mounting.
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  const data = BOM_DATA;
  const results = React.useMemo(() => {
    if (!q.trim()) return null;
    const ql = q.toLowerCase();
    const out = [];
    const seen = new Set();
    const push = (item) => {
      const key = item.kind + ":" + (item.route || "") + ":" + item.title;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(item);
    };
    const walk = (rs) =>
      rs.forEach((r) => {
        if (
          (r.pn + " " + r.name).toLowerCase().includes(ql) ||
          (r.barcode && r.barcode.includes(ql))
        ) {
          push({
            kind: "part",
            route: "bom",
            title: r.name,
            subtitle:
              r.pn + " · " + r.category + (r.barcode ? " · " + r.barcode : ""),
            icon: <Icon.Parts size={13} />,
          });
        }
        if (r.children) walk(r.children);
      });
    walk(ctx?.rows || data.rows);
    // Vendors
    (ctx?.vendors || data.vendors).forEach((v) => {
      if (v.name.toLowerCase().includes(ql)) {
        push({
          kind: "vendor",
          route: "vendors",
          title: v.name,
          subtitle: v.country + " · ★ " + v.rating,
          icon: <Icon.Vendor size={13} />,
        });
      }
    });
    // Documents
    (data.docs || []).forEach((d) => {
      if (d.name.toLowerCase().includes(ql)) {
        push({
          kind: "doc",
          route: "docs",
          title: d.name,
          subtitle: d.tag + " · " + d.size,
          icon: <Icon.Doc size={13} />,
        });
      }
    });
    // Projects / BOMs
    const proj = ctx?.project || data.project;
    if (proj) {
      const pStr =
        (proj.name || "") +
        " " +
        (proj.version || "") +
        " " +
        (proj.rev || "") +
        " " +
        (proj.description || "");
      if (pStr.toLowerCase().includes(ql)) {
        push({
          kind: "bom",
          route: "bom",
          title: proj.name || "BOM",
          subtitle:
            (proj.version || "") +
            " · " +
            (proj.rev || "") +
            " · " +
            (proj.owner || ""),
          icon: <Icon.Bom size={13} />,
        });
      }
    }
    // POs — search procurement data
    const proc = data.procurement;
    if (proc && typeof proc === "object") {
      Object.entries(proc).forEach(([status, items]) => {
        (items || []).forEach((po) => {
          const poStr =
            (po.poNumber || "") +
            " " +
            (po.pn || "") +
            " " +
            (po.vendor || "") +
            " " +
            (po.name || "");
          if (poStr.toLowerCase().includes(ql)) {
            push({
              kind: "po",
              route: "procurement",
              title: po.poNumber || po.pn,
              subtitle:
                (po.vendor || "") +
                " · " +
                (po.qty || 0) +
                " units · " +
                (po.eta || "—"),
              icon: <Icon.Cart size={13} />,
            });
          }
        });
      });
    }
    // Inventory — search from ctx.rows flat parts with stock info
    const flatParts = (ctx?.rows || data.rows || [])
      .flatMap((s) => s.children || [])
      .flatMap((c) => c.children || []);
    flatParts.forEach((p) => {
      if (
        p.stock !== undefined &&
        p.stock !== null &&
        (p.pn + " " + p.name).toLowerCase().includes(ql)
      ) {
        push({
          kind: "inventory",
          route: "inventory",
          title: p.name,
          subtitle:
            p.pn +
            " · stock: " +
            (p.stock || 0) +
            " · loc: " +
            (p.location || "—"),
          icon: <Icon.Package size={13} />,
        });
      }
    });
    // Quick actions (expanded)
    if ("new po new purchase order order procurement".includes(ql))
      push({
        kind: "action",
        action: "new-po",
        title: __t("modals.globalSearch.createNewPo") || "Create new PO",
        subtitle: __t("modals.globalSearch.quickAction") || "Quick action",
        icon: <Icon.Plus size={13} />,
      });
    if ("compare diff revision".includes(ql))
      push({
        kind: "action",
        route: "diff",
        title:
          __t("modals.globalSearch.compareRevisions") || "Compare revisions",
        subtitle: __t("modals.globalSearch.openDiffView") || "Open diff view",
        icon: <Icon.Diff size={13} />,
      });
    if ("analytics dashboard kpi".includes(ql))
      push({
        kind: "action",
        route: "analytics",
        title:
          __t("modals.globalSearch.analyticsDashboard") ||
          "Analytics dashboard",
        subtitle: __t("modals.globalSearch.openAnalytics") || "Open analytics",
        icon: <Icon.Chart size={13} />,
      });
    if ("approve approval ecr eco change".includes(ql))
      push({
        kind: "action",
        route: "approvals",
        title:
          __t("modals.globalSearch.pendingApprovals") || "Pending approvals",
        subtitle:
          __t("modals.globalSearch.reviewEcr") || "Review ECRs and ECOs",
        icon: <Icon.Check size={13} />,
      });
    if ("compliance rohs reach conflict".includes(ql))
      push({
        kind: "action",
        route: "compliance",
        title:
          __t("modals.globalSearch.complianceDashboard") ||
          "Compliance dashboard",
        subtitle:
          __t("modals.globalSearch.checkCompliance") ||
          "RoHS / REACH / Conflict minerals",
        icon: <Icon.Shield size={13} />,
      });
    if ("work order wo manufacturing".includes(ql))
      push({
        kind: "action",
        route: "work-orders",
        title: __t("modals.globalSearch.workOrders") || "Work orders",
        subtitle:
          __t("modals.globalSearch.manageWo") ||
          "Manage manufacturing work orders",
        icon: <Icon.Settings size={13} />,
      });
    if ("ncr nonconformance quality".includes(ql))
      push({
        kind: "action",
        route: "ncr",
        title: __t("modals.globalSearch.ncrReports") || "NCR reports",
        subtitle:
          __t("modals.globalSearch.qualityIssues") ||
          "Quality non-conformance reports",
        icon: <Icon.Alert size={13} />,
      });
    if ("calendar schedule milestone".includes(ql))
      push({
        kind: "action",
        route: "calendar",
        title: __t("modals.globalSearch.calendar") || "Project calendar",
        subtitle:
          __t("modals.globalSearch.viewSchedule") ||
          "View milestones and schedule",
        icon: <Icon.Calendar size={13} />,
      });
    return out.slice(0, 16);
  }, [q]);

  const choose = (r) => {
    onClose();
    if (r.action === "new-po") {
      window.__nav?.("procurement");
      setTimeout(
        () =>
          window.dispatchEvent(
            new CustomEvent("open-modal", { detail: "new-po" }),
          ),
        50,
      );
      return;
    }
    if (r.route) window.__nav?.(r.route);
  };

  React.useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (!results?.length) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setIdx((i) => Math.min(results.length - 1, i + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setIdx((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        choose(results[idx]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, results, idx]);

  if (!open) return null;

  const listboxId = "global-search-listbox";
  const activeOptionId =
    results && results.length ? `global-search-opt-${idx}` : undefined;

  const quickAccess = [
    {
      title:
        __t("modals.globalSearch.openBomEditor") || "Open BOM Editor",
      sub:
        __t("modals.globalSearch.atlasMainframe") ||
        "ATLAS / Mainframe Rev C",
      route: "bom",
      icon: <Icon.Bom size={13} />,
    },
    {
      title:
        __t("modals.globalSearch.componentLibrary") || "Component Library",
      sub: __t("modals.globalSearch.browseParts") || "Browse all parts",
      route: "parts",
      icon: <Icon.Parts size={13} />,
    },
    {
      title:
        __t("modals.globalSearch.procurementPipeline") ||
        "Procurement Pipeline",
      sub: __t("modals.globalSearch.activePos") || "Active POs and RFQs",
      route: "procurement",
      icon: <Icon.Cart size={13} />,
    },
    {
      title: __t("modals.globalSearch.analytics") || "Analytics",
      sub: __t("modals.globalSearch.costTrends") || "Cost trends and scorecards",
      route: "analytics",
      icon: <Icon.Chart size={13} />,
    },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Search size={16} />}
      title={__t("modals.globalSearch.title") || "Global search"}
      subtitle={
        __t("modals.globalSearch.subtitle") ||
        "Parts, BOMs, vendors, POs, documents, actions"
      }
      size="lg"
      closeLabel={
        __t("modals.globalSearch.closeDialog") || "Close global search dialog"
      }
      footer={
        <div
          className="flex items-center gap-14 font-mono fs-10 fg-3"
          style={{ width: "100%" }}
        >
          <span>
            <span className="kbd" aria-hidden="true">
              ↑↓
            </span>{" "}
            {__t("modals.globalSearch.navigate") || "navigate"}
          </span>
          <span>
            <span className="kbd" aria-hidden="true">
              ↵
            </span>{" "}
            {__t("modals.globalSearch.open") || "open"}
          </span>
          <span style={{ marginLeft: "auto" }}>
            {results?.length || 0}{" "}
            {__t("modals.globalSearch.result") || "result"}
            {results?.length === 1 ? "" : "s"}
          </span>
        </div>
      }
    >
      <div
        className="flex items-center gap-10 border-bottom"
        style={{ margin: "-16px -16px 12px", padding: "0 16px 14px" }}
      >
        <Icon.Search size={14} aria-hidden="true" />
        <Input
          ref={inputRef}
          id="global-search"
          name="globalSearch"
          type="text"
          role="combobox"
          aria-expanded={!!q.trim()}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeOptionId}
          aria-label={
            __t("modals.globalSearch.placeholder") ||
            "Search parts, BOMs, vendors, POs, documents, actions"
          }
          autoComplete="off"
          autoFocus
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setIdx(0);
          }}
          placeholder={
            __t("modals.globalSearch.placeholder") ||
            "Search parts, BOMs, vendors, POs, documents, actions…"
          }
          className="flex-1"
          style={{
            border: "none",
            background: "transparent",
            padding: 0,
            height: 22,
          }}
        />
        <span className="kbd font-mono fs-10" aria-hidden="true">
          ESC
        </span>
      </div>

      <div
        className="oy-auto"
        style={{ maxHeight: 420, margin: "0 -16px", padding: "0 16px" }}
      >
        {results === null ? (
          <div className="fg-3">
            <div className="font-mono fs-10 uppercase letter-sp-6 mb-10">
              {__t("modals.globalSearch.quickAccess") || "QUICK ACCESS"}
            </div>
            {quickAccess.map((r) => (
              <button
                key={r.route}
                type="button"
                className="popover-item"
                style={{ padding: "10px 14px" }}
                onClick={() => {
                  onClose();
                  window.__nav?.(r.route);
                }}
              >
                <span className="ic" aria-hidden="true">
                  {r.icon}
                </span>
                <div className="flex-1 text-left">
                  <div>{r.title}</div>
                  <div className="font-mono fs-10 fg-3">{r.sub}</div>
                </div>
                <span className="kbd" aria-hidden="true">
                  ↵
                </span>
              </button>
            ))}
          </div>
        ) : results.length === 0 ? (
          <div
            className="text-center fg-3"
            role="status"
            style={{ padding: 40 }}
          >
            <div className="font-mono fs-24 mb-6 fg-4" aria-hidden="true">
              ∅
            </div>
            <div className="fs-12">
              {__t("modals.globalSearch.noMatches") || "No matches for"} "{q}"
            </div>
          </div>
        ) : (
          <div
            id={listboxId}
            role="listbox"
            aria-label={
              __t("modals.globalSearch.results") || "Search results"
            }
          >
            {results.map((r, i) => (
              <div
                key={r.kind + ":" + r.title + ":" + i}
                id={`global-search-opt-${i}`}
                role="option"
                aria-selected={i === idx}
                tabIndex={-1}
                className="popover-item"
                style={{
                  padding: "10px 14px",
                  background: i === idx ? "var(--bg-sunk)" : undefined,
                }}
                onMouseEnter={() => setIdx(i)}
                onClick={() => choose(r)}
              >
                <span className="ic" aria-hidden="true">
                  {r.icon}
                </span>
                <div className="flex-1 text-left min-w-0">
                  <div
                    className="ws-nowrap overflow-h"
                    style={{ textOverflow: "ellipsis" }}
                  >
                    {r.title}
                  </div>
                  <div
                    className="font-mono fs-10 fg-3 ws-nowrap overflow-h"
                    style={{ textOverflow: "ellipsis" }}
                  >
                    {r.subtitle}
                  </div>
                </div>
                <span
                  className="font-mono fs-9 fg-4 uppercase letter-sp-6"
                  aria-hidden="true"
                >
                  {r.kind}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

GlobalSearchModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
};
