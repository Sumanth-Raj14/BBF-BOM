import PropTypes from "prop-types";
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
  Card,
  DataTable,
  StatusPill,
  Badge,
  Menu,
  EmptyState,
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
        window.__nav?.("ecr");
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
      run: () => window.__nav?.("diff"),
    },
    {
      c: "> dashboard",
      label: __t("power.cmd.dashboard") || "Go to Dashboard",
      run: () => window.__nav?.("dashboard"),
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
      run: () => window.__nav?.("approvals"),
    },
    {
      c: "> calendar",
      label: __t("power.cmd.calendar") || "Open calendar & timeline",
      run: () => window.__nav?.("calendar"),
    },
    {
      c: "> compliance",
      label: __t("power.cmd.compliance") || "Open compliance tracker",
      run: () => window.__nav?.("compliance"),
    },
    {
      c: "> inventory",
      label: __t("power.cmd.inventory") || "Open inventory",
      run: () => window.__nav?.("inventory"),
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
  const DEFAULT_ORDERS = [
    {
      id: "WO-2026-0042",
      bom: "ATLAS Mainframe v3.2.0",
      qty: 25,
      scheduled: "2026-06-15",
      status: "Released",
      built: 0,
      good: 0,
      defect: 0,
    },
    {
      id: "WO-2026-0041",
      bom: "HORIZON Sensor Pod v1.4.0",
      qty: 10,
      scheduled: "2026-06-08",
      status: "In Progress",
      built: 7,
      good: 7,
      defect: 0,
    },
    {
      id: "WO-2026-0040",
      bom: "ATLAS Mainframe v3.2.0",
      qty: 10,
      scheduled: "2026-05-28",
      status: "In Progress",
      built: 6,
      good: 5,
      defect: 1,
    },
    {
      id: "WO-2026-0039",
      bom: "ATLAS-LITE Eval v1.0.0",
      qty: 50,
      scheduled: "2026-05-25",
      status: "Complete",
      built: 50,
      good: 48,
      defect: 2,
    },
    {
      id: "WO-2026-0038",
      bom: "ATLAS Mainframe v3.1.4",
      qty: 5,
      scheduled: "2026-05-20",
      status: "Complete",
      built: 5,
      good: 5,
      defect: 0,
    },
  ];
  React.useEffect(() => {
    screenData.workOrders
      .list()
      .then((data) => {
        if (data && data.length) setOrders(data);
        else {
          const saved = null;
          setOrders(saved && saved.length ? saved : DEFAULT_ORDERS);
        }
      })
      .catch(() => {
        const saved = null;
        setOrders(saved && saved.length ? saved : DEFAULT_ORDERS);
      });
  }, []);
  const [showForm, setShowForm] = React.useState(false);
  const [newWo, setNewWo] = React.useState({
    bom: "ATLAS Mainframe v3.2.0",
    qty: 10,
    scheduled: "",
  });
  const persist = (next) => {
    setOrders(next);
  };
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
                const next = orders.map((x) =>
                  x.id === o.id
                    ? { ...x, built: x.built + 1, good: x.good + 1 }
                    : x,
                );
                persist(next);
                toast(
                  __t("power.workOrders.buildReported") ||
                    "Build reported \u00B7 1 good unit",
                );
              },
            },
            {
              icon: <Icon.Flag size={11} />,
              label: __t("power.workOrders.reportDefect") || "Report defect",
              onSelect: () => {
                const next = orders.map((x) =>
                  x.id === o.id
                    ? { ...x, built: x.built + 1, defect: x.defect + 1 }
                    : x,
                );
                persist(next);
                toast(
                  __t("power.workOrders.defectReported") ||
                    "Defect reported \u00B7 NCR drafted",
                  { kind: "warn" },
                );
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
            <Button
              variant="secondary"
              onClick={() =>
                toast(
                  __t("power.workOrders.scheduleExported") ||
                    "Work order schedule exported",
                  { kind: "success" },
                )
              }
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
                  persist([
                    {
                      id,
                      bom: newWo.bom,
                      qty: newWo.qty,
                      scheduled: newWo.scheduled,
                      status: "Draft",
                      built: 0,
                      good: 0,
                      defect: 0,
                    },
                    ...orders,
                  ]);
                  setShowForm(false);
                  toast(
                    id + " " + (__t("power.workOrders.created") || "created"),
                    { kind: "success" },
                  );
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
  const [ncrs, setNcrs] = React.useState([
    {
      id: "NCR-2026-018",
      pn: "EL-PSU-240W",
      wo: "WO-2026-0040",
      defect: "Output voltage 11.7V (spec 12.0\u00B10.2)",
      severity: "Major",
      action: "Return to vendor",
      status: "Open",
      reporter: "M. Park",
      date: "2026-05-23",
    },
    {
      id: "NCR-2026-017",
      pn: "MEC-PL-040A",
      wo: "WO-2026-0039",
      defect: "Anodize finish blotchy on 2 of 50",
      severity: "Minor",
      action: "Rework",
      status: "In review",
      reporter: "R. Sato",
      date: "2026-05-21",
    },
    {
      id: "NCR-2026-016",
      pn: "EL-MCU-STM32H7",
      wo: "WO-2026-0038",
      defect: "Failed in-circuit boot test",
      severity: "Critical",
      action: "Return + RMA",
      status: "Resolved",
      reporter: "E. Chen",
      date: "2026-05-18",
    },
    {
      id: "NCR-2026-015",
      pn: "CB-FFC-40P-100",
      wo: "WO-2026-0040",
      defect: "Cable too short by 5mm",
      severity: "Minor",
      action: "Use as-is (waiver)",
      status: "Resolved",
      reporter: "M. Park",
      date: "2026-05-15",
    },
  ]);
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
      wo: "WO-2026-" + String(40 + ncrs.length).padStart(4, "0"),
      defect: newNcr.defect,
      severity: newNcr.severity,
      action: newNcr.action,
      status: "Open",
      reporter: ctx?.user?.name || "Current User",
      date: new Date().toISOString().slice(0, 10),
    };
    setNcrs([entry, ...ncrs]);
    setNewNcr({ pn: "", defect: "", severity: "Minor", action: "Rework" });
    setShowForm(false);
    toast(
      id +
        " " +
        (__t("power.ncr.createdFor") || "created for") +
        " " +
        entry.pn,
      { kind: "success" },
    );
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
                window.__nav?.("work-orders");
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
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {__t("common.close") || "Close"}
          </button>
          <button
            className="btn primary"
            onClick={() => {
              onClose();
              toast(
                (__t("power.landedCost.saved") || "Landed cost saved") +
                  ": " +
                  INR(per_unit, 2) +
                  "/unit",
                { kind: "success" },
              );
            }}
          >
            {__t("power.landedCost.applyToPart") || "Apply to part"}
          </button>
        </>
      }
    >
      <div className="d-grid gap-24" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="landed-unit">
                {__t("power.landedCost.unitCostUsd") || "Unit cost ($USD)"}
              </label>
              <input
                id="landed-unit"
                name="unitCost"
                className="input mono"
                type="number"
                step="0.01"
                value={unit}
                onChange={(e) => setUnit(+e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="landed-qty">
                {__t("part.quantity") || "Qty"}
              </label>
              <input
                id="landed-qty"
                name="unitQty"
                className="input mono"
                type="number"
                value={qty}
                onChange={(e) => setQty(+e.target.value)}
              />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="landed-origin">
                {__t("part.origin") || "Origin"}
              </label>
              <select
                id="landed-origin"
                name="origin"
                className="select"
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
              >
                <option>TW</option>
                <option>CN</option>
                <option>JP</option>
                <option>US</option>
                <option>DE</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="landed-route">
                {__t("power.landedCost.shippingRoute") || "Shipping route"}
              </label>
              <select
                id="landed-route"
                name="shippingRoute"
                className="select"
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
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="landed-hsn">
              {__t("power.landedCost.hsnCode") || "HSN / customs code"}
            </label>
            <input
              id="landed-hsn"
              name="customsCode"
              className="input mono"
              defaultValue="8504.40.90"
            />
          </div>
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
          <div className="field-row mt-12">
            <div className="field">
              <label htmlFor="landed-freight">
                {__t("power.landedCost.customFreight") || "Custom freight ($)"}
              </label>
              <input
                id="landed-freight"
                name="customFreight"
                className="input mono"
                type="number"
                step="0.01"
                value={customFreight}
                onChange={(e) => setCustomFreight(+e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="landed-tax">
                {__t("power.landedCost.customTax") || "Custom tax ($)"}
              </label>
              <input
                id="landed-tax"
                name="customTax"
                className="input mono"
                type="number"
                step="0.01"
                value={customTax}
                onChange={(e) => setCustomTax(+e.target.value)}
              />
            </div>
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
              {(
                (per_unit / (unit * (window.INR_RATE || 83)) - 1) *
                100
              ).toFixed(1)}
              %
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
        <div className="field">
          <label htmlFor="margin-cogs">
            {__t("power.margin.bomCost") || "BOM cost (\u20B9)"}
          </label>
          <input
            id="margin-cogs"
            name="bomCost"
            className="input mono"
            type="number"
            value={cogs}
            onChange={(e) => setCogs(+e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="margin-overhead">
            {__t("power.margin.overhead") || "Overhead (%)"}
          </label>
          <input
            id="margin-overhead"
            name="overheadPct"
            className="input mono"
            type="number"
            value={overhead}
            onChange={(e) => setOverhead(+e.target.value)}
          />
        </div>
      </div>
      <div className="field">
        <label htmlFor="margin-target">
          {__t("power.margin.targetGross") || "Target gross margin (%)"}
        </label>
        <input
          id="margin-target"
          name="targetMargin"
          className="input mono"
          type="number"
          value={target}
          onChange={(e) => setTarget(+e.target.value)}
        />
      </div>
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
function ShareLinkModal({ open, onClose }) {
  if (!open) return null;
  const [permission, setPermission] = React.useState("view");
  const [expires, setExpires] = React.useState("7d");
  const [password, setPassword] = React.useState(false);
  const link =
    "https://bbox.dev/share/" + Math.random().toString(36).slice(2, 12);
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Link size={16} />}
      title={__t("power.shareLink.title") || "Share BOM"}
      subtitle={
        __t("power.shareLink.subtitle") ||
        "Create a public link to view or comment"
      }
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {__t("common.cancel") || "Cancel"}
          </button>
          <button
            className="btn primary"
            onClick={() => {
              navigator.clipboard?.writeText(link);
              onClose();
              toast(
                __t("power.shareLink.copied") ||
                  "Share link copied to clipboard",
                { kind: "success" },
              );
            }}
          >
            <Icon.Link size={12} />{" "}
            {__t("power.shareLink.copyLink") || "Copy link"}
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="share-permission">
          {__t("power.shareLink.anyoneWithLink") || "Anyone with the link can"}
        </label>
        <select
          id="share-permission"
          name="sharePermission"
          className="select"
          value={permission}
          onChange={(e) => setPermission(e.target.value)}
        >
          <option value="view">
            {__t("power.shareLink.viewOnly") || "View only"}
          </option>
          <option value="comment">
            {__t("power.shareLink.comment") || "Comment"}
          </option>
          <option value="suggest">
            {__t("power.shareLink.suggestChanges") ||
              "Suggest changes (review)"}
          </option>
        </select>
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="share-expires">
            {__t("power.shareLink.linkExpires") || "Link expires"}
          </label>
          <select
            id="share-expires"
            name="shareExpires"
            className="select"
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
          </select>
        </div>
        <div className="field flex items-center gap-6">
          <label htmlFor="share-password">
            <input
              id="share-password"
              name="sharePasswordEnabled"
              type="checkbox"
              className="row-checkbox"
              checked={password}
              onChange={(e) => setPassword(e.target.checked)}
            />{" "}
            {__t("power.shareLink.passwordProtect") || "Password protect"}
          </label>
          {password && (
            <input
              id="share-password-value"
              name="sharePassword"
              className="input mono mt-4"
              placeholder={
                __t("power.shareLink.passwordPlaceholder") || "Password"
              }
            />
          )}
        </div>
      </div>
      <div
        className="bg-sunk border-line rounded-r2 font-mono fs-11 flex justify-between items-center"
        style={{ padding: 10 }}
      >
        <span className="fg-accent">{link}</span>
        <button
          className="btn small"
          onClick={() => navigator.clipboard?.writeText(link)}
        >
          {__t("power.shareLink.copy") || "Copy"}
        </button>
      </div>
    </Modal>
  );
}
ShareLinkModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
};
function WebhooksModal({ open, onClose }) {
  if (!open) return null;
  const [hooks, setHooks] = React.useState([
    {
      id: 1,
      event: "PO.created",
      url: "https://hooks.slack.com/services/T../B../X..",
      active: true,
      last_fire: "2h ago",
    },
    {
      id: 2,
      event: "BOM.released",
      url: "https://api.acme.com/erp/sync",
      active: true,
      last_fire: "yesterday",
    },
    {
      id: 3,
      event: "Vendor.risk_high",
      url: "https://zapier.com/hooks/catch/...",
      active: false,
      last_fire: "\u2014",
    },
  ]);
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
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {__t("common.close") || "Close"}
          </button>
          <button
            className="btn primary"
            onClick={() => {
              setHooks([
                {
                  id: Date.now(),
                  event: events[0],
                  url: "",
                  active: true,
                  last_fire: "\u2014",
                },
                ...hooks,
              ]);
              toast(__t("power.webhooks.created") || "Webhook created");
            }}
          >
            <Icon.Plus size={12} />{" "}
            {__t("power.webhooks.newWebhook") || "New webhook"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-8">
        {hooks.map((h) => (
          <div
            key={h.id}
            className="border-line rounded-r2 d-grid gap-12 items-center"
            style={{ padding: 12, gridTemplateColumns: "180px 1fr 90px 60px" }}
          >
            <select
              id={"webhook-event-" + h.id}
              name="webhookEvent"
              className="select h-28 fs-11"
              defaultValue={h.event}
            >
              {events.map((e) => (
                <option key={e}>{e}</option>
              ))}
            </select>
            <input
              id={"webhook-url-" + h.id}
              name="webhookUrl"
              className="input mono h-28 fs-11"
              defaultValue={h.url}
              placeholder="https://..."
            />
            <span className="font-mono fs-10 fg-3">{h.last_fire}</span>
            <div className="flex gap-4 justify-end">
              <button
                className="icon-btn w-22 h-22"
                title={__t("power.webhooks.test") || "Test"}
                aria-label={__t("power.webhooks.test") || "Test"}
                onClick={() =>
                  toast(
                    (__t("power.webhooks.firedTest") || "Fired test event") +
                      " \u2192 " +
                      h.event,
                    { kind: "success" },
                  )
                }
              >
                <Icon.Sparkles size={11} />
              </button>
              <button
                className="icon-btn w-22 h-22 fg-danger"
                aria-label={__t("common.delete") || "Delete"}
                onClick={() => setHooks(hooks.filter((x) => x.id !== h.id))}
              >
                <Icon.Trash size={11} />
              </button>
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
  const [reports, setReports] = React.useState([
    {
      id: 1,
      name: "Monday budget snapshot",
      schedule: "Weekly \u00B7 Mon 9am IST",
      format: "PDF",
      recipients: "team@blackboxfactories.com",
      active: true,
    },
    {
      id: 2,
      name: "End-of-month spend report",
      schedule: "Monthly \u00B7 Last day",
      format: "XLSX",
      recipients: "tom@blackboxfactories.com, karan@blackboxfactories.com",
      active: true,
    },
    {
      id: 3,
      name: "Supply risk alerts",
      schedule: "Daily \u00B7 8am IST",
      format: "Slack message",
      recipients: "#procurement",
      active: true,
    },
  ]);
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
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {__t("common.close") || "Close"}
          </button>
          <button
            className="btn primary"
            onClick={() => {
              setReports([
                {
                  id: Date.now(),
                  name: "New report",
                  schedule: "Weekly \u00B7 Mon",
                  format: "PDF",
                  recipients: "",
                  active: true,
                },
                ...reports,
              ]);
              toast(
                __t("power.scheduledReports.reportScheduled") ||
                  "Report scheduled",
              );
            }}
          >
            <Icon.Plus size={12} />{" "}
            {__t("power.scheduledReports.newSchedule") || "New schedule"}
          </button>
        </>
      }
    >
      {reports.map((r) => (
        <div
          key={r.id}
          className="border-line rounded-r2 mb-8"
          style={{ padding: 12 }}
        >
          <div className="flex justify-between items-center mb-4">
            <div className="fw-600 fs-13">{r.name}</div>
            <label
              htmlFor={"report-active-" + r.id}
              className="inline-flex items-center gap-6 fs-11"
            >
              <input
                id={"report-active-" + r.id}
                name="reportActive"
                type="checkbox"
                className="row-checkbox"
                defaultChecked={r.active}
              />
              <span className="fg-3 font-mono">
                {__t("power.scheduledReports.active") || "Active"}
              </span>
            </label>
          </div>
          <div
            className="d-grid gap-10 font-mono fs-11 fg-3"
            style={{ gridTemplateColumns: "auto auto 1fr" }}
          >
            <span>{r.schedule}</span>
            <span>{r.format}</span>
            <span>\u2192 {r.recipients}</span>
          </div>
        </div>
      ))}
    </Modal>
  );
}
ScheduledReportsModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
};
function EmailParseModal({ open, onClose }) {
  if (!open) return null;
  const [emails] = React.useState([
    {
      from: "sales@meanwell.com.tw",
      subject: "Quotation Q-2026-0182",
      confidence: 0.96,
      parsed: { pn: "EL-PSU-240W", unit: 82.5, qty: 100, lead: 21 },
      status: "ready",
    },
    {
      from: "quote@daly-bms.com",
      subject: "RE: BMS 12S 60A quote request",
      confidence: 0.91,
      parsed: { pn: "EL-BMS-12S", unit: 58.2, qty: 25, lead: 35 },
      status: "ready",
    },
    {
      from: "rfq@jlcpcb.com",
      subject: "JLCPCB Quote - Main PCB R3",
      confidence: 0.88,
      parsed: { pn: "EL-PCB-MAIN-R3", unit: 58.4, qty: 100, lead: 14 },
      status: "ready",
    },
    {
      from: "noreply@digikey.com",
      subject: "Order shipment notification",
      confidence: 0.42,
      parsed: { pn: "\u2014", unit: 0, qty: 0, lead: 0 },
      status: "skip",
    },
  ]);
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
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {__t("common.close") || "Close"}
          </button>
          <button
            className="btn primary"
            onClick={() => {
              onClose();
              toast(
                __t("power.emailParse.rfqsImported") ||
                  "3 RFQs imported into procurement",
                {
                  kind: "success",
                  action: {
                    label: __t("common.view") || "View",
                    onClick: () => window.__nav?.("procurement"),
                  },
                },
              );
            }}
          >
            <Icon.Import size={12} />{" "}
            {__t("power.emailParse.importReadyRfqs") || "Import ready RFQs"}
          </button>
        </>
      }
    >
      {emails.map((e) => (
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
            <span
              className="text-center font-mono fs-11"
              style={{
                color:
                  e.confidence >= 0.9
                    ? "var(--ok)"
                    : e.confidence >= 0.7
                      ? "var(--warn)"
                      : "var(--danger)",
              }}
            >
              {Math.round(e.confidence * 100)}%
            </span>
            <span className="text-right">
              {e.status === "ready" ? (
                <Icon.Check size={14} />
              ) : (
                <span className="font-mono fs-10 fg-3">
                  {__t("power.emailParse.skip") || "SKIP"}
                </span>
              )}
            </span>
          </div>
        </div>
      ))}
    </Modal>
  );
}
EmailParseModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
};
function Presence() {
  const team = [
    { name: "Marie Park", init: "MP", color: "user-2", at: "EL-MCU-STM32H7" },
    { name: "Ryo Sato", init: "RS", color: "user-3", at: "PCB-R3" },
  ];
  return (
    <div className="inline-flex items-center gap-4 mr-8">
      {team.map((t) => (
        <div
          key={t.name}
          title={
            t.name +
            " \u00B7 " +
            (__t("power.presence.editing") || "editing") +
            " " +
            t.at
          }
          className="relative"
        >
          <span
            className={("ava " + t.color + " w-22 h-22 fs-9").trim()}
            style={{ border: "2px solid var(--bg-elev)" }}
          >
            {t.init}
          </span>
          <span
            className="pos-absolute bg-ok"
            style={{
              bottom: -1,
              right: -1,
              width: 7,
              height: 7,
              borderRadius: 99,
              border: "2px solid var(--bg-elev)",
            }}
          />
        </div>
      ))}
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
