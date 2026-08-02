import PropTypes from "prop-types";
import { navigateTo } from "../../services/navigation.js";

import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import { Icon, api, useAppStore } from "../../globals";
import { Button, Menu, EmptyState, ScreenHeader } from "../ui";
// ============ ACTIVITY ============
//
// Wired to the real backend (api.auditLogs.list — GET /audit-logs, already
// tenant-scoped server-side in app/api/endpoints/audit_logs.py). There is no
// mutate path here — the feed is read-only — so "persist on mutate" doesn't
// apply; "load on mount" + a real polling refresh replace the old
// setInterval() that fabricated random events.
//
// Fields with no backing column are derived honestly from what the audit log
// actually stores, never invented:
//   - `init`/`color` — computed client-side from userEmail (initials +
//                       deterministic hash-to-palette), same idea as the
//                       vendor-initials avatar elsewhere; not stored server-side.
//   - `action` text  — humanized from the raw action string (e.g.
//                       "ECO_APPROVE" -> "approved"); unrecognized actions
//                       fall back to a de-slugged version of the raw value
//                       instead of a made-up phrase.
//   - `note`/`quote` — summarized from the log's real `changes` JSON, blank
//                       when there's nothing there (no placeholder text).

// Maps the semantic color tag on each activity item to the avatar's CSS
// modifier class (kept separate so the underlying palette can live in
// styles.css as tokens/oklch without the JSX caring about class names).
const AVA_COLOR_CLASS = {
  blue: "user-2",
  green: "user-3",
  purple: "user-4",
  gray: "sys",
};

// entityType (AuditLog.ALLOWED_ENTITY_TYPES, backend/app/models/audit_log.py)
// -> the route that screen lives on, so clicking an activity row jumps to
// the right place instead of guessing from label text.
const ENTITY_ROUTE = {
  po: "procurement",
  bom: "bom",
  part: "parts",
  document: "docs",
  vendor: "vendors",
  eco: "ecr",
  ncr: "ncr",
  work_order: "work-orders",
};

const ACTION_PHRASES = {
  create: "created",
  created: "created",
  update: "updated",
  updated: "updated",
  delete: "deleted",
  deleted: "deleted",
  login: "logged in",
  logout: "logged out",
  approve: "approved",
  approved: "approved",
  reject: "rejected",
  rejected: "rejected",
  implement: "implemented",
  implemented: "implemented",
  submit: "submitted",
  submitted: "submitted",
  close: "closed",
  closed: "closed",
  assigned: "assigned",
};

function humanizeAction(action) {
  if (!action) return __t("activity.updated") || "updated";
  const norm = String(action).toLowerCase();
  const parts = norm.split(/[._]+/).filter(Boolean);
  const last = parts[parts.length - 1];
  return (
    ACTION_PHRASES[norm] || ACTION_PHRASES[last] || norm.replace(/[._]+/g, " ")
  );
}

function entityLabel(r) {
  if (r.entityType === "auth") return __t("activity.theirAccount") || "their account";
  if (r.entityName) return r.entityName;
  if (r.entityType) return r.entityType + (r.entityId != null ? " #" + r.entityId : "");
  return "activity #" + r.id;
}

function initialsFromEmail(email) {
  if (!email) return null;
  const namePart = email.split("@")[0];
  const segs = namePart.split(/[._-]+/).filter(Boolean);
  if (segs.length >= 2) return (segs[0][0] + segs[1][0]).toUpperCase();
  return namePart.slice(0, 2).toUpperCase();
}

function colorForKey(key) {
  const palette = ["blue", "green", "purple"];
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length];
}

function summarizeChanges(changes) {
  if (!changes || typeof changes !== "object") return "";
  const entries = Object.entries(changes).filter(([, v]) => v != null && v !== "");
  if (entries.length === 0) return "";
  return entries
    .slice(0, 3)
    .map(([k, v]) => k + ": " + (typeof v === "object" ? JSON.stringify(v) : String(v)))
    .join(" · ")
    .slice(0, 140);
}

function timeAgo(iso) {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "—";
  if (ms < 60000) return __t("activity.justNow") || "just now";
  const min = Math.floor(ms / 60000);
  if (min < 60) return min + " " + (__t("activity.min") || "min");
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr + " " + (__t("activity.hr") || "hr");
  return Math.floor(hr / 24) + " " + (__t("activity.days") || "d");
}

// Maps one raw AuditLog row (see backend/app/schemas/audit_log.py) to the
// shape this screen renders.
function mapAuditLog(r) {
  const email = r.userEmail || null;
  const isSystem = !email && r.userId == null;
  const who = email || (r.userId != null ? "user #" + r.userId : "System");
  const colorKey = email || (r.userId != null ? "u" + r.userId : "system");
  const changes = r.changes && typeof r.changes === "object" ? r.changes : null;
  return {
    id: r.id,
    who,
    email,
    isSystem,
    init: isSystem ? "SY" : initialsFromEmail(email) || "U",
    color: isSystem ? "gray" : colorForKey(colorKey),
    action: humanizeAction(r.action),
    rawAction: r.action || "",
    entityType: r.entityType || "",
    obj: entityLabel(r),
    note: summarizeChanges(changes),
    quote: changes ? changes.reason || changes.message || changes.comment || "" : "",
    time: timeAgo(r.createdAt),
  };
}

