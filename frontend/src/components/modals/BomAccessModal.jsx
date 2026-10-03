import PropTypes from "prop-types";

import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import { api } from "../../../api.js";
import { Icon } from "../../globals";
import { Badge, Button, EmptyState, Modal, Select, Spinner } from "../ui";

/**
 * BOM access grants — UI for app/core/object_perms.py + /bom/{id}/grants.
 *
 * THE SEMANTIC THIS SCREEN EXISTS TO MAKE VISIBLE: a BOM with zero grants is
 * UNRESTRICTED — the role check alone governs, so everyone with the role can
 * open it. Grants NARROW access; they never open it. Adding the FIRST grant
 * therefore RESTRICTS the BOM to its grantees (plus the BOM's creator and
 * superusers), and revoking the last one opens it back up. A user who adds one
 * collaborator thinking they are "sharing" has instead locked out their team,
 * so both transitions are stated at the point they happen.
 */

const LEVELS = ["view", "edit", "manage"];
const LEVEL_TONE = { view: "neutral", edit: "info", manage: "accent" };

const FORBIDDEN =
  __t("bomAccess.forbidden") || "You cannot manage access for this BOM.";

function listOf(res) {
  return Array.isArray(res) ? res : res?.items || res?.data || [];
}

export default function BomAccessModal({ open, onClose, bomId }) {
  const [grants, setGrants] = React.useState([]);
  const [users, setUsers] = React.useState([]);
  const [teams, setTeams] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [forbidden, setForbidden] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const [granteeType, setGranteeType] = React.useState("user");
  const [granteeId, setGranteeId] = React.useState("");
  const [level, setLevel] = React.useState("view");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    setForbidden(false);
    try {
      // The grants GET is itself the manage check — a 403 here is the answer,
      // not an incidental failure.
      setGrants(listOf(await api.bomGrants.list(bomId)));
    } catch (e) {
      if (e?.status === 403) setForbidden(true);
      else setError(e?.message || String(e));
      setLoading(false);
      return;
    }
    // Grantee pickers are secondary: an empty one is a missing choice, not a
    // reason to hide the grants that already exist.
    const [u, t] = await Promise.all([
      api.users.list({ per_page: 200 }).catch(() => []),
      api.teams.list().catch(() => []),
    ]);
    setUsers(listOf(u));
    setTeams(listOf(t));
    setLoading(false);
  }, [bomId]);

  React.useEffect(() => {
    if (open) load();
  }, [open, load]);

  const options = granteeType === "user" ? users : teams;
  const labelFor = (o) => o.email || o.name || o.username || `#${o.id}`;

  const granteeLabel = (g) => {
    const pool = g.grantee_type === "user" ? users : teams;
    const hit = pool.find((o) => String(o.id) === String(g.grantee_id));
    return hit ? labelFor(hit) : `${g.grantee_type} #${g.grantee_id}`;
  };

  const fail = (e, fallback) => {
    if (e?.status === 403) toast(FORBIDDEN, { kind: "error" });
    else toast(`${fallback}: ${e?.message || String(e)}`, { kind: "error" });
  };

  const addGrant = async () => {
    if (!granteeId) return;
    const first = grants.length === 0;
    setBusy(true);
    try {
      await api.bomGrants.grant(bomId, {
        grantee_type: granteeType,
        grantee_id: Number(granteeId),
        level,
      });
      toast(
        first
          ? __t("bomAccess.nowRestricted") ||
              "BOM is now restricted to the people and teams listed here."
          : __t("bomAccess.granted") || "Access granted",
        { kind: "success" },
      );
      setGranteeId("");
      await load();
    } catch (e) {
      fail(e, __t("bomAccess.grantFailed") || "Could not grant access");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (g) => {
    setBusy(true);
    try {
      await api.bomGrants.revoke(bomId, g.id);
      toast(
        grants.length === 1
          ? __t("bomAccess.nowUnrestricted") ||
              "Last grant removed — this BOM is unrestricted again."
          : __t("bomAccess.revoked") || "Access revoked",
        { kind: "success" },
      );
      await load();
    } catch (e) {
      fail(e, __t("bomAccess.revokeFailed") || "Could not revoke access");
    } finally {
      setBusy(false);
    }
  };

  const unrestricted = grants.length === 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Shield size={16} />}
      title={__t("bomAccess.title") || "BOM access"}
      size="md"
      footer={
        <Button variant="secondary" onClick={onClose}>
          {__t("common.close") || "Close"}
        </Button>
      }
    >
      {loading && (
        <div className="flex items-center gap-6 fs-12 fg-3">
          <Spinner size="sm" /> {__t("common.loading") || "Loading…"}
        </div>
      )}

      {!loading && forbidden && (
        <EmptyState
          icon={<Icon.Key size={20} />}
          title={__t("bomAccess.forbiddenTitle") || "Not your call"}
          message={FORBIDDEN}
        />
      )}

      {!loading && !forbidden && error && (
        <div className="fs-12" style={{ color: "var(--danger)" }} role="alert">
          {error}
        </div>
      )}

      {!loading && !forbidden && !error && (
        <>
          <div className={`bom-access-note ${unrestricted ? "open" : "shut"}`}>
            <Icon.Alert size={12} />
            <span>
              {unrestricted
                ? __t("bomAccess.unrestrictedWarning") ||
                  "This BOM is UNRESTRICTED: anyone whose role allows it can open this BOM. Grants do not share a BOM — they narrow it. Adding the first grant below RESTRICTS this BOM to the people and teams you list, and everyone else loses access."
                : __t("bomAccess.restrictedNote") ||
                  "This BOM is RESTRICTED to the grants below (plus its creator and superusers). Removing the last grant makes it open to every role-holder again."}
            </span>
          </div>

          {unrestricted ? (
            <EmptyState
              icon={<Icon.Shield size={20} />}
              title={__t("bomAccess.emptyTitle") || "No grants"}
              message={
                __t("bomAccess.emptyMessage") ||
                "Nobody is singled out on this BOM yet, so the role check alone decides who can open it."
              }
            />
          ) : (
            <table className="bom-access-table fs-12">
              <thead>
                <tr>
                  <th>{__t("bomAccess.grantee") || "Grantee"}</th>
                  <th>{__t("bomAccess.type") || "Type"}</th>
                  <th>{__t("bomAccess.level") || "Level"}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {grants.map((g) => (
                  <tr key={g.id}>
                    <td>{granteeLabel(g)}</td>
                    <td className="fg-3">
                      {g.grantee_type === "team"
                        ? __t("bomAccess.team") || "Team"
                        : __t("bomAccess.user") || "User"}
                    </td>
                    <td>
                      <Badge tone={LEVEL_TONE[g.level] || "neutral"}>
                        {g.level}
                      </Badge>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => revoke(g)}
                        aria-label={`${
                          __t("bomAccess.revoke") || "Revoke"
                        } ${granteeLabel(g)}`}
                      >
                        <Icon.Trash size={11} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="bom-access-add flex items-center gap-6">
            <Select
              value={granteeType}
              onChange={(e) => {
                setGranteeType(e.target.value);
                setGranteeId("");
              }}
              aria-label={__t("bomAccess.granteeType") || "Grantee type"}
              style={{ width: 90 }}
            >
              <option value="user">{__t("bomAccess.user") || "User"}</option>
              <option value="team">{__t("bomAccess.team") || "Team"}</option>
            </Select>
            <Select
              value={granteeId}
              onChange={(e) => setGranteeId(e.target.value)}
              aria-label={__t("bomAccess.grantee") || "Grantee"}
              style={{ flex: 1 }}
            >
              <option value="">
                {options.length
                  ? __t("bomAccess.pickGrantee") || "Select…"
                  : __t("bomAccess.noneAvailable") || "None available"}
              </option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {labelFor(o)}
                </option>
              ))}
            </Select>
            <Select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              aria-label={__t("bomAccess.level") || "Level"}
              style={{ width: 110 }}
            >
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </Select>
            <Button
              variant="primary"
              loading={busy}
              disabled={!granteeId}
              onClick={addGrant}
            >
              {unrestricted
                ? __t("bomAccess.restrictAdd") || "Restrict & add"
                : __t("bomAccess.add") || "Add"}
            </Button>
          </div>
        </>
      )}

      <style>{`
        .bom-access-note {
          display: flex;
          align-items: flex-start;
          gap: var(--sp-2);
          padding: var(--sp-2);
          margin-bottom: var(--sp-3);
          border-radius: 4px;
          font-size: 12px;
          line-height: 1.45;
          border: 1px solid var(--border-subtle);
          background: var(--bg-subtle);
          color: var(--text-secondary);
        }
        .bom-access-note.open {
          border-color: var(--warning);
          color: var(--fg);
        }
        .bom-access-table {
          width: 100%;
          border-collapse: collapse;
        }
        .bom-access-table th {
          text-align: left;
          font-weight: 600;
          color: var(--text-secondary);
          padding: 4px 6px;
          border-bottom: 1px solid var(--border-subtle);
        }
        .bom-access-table td {
          padding: 5px 6px;
          border-bottom: 1px solid var(--border-subtle);
        }
        .bom-access-add {
          margin-top: var(--sp-3);
          padding-top: var(--sp-3);
          border-top: 1px solid var(--border-subtle);
        }
      `}</style>
    </Modal>
  );
}

BomAccessModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
  bomId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
};
