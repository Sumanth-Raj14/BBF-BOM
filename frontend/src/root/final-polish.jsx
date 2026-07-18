import PropTypes from "prop-types";
import { storage } from "../utils/storage.js";
import { __t } from "../i18n";
import { toast } from "../utils/toast";
import {
  Button,
  Field,
  Textarea,
  Checkbox,
  DataTable,
  Badge,
  StatusPill,
  Tabs,
  Modal,
  EmptyState,
  ScreenHeader,
} from "../components/ui";
// Final polish layer: Approvals inbox, Roadmap, Bulk vendor import,
// Offline indicator, URL-synced filters, Saved searches, Notif prefs, PO PDF.
// ============ APPROVALS INBOX ============
const APPROVALS_FILTER_TABS_ID = "approvals-filter-tabs";
function ApprovalsScreen() {
  const ctx = useAppStore();
  const [filter, setFilter] = React.useState("all");
  const approvalsList = React.useMemo(() => {
    const out = [];
    if (ctx?.approvals) {
      Object.entries(ctx.approvals).forEach(([pn, stages]) => {
        Object.entries(stages).forEach(([role, status]) => {
          if (status !== "approved") {
            out.push({
              kind: "BOM Revision",
              target: pn,
              role,
              status,
              requester: "M. Park",
              date: "2026-05-24",
              value: null,
            });
          }
        });
      });
    }
    out.push(
      {
        kind: "Purchase Order",
        target: "PO-2026-0491",
        role: "procurement",
        status: "pending",
        requester: "K. Singh",
        date: "2026-05-25",
        value: 174300,
      },
      {
        kind: "Purchase Order",
        target: "PO-2026-0488",
        role: "finance",
        status: "pending",
        requester: "K. Singh",
        date: "2026-05-25",
        value: 89400,
      },
      {
        kind: "Vendor Onboarding",
        target: "Bossard GmbH",
        role: "procurement",
        status: "pending",
        requester: "E. Chen",
        date: "2026-05-23",
        value: null,
      },
      {
        kind: "Part Release",
        target: "OPT-LNS-25MM Rev B",
        role: "engineering",
        status: "pending",
        requester: "R. Sato",
        date: "2026-05-22",
        value: null,
      },
      {
        kind: "Cost Variance",
        target: "EL-PSU-240W +12%",
        role: "finance",
        status: "pending",
        requester: "System",
        date: "2026-05-22",
        value: 8400,
      },
    );
    return out;
  }, [ctx?.approvals]);
  const matchesFilter = (a, f) =>
    f === "all" ? true : f === "mine" ? a.role === "engineering" : a.role === f;
  const FILTERS = [
    { value: "all", label: __t("approvals.filterAll") || "All" },
    { value: "mine", label: __t("approvals.filterMine") || "Mine" },
    {
      value: "engineering",
      label: __t("approvals.filterEngineering") || "Engineering",
    },
    {
      value: "procurement",
      label: __t("approvals.filterProcurement") || "Procurement",
    },
    { value: "finance", label: __t("approvals.filterFinance") || "Finance" },
  ];
  const tabItems = FILTERS.map((f) => ({
    ...f,
    count: approvalsList.filter((a) => matchesFilter(a, f.value)).length,
  }));
  const filtered = approvalsList.filter((a) => matchesFilter(a, filter));
  const act = (a, action) => {
    if (
      action === "approve" &&
      a.kind === "BOM Revision" &&
      ctx?.setApprovals
    ) {
      const next = { ...ctx.approvals };
      next[a.target] = { ...next[a.target], [a.role]: "approved" };
      ctx.setApprovals(next);
    }
    toast(
      `${action === "approve" ? __t("common.approved") || "Approved" : __t("common.rejected") || "Rejected"} · ${a.target}`,
      { kind: action === "approve" ? "success" : "warn" },
    );
  };
  const columns = [
    {
      key: "kind",
      header: __t("approvals.columnType") || "Type",
      render: (a) => (
        <Badge tone="neutral" pill>
          {a.kind}
        </Badge>
      ),
    },
    {
      key: "target",
      header: __t("approvals.columnItem") || "Item",
      render: (a) => (
        <div>
          <div className="fw-600 fs-13">{a.target}</div>
          <div className="font-mono fs-10 fg-3 mt-2">
            {__t("approvals.requestInfo", {
              requester: a.requester,
              date: a.date,
              role: a.role.toUpperCase(),
            }) ||
              `Requested by ${a.requester} · ${a.date} · Awaiting ${a.role.toUpperCase()}`}
            {a.value && (
              <>
                {" "}
                · <strong className="fg">{INR(a.value, 0)}</strong>
              </>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "status",
      header: __t("approvals.columnStatus") || "Status",
      render: (a) => <StatusPill status={a.status} />,
    },
    {
      key: "actions",
      header: "",
      render: (a) => (
        <div className="flex gap-6 justify-end">
          <Button variant="secondary" size="sm" onClick={() => act(a, "reject")}>
            {__t("common.reject") || "Reject"}
          </Button>
          <Button variant="primary" size="sm" onClick={() => act(a, "approve")}>
            <Icon.Check size={11} /> {__t("common.approve") || "Approve"}
          </Button>
        </div>
      ),
    },
  ];
  return (
    <div className="screen-wrap" data-screen-label="Approvals">
      <ScreenHeader
        title={__t("approvals.title") || "Approvals Inbox"}
        description={
          __t("approvals.subtitle", { count: filtered.length }) ||
          `${filtered.length} pending across BOMs, POs, vendors, and parts`
        }
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                toast(
                  __t("approvals.subscribed") ||
                    "Subscribed · email + Slack alerts on",
                )
              }
            >
              <Icon.Bell size={12} />{" "}
              {__t("approvals.notifySettings") || "Notify settings"}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                filtered.forEach((a) => act(a, "approve"));
                toast(
                  __t("approvals.bulkApproved", { count: filtered.length }) ||
                    `Bulk approved ${filtered.length} items`,
                  { kind: "success" },
                );
              }}
            >
              <Icon.Check size={12} />{" "}
              {__t("approvals.approveAll") || "Approve all visible"}
            </Button>
          </>
        }
      />
      <div className="mb-14">
        <Tabs
          id={APPROVALS_FILTER_TABS_ID}
          ariaLabel={__t("approvals.filterBy") || "Filter approvals"}
          value={filter}
          onChange={setFilter}
          items={tabItems}
        />
      </div>
      {filtered.length === 0 ? (
        <EmptyState
          icon="✓"
          title={__t("approvals.emptyTitle") || "Inbox zero"}
          message={
            __t("approvals.emptyDescription") ||
            "You're all caught up. New approval requests will appear here."
          }
        />
      ) : (
        <div style={{ maxHeight: "calc(100vh - 260px)", overflow: "auto" }}>
          <DataTable
            columns={columns}
            rows={filtered}
            getRowKey={(a) => a.target + "-" + a.kind}
            ariaLabel={__t("approvals.title") || "Approvals Inbox"}
          />
        </div>
      )}
    </div>
  );
}
// ============ ROADMAP MODAL ============
function RoadmapModal({ open, onClose }) {
  const items = [
    {
      q: __t("roadmap.now") || "Now (v3.x)",
      color: "var(--ok)",
      items: [
        __t("roadmap.nowItem1") || "BOM editor + procurement",
        __t("roadmap.nowItem2") || "Vendor management",
        __t("roadmap.nowItem3") || "OCR + auto-scrape",
        __t("roadmap.nowItem4") || "Multi-project workspace",
        __t("roadmap.nowItem5") || "Audit log + API keys",
      ],
    },
    {
      q: __t("roadmap.next") || "Next (Q3 2026)",
      color: "var(--accent-text)",
      items: [
        __t("roadmap.nextItem1") || "ERP integration (NetSuite, SAP)",
        __t("roadmap.nextItem2") || "Inventory management v2 (multi-warehouse)",
        __t("roadmap.nextItem3") || "Supplier portal (vendor self-service)",
        __t("roadmap.nextItem4") || "Auto-generated RFQs from low stock",
      ],
    },
    {
      q: __t("roadmap.later") || "Later (Q4 2026)",
      color: "var(--info)",
      items: [
        __t("roadmap.laterItem1") || "AI procurement recommendations",
        __t("roadmap.laterItem2") || "Forecasting + shortage prediction",
        __t("roadmap.laterItem3") || "Part interchangeability suggestions",
        __t("roadmap.laterItem4") || "Poka-yoke validation rules",
      ],
    },
    {
      q: __t("roadmap.future") || "Future (2027)",
      color: "var(--fg-3)",
      items: [
        __t("roadmap.futureItem1") || "Native iOS / Android scanner app",
        __t("roadmap.futureItem2") || "Approval automation engine",
        __t("roadmap.futureItem3") || "BOM cost simulation sandbox",
        __t("roadmap.futureItem4") ||
          "Sustainability + carbon footprint tracking",
      ],
    },
  ];
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Sparkles size={16} />}
      title={__t("roadmap.title") || "Product Roadmap"}
      subtitle={__t("roadmap.subtitle") || "What we're building next"}
      size="xl"
    >
      <div
        className="d-grid gap-12"
        style={{ gridTemplateColumns: "repeat(4, 1fr)" }}
      >
        {items.map((col) => (
          <div
            key={col.q}
            className="bg-sunk border-line rounded-r3"
            style={{ padding: 12 }}
          >
            <div
              className="font-mono fs-10 fw-700 letter-sp-6 uppercase mb-12 pb-8"
              style={{
                color: col.color,
                borderBottom: "2px solid " + col.color,
              }}
            >
              {col.q}
            </div>
            {col.items.map((it) => (
              <div
                key={it}
                className="bg-canvas rounded-r2 mb-6 fs-12 border-line"
                style={{ padding: "8px 10px" }}
              >
                {it}
              </div>
            ))}
            {col.q.startsWith("Future") && (
              <Button
                variant="secondary"
                size="sm"
                block
                className="mt-8 justify-center"
                onClick={() =>
                  toast(
                    __t("roadmap.voteRecorded") ||
                      "Vote recorded · we'll prioritize based on demand",
                  )
                }
              >
                <Icon.Sparkles size={11} /> {__t("roadmap.vote") || "Vote"}
              </Button>
            )}
          </div>
        ))}
      </div>
      <div
        className="mt-14 bg-sunk rounded-r2 text-center fs-11 fg-3"
        style={{ padding: 12, border: "1px dashed var(--line)" }}
      >
        {__t("roadmap.suggestPrefix") || "Have an idea?"}{" "}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            onClose();
            toast(
              __t("roadmap.ideaSubmitted") ||
                "Idea submitted · thank you!",
            );
          }}
        >
          {__t("roadmap.suggestAction") || "Suggest a feature →"}
        </Button>
      </div>
    </Modal>
  );
}
RoadmapModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
};
// ============ BULK VENDOR IMPORT ============
function BulkVendorImportModal({ open, onClose }) {
  const ctx = useAppStore();
  const [step, setStep] = React.useState("upload");
  const [csvText, setCsvText] = React.useState("");
  const [rows, setRows] = React.useState([]);
  const [, setHeaders] = React.useState([]);
  const [mapping, setMapping] = React.useState({});
  React.useEffect(() => {
    if (open) {
      setStep("upload");
      setCsvText("");
      setRows([]);
    }
  }, [open]);
  const FIELDS = ["name", "country", "lead", "moq", "rating", "terms", "risk"];
  const loadSample = () => {
    const sample = `Vendor Name,Country,Lead Days,MOQ,Rating,Terms,Risk
Würth Elektronik,DE,12,25,4.7,Net 30,Low
TDK Corporation,JP,21,100,4.6,Net 45,Low
Murata,JP,28,500,4.8,Net 45,Low
Texas Instruments,US,18,1,4.7,Net 30,Low
LCSC Electronics,CN,7,1,4.2,Prepaid,Med`;
    parseCSV(sample);
  };
  const parseCSV = (text) => {
    const lines = text.trim().split(/\r?\n/);
    const hdrs = lines[0].split(",").map((h) => h.trim());
    const data = lines.slice(1).map((l) => l.split(",").map((c) => c.trim()));
    setHeaders(hdrs);
    setRows(data);
    const m = {};
    hdrs.forEach((h, i) => {
      const l = h.toLowerCase();
      if (/name/.test(l)) m.name = i;
      if (/country/.test(l)) m.country = i;
      if (/lead/.test(l)) m.lead = i;
      if (/moq|min.?order/.test(l)) m.moq = i;
      if (/rating|score/.test(l)) m.rating = i;
      if (/terms|payment/.test(l)) m.terms = i;
      if (/risk/.test(l)) m.risk = i;
    });
    setMapping(m);
    setStep("review");
  };
  const apply = () => {
    if (ctx?.setVendors) {
      const newVendors = rows.map((r, i) => ({
        id: "vi" + Date.now() + i,
        name: r[mapping.name] || __t("vendor.unnamed") || "Unnamed",
        country: r[mapping.country] || "—",
        lead: Number(r[mapping.lead]) || 14,
        moq: Number(r[mapping.moq]) || 1,
        rating: Number(r[mapping.rating]) || 4.0,
        terms: r[mapping.terms] || "Net 30",
        risk: r[mapping.risk] || "Low",
        parts: 0,
        preferred: false,
      }));
      ctx.setVendors([...ctx.vendors, ...newVendors]);
    }
    onClose();
    toast(
      __t("vendor.imported", { count: rows.length }) ||
        `Imported ${rows.length} vendors`,
      { kind: "success" },
    );
  };
  const reviewColumns = FIELDS.map((f) => ({
    key: f,
    header: f,
    render: (r) => r[mapping[f]] || "—",
  }));
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Vendor size={16} />}
      title={__t("vendor.bulkImport.title") || "Bulk import vendors"}
      subtitle={
        step === "upload"
          ? __t("vendor.bulkImport.uploadSubtitle") ||
            "Drop a CSV or use sample"
          : __t("vendor.bulkImport.reviewSubtitle", { count: rows.length }) ||
            `Review ${rows.length} vendors`
      }
      size="xl"
      footer={
        step === "review" ? (
          <>
            <Button variant="secondary" onClick={() => setStep("upload")}>
              {__t("common.back") || "Back"}
            </Button>
            <Button variant="primary" onClick={apply}>
              <Icon.Check size={12} />{" "}
              {__t("vendor.bulkImport.import", { count: rows.length }) ||
                `Import ${rows.length}`}
            </Button>
          </>
        ) : null
      }
    >
      {step === "upload" && (
        <>
          <Field
            label={__t("vendor.bulkImport.csvLabel") || "Vendor CSV"}
            htmlFor="vendor-csv"
          >
            <Textarea
              id="vendor-csv"
              name="vendorCsv"
              className="font-mono"
              style={{ minHeight: 180 }}
              placeholder={
                __t("vendor.bulkImport.csvPlaceholder") ||
                "Vendor Name,Country,Lead Days,MOQ,Rating,Terms,Risk"
              }
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
            />
          </Field>
          <div className="flex justify-between mt-12">
            <Button variant="secondary" size="sm" onClick={loadSample}>
              <Icon.Sparkles size={11} />{" "}
              {__t("vendor.bulkImport.useSample") || "Use sample data"}
            </Button>
            <Button
              variant="primary"
              onClick={() => parseCSV(csvText)}
              disabled={!csvText.trim()}
            >
              {__t("vendor.bulkImport.parse") || "Parse →"}
            </Button>
          </div>
        </>
      )}
      {step === "review" && (
        <div style={{ maxHeight: 360, overflow: "auto" }}>
          <DataTable
            columns={reviewColumns}
            rows={rows}
            getRowKey={(r, i) => "row-" + i}
            dense
            ariaLabel={
              __t("vendor.bulkImport.reviewTable") || "Vendors to import"
            }
          />
        </div>
      )}
    </Modal>
  );
}
BulkVendorImportModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
};
// ============ NOTIFICATION PREFERENCES ============
function NotifPrefsModal({ open, onClose }) {
  const [prefs, setPrefs] = React.useState(
    () =>
      storage.notifPrefs.get() || {
        mentions: { inapp: true, email: true, slack: false },
        approvals: { inapp: true, email: true, slack: true },
        cost_alerts: { inapp: true, email: false, slack: false },
        supply_risk: { inapp: true, email: true, slack: true },
        weekly_digest: { inapp: false, email: true, slack: false },
        new_vendors: { inapp: false, email: false, slack: false },
      },
  );
  const toggle = (event, channel) => {
    const next = {
      ...prefs,
      [event]: { ...prefs[event], [channel]: !prefs[event][channel] },
    };
    setPrefs(next);
  };
  const save = () => {
    storage.notifPrefs.set(prefs);
    onClose();
    toast(__t("notifications.saved") || "Notification preferences saved", {
      kind: "success",
    });
  };
  const events = [
    [
      "mentions",
      __t("notifications.eventMentions") || "@ Mentions",
      __t("notifications.eventMentionsDesc") ||
        "When someone tags you in a comment",
    ],
    [
      "approvals",
      __t("notifications.eventApprovals") || "Approval requests",
      __t("notifications.eventApprovalsDesc") ||
        "Approvals awaiting your action",
    ],
    [
      "cost_alerts",
      __t("notifications.eventCostAlerts") || "Cost alerts",
      __t("notifications.eventCostAlertsDesc") ||
        "When a part's cost changes >10%",
    ],
    [
      "supply_risk",
      __t("notifications.eventSupplyRisk") || "Supply chain risk",
      __t("notifications.eventSupplyRiskDesc") ||
        "Lead-time spikes, vendor issues",
    ],
    [
      "weekly_digest",
      __t("notifications.eventWeeklyDigest") || "Weekly digest",
      __t("notifications.eventWeeklyDigestDesc") ||
        "Mon morning summary of activity",
    ],
    [
      "new_vendors",
      __t("notifications.eventNewVendors") || "New vendor onboarded",
      __t("notifications.eventNewVendorsDesc") ||
        "When a vendor joins the workspace",
    ],
  ];
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Bell size={16} />}
      title={__t("notifications.prefsTitle") || "Notification preferences"}
      subtitle={
        __t("notifications.prefsSubtitle") ||
        "Choose where you get notified for each event"
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {__t("common.cancel") || "Cancel"}
          </Button>
          <Button variant="primary" onClick={save}>
            {__t("notifications.savePrefs") || "Save preferences"}
          </Button>
        </>
      }
    >
      <div
        className="d-grid items-center border-line rounded-r2 overflow-h"
        style={{ gridTemplateColumns: "1fr 60px 60px 60px", gap: 0 }}
      >
        <div
          className="bg-sunk font-mono fs-9 uppercase letter-sp-6 fg-3"
          style={{ padding: "10px 12px" }}
        >
          {__t("notifications.columnEvent") || "Event"}
        </div>
        <div
          className="bg-sunk text-center font-mono fs-9 uppercase fg-3"
          style={{ padding: "10px 12px" }}
        >
          {__t("notifications.columnInApp") || "In-app"}
        </div>
        <div
          className="bg-sunk text-center font-mono fs-9 uppercase fg-3"
          style={{ padding: "10px 12px" }}
        >
          {__t("notifications.columnEmail") || "Email"}
        </div>
        <div
          className="bg-sunk text-center font-mono fs-9 uppercase fg-3"
          style={{ padding: "10px 12px" }}
        >
          {__t("notifications.columnSlack") || "Slack"}
        </div>
        {events.map(([key, name, desc], i) => (
          <React.Fragment key={key}>
            <div
              style={{
                padding: "10px 12px",
                borderTop: "1px solid var(--line-soft)",
              }}
            >
              <div className="fw-500 fs-12">{name}</div>
              <div className="font-mono fs-10 fg-3 mt-2">{desc}</div>
            </div>
            {["inapp", "email", "slack"].map((ch) => (
              <div
                key={ch}
                className="flex justify-center"
                style={{ padding: 10, borderTop: "1px solid var(--line-soft)" }}
              >
                <Checkbox
                  id={"notif-" + key + "-" + ch}
                  name={"notif_" + key + "_" + ch}
                  checked={prefs[key][ch]}
                  onChange={() => toggle(key, ch)}
                  aria-label={name + " " + ch}
                />
              </div>
            ))}
          </React.Fragment>
        ))}
      </div>
      <div
        className="mt-14 bg-sunk border-line rounded-r2 fs-11 fg-3 flex justify-between"
        style={{ padding: 10 }}
      >
        <span>{__t("notifications.quietHours") || "Quiet hours"}</span>
        <span className="font-mono">
          {__t("notifications.quietHoursValue") ||
            "8pm — 8am IST · weekends off"}
        </span>
      </div>
    </Modal>
  );
}
NotifPrefsModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
};
// ============ OFFLINE INDICATOR / NETWORK STATUS ============
function NetworkBadge() {
  const [online, setOnline] = React.useState(navigator.onLine);
  const [simulate, setSimulate] = React.useState(false);
  React.useEffect(() => {
    const onOff = () => setOnline(navigator.onLine);
    window.addEventListener("online", onOff);
    window.addEventListener("offline", onOff);
    return () => {
      window.removeEventListener("online", onOff);
      window.removeEventListener("offline", onOff);
    };
  }, []);
  const effective = !simulate && online;
  // Expose toggle for demo
  React.useEffect(() => {
    window.__toggleOffline = () => setSimulate((s) => !s);
    return () => {
      delete window.__toggleOffline;
    };
  }, []);
  if (effective) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        bottom: 12,
        left: "50%",
        transform: "translateX(-50%)",
        background: "var(--warn)",
        color: "white",
        padding: "6px 14px",
        borderRadius: 99,
        fontSize: 11,
        fontFamily: "var(--font-mono)",
        letterSpacing: "0.06em",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        zIndex: 200,
        boxShadow: "var(--shadow-md)",
      }}
    >
      <span
        aria-hidden="true"
        className="w-8 h-8"
        style={{
          borderRadius: 99,
          background: "white",
          animation: "pulse 1s infinite",
        }}
      />
      {__t("network.offline") ||
        "OFFLINE · Changes saved locally and will sync when reconnected"}
      {simulate && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSimulate(false)}
          className="ml-6"
          style={{ color: "white" }}
        >
          {__t("network.reconnect") || "Reconnect"}
        </Button>
      )}
    </div>
  );
}
// ============ PO PDF (templated, professional layout) ============
window.printPO = function (item, vendor) {
  if (!item) return;
  const lineCost = (item.qty || 0) * (item.cost || 12);
  const tax = lineCost * 0.08;
  const ship = 12.5;
  const total = lineCost + tax + ship;
  const poNum = String(item.pn ? item.pn.charCodeAt(0) * 7 : 491).padStart(
    4,
    "0",
  );
  const poTitle = item.pn
    ? "PO · " + item.pn
    : __t("printPo.title") || "Purchase Order";
  const h = escapeHtml;
  const html =
    "<!doctype html><html><head><title>" +
    h(poTitle) +
    "</title>" +
    "<style>@page{size:A4;margin:16mm}body{font-family:-apple-system,sans-serif;color:#000;font-size:11px;margin:0;padding:20px}" +
    ".head{display:grid;grid-template-columns:1fr 200px;gap:20px;padding-bottom:16px;border-bottom:3px solid #000}" +
    ".logo{font-family:monospace;font-weight:700;letter-spacing:0.18em;font-size:14px}h1{font-size:28px;margin:4px 0 0;font-weight:700}" +
    ".meta-box{font-family:monospace;font-size:10px}.meta-box .row{display:flex;justify-content:space-between;padding:3px 0}" +
    ".meta-box strong{color:#000}.parties{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin:20px 0}" +
    ".party h3{font-family:monospace;font-size:9px;text-transform:uppercase;letter-spacing:0.08em;color:#888;margin:0 0 6px}" +
    ".party .name{font-weight:700;font-size:14px;margin-bottom:4px}.party div{font-size:11px;color:#444}" +
    "table{width:100%;border-collapse:collapse;margin:20px 0}" +
    "th{text-align:left;padding:8px 10px;background:#f5f5f5;font-family:monospace;font-size:9px;text-transform:uppercase;letter-spacing:0.06em}" +
    "td{padding:8px 10px;border-bottom:1px solid #eee}td.r{text-align:right;font-family:monospace}" +
    ".totals{display:flex;justify-content:flex-end}.totals table{width:300px}" +
    ".totals td{border:none;padding:4px 0;font-family:monospace}" +
    ".totals .total td{border-top:2px solid #000;padding-top:8px;font-weight:700;font-size:14px}" +
    ".terms{margin-top:30px;padding:14px;background:#fafafa;border-left:3px solid #000;font-size:10px;line-height:1.6}" +
    ".foot{margin-top:40px;display:flex;justify-content:space-between;font-size:9px;color:#666;padding-top:14px;border-top:1px solid #ddd}" +
    ".sign-row{margin-top:30px;display:grid;grid-template-columns:1fr 1fr;gap:50px}" +
    ".sign-row .sig{padding-top:30px;border-top:1px solid #000;font-size:10px;color:#666}</style></head><body>" +
    "<div class='head'><div><div class='logo'>BLACKBOX FACTORIES</div><h1>" +
    h(__t("common.purchaseOrder") || "Purchase Order") +
    "</h1></div>" +
    "<div class='meta-box'>" +
    "<div class='row'><span>" +
    h(__t("printPo.poNumber") || "PO Number") +
    "</span><strong>PO-2026-" +
    h(poNum) +
    "</strong></div>" +
    "<div class='row'><span>" +
    h(__t("printPo.issueDate") || "Issue Date") +
    "</span><strong>" +
    new Date().toISOString().slice(0, 10) +
    "</strong></div>" +
    "<div class='row'><span>" +
    h(__t("printPo.requiredBy") || "Required By") +
    "</span><strong>" +
    h(item.eta || __t("printPo.tbd") || "TBD") +
    "</strong></div>" +
    "<div class='row'><span>" +
    h(__t("printPo.currency") || "Currency") +
    "</span><strong>INR</strong></div>" +
    "<div class='row'><span>" +
    h(__t("printPo.status") || "Status") +
    "</span><strong style='color:#b8480f'>" +
    h(__t("printPo.issued") || "ISSUED") +
    "</strong></div>" +
    "</div></div>" +
    "<div class='parties'>" +
    "<div class='party'><h3>" +
    h(__t("printPo.vendor") || "Vendor") +
    "</h3><div class='name'>" +
    h(item.vendor || "Mean Well") +
    "</div>" +
    "<div>orders@" +
    h((item.vendor || "vendor").toLowerCase().replace(/\s+/g, "")) +
    ".com</div>" +
    "<div>1234 Industrial Park</div><div>" +
    h(vendor?.country || "TW") +
    "</div></div>" +
    "<div class='party'><h3>" +
    h(__t("printPo.shipTo") || "Ship to") +
    "</h3><div class='name'>" +
    h(__t("printPo.shipToName") || "Blackbox Factories · Receiving") +
    "</div>" +
    "<div>2451 Engineering Way</div><div>Mountain View, CA 94043 · USA</div><div>" +
    h(__t("printPo.attn") || "Attn: Receiving Dock") +
    "</div></div>" +
    "</div>" +
    "<table><thead><tr><th>" +
    h(__t("printPo.table.partNo") || "Part No.") +
    "</th><th>" +
    h(__t("printPo.table.description") || "Description") +
    "</th><th class='r'>" +
    h(__t("printPo.table.qty") || "Qty") +
    "</th><th class='r'>" +
    h(__t("printPo.table.unit") || "Unit (₹)") +
    "</th><th class='r'>" +
    h(__t("printPo.table.ext") || "Ext. (₹)") +
    "</th></tr></thead>" +
    "<tbody><tr><td style='font-weight:600'>" +
    h(item.pn) +
    "</td><td>" +
    h(item.name) +
    "</td><td class='r'>" +
    h(item.qty) +
    "</td>" +
    "<td class='r'>₹" +
    ((item.cost || 12) * (window.INR_RATE || 83)).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
    }) +
    "</td>" +
    "<td class='r' style='font-weight:600'>₹" +
    (lineCost * (window.INR_RATE || 83)).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
    }) +
    "</td></tr></tbody></table>" +
    "<div class='totals'><table>" +
    "<tr><td>" +
    h(__t("printPo.subtotal") || "Subtotal") +
    "</td><td class='r'>₹" +
    (lineCost * (window.INR_RATE || 83)).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
    }) +
    "</td></tr>" +
    "<tr><td>" +
    h(__t("printPo.tax") || "Tax (GST 18%)") +
    "</td><td class='r'>₹" +
    (tax * (window.INR_RATE || 83)).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
    }) +
    "</td></tr>" +
    "<tr><td>" +
    h(__t("printPo.shipping") || "Shipping") +
    "</td><td class='r'>₹" +
    (ship * (window.INR_RATE || 83)).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
    }) +
    "</td></tr>" +
    "<tr class='total'><td>" +
    h(__t("printPo.total") || "TOTAL") +
    "</td><td class='r'>₹" +
    (total * (window.INR_RATE || 83)).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
    }) +
    "</td></tr>" +
    "</table></div>" +
    "<div class='terms'><strong>" +
    h(__t("printPo.termsLabel") || "Terms & Conditions:") +
    "</strong> " +
    h(
      __t("printPo.termsBody") ||
        "Payment Net 30 from receipt of invoice. Goods must conform to specifications, RoHS-compliant, with country-of-origin labelling. Late delivery beyond ETA may incur 0.5%/week penalty. All items subject to inspection at receiving. Reference PO number on packing slip and invoice.",
    ) +
    "</div>" +
    "<div class='sign-row'><div class='sig'>" +
    h(
      __t("printPo.authorizedBy") ||
        "Authorized by Buyer · K. Singh, Procurement Lead",
    ) +
    "</div><div class='sig'>" +
    h(__t("printPo.acknowledgedBy") || "Acknowledged by Vendor · Date") +
    "</div></div>" +
    "<div class='foot'><span>" +
    h(
      __t("printPo.footerLeft") ||
        "Blackbox Factories · GST 29AABCB1234C1Z5",
    ) +
    "</span><span>" +
    h(__t("printPo.footerRight") || "Page 1 of 1 · Generated ") +
    new Date().toLocaleString() +
    "</span></div>" +
    "<script>setTimeout(function(){window.print()},400)<\/script></body></html>";
  openPrintWindow("PO Print", html, {
    features: "width=800,height=600",
    printDelay: 400,
  });
  toast(__t("printPo.previewOpened") || "PO PDF preview opened", {
    kind: "success",
  });
};
// ============ URL FILTER SYNC HOOK ============
export function useURLState(key, initial) {
  const [val, setVal] = React.useState(() => {
    const p = new URLSearchParams(window.location.search);
    const v = p.get(key);
    return v != null ? v : initial;
  });
  React.useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (val === initial || val === "" || val == null) p.delete(key);
    else p.set(key, String(val));
    const q = p.toString();
    history.replaceState(null, "", q ? "?" + q : window.location.pathname);
  }, [val, key, initial]);
  return [val, setVal];
}
window.useURLState = useURLState;
// ============ SAVED SEARCHES (for ⌘K) ============
export const SAVED_SEARCHES_KEY = storage.KEYS.SAVED_SEARCHES;
window.SAVED_SEARCHES_KEY = SAVED_SEARCHES_KEY;
export function getSavedSearches() {
  return storage.savedSearches.get();
}
window.getSavedSearches = getSavedSearches;
export function saveSavedSearch(q) {
  const list = getSavedSearches();
  if (list.includes(q) || !q.trim()) return;
  list.unshift(q);
  storage.savedSearches.set(list.slice(0, 8));
}
window.saveSavedSearch = saveSavedSearch;
export {
  ApprovalsScreen,
  RoadmapModal,
  BulkVendorImportModal,
  NotifPrefsModal,
  NetworkBadge,
};
Object.assign(window, {
  ApprovalsScreen,
  RoadmapModal,
  BulkVendorImportModal,
  NotifPrefsModal,
  NetworkBadge,
});
