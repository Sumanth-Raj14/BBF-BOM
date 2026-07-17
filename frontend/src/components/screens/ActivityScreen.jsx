import PropTypes from "prop-types";

import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import { DropdownButton } from "../../globals";
// ============ ACTIVITY ============
export default function ActivityScreen({ data }) {
  const [filter, setFilter] = React.useState("All");
  const [activityItems, setActivityItems] = React.useState(data.activity || []);
  const [autoRefresh, setAutoRefresh] = React.useState(true);

  React.useEffect(
    function () {
      if (!autoRefresh) return;
      const timer = setInterval(function () {
        const actions = [
          {
            who: "E. Chen",
            action: "updated cost for",
            obj: "EL-MCU-STM32H7",
            init: "EC",
            color: "blue",
            time: "just now",
            note: "",
          },
          {
            who: "System",
            action: "auto-approved",
            obj: "PO-2026-0312",
            init: "SY",
            color: "gray",
            time: "just now",
            note: "under threshold",
          },
          {
            who: "M. Park",
            action: "commented on",
            obj: "EL-PCB-MAIN-R3",
            init: "MP",
            color: "green",
            time: "just now",
            quote: "Capacitor spacing looks correct for reflow.",
          },
          {
            who: "A. Kumar",
            action: "uploaded",
            obj: "datasheet_MEC-PL-040A.pdf",
            init: "AK",
            color: "purple",
            time: "just now",
          },
          {
            who: "System",
            action: "detected price change for",
            obj: "HW-FAS-M3-08",
            init: "SY",
            color: "gray",
            time: "just now",
            note: "+3.2% from Digi-Key",
          },
        ];
        const pick = actions[Math.floor(Math.random() * actions.length)];
        const newItem = Object.assign({}, pick, { time: "just now" });
        setActivityItems(function (prev) {
          const updated = [newItem].concat(prev);
          return updated.slice(0, 50);
        });
      }, 15000);
      return function () {
        clearInterval(timer);
      };
    },
    [autoRefresh],
  );

  const matches = function (a) {
    if (filter === "All") return true;
    if (filter === "Mine only") return a.who === "E. Chen";
    if (filter === "System") return a.who === "System";
    if (filter === "Comments") return /comment/i.test(a.action);
    if (filter === "Approvals")
      return (
        /approv/i.test(a.action) ||
        /requested approval/i.test(a.action) ||
        /released/i.test(a.action)
      );
    if (filter === "Edits") return /chang|updat|edit|uploaded/i.test(a.action);
    return true;
  };
  const filtered = activityItems.filter(matches);

  return (
    <div className="screen-wrap">
      <div className="screen-header">
        <div>
          <h1>{__t("activity.title") || "Team Activity"}</h1>
          <div className="sub">
            {filtered.length} {__t("activity.of") || "of"}{" "}
            {activityItems.length} {__t("activity.events") || "events"} ·{" "}
            {filter === "All" ? "" : filter + " · "}
            {__t("activity.thisWeek") || "this week"}
            {autoRefresh
              ? " · " + (__t("activity.autoRefreshing") || "auto-refreshing")
              : ""}
          </div>
        </div>
        <div className="flex gap-8">
          <button
            className={"btn" + (autoRefresh ? " primary" : "")}
            onClick={function () {
              setAutoRefresh(function (v) {
                return !v;
              });
            }}
          >
            {autoRefresh
              ? __t("activity.autoRefreshOn") || "Auto-refresh ON"
              : __t("activity.autoRefreshOff") || "Auto-refresh OFF"}
          </button>
          <DropdownButton
            width={180}
            trigger={
              <button className="btn">
                {filter} <Icon.ChevronDown size={10} />
              </button>
            }
            items={[
              __t("activity.filterAll") || "All",
              __t("activity.filterEdits") || "Edits",
              __t("activity.filterApprovals") || "Approvals",
              __t("activity.filterComments") || "Comments",
              __t("activity.filterSystem") || "System",
              __t("activity.filterMineOnly") || "Mine only",
            ].map((f) => ({
              icon:
                f === filter ? (
                  <Icon.Check size={11} />
                ) : (
                  <span className="w-11" />
                ),
              label: f,
              onClick: () => setFilter(f),
            }))}
          />
        </div>
      </div>
      <div className="feed">
        {filtered.length === 0 ? (
          <div className="empty" style={{ padding: 80 }}>
            <div className="ico">∅</div>
            <h3>
              {__t("activity.noMatchFilter") || "No events match this filter"}
            </h3>
            <button className="btn" onClick={() => setFilter("All")}>
              {__t("activity.showAll") || "Show all"}
            </button>
          </div>
        ) : (
          filtered.map((a, i) => (
            <div key={a.who + "-" + a.time + "-" + i} className="feed-item">
              <span className={"ava " + a.color}>{a.init}</span>
              <div className="body">
                <span className="who">{a.who}</span>{" "}
                <span className="what">{a.action}</span>{" "}
                <span
                  className="obj cursor-pointer"
                  onClick={() => {
                    // Route to appropriate view based on obj content
                    const obj = a.obj.toLowerCase();
                    if (/po-/.test(obj)) window.__nav?.("procurement");
                    else if (/v\d/.test(obj)) window.__nav?.("diff");
                    else if (/^[A-Z]+-/.test(a.obj)) window.__nav?.("bom");
                    else if (/duplicate|part/.test(obj))
                      window.__nav?.("parts");
                    else if (/\.pdf|\.dwg|\.xlsx/.test(obj))
                      window.__nav?.("docs");
                    else toast("Opening " + a.obj);
                  }}
                >
                  {a.obj}
                </span>
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
