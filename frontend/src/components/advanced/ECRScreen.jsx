import { storage } from "../../utils/storage.js";
import { navigateTo } from "../../services/navigation.js";

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

// Maps app.models.eco.EcoHeader's real `status`/`impact_level` enums onto
// this screen's ECR vocabulary, for the load-on-mount backend merge below.
// "closed" has no ECR equivalent (terminal, post-implementation) so it
// folds into "Implemented"; "cancelled" is the closest backend analogue of
// "Rejected" (perform_eco_action's own "reject" action instead sends the
// ECO back to "draft" for rework — see the reject-sync comment in
// updateStatus — so a rejected-and-not-yet-resubmitted ECO round-trips as
// "Draft", which is honest, not a bug).
const ECO_STATUS_TO_ECR = {
  draft: "Draft",
  review: "Review",
  approved: "Approved",
  implemented: "Implemented",
  closed: "Implemented",
  cancelled: "Rejected",
};
const ECO_IMPACT_TO_ECR = { minor: "low", major: "med", critical: "high" };

// Normalizes a row's `approvals` for rendering. Real eco_approvals records
// (the `approvals` array on GET /eco/{id}) and the local-first demo rows'
// {eng,proc,fin} shape — also what older localStorage payloads hold — both
// flatten to the same list. null means "no real approval data for this
// row", rendered as an explicit unknown dot and never as a grid derived
// from the ECO's status.
function approvalList(approvals) {
  if (Array.isArray(approvals)) {
    return approvals.map((a) => ({
      role: `Approver ${a.approver_id}`,
      value: a.status || "unknown",
      text: a.approval_order != null ? String(a.approval_order) : undefined,
    }));
  }
  if (approvals && typeof approvals === "object") {
    return Object.entries(approvals).map(([role, value]) => ({ role, value }));
  }
  return null;
}

// Backend EcoHeader -> local ECR row shape. The ECO model has no
// project/cost_impact/items_affected columns at all, so those are left at
// honest, neutral placeholders here rather than fabricated — see
// needs_followup in the wiring notes for this screen.
// `approvals` is the ECO's real eco_approvals rows, or null when the
// detail fetch that carries them hasn't resolved or failed.
function mapEcoToEcr(eco, approvals) {
  const status = ECO_STATUS_TO_ECR[eco.status] || "Draft";
  return {
    id: eco.eco_number || `ECO-${eco.id}`,
    title: eco.title || "Untitled change",
    project: "—",
    impact: ECO_IMPACT_TO_ECR[eco.impact_level] || "med",
    status,
    requester: eco.requested_by != null ? `User #${eco.requested_by}` : "—",
    date: (eco.requested_at || eco.created_at || "").slice(0, 10) || "—",
    cost_impact: 0,
    items_affected: 0,
    approvals: Array.isArray(approvals) ? approvals : null,
    ecoId: eco.id,
  };
}

// Merges a real backend ECO list into the local-first ECR rows: refreshes
// the fields the backend actually owns (status/title/approvals) on any row
// already linked to a real ecoId, and appends backend ECOs with no local
// counterpart (e.g. created from another screen/session) mapped via
// mapEcoToEcr. Local-only enrichment (project/cost_impact/items_affected)
// on already-known rows is left untouched rather than clobbered with
// mapEcoToEcr's placeholders.
function mergeBackendEcos(current, ecoRows, approvalsByEco) {
  const knownEcoIds = new Set(
    current.map((e) => e.ecoId).filter((id) => id != null),
  );
  const refreshed = current.map((e) => {
    if (e.ecoId == null) return e;
    const eco = ecoRows.find((row) => row.id === e.ecoId);
    if (!eco) return e;
    const mapped = mapEcoToEcr(eco, approvalsByEco.get(eco.id));
    return {
      ...e,
      status: mapped.status,
      title: mapped.title,
      approvals: mapped.approvals,
    };
  });
  const additions = ecoRows
    .filter((eco) => !knownEcoIds.has(eco.id))
    .map((eco) => mapEcoToEcr(eco, approvalsByEco.get(eco.id)));
  return [...additions, ...refreshed];
}

// `text` overrides the glyph — real approvals are numbered by
// approval_order, the demo rows' pseudo-roles use their initial.
function ApprovalDot({ role, value, text }) {
  const decided = value === "approved" || value === "rejected";
  return (
    <span
      title={role.toUpperCase() + ": " + value}
      className="w-18 h-18 inline-flex items-center justify-center font-mono fs-9 fw-700"
      style={{
        borderRadius: 99,
        background: APPROVAL_TONE[value] || "var(--bg-subtle)",
        color: decided ? "white" : "var(--text-muted)",
        border: decided ? "none" : "1px solid var(--border-subtle)",
      }}
    >
      {text || role[0].toUpperCase()}
    </span>
  );
}

