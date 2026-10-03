import PropTypes from "prop-types";
import { navigateTo } from "../../services/navigation.js";

import { __t } from "../../i18n";
import { Icon } from "../../globals";
import { api } from "../../../api.js";
import { Modal, Input } from "../ui";

// ============ GLOBAL SEARCH (⌘K) ============
// Server-backed: GET /api/v1/search/ (PostgreSQL full-text, tenant-scoped,
// nine entity types). It used to filter BOM_DATA in memory, which could only
// ever find rows already loaded in the current BOM view.

const MIN_LEN = 2;
const DEBOUNCE_MS = 250;

// entity_type from the backend -> route + how to label/ico the group.
// Routes verified against App.jsx / NavRail.jsx.
const ENTITIES = {
  parts: { route: "parts", label: "Parts", Ico: Icon.Parts },
  boms: { route: "bom", label: "BOMs", Ico: Icon.Bom },
  vendors: { route: "vendors", label: "Vendors", Ico: Icon.Vendor },
  pos: { route: "procurement", label: "Purchase orders", Ico: Icon.Cart },
  inventory: { route: "inventory", label: "Inventory", Ico: Icon.Package },
  eco: { route: "ecr", label: "ECOs", Ico: Icon.Diff },
  work_orders: { route: "work-orders", label: "Work orders", Ico: Icon.Settings },
  ncr: { route: "ncr", label: "NCRs", Ico: Icon.Alert },
  documents: { route: "docs", label: "Documents", Ico: Icon.Doc },
};
const GROUP_ORDER = Object.keys(ENTITIES);

// Responses may be {results:[…]}, {items:[…]}, {data:[…]} or a bare array.
function asRows(res) {
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.results)) return res.results;
  if (Array.isArray(res?.items)) return res.items;
  if (Array.isArray(res?.data)) return res.data;
  return [];
}

// Local navigation shortcuts. These are commands, not data — no server needed.
function quickActions(ql) {
  const out = [];
  const add = (words, item) => {
    if (words.includes(ql)) out.push({ ...item, kind: "action" });
  };
  add("new po new purchase order order procurement", {
    action: "new-po",
    title: __t("modals.globalSearch.createNewPo") || "Create new PO",
    subtitle: __t("modals.globalSearch.quickAction") || "Quick action",
    icon: <Icon.Plus size={13} />,
  });
  add("compare diff revision", {
    route: "diff",
    title: __t("modals.globalSearch.compareRevisions") || "Compare revisions",
    subtitle: __t("modals.globalSearch.openDiffView") || "Open diff view",
    icon: <Icon.Diff size={13} />,
  });
  add("analytics dashboard kpi", {
    route: "analytics",
    title:
      __t("modals.globalSearch.analyticsDashboard") || "Analytics dashboard",
    subtitle: __t("modals.globalSearch.openAnalytics") || "Open analytics",
    icon: <Icon.Chart size={13} />,
  });
  add("approve approval ecr eco change", {
    route: "approvals",
    title: __t("modals.globalSearch.pendingApprovals") || "Pending approvals",
    subtitle: __t("modals.globalSearch.reviewEcr") || "Review ECRs and ECOs",
    icon: <Icon.Check size={13} />,
  });
  add("compliance rohs reach conflict", {
    route: "compliance",
    title:
      __t("modals.globalSearch.complianceDashboard") || "Compliance dashboard",
    subtitle:
      __t("modals.globalSearch.checkCompliance") ||
      "RoHS / REACH / Conflict minerals",
    icon: <Icon.Shield size={13} />,
  });
  add("work order wo manufacturing", {
    route: "work-orders",
    title: __t("modals.globalSearch.workOrders") || "Work orders",
    subtitle:
      __t("modals.globalSearch.manageWo") || "Manage manufacturing work orders",
    icon: <Icon.Settings size={13} />,
  });
  add("ncr nonconformance quality", {
    route: "ncr",
    title: __t("modals.globalSearch.ncrReports") || "NCR reports",
    subtitle:
      __t("modals.globalSearch.qualityIssues") ||
      "Quality non-conformance reports",
    icon: <Icon.Alert size={13} />,
  });
  add("calendar schedule milestone", {
    route: "calendar",
    title: __t("modals.globalSearch.calendar") || "Project calendar",
    subtitle:
      __t("modals.globalSearch.viewSchedule") || "View milestones and schedule",
    icon: <Icon.Calendar size={13} />,
  });
  return out;
}

