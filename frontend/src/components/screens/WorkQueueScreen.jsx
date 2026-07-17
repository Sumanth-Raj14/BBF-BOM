import React from "react";

import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import { apiRequest } from "../../../api.js";

// WS2 — unified "My Work / Team Work" board wired to /work/* + /teams/* .

const STATUS_COLORS = {
  open: "var(--fg-3)",
  draft: "var(--fg-3)",
  released: "var(--accent-strong)",
  in_progress: "var(--accent-strong)",
  pending_verification: "var(--warn)",
  completed: "var(--ok)",
  closed: "var(--ok)",
  verified: "var(--ok)",
  cancelled: "var(--danger)",
};

function StatusChip({ status }) {
  const color = STATUS_COLORS[status] || "var(--fg-3)";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 10,
        fontSize: 11,
        fontWeight: 600,
        color: "#fff",
        background: color,
        textTransform: "capitalize",
      }}
    >
      {(status || "").replace(/_/g, " ")}
    </span>
  );
}

export default function WorkQueueScreen() {
  const [tab, setTab] = React.useState("mine");
  const [teams, setTeams] = React.useState([]);
  const [selectedTeam, setSelectedTeam] = React.useState(null);
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  const loadTeams = React.useCallback(async () => {
    try {
      const t = await apiRequest("/teams/mine");
      const list = Array.isArray(t) ? t : [];
      setTeams(list);
      setSelectedTeam((cur) => cur || (list[0] ? list[0].id : null));
    } catch (e) {
      // teams are optional for the "My Work" view
    }
  }, []);

  const loadItems = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let res;
      if (tab === "team") {
        if (!selectedTeam) {
          setItems([]);
          return;
        }
        res = await apiRequest(`/work/team/${selectedTeam}`);
      } else {
        res = await apiRequest("/work/my");
      }
      setItems((res && res.items) || []);
    } catch (e) {
      setError(e.message || "Failed to load work items");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [tab, selectedTeam]);

  React.useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  React.useEffect(() => {
    loadItems();
  }, [loadItems]);

  const createTeam = async () => {
    const name = window.prompt("New team name:");
    if (!name) return;
    try {
      await apiRequest("/teams/", { method: "POST", body: JSON.stringify({ name }) });
      toast("Team created", { kind: "success" });
      loadTeams();
    } catch (e) {
      toast("Could not create team: " + (e.message || ""), { kind: "error" });
    }
  };

  const assignToTeam = async (item, teamId) => {
    try {
      await apiRequest("/work/assign", {
        method: "POST",
        body: JSON.stringify({
          item_type: item.type,
          item_id: item.id,
          assigned_team_id: teamId,
        }),
      });
      toast(`${item.ref} assigned to team`, { kind: "success" });
      loadItems();
    } catch (e) {
      toast("Assign failed: " + (e.message || ""), { kind: "error" });
    }
  };

  const cell = { padding: "8px 10px" };

  return (
    <div className="screen-wrap">
      <div className="screen-header">
        <div>
          <h1>{__t("work.title") || "My Work"}</h1>
          <div className="sub">
            {items.length} {items.length === 1 ? "item" : "items"}
            {tab === "team" && selectedTeam
              ? " · " + (teams.find((t) => t.id === selectedTeam)?.name || "team")
              : " · assigned to you or your teams"}
          </div>
        </div>
        <div className="flex gap-8">
          <button
            className={"btn" + (tab === "mine" ? " primary" : "")}
            onClick={() => setTab("mine")}
          >
            My Work
          </button>
          <button
            className={"btn" + (tab === "team" ? " primary" : "")}
            onClick={() => setTab("team")}
          >
            Team Work
          </button>
          {tab === "team" && (
            <select
              className="btn"
              value={selectedTeam || ""}
              onChange={(e) => setSelectedTeam(Number(e.target.value) || null)}
            >
              {teams.length === 0 && <option value="">No teams</option>}
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.member_count})
                </option>
              ))}
            </select>
          )}
          <button className="btn" onClick={createTeam}>
            + New team
          </button>
        </div>
      </div>

      {loading ? (
        <div className="sub" style={{ padding: 40 }}>
          Loading…
        </div>
      ) : error ? (
        <div className="empty" style={{ padding: 60 }}>
          <div className="ico">!</div>
          <h3>{error}</h3>
          <button className="btn" onClick={loadItems}>
            Retry
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="empty" style={{ padding: 80 }}>
          <div className="ico">∅</div>
          <h3>
            Nothing assigned {tab === "team" ? "to this team" : "to you"} yet
          </h3>
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--fg-3)", fontSize: 11 }}>
                <th style={cell}>Ref</th>
                <th style={cell}>Item</th>
                <th style={cell}>Type</th>
                <th style={cell}>Status</th>
                <th style={cell}>Priority</th>
                <th style={cell}>Due</th>
                <th style={cell}>Assign</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr
                  key={it.type + "-" + it.id}
                  style={{ borderTop: "1px solid var(--line)" }}
                >
                  <td
                    style={{
                      ...cell,
                      fontWeight: 600,
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {it.ref}
                  </td>
                  <td style={cell}>{it.title}</td>
                  <td style={{ ...cell, color: "var(--fg-3)" }}>
                    {it.type === "work_order" ? "Work Order" : "CAPA"}
                  </td>
                  <td style={cell}>
                    <StatusChip status={it.status} />
                  </td>
                  <td style={{ ...cell, textTransform: "capitalize" }}>
                    {it.priority || "—"}
                  </td>
                  <td style={{ ...cell, color: "var(--fg-3)" }}>
                    {it.due_date || "—"}
                  </td>
                  <td style={cell}>
                    <select
                      className="btn"
                      value=""
                      onChange={(e) => {
                        const tid = Number(e.target.value);
                        if (tid) assignToTeam(it, tid);
                      }}
                    >
                      <option value="">To team…</option>
                      {teams.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

WorkQueueScreen.displayName = "WorkQueueScreen";
// Self-register on window so LazyScreens can resolve it after dynamic import.
window.WorkQueueScreen = WorkQueueScreen;
