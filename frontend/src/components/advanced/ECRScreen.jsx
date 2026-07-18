import { storage } from "../../utils/storage.js";

import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import { Icon, INR, api, escapeHtml, openPrintWindow, useAppStore } from "../../globals";
import { ESignDialog } from "../ESignDialog.jsx";
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  Field,
  Input,
  Menu,
  Modal,
  ScreenHeader,
  Select,
  StatusPill,
  TabPanel,
  Tabs,
} from "../ui";

// Actions that are 21 CFR Part 11 guarded change-control events — approving
// or implementing an ECR/ECO requires a password-re-authenticated
// electronic signature, captured via ESignDialog and enforced server-side
// by app.services.eco_service.perform_eco_action (see updateStatus below,
// which only applies the local status change after that call succeeds).
const ESIGN_ACTIONS = new Set(["approve", "implement"]);

const IMPACT_TONE = { high: "danger", med: "warning", low: "neutral" };
const APPROVAL_TONE = {
  approved: "var(--status-success)",
  rejected: "var(--status-danger)",
  pending: "var(--bg-subtle)",
};

function ApprovalDot({ role, value }) {
  return (
    <span
      title={role.toUpperCase() + ": " + value}
      className="w-18 h-18 inline-flex items-center justify-center font-mono fs-9 fw-700"
      style={{
        borderRadius: 99,
        background: APPROVAL_TONE[value] || "var(--bg-subtle)",
        color: value === "pending" ? "var(--text-muted)" : "white",
        border: value === "pending" ? "1px solid var(--border-subtle)" : "none",
      }}
    >
      {role[0].toUpperCase()}
    </span>
  );
}