// Row-level approval strip: real records, "no approvals recorded", or an
// explicit unknown — never a synthesized stand-in.
function ApprovalDots({ approvals }) {
  const list = approvalList(approvals);
  if (!list) return <ApprovalDot role="unknown" value="unknown" text="?" />;
  if (!list.length) return <span className="fs-10 fg-3 font-mono">—</span>;
  return list.map((a) => (
    <ApprovalDot key={a.role} role={a.role} value={a.value} text={a.text} />
  ));
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

  // Load-on-mount backend sync: the local-first storage/demo data above
  // renders immediately (offline-first — see project local-first
  // principle), and this enriches it with the real ECO list once the
  // network responds. Silent no-op if api.eco.list is unavailable, the
  // backend is unreachable, or it has nothing yet — never replaces the
  // local-first data with a hard failure or an empty screen.
  React.useEffect(() => {
    if (!api?.eco?.list) return undefined;
    let cancelled = false;
    api.eco
      .list({ per_page: 200 })
      .then(async (res) => {
        if (cancelled) return;
        const rows = Array.isArray(res) ? res : res?.items || [];
        if (!rows.length) return;
        // The real eco_approvals rows only ride on the ECO detail payload
        // (GET /eco/{id}.approvals), not the list — so who actually
        // approved what is read per ECO. An ECO whose detail fails stays
        // at unknown rather than getting a status-shaped guess.
        // ponytail: one detail request per ECO, swap for a bulk approvals
        // endpoint if this list ever gets long.
        const details = await Promise.all(
          rows.map((eco) =>
            api?.eco?.get ? api.eco.get(eco.id).catch(() => null) : null,
          ),
        );
        if (cancelled) return;
        const approvalsByEco = new Map();
        details.forEach((d, i) => {
          if (Array.isArray(d?.approvals))
            approvalsByEco.set(rows[i].id, d.approvals);
        });
        setEcrs((cur) => mergeBackendEcos(cur, rows, approvalsByEco));
      })
      .catch(() => {
        // Offline / backend unreachable — local-first data stands as-is.
      });
    return () => {
      cancelled = true;
    };
  }, []);
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

  // Re-reads the ECO's real eco_approvals rows after a state change rather
  // than assuming what the backend recorded. A failed read leaves the row
  // at unknown.
  const refreshApprovals = (ecoId) => {
    if (ecoId == null || !api?.eco?.get) return;
    api.eco
      .get(ecoId)
      .then((d) => {
        const approvals = Array.isArray(d?.approvals) ? d.approvals : null;
        setEcrs((cur) =>
          cur.map((e) => (e.ecoId === ecoId ? { ...e, approvals } : e)),
        );
      })
      .catch(() => {
        setEcrs((cur) =>
          cur.map((e) => (e.ecoId === ecoId ? { ...e, approvals: null } : e)),
        );
      });
  };

  const updateStatus = (id, action, opts = {}) => {
    const prevEcr = ecrs.find((e) => e.id === id);
    const next = ecrs.map((e) => {
      if (e.id !== id) return e;
      let status = e.status;
      if (action === "approve") {
        status = "Approved";
      } else if (action === "reject") {
        status = "Rejected";
      } else if (action === "implement") {
        status = "Implemented";
      } else if (action === "advance") {
        status =
          e.status === "Draft"
            ? "Review"
            : e.status === "Review"
              ? "Approved"
              : "Implemented";
      }
      // Approvals are never derived from status — they are the backend's
      // eco_approvals rows, refreshed below. A local-only row (no ecoId)
      // has no real approval record to read, so once its status moves it
      // drops to unknown instead of carrying a made-up grid.
      return { ...e, status, approvals: e.ecoId != null ? e.approvals : null };
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
    // approve/implement were already applied server-side by ESignDialog
    // before this ran — re-read the approval rows it actually recorded.
    if (ESIGN_ACTIONS.has(action)) refreshApprovals(prevEcr?.ecoId);
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
    // Reject isn't signature-gated (see ESIGN_ACTIONS above) but the
    // backend still needs to hear about it — perform_eco_action's "reject"
    // sends the ECO back to "draft" for rework rather than a dead-end
    // status, which is why the load-on-mount merge folds a still-"draft"
    // ECO back to "Draft" rather than "Rejected" once resynced. Same
    // best-effort/fire-and-forget contract as the submit sync above.
    if (
      action === "reject" &&
      prevEcr?.status === "Review" &&
      prevEcr.ecoId != null &&
      api?.eco?.action
    ) {
      api.eco
        .action(prevEcr.ecoId, { action: "reject" })
        .then(() => refreshApprovals(prevEcr.ecoId))
        .catch(() => {
        // Honest failure — local status still reflects the user's intent.
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
      onSelect: () => navigateTo("diff"),
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
          <ApprovalDots approvals={e.approvals} />
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
              {approvalList(detailEcr.approvals)?.length ? (
                approvalList(detailEcr.approvals).map((a) => (
                  <div
                    key={a.role}
                    className="flex items-center gap-6 rounded-r2"
                    style={{
                      padding: "6px 10px",
                      background:
                        a.value === "approved"
                          ? "color-mix(in oklch, var(--status-success) 10%, var(--bg-surface))"
                          : a.value === "rejected"
                            ? "color-mix(in oklch, var(--status-danger) 10%, var(--bg-surface))"
                            : "var(--bg-subtle)",
                      border:
                        "1px solid " +
                        (a.value === "approved"
                          ? "var(--status-success)"
                          : a.value === "rejected"
                            ? "var(--status-danger)"
                            : "var(--border-subtle)"),
                    }}
                  >
                    <ApprovalDot role={a.role} value={a.value} text={a.text} />
                    <div>
                      <div className="fs-10 fw-600 fs-9 fg-3">
                        {a.role.toUpperCase()}
                      </div>
                      <div>{a.value}</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="hint">
                  {approvalList(detailEcr.approvals)
                    ? __t("advanced.ecr.noApprovals") ||
                      "No approvals recorded for this ECO"
                    : __t("advanced.ecr.approvalsUnknown") ||
                      "Approvals unknown — couldn't read this ECO's approval records"}
                </div>
              )}
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
