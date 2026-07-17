import { storage } from "../../utils/storage.js";

import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import {
  DropdownButton,
  INR,
  Modal,
  escapeHtml,
  openPrintWindow,
  useAppStore,
} from "../../globals";
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
          init: "\u230C",
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
  };

  const updateStatus = (id, action) => {
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
    toast(id + " " + label, { kind: action === "reject" ? "warn" : "success" });
    notify("ECR " + label, id + " · " + (ecr?.title || ""));
  };

  return (
    <div className="screen-wrap">
      <div className="screen-header">
        <div>
          <h1>{__t("advanced.ecr.title") || "Engineering Change Requests"}</h1>
          <div className="sub">
            {ecrs.length} {__t("advanced.ecr.ecrs") || "ECRs"} ·{" "}
            {counts.Review || 0}{" "}
            {__t("advanced.ecr.awaitingReview") || "awaiting review"} ·{" "}
            {counts.Approved || 0} {__t("advanced.ecr.approved") || "approved"}
          </div>
        </div>
        <div className="flex gap-8">
          <button
            className="btn"
            onClick={() => {
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
            }}
          >
            <Icon.Export size={12} /> {__t("common.export") || "Export"}
          </button>
          <button
            className="btn primary"
            onClick={() => setShowForm(!showForm)}
          >
            <Icon.Plus size={12} /> {__t("advanced.ecr.newEcr") || "New ECR"}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="card mb-14" style={{ padding: 16 }}>
          <div className="fw-700 fs-13 mb-12">
            {__t("advanced.ecr.createNew") || "Create New ECR"}
          </div>
          <div
            className="d-grid gap-10 mb-12"
            style={{ gridTemplateColumns: "1fr 1fr 1fr" }}
          >
            <div>
              <label className="d-block font-mono fs-9 uppercase letter-sp-6 fg-3 mb-4">
                {__t("advanced.ecr.titleLabel") || "Title"}
              </label>
              <input
                id="ecr-form-title"
                name="ecrTitle"
                className="input w-100p fs-12"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder={
                  __t("advanced.ecr.titlePlaceholder") ||
                  "Describe the change\u2026"
                }
                style={{ height: 30 }}
              />
            </div>
            <div>
              <label className="d-block font-mono fs-9 uppercase letter-sp-6 fg-3 mb-4">
                {__t("advanced.ecr.projectLabel") || "Project"}
              </label>
              <select
                id="ecr-form-project"
                name="ecrProject"
                className="input w-100p fs-12"
                value={form.project}
                onChange={(e) => setForm({ ...form, project: e.target.value })}
                style={{ height: 30 }}
              >
                {["ATLAS", "ATLAS-LITE", "HORIZON", "All"].map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="d-block font-mono fs-9 uppercase letter-sp-6 fg-3 mb-4">
                {__t("advanced.ecr.impactLabel") || "Impact"}
              </label>
              <select
                id="ecr-form-impact"
                name="ecrImpact"
                className="input w-100p fs-12"
                value={form.impact}
                onChange={(e) => setForm({ ...form, impact: e.target.value })}
                style={{ height: 30 }}
              >
                {["low", "med", "high"].map((v) => (
                  <option key={v} value={v}>
                    {v.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div
            className="d-grid gap-10 mb-14"
            style={{ gridTemplateColumns: "1fr 1fr" }}
          >
            <div>
              <label className="d-block font-mono fs-9 uppercase letter-sp-6 fg-3 mb-4">
                {__t("advanced.ecr.costImpact") || "Cost Impact (₹)"}
              </label>
              <input
                id="ecr-form-cost"
                name="ecrCostImpact"
                type="number"
                className="input w-100p fs-12"
                value={form.cost_impact}
                onChange={(e) =>
                  setForm({ ...form, cost_impact: e.target.value })
                }
                style={{ height: 30 }}
              />
            </div>
            <div>
              <label className="d-block font-mono fs-9 uppercase letter-sp-6 fg-3 mb-4">
                {__t("advanced.ecr.itemsAffected") || "Items Affected"}
              </label>
              <input
                id="ecr-form-items"
                name="ecrItemsAffected"
                type="number"
                className="input w-100p fs-12"
                value={form.items_affected}
                onChange={(e) =>
                  setForm({ ...form, items_affected: e.target.value })
                }
                style={{ height: 30 }}
              />
            </div>
          </div>
          <div className="flex gap-8 justify-end">
            <button className="btn" onClick={() => setShowForm(false)}>
              {__t("common.cancel") || "Cancel"}
            </button>
            <button
              className="btn primary"
              onClick={addEcr}
              disabled={!form.title.trim()}
              style={{ opacity: form.title.trim() ? 1 : 0.5 }}
            >
              <Icon.Plus size={12} />{" "}
              {__t("advanced.ecr.createEcr") || "Create ECR"}
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-6 mb-14" style={{ flexWrap: "wrap" }}>
        {["All", "Draft", "Review", "Approved", "Implemented", "Rejected"].map(
          (s) => (
            <span
              key={s}
              className={(
                "chip " +
                (s === filter ? "active" : "") +
                " cursor-pointer"
              ).trim()}
              onClick={() => setFilter(s)}
            >
              {s}{" "}
              <span className="fg-4 ml-4">
                {s === "All" ? ecrs.length : counts[s] || 0}
              </span>
            </span>
          ),
        )}
      </div>

      <div className="card overflow-vis">
        <table className="bom-table table-auto">
          <thead>
            <tr>
              <th className="pl-16">{__t("advanced.ecr.ecrId") || "ECR ID"}</th>
              <th>{__t("advanced.ecr.titleCol") || "Title"}</th>
              <th>{__t("advanced.ecr.projectCol") || "Project"}</th>
              <th>{__t("advanced.ecr.impactCol") || "Impact"}</th>
              <th>{__t("advanced.ecr.itemsCol") || "Items"}</th>
              <th className="num">
                {__t("advanced.ecr.costDelta") || "Cost Δ"}
              </th>
              <th>{__t("advanced.ecr.approvalsCol") || "Approvals"}</th>
              <th>{__t("advanced.ecr.statusCol") || "Status"}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr
                key={e.id}
                onClick={() => setDetailEcr(e)}
                className="cursor-pointer"
              >
                <td className="mono pl-16 fw-600">{e.id}</td>
                <td>
                  <div className="fw-500">{e.title}</div>
                  <div className="font-mono fs-10 fg-3">
                    {e.requester} · {e.date}
                  </div>
                </td>
                <td className="mono">{e.project}</td>
                <td>
                  <span
                    className={"tag-pill"}
                    style={{
                      borderColor:
                        e.impact === "high"
                          ? "var(--danger)"
                          : e.impact === "med"
                            ? "var(--warn)"
                            : "var(--fg-3)",
                      color:
                        e.impact === "high"
                          ? "var(--danger)"
                          : e.impact === "med"
                            ? "var(--warn)"
                            : "var(--fg-3)",
                    }}
                  >
                    {e.impact.toUpperCase()}
                  </span>
                </td>
                <td className="mono num">{e.items_affected}</td>
                <td
                  className="num mono fw-600"
                  style={{
                    color:
                      e.cost_impact > 0
                        ? "var(--danger)"
                        : e.cost_impact < 0
                          ? "var(--ok)"
                          : "var(--fg-3)",
                  }}
                >
                  {e.cost_impact > 0 ? "+" : ""}
                  {INR(e.cost_impact, 0)}
                </td>
                <td>
                  <div className="inline-flex" style={{ gap: 3 }}>
                    {Object.entries(e.approvals).map(([k, v]) => (
                      <span
                        key={k}
                        title={k.toUpperCase() + ": " + v}
                        className="w-18 h-18 inline-flex items-center justify-center font-mono fs-9 fw-700"
                        style={{
                          borderRadius: 99,
                          background:
                            v === "approved"
                              ? "var(--ok)"
                              : v === "rejected"
                                ? "var(--danger)"
                                : "var(--bg-sunk)",
                          color: "white",
                          border:
                            v === "pending" ? "1px solid var(--fg-3)" : "none",
                        }}
                      >
                        {k[0].toUpperCase()}
                      </span>
                    ))}
                  </div>
                </td>
                <td>
                  <span
                    className={
                      "status " +
                      (e.status === "Approved" || e.status === "Implemented"
                        ? "released"
                        : e.status === "Review"
                          ? "review"
                          : e.status === "Rejected"
                            ? "deprecated"
                            : "draft")
                    }
                  >
                    {e.status}
                  </span>
                </td>
                <td onClick={(ev) => ev.stopPropagation()}>
                  <DropdownButton
                    width={200}
                    trigger={
                      <button
                        className="icon-btn w-22 h-22"
                        aria-label={
                          __t("advanced.ecr.moreOptions") || "More options"
                        }
                      >
                        <Icon.Dots size={11} />
                      </button>
                    }
                    items={[
                      ...(e.status === "Draft"
                        ? [
                            {
                              icon: <Icon.Check size={11} />,
                              label:
                                __t("advanced.ecr.submitForReview") ||
                                "Submit for review",
                              onClick: () => updateStatus(e.id, "advance"),
                            },
                          ]
                        : []),
                      ...(e.status === "Review"
                        ? [
                            {
                              icon: <Icon.Check size={11} />,
                              label: __t("common.approve") || "Approve",
                              onClick: () => updateStatus(e.id, "approve"),
                            },
                            {
                              icon: <Icon.X size={11} />,
                              label: __t("common.reject") || "Reject",
                              onClick: () => updateStatus(e.id, "reject"),
                            },
                          ]
                        : []),
                      ...(e.status === "Approved"
                        ? [
                            {
                              icon: <Icon.Check size={11} />,
                              label:
                                __t("advanced.ecr.markImplemented") ||
                                "Mark implemented",
                              onClick: () => updateStatus(e.id, "implement"),
                            },
                          ]
                        : []),
                      {
                        icon: <Icon.Diff size={11} />,
                        label: __t("advanced.ecr.viewDiff") || "View diff",
                        onClick: () => window.__nav?.("diff"),
                      },
                      {
                        icon: <Icon.Doc size={11} />,
                        label: __t("advanced.ecr.printEcr") || "Print ECR",
                        onClick: () => {
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
                            {
                              features: "width=700,height=500",
                              printDelay: 300,
                            },
                          );
                        },
                      },
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
          wide
          footer={
            <>
              <button className="btn" onClick={() => setDetailEcr(null)}>
                {__t("common.close") || "Close"}
              </button>
              {detailEcr.status === "Draft" && (
                <button
                  className="btn primary"
                  onClick={() => {
                    updateStatus(detailEcr.id, "advance");
                    setDetailEcr(null);
                  }}
                >
                  <Icon.Check size={12} />{" "}
                  {__t("advanced.ecr.submitForReview") || "Submit for Review"}
                </button>
              )}
              {detailEcr.status === "Review" && (
                <>
                  <button
                    className="btn fg-danger"
                    onClick={() => {
                      updateStatus(detailEcr.id, "reject");
                      setDetailEcr(null);
                    }}
                  >
                    <Icon.X size={12} /> {__t("common.reject") || "Reject"}
                  </button>
                  <button
                    className="btn primary"
                    onClick={() => {
                      updateStatus(detailEcr.id, "approve");
                      setDetailEcr(null);
                    }}
                  >
                    <Icon.Check size={12} />{" "}
                    {__t("common.approve") || "Approve"}
                  </button>
                </>
              )}
              {detailEcr.status === "Approved" && (
                <button
                  className="btn primary"
                  onClick={() => {
                    updateStatus(detailEcr.id, "implement");
                    setDetailEcr(null);
                  }}
                >
                  <Icon.Check size={12} />{" "}
                  {__t("advanced.ecr.markImplemented") || "Mark Implemented"}
                </button>
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
              <div>{__t("advanced.ecr.impactCol") || "Impact"}</div>
              <span
                className="tag-pill fs-9 uppercase fg-3 font-mono mb-4"
                style={{
                  borderColor:
                    detailEcr.impact === "high"
                      ? "var(--danger)"
                      : detailEcr.impact === "med"
                        ? "var(--warn)"
                        : "var(--fg-3)",
                  color:
                    detailEcr.impact === "high"
                      ? "var(--danger)"
                      : detailEcr.impact === "med"
                        ? "var(--warn)"
                        : "var(--fg-3)",
                }}
              >
                {detailEcr.impact.toUpperCase()}
              </span>
            </div>
            <div>
              <div className="fs-9 uppercase fg-3 font-mono mb-4 fw-600">
                {__t("advanced.ecr.costImpact") || "Cost Impact"}
              </div>
              <div
                style={{
                  color:
                    detailEcr.cost_impact > 0
                      ? "var(--danger)"
                      : detailEcr.cost_impact < 0
                        ? "var(--ok)"
                        : "var(--fg)",
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
              <div>{__t("advanced.ecr.statusCol") || "Status"}</div>
              <span
                className={(
                  "status " +
                  (detailEcr.status === "Approved" ||
                  detailEcr.status === "Implemented"
                    ? "released"
                    : detailEcr.status === "Review"
                      ? "review"
                      : detailEcr.status === "Rejected"
                        ? "deprecated"
                        : "draft") +
                  " fs-9 uppercase fg-3 font-mono mb-4"
                ).trim()}
              >
                {detailEcr.status}
              </span>
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
                        ? "color-mix(in oklch, var(--ok) 10%, var(--bg))"
                        : v === "rejected"
                          ? "color-mix(in oklch, var(--danger) 10%, var(--bg))"
                          : "var(--bg-sunk)",
                    border:
                      "1px solid " +
                      (v === "approved"
                        ? "var(--ok)"
                        : v === "rejected"
                          ? "var(--danger)"
                          : "var(--line)"),
                  }}
                >
                  <span
                    className="w-20 h-20 inline-flex items-center justify-center font-mono fs-9 fw-700"
                    style={{
                      borderRadius: 99,
                      background:
                        v === "approved"
                          ? "var(--ok)"
                          : v === "rejected"
                            ? "var(--danger)"
                            : "var(--fg-3)",
                      color: "white",
                    }}
                  >
                    {k[0].toUpperCase()}
                  </span>
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
    </div>
  );
}

export { ECRScreen };
export default ECRScreen;
