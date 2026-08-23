import PropTypes from "prop-types";
import { api } from "../../api.js";
import { navigateTo } from "../services/navigation.js";
import { downloadBlob } from "../utils/download.js";
import { useCollab, PresenceAvatar } from "./collaboration.jsx";
import { storage } from "../utils/storage.js";
import { screenData } from "../services/screenDataBridge.js";
import { __t } from "../i18n";
import { toast } from "../utils/toast";
import {
  ScreenHeader,
  Button,
  Field,
  Input,
  Select,
  Textarea,
  Checkbox,
  Card,
  DataTable,
  StatusPill,
  Badge,
  Menu,
  EmptyState,
  Modal,
} from "../components/ui";

function woStatusTone(status) {
  if (status === "Complete") return "success";
  if (status === "In Progress") return "warning";
  if (status === "Released") return "info";
  return "neutral";
}

function ncrStatusTone(status) {
  if (status === "Resolved") return "success";
  if (status === "In review") return "warning";
  return "danger";
}

function ncrSeverityTone(severity) {
  if (severity === "Critical") return "danger";
  if (severity === "Major") return "warning";
  return "neutral";
}

function CommandPalette({ open, onClose }) {
  const ctx = useAppStore();
  const [q, setQ] = React.useState("");
  const [idx, setIdx] = React.useState(0);
  React.useEffect(() => {
    if (open) {
      setQ("");
      setIdx(0);
    }
  }, [open]);
  const isCmd = q.startsWith(">");
  const commands = [
    {
      c: "> new po",
      label: __t("power.cmd.newPo") || "New purchase order",
      run: () => ctx?.openModal("new-po"),
    },
    {
      c: "> new vendor",
      label: __t("power.cmd.newVendor") || "Add a vendor",
      run: () => ctx?.openModal("new-vendor"),
    },
    {
      c: "> new part",
      label: __t("power.cmd.newPart") || "Add a component",
      run: () => ctx?.openModal("new-part"),
    },
    {
      c: "> new ecr",
      label: __t("power.cmd.newEcr") || "Create change request",
      run: () => {
        navigateTo("ecr");
        toast(__t("power.cmd.clickNewEcr") || "Click 'New ECR' to start");
      },
    },
    {
      c: "> import csv",
      label: __t("power.cmd.importCsv") || "Bulk import parts from CSV",
      run: () => ctx?.openModal("bulk-import"),
    },
    {
      c: "> scan",
      label: __t("power.cmd.scan") || "Open barcode scanner",
      run: () => ctx?.openModal("barcode-scan"),
    },
    {
      c: "> release",
      label: __t("power.cmd.release") || "Release current BOM revision",
      run: () => ctx?.openModal("release"),
    },
    {
      c: "> compare",
      label: __t("power.cmd.compare") || "Compare BOM revisions",
      run: () => navigateTo("diff"),
    },
    {
      c: "> dashboard",
      label: __t("power.cmd.dashboard") || "Go to Dashboard",
      run: () => navigateTo("dashboard"),
    },
    {
      c: "> ai",
      label: __t("power.cmd.ai") || "Open AI Copilot",
      run: () => window.dispatchEvent(new CustomEvent("open-ai")),
    },
    {
      c: "> sim",
      label: __t("power.cmd.sim") || "Open cost simulator",
      run: () => ctx?.openModal("cost-sim"),
    },
    {
      c: "> approvals",
      label: __t("power.cmd.approvals") || "Open approvals inbox",
      run: () => navigateTo("approvals"),
    },
    {
      c: "> calendar",
      label: __t("power.cmd.calendar") || "Open calendar & timeline",
      run: () => navigateTo("calendar"),
    },
    {
      c: "> compliance",
      label: __t("power.cmd.compliance") || "Open compliance tracker",
      run: () => navigateTo("compliance"),
    },
    {
      c: "> inventory",
      label: __t("power.cmd.inventory") || "Open inventory",
      run: () => navigateTo("inventory"),
    },
  ];
  const results = React.useMemo(() => {
    if (!q.trim()) return commands.slice(0, 8);
    if (isCmd) {
      const ql = q.slice(1).trim().toLowerCase();
      return commands
        .filter(
          (c) =>
            c.c.toLowerCase().includes(ql) ||
            c.label.toLowerCase().includes(ql),
        )
        .slice(0, 10);
    }
    const ql = q.toLowerCase();
    return commands
      .filter((c) => c.label.toLowerCase().includes(ql))
      .slice(0, 6);
  }, [q]);
  const pick = (r) => {
    onClose();
    r.run();
  };
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setIdx((i) => Math.min(results.length - 1, i + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setIdx((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter" && results[idx]) {
        e.preventDefault();
        pick(results[idx]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, results, idx, onClose]);
  if (!open) return null;
  const listboxId = "cmd-palette-listbox";
  const activeId = results[idx] ? "cmd-palette-item-" + idx : undefined;
  return (
    <div
      className="modal-backdrop items-start"
      onClick={onClose}
      style={{ paddingTop: "14vh" }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={__t("power.cmdPaletteTitle") || "Command palette"}
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(620px, calc(100vw - 40px))" }}
      >
        <div
          className="flex items-center gap-10 border-bottom"
          style={{ padding: "14px 16px" }}
        >
          <span className="font-mono fg-accent" aria-hidden="true">
            {isCmd ? "$" : "›"}
          </span>
          <input
            id="cmd-palette"
            name="commandSearch"
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={activeId}
            aria-label={
              __t("power.cmdPalettePlaceholder") ||
              "Type a command (> for actions) or search…"
            }
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setIdx(0);
            }}
            placeholder={
              __t("power.cmdPalettePlaceholder") ||
              "Type a command (> for actions) or search\u2026"
            }
            className="flex-1 bg-transparent b-0 fs-14 fg font-mono"
            style={{ outline: "none" }}
          />
          <span className="kbd font-mono fs-10" aria-hidden="true">
            ESC
          </span>
        </div>
        <div
          className="oy-auto"
          style={{ maxHeight: 380 }}
          id={listboxId}
          role="listbox"
          aria-label={__t("power.cmdPaletteResults") || "Command results"}
        >
          {results.map((r, i) => (
            <button
              key={r.label + "-" + r.c}
              id={"cmd-palette-item-" + i}
              role="option"
              aria-selected={i === idx}
              type="button"
              className="popover-item"
              style={{
                padding: "10px 14px",
                background: i === idx ? "var(--bg-sunk)" : undefined,
              }}
              onMouseEnter={() => setIdx(i)}
              onClick={() => pick(r)}
            >
              <span
                className="font-mono fs-10 fg-accent"
                style={{ minWidth: 110 }}
              >
                {r.c}
              </span>
              <span className="lbl">{r.label}</span>
              <span className="font-mono fs-9 fg-4" aria-hidden="true">
                ↵
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
CommandPalette.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
};
export const UNDO = {
  stack: [],
  push(action) {
    this.stack.push(action);
    if (this.stack.length > 50) this.stack.shift();
  },
  pop() {
    return this.stack.pop();
  },
  size() {
    return this.stack.length;
  },
};
window.UNDO = UNDO;
export function recordUndo(description, undoFn) {
  UNDO.push({ description, undoFn, at: Date.now() });
}
window.recordUndo = recordUndo;
export function runUndo() {
  const action = UNDO.pop();
  if (!action) {
    toast(__t("power.nothingToUndo") || "Nothing to undo");
    return;
  }
  try {
    action.undoFn();
    toast(__t("power.undone") || "Undone: " + action.description, {
      kind: "success",
    });
  } catch (e) {
    toast(__t("power.couldNotUndo") || "Couldn't undo: " + e.message, {
      kind: "error",
    });
  }
}
window.runUndo = runUndo;
function WorkOrdersScreen() {
  const [orders, setOrders] = React.useState([]);
  React.useEffect(() => {
    // Fix: was substituting 5 hardcoded DEFAULT_ORDERS whenever the real list
    // came back empty or errored, presenting fake work orders as real data.
    // Now shows the real list, or the honest EmptyState via DataTable below.
    screenData.workOrders
      .list()
      .then((data) => setOrders(data || []))
      .catch(() => setOrders([]));
  }, []);
  const [showForm, setShowForm] = React.useState(false);
  const [newWo, setNewWo] = React.useState({
    bom: "ATLAS Mainframe v3.2.0",
    qty: 10,
    scheduled: "",
  });
  const counts = orders.reduce((a, o) => {
    a[o.status] = (a[o.status] || 0) + 1;
    return a;
  }, {});

  const woColumns = [
    {
      key: "id",
      header: __t("power.workOrders.woId") || "WO ID",
      render: (o) => <span className="mono fw-600">{o.id}</span>,
    },
    { key: "bom", header: __t("power.workOrders.bomCol") || "BOM" },
    {
      key: "qty",
      header: __t("part.quantity") || "Qty",
      align: "num",
      render: (o) => <span className="mono">{o.qty}</span>,
    },
    {
      key: "scheduled",
      header: __t("power.workOrders.scheduledCol") || "Scheduled",
      render: (o) => <span className="mono">{o.scheduled}</span>,
    },
    {
      key: "progress",
      header: __t("power.workOrders.progress") || "Progress",
      render: (o) => (
        <div className="flex items-center gap-8" style={{ minWidth: 140 }}>
          <div
            className="flex-1 bg-sunk overflow-h"
            style={{ height: 6, borderRadius: 3 }}
          >
            <div
              className="h-100p bg-accent"
              style={{ width: (o.built / o.qty) * 100 + "%" }}
            />
          </div>
          <span className="font-mono fs-10 fg-3">
            {o.built}/{o.qty}
          </span>
        </div>
      ),
    },
    {
      key: "yield",
      header: __t("power.workOrders.yieldCol") || "Yield",
      render: (o) => {
        const yield_ = o.built > 0 ? (o.good / o.built) * 100 : 0;
        return (
          <span
            className="mono"
            style={{
              color:
                yield_ >= 95
                  ? "var(--ok)"
                  : yield_ >= 85
                    ? "var(--warn)"
                    : yield_ > 0
                      ? "var(--danger)"
                      : "var(--fg-3)",
            }}
          >
            {o.built > 0 ? yield_.toFixed(1) + "%" : "\u2014"}
          </span>
        );
      },
    },
    {
      key: "status",
      header: __t("part.status") || "Status",
      render: (o) => <StatusPill status={o.status} tone={woStatusTone(o.status)} />,
    },
    {
      key: "actions",
      header: "",
      render: (o) => (
        <Menu
          ariaLabel={__t("common.moreOptions") || "More options"}
          trigger={
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              aria-label={__t("common.moreOptions") || "More options"}
            >
              <Icon.Dots size={11} />
            </Button>
          }
          items={[
            {
              icon: <Icon.Plus size={11} />,
              label: __t("power.workOrders.reportBuild") || "Report build",
              onSelect: () => {
                const updated = { ...o, built: o.built + 1, good: o.good + 1 };
                const next = orders.map((x) => (x.id === o.id ? updated : x));
                setOrders(next);
                // Fix: was local-state-only (never hit the server) while
                // toasting success; now saves via the real workOrders.update
                // wrapper. The success toast waits for that save to resolve \u2014
                // screenDataBridge toasts its own error on failure, so firing
                // "Build reported" up-front claimed a save that had not
                // happened (and could contradict the error toast next to it).
                screenData.workOrders
                  .update(o.id, updated)
                  .then(() =>
                    toast(
                      __t("power.workOrders.buildReported") ||
                        "Build reported \u00B7 1 good unit",
                    ),
                  )
                  .catch(() => {});
              },
            },
            {
              icon: <Icon.Flag size={11} />,
              label: __t("power.workOrders.reportDefect") || "Report defect",
              onSelect: () => {
                const updated = { ...o, built: o.built + 1, defect: o.defect + 1 };
                const next = orders.map((x) => (x.id === o.id ? updated : x));
                setOrders(next);
                // Fix: same local-state-only issue as "Report build" above \u2014
                // now saves via the real workOrders.update wrapper, and the
                // toast waits for that save instead of firing regardless.
                screenData.workOrders
                  .update(o.id, updated)
                  .then(() =>
                    toast(
                      // "\u00B7 NCR drafted" removed from this message: nothing
                      // here creates an NCR \u2014 the count is all that changes.
                      __t("power.workOrders.defectReported") ||
                        "Defect reported \u00B7 1 defective unit",
                      { kind: "warn" },
                    ),
                  )
                  .catch(() => {});
              },
            },
            {
              icon: <Icon.Doc size={11} />,
              label:
                __t("power.workOrders.printRoutingCard") ||
                "Print routing card",
              onSelect: () => {
                const h = escapeHtml;
                openPrintWindow(
                  "Routing Card",
                  "<html><head><title>Routing - " +
                    h(o.id) +
                    "</title><style>body{font-family:monospace;padding:30px}</style></head><body><h1>" +
                    h(o.id) +
                    "</h1><p>BOM: " +
                    h(o.bom) +
                    "</p><p>Qty: " +
                    h(o.qty) +
                    " | Scheduled: " +
                    h(o.scheduled) +
                    "</p><p>Status: " +
                    h(o.status) +
                    "</p></body></html>",
                  {
                    features: "width=600,height=400",
                    printDelay: 300,
                  },
                );
              },
            },
          ]}
        />
      ),
    },
  ];

  return (
    <div className="screen-wrap">
      <ScreenHeader
        title={__t("power.workOrders.title") || "Work Orders"}
        description={
          orders.length +
          " " +
          (__t("power.workOrders.orders") || "orders") +
          " \u00B7 " +
          orders.reduce((s, o) => s + o.qty, 0) +
          " " +
          (__t("power.workOrders.unitsScheduled") || "units scheduled")
        }
        actions={
          <div className="flex gap-8">
            {/* Fix: this button exported nothing — it only toasted "Work
                order schedule exported". Now it actually writes the CSV via
                the existing downloadBlob helper (same thing the NCR export
                below does) before claiming success. */}
            <Button
              variant="secondary"
              onClick={() => {
                const esc = (v) =>
                  `"${String(v ?? "").replace(/"/g, '""')}"`;
                const csv = [
                  "id,bom,qty,scheduled,status,built,good,defect",
                  ...orders.map((o) =>
                    [
                      o.id,
                      o.bom,
                      o.qty,
                      o.scheduled,
                      o.status,
                      o.built,
                      o.good,
                      o.defect,
                    ]
                      .map(esc)
                      .join(","),
                  ),
                ].join("\n");
                downloadBlob(csv, "work_orders.csv", "text/csv");
                toast(
                  __t("power.workOrders.scheduleExported") ||
                    "Work order schedule exported",
                  { kind: "success" },
                );
              }}
            >
              <Icon.Export size={12} />{" "}
              {__t("power.workOrders.exportSchedule") || "Export schedule"}
            </Button>
            <Button variant="primary" onClick={() => setShowForm(!showForm)}>
              <Icon.Plus size={12} />{" "}
              {__t("power.workOrders.newWorkOrder") || "New work order"}
            </Button>
          </div>
        }
      />
      {showForm && (
        <Card
          className="mb-12"
          title={__t("power.workOrders.createWorkOrder") || "Create Work Order"}
          footer={
            <div className="flex gap-8 justify-end">
              <Button variant="secondary" onClick={() => setShowForm(false)}>
                {__t("common.cancel") || "Cancel"}
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  if (!newWo.scheduled) {
                    toast(
                      __t("power.workOrders.scheduleDateRequired") ||
                        "Schedule date required",
                      { kind: "warn" },
                    );
                    return;
                  }
                  const id =
                    "WO-2026-" + String(43 + orders.length).padStart(4, "0");
                  const entry = {
                    id,
                    bom: newWo.bom,
                    qty: newWo.qty,
                    scheduled: newWo.scheduled,
                    status: "Draft",
                    built: 0,
                    good: 0,
                    defect: 0,
                  };
                  setOrders([entry, ...orders]);
                  setShowForm(false);
                  // Fix: "Create Work Order" was local-state-only; now saves
                  // via the real workOrders.create wrapper, and only claims
                  // "created" once that save resolves.
                  screenData.workOrders
                    .create(entry)
                    .then(() =>
                      toast(
                        id +
                          " " +
                          (__t("power.workOrders.created") || "created"),
                        { kind: "success" },
                      ),
                    )
                    .catch(() => {});
                }}
              >
                {__t("power.workOrders.create") || "Create"}
              </Button>
            </div>
          }
        >
          <div className="field-row-3">
            <Field label={__t("power.workOrders.bomLabel") || "BOM"}>
              <Select
                value={newWo.bom}
                onChange={(e) => setNewWo({ ...newWo, bom: e.target.value })}
              >
                <option>ATLAS Mainframe v3.2.0</option>
                <option>HORIZON Sensor Pod v1.4.0</option>
                <option>ATLAS-LITE Eval v1.0.0</option>
              </Select>
            </Field>
            <Field label={__t("power.workOrders.quantityLabel") || "Quantity"}>
              <Input
                type="number"
                value={newWo.qty}
                onChange={(e) => setNewWo({ ...newWo, qty: +e.target.value })}
              />
            </Field>
            <Field
              label={
                __t("power.workOrders.scheduledDateLabel") || "Scheduled Date"
              }
            >
              <Input
                type="date"
                value={newWo.scheduled}
                onChange={(e) =>
                  setNewWo({ ...newWo, scheduled: e.target.value })
                }
              />
            </Field>
          </div>
        </Card>
      )}
      <div
        className="kpi-grid"
        style={{ gridTemplateColumns: "repeat(4, 1fr)" }}
      >
        {[
          {
            l: __t("power.workOrders.inProgress") || "In progress",
            v: counts["In Progress"] || 0,
            c: "var(--accent-text)",
          },
          {
            l: __t("power.workOrders.released") || "Released",
            v: counts["Released"] || 0,
            c: "var(--info)",
          },
          {
            l: __t("power.workOrders.complete") || "Complete",
            v: counts["Complete"] || 0,
            c: "var(--ok)",
          },
          {
            l: __t("power.workOrders.yield") || "Yield (this month)",
            v:
              (
                (orders
                  .filter((o) => o.built > 0)
                  .reduce((s, o) => s + o.good / o.built, 0) /
                  Math.max(1, orders.filter((o) => o.built > 0).length)) *
                100
              ).toFixed(1) + "%",
            c: "var(--ok)",
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
      <DataTable
        dense
        ariaLabel={__t("power.workOrders.title") || "Work Orders"}
        columns={woColumns}
        rows={orders}
        empty={
          <EmptyState
            title={__t("power.workOrders.noOrders") || "No work orders"}
            message={
              __t("power.workOrders.noOrdersMsg") ||
              "Create a work order to get started."
            }
          />
        }
      />
    </div>
  );
}
function NCRScreen() {
  const ctx = useAppStore();
  // Fix: was seeding 4 hardcoded fake NCRs. Now loads the real list via the
  // existing screenData.quality.ncr wrapper, falling back to an honest empty
  // state (DataTable `empty` prop below) instead of invented records.
  const [ncrs, setNcrs] = React.useState([]);
  React.useEffect(() => {
    screenData.quality.ncr
      .list()
      .then((data) => setNcrs(data || []))
      .catch(() => setNcrs([]));
  }, []);
  const [showForm, setShowForm] = React.useState(false);
  const [newNcr, setNewNcr] = React.useState({
    pn: "",
    defect: "",
    severity: "Minor",
    action: "Rework",
  });
  const critCount = ncrs.filter((n) => n.severity === "Critical").length;
  const majorCount = ncrs.filter((n) => n.severity === "Major").length;
  const minorCount = ncrs.filter((n) => n.severity === "Minor").length;
  const createNcr = () => {
    if (!newNcr.pn || !newNcr.defect) {
      toast(
        __t("power.ncr.pnAndDefectRequired") ||
          "Part number and defect description required",
        { kind: "warn" },
      );
      return;
    }
    const id = "NCR-2026-" + String(ncrs.length + 19).padStart(4, "0");
    const entry = {
      id,
      pn: newNcr.pn,
      // Fix: was fabricating a WO reference ("WO-2026-" + a counter) with no
      // link to any real work order — the form never collects one. Left
      // unset rather than inventing an ID that would point at nothing.
      wo: "",
      defect: newNcr.defect,
      severity: newNcr.severity,
      action: newNcr.action,
      status: "Open",
      reporter: ctx?.user?.name || "Current User",
      date: new Date().toISOString().slice(0, 10),
    };
    setNcrs([entry, ...ncrs]);
    // Fix: createNcr() only called setNcrs() (local React state) while
    // toasting success — never reached the server. Now saves via the real
    // screenData.quality.ncr.create wrapper (it already toasts on failure),
    // and the success toast waits for that save instead of firing regardless.
    screenData.quality.ncr
      .create(entry)
      .then(() =>
        toast(
          id +
            " " +
            (__t("power.ncr.createdFor") || "created for") +
            " " +
            entry.pn,
          { kind: "success" },
        ),
      )
      .catch(() => {});
    setNewNcr({ pn: "", defect: "", severity: "Minor", action: "Rework" });
    setShowForm(false);
    if (ctx?.setNotifications) {
      ctx.setNotifications([
        {
          id: Date.now(),
          who: "System",
          init: "\u230C",
          color: "sys",
          action: __t("power.ncr.newNcrCreated") || "New NCR created",
          obj: id + " \u00B7 " + entry.pn,
          time: "just now",
          read: false,
          route: "ncr",
        },
        ...(ctx.notifications || []),
      ]);
    }
  };
  const ncrColumns = [
    {
      key: "id",
      header: __t("power.ncr.ncrId") || "NCR ID",
      render: (n) => <span className="mono fw-600">{n.id}</span>,
    },
    {
      key: "pn",
      header: __t("part.partNumber") || "Part",
      render: (n) => <span className="mono">{n.pn}</span>,
    },
    {
      key: "wo",
      header: __t("power.ncr.workOrder") || "Work Order",
      render: (n) => <span className="mono fg-3">{n.wo}</span>,
    },
    {
      key: "defect",
      header: __t("power.ncr.defect") || "Defect",
      render: (n) => (
        <>
          {n.defect}
          <div className="font-mono fs-10 fg-3">
            {n.reporter} \u00B7 {n.date}
          </div>
        </>
      ),
    },
    {
      key: "severity",
      header: __t("power.ncr.severity") || "Severity",
      render: (n) => (
        <Badge tone={ncrSeverityTone(n.severity)}>
          {n.severity.toUpperCase()}
        </Badge>
      ),
    },
    { key: "action", header: __t("power.ncr.action") || "Action" },
    {
      key: "status",
      header: __t("part.status") || "Status",
      render: (n) => (
        <StatusPill status={n.status} tone={ncrStatusTone(n.status)} />
      ),
    },
  ];

  return (
    <div className="screen-wrap">
      <ScreenHeader
        title={__t("power.ncr.title") || "Non-Conformance Reports"}
        description={
          ncrs.length +
          " " +
          (__t("power.ncr.reports") || "reports") +
          " \u00B7 " +
          critCount +
          " " +
          (__t("power.ncr.critical") || "critical") +
          " \u00B7 " +
          majorCount +
          " " +
          (__t("power.ncr.major") || "major") +
          " \u00B7 " +
          minorCount +
          " " +
          (__t("power.ncr.minor") || "minor")
        }
        actions={
          <div className="flex gap-8">
            <Button
              variant="secondary"
              onClick={() => {
                const csv = ncrs
                  .map(
                    (n) =>
                      `${n.id},${n.pn},${n.defect},${n.severity},${n.status},${n.date}`,
                  )
                  .join("\n");
                const b = new Blob([csv], { type: "text/csv" });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(b);
                a.download = "ncr_log.csv";
                a.click();
                toast(__t("power.ncr.exported") || "NCR log exported", {
                  kind: "success",
                });
              }}
            >
              <Icon.Export size={12} /> {__t("common.export") || "Export"}
            </Button>
            <Button variant="primary" onClick={() => setShowForm(!showForm)}>
              <Icon.Plus size={12} /> {__t("power.ncr.newNcr") || "New NCR"}
            </Button>
          </div>
        }
      />
      {showForm && (
        <Card
          className="mb-12"
          title={__t("power.ncr.createNewNcr") || "Create New NCR"}
          footer={
            <div className="flex gap-8 justify-end">
              <Button variant="secondary" onClick={() => setShowForm(false)}>
                {__t("common.cancel") || "Cancel"}
              </Button>
              <Button variant="primary" onClick={createNcr}>
                {__t("power.ncr.createNcr") || "Create NCR"}
              </Button>
            </div>
          }
        >
          <div className="field-row">
            <Field
              label={__t("power.ncr.partNumber") || "Part Number"}
              required
            >
              <Input
                value={newNcr.pn}
                onChange={(e) => setNewNcr({ ...newNcr, pn: e.target.value })}
                placeholder="e.g. EL-PSU-240W"
              />
            </Field>
            <Field label={__t("power.ncr.severity") || "Severity"}>
              <Select
                value={newNcr.severity}
                onChange={(e) =>
                  setNewNcr({ ...newNcr, severity: e.target.value })
                }
              >
                <option>Critical</option>
                <option>Major</option>
                <option>Minor</option>
              </Select>
            </Field>
          </div>
          <Field
            label={__t("power.ncr.defectDescription") || "Defect Description"}
            required
          >
            <Textarea
              value={newNcr.defect}
              onChange={(e) =>
                setNewNcr({ ...newNcr, defect: e.target.value })
              }
              placeholder={
                __t("power.ncr.describeNonConformance") ||
                "Describe the non-conformance..."
              }
              style={{ minHeight: 60 }}
            />
          </Field>
          <div className="field-row">
            <Field label={__t("power.ncr.disposition") || "Disposition"}>
              <Select
                value={newNcr.action}
                onChange={(e) =>
                  setNewNcr({ ...newNcr, action: e.target.value })
                }
              >
                <option>{__t("power.ncr.rework") || "Rework"}</option>
                <option>
                  {__t("power.ncr.returnToVendor") || "Return to vendor"}
                </option>
                <option>
                  {__t("power.ncr.returnPlusRma") || "Return + RMA"}
                </option>
                <option>
                  {__t("power.ncr.useAsIs") || "Use as-is (waiver)"}
                </option>
                <option>{__t("power.ncr.scrap") || "Scrap"}</option>
              </Select>
            </Field>
          </div>
        </Card>
      )}
      <DataTable
        dense
        ariaLabel={
          __t("power.ncr.title") || "Non-conformance reports"
        }
        columns={ncrColumns}
        rows={ncrs}
        onRowClick={(n) =>
          toast(n.id + ": " + n.defect + " [" + n.severity + "]", {
            kind: "warn",
            action: {
              label: __t("power.ncr.viewWorkOrder") || "View work order",
              onClick: () => {
                navigateTo("work-orders");
              },
            },
          })
        }
        empty={
          <EmptyState
            title={
              __t("power.ncr.noNcrs") || "No non-conformance reports"
            }
            message={
              __t("power.ncr.noNcrsMsg") ||
              "Report a non-conformance to get started."
            }
          />
        }
      />
    </div>
  );
}
function LandedCostModal({ open, onClose, part }) {
  if (!open) return null;
  const [unit, setUnit] = React.useState(part?.cost || 84);
  const [qty, setQty] = React.useState(part?.qty || 50);
  const [route, setRoute] = React.useState("air");
  const [origin, setOrigin] = React.useState(part?.origin || "TW");
  const [customFreight, setCustomFreight] = React.useState(part?.freight || 0);
  const [customTax, setCustomTax] = React.useState(part?.tax || 0);
  const [saving, setSaving] = React.useState(false);
  // Parts are keyed as partId in the parts screen and id straight off the API.
  const partId = part?.partId ?? part?.id;
  const subtotal = unit * qty;
  const duty = route === "sea" ? subtotal * 0.075 : subtotal * 0.085;
  const freight =
    customFreight > 0
      ? customFreight
      : route === "air"
        ? qty * 4.2
        : route === "sea"
          ? qty * 0.9
          : qty * 6.5;
  const insurance = subtotal * 0.005;
  const customs = 35;
  const gst = customTax > 0 ? customTax : (subtotal + duty + freight) * 0.18;
  const total = subtotal + duty + freight + insurance + customs + gst;
  const per_unit = total / qty;
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Sparkles size={16} />}
      title={__t("power.landedCost.title") || "Total Landed Cost"}
      subtitle={
        part
          ? (__t("power.landedCost.subtitleWithPart") ||
              "Calculate true delivered cost for") +
            " " +
            (part.pn || part.name)
          : __t("power.landedCost.subtitle") ||
            "Calculate true delivered cost including duty, freight, taxes"
      }
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {__t("common.close") || "Close"}
          </Button>
          {/* Fix: "Apply to part" saved nothing — it closed the modal and
              toasted "Landed cost saved" while the whole calculation was
              discarded. Now PUTs landedCost/freight/tax onto the part via
              api.parts.update and only claims success after that resolves;
              with no part in context there is nothing to apply to, so the
              button is disabled instead of pretending. */}
          <Button
            variant="primary"
            disabled={!partId}
            loading={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await api.parts.update(partId, {
                  landedCost: per_unit,
                  freight,
                  tax: gst,
                });
                onClose();
                toast(
                  (__t("power.landedCost.saved") || "Landed cost saved") +
                    ": " +
                    INR(per_unit, 2) +
                    "/unit",
                  { kind: "success" },
                );
              } catch (e) {
                toast(
                  (__t("power.landedCost.saveFailed") ||
                    "Couldn't save landed cost") +
                    ": " +
                    (e?.message || e),
                  { kind: "error" },
                );
              } finally {
                setSaving(false);
              }
            }}
          >
            {__t("power.landedCost.applyToPart") || "Apply to part"}
          </Button>
        </>
      }
    >
      <div className="d-grid gap-24" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div>
          <div className="field-row">
            <Field
              label={__t("power.landedCost.unitCostUsd") || "Unit cost ($USD)"}
            >
              <Input
                name="unitCost"
                mono
                type="number"
                step="0.01"
                value={unit}
                onChange={(e) => setUnit(+e.target.value)}
              />
            </Field>
            <Field label={__t("part.quantity") || "Qty"}>
              <Input
                name="unitQty"
                mono
                type="number"
                value={qty}
                onChange={(e) => setQty(+e.target.value)}
              />
            </Field>
          </div>
          <div className="field-row">
            <Field label={__t("part.origin") || "Origin"}>
              <Select
                name="origin"
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
              >
                <option>TW</option>
                <option>CN</option>
                <option>JP</option>
                <option>US</option>
                <option>DE</option>
              </Select>
            </Field>
            <Field
              label={__t("power.landedCost.shippingRoute") || "Shipping route"}
            >
              <Select
                name="shippingRoute"
                value={route}
                onChange={(e) => setRoute(e.target.value)}
              >
                <option value="air">
                  {__t("power.landedCost.airFreight") || "Air freight (5-7d)"}
                </option>
                <option value="sea">
                  {__t("power.landedCost.seaFreight") || "Sea freight (28-35d)"}
                </option>
                <option value="express">
                  {__t("power.landedCost.expressCourier") ||
                    "Express courier (3d)"}
                </option>
              </Select>
            </Field>
          </div>
          <Field
            label={__t("power.landedCost.hsnCode") || "HSN / customs code"}
          >
            <Input name="customsCode" mono defaultValue="8504.40.90" />
          </Field>
          {part && (
            <div
              className="mt-12 bg-sunk border-line rounded-r2 fs-11"
              style={{ padding: 10 }}
            >
              <div className="font-mono fs-9 fg-3 uppercase mb-4">
                {__t("power.landedCost.partData") || "PART DATA"}
              </div>
              <div>
                <strong>{part.pn}</strong> - {part.name}
              </div>
              <div className="fg-3 mt-2">
                {__t("vendor.title") || "Vendor"}: {part.vendor || "\u2014"}
              </div>
            </div>
          )}
          {!partId && (
            <div
              className="mt-12 bg-sunk border-line rounded-r2 font-mono fs-11 fg-3"
              style={{ padding: 10 }}
            >
              {__t("power.landedCost.noPart") ||
                "Calculator only \u2014 no part is open, so there is nothing to save to. Open this from a part to apply the result."}
            </div>
          )}
          <div className="field-row mt-12">
            <Field
              label={
                __t("power.landedCost.customFreight") || "Custom freight ($)"
              }
            >
              <Input
                name="customFreight"
                mono
                type="number"
                step="0.01"
                value={customFreight}
                onChange={(e) => setCustomFreight(+e.target.value)}
              />
            </Field>
            <Field
              label={__t("power.landedCost.customTax") || "Custom tax ($)"}
            >
              <Input
                name="customTax"
                mono
                type="number"
                step="0.01"
                value={customTax}
                onChange={(e) => setCustomTax(+e.target.value)}
              />
            </Field>
          </div>
        </div>
        <div
          className="bg-sunk border-line rounded-r2 font-mono fs-12"
          style={{ padding: 14 }}
        >
          <div className="fs-9 uppercase letter-sp-6 fg-3 mb-10">
            {__t("power.landedCost.breakdown") || "BREAKDOWN (\u20B9)"}
          </div>
          {[
            [__t("power.landedCost.subtotal") || "Subtotal", subtotal],
            [__t("power.landedCost.customsDuty") || "Customs duty", duty],
            [__t("power.landedCost.freight") || "Freight", freight],
            [
              __t("power.landedCost.insurance") || "Insurance (0.5%)",
              insurance,
            ],
            [
              __t("power.landedCost.customsBroker") || "Customs broker",
              customs,
            ],
            [__t("power.landedCost.gst") || "GST (18%)", gst],
          ].map(([l, v]) => (
            <div
              key={l}
              className="flex justify-between"
              style={{
                padding: "4px 0",
                borderBottom: "1px solid var(--line-soft)",
              }}
            >
              <span className="fg-3">{l}</span>
              <span>{INR(v, 2)}</span>
            </div>
          ))}
          <div
            className="flex justify-between mt-6 fw-700 fs-14"
            style={{ padding: "10px 0 0", borderTop: "2px solid var(--fg)" }}
          >
            <span>{__t("power.landedCost.totalLanded") || "TOTAL LANDED"}</span>
            <span>{INR(total, 2)}</span>
          </div>
          <div
            className="flex justify-between fg-accent"
            style={{ padding: "6px 0" }}
          >
            <span>{__t("power.landedCost.perUnit") || "Per unit"}</span>
            <span>{INR(per_unit, 2)}</span>
          </div>
          <div
            className="mt-10 fs-10 fg-3 bg-canvas"
            style={{ padding: 8, borderRadius: 3 }}
          >
            {__t("power.landedCost.markupOverBase") ||
              "Markup over base unit cost"}
            :{" "}
            <strong>
              {/* Fix: was per_unit / (unit * getInrRate()) — per_unit is in
                  USD (subtotal = unit * qty), so dividing by the INR-converted
                  unit cost scaled the ratio by the exchange rate and printed a
                  constant ~-98% markup. Both sides are USD. */}
              {unit > 0 ? ((per_unit / unit - 1) * 100).toFixed(1) : "—"}%
            </strong>
          </div>
        </div>
      </div>
    </Modal>
  );
}
LandedCostModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
  part: PropTypes.any,
};
function MarginModal({ open, onClose }) {
  if (!open) return null;
  const [cogs, setCogs] = React.useState(4218);
  const [overhead, setOverhead] = React.useState(15);
  const [target, setTarget] = React.useState(40);
  const overheadAmt = cogs * (overhead / 100);
  const totalCost = cogs + overheadAmt;
  const sellPrice = totalCost / (1 - target / 100);
  const gross = sellPrice - cogs;
  const net = sellPrice - totalCost;
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Chart size={16} />}
      title={__t("power.margin.title") || "Margin Calculator"}
      subtitle={
        __t("power.margin.subtitle") ||
        "BOM cost \u2192 selling price with target margin"
      }
    >
      <div className="field-row">
        <Field label={__t("power.margin.bomCost") || "BOM cost (\u20B9)"}>
          <Input
            name="bomCost"
            mono
            type="number"
            value={cogs}
            onChange={(e) => setCogs(+e.target.value)}
          />
        </Field>
        <Field label={__t("power.margin.overhead") || "Overhead (%)"}>
          <Input
            name="overheadPct"
            mono
            type="number"
            value={overhead}
            onChange={(e) => setOverhead(+e.target.value)}
          />
        </Field>
      </div>
      <Field
        label={__t("power.margin.targetGross") || "Target gross margin (%)"}
      >
        <Input
          name="targetMargin"
          mono
          type="number"
          value={target}
          onChange={(e) => setTarget(+e.target.value)}
        />
      </Field>
      <div
        className="bg-sunk border-line rounded-r2 mt-16"
        style={{ padding: 16 }}
      >
        {[
          [__t("power.margin.bomCost") || "BOM cost", cogs],
          [__t("power.margin.overheadAmount") || "Overhead", overheadAmt],
          [__t("power.margin.totalCost") || "Total cost", totalCost],
          [
            __t("power.margin.suggestedSellPrice") || "Suggested sell price",
            sellPrice,
            "var(--accent-text)",
          ],
          [
            __t("power.margin.grossProfit") || "Gross profit per unit",
            gross,
            "var(--ok)",
          ],
          [
            __t("power.margin.netProfit") || "Net profit per unit",
            net,
            "var(--ok)",
          ],
        ].map(([l, v, c], i) => (
          <div
            key={l}
            className="flex justify-between font-mono"
            style={{
              padding: "6px 0",
              borderBottom: i < 5 ? "1px solid var(--line-soft)" : "none",
            }}
          >
            <span className="fg-3">{l}</span>
            <span
              className="fw-700"
              style={{ color: c || "var(--fg)", fontSize: i >= 3 ? 14 : 12 }}
            >
              {INR(v, 2)}
            </span>
          </div>
        ))}
      </div>
    </Modal>
  );
}
MarginModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
};
// Share links are REAL now: create / list / revoke against
// /api/v1/bom-shares (backend/app/api/endpoints/bom_shares.py), and the URL is
// built from window.location.origin — the host actually serving this build.
// What was false before: the link was "https://bbox.dev/share/" +
// Math.random(), a domain the product does not serve, recomputed on every
// render; "Copy link" copied that dead string and toasted success; and the
// permission / expiry / password controls fed nothing.
// Only what the backend enforces is offered: view-only (the public payload
// carries no cost, no ids and no write route), an optional expiry, and an
// optional password. There is no comment/suggest mode and no un-revoke.
const SHARE_EXPIRY_MS = {
  "24h": 24 * 3600 * 1000,
  "7d": 7 * 24 * 3600 * 1000,
  "30d": 30 * 24 * 3600 * 1000,
};

