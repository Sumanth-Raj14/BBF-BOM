import PropTypes from "prop-types";

import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import { api } from "../../../api.js";
import { Icon } from "../../globals";
import { Button, EmptyState, ScreenHeader, StatusPill } from "../ui";
import { DataTable } from "../ui/DataTable.jsx";

// ============ MEMBERS & PRIVILEGES ============
//
// Team members and their role assignments. The backend has always had the full
// surface for this (GET/POST /users, PATCH/DELETE /users/{id}, GET /rbac/roles,
// POST /rbac/roles/assign-user|unassign-user) but nothing in the UI called it,
// so there was no way to add a member or change privileges without touching the
// database directly. This screen is that missing surface.
//
// Scope note: privileges are managed by assigning ROLES, which is how this
// system models permissions (a role carries permissions; users carry roles).
// Editing the permission set OF a role is a separate admin concern and is not
// done here.
export default function MembersScreen() {
  const [members, setMembers] = React.useState([]);
  const [roles, setRoles] = React.useState([]);
  const [rolesByUser, setRolesByUser] = React.useState({});
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [search, setSearch] = React.useState("");
  const [busyId, setBusyId] = React.useState(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [userRes, roleRes] = await Promise.all([
        api.users.list({ per_page: 200 }),
        api.rbac.roles(),
      ]);
      const userList = userRes?.items || userRes?.data || [];
      const roleList = Array.isArray(roleRes) ? roleRes : roleRes?.items || [];
      setMembers(userList);
      setRoles(roleList);

      // There is no "roles for user" endpoint, only "users for role", so build
      // the reverse index once from the role side rather than N calls per user.
      const index = {};
      const perRole = await Promise.all(
        roleList.map((r) =>
          api.rbac
            .roleUsers(r.id)
            .then((res) => ({ role: r, users: res?.items || res || [] }))
            .catch(() => ({ role: r, users: [] })),
        ),
      );
      perRole.forEach(({ role, users }) => {
        (users || []).forEach((u) => {
          const uid = u.id ?? u.userId ?? u.user_id;
          if (uid == null) return;
          index[uid] = index[uid] || [];
          index[uid].push(role);
        });
      });
      setRolesByUser(index);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const setRoleForMember = async (member, roleId) => {
    const current = rolesByUser[member.id] || [];
    const next = roles.find((r) => String(r.id) === String(roleId));
    setBusyId(member.id);
    try {
      // Assign the new role first, then drop the previous ones, so a failure
      // never leaves the member with no role at all.
      if (next) await api.rbac.assignUser(member.id, next.id);
      for (const prev of current) {
        if (!next || prev.id !== next.id) {
          await api.rbac.unassignUser(member.id, prev.id);
        }
      }
      toast(
        (__t("members.roleUpdated") || "Role updated for") + " " + member.email,
        { kind: "success" },
      );
      await load();
    } catch (e) {
      toast(
        (__t("members.roleUpdateFailed") || "Could not update role") +
          ": " +
          (e?.message || String(e)),
        { kind: "error" },
      );
    } finally {
      setBusyId(null);
    }
  };

  const toggleActive = async (member) => {
    setBusyId(member.id);
    try {
      await api.users.update(member.id, { isActive: !member.isActive });
      await load();
    } catch (e) {
      toast(
        (__t("members.statusFailed") || "Could not change status") +
          ": " +
          (e?.message || String(e)),
        { kind: "error" },
      );
    } finally {
      setBusyId(null);
    }
  };

  const filtered = members.filter((m) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [m.email, m.username, m.fullName, m.department, m.jobTitle]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q));
  });

  const columns = [
    {
      key: "member",
      header: __t("members.member") || "Member",
      render: (row) => (
        <div>
          <div className="members__name">{row.fullName || row.username}</div>
          <div className="members__email">{row.email}</div>
        </div>
      ),
    },
    {
      key: "jobTitle",
      header: __t("members.jobTitle") || "Job title",
      render: (row) => row.jobTitle || row.department || "—",
    },
    {
      key: "roles",
      header: __t("members.privileges") || "Privileges (role)",
      render: (row) => {
        const assigned = rolesByUser[row.id] || [];
        if (row.isSuperuser) {
          return (
            <StatusPill tone="warn">
              {__t("members.superuser") || "Superuser (all privileges)"}
            </StatusPill>
          );
        }
        return (
          <select
            className="members__role-select"
            aria-label={
              (__t("members.roleFor") || "Role for") + " " + row.email
            }
            value={assigned[0]?.id ?? ""}
            disabled={busyId === row.id || roles.length === 0}
            onChange={(e) => setRoleForMember(row, e.target.value)}
          >
            <option value="">{__t("members.noRole") || "No role"}</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        );
      },
    },
    {
      key: "status",
      header: __t("members.status") || "Status",
      render: (row) => (
        <StatusPill tone={row.isActive ? "ok" : "neutral"}>
          {row.isActive
            ? __t("members.active") || "Active"
            : __t("members.disabled") || "Disabled"}
        </StatusPill>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (row) => (
        <Button
          variant="secondary"
          disabled={busyId === row.id}
          onClick={() => toggleActive(row)}
        >
          {row.isActive
            ? __t("members.disable") || "Disable"
            : __t("members.enable") || "Enable"}
        </Button>
      ),
    },
  ];

  return (
    <div className="members">
      <ScreenHeader
        title={__t("members.title") || "Members & Privileges"}
        subtitle={
          __t("members.subtitle") ||
          "Manage who has access to this workspace and what they can do"
        }
      />

      <div className="members__toolbar">
        <input
          id="members-search"
          name="membersSearch"
          type="search"
          className="members__search"
          placeholder={__t("members.search") || "Search members…"}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label={__t("members.search") || "Search members"}
        />
        <Button variant="secondary" onClick={load} disabled={loading}>
          <Icon.Refresh size={12} /> {__t("common.refresh") || "Refresh"}
        </Button>
      </div>

      {loading && (
        <div className="members__state" role="status">
          {__t("common.loading") || "Loading…"}
        </div>
      )}

      {!loading && error && (
        <div className="members__state members__state--error" role="alert">
          {(__t("members.loadFailed") || "Could not load members") +
            ": " +
            error}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <EmptyState
          title={__t("members.emptyTitle") || "No members found"}
          description={
            search
              ? __t("members.emptySearch") || "No member matches that search."
              : __t("members.empty") ||
                "This workspace has no members yet besides you."
          }
        />
      )}

      {!loading && !error && filtered.length > 0 && (
        <DataTable
          columns={columns}
          rows={filtered}
          getRowKey={(row) => row.id}
          ariaLabel={__t("members.tableLabel") || "Workspace members"}
          dense
        />
      )}

      {!loading && !error && roles.length === 0 && (
        <p className="members__note">
          {__t("members.noRolesDefined") ||
            "No roles are defined for this workspace yet, so privileges cannot be assigned."}
        </p>
      )}

      <style>{`
        .members__toolbar {
          display: flex;
          gap: var(--sp-2);
          align-items: center;
          margin-bottom: var(--sp-3);
        }
        .members__search {
          flex: 1;
          height: var(--control-h);
          padding: 0 var(--sp-3);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-sm);
          background: var(--bg-surface);
          color: var(--text-primary);
          font-size: var(--fs-100);
        }
        .members__name { font-weight: var(--fw-medium); color: var(--text-primary); }
        .members__email { font-size: var(--fs-075); color: var(--text-muted); }
        .members__role-select {
          height: var(--control-h);
          padding: 0 var(--sp-2);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-sm);
          background: var(--bg-surface);
          color: var(--text-primary);
          font-size: var(--fs-100);
          min-width: 160px;
        }
        .members__state {
          padding: var(--sp-5);
          text-align: center;
          color: var(--text-secondary);
          font-size: var(--fs-100);
        }
        .members__state--error { color: var(--danger-text, #b42318); }
        .members__note {
          margin-top: var(--sp-3);
          font-size: var(--fs-075);
          color: var(--text-muted);
        }
      `}</style>
    </div>
  );
}

MembersScreen.propTypes = {
  data: PropTypes.object,
  openModal: PropTypes.func,
};