function ECRScreen() {
  const ctx = useAppStore();
  const [filter, setFilter] = React.useState("All");
  const [showForm, setShowForm] = React.useState(false);
  const [form, setForm] = React.useState({
    title: "",
    project: "ATLAS",
    impact: "med",
    cost_impact: 0,
    items_affected: 0,
  });
  const [detailEcr, setDetailEcr] = React.useState(null);
  // { ecr, action } while the e-sign dialog is open for an approve/implement
  // request; null otherwise.
  const [signRequest, setSignRequest] = React.useState(null);
  const [ecrs, setEcrs] = React.useState(() => {
    try {
      const saved = storage.ecrs.get();
      if (saved && saved.length) return saved;
    } catch {
      console.warn("Failed to parse ECRs from localStorage");
    }
    return [
      {
        id: "ECR-2026-014",
        title: "Replace STM32F4 with H7 in ATLAS-LITE",
        project: "ATLAS-LITE",
        impact: "high",
        status: "Review",
        requester: "R. Sato",
        date: "2026-05-24",
        cost_impact: 240000,
        items_affected: 3,
        approvals: { eng: "approved", proc: "pending", fin: "pending" },
      },
      {
        id: "ECR-2026-013",
        title: "Anodize finish change for chassis panels",
        project: "ATLAS",
        impact: "low",
        status: "Approved",
        requester: "M. Park",
        date: "2026-05-20",
        cost_impact: 32400,
        items_affected: 2,
        approvals: { eng: "approved", proc: "approved", fin: "approved" },
      },
      {
        id: "ECR-2026-012",
        title: "Add 100µF bypass cap to power rail",
        project: "HORIZON",
        impact: "med",
        status: "Implemented",
        requester: "E. Chen",
        date: "2026-05-15",
        cost_impact: 1200,
        items_affected: 1,
        approvals: { eng: "approved", proc: "approved", fin: "approved" },
      },
      {
        id: "ECR-2026-011",
        title: "Switch BMS supplier Daly → Texas Instruments",
        project: "ATLAS",
        impact: "high",
        status: "Draft",
        requester: "K. Singh",
        date: "2026-05-12",
        cost_impact: -82000,
        items_affected: 1,
        approvals: { eng: "pending", proc: "pending", fin: "pending" },
      },
      {
        id: "ECR-2026-010",
        title: "Bump M3 screws to A2 stainless workspace-wide",
        project: "All",
        impact: "low",
        status: "Rejected",
        requester: "M. Park",
        date: "2026-05-08",
        cost_impact: 12800,
        items_affected: 8,
        approvals: { eng: "approved", proc: "approved", fin: "rejected" },
      },
    ];
  });
  React.useEffect(() => {
    storage.ecrs.set(ecrs);
  }, [ecrs]);
  const counts = ecrs.reduce((a, e) => {
    a[e.status] = (a[e.status] || 0) + 1;
    return a;
  }, {});
  const filtered =
    filter === "All" ? ecrs : ecrs.filter((e) => e.status === filter);

  const notify = (actionText, objText) => {
    if (ctx?.setNotifications) {
      ctx.setNotifications([
        {
          id: Date.now(),
          who: "System",
          init: "⌌",
          color: "sys",
          action: actionText,
          obj: objText,
          time: "just now",
          read: false,
          route: "ecr",
        },
        ...(ctx.notifications || []),
      ]);
    }
  };

  const addEcr = () => {
    const id = "ECR-2026-" + String(100 + ecrs.length).padStart(3, "0");
    const newEcr = {
      id,
      title: form.title || "New change request",
      project: form.project,
      impact: form.impact,
      status: "Draft",
      requester: "You",
      date: new Date().toISOString().slice(0, 10),
      cost_impact: Number(form.cost_impact) || 0,
      items_affected: Number(form.items_affected) || 0,
      approvals: { eng: "pending", proc: "pending", fin: "pending" },
      // Real backend ECO id this ECR is backed by, filled in by
      // createBackingEco() below once it resolves — null until then, and
      // permanently null if the backend call fails or is unreachable.
      // ESignDialog's ecoId prop is fed straight from this field (no
      // fallback to the local `id` string above); its own "no linked ECO"
      // guard treats null honestly rather than pretending to sign.
      ecoId: null,
    };
    setEcrs([newEcr, ...ecrs]);
    setForm({
      title: "",
      project: "ATLAS",
      impact: "med",
      cost_impact: 0,
      items_affected: 0,
    });
    setShowForm(false);
    toast(
      (__t("advanced.ecr.created") || "ECR {id} created").replace("{id}", id),
      { kind: "success" },
    );
    notify("New ECR created", id + " · " + newEcr.title);
    createBackingEco(id, newEcr);
  };

  // Best-effort backend sync: create the real ECO record this ECR is
  // backed by, so the password-re-authenticated e-sign dialog (wired to
  // approve/implement below) has a genuine numeric id to call
  // api.eco.action(ecoId, ...) against — without this, approve/implement
  // through this screen could never succeed (backend `eco_id: int` always
  // 422-rejects the client-generated "ECR-2026-…" string). The ECR row
  // itself is always created locally regardless of this call's outcome
  // (local-first) — if it fails (offline, backend down), ecoId simply
  // stays null and any later sign attempt honestly fails via ESignDialog's
  // "no linked ECO" guard instead of silently pretending to work.
  const createBackingEco = async (id, ecr) => {
    if (!api?.eco?.create) return;
    const priorityByImpact = { low: "low", med: "medium", high: "high" };
    try {
      const eco = await api.eco.create({
        title: ecr.title,
        change_type: "design",
        priority: priorityByImpact[ecr.impact] || "medium",
        reason: `Created from ${id}`,
      });
      const ecoId = eco?.id ?? eco?.eco_id ?? null;
      if (ecoId != null) {
        setEcrs((cur) => cur.map((e) => (e.id === id ? { ...e, ecoId } : e)));
      }
    } catch {
      // Honest failure — see comment above.
    }
  };

  const updateStatus = (id, action, opts = {}) => {
    const prevEcr = ecrs.find((e) => e.id === id);
    const next = ecrs.map((e) => {
      if (e.id !== id) return e;
      let status = e.status;
      let approvals = { ...e.approvals };
      if (action === "approve") {
        status = "Approved";
        approvals = { eng: "approved", proc: "approved", fin: "approved" };
      } else if (action === "reject") {
        status = "Rejected";
        approvals = { eng: "rejected", proc: "rejected", fin: "rejected" };
      } else if (action === "implement") {
        status = "Implemented";
        approvals = { eng: "approved", proc: "approved", fin: "approved" };
      } else if (action === "advance") {
        status =
          e.status === "Draft"
            ? "Review"
            : e.status === "Review"
              ? "Approved"
              : "Implemented";
        if (status === "Approved" || status === "Implemented")
          approvals = { eng: "approved", proc: "approved", fin: "approved" };
      }
      return { ...e, status, approvals };
    });
    setEcrs(next);
    const ecr = next.find((e) => e.id === id);
    const label =
      action === "approve"
        ? "approved"
        : action === "reject"
          ? "rejected"
          : action === "implement"
            ? "marked implemented"
            : "advanced";
    // For approve/implement, ESignDialog already toasted the real
    // (server-confirmed) result — avoid a second, redundant toast here.
    if (!opts.silent) {
      toast(id + " " + label, { kind: action === "reject" ? "warn" : "success" });
    }
    notify("ECR " + label, id + " · " + (ecr?.title || ""));
    // Keep the backend ECO in lockstep when submitting a Draft ECR for
    // review: perform_eco_action's "approve" transition requires the ECO
    // to already be in "review" status, so without this sync a freshly
    // created ECR's later Approve (through ESignDialog) would 409 even
    // though it has a real ecoId. Best-effort / fire-and-forget — demo
    // rows and ones whose backing ECO failed to create (ecoId still null)
    // are unaffected and keep the historical local-only behavior.
    if (
      action === "advance" &&
      prevEcr?.status === "Draft" &&
      prevEcr.ecoId != null &&
      api?.eco?.action
    ) {
      api.eco.action(prevEcr.ecoId, { action: "submit" }).catch(() => {
        // Honest failure: local status still advances; a later Approve
        // attempt will surface the real backend conflict via ESignDialog
        // rather than silently succeeding.
      });
    }
  };

  // Gatekeeper for approve/implement: these are 21 CFR Part 11 change-control
  // events and must go through the password-re-authenticated e-sign dialog
  // (which calls the real guarded backend action) rather than mutating local
  // status directly. Reject/advance are not signature-gated on the backend
  // and keep the previous local-only behavior.
  const requestAction = (ecr, action) => {
    if (ESIGN_ACTIONS.has(action)) {
      setSignRequest({ ecr, action });
      return;
    }
    updateStatus(ecr.id, action);
  };

  const exportCsv = () => {
    const csv = ecrs
      .map(
        (e) =>
          `${e.id},${e.title},${e.project},${e.status},${e.requester},${e.date}`,
      )
      .join("\n");
    const b = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = "ecr_log.csv";
    a.click();
    toast(__t("advanced.ecr.exported") || "ECR log exported", {
      kind: "success",
    });
  };

  const printEcr = (e) => {
    const h = escapeHtml;
    openPrintWindow(
      __t("advanced.ecr.ecrPrint") || "ECR Print",
      "<html><head><title>" +
        h(e.id) +
        "</title><style>body{font-family:monospace;padding:30px}</style></head><body><h1>" +
        h(e.id) +
        "</h1><h2>" +
        h(e.title) +
        "</h2><p>" +
        (__t("advanced.ecr.projectCol") || "Project") +
        ": " +
        h(e.project) +
        " | " +
        (__t("advanced.ecr.impactCol") || "Impact") +
        ": " +
        h(e.impact) +
        " | " +
        (__t("advanced.ecr.statusCol") || "Status") +
        ": " +
        h(e.status) +
        "</p><p>" +
        (__t("advanced.ecr.requester") || "Requester") +
        ": " +
        h(e.requester) +
        " | " +
        (__t("advanced.ecr.date") || "Date") +
        ": " +
        h(e.date) +
        "</p></body></html>",
      { features: "width=700,height=500", printDelay: 300 },
    );
  };

  const rowMenuItems = (e) => [
    ...(e.status === "Draft"
      ? [
          {
            icon: <Icon.Check size={11} />,
            label: __t("advanced.ecr.submitForReview") || "Submit for review",
            onSelect: () => updateStatus(e.id, "advance"),
          },
        ]
      : []),
    ...(e.status === "Review"
      ? [
          {
            icon: <Icon.Check size={11} />,
            label: __t("common.approve") || "Approve",
            onSelect: () => requestAction(e, "approve"),
          },
          {
            icon: <Icon.X size={11} />,
            label: __t("common.reject") || "Reject",
            onSelect: () => updateStatus(e.id, "reject"),
          },
        ]
      : []),
    ...(e.status === "Approved"
      ? [
          {
            icon: <Icon.Check size={11} />,
            label: __t("advanced.ecr.markImplemented") || "Mark implemented",
            onSelect: () => requestAction(e, "implement"),
          },
        ]
      : []),
    {
      icon: <Icon.Diff size={11} />,
      label: __t("advanced.ecr.viewDiff") || "View diff",
      onSelect: () => window.__nav?.("diff"),
    },
    {
      icon: <Icon.Doc size={11} />,
      label: __t("advanced.ecr.printEcr") || "Print ECR",
      onSelect: () => printEcr(e),
    },
  ];

  const filterItems = [
    "All",
    "Draft",
    "Review",
    "Approved",
    "Implemented",
    "Rejected",
  ].map((s) => ({
    value: s,
    label: s,
    count: s === "All" ? ecrs.length : counts[s] || 0,
  }));

  const columns = [
    {
      key: "id",
      header: __t("advanced.ecr.ecrId") || "ECR ID",
      render: (e) => <span className="mono fw-600">{e.id}</span>,
    },
    {
      key: "title",
      header: __t("advanced.ecr.titleCol") || "Title",
      render: (e) => (
        <>
          <div className="fw-500">{e.title}</div>
          <div className="font-mono fs-10 fg-3">
            {e.requester} · {e.date}
          </div>
        </>
      ),
    },
    {
      key: "project",
      header: __t("advanced.ecr.projectCol") || "Project",
      render: (e) => <span className="mono">{e.project}</span>,
    },
    {
      key: "impact",
      header: __t("advanced.ecr.impactCol") || "Impact",
      render: (e) => (
        <Badge tone={IMPACT_TONE[e.impact] || "neutral"} pill>
          {e.impact.toUpperCase()}
        </Badge>
      ),
    },
    {
      key: "items",
      header: __t("advanced.ecr.itemsCol") || "Items",
      align: "num",
      render: (e) => <span className="mono">{e.items_affected}</span>,
    },
    {
      key: "cost",
      header: __t("advanced.ecr.costDelta") || "Cost Δ",
      align: "num",
      render: (e) => (
        <span
          className="mono fw-600"
          style={{
            color:
              e.cost_impact > 0
                ? "var(--status-danger)"
                : e.cost_impact < 0
                  ? "var(--status-success)"
                  : "var(--text-muted)",
          }}
        >
          {e.cost_impact > 0 ? "+" : ""}
          {INR(e.cost_impact, 0)}
        </span>
      ),
    },
    {
      key: "approvals",
      header: __t("advanced.ecr.approvalsCol") || "Approvals",
      render: (e) => (
        <div className="inline-flex" style={{ gap: 3 }}>
          {Object.entries(e.approvals).map(([k, v]) => (
            <ApprovalDot key={k} role={k} value={v} />
          ))}
        </div>
      ),
    },
    {
      key: "status",
      header: __t("advanced.ecr.statusCol") || "Status",
      render: (e) => <StatusPill status={e.status} />,
    },
    {
      key: "actions",
      header: "",
      render: (e) => (
        <span onClick={(ev) => ev.stopPropagation()}>
          <Menu
            ariaLabel={__t("advanced.ecr.moreOptions") || "More options"}
            align="right"
            trigger={
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                aria-label={__t("advanced.ecr.moreOptions") || "More options"}
              >
                <Icon.Dots size={11} />
              </Button>
            }
            items={rowMenuItems(e)}
          />
        </span>
      ),
    },
  ];

  return (
    <div className="screen-wrap">
      <ScreenHeader
        title={__t("advanced.ecr.title") || "Engineering Change Requests"}
        description={
          <>
            {ecrs.length} {__t("advanced.ecr.ecrs") || "ECRs"} ·{" "}
            {counts.Review || 0}{" "}
            {__t("advanced.ecr.awaitingReview") || "awaiting review"} ·{" "}
            {counts.Approved || 0} {__t("advanced.ecr.approved") || "approved"}
          </>
        }
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={exportCsv}>
              <Icon.Export size={12} /> {__t("common.export") || "Export"}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowForm(!showForm)}
              aria-expanded={showForm}
            >
              <Icon.Plus size={12} /> {__t("advanced.ecr.newEcr") || "New ECR"}
            </Button>
          </>
        }
      />

      {showForm && (
        <Card
          className="mb-14"
          title={__t("advanced.ecr.createNew") || "Create New ECR"}
          footer={
            <div className="flex gap-8 justify-end">
              <Button variant="secondary" onClick={() => setShowForm(false)}>
                {__t("common.cancel") || "Cancel"}
              </Button>
              <Button
                variant="primary"
                onClick={addEcr}
                disabled={!form.title.trim()}
              >
                <Icon.Plus size={12} />{" "}
                {__t("advanced.ecr.createEcr") || "Create ECR"}
              </Button>
            </div>
          }
        >
          <div
            className="d-grid gap-10 mb-12"
            style={{ gridTemplateColumns: "1fr 1fr 1fr" }}
          >
            <Field
              label={__t("advanced.ecr.titleLabel") || "Title"}
              htmlFor="ecr-form-title"
            >
              <Input
                id="ecr-form-title"
                name="ecrTitle"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder={
                  __t("advanced.ecr.titlePlaceholder") ||
                  "Describe the change…"
                }
              />
            </Field>
            <Field
              label={__t("advanced.ecr.projectLabel") || "Project"}
              htmlFor="ecr-form-project"
            >
              <Select
                id="ecr-form-project"
                name="ecrProject"
                value={form.project}
                onChange={(e) => setForm({ ...form, project: e.target.value })}
              >
                {["ATLAS", "ATLAS-LITE", "HORIZON", "All"].map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label={__t("advanced.ecr.impactLabel") || "Impact"}
              htmlFor="ecr-form-impact"
            >
              <Select
                id="ecr-form-impact"
                name="ecrImpact"
                value={form.impact}
                onChange={(e) => setForm({ ...form, impact: e.target.value })}
              >
                {["low", "med", "high"].map((v) => (
                  <option key={v} value={v}>
                    {v.toUpperCase()}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div
            className="d-grid gap-10"
            style={{ gridTemplateColumns: "1fr 1fr" }}
          >
            <Field
              label={__t("advanced.ecr.costImpact") || "Cost Impact (₹)"}
              htmlFor="ecr-form-cost"
            >
              <Input
                id="ecr-form-cost"
                name="ecrCostImpact"
                type="number"
                mono
                value={form.cost_impact}
                onChange={(e) =>
                  setForm({ ...form, cost_impact: e.target.value })
                }
              />
            </Field>
            <Field
              label={__t("advanced.ecr.itemsAffected") || "Items Affected"}
              htmlFor="ecr-form-items"
            >
              <Input
                id="ecr-form-items"
                name="ecrItemsAffected"
                type="number"
                mono
                value={form.items_affected}
                onChange={(e) =>
                  setForm({ ...form, items_affected: e.target.value })
                }
              />
            </Field>
          </div>
        </Card>
      )}

      <Tabs
        id="ecr-filter"
        ariaLabel={__t("advanced.ecr.filterByStatus") || "Filter by status"}
        items={filterItems}
        value={filter}
        onChange={setFilter}
        className="mb-14"
      />

      <TabPanel id="ecr-filter" value={filter} active>
        <DataTable
          ariaLabel={__t("advanced.ecr.title") || "Engineering Change Requests"}
          columns={columns}
          rows={filtered}
          getRowKey={(e) => e.id}
          onRowClick={(e) => setDetailEcr(e)}
          empty={
            <EmptyState
              title={__t("advanced.ecr.noResults") || "No ECRs match this filter"}
            />
          }
        />
      </TabPanel>

      {detailEcr && (
        <Modal
          open={!!detailEcr}
          onClose={() => setDetailEcr(null)}
          icon={<Icon.Doc size={16} />}
          title={detailEcr.id + " · " + detailEcr.title}
          subtitle={
            (__t("advanced.ecr.requestedBy") || "Requested by") +
            " " +
            detailEcr.requester +
            " · " +
            detailEcr.date
          }
          size="lg"
          footer={
            <>
              <Button variant="secondary" onClick={() => setDetailEcr(null)}>
                {__t("common.close") || "Close"}
              </Button>
              {detailEcr.status === "Draft" && (
                <Button
                  variant="primary"
                  onClick={() => {
                    updateStatus(detailEcr.id, "advance");
                    setDetailEcr(null);
                  }}
                >
                  <Icon.Check size={12} />{" "}
                  {__t("advanced.ecr.submitForReview") || "Submit for Review"}
                </Button>
              )}
              {detailEcr.status === "Review" && (
                <>
                  <Button
                    variant="danger"
                    onClick={() => {
                      updateStatus(detailEcr.id, "reject");
                      setDetailEcr(null);
                    }}
                  >
                    <Icon.X size={12} /> {__t("common.reject") || "Reject"}
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => {
                      requestAction(detailEcr, "approve");
                      setDetailEcr(null);
                    }}
                  >
                    <Icon.Check size={12} />{" "}
                    {__t("common.approve") || "Approve"}
                  </Button>
                </>
              )}
              {detailEcr.status === "Approved" && (
                <Button
                  variant="primary"
                  onClick={() => {
                    requestAction(detailEcr, "implement");
                    setDetailEcr(null);
                  }}
                >
                  <Icon.Check size={12} />{" "}
                  {__t("advanced.ecr.markImplemented") || "Mark Implemented"}
                </Button>
              )}
            </>
          }
        >
          <div
            className="d-grid gap-16 mb-16"
            style={{ gridTemplateColumns: "1fr 1fr" }}
          >
            <div>
              <div className="fs-9 uppercase fg-3 font-mono mb-4 fw-600">
                {__t("advanced.ecr.projectCol") || "Project"}
              </div>
              <div>{detailEcr.project}</div>
            </div>
            <div>
              <div className="fs-9 uppercase fg-3 font-mono mb-4 fw-600">
                {__t("advanced.ecr.impactCol") || "Impact"}
              </div>
              <Badge tone={IMPACT_TONE[detailEcr.impact] || "neutral"} pill>
                {detailEcr.impact.toUpperCase()}
              </Badge>
            </div>
            <div>
              <div className="fs-9 uppercase fg-3 font-mono mb-4 fw-600">
                {__t("advanced.ecr.costImpact") || "Cost Impact"}
              </div>
              <div
                style={{
                  color:
                    detailEcr.cost_impact > 0
                      ? "var(--status-danger)"
                      : detailEcr.cost_impact < 0
                        ? "var(--status-success)"
                        : "var(--text-primary)",
                }}
              >
                {detailEcr.cost_impact > 0 ? "+" : ""}
                {INR(detailEcr.cost_impact, 0)}
              </div>
            </div>
            <div>
              <div className="fs-9 uppercase fg-3 font-mono mb-4 fw-600">
                {__t("advanced.ecr.itemsAffected") || "Items Affected"}
              </div>
              <div>{detailEcr.items_affected}</div>
            </div>
            <div>
              <div className="fs-9 uppercase fg-3 font-mono mb-4 fw-600">
                {__t("advanced.ecr.statusCol") || "Status"}
              </div>
              <StatusPill status={detailEcr.status} />
            </div>
          </div>
          <div className="border-top pt-12">
            <div className="fs-9 uppercase fg-3 font-mono mb-8">
              {__t("advanced.ecr.approvalWorkflow") || "Approval Workflow"}
            </div>
            <div className="flex gap-12">
              {Object.entries(detailEcr.approvals).map(([k, v]) => (
                <div
                  key={k}
                  className="flex items-center gap-6 rounded-r2"
                  style={{
                    padding: "6px 10px",
                    background:
                      v === "approved"
                        ? "color-mix(in oklch, var(--status-success) 10%, var(--bg-surface))"
                        : v === "rejected"
                          ? "color-mix(in oklch, var(--status-danger) 10%, var(--bg-surface))"
                          : "var(--bg-subtle)",
                    border:
                      "1px solid " +
                      (v === "approved"
                        ? "var(--status-success)"
                        : v === "rejected"
                          ? "var(--status-danger)"
                          : "var(--border-subtle)"),
                  }}
                >
                  <ApprovalDot role={k} value={v} />
                  <div>
                    <div className="fs-10 fw-600 fs-9 fg-3">
                      {k.toUpperCase()}
                    </div>
                    <div>{v}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Modal>
      )}

      <ESignDialog
        open={!!signRequest}
        onClose={() => setSignRequest(null)}
        // Deliberately no fallback to signRequest.ecr.id: that's the
        // client-generated "ECR-2026-…" string, never a valid backend
        // eco_id. Falling back to it would make ESignDialog call
        // api.eco.action with a non-numeric id (422, before password/
        // signature verification) instead of honestly reporting "no linked
        // ECO" when createBackingEco() hasn't produced a real one yet.
        ecoId={signRequest?.ecr?.ecoId ?? null}
        ecoLabel={signRequest ? `${signRequest.ecr.id} · ${signRequest.ecr.title}` : ""}
        action={signRequest?.action || "approve"}
        onSuccess={() => {
          if (signRequest) updateStatus(signRequest.ecr.id, signRequest.action, { silent: true });
          setSignRequest(null);
        }}
      />
    </div>
  );
}

export { ECRScreen };
export default ECRScreen;