export default function GlobalSearchModal({ open, onClose }) {
  const [q, setQ] = React.useState("");
  const [idx, setIdx] = React.useState(0);
  const [hits, setHits] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const inputRef = React.useRef(null);
  // Monotonic request id: every keystroke bumps it, so a slow earlier response
  // can never overwrite a newer one (out-of-order results are a real bug in
  // debounced search, not a nicety).
  const reqRef = React.useRef(0);

  React.useEffect(() => {
    if (!open) return undefined;
    setQ("");
    setIdx(0);
    setHits(null);
    setError(null);
    setLoading(false);
    // Modal's own initial-focus effect runs first and lands on its close
    // button (first focusable in the header); defer so the search field
    // wins focus once the dialog has finished mounting.
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  // Debounced server search.
  React.useEffect(() => {
    if (!open) return undefined;
    const term = q.trim();
    const id = ++reqRef.current;
    if (term.length < MIN_LEN) {
      setHits(null);
      setError(null);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    const t = setTimeout(() => {
      api.search
        .query(term, { limit: 40 })
        .then((res) => {
          if (id !== reqRef.current) return;
          setHits(asRows(res));
          setError(null);
          setLoading(false);
        })
        .catch((e) => {
          if (id !== reqRef.current) return;
          setHits(null);
          setError(e?.message || "Search failed");
          setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q, open]);

  // Group server hits by entity type, then append local quick actions.
  // `flat` is the render order, so the keyboard index maps 1:1 to what is seen.
  const { groups, flat } = React.useMemo(() => {
    const term = q.trim();
    if (term.length < MIN_LEN) return { groups: [], flat: [] };

    const byType = new Map();
    (hits || []).forEach((h) => {
      const type = h.entity_type || "parts";
      if (!byType.has(type)) byType.set(type, []);
      byType.get(type).push(h);
    });

    const gs = [];
    const known = GROUP_ORDER.filter((t) => byType.has(t));
    const unknown = [...byType.keys()].filter((t) => !ENTITIES[t]);
    [...known, ...unknown].forEach((type) => {
      const meta = ENTITIES[type];
      const Ico = meta?.Ico || Icon.Search;
      gs.push({
        key: type,
        label: meta?.label || type,
        items: byType.get(type).map((h) => ({
          kind: type,
          route: meta?.route,
          title: h.title || String(h.entity_id ?? ""),
          subtitle: h.subtitle || "",
          icon: <Ico size={13} />,
        })),
      });
    });

    const actions = quickActions(term.toLowerCase());
    if (actions.length) {
      gs.push({
        key: "action",
        label: __t("modals.globalSearch.actions") || "Actions",
        items: actions,
      });
    }

    return { groups: gs, flat: gs.flatMap((g) => g.items) };
  }, [hits, q]);

  const choose = (r) => {
    if (!r) return;
    onClose();
    if (r.action === "new-po") {
      navigateTo("procurement");
      setTimeout(
        () =>
          window.dispatchEvent(
            new CustomEvent("open-modal", { detail: "new-po" }),
          ),
        50,
      );
      return;
    }
    if (r.route) navigateTo(r.route);
  };

  React.useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (!flat.length) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setIdx((i) => Math.min(flat.length - 1, i + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setIdx((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        choose(flat[idx]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, flat, idx]);

  if (!open) return null;

  const term = q.trim();
  const listboxId = "global-search-listbox";
  const activeOptionId = flat.length ? `global-search-opt-${idx}` : undefined;

  const quickAccess = [
    {
      title: __t("modals.globalSearch.openBomEditor") || "Open BOM Editor",
      sub: __t("modals.globalSearch.atlasMainframe") || "ATLAS / Mainframe Rev C",
      route: "bom",
      icon: <Icon.Bom size={13} />,
    },
    {
      title: __t("modals.globalSearch.componentLibrary") || "Component Library",
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

  // Running index across groups, so highlight + aria ids line up with `flat`.
  let cursor = -1;

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
            {flat.length} {__t("modals.globalSearch.result") || "result"}
            {flat.length === 1 ? "" : "s"}
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
          aria-expanded={term.length >= MIN_LEN}
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
        {loading ? (
          <span className="font-mono fs-10 fg-3" role="status">
            {__t("common.searching") || "Searching…"}
          </span>
        ) : null}
        <span className="kbd font-mono fs-10" aria-hidden="true">
          ESC
        </span>
      </div>

      <div
        className="oy-auto"
        style={{ maxHeight: 420, margin: "0 -16px", padding: "0 16px" }}
      >
        {error ? (
          <div className="text-center" role="alert" style={{ padding: 40 }}>
            <div
              className="font-mono fs-24 mb-6"
              style={{ color: "var(--danger, #d33)" }}
              aria-hidden="true"
            >
              !
            </div>
            <div className="fs-12">
              {__t("modals.globalSearch.failed") || "Search failed"}
            </div>
            <div className="font-mono fs-10 fg-3 mt-6">{error}</div>
          </div>
        ) : term.length < MIN_LEN ? (
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
                  navigateTo(r.route);
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
        ) : loading && hits === null ? (
          <div
            className="text-center fg-3"
            role="status"
            style={{ padding: 40 }}
          >
            <div className="fs-12">
              {__t("common.searching") || "Searching…"}
            </div>
          </div>
        ) : flat.length === 0 ? (
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
            aria-label={__t("modals.globalSearch.results") || "Search results"}
          >
            {groups.map((g) => (
              <div key={g.key} role="group" aria-label={g.label}>
                <div
                  className="font-mono fs-10 uppercase letter-sp-6 fg-3"
                  style={{ padding: "10px 14px 4px" }}
                >
                  {g.label} ({g.items.length})
                </div>
                {g.items.map((r) => {
                  cursor += 1;
                  const i = cursor;
                  return (
                    <div
                      key={g.key + ":" + i}
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
                  );
                })}
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