function shareUrl(token) {
  return window.location.origin + "/share/" + token;
}

function shareDate(v) {
  if (!v) return "—";
  const d = new Date(v);
  return isNaN(d.getTime()) ? String(v) : d.toLocaleString();
}

function ShareLinkModal({ open, onClose }) {
  const ctx = useAppStore();
  const bomId = ctx?.bomId;
  const [links, setLinks] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [expires, setExpires] = React.useState("7d");
  const [pwOn, setPwOn] = React.useState(false);
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    if (bomId == null) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.bomShares.list(bomId);
      setLinks(Array.isArray(res) ? res : res?.items || res?.data || []);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [bomId]);

  React.useEffect(() => {
    if (open) load();
  }, [open, load]);

  // After the hooks, never before: `open` flipping must not change the hook
  // count for this component instance.
  if (!open) return null;

  const create = async () => {
    setBusy(true);
    try {
      const ms = SHARE_EXPIRY_MS[expires];
      await api.bomShares.create({
        bom_id: bomId,
        expires_at: ms ? new Date(Date.now() + ms).toISOString() : null,
        password: pwOn && password ? password : null,
      });
      toast(__t("power.shareLink.created") || "Share link created", {
        kind: "success",
      });
      setPassword("");
      setPwOn(false);
      await load();
    } catch (e) {
      toast(
        (__t("power.shareLink.createFailed") || "Could not create share link") +
          ": " +
          (e?.message || String(e)),
        { kind: "error" },
      );
    } finally {
      setBusy(false);
    }
  };

  const copy = async (token) => {
    const url = shareUrl(token);
    try {
      await navigator.clipboard.writeText(url);
      toast(__t("common.copied") || "Link copied", { kind: "success" });
    } catch {
      // Never claim a copy that did not happen — show the link instead.
      toast(
        (__t("power.shareLink.copyFailed") || "Could not copy. The link is") +
          " " +
          url,
        { kind: "warn" },
      );
    }
  };

  const revoke = async (row) => {
    if (
      !window.confirm(
        __t("power.shareLink.revokeConfirm") ||
          "Revoke this link? Anyone holding it loses access immediately, and it cannot be restored.",
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await api.bomShares.revoke(row.id);
      toast(__t("power.shareLink.revoked") || "Share link revoked", {
        kind: "success",
      });
      await load();
    } catch (e) {
      toast(
        (__t("power.shareLink.revokeFailed") || "Could not revoke link") +
          ": " +
          (e?.message || String(e)),
        { kind: "error" },
      );
    } finally {
      setBusy(false);
    }
  };

  const isExpired = (row) =>
    row.expires_at != null && new Date(row.expires_at).getTime() <= Date.now();

  const columns = [
    {
      key: "link",
      header: __t("power.shareLink.link") || "Link",
      render: (row) => (
        <div
          className="font-mono fs-10 fg-2"
          style={{ wordBreak: "break-all" }}
        >
          {shareUrl(row.token)}
          {row.has_password && (
            <Badge tone="info" className="ml-4">
              {__t("power.shareLink.passwordProtected") || "Password"}
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: "status",
      header: __t("power.shareLink.status") || "Status",
      render: (row) => {
        if (row.revoked) {
          return (
            <StatusPill tone="neutral">
              {__t("power.shareLink.revokedState") || "Revoked"}
            </StatusPill>
          );
        }
        if (isExpired(row)) {
          return (
            <StatusPill tone="neutral">
              {__t("power.shareLink.expired") || "Expired"}
            </StatusPill>
          );
        }
        return (
          <StatusPill tone="success">
            {__t("power.shareLink.active") || "Active"}
          </StatusPill>
        );
      },
    },
    {
      key: "expires",
      header: __t("power.shareLink.expiresAt") || "Expires",
      render: (row) =>
        row.expires_at
          ? shareDate(row.expires_at)
          : __t("power.shareLink.never") || "Never",
    },
    {
      key: "access",
      header: __t("power.shareLink.opens") || "Opens",
      align: "num",
      render: (row) => row.access_count ?? 0,
    },
    {
      key: "last",
      header: __t("power.shareLink.lastOpened") || "Last opened",
      render: (row) => shareDate(row.last_accessed_at),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (row) => (
        <div className="inline-flex gap-6">
          <Button variant="secondary" onClick={() => copy(row.token)}>
            <Icon.Link size={12} /> {__t("common.copy") || "Copy"}
          </Button>
          {!row.revoked && (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => revoke(row)}
            >
              {__t("power.shareLink.revoke") || "Revoke"}
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Link size={16} />}
      size="lg"
      title={__t("power.shareLink.title") || "Share BOM"}
      subtitle={
        __t("power.shareLink.subtitle") ||
        "Create a read-only public link to this BOM"
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {__t("common.close") || "Close"}
          </Button>
          <Button
            variant="primary"
            disabled={busy || bomId == null || (pwOn && !password)}
            onClick={create}
          >
            <Icon.Link size={12} />{" "}
            {__t("power.shareLink.createLink") || "Create link"}
          </Button>
        </>
      }
    >
      {bomId == null ? (
        <EmptyState
          title={__t("power.shareLink.noBom") || "No BOM selected"}
          message={
            __t("power.shareLink.noBomMsg") ||
            "Open a BOM first — a share link points at one specific BOM."
          }
        />
      ) : (
        <>
          <div
            className="bg-sunk border-line rounded-r2 fs-11 fg-3 mb-12"
            style={{ padding: 10 }}
          >
            {__t("power.shareLink.scopeNote") ||
              "Anyone with the link sees this BOM read-only: line numbers, parts, quantities, reference designators and notes. Costs, people and internal ids are never included, and the link grants no way to change anything."}
          </div>

          <div className="field-row">
            <Field label={__t("power.shareLink.linkExpires") || "Link expires"}>
              <Select
                name="shareExpires"
                value={expires}
                onChange={(e) => setExpires(e.target.value)}
              >
                <option value="24h">
                  {__t("power.shareLink.in24Hours") || "In 24 hours"}
                </option>
                <option value="7d">
                  {__t("power.shareLink.in7Days") || "In 7 days"}
                </option>
                <option value="30d">
                  {__t("power.shareLink.in30Days") || "In 30 days"}
                </option>
                <option value="never">
                  {__t("power.shareLink.never") || "Never"}
                </option>
              </Select>
            </Field>
            <div className="field flex flex-col justify-center gap-6">
              <Checkbox
                name="sharePasswordEnabled"
                checked={pwOn}
                onChange={(e) => setPwOn(e.target.checked)}
                label={
                  __t("power.shareLink.passwordProtect") || "Password protect"
                }
              />
              {pwOn && (
                <Input
                  name="sharePassword"
                  mono
                  type="password"
                  className="mt-4"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-label={
                    __t("power.shareLink.passwordPlaceholder") || "Password"
                  }
                  placeholder={
                    __t("power.shareLink.passwordPlaceholder") || "Password"
                  }
                />
              )}
            </div>
          </div>

          {loading && (
            <div className="fs-11 fg-3" role="status">
              {__t("common.loading") || "Loading…"}
            </div>
          )}

          {!loading && error && (
            <div className="fg-danger fs-11" role="alert">
              {(__t("power.shareLink.loadFailed") ||
                "Could not load share links") +
                ": " +
                error}
            </div>
          )}

          {!loading && !error && links.length === 0 && (
            <EmptyState
              title={__t("power.shareLink.emptyTitle") || "No links yet"}
              message={
                __t("power.shareLink.empty") ||
                "This BOM has no share links. Create one above."
              }
            />
          )}

          {!loading && !error && links.length > 0 && (
            <DataTable
              columns={columns}
              rows={links}
              dense
              ariaLabel={__t("power.shareLink.title") || "Share BOM"}
            />
          )}
        </>
      )}
    </Modal>
  );
}
ShareLinkModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
};
function WebhooksModal({ open, onClose }) {
  if (!open) return null;
  // Fix: this list was seeded with three INVENTED subscriptions (a fake Slack
  // hook, a fake ERP URL, a zapier one) with fake "last_fire" times, and every
  // button was local-state-only: "New webhook" toasted "Webhook created"
  // without saving, Delete only filtered React state, and Test toasted "Fired
  // test event" without calling anything. A real backend exists, so all four
  // are now wired to it (GET/POST/PUT/DELETE /webhooks, POST
  // /webhooks/{id}/test) and every toast reports the awaited result.
  // The subscription record has no "last fired" field, so that column now
  // shows the real createdAt instead of an invented relative time.
  const [hooks, setHooks] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    api.webhooks
      .list()
      .then((data) => setHooks(Array.isArray(data) ? data : data?.items || []))
      .catch((e) => {
        setHooks([]);
        toast(
          (__t("power.webhooks.loadFailed") || "Couldn't load webhooks") +
            ": " +
            (e?.message || e),
          { kind: "error" },
        );
      });
  }, []);
  const saveHook = async (h, patch) => {
    try {
      const updated = await api.webhooks.update(h.id, patch);
      setHooks((prev) =>
        prev.map((x) => (x.id === h.id ? { ...x, ...(updated || patch) } : x)),
      );
    } catch (e) {
      toast(
        (__t("power.webhooks.saveFailed") || "Couldn't save webhook") +
          ": " +
          (e?.message || e),
        { kind: "error" },
      );
    }
  };
  const events = [
    "PO.created",
    "PO.received",
    "BOM.released",
    "BOM.revised",
    "Vendor.added",
    "Vendor.risk_high",
    "NCR.opened",
    "Approval.requested",
    "Approval.granted",
    "Stock.low",
  ];
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Link size={16} />}
      title={__t("power.webhooks.title") || "Webhooks"}
      subtitle={`${hooks.length} ${__t("power.webhooks.configured") || "configured"} \u00B7 ${hooks.filter((h) => h.active).length} ${__t("power.webhooks.active") || "active"}`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {__t("common.close") || "Close"}
          </Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const created = await api.webhooks.create({
                  url: "",
                  events: events[0],
                  active: true,
                });
                setHooks((prev) => [created, ...prev]);
                toast(__t("power.webhooks.created") || "Webhook created", {
                  kind: "success",
                });
              } catch (e) {
                toast(
                  (__t("power.webhooks.createFailed") ||
                    "Couldn't create webhook") +
                    ": " +
                    (e?.message || e),
                  { kind: "error" },
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <Icon.Plus size={12} />{" "}
            {__t("power.webhooks.newWebhook") || "New webhook"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-8">
        {hooks.length === 0 && (
          <EmptyState
            title={__t("power.webhooks.none") || "No webhooks configured"}
            message={
              __t("power.webhooks.noneMsg") ||
              "Use “New webhook” to subscribe an endpoint to events."
            }
          />
        )}
        {hooks.map((h) => (
          <div
            key={h.id}
            className="border-line rounded-r2 d-grid gap-12 items-center"
            style={{ padding: 12, gridTemplateColumns: "180px 1fr 90px 60px" }}
          >
            {/* Fix: these two controls were uncontrolled and consumed by
                nothing — edits went nowhere. Now they persist on change/blur
                via PUT /webhooks/{id}. */}
            <Select
              aria-label={__t("power.webhooks.event") || "Webhook event"}
              name="webhookEvent"
              className="h-28 fs-11"
              value={h.events || events[0]}
              onChange={(e) => saveHook(h, { events: e.target.value })}
            >
              {events.map((e) => (
                <option key={e}>{e}</option>
              ))}
            </Select>
            <Input
              aria-label={__t("power.webhooks.url") || "Webhook URL"}
              name="webhookUrl"
              mono
              className="h-28 fs-11"
              defaultValue={h.url}
              placeholder="https://..."
              onBlur={(e) => {
                if (e.target.value !== h.url)
                  saveHook(h, { url: e.target.value });
              }}
            />
            <span className="font-mono fs-10 fg-3">
              {(h.createdAt || "—").slice(0, 10)}
            </span>
            <div className="flex gap-4 justify-end">
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                title={__t("power.webhooks.test") || "Test"}
                aria-label={__t("power.webhooks.test") || "Test"}
                onClick={async () => {
                  try {
                    const d = await api.webhooks.test(h.id, h.events);
                    const ok = d?.status === "delivered";
                    toast(
                      (ok
                        ? __t("power.webhooks.firedTest") || "Fired test event"
                        : __t("power.webhooks.testFailed") ||
                          "Test event not delivered") +
                        " \u2192 " +
                        (h.events || "") +
                        (d?.statusCode ? " \u00b7 HTTP " + d.statusCode : "") +
                        (!ok && d?.responseText
                          ? " \u00b7 " + String(d.responseText).slice(0, 120)
                          : ""),
                      { kind: ok ? "success" : "error" },
                    );
                  } catch (e) {
                    toast(
                      (__t("power.webhooks.testFailed") ||
                        "Test event not delivered") +
                        ": " +
                        (e?.message || e),
                      { kind: "error" },
                    );
                  }
                }}
              >
                <Icon.Sparkles size={11} />
              </Button>
              <Button
                variant="danger"
                size="sm"
                iconOnly
                aria-label={__t("common.delete") || "Delete"}
                onClick={async () => {
                  try {
                    await api.webhooks.delete(h.id);
                    setHooks((prev) => prev.filter((x) => x.id !== h.id));
                  } catch (e) {
                    toast(
                      (__t("power.webhooks.deleteFailed") ||
                        "Couldn't delete webhook") +
                        ": " +
                        (e?.message || e),
                      { kind: "error" },
                    );
                  }
                }}
              >
                <Icon.Trash size={11} />
              </Button>
            </div>
          </div>
        ))}
      </div>
      <div
        className="mt-14 bg-sunk border-line rounded-r2 font-mono fs-11 fg-3"
        style={{ padding: 10 }}
      >
        {__t("power.webhooks.hint") ||
          "\uD83D\uDCA1 Webhook payload is JSON. Try connecting to Slack, Zapier, n8n, or your own ERP for real-time sync."}
      </div>
    </Modal>
  );
}
WebhooksModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
};
function ScheduledReportsModal({ open, onClose }) {
  if (!open) return null;
  // No backend endpoint exists yet for scheduled/auto-emailed reports (see
  // api.js \u2014 schedulingAPI is manufacturing production scheduling, unrelated
  // to this feature). Nothing is fetched or persisted here; entries created
  // below are a local, unsaved preview only.
  const [reports, setReports] = React.useState([]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Doc size={16} />}
      title={__t("power.scheduledReports.title") || "Scheduled Reports"}
      subtitle={
        __t("power.scheduledReports.subtitle") ||
        "Auto-email reports to your team"
      }
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {__t("common.close") || "Close"}
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              setReports([
                {
                  id: Date.now(),
                  name:
                    __t("power.scheduledReports.newReportName") ||
                    "New report",
                  schedule:
                    __t("power.scheduledReports.weeklyMon") || "Weekly \u00B7 Mon",
                  format: "PDF",
                  recipients: "",
                  active: true,
                },
                ...reports,
              ]);
              toast(
                __t("power.scheduledReports.notPersisted") ||
                  "Added to preview \u00B7 no backend configured for this yet, so it will not be saved or sent",
                { kind: "warn" },
              );
            }}
          >
            <Icon.Plus size={12} />{" "}
            {__t("power.scheduledReports.newSchedule") || "New schedule"}
          </Button>
        </>
      }
    >
      <div
        className="bg-sunk border-line rounded-r2 font-mono fs-11 fg-3 mb-12"
        style={{ padding: 10 }}
      >
        {__t("power.scheduledReports.noBackend") ||
          "No backend configured for this yet. Schedules added below are a local preview only \u2014 nothing is saved or emailed."}
      </div>
      {reports.length === 0 ? (
        <EmptyState
          title={
            __t("power.scheduledReports.noReports") || "No scheduled reports"
          }
          message={
            __t("power.scheduledReports.noReportsMsg") ||
            "No backend configured for this yet. Use \u201CNew schedule\u201D to preview the flow."
          }
        />
      ) : (
        reports.map((r) => (
          <div
            key={r.id}
            className="border-line rounded-r2 mb-8"
            style={{ padding: 12 }}
          >
            <div className="flex justify-between items-center mb-4">
              <div className="fw-600 fs-13">{r.name}</div>
              <Checkbox
                name="reportActive"
                className="fs-11"
                defaultChecked={r.active}
                label={
                  <span className="fg-3 font-mono">
                    {__t("power.scheduledReports.active") || "Active"}
                  </span>
                }
              />
            </div>
            <div
              className="d-grid gap-10 font-mono fs-11 fg-3"
              style={{ gridTemplateColumns: "auto auto 1fr" }}
            >
              <span>{r.schedule}</span>
              <span>{r.format}</span>
              <span>\u2192 {r.recipients || "\u2014"}</span>
            </div>
          </div>
        ))
      )}
    </Modal>
  );
}
ScheduledReportsModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
};
function EmailParseModal({ open, onClose }) {
  if (!open) return null;
  // No backend endpoint exists yet for inbound-email quote parsing (no
  // /email-parse or similar route in api.js). There is nothing to fetch, so
  // this always renders the honest empty state below instead of fabricating
  // vendor emails and confidence scores.
  const [emails] = React.useState([]);
  const readyCount = emails.filter((e) => e.status === "ready").length;
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Sparkles size={16} />}
      title={__t("power.emailParse.title") || "Email Inbox \u00B7 Auto-parse"}
      subtitle={
        __t("power.emailParse.subtitle") ||
        "Vendor emails with AI-extracted quote data"
      }
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {__t("common.close") || "Close"}
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              if (readyCount === 0) {
                toast(
                  __t("power.emailParse.noBackend") ||
                    "No backend configured for this yet \u2014 there are no parsed emails to import",
                  { kind: "warn" },
                );
                return;
              }
              onClose();
              toast(
                readyCount +
                  " " +
                  (__t("power.emailParse.rfqsImportedSuffix") ||
                    "RFQs imported into procurement"),
                {
                  kind: "success",
                  action: {
                    label: __t("common.view") || "View",
                    onClick: () => navigateTo("procurement"),
                  },
                },
              );
            }}
          >
            <Icon.Import size={12} />{" "}
            {__t("power.emailParse.importReadyRfqs") || "Import ready RFQs"}
          </Button>
        </>
      }
    >
      {emails.length === 0 ? (
        <EmptyState
          title={__t("power.emailParse.noEmails") || "No parsed emails"}
          message={
            __t("power.emailParse.noEmailsMsg") ||
            "No backend configured for this yet. Connect an email/AI parsing backend to see vendor quotes extracted here."
          }
        />
      ) : (
        emails.map((e) => (
          <div
            key={e.subject}
            className="border-line rounded-r2 mb-8"
            style={{ padding: 12, opacity: e.status === "skip" ? 0.5 : 1 }}
          >
            <div
              className="d-grid gap-14 items-center"
              style={{ gridTemplateColumns: "1fr 80px 80px" }}
            >
              <div>
                <div className="fw-600 fs-12">{e.subject}</div>
                <div className="font-mono fs-10 fg-3">{e.from}</div>
                {e.status === "ready" && (
                  <div className="font-mono fs-11 mt-6 fg-2">
                    <strong>{e.parsed.pn}</strong> \u00B7 {INR(e.parsed.unit, 2)}
                    /ea \u00D7 {e.parsed.qty} \u00B7 {e.parsed.lead}d{" "}
                    {__t("power.emailParse.lead") || "lead"}
                  </div>
                )}
              </div>
              <span className="text-center">
                <Badge
                  tone={
                    e.confidence >= 0.9
                      ? "success"
                      : e.confidence >= 0.7
                        ? "warning"
                        : "danger"
                  }
                >
                  {Math.round(e.confidence * 100)}%
                </Badge>
              </span>
              <span className="text-right">
                {e.status === "ready" ? (
                  <Icon.Check size={14} aria-hidden="true" />
                ) : (
                  <Badge tone="neutral">
                    {__t("power.emailParse.skip") || "SKIP"}
                  </Badge>
                )}
                <span className="sr-only">
                  {e.status === "ready"
                    ? __t("power.emailParse.readyToImport") ||
                      "Ready to import"
                    : __t("power.emailParse.skip") || "Skip"}
                </span>
              </span>
            </div>
          </div>
        ))
      )}
    </Modal>
  );
}
EmailParseModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
};
// Fix: this rendered two INVENTED teammates ("Marie Park" editing
// EL-MCU-STM32H7, "Ryo Sato" editing PCB-R3) with live green online dots,
// permanently, in the top bar \u2014 pure fabrication. There is a real presence
// source (CollabProvider's websocket `users` list), so it now reads that and
// renders nothing when nobody else is connected.
function Presence() {
  const { users } = useCollab();
  if (!users || users.length === 0) return null;
  return (
    <div className="inline-flex items-center gap-4 mr-8">
      {users.slice(0, 5).map((uid) => (
        <PresenceAvatar key={uid} userId={uid} size={22} />
      ))}
      {users.length > 5 && (
        <span className="font-mono fs-10 fg-3">+{users.length - 5}</span>
      )}
    </div>
  );
}
// applyAccessibilityTheme (high-contrast/colorblind) removed — it was dead
// (never called, no [data-a11y] CSS). WCAG AA is met in the base foundation;
// dedicated a11y modes are a later build.
export {
  CommandPalette,
  WorkOrdersScreen,
  NCRScreen,
  LandedCostModal,
  MarginModal,
  ShareLinkModal,
  WebhooksModal,
  ScheduledReportsModal,
  EmailParseModal,
  Presence,
};
Object.assign(window, {
  CommandPalette,
  WorkOrdersScreen,
  NCRScreen,
  LandedCostModal,
  MarginModal,
  ShareLinkModal,
  WebhooksModal,
  ScheduledReportsModal,
  EmailParseModal,
  Presence,
});
