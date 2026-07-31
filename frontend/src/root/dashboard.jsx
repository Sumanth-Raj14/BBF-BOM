import PropTypes from "prop-types";
import { __t } from "../i18n";
import { toast } from "../utils/toast";
import { api } from "../globals";
import {
  Button,
  Card,
  Badge,
  StatusPill,
  Menu,
  Field,
  Input,
  ScreenHeader,
  EmptyState,
  Spinner,
} from "../components/ui";
// Live workspace budget snapshot, hydrated from GET /budgets/workspace on
// mount (see DashboardScreen below) and kept in sync after saves. Starts
// zeroed — never fabricated — so CostTrendTile, which reads
// WORKSPACE_BUDGET.monthly directly, has a safe, honest value before the
// first fetch resolves.
export const WORKSPACE_BUDGET = {
  annual: 0,
  spent: 0,
  committed: 0,
  byProject: {},
  monthly: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};
function DashboardScreen() {
  const ctx = useAppStore();
  const role = ctx?.userRole || "Admin";
  const [period, setPeriod] = React.useState("FY 2026");
  const [editingBudget, setEditingBudget] = React.useState(false);
  const [budgetEdits, setBudgetEdits] = React.useState(null);
  // null = still loading the first fetch; once resolved this holds the real
  // { annual, spent, committed, byProject, monthly } snapshot from the API.
  const [budgetData, setBudgetData] = React.useState(null);
  // Period-selector labels + the slug sent to the backend, which resolves it
  // to a real calendar date range (see backend/app/api/endpoints/budgets.py).
  // No fabricated scaling ratios — the backend computes real spent/committed
  // for the selected range from purchase-order data.
  const PERIODS = {
    "FY 2026": { slug: "fy", label: "FY 2026" },
    "Q3 2026": { slug: "q3", label: "Q3 2026 (Jul–Sep)" },
    "Q2 2026": { slug: "q2", label: "Q2 2026 (Apr–Jun)" },
    "Q1 2026": { slug: "q1", label: "Q1 2026 (Jan–Mar)" },
    "Last 30d": { slug: "last30", label: "Last 30 days" },
    "Last 7d": { slug: "last7", label: "Last 7 days" },
  };
  const scale = PERIODS[period] || PERIODS["FY 2026"];
  React.useEffect(() => {
    let cancelled = false;
    Promise.resolve(api?.budgets?.workspace?.(scale.slug))
      .then((data) => {
        if (cancelled || !data) return;
        // Keep the shared WORKSPACE_BUDGET object in sync for CostTrendTile,
        // which reads it directly.
        WORKSPACE_BUDGET.annual = Number(data.annual) || 0;
        WORKSPACE_BUDGET.spent = Number(data.spent) || 0;
        WORKSPACE_BUDGET.committed = Number(data.committed) || 0;
        WORKSPACE_BUDGET.byProject = data.byProject || {};
        if (Array.isArray(data.monthly) && data.monthly.length === 12) {
          WORKSPACE_BUDGET.monthly = data.monthly;
        }
        setBudgetData(data);
      })
      .catch(() => {
        // Honest failure — do not fall back to fabricated/sample figures.
        if (!cancelled) setBudgetData((prev) => prev || { ...WORKSPACE_BUDGET });
      });
    return () => {
      cancelled = true;
    };
  }, [scale.slug]);
  const startBudgetEdit = () => {
    setBudgetEdits({
      annual: WORKSPACE_BUDGET.annual,
      byProject: Object.fromEntries(
        Object.entries(WORKSPACE_BUDGET.byProject).map(([k, v]) => [
          k,
          { ...v },
        ]),
      ),
    });
    setEditingBudget(true);
  };
  const saveBudget = () => {
    if (!budgetEdits) return;
    const payload = {
      annual: budgetEdits.annual,
      byProject: Object.fromEntries(
        Object.entries(budgetEdits.byProject).map(([k, v]) => [k, v.budget]),
      ),
    };
    Promise.resolve(api?.budgets?.updateWorkspace?.(payload, scale.slug))
      .then((data) => {
        if (!data) throw new Error("empty response");
        WORKSPACE_BUDGET.annual = Number(data.annual) || 0;
        WORKSPACE_BUDGET.spent = Number(data.spent) || 0;
        WORKSPACE_BUDGET.committed = Number(data.committed) || 0;
        WORKSPACE_BUDGET.byProject = data.byProject || {};
        if (Array.isArray(data.monthly) && data.monthly.length === 12) {
          WORKSPACE_BUDGET.monthly = data.monthly;
        }
        setBudgetData(data);
        setEditingBudget(false);
        toast(__t("dashboard.budgetUpdated") || "Workspace budget updated", {
          kind: "success",
        });
      })
      .catch(() => {
        toast(
          __t("dashboard.budgetSaveError") || "Failed to save workspace budget",
          { kind: "danger" },
        );
      });
  };
  const wb = budgetData || WORKSPACE_BUDGET;
  const pctSpent = wb.annual > 0 ? (wb.spent / wb.annual) * 100 : 0;
  const pctCommitted =
    wb.annual > 0 ? ((wb.spent + wb.committed) / wb.annual) * 100 : 0;
  const remaining = wb.annual - wb.spent - wb.committed;
  const overBudget = pctCommitted > 100;
  // Role-specific tile set. Each role sees the widgets relevant to its job:
  // Admin → users/tenant/system health/audit; Engineering → parts/BOM/ECO/
  // where-used; Procurement → POs/vendors/RFQs/receiving; Finance → cost
  // rollups/spend/should-cost; Viewer → read-only overview.
  const tilesByRole = {
    Admin: ["budget", "users", "system-health", "audit", "approvals", "activity"],
    Engineering: ["budget", "my-boms", "eco", "where-used", "at-risk", "activity"],
    Procurement: ["budget", "in-flight", "vendors", "receiving", "at-risk", "approvals"],
    Finance: ["budget", "cost-rollup", "spend-mix", "cost-trend", "should-cost", "approvals"],
    Viewer: ["budget", "activity", "spend-mix"],
  };
  const tiles = tilesByRole[role] || tilesByRole.Admin;
  // Viewer is a strictly read-only overview — no workspace-level edit affordances.
  const canEditWorkspace = role !== "Viewer";
  return (
    <div className="screen-wrap" data-screen-label="Dashboard">
      <ScreenHeader
        title={__t("nav.dashboard") || "Dashboard"}
        description={
          role +
          " " +
          (__t("dashboard.view") || "view") +
          " · FY 2026 · " +
          (__t("dashboard.updatedJustNow") || "Updated just now")
        }
        actions={
          <>
            <Menu
              ariaLabel={__t("dashboard.selectPeriod") || "Select period"}
              trigger={
                <Button variant="secondary" size="sm">
                  {period} <Icon.ChevronDown size={10} />
                </Button>
              }
              items={Object.keys(PERIODS).map((k) => ({
                icon:
                  period === k ? (
                    <Icon.Check size={11} />
                  ) : (
                    <span className="w-11" />
                  ),
                label: PERIODS[k].label,
                onSelect: () => setPeriod(k),
              }))}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => window.__nav?.("analytics")}
            >
              <Icon.Chart size={11} />{" "}
              {__t("dashboard.deepAnalytics") || "Deep analytics"}
            </Button>
          </>
        }
      />
      {/* Workspace Budget — always at top, shared across all projects */}
      <Card className="mb-14">
        <div className="flex justify-between items-start mb-14">
          <div className="flex-1">
            <div className="flex items-center gap-8 mb-4">
              <span className="font-mono fs-10 uppercase letter-sp-8 fg-3">
                {__t("dashboard.workspaceBudget") || "Workspace Budget"} ·{" "}
                {scale.label}
              </span>
              {!editingBudget && canEditWorkspace && (
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  onClick={startBudgetEdit}
                  title={__t("dashboard.editBudget") || "Edit budget"}
                  aria-label={__t("dashboard.editBudget") || "Edit budget"}
                >
                  <Icon.Edit size={10} />
                </Button>
              )}
            </div>
            {editingBudget ? (
              <div
                className="flex items-center gap-10"
                style={{ flexWrap: "wrap" }}
              >
                <Field
                  htmlFor="budget-annual"
                  label={__t("dashboard.annualBudget") || "Annual budget (USD)"}
                >
                  <Input
                    id="budget-annual"
                    name="annualBudget"
                    type="number"
                    mono
                    className="w-160 h-28 fs-12"
                    value={budgetEdits.annual}
                    onChange={(e) =>
                      setBudgetEdits({
                        ...budgetEdits,
                        annual: Number(e.target.value) || 0,
                      })
                    }
                  />
                </Field>
                {Object.entries(budgetEdits.byProject).map(([k, v]) => (
                  <Field key={k} htmlFor={"budget-" + k} label={k}>
                    <Input
                      id={"budget-" + k}
                      name={"projectBudget_" + k}
                      type="number"
                      mono
                      className="w-120 h-28 fs-11"
                      value={v.budget}
                      onChange={(e) =>
                        setBudgetEdits({
                          ...budgetEdits,
                          byProject: {
                            ...budgetEdits.byProject,
                            [k]: { ...v, budget: Number(e.target.value) || 0 },
                          },
                        })
                      }
                    />
                  </Field>
                ))}
                <div className="flex gap-4 self-end">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setEditingBudget(false)}
                  >
                    {__t("app.cancel") || "Cancel"}
                  </Button>
                  <Button variant="primary" size="sm" onClick={saveBudget}>
                    <Icon.Check size={10} /> {__t("common.save") || "Save"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-baseline gap-12">
                <span
                  className="font-mono fs-16 fw-600"
                  style={{ letterSpacing: "-0.02em" }}
                >
                  {INR(wb.spent, 0)}
                </span>
                <span className="font-mono fs-12 fg-3">
                  of {INR(wb.annual, 0)}
                </span>
                <Badge
                  tone={
                    overBudget
                      ? "danger"
                      : pctCommitted > 80
                        ? "warning"
                        : "success"
                  }
                  pill
                >
                  {pctCommitted.toFixed(1)}% allocated
                </Badge>
              </div>
            )}
          </div>
          {!editingBudget && (
            <div className="text-right flex-shrink-0">
              <div className="font-mono fs-10 fg-3 uppercase letter-sp-6">
                {__t("dashboard.remaining") || "Remaining"}
              </div>
              <div
                className="font-mono fs-22 fw-700"
                style={{
                  color:
                    remaining < 0 ? "var(--danger-text)" : "var(--ok-text)",
                }}
              >
                {INR(remaining, 0)}
              </div>
              <div className="font-mono fs-10 fg-3">
                {(wb.annual > 0 ? (remaining / wb.annual) * 100 : 0).toFixed(1)}%{" "}
                {__t("dashboard.headroom") || "headroom"}
              </div>
            </div>
          )}
        </div>
        {/* Stacked progress bar: spent vs committed vs remaining */}
        <div className="h-16 bg-sunk br-4 overflow-h flex mb-8">
          <div
            className="bg-accent flex items-center pl-8 font-mono fs-10 fw-700"
            style={{ width: pctSpent + "%", color: "var(--accent-fg)" }}
          >
            {pctSpent > 8
              ? (__t("dashboard.spentLabel") || "SPENT") +
                " " +
                pctSpent.toFixed(0) +
                "%"
              : ""}
          </div>
          <div
            className="flex items-center pl-6 fg font-mono fs-10 fw-600"
            style={{
              width: (wb.annual > 0 ? (wb.committed / wb.annual) * 100 : 0) + "%",
              background:
                "color-mix(in oklch, var(--accent) 50%, var(--bg-sunk))",
            }}
          >
            {wb.annual > 0 && (wb.committed / wb.annual) * 100 > 5
              ? __t("dashboard.committedLabel") || "COMMITTED"
              : ""}
          </div>
        </div>
        <div className="flex font-mono fs-11 fg-3" style={{ gap: 18 }}>
          <span className="flex-inline-c br-2 bg-accent">
            <span style={{ width: 10, height: 10 }} />{" "}
            {__t("dashboard.spent") || "Spent"} {INR(wb.spent, 0)}
          </span>
          <span className="flex-inline-c br-2">
            <span
              style={{
                width: 10,
                height: 10,
                background:
                  "color-mix(in oklch, var(--accent) 50%, var(--bg-sunk))",
              }}
            />{" "}
            {__t("dashboard.committed") || "Committed"} {INR(wb.committed, 0)}
          </span>
          <span className="flex-inline-c br-2 bg-sunk border-line">
            <span style={{ width: 10, height: 10 }} />{" "}
            {__t("dashboard.available") || "Available"} {INR(remaining, 0)}
          </span>
        </div>
        {/* Per-project breakdown */}
        <div className="pt-14 border-top" style={{ marginTop: 18 }}>
          <div className="font-mono fs-10 uppercase letter-sp-6 fg-3 mb-10">
            {__t("dashboard.byProject") || "By project"}
          </div>
          {Object.keys(wb.byProject).length === 0 ? (
            <div className="fs-11 fg-3" style={{ padding: "6px 0" }}>
              {__t("dashboard.noProjectBudgets") ||
                "No project budgets configured yet."}
            </div>
          ) : (
          <div
            className="d-grid gap-10"
            style={{ gridTemplateColumns: "repeat(4, 1fr)" }}
          >
            {Object.entries(wb.byProject).map(([k, p]) => {
              const used =
                p.budget > 0 ? ((p.spent + p.committed) / p.budget) * 100 : 0;
              const cFill =
                used > 100
                  ? "var(--danger)"
                  : used > 80
                    ? "var(--warn)"
                    : "var(--ok)";
              const cText =
                used > 100
                  ? "var(--danger-text)"
                  : used > 80
                    ? "var(--warn-text)"
                    : "var(--ok-text)";
              return (
                <div
                  key={k}
                  role="button"
                  tabIndex={0}
                  aria-label={
                    (__t("dashboard.openProject") || "Open project") + " " + k
                  }
                  onClick={() => {
                    ctx?.switchProject?.(k);
                    window.__nav?.("bom");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      ctx?.switchProject?.(k);
                      window.__nav?.("bom");
                    }
                  }}
                  className="bg-elev border-line rounded-r2 c-pointer"
                  style={{ padding: 10, transition: "border-color 0.1s" }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.borderColor = "var(--accent)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.borderColor = "var(--line)")
                  }
                  onFocus={(e) =>
                    (e.currentTarget.style.borderColor = "var(--accent)")
                  }
                  onBlur={(e) =>
                    (e.currentTarget.style.borderColor = "var(--line)")
                  }
                >
                  <div className="flex justify-between items-baseline mb-4">
                    <span className="font-mono fs-11 fw-700">{k}</span>
                    <span
                      className="font-mono fs-10 fw-600"
                      style={{ color: cText }}
                    >
                      {used.toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-4 bg-sunk br-2 overflow-h mb-4">
                    <div
                      className="h-100p"
                      style={{
                        width: Math.min(100, used) + "%",
                        backgroundColor: cFill,
                      }}
                    />
                  </div>
                  <div className="font-mono fs-10 fg-3">
                    {INR(p.spent, 0)} / {INR(p.budget, 0)}
                  </div>
                </div>
              );
            })}
          </div>
          )}
        </div>
      </Card>
      {/* Role-specific tile grid */}
      <div
        className="d-grid gap-12"
        style={{ gridTemplateColumns: "repeat(3, 1fr)" }}
      >
        {tiles.includes("at-risk") && <RiskTile />}
        {tiles.includes("approvals") && <ApprovalsTile role={role} />}
        {tiles.includes("in-flight") && <InFlightTile />}
        {tiles.includes("my-boms") && <MyBOMsTile />}
        {tiles.includes("vendors") && <VendorsTile />}
        {tiles.includes("spend-mix") && <SpendMixTile />}
        {tiles.includes("cost-trend") && <CostTrendTile />}
        {tiles.includes("activity") && <ActivityTile />}
        {tiles.includes("users") && <UsersTile />}
        {tiles.includes("system-health") && <SystemHealthTile ctx={ctx} />}
        {tiles.includes("audit") && <AuditTile />}
        {tiles.includes("eco") && <ECOTile />}
        {tiles.includes("where-used") && <WhereUsedTile />}
        {tiles.includes("receiving") && <ReceivingTile />}
        {tiles.includes("cost-rollup") && <CostRollupTile />}
        {tiles.includes("should-cost") && <ShouldCostTile />}
      </div>
    </div>
  );
}
function Tile({ title, action, onAction, children }) {
  return (
    <Card
      title={title}
      actions={
        action ? (
          <Button variant="ghost" size="sm" onClick={onAction}>
            {action}
          </Button>
        ) : null
      }
    >
      {children}
    </Card>
  );
}
Tile.propTypes = {
  title: PropTypes.string,
  action: PropTypes.string,
  onAction: PropTypes.func,
  children: PropTypes.node,
};
function RiskTile() {
  // Real supply-risk rollup — GET /analytics/at-risk-parts, derived server-side
  // from part_vendors (lead time, single-source, quality/on-time) + parts.
  const [items, setItems] = React.useState(null); // null = loading
  const [loadError, setLoadError] = React.useState(false);
  React.useEffect(() => {
    let cancelled = false;
    api.analytics
      .atRiskParts(5)
      .then((res) => {
        if (cancelled) return;
        setItems(Array.isArray(res?.items) ? res.items : []);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError(true);
        setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <Tile
      title={__t("dashboard.supplyRisk") || "Supply Risk"}
      action={__t("dashboard.viewAll") || "View all"}
      onAction={() => window.__nav?.("bom")}
    >
      {items === null ? (
        <div className="fs-11 fg-3" style={{ padding: "6px 0" }}>
          {__t("common.loading") || "Loading…"}
        </div>
      ) : items.length === 0 ? (
        <div className="fs-11 fg-3" style={{ padding: "6px 0" }}>
          {loadError
            ? __t("dashboard.riskLoadError") ||
              "Unable to load supply risk data"
            : __t("dashboard.noRisk") || "No at-risk parts detected"}
        </div>
      ) : (
        items.map((it) => (
          <div
            key={it.partId ?? it.pn}
            className="flex justify-between items-center gap-8"
            style={{
              padding: "6px 0",
              borderBottom: "1px solid var(--line-soft)",
            }}
          >
            <div>
              <div className="font-mono fs-11 fw-600">{it.pn}</div>
              <div className="fs-10 fg-3">{it.reason}</div>
            </div>
            <Badge tone={it.severity === "high" ? "danger" : "warning"}>
              {(it.severity || "").toUpperCase()}
            </Badge>
          </div>
        ))
      )}
    </Tile>
  );
}
// Approval `type` values come from the backend's ApprovalType enum
// (ecr/eco/ncr/capa/document/purchase). There is no explicit department
// field, so pending approvals are bucketed into the three inbox rows using
// the closest real-world owner of each type: engineering change/quality
// control types → Engineering, purchase approvals → Procurement, and
// document sign-offs → Finance.
const APPROVAL_TYPE_DEPARTMENT = {
  ecr: "engineering",
  eco: "engineering",
  ncr: "engineering",
  capa: "engineering",
  purchase: "procurement",
  document: "finance",
};
function ApprovalsTile({ role }) {
  // null = loading, [] = loaded-empty/error
  const [items, setItems] = React.useState(null);
  React.useEffect(() => {
    let cancelled = false;
    api.approvals
      .list({ status: "pending", per_page: 500 })
      .then((result) => {
        if (cancelled) return;
        const rows = Array.isArray(result) ? result : result?.items || [];
        setItems(rows);
      })
      .catch(() => {
        if (cancelled) return;
        // Honest failure — do not fall back to fabricated/sample counts.
        setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const loading = items === null;
  const counts = { engineering: 0, procurement: 0, finance: 0 };
  (items || []).forEach((a) => {
    const dept = APPROVAL_TYPE_DEPARTMENT[String(a.type || "").toLowerCase()];
    if (dept) counts[dept] += 1;
  });
  const my =
    role === "Engineering"
      ? counts.engineering
      : role === "Procurement"
        ? counts.procurement
        : role === "Finance"
          ? counts.finance
          : counts.engineering + counts.procurement + counts.finance;
  return (
    <Tile
      title={__t("dashboard.approvalsInbox") || "Approvals Inbox"}
      action={__t("dashboard.open") || "Open"}
      onAction={() => window.__nav?.("approvals")}
    >
      {loading ? (
        <div className="flex items-center gap-8" style={{ padding: "6px 0" }}>
          <Spinner size="sm" />
          <span className="fs-11 fg-3">
            {__t("common.loading") || "Loading…"}
          </span>
        </div>
      ) : (
        <>
          <div className="flex items-baseline gap-8 mb-10">
            <span
              className="font-mono fs-28 fw-700"
              style={{ color: my > 0 ? "var(--accent-text)" : "var(--fg)" }}
            >
              {my}
            </span>
            <span className="font-mono fs-11 fg-3">
              {__t("dashboard.awaiting") || "awaiting"}{" "}
              {role === "Admin"
                ? __t("dashboard.team") || "team"
                : __t("dashboard.you") || "you"}
            </span>
          </div>
          {["Engineering", "Procurement", "Finance"].map((r) => (
            <div key={r} className="vendor-row fg-2">
              <span>{r}</span>
              <span
                style={{
                  color: counts[r.toLowerCase()]
                    ? "var(--accent-text)"
                    : "var(--fg-4)",
                }}
              >
                {counts[r.toLowerCase()]}
              </span>
            </div>
          ))}
        </>
      )}
    </Tile>
  );
}
ApprovalsTile.propTypes = {
  role: PropTypes.any,
};
function InFlightTile() {
  // null = loading; [] resolved (possibly null/error) once both calls settle
  const [poStats, setPoStats] = React.useState(null);
  const [trackingStats, setTrackingStats] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.poOrders.stats().catch(() => null),
      api.orderTracking.stats().catch(() => null),
    ]).then(([po, tracking]) => {
      if (cancelled) return;
      // Honest failure — do not fall back to fabricated/sample counts.
      setPoStats(po || null);
      setTrackingStats(tracking || null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const byStatus = poStats?.byStatus || {};
  const rfqCount = byStatus["RFQ Sent"]?.count || 0;
  const poCount = byStatus["Ordered"]?.count || 0;
  const transitCount = trackingStats?.byStage?.in_transit || 0;
  const totalInFlight = poStats?.totalValue || 0;
  const cells = [
    [__t("dashboard.rfq") || "RFQ", rfqCount],
    [__t("dashboard.po") || "PO", poCount],
    [__t("dashboard.transit") || "Transit", transitCount],
  ];
  return (
    <Tile
      title={__t("dashboard.inFlight") || "In Flight"}
      action={__t("nav.procurement") || "Procurement"}
      onAction={() => window.__nav?.("procurement")}
    >
      <div
        className="d-grid gap-8 mb-8"
        style={{ gridTemplateColumns: "repeat(3, 1fr)" }}
      >
        {cells.map(([l, v]) => (
          <div
            key={l}
            className="bg-sunk rounded-r2 text-center"
            style={{ padding: 8 }}
          >
            <div className="font-mono fs-18 fw-700">
              {loading ? <Spinner size="sm" /> : v}
            </div>
            <div className="font-mono fs-9 fg-3 uppercase letter-sp-6">{l}</div>
          </div>
        ))}
      </div>
      <div
        className="font-mono fs-11 fg-3 pt-6"
        style={{ borderTop: "1px solid var(--line-soft)" }}
      >
        {__t("dashboard.totalInFlight") || "Total in flight"}:{" "}
        <strong className="fg">
          {loading ? "—" : INR(totalInFlight, 0)}
        </strong>
      </div>
    </Tile>
  );
}
// Relative-time label for a revision timestamp ("18m", "3h", "6d", or the
// localized "just now" for anything under a minute old).
function myBomsTimeAgo(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const ms = Date.now() - d.getTime();
  if (Number.isNaN(ms)) return null;
  const min = Math.floor(ms / 60000);
  if (min < 1) return __t("dashboard.justNow") || "just now";
  if (min < 60) return min + "m";
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr + "h";
  return Math.floor(hr / 24) + "d";
}
function capitalize(s) {
  return s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : s;
}
function MyBOMsTile() {
  // Recently updated BOMs/parts revisions authored by the current user —
  // GET /revisions?mine=true&sort_by=createdAt&sort_dir=desc. Revisions
  // carry no workflow-status field, so the entity type stands in for the
  // status pill rather than fabricating a Draft/Review value.
  // null = loading, [] = loaded-but-empty/error
  const [items, setItems] = React.useState(null);
  const [error, setError] = React.useState(null);
  React.useEffect(() => {
    let cancelled = false;
    Promise.resolve(
      api?.revisions?.list?.({
        mine: true,
        sort_by: "createdAt",
        sort_dir: "desc",
        per_page: 5,
      }),
    )
      .then((res) => {
        if (cancelled) return;
        const rows = Array.isArray(res) ? res : res?.items || [];
        setItems(rows);
      })
      .catch((e) => {
        if (cancelled) return;
        // Honest failure — do not fall back to fabricated/sample rows.
        setError(
          e?.message || __t("dashboard.bomsLoadError") || "Failed to load BOMs",
        );
        setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const justNowLabel = __t("dashboard.justNow") || "just now";
  return (
    <Tile
      title={__t("dashboard.myBoms") || "My BOMs"}
      action={__t("dashboard.openEditor") || "Open editor"}
      onAction={() => window.__nav?.("bom")}
    >
      {items === null ? (
        <div className="flex items-center gap-8" style={{ padding: "6px 0" }}>
          <Spinner size="sm" />
          <span className="fs-11 fg-3">
            {__t("common.loading") || "Loading…"}
          </span>
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          message={error || __t("dashboard.noBoms") || "No recent BOMs yet"}
        />
      ) : (
        items.map((r) => {
          const name =
            r.revisionLabel ||
            r.description ||
            `${capitalize(r.entityType) || "Item"} #${r.entityId}`;
          const ago = myBomsTimeAgo(r.updatedAt || r.createdAt);
          return (
            <div
              key={r.id}
              className="d-grid gap-8 items-center"
              style={{
                gridTemplateColumns: "1fr auto",
                padding: "6px 0",
                borderBottom: "1px solid var(--line-soft)",
              }}
            >
              <div>
                <div className="fs-12 fw-500">{name}</div>
                <div className="font-mono fs-10 fg-3">
                  {ago
                    ? ago === justNowLabel
                      ? ago
                      : `${__t("dashboard.updated") || "Updated"} ${ago} ${
                          __t("dashboard.ago") || "ago"
                        }`
                    : "—"}
                </div>
              </div>
              <StatusPill status={capitalize(r.entityType) || "Item"} />
            </div>
          );
        })
      )}
    </Tile>
  );
}
function VendorsTile() {
  // vendors === null -> still loading; [] -> loaded but empty (or fetch failed).
  const [vendors, setVendors] = React.useState(null);
  React.useEffect(() => {
    let cancelled = false;
    Promise.resolve(api?.vendors?.list?.({ per_page: 500 }))
      .then((res) => {
        if (cancelled) return;
        const items = Array.isArray(res)
          ? res
          : Array.isArray(res?.items)
            ? res.items
            : [];
        setVendors(items);
      })
      .catch(() => {
        if (!cancelled) setVendors([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const list = vendors || [];
  // Vendor rows don't carry explicit preferred/risk flags today — approximate
  // from reliabilityRating (0-5 scale) so the tile still reflects real data.
  const activeCount = list.filter((v) => v.active !== false).length;
  const preferredCount = list.filter(
    (v) => v.preferred === true || (v.reliabilityRating ?? 0) >= 4,
  ).length;
  const highRiskCount = list.filter(
    (v) =>
      v.risk === "High" ||
      (v.reliabilityRating != null && v.reliabilityRating < 2),
  ).length;
  const topVendor = list.reduce((best, v) => {
    const rating = v.reliabilityRating ?? 0;
    return !best || rating > (best.reliabilityRating ?? 0) ? v : best;
  }, null);

  return (
    <Tile
      title={__t("nav.vendors") || "Vendors"}
      action={__t("dashboard.allVendors") || "All"}
      onAction={() => window.__nav?.("vendors")}
    >
      <div className="vendor-row">
        <span className="fg-3 fw-600">{__t("vendor.active") || "Active"}</span>
        <span>{activeCount}</span>
      </div>
      <div className="vendor-row">
        <span className="fg-3 fw-600 fg-accent">
          {__t("vendor.preferred") || "Preferred"}
        </span>
        <span>{preferredCount}</span>
      </div>
      <div className="vendor-row">
        <span className="fg-3 fw-600 fg-danger">
          {__t("dashboard.highRisk") || "High risk"}
        </span>
        <span>{highRiskCount}</span>
      </div>
      <div
        className="mt-8 pt-8 font-mono fs-10 fg-3"
        style={{ borderTop: "1px solid var(--line-soft)" }}
      >
        {vendors === null
          ? __t("common.loading") || "Loading…"
          : topVendor
            ? (__t("dashboard.topVendorLabel") || "Top") +
              ": " +
              topVendor.name +
              (topVendor.reliabilityRating != null
                ? " · " +
                  Number(topVendor.reliabilityRating).toFixed(1) +
                  "/5 rating"
                : "")
            : __t("dashboard.noVendors") || "No vendors yet"}
      </div>
    </Tile>
  );
}
function SpendMixTile() {
  // rows: null = loading, [] = loaded-but-empty, [...] = real category spend
  const [rows, setRows] = React.useState(null);
  React.useEffect(() => {
    let cancelled = false;
    Promise.resolve(api?.analytics?.categories?.())
      .then((res) => {
        if (!cancelled) setRows(Array.isArray(res) ? res : []);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const colors = {
    Electrical: "oklch(0.55 0.13 240)",
    Optical: "oklch(0.55 0.13 320)",
    Mechanical: "oklch(0.55 0.08 60)",
    Hardware: "oklch(0.55 0.10 145)",
    Cable: "oklch(0.55 0.10 280)",
    Other: "var(--fg-3)",
  };
  const palette = [
    "oklch(0.55 0.13 240)",
    "oklch(0.55 0.13 320)",
    "oklch(0.55 0.08 60)",
    "oklch(0.55 0.10 145)",
    "oklch(0.55 0.10 280)",
    "oklch(0.55 0.10 20)",
  ];
  const totalCost = (rows || []).reduce((s, r) => s + (Number(r.totalCost) || 0), 0);
  const data =
    totalCost > 0
      ? (rows || []).map((r, i) => ({
          key: r.category || "Other",
          pct: (Number(r.totalCost) || 0) / totalCost,
          color: colors[r.category] || palette[i % palette.length],
        }))
      : [];
  return (
    <Tile
      title={__t("dashboard.spendMix") || "Spend Mix"}
      action={__t("nav.analytics") || "Analytics"}
      onAction={() => window.__nav?.("analytics")}
    >
      {rows === null ? (
        <div className="fs-11 fg-3" style={{ padding: "10px 0" }}>
          {__t("common.loading") || "Loading…"}
        </div>
      ) : data.length === 0 ? (
        <div className="fs-11 fg-3" style={{ padding: "10px 0" }}>
          {__t("dashboard.noSpendData") || "No spend data yet"}
        </div>
      ) : (
        <>
          <div className="flex h-14 br-4 overflow-h mb-10">
            {data.map((d) => (
              <div
                key={d.key}
                style={{ width: d.pct * 100 + "%", background: d.color }}
                title={`${d.key}: ${(d.pct * 100).toFixed(0)}%`}
              />
            ))}
          </div>
          {data.map((d) => (
            <div
              key={d.key}
              className="flex justify-between font-mono fs-10"
              style={{ padding: "2px 0" }}
            >
              <span className="flex-inline-c w-8 h-8 br-2">
                <span style={{ background: d.color }} /> {d.key}
              </span>
              <span className="fg-3">{(d.pct * 100).toFixed(0)}%</span>
            </div>
          ))}
        </>
      )}
    </Tile>
  );
}
function CostTrendTile() {
  const data = WORKSPACE_BUDGET.monthly;
  const max = Math.max(...data, 1);
  return (
    <Tile
      title={__t("dashboard.monthlySpend") || "Monthly Spend (₹Cr)"}
      action={__t("nav.analytics") || "Analytics"}
      onAction={() => window.__nav?.("analytics")}
    >
      <div className="flex items-end h-80 gap-4 mb-8">
        {data.map((v, i) => (
          <div
            key={"month-" + i}
            className="flex-1"
            style={{
              height: (v / max) * 100 + "%",
              background:
                i === data.length - 1
                  ? "var(--accent)"
                  : "color-mix(in oklch, var(--accent) 50%, var(--bg-sunk))",
              borderRadius: "2px 2px 0 0",
            }}
            title={`Month ${i + 1}: ₹${v}Cr`}
          />
        ))}
      </div>
      <div className="flex justify-between font-mono fs-10 fg-3">
        <span>Jan</span>
        <span>
          {__t("dashboard.avg") || "Avg"} ₹
          {(data.reduce((s, v) => s + v, 0) / data.length).toFixed(1)}Cr
        </span>
        <span>Dec</span>
      </div>
    </Tile>
  );
}
function activityTimeAgo(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return mins + "m";
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + "h";
  return Math.floor(hours / 24) + "d";
}
function ActivityTile() {
  // null = loading, [] = loaded-but-empty/error
  const [items, setItems] = React.useState(null);
  const [error, setError] = React.useState(null);
  React.useEffect(() => {
    let cancelled = false;
    api.auditLogs
      .list({ page: 1, per_page: 5 })
      .then((result) => {
        if (cancelled) return;
        const rows = Array.isArray(result) ? result : result?.items || [];
        setItems(rows);
      })
      .catch((e) => {
        if (cancelled) return;
        // Honest failure — do not fall back to fabricated/sample rows.
        setError(e?.message || __t("dashboard.activityLoadError") || "Failed to load activity");
        setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <Tile
      title={__t("dashboard.recentActivity") || "Recent Activity"}
      action={__t("dashboard.viewAll") || "View all"}
      onAction={() => window.__nav?.("activity")}
    >
      {items === null ? (
        <div className="fs-11 fg-3" style={{ padding: "6px 0" }}>
          {__t("common.loading") || "Loading…"}
        </div>
      ) : items.length === 0 ? (
        <div className="fs-11 fg-3" style={{ padding: "6px 0" }}>
          {error || __t("dashboard.noActivity") || "No recent activity"}
        </div>
      ) : (
        items.map((a) => (
          <div
            key={a.id ?? a.createdAt + "-" + a.action}
            className="fs-11"
            style={{
              padding: "6px 0",
              borderBottom: "1px solid var(--line-soft)",
            }}
          >
            <strong>
              {a.userEmail || (a.userId != null ? "User #" + a.userId : "System")}
            </strong>{" "}
            <span className="fg-3 font-mono bg-sunk br-2">{a.action}</span>{" "}
            <span style={{ padding: "0 4px" }}>
              {a.entityType || ""}
              {a.entityId != null ? " #" + a.entityId : ""}
            </span>
            <span className="font-mono fs-10 fg-3 ml-6">
              {activityTimeAgo(a.createdAt)}
            </span>
          </div>
        ))
      )}
    </Tile>
  );
}
// ── Admin: users / tenant / system health / audit ──────────────────────────
function UsersTile() {
  // users: null = loading, [] = loaded-but-empty/error. total tracks the
  // real seat count (from pagination), independent of how many rows we
  // fetch to display.
  const [users, setUsers] = React.useState(null);
  const [total, setTotal] = React.useState(0);
  const [error, setError] = React.useState(null);
  React.useEffect(() => {
    let cancelled = false;
    Promise.resolve(api?.users?.list?.({ per_page: 8 }))
      .then((res) => {
        if (cancelled) return;
        const rows = Array.isArray(res) ? res : res?.items || [];
        setUsers(rows);
        setTotal(typeof res?.total === "number" ? res.total : rows.length);
      })
      .catch((e) => {
        if (cancelled) return;
        // Honest failure — do not fall back to fabricated/sample rows.
        setError(
          e?.message || __t("dashboard.usersLoadError") || "Failed to load users",
        );
        setUsers([]);
        setTotal(0);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const pending = (users || []).filter((u) => u.isActive === false).length;
  return (
    <Tile
      title={__t("dashboard.users") || "Users & Tenant"}
      action={__t("dashboard.manage") || "Manage"}
      onAction={() => window.__nav?.("tenant-admin")}
    >
      {users === null ? (
        <div className="flex items-center gap-8" style={{ padding: "6px 0" }}>
          <Spinner size="sm" />
          <span className="fs-11 fg-3">
            {__t("common.loading") || "Loading…"}
          </span>
        </div>
      ) : (
        <>
          <div className="flex items-baseline gap-8 mb-10">
            <span className="font-mono fs-28 fw-700">{total}</span>
            <span className="font-mono fs-11 fg-3">
              {__t("dashboard.seats") || "seats"}
              {pending > 0 && (
                <>
                  {" "}
                  · {pending} {__t("dashboard.pending") || "pending"}
                </>
              )}
            </span>
          </div>
          {users.length === 0 ? (
            <EmptyState
              message={error || __t("dashboard.noUsers") || "No users yet"}
            />
          ) : (
            users.map((u) => (
              <div key={u.id} className="vendor-row">
                <span>
                  {u.fullName || u.username || u.email}{" "}
                  <span className="fg-3 fs-10">
                    {u.department ||
                      u.jobTitle ||
                      (u.isSuperuser
                        ? __t("dashboard.superuser") || "Superuser"
                        : "")}
                  </span>
                </span>
                <Badge tone={u.isActive === false ? "warning" : "success"} pill>
                  {u.isActive === false
                    ? __t("dashboard.inactive") || "inactive"
                    : __t("dashboard.active") || "active"}
                </Badge>
              </div>
            ))
          )}
        </>
      )}
    </Tile>
  );
}
function SystemHealthTile({ ctx }) {
  // Real backend health snapshot — GET /health/detailed (see
  // backend/app/monitoring/health.py::get_detailed_health). Replaces the
  // previous hardcoded "99.98% uptime / 0.02% error rate" placeholders,
  // which were never derived from any endpoint.
  // null = loading, {} = loaded/error (renders honest "—" placeholders)
  const [health, setHealth] = React.useState(null);
  React.useEffect(() => {
    let cancelled = false;
    Promise.resolve(api?.monitoring?.healthDetailed?.())
      .then((res) => {
        if (!cancelled) setHealth(res || {});
      })
      .catch(() => {
        if (!cancelled) setHealth({});
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const sync = ctx?.syncStatus || {};
  const loadingHealth = health === null;
  const online = loadingHealth
    ? ctx?.apiConnected !== false
    : health.status
      ? health.status === "healthy"
      : ctx?.apiConnected !== false;
  const dbLatency = health?.database?.latencyMs;
  const uptimeHours = health?.systemUptimeHours;
  const cells = [
    [
      __t("dashboard.dbLatency") || "DB Latency",
      dbLatency != null ? Number(dbLatency).toFixed(1) + "ms" : "—",
    ],
    [
      __t("dashboard.pendingSync") || "Pending sync",
      String(sync.pendingCount || 0),
    ],
    [
      __t("dashboard.uptime") || "Uptime",
      uptimeHours != null ? Number(uptimeHours).toFixed(1) + "h" : "—",
    ],
  ];
  return (
    <Tile
      title={__t("dashboard.systemHealth") || "System Health"}
      action={__t("dashboard.monitoring") || "Monitoring"}
      onAction={() => window.__nav?.("monitoring")}
    >
      <div className="flex items-center gap-8 mb-10">
        <StatusPill status={online ? "Operational" : "Degraded"} />
        <span className="font-mono fs-10 fg-3">
          {loadingHealth
            ? __t("common.loading") || "Loading…"
            : sync.syncing
              ? __t("dashboard.syncing") || "Syncing…"
              : __t("dashboard.allSynced") || "All changes synced"}
        </span>
      </div>
      <div
        className="d-grid gap-8"
        style={{ gridTemplateColumns: "repeat(3, 1fr)" }}
      >
        {cells.map(([l, v]) => (
          <div
            key={l}
            className="bg-sunk rounded-r2 text-center"
            style={{ padding: 8 }}
          >
            <div className="font-mono fs-14 fw-700">{v}</div>
            <div className="font-mono fs-9 fg-3 uppercase letter-sp-6">{l}</div>
          </div>
        ))}
      </div>
    </Tile>
  );
}
SystemHealthTile.propTypes = { ctx: PropTypes.object };
// Short relative-time label ("18m", "3h", "6d") matching this tile's
// pre-existing display convention.
function shortTimeAgo(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  const ms = Date.now() - d.getTime();
  if (Number.isNaN(ms)) return "—";
  const min = Math.floor(ms / 60000);
  if (min < 1) return __t("dashboard.justNow") || "now";
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}
function AuditTile() {
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.auditLogs
      .list({ page: 1, per_page: 3 })
      .then((result) => {
        if (cancelled) return;
        const rows = Array.isArray(result) ? result : result?.items || [];
        setItems(
          rows.map((r) => ({
            who:
              r.userEmail ||
              (r.userId != null ? `user #${r.userId}` : "System"),
            what: r.action || "—",
            obj:
              (r.entityType || "") +
              (r.entityId != null ? ` #${r.entityId}` : ""),
            time: shortTimeAgo(r.createdAt),
          })),
        );
      })
      .catch((e) => {
        if (cancelled) return;
        // Honest failure — do not fall back to fabricated/sample rows.
        setError(e?.message || "Failed to load audit log.");
        setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <Tile
      title={__t("dashboard.auditLog") || "Audit Log"}
      action={__t("dashboard.viewAll") || "View all"}
      onAction={() => window.__nav?.("audit-trail")}
    >
      {loading ? (
        <div className="flex items-center gap-8" style={{ padding: "6px 0" }}>
          <Spinner size="sm" />
          <span className="fs-11 fg-3">
            {__t("common.loading") || "Loading…"}
          </span>
        </div>
      ) : error ? (
        <div className="fs-11 fg-danger" style={{ padding: "6px 0" }}>
          {error}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          message={
            __t("dashboard.noAuditEvents") || "No recent audit events."
          }
        />
      ) : (
        items.map((a, i) => (
          <div
            key={a.who + i}
            className="fs-11"
            style={{ padding: "6px 0", borderBottom: "1px solid var(--line-soft)" }}
          >
            <strong>{a.who}</strong>{" "}
            <span className="fg-3">{a.what}</span>{" "}
            <span style={{ padding: "0 4px" }}>{a.obj}</span>
            <span className="font-mono fs-10 fg-3 ml-6">{a.time}</span>
          </div>
        ))
      )}
    </Tile>
  );
}
// ── Engineering: ECO / where-used ───────────────────────────────────────────
function ECOTile() {
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.eco
      .list({ page: 1, per_page: 3 })
      .then((result) => {
        if (cancelled) return;
        const rows = Array.isArray(result) ? result : result?.items || [];
        setItems(rows);
      })
      .catch((e) => {
        if (cancelled) return;
        // Honest failure — do not fall back to fabricated/sample rows.
        setError(e?.message || "Failed to load ECOs.");
        setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <Tile
      title={__t("dashboard.openECOs") || "Open ECOs"}
      action={__t("dashboard.viewAll") || "View all"}
      onAction={() => window.__nav?.("ecr")}
    >
      {loading ? (
        <div className="flex items-center gap-8" style={{ padding: "6px 0" }}>
          <Spinner size="sm" />
          <span className="fs-11 fg-3">
            {__t("common.loading") || "Loading…"}
          </span>
        </div>
      ) : error ? (
        <div className="fs-11 fg-danger" style={{ padding: "6px 0" }}>
          {error}
        </div>
      ) : items.length === 0 ? (
        <EmptyState message={__t("dashboard.noOpenEcos") || "No open ECOs."} />
      ) : (
        items.map((e) => (
          <div
            key={e.id}
            className="flex justify-between items-center gap-8"
            style={{ padding: "6px 0", borderBottom: "1px solid var(--line-soft)" }}
          >
            <div>
              <div className="font-mono fs-11 fw-600">
                {e.eco_number || "ECO-" + e.id}
              </div>
              <div className="fs-10 fg-3">{e.title}</div>
            </div>
            <StatusPill
              status={e.status}
              label={
                e.status
                  ? String(e.status).charAt(0).toUpperCase() +
                    String(e.status).slice(1)
                  : e.status
              }
            />
          </div>
        ))
      )}
    </Tile>
  );
}
function WhereUsedTile() {
  // Cross-BOM part reuse — GET /analytics/most-used-parts, derived
  // server-side from bom_items_master (distinct BOM count per part).
  // null = loading, [] = loaded-but-empty/error
  const [items, setItems] = React.useState(null);
  React.useEffect(() => {
    let cancelled = false;
    Promise.resolve(api?.analytics?.mostUsedParts?.(5))
      .then((res) => {
        if (cancelled) return;
        const rows = Array.isArray(res) ? res : res?.items || [];
        setItems(rows);
      })
      .catch(() => {
        // Honest failure — do not fall back to fabricated/sample rows.
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <Tile
      title={__t("dashboard.whereUsed") || "Where Used"}
      action={__t("nav.parts") || "Components"}
      onAction={() => window.__nav?.("parts")}
    >
      {items === null ? (
        <div className="fs-11 fg-3" style={{ padding: "6px 0" }}>
          {__t("common.loading") || "Loading…"}
        </div>
      ) : items.length === 0 ? (
        <div className="fs-11 fg-3" style={{ padding: "6px 0" }}>
          {__t("dashboard.noWhereUsed") ||
            "No parts referenced in any BOM yet"}
        </div>
      ) : (
        items.map((it) => (
          <div key={it.partNumber || it.pn} className="vendor-row">
            <span className="font-mono">{it.partNumber || it.pn}</span>
            <span>
              {it.uses} {__t("dashboard.boms") || "BOMs"}
            </span>
          </div>
        ))
      )}
    </Tile>
  );
}
// ── Procurement: receiving ───────────────────────────────────────────────
function receivingStatusLabel(stage) {
  if (!stage) return "—";
  return String(stage)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
function receivingShortDate(v) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function receivingEta(t) {
  if (t.currentStage === "delivered" || t.currentStage === "completed") {
    return (
      receivingShortDate(t.actualDelivery) ||
      __t("dashboard.received") ||
      "Received"
    );
  }
  return receivingShortDate(t.estimatedDelivery) || "—";
}
function ReceivingTile() {
  // null = loading, [] = loaded-but-empty/error
  const [items, setItems] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [stats, setStats] = React.useState(null);
  React.useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.orderTracking.list({ per_page: 5 }).catch(() => null),
      api.orderTracking.stats().catch(() => null),
    ])
      .then(([list, st]) => {
        if (cancelled) return;
        const rows = Array.isArray(list) ? list : list?.items || [];
        setItems(rows);
        setStats(st || null);
      })
      .catch((e) => {
        if (cancelled) return;
        // Honest failure — do not fall back to fabricated/sample rows.
        setError(
          e?.message ||
            __t("dashboard.receivingLoadError") ||
            "Failed to load receiving data",
        );
        setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <Tile
      title={__t("dashboard.receiving") || "Receiving"}
      action={__t("dashboard.trackOrders") || "Track orders"}
      onAction={() => window.__nav?.("order-tracking")}
    >
      {items === null ? (
        <div className="fs-11 fg-3" style={{ padding: "6px 0" }}>
          {__t("common.loading") || "Loading…"}
        </div>
      ) : items.length === 0 ? (
        <div className="fs-11 fg-3" style={{ padding: "6px 0" }}>
          {error || __t("dashboard.noReceiving") || "No purchase orders in transit"}
        </div>
      ) : (
        <>
          {items.map((it) => (
            <div
              key={it.id}
              className="flex justify-between items-center gap-8"
              style={{ padding: "6px 0", borderBottom: "1px solid var(--line-soft)" }}
            >
              <div>
                <div className="font-mono fs-11 fw-600">
                  {it.po?.poNumber || "PO #" + it.poHeaderId}
                </div>
                <div className="fs-10 fg-3">
                  {it.po?.vendorName ||
                    __t("orderTracking.unknownVendor") ||
                    "Unknown vendor"}{" "}
                  · {__t("dashboard.eta") || "ETA"} {receivingEta(it)}
                </div>
              </div>
              <StatusPill status={receivingStatusLabel(it.currentStage)} />
            </div>
          ))}
          {stats && (
            <div
              className="font-mono fs-10 fg-3 pt-6"
              style={{ borderTop: "1px solid var(--line-soft)" }}
            >
              {stats.totalTracked ?? items.length}{" "}
              {__t("dashboard.tracked") || "tracked"}
              {stats.overdue
                ? " · " + stats.overdue + " " + (__t("dashboard.overdue") || "overdue")
                : ""}
            </div>
          )}
        </>
      )}
    </Tile>
  );
}
// ── Finance: cost rollups / should-cost ─────────────────────────────────────
function CostRollupTile() {
  // rows: null = loading, [] = loaded-but-empty/error, [...] = real per-project rollup
  const [rows, setRows] = React.useState(null);
  const [error, setError] = React.useState(null);
  React.useEffect(() => {
    let cancelled = false;
    Promise.resolve(api?.analytics?.dashboard?.())
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res?.byProject) ? res.byProject : [];
        setRows(list);
      })
      .catch((e) => {
        if (cancelled) return;
        // Honest failure — do not fall back to fabricated/sample rows.
        setError(e?.message || "Failed to load cost rollup.");
        setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <Tile
      title={__t("dashboard.costRollup") || "Cost Rollup by Project"}
      action={__t("nav.analytics") || "Analytics"}
      onAction={() => window.__nav?.("analytics")}
    >
      {rows === null ? (
        <div className="fs-11 fg-3" style={{ padding: "6px 0" }}>
          {__t("common.loading") || "Loading…"}
        </div>
      ) : rows.length === 0 ? (
        <div className="fs-11 fg-3" style={{ padding: "6px 0" }}>
          {error || __t("dashboard.noCostData") || "No cost data yet"}
        </div>
      ) : (
        rows.map((p) => (
          <div key={p.project} className="vendor-row">
            <span className="font-mono">{p.project}</span>
            <span>{INR((Number(p.spent) || 0) + (Number(p.committed) || 0), 0)}</span>
          </div>
        ))
      )}
    </Tile>
  );
}
function ShouldCostTile() {
  // null = loading, [] = loaded-but-empty/error
  const [items, setItems] = React.useState(null);
  const [error, setError] = React.useState(null);
  React.useEffect(() => {
    let cancelled = false;
    Promise.resolve(api.shouldCost.list({ page: 1, per_page: 5 }))
      .then((result) => {
        if (cancelled) return;
        const rows = Array.isArray(result) ? result : result?.items || [];
        setItems(rows);
      })
      .catch((e) => {
        if (cancelled) return;
        // Honest failure — do not fall back to fabricated/sample rows.
        setError(
          e?.message ||
            __t("dashboard.shouldCostLoadError") ||
            "Failed to load should-cost data",
        );
        setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <Tile
      title={__t("dashboard.shouldCost") || "Should-Cost Variance"}
      action={__t("nav.analytics") || "Analytics"}
      onAction={() => window.__nav?.("analytics")}
    >
      {items === null ? (
        <div className="fs-11 fg-3" style={{ padding: "6px 0" }}>
          {__t("common.loading") || "Loading…"}
        </div>
      ) : items.length === 0 ? (
        <div className="fs-11 fg-3" style={{ padding: "6px 0" }}>
          {error ||
            __t("dashboard.noShouldCostData") ||
            "No should-cost models yet"}
        </div>
      ) : (
        items.map((it) => {
          const delta = Number(it.variancePct) || 0;
          const label =
            it.partNumber ||
            it.pn ||
            (it.partId != null ? `Part #${it.partId}` : "—");
          return (
            <div key={it.id ?? label} className="vendor-row">
              <span className="font-mono">{label}</span>
              <span
                style={{
                  color: delta > 10 ? "var(--danger-text)" : "var(--fg-3)",
                }}
              >
                {delta >= 0 ? "+" : ""}
                {delta.toFixed(0)}%
              </span>
            </div>
          );
        })
      )}
    </Tile>
  );
}
export { DashboardScreen };
window.DashboardScreen = DashboardScreen;
window.WORKSPACE_BUDGET = WORKSPACE_BUDGET;
