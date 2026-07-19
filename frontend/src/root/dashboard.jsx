import PropTypes from "prop-types";
import { __t } from "../i18n";
import { toast } from "../utils/toast";
import {
  Button,
  Card,
  Badge,
  StatusPill,
  Menu,
  Field,
  Input,
  ScreenHeader,
} from "../components/ui";
export const WORKSPACE_BUDGET = {
  annual: 10000000,
  spent: 4200000,
  committed: 1800000,
  byProject: {
    ATLAS: { spent: 1200000, committed: 800000, budget: 3000000 },
    HORIZON: { spent: 2500000, committed: 500000, budget: 4000000 },
    "ATLAS-LITE": { spent: 300000, committed: 200000, budget: 1500000 },
    NEBULA: { spent: 200000, committed: 300000, budget: 1500000 },
  },
  byCategory: {
    Electrical: 0.42,
    Optical: 0.18,
    Mechanical: 0.2,
    Hardware: 0.06,
    Cable: 0.08,
    Other: 0.06,
  },
  monthly: [1.2, 1.4, 1.3, 1.6, 1.8, 1.9, 1.7, 1.9, 2.1, 2.0, 1.8, 1.9],
};
function DashboardScreen() {
  const ctx = useAppStore();
  const role = ctx?.userRole || "Admin";
  const [period, setPeriod] = React.useState("FY 2026");
  const [editingBudget, setEditingBudget] = React.useState(false);
  const [budgetEdits, setBudgetEdits] = React.useState(null);
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
    WORKSPACE_BUDGET.annual = budgetEdits.annual;
    Object.entries(budgetEdits.byProject).forEach(([k, v]) => {
      WORKSPACE_BUDGET.byProject[k] = v;
    });
    setEditingBudget(false);
    toast(__t("dashboard.budgetUpdated") || "Workspace budget updated", {
      kind: "success",
    });
  };
  // Period-scaled budget — same annual; spent/committed scale to the period
  const PERIODS = {
    "FY 2026": { spent: 1.0, committed: 1.0, label: "FY 2026" },
    "Q3 2026": { spent: 0.28, committed: 0.42, label: "Q3 2026 (Jul–Sep)" },
    "Q2 2026": { spent: 0.34, committed: 0.18, label: "Q2 2026 (Apr–Jun)" },
    "Q1 2026": { spent: 0.24, committed: 0.08, label: "Q1 2026 (Jan–Mar)" },
    "Last 30d": { spent: 0.09, committed: 0.42, label: "Last 30 days" },
    "Last 7d": { spent: 0.024, committed: 0.42, label: "Last 7 days" },
  };
  const scale = PERIODS[period] || PERIODS["FY 2026"];
  const wb = {
    ...WORKSPACE_BUDGET,
    spent: Math.round(WORKSPACE_BUDGET.spent * scale.spent),
    committed: Math.round(WORKSPACE_BUDGET.committed * scale.committed),
  };
  const pctSpent = (wb.spent / wb.annual) * 100;
  const pctCommitted = ((wb.spent + wb.committed) / wb.annual) * 100;
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
                {((remaining / wb.annual) * 100).toFixed(1)}%{" "}
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
              width: (wb.committed / wb.annual) * 100 + "%",
              background:
                "color-mix(in oklch, var(--accent) 50%, var(--bg-sunk))",
            }}
          >
            {(wb.committed / wb.annual) * 100 > 5
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
          <div
            className="d-grid gap-10"
            style={{ gridTemplateColumns: "repeat(4, 1fr)" }}
          >
            {Object.entries(wb.byProject).map(([k, p]) => {
              const used = ((p.spent + p.committed) / p.budget) * 100;
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
  const items = [
    { pn: "EL-BMS-12S", reason: "Lead time 28d → 35d", sev: "high" },
    { pn: "HW-FAS-M3-08", reason: "Duplicate detected", sev: "med" },
    { pn: "EL-MCU-STM32H7", reason: "Single-source CN", sev: "med" },
  ];
  return (
    <Tile
      title={__t("dashboard.supplyRisk") || "Supply Risk"}
      action={__t("dashboard.viewAll") || "View all"}
      onAction={() => window.__nav?.("bom")}
    >
      {items.map((it) => (
        <div
          key={it.pn}
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
          <Badge tone={it.sev === "high" ? "danger" : "warning"}>
            {it.sev.toUpperCase()}
          </Badge>
        </div>
      ))}
    </Tile>
  );
}
function ApprovalsTile({ role }) {
  const counts = { engineering: 2, procurement: 3, finance: 1 };
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
              color: counts[r.toLowerCase()] ? "var(--accent-text)" : "var(--fg-4)",
            }}
          >
            {counts[r.toLowerCase()]}
          </span>
        </div>
      ))}
    </Tile>
  );
}
ApprovalsTile.propTypes = {
  role: PropTypes.any,
};
function InFlightTile() {
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
        {[
          [__t("dashboard.rfq") || "RFQ", 2],
          [__t("dashboard.po") || "PO", 3],
          [__t("dashboard.transit") || "Transit", 4],
        ].map(([l, v]) => (
          <div
            key={l}
            className="bg-sunk rounded-r2 text-center"
            style={{ padding: 8 }}
          >
            <div className="font-mono fs-18 fw-700">{v}</div>
            <div className="font-mono fs-9 fg-3 uppercase letter-sp-6">{l}</div>
          </div>
        ))}
      </div>
      <div
        className="font-mono fs-11 fg-3 pt-6"
        style={{ borderTop: "1px solid var(--line-soft)" }}
      >
        {__t("dashboard.totalInFlight") || "Total in flight"}:{" "}
        <strong className="fg">{INR(WORKSPACE_BUDGET.committed, 0)}</strong>
      </div>
    </Tile>
  );
}
function MyBOMsTile() {
  const list = [
    { name: "ATLAS · Mainframe Rev D", status: "Draft", updated: "2h" },
    { name: "HORIZON · Sensor Pod Rev B", status: "Review", updated: "5h" },
    { name: "NEBULA · IO Module v0.3", status: "Draft", updated: "1d" },
  ];
  return (
    <Tile
      title={__t("dashboard.myBoms") || "My BOMs"}
      action={__t("dashboard.openEditor") || "Open editor"}
      onAction={() => window.__nav?.("bom")}
    >
      {list.map((b) => (
        <div
          key={b.name}
          className="d-grid gap-8 items-center"
          style={{
            gridTemplateColumns: "1fr auto",
            padding: "6px 0",
            borderBottom: "1px solid var(--line-soft)",
          }}
        >
          <div>
            <div className="fs-12 fw-500">{b.name}</div>
            <div className="font-mono fs-10 fg-3">
              {__t("dashboard.updated") || "Updated"} {b.updated}{" "}
              {__t("dashboard.ago") || "ago"}
            </div>
          </div>
          <StatusPill status={b.status} />
        </div>
      ))}
    </Tile>
  );
}
function VendorsTile() {
  return (
    <Tile
      title={__t("nav.vendors") || "Vendors"}
      action={__t("dashboard.allVendors") || "All"}
      onAction={() => window.__nav?.("vendors")}
    >
      <div className="vendor-row">
        <span className="fg-3 fw-600">{__t("vendor.active") || "Active"}</span>
        <span>14</span>
      </div>
      <div className="vendor-row">
        <span className="fg-3 fw-600 fg-accent">
          {__t("vendor.preferred") || "Preferred"}
        </span>
        <span>8</span>
      </div>
      <div className="vendor-row">
        <span className="fg-3 fw-600 fg-danger">
          {__t("dashboard.highRisk") || "High risk"}
        </span>
        <span>1</span>
      </div>
      <div
        className="mt-8 pt-8 font-mono fs-10 fg-3"
        style={{ borderTop: "1px solid var(--line-soft)" }}
      >
        {__t("dashboard.topVendorSummary") ||
          "Top: McMaster · A+ score · 99% on-time"}
      </div>
    </Tile>
  );
}
function SpendMixTile() {
  const data = WORKSPACE_BUDGET.byCategory;
  const colors = {
    Electrical: "oklch(0.55 0.13 240)",
    Optical: "oklch(0.55 0.13 320)",
    Mechanical: "oklch(0.55 0.08 60)",
    Hardware: "oklch(0.55 0.10 145)",
    Cable: "oklch(0.55 0.10 280)",
    Other: "var(--fg-3)",
  };
  return (
    <Tile
      title={__t("dashboard.spendMix") || "Spend Mix"}
      action={__t("nav.analytics") || "Analytics"}
      onAction={() => window.__nav?.("analytics")}
    >
      <div className="flex h-14 br-4 overflow-h mb-10">
        {Object.entries(data).map(([k, v]) => (
          <div
            key={k}
            style={{ width: v * 100 + "%", background: colors[k] }}
            title={`${k}: ${(v * 100).toFixed(0)}%`}
          />
        ))}
      </div>
      {Object.entries(data).map(([k, v]) => (
        <div
          key={k}
          className="flex justify-between font-mono fs-10"
          style={{ padding: "2px 0" }}
        >
          <span className="flex-inline-c w-8 h-8 br-2">
            <span style={{ background: colors[k] }} /> {k}
          </span>
          <span className="fg-3">{(v * 100).toFixed(0)}%</span>
        </div>
      ))}
    </Tile>
  );
}
function CostTrendTile() {
  const data = WORKSPACE_BUDGET.monthly;
  const max = Math.max(...data);
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
function ActivityTile() {
  const items = [
    { who: "M. Park", what: "edited", obj: "STM32H7", time: "12m" },
    { who: "K. Singh", what: "approved", obj: "PO-0481", time: "2h" },
    { who: "System", what: "flagged", obj: "EL-BMS-12S", time: "5h" },
  ];
  return (
    <Tile
      title={__t("dashboard.recentActivity") || "Recent Activity"}
      action={__t("dashboard.viewAll") || "View all"}
      onAction={() => window.__nav?.("activity")}
    >
      {items.map((a, i) => (
        <div
          key={a.who + "-" + a.time}
          className="fs-11"
          style={{
            padding: "6px 0",
            borderBottom: "1px solid var(--line-soft)",
          }}
        >
          <strong>{a.who}</strong>{" "}
          <span className="fg-3 font-mono bg-sunk br-2">{a.what}</span>{" "}
          <span style={{ padding: "0 4px" }}>{a.obj}</span>
          <span className="font-mono fs-10 fg-3 ml-6">{a.time}</span>
        </div>
      ))}
    </Tile>
  );
}
// ── Admin: users / tenant / system health / audit ──────────────────────────
function UsersTile() {
  const users = [
    { name: "Elena Chen", role: "Admin", status: "active" },
    { name: "M. Park", role: "Engineering", status: "active" },
    { name: "K. Singh", role: "Procurement", status: "active" },
    { name: "R. Alvarez", role: "Finance", status: "invited" },
  ];
  return (
    <Tile
      title={__t("dashboard.users") || "Users & Tenant"}
      action={__t("dashboard.manage") || "Manage"}
      onAction={() => window.__nav?.("tenant-admin")}
    >
      <div className="flex items-baseline gap-8 mb-10">
        <span className="font-mono fs-28 fw-700">{users.length}</span>
        <span className="font-mono fs-11 fg-3">
          {__t("dashboard.seats") || "seats"} ·{" "}
          {users.filter((u) => u.status === "invited").length}{" "}
          {__t("dashboard.pending") || "pending"}
        </span>
      </div>
      {users.map((u) => (
        <div key={u.name} className="vendor-row">
          <span>
            {u.name} <span className="fg-3 fs-10">{u.role}</span>
          </span>
          <Badge tone={u.status === "active" ? "success" : "warning"} pill>
            {u.status}
          </Badge>
        </div>
      ))}
    </Tile>
  );
}
function SystemHealthTile({ ctx }) {
  const online = ctx?.apiConnected !== false;
  const sync = ctx?.syncStatus || {};
  return (
    <Tile
      title={__t("dashboard.systemHealth") || "System Health"}
      action={__t("dashboard.monitoring") || "Monitoring"}
      onAction={() => window.__nav?.("monitoring")}
    >
      <div className="flex items-center gap-8 mb-10">
        <StatusPill status={online ? "Operational" : "Degraded"} />
        <span className="font-mono fs-10 fg-3">
          {sync.syncing
            ? __t("dashboard.syncing") || "Syncing…"
            : __t("dashboard.allSynced") || "All changes synced"}
        </span>
      </div>
      <div
        className="d-grid gap-8"
        style={{ gridTemplateColumns: "repeat(3, 1fr)" }}
      >
        {[
          [__t("dashboard.apiUptime") || "API Uptime", "99.98%"],
          [
            __t("dashboard.pendingSync") || "Pending sync",
            String(sync.pendingCount || 0),
          ],
          [__t("dashboard.errorRate") || "Error rate", "0.02%"],
        ].map(([l, v]) => (
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
function AuditTile() {
  const items = [
    { who: "Elena Chen", what: "changed role of", obj: "R. Alvarez → Finance", time: "18m" },
    { who: "System", what: "revoked API key", obj: "key-prod-07", time: "3h" },
    { who: "K. Singh", what: "approved", obj: "PO-0481", time: "6h" },
  ];
  return (
    <Tile
      title={__t("dashboard.auditLog") || "Audit Log"}
      action={__t("dashboard.viewAll") || "View all"}
      onAction={() => window.__nav?.("audit-trail")}
    >
      {items.map((a, i) => (
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
      ))}
    </Tile>
  );
}
// ── Engineering: ECO / where-used ───────────────────────────────────────────
function ECOTile() {
  const items = [
    { id: "ECO-0142", title: "Revise BMS harness routing", status: "Review" },
    { id: "ECO-0139", title: "Swap MCU to STM32H7 rev B", status: "Draft" },
    { id: "ECO-0135", title: "Update sensor pod enclosure", status: "Approved" },
  ];
  return (
    <Tile
      title={__t("dashboard.openECOs") || "Open ECOs"}
      action={__t("dashboard.viewAll") || "View all"}
      onAction={() => window.__nav?.("ecr")}
    >
      {items.map((e) => (
        <div
          key={e.id}
          className="flex justify-between items-center gap-8"
          style={{ padding: "6px 0", borderBottom: "1px solid var(--line-soft)" }}
        >
          <div>
            <div className="font-mono fs-11 fw-600">{e.id}</div>
            <div className="fs-10 fg-3">{e.title}</div>
          </div>
          <StatusPill status={e.status} />
        </div>
      ))}
    </Tile>
  );
}
function WhereUsedTile() {
  const items = [
    { pn: "HW-FAS-M3-08", uses: 6 },
    { pn: "EL-MCU-STM32H7", uses: 4 },
    { pn: "EL-BMS-12S", uses: 3 },
  ];
  return (
    <Tile
      title={__t("dashboard.whereUsed") || "Where Used"}
      action={__t("nav.parts") || "Components"}
      onAction={() => window.__nav?.("parts")}
    >
      {items.map((it) => (
        <div key={it.pn} className="vendor-row">
          <span className="font-mono">{it.pn}</span>
          <span>
            {it.uses} {__t("dashboard.boms") || "BOMs"}
          </span>
        </div>
      ))}
    </Tile>
  );
}
// ── Procurement: receiving ───────────────────────────────────────────────
function ReceivingTile() {
  const items = [
    { po: "PO-0481", vendor: "McMaster", eta: "Today", status: "In transit" },
    { po: "PO-0476", vendor: "Digi-Key", eta: "Tomorrow", status: "In transit" },
    { po: "PO-0470", vendor: "Mouser", eta: "—", status: "Received" },
  ];
  return (
    <Tile
      title={__t("dashboard.receiving") || "Receiving"}
      action={__t("dashboard.trackOrders") || "Track orders"}
      onAction={() => window.__nav?.("order-tracking")}
    >
      {items.map((it) => (
        <div
          key={it.po}
          className="flex justify-between items-center gap-8"
          style={{ padding: "6px 0", borderBottom: "1px solid var(--line-soft)" }}
        >
          <div>
            <div className="font-mono fs-11 fw-600">{it.po}</div>
            <div className="fs-10 fg-3">
              {it.vendor} · ETA {it.eta}
            </div>
          </div>
          <StatusPill status={it.status} />
        </div>
      ))}
    </Tile>
  );
}
// ── Finance: cost rollups / should-cost ─────────────────────────────────────
function CostRollupTile() {
  const rows = Object.entries(WORKSPACE_BUDGET.byProject);
  return (
    <Tile
      title={__t("dashboard.costRollup") || "Cost Rollup by Project"}
      action={__t("nav.analytics") || "Analytics"}
      onAction={() => window.__nav?.("analytics")}
    >
      {rows.map(([k, p]) => (
        <div key={k} className="vendor-row">
          <span className="font-mono">{k}</span>
          <span>{INR(p.spent + p.committed, 0)}</span>
        </div>
      ))}
    </Tile>
  );
}
function ShouldCostTile() {
  const items = [
    { pn: "EL-BMS-12S", quoted: 42.5, should: 36.1 },
    { pn: "HW-FAS-M3-08", quoted: 0.18, should: 0.14 },
    { pn: "EL-MCU-STM32H7", quoted: 11.2, should: 10.6 },
  ];
  return (
    <Tile
      title={__t("dashboard.shouldCost") || "Should-Cost Variance"}
      action={__t("nav.analytics") || "Analytics"}
      onAction={() => window.__nav?.("analytics")}
    >
      {items.map((it) => {
        const delta = ((it.quoted - it.should) / it.should) * 100;
        return (
          <div key={it.pn} className="vendor-row">
            <span className="font-mono">{it.pn}</span>
            <span style={{ color: delta > 10 ? "var(--danger-text)" : "var(--fg-3)" }}>
              +{delta.toFixed(0)}%
            </span>
          </div>
        );
      })}
    </Tile>
  );
}
export { DashboardScreen };
window.DashboardScreen = DashboardScreen;
window.WORKSPACE_BUDGET = WORKSPACE_BUDGET;