export default function ActivityScreen({ data }) {
  const ctx = useAppStore();
  const currentEmail = ctx?.user?.email || null;
  const [filter, setFilter] = React.useState("All");
  const [activityItems, setActivityItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [autoRefresh, setAutoRefresh] = React.useState(true);

  const load = React.useCallback(async (opts) => {
    const background = !!(opts && opts.background);
    if (!background) {
      setLoading(true);
      setError(null);
    }
    try {
      const result = await api.auditLogs.list({ page: 1, per_page: 50 });
      const rows = Array.isArray(result) ? result : result?.items || [];
      setActivityItems(rows.map(mapAuditLog));
      if (background) setError(null);
    } catch (e) {
      // Honest failure — do not fall back to fabricated/sample rows.
      if (background) {
        // A transient poll failure shouldn't nuke a screen full of good
        // data the user is already looking at.
        console.warn("[ActivityScreen] background refresh failed:", e?.message);
      } else {
        setError(e?.message || "Failed to load activity.");
        setActivityItems([]);
      }
    } finally {
      if (!background) setLoading(false);
    }
  }, []);

  React.useEffect(
    function () {
      load();
    },
    [load],
  );

  React.useEffect(
    function () {
      if (!autoRefresh) return;
      const timer = setInterval(function () {
        load({ background: true });
      }, 15000);
      return function () {
        clearInterval(timer);
      };
    },
    [autoRefresh, load],
  );

  const matches = function (a) {
    if (filter === "All") return true;
    if (filter === "Mine only")
      return !!currentEmail && !!a.email && a.email.toLowerCase() === currentEmail.toLowerCase();
    if (filter === "System") return a.isSystem;
    if (filter === "Comments") return a.entityType === "comment";
    if (filter === "Approvals") return /approv|reject|releas/i.test(a.rawAction);
    if (filter === "Edits") return /creat|updat|edit|delet|upload/i.test(a.rawAction);
    return true;
  };
  const filtered = activityItems.filter(matches);

  const filterLabels = [
    __t("activity.filterAll") || "All",
    __t("activity.filterEdits") || "Edits",
    __t("activity.filterApprovals") || "Approvals",
    __t("activity.filterComments") || "Comments",
    __t("activity.filterSystem") || "System",
    __t("activity.filterMineOnly") || "Mine only",
  ];

  return (
    <div className="screen-wrap">
      <ScreenHeader
        title={__t("activity.title") || "Team Activity"}
        description={
          <>
            {filtered.length} {__t("activity.of") || "of"}{" "}
            {activityItems.length} {__t("activity.events") || "events"}
            {filter === "All" ? "" : " · " + filter}
            {autoRefresh
              ? " · " + (__t("activity.autoRefreshing") || "auto-refreshing")
              : ""}
          </>
        }
        actions={
          <div className="flex gap-8">
            <Button
              variant={autoRefresh ? "primary" : "secondary"}
              size="sm"
              aria-pressed={autoRefresh}
              onClick={function () {
                setAutoRefresh(function (v) {
                  return !v;
                });
              }}
            >
              {autoRefresh
                ? __t("activity.autoRefreshOn") || "Auto-refresh ON"
                : __t("activity.autoRefreshOff") || "Auto-refresh OFF"}
            </Button>
            <Menu
              ariaLabel={__t("activity.filterBy") || "Filter activity"}
              trigger={
                <Button variant="secondary" size="sm">
                  {filter} <Icon.ChevronDown size={10} />
                </Button>
              }
              items={filterLabels.map((f) => ({
                icon:
                  f === filter ? (
                    <Icon.Check size={11} />
                  ) : (
                    <span className="w-11" />
                  ),
                label: f,
                onSelect: () => setFilter(f),
              }))}
            />
          </div>
        }
      />
      <div className="feed">
        {loading ? (
          <EmptyState
            title={__t("common.loading") || "Loading activity…"}
          />
        ) : error ? (
          <EmptyState
            icon="!"
            title={error}
            actions={
              <Button variant="secondary" size="sm" onClick={() => load()}>
                {__t("common.retry") || "Retry"}
              </Button>
            }
          />
        ) : activityItems.length === 0 ? (
          <EmptyState
            icon="∅"
            title={__t("activity.noActivityYet") || "No activity yet"}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="∅"
            title={
              __t("activity.noMatchFilter") || "No events match this filter"
            }
            actions={
              <Button variant="secondary" size="sm" onClick={() => setFilter("All")}>
                {__t("activity.showAll") || "Show all"}
              </Button>
            }
          />
        ) : (
          filtered.map((a) => (
            <div key={a.id} className="feed-item">
              <span
                className={
                  "ava " + (AVA_COLOR_CLASS[a.color] || "")
                }
                aria-hidden="true"
              >
                {a.init}
              </span>
              <div className="body">
                <span className="who">{a.who}</span>{" "}
                <span className="what">{a.action}</span>{" "}
                <button
                  type="button"
                  className="obj cursor-pointer"
                  onClick={() => {
                    const route = ENTITY_ROUTE[a.entityType];
                    if (route) {
                      navigateTo(route);
                      return;
                    }
                    // Fall back to guessing from the label text when the
                    // entityType isn't one we have a route mapping for.
                    const obj = (a.obj || "").toLowerCase();
                    if (/po-/.test(obj)) navigateTo("procurement");
                    else if (/v\d/.test(obj)) navigateTo("diff");
                    else if (/^[A-Z]+-/.test(a.obj || "")) navigateTo("bom");
                    else if (/duplicate|part/.test(obj))
                      navigateTo("parts");
                    else if (/\.pdf|\.dwg|\.xlsx/.test(obj))
                      navigateTo("docs");
                    else toast((__t("activity.opening") || "Opening ") + a.obj);
                  }}
                >
                  {a.obj}
                </button>
                {a.note && <span className="what dot-sep">{a.note}</span>}
                {a.quote && <div className="quote">{a.quote}</div>}
              </div>
              <span className="time">{a.time}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
ActivityScreen.propTypes = {
  data: PropTypes.object,
};
