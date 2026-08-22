import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import { api } from "../../../api.js";
import { Icon } from "../../globals";
import {
  Button,
  Card,
  Checkbox,
  EmptyState,
  Field,
  Input,
  Modal,
  ScreenHeader,
  StatusPill,
  TabPanel,
  Tabs,
} from "../ui";
import { DataTable } from "../ui/DataTable.jsx";

// ============ BACKUPS & SESSIONS (admin operations) ============
//
// Two finished, superuser-only backends that nothing in the UI ever called:
//   * /backup/*  - logical and physical backups, verify, retention cleanup,
//                  restore and point-in-time recovery. On-prem is this
//                  product's core claim, yet the whole disaster-recovery
//                  story was invisible from inside the app.
//   * /sessions/sessions/*  - who is signed in right now, and revoking them.
//                  (The doubled path segment is real, not a typo: the router
//                  is mounted at /sessions and declares /sessions/... inside.)
// Both are gated on superuser, so a normal user gets 403 on load; that is
// rendered as a "requires administrator" state, not as a failure.
//
// Restore and PITR overwrite a live database. Neither is one click: both go
// through a typed-confirmation dialog that spells out what is about to happen.

const isForbidden = (e) => e?.status === 403;
const listOf = (res) => (Array.isArray(res) ? res : res?.items || res?.data || []);
const msgOf = (e) => e?.message || String(e);

function fmtDate(v) {
  if (!v) return "—";
  const d = new Date(v);
  return isNaN(d.getTime()) ? String(v) : d.toLocaleString();
}

function fmtBytes(n) {
  if (n == null || n === "") return "—";
  const num = Number(n);
  if (!isFinite(num)) return String(n);
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = num;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

const statusTone = (s) => {
  const v = String(s || "").toLowerCase();
  if (v === "completed" || v === "passed" || v === "success") return "ok";
  if (v === "failed" || v === "error") return "danger";
  if (v === "running" || v === "in_progress") return "warn";
  return "neutral";
};

// Typed confirmation. A destructive action sitting next to a list is a
// foot-gun, so the operator has to type the exact phrase (the backup id, the
// user id, or RESTORE) before the button unlocks.
export function DangerConfirm({
  open,
  title,
  phrase,
  consequences,
  confirmLabel,
  busy,
  onCancel,
  onConfirm,
}) {
  const [typed, setTyped] = React.useState("");
  React.useEffect(() => {
    if (open) setTyped("");
  }, [open]);

  const armed = typed.trim() === String(phrase) && String(phrase) !== "";

  return (
    <Modal
      open={!!open}
      onClose={busy ? undefined : onCancel}
      title={title}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {__t("common.cancel") || "Cancel"}
          </Button>
          <Button variant="danger" disabled={!armed} loading={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="adminops__danger" role="alert">
        <Icon.Alert size={14} />
        <div>{consequences}</div>
      </div>
      <Field
        label={
          (__t("adminOps.typeToConfirm") || "Type") +
          ` ${phrase} ` +
          (__t("adminOps.toConfirm") || "to confirm")
        }
      >
        <Input
          mono
          autoComplete="off"
          value={typed}
          disabled={busy}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={String(phrase)}
        />
      </Field>
    </Modal>
  );
}

function AdminRequired({ what }) {
  return (
    <EmptyState
      icon={<Icon.Shield size={20} />}
      title={__t("adminOps.adminRequired") || "Requires administrator"}
      message={
        (__t("adminOps.adminRequiredMsg") ||
          "Your account does not have administrator rights, so") +
        ` ${what} ` +
        (__t("adminOps.adminRequiredMsg2") ||
          "cannot be shown here. Ask a superuser for access.")
      }
    />
  );
}

// ---- Backups -------------------------------------------------------------
function BackupsTab() {
  const [history, setHistory] = React.useState([]);
  const [total, setTotal] = React.useState(0);
  const [latest, setLatest] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [forbidden, setForbidden] = React.useState(false);
  const [busy, setBusy] = React.useState(null);
  const [cleanupPreview, setCleanupPreview] = React.useState(null);
  const [pitrTime, setPitrTime] = React.useState("");
  const [pitrXid, setPitrXid] = React.useState("");
  const [pitrDryRun, setPitrDryRun] = React.useState(true);
  const [pitrResult, setPitrResult] = React.useState(null);
  const [confirm, setConfirm] = React.useState(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);
    try {
      const [hist, last] = await Promise.all([
        api.backup.history({ per_page: 100 }),
        api.backup.latest().catch(() => null),
      ]);
      const items = listOf(hist);
      setHistory(items);
      setTotal(hist?.total ?? items.length);
      setLatest(last || null);
    } catch (e) {
      if (isForbidden(e)) setForbidden(true);
      else setError(msgOf(e));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  // One wrapper so every action reports the same way, and a success toast can
  // only ever follow a call that actually resolved.
  const run = async (key, fn, okMsg) => {
    setBusy(key);
    try {
      const res = await fn();
      if (okMsg) toast(okMsg(res), { kind: "success" });
      return res;
    } catch (e) {
      toast(
        isForbidden(e) ? __t("adminOps.adminRequired") || "Requires administrator" : msgOf(e),
        { kind: "error" },
      );
      return null;
    } finally {
      setBusy(null);
    }
  };

  const doCreate = async () => {
    const res = await run(
      "create",
      () => api.backup.create("full"),
      (r) => (__t("adminOps.backupStatus") || "Backup") + ": " + (r?.status || "done"),
    );
    if (res) await load();
  };

  const doPhysical = async () => {
    const res = await run(
      "physical",
      () => api.backup.physical(),
      (r) => (__t("adminOps.physicalStatus") || "Physical backup") + ": " + (r?.status || "done"),
    );
    if (res) await load();
  };

  const doPipeline = async () => {
    const res = await run(
      "pipeline",
      () => api.backup.pipeline(false),
      () => __t("adminOps.pipelineDone") || "Backup pipeline finished",
    );
    if (res) await load();
  };

  const doVerify = async (row) => {
    const res = await run(
      `verify-${row.id}`,
      () => api.backup.verify(row.id),
      (r) =>
        r?.verified
          ? __t("adminOps.verifyPassed") || "Backup verified"
          : (__t("adminOps.verifyFailed") || "Verification failed") +
            (r?.error ? ": " + r.error : ""),
    );
    if (res) await load();
  };

  const doCleanupPreview = async () => {
    const res = await run("cleanup-preview", () => api.backup.cleanup(true));
    if (res) setCleanupPreview(res);
  };

  const doRestore = async (row) => {
    const res = await run(`restore-${row.id}`, () => api.backup.restore(row.id));
    setConfirm(null);
    if (!res) return;
    if (res.success) {
      toast(
        (__t("adminOps.restoreDone") || "Restore completed") +
          (res.table_count ? ` (${res.table_count} tables)` : ""),
        { kind: "success" },
      );
    } else {
      toast(
        (__t("adminOps.restoreFailed") || "Restore failed") +
          (res.error ? ": " + res.error : ""),
        { kind: "error" },
      );
    }
  };

  const doPitr = async () => {
    const dryRun = pitrDryRun;
    const res = await run("pitr", () =>
      api.backup.pitrRestore({
        target_time: pitrTime || null,
        target_xid: pitrXid || null,
        dry_run: dryRun,
      }),
    );
    setConfirm(null);
    if (!res) return;
    setPitrResult(res);
    toast(
      (dryRun
        ? __t("adminOps.pitrDryRun") || "PITR dry run"
        : __t("adminOps.pitrWritten") || "PITR recovery files written") +
        ": " +
        (res.status || ""),
      { kind: res.status === "error" ? "error" : "success" },
    );
  };

  const columns = [
    { key: "id", header: "ID", render: (r) => r.id },
    {
      key: "backup_type",
      header: __t("adminOps.type") || "Type",
      render: (r) => r.backup_type || r.backupType || "—",
    },
    {
      key: "status",
      header: __t("adminOps.status") || "Status",
      render: (r) => <StatusPill tone={statusTone(r.status)}>{r.status || "—"}</StatusPill>,
    },
    {
      key: "started_at",
      header: __t("adminOps.started") || "Started",
      render: (r) => fmtDate(r.started_at || r.startedAt),
    },
    {
      key: "size_bytes",
      header: __t("adminOps.size") || "Size",
      align: "right",
      render: (r) => fmtBytes(r.size_bytes ?? r.sizeBytes),
    },
    {
      key: "verification_status",
      header: __t("adminOps.verified") || "Verified",
      render: (r) => {
        const v = r.verification_status || r.verificationStatus;
        return v ? <StatusPill tone={statusTone(v)}>{v}</StatusPill> : "—";
      },
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) => (
        <div className="adminops__row-actions">
          <Button
            size="sm"
            variant="secondary"
            loading={busy === `verify-${r.id}`}
            disabled={!!busy}
            onClick={() => doVerify(r)}
          >
            {__t("adminOps.verify") || "Verify"}
          </Button>
          <Button
            size="sm"
            variant="danger"
            disabled={!!busy}
            onClick={() => setConfirm({ kind: "restore", row: r })}
          >
            {__t("adminOps.restore") || "Restore…"}
          </Button>
        </div>
      ),
    },
  ];

  if (forbidden) return <AdminRequired what={__t("adminOps.backups") || "backups"} />;

  return (
    <div className="adminops__tab">
      <div className="adminops__toolbar">
        <Button variant="secondary" onClick={load} disabled={loading || !!busy}>
          <Icon.Refresh size={12} /> {__t("common.refresh") || "Refresh"}
        </Button>
        <Button variant="primary" loading={busy === "create"} disabled={!!busy} onClick={doCreate}>
          {__t("adminOps.createBackup") || "Create backup"}
        </Button>
        <Button
          variant="secondary"
          loading={busy === "physical"}
          disabled={!!busy}
          onClick={doPhysical}
        >
          {__t("adminOps.physicalBackup") || "Physical base backup"}
        </Button>
        <Button
          variant="secondary"
          loading={busy === "pipeline"}
          disabled={!!busy}
          onClick={doPipeline}
        >
          {__t("adminOps.runPipeline") || "Run pipeline"}
        </Button>
        <Button
          variant="secondary"
          loading={busy === "cleanup-preview"}
          disabled={!!busy}
          onClick={doCleanupPreview}
        >
          {__t("adminOps.previewCleanup") || "Preview retention cleanup"}
        </Button>
      </div>

      {cleanupPreview && (
        <Card
          title={__t("adminOps.cleanupPreview") || "Retention cleanup preview"}
          subtitle={
            (__t("adminOps.cleanupCount") || "Backups past retention") +
            ": " +
            (cleanupPreview.count ?? 0) +
            " (" +
            (__t("adminOps.dryRunNothingRemoved") || "dry run — nothing was removed") +
            ")"
          }
          actions={
            <Button variant="ghost" size="sm" onClick={() => setCleanupPreview(null)}>
              {__t("common.close") || "Close"}
            </Button>
          }
        >
          {(cleanupPreview.removed || []).length === 0 ? (
            <p className="adminops__muted">
              {__t("adminOps.cleanupNothing") || "Nothing is past its retention window."}
            </p>
          ) : (
            <ul className="adminops__paths">
              {(cleanupPreview.removed || []).map((p) => (
                <li key={String(p)}>{String(p)}</li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {!loading && !error && (
        <Card
          title={__t("adminOps.latestBackup") || "Latest completed backup"}
          subtitle={
            latest
              ? fmtDate(latest.started_at || latest.startedAt)
              : __t("adminOps.noCompleted") || "No completed backup on record"
          }
        >
          {latest ? (
            <dl className="adminops__facts">
              <div>
                <dt>{__t("adminOps.type") || "Type"}</dt>
                <dd>{latest.backup_type || "—"}</dd>
              </div>
              <div>
                <dt>{__t("adminOps.size") || "Size"}</dt>
                <dd>{fmtBytes(latest.size_bytes)}</dd>
              </div>
              <div>
                <dt>{__t("adminOps.storage") || "Storage"}</dt>
                <dd>{latest.storage_type || "local"}</dd>
              </div>
              <div>
                <dt>{__t("adminOps.verified") || "Verified"}</dt>
                <dd>{latest.verification_status || "—"}</dd>
              </div>
              <div className="adminops__facts--wide">
                <dt>{__t("adminOps.path") || "Path"}</dt>
                <dd className="adminops__mono">{latest.storage_path || "—"}</dd>
              </div>
            </dl>
          ) : (
            <p className="adminops__muted">
              {__t("adminOps.noCompletedMsg") ||
                "Nothing has been backed up successfully yet. Recovery is not possible until it has."}
            </p>
          )}
        </Card>
      )}

      {loading && (
        <div className="adminops__state" role="status">
          {__t("common.loading") || "Loading…"}
        </div>
      )}

      {!loading && error && (
        <div className="adminops__state adminops__state--error" role="alert">
          {(__t("adminOps.backupsFailed") || "Could not load backup history") + ": " + error}
        </div>
      )}

      {!loading && !error && history.length === 0 && (
        <EmptyState
          title={__t("adminOps.noBackups") || "No backups recorded"}
          message={
            __t("adminOps.noBackupsMsg") ||
            "No backup has ever run on this installation. Create one before you need it."
          }
        />
      )}

      {!loading && !error && history.length > 0 && (
        <>
          <DataTable
            columns={columns}
            rows={history}
            getRowKey={(r) => r.id}
            ariaLabel={__t("adminOps.backupHistory") || "Backup history"}
            dense
          />
          {total > history.length && (
            <p className="adminops__muted">
              {(__t("adminOps.showingNewest") || "Showing the newest") +
                ` ${history.length} ` +
                (__t("adminOps.of") || "of") +
                ` ${total}.`}
            </p>
          )}
        </>
      )}

      <Card
        title={__t("adminOps.pitr") || "Point-in-time recovery"}
        subtitle={
          __t("adminOps.pitrSub") ||
          "Writes PostgreSQL recovery configuration that replays WAL up to a chosen moment. Run a dry run first."
        }
      >
        <div className="adminops__pitr">
          <Field
            label={__t("adminOps.targetTime") || "Target time"}
            hint={
              __t("adminOps.targetTimeHint") ||
              "Recovery stops at this moment. Leave empty to target a transaction id instead."
            }
          >
            <Input
              type="datetime-local"
              value={pitrTime}
              disabled={!!busy}
              onChange={(e) => setPitrTime(e.target.value)}
            />
          </Field>
          <Field label={__t("adminOps.targetXid") || "Target transaction id"}>
            <Input
              mono
              value={pitrXid}
              disabled={!!busy}
              placeholder={__t("adminOps.optional") || "optional"}
              onChange={(e) => setPitrXid(e.target.value)}
            />
          </Field>
        </div>
        <Checkbox
          label={
            __t("adminOps.pitrDryRunLabel") ||
            "Dry run — report what would happen, write nothing"
          }
          checked={pitrDryRun}
          disabled={!!busy}
          onChange={(e) => setPitrDryRun(e.target.checked)}
        />
        <div className="adminops__pitr-actions">
          <Button
            variant={pitrDryRun ? "primary" : "danger"}
            loading={busy === "pitr"}
            disabled={!!busy || (!pitrTime && !pitrXid)}
            onClick={() => (pitrDryRun ? doPitr() : setConfirm({ kind: "pitr" }))}
          >
            {pitrDryRun
              ? __t("adminOps.runPitrDry") || "Run PITR dry run"
              : __t("adminOps.runPitr") || "Write recovery files…"}
          </Button>
          {!pitrTime && !pitrXid && (
            <span className="adminops__muted">
              {__t("adminOps.pitrNeedsTarget") || "Give a target time or a transaction id."}
            </span>
          )}
        </div>
        {pitrResult && <pre className="adminops__pre">{JSON.stringify(pitrResult, null, 2)}</pre>}
      </Card>

      <DangerConfirm
        open={confirm?.kind === "restore"}
        busy={busy === `restore-${confirm?.row?.id}`}
        title={(__t("adminOps.restoreBackup") || "Restore backup") + ` #${confirm?.row?.id ?? ""}`}
        phrase={confirm?.row?.id ?? ""}
        confirmLabel={__t("adminOps.restoreNow") || "Restore now"}
        consequences={
          __t("adminOps.restoreWarning") ||
          "This overwrites the target database with the contents of this backup. Everything written since the backup was taken is lost, and users connected right now will see the database change under them. There is no undo."
        }
        onCancel={() => setConfirm(null)}
        onConfirm={() => doRestore(confirm.row)}
      />

      <DangerConfirm
        open={confirm?.kind === "pitr"}
        busy={busy === "pitr"}
        title={__t("adminOps.pitr") || "Point-in-time recovery"}
        phrase="RESTORE"
        confirmLabel={__t("adminOps.writeRecovery") || "Write recovery files"}
        consequences={
          __t("adminOps.pitrWarning") ||
          "This writes recovery configuration and a recovery signal into the database data directory. On its next start PostgreSQL replays WAL up to the target you chose and discards everything after it. There is no undo."
        }
        onCancel={() => setConfirm(null)}
        onConfirm={doPitr}
      />
    </div>
  );
}

// ---- Sessions ------------------------------------------------------------
function SessionsTab() {
  const [sessions, setSessions] = React.useState([]);
  const [stats, setStats] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [forbidden, setForbidden] = React.useState(false);
  const [busy, setBusy] = React.useState(null);
  const [confirm, setConfirm] = React.useState(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);
    try {
      const [all, st] = await Promise.all([
        api.sessions.all({ per_page: 100 }),
        api.sessions.stats().catch(() => null),
      ]);
      setSessions(listOf(all));
      setStats(st);
    } catch (e) {
      if (isForbidden(e)) setForbidden(true);
      else setError(msgOf(e));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const revoke = async (row) => {
    setBusy(`revoke-${row.id}`);
    try {
      await api.sessions.revoke(row.id);
      toast(__t("adminOps.sessionRevoked") || "Session revoked", { kind: "success" });
      await load();
    } catch (e) {
      toast(
        isForbidden(e) ? __t("adminOps.adminRequired") || "Requires administrator" : msgOf(e),
        { kind: "error" },
      );
    } finally {
      setBusy(null);
    }
  };

  const revokeAllForUser = async (userId) => {
    setBusy("revoke-all");
    try {
      await api.sessions.revokeAllForUser(userId);
      toast(
        (__t("adminOps.allSessionsRevoked") || "All sessions revoked for user") + " #" + userId,
        { kind: "success" },
      );
      setConfirm(null);
      await load();
    } catch (e) {
      toast(
        isForbidden(e) ? __t("adminOps.adminRequired") || "Requires administrator" : msgOf(e),
        { kind: "error" },
      );
    } finally {
      setBusy(null);
    }
  };

  const columns = [
    { key: "id", header: "ID", render: (r) => r.id },
    {
      key: "ipAddress",
      header: __t("adminOps.ip") || "IP address",
      render: (r) => r.ipAddress || "—",
    },
    {
      key: "userAgent",
      header: __t("adminOps.device") || "Device",
      render: (r) => (
        <span className="adminops__ua" title={r.userAgent || ""}>
          {r.userAgent || "—"}
        </span>
      ),
    },
    {
      key: "lastActivity",
      header: __t("adminOps.lastActivity") || "Last activity",
      render: (r) => fmtDate(r.lastActivity),
    },
    {
      key: "expiresAt",
      header: __t("adminOps.expires") || "Expires",
      render: (r) => fmtDate(r.expiresAt),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) => (
        <Button
          size="sm"
          variant="danger"
          loading={busy === `revoke-${r.id}`}
          disabled={!!busy}
          onClick={() => revoke(r)}
        >
          {__t("adminOps.revoke") || "Revoke"}
        </Button>
      ),
    },
  ];

  if (forbidden) return <AdminRequired what={__t("adminOps.sessions") || "active sessions"} />;

  const byUser = stats?.byUser || {};
  const byUserRows = Object.keys(byUser).map((k) => ({ userId: k, count: byUser[k] }));

  return (
    <div className="adminops__tab">
      <div className="adminops__toolbar">
        <Button variant="secondary" onClick={load} disabled={loading || !!busy}>
          <Icon.Refresh size={12} /> {__t("common.refresh") || "Refresh"}
        </Button>
      </div>

      {loading && (
        <div className="adminops__state" role="status">
          {__t("common.loading") || "Loading…"}
        </div>
      )}

      {!loading && error && (
        <div className="adminops__state adminops__state--error" role="alert">
          {(__t("adminOps.sessionsFailed") || "Could not load sessions") + ": " + error}
        </div>
      )}

      {!loading && !error && stats && (
        <Card title={__t("adminOps.sessionStats") || "Session statistics"}>
          <dl className="adminops__facts">
            <div>
              <dt>{__t("adminOps.totalActive") || "Active sessions"}</dt>
              <dd>{stats.totalActive ?? 0}</dd>
            </div>
            <div>
              <dt>{__t("adminOps.signedInUsers") || "Signed-in users"}</dt>
              <dd>{byUserRows.length}</dd>
            </div>
            <div>
              <dt>{__t("adminOps.expiringSoon") || "Expiring within 24h"}</dt>
              <dd>{stats.expiringSoon ?? 0}</dd>
            </div>
          </dl>
          {byUserRows.length > 0 && (
            <ul className="adminops__byuser">
              {byUserRows.map((u) => (
                <li key={u.userId}>
                  <span>
                    {(__t("adminOps.user") || "User") + " #" + u.userId} {"—"} {u.count}{" "}
                    {u.count === 1
                      ? __t("adminOps.session") || "session"
                      : __t("adminOps.sessionsWord") || "sessions"}
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!!busy}
                    onClick={() => setConfirm({ kind: "revoke-all", userId: u.userId })}
                  >
                    {__t("adminOps.revokeAll") || "Revoke all…"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {!loading && !error && sessions.length === 0 && (
        <EmptyState
          title={__t("adminOps.noSessions") || "No active sessions"}
          message={
            __t("adminOps.noSessionsMsg") ||
            "Nobody is currently signed in to this installation."
          }
        />
      )}

      {!loading && !error && sessions.length > 0 && (
        <DataTable
          columns={columns}
          rows={sessions}
          getRowKey={(r) => r.id}
          ariaLabel={__t("adminOps.activeSessions") || "Active sessions"}
          dense
        />
      )}

      <DangerConfirm
        open={confirm?.kind === "revoke-all"}
        busy={busy === "revoke-all"}
        title={
          (__t("adminOps.revokeAllFor") || "Revoke every session for user") +
          ` #${confirm?.userId ?? ""}`
        }
        phrase={confirm?.userId ?? ""}
        confirmLabel={__t("adminOps.revokeAll") || "Revoke all"}
        consequences={
          __t("adminOps.revokeAllWarning") ||
          "Every device this user is signed in on is signed out immediately, including any unsaved work they have open."
        }
        onCancel={() => setConfirm(null)}
        onConfirm={() => revokeAllForUser(confirm.userId)}
      />
    </div>
  );
}

export default function AdminOpsScreen() {
  const [tab, setTab] = React.useState("backups");

  return (
    <div className="adminops">
      <ScreenHeader
        title={__t("adminOps.title") || "Backups & Sessions"}
        description={
          __t("adminOps.subtitle") ||
          "Disaster recovery for this on-premise installation, and who is signed in right now"
        }
      />

      <Tabs
        id="adminops"
        value={tab}
        onChange={setTab}
        ariaLabel={__t("adminOps.title") || "Backups & Sessions"}
        items={[
          { value: "backups", label: __t("adminOps.backupsTab") || "Backups" },
          { value: "sessions", label: __t("adminOps.sessionsTab") || "Sessions" },
        ]}
      />

      <TabPanel id="adminops" value="backups" active={tab === "backups"}>
        <BackupsTab />
      </TabPanel>
      <TabPanel id="adminops" value="sessions" active={tab === "sessions"}>
        <SessionsTab />
      </TabPanel>

      <style>{`
        .adminops__tab {
          display: flex;
          flex-direction: column;
          gap: var(--sp-4);
          padding-top: var(--sp-4);
        }
        .adminops__toolbar {
          display: flex;
          gap: var(--sp-2);
          align-items: center;
          flex-wrap: wrap;
        }
        .adminops__row-actions {
          display: inline-flex;
          gap: var(--sp-2);
          justify-content: flex-end;
        }
        .adminops__state {
          padding: var(--sp-5);
          text-align: center;
          color: var(--text-secondary);
          font-size: var(--fs-100);
        }
        .adminops__state--error { color: var(--danger-text, #b42318); }
        .adminops__muted {
          font-size: var(--fs-075);
          color: var(--text-muted);
        }
        .adminops__mono {
          font-family: var(--font-mono, monospace);
          font-size: var(--fs-075);
          word-break: break-all;
        }
        .adminops__facts {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: var(--sp-3);
          margin: 0;
        }
        .adminops__facts dt {
          font-size: var(--fs-075);
          color: var(--text-muted);
          margin-bottom: var(--sp-1);
        }
        .adminops__facts dd {
          margin: 0;
          font-size: var(--fs-100);
          color: var(--text-primary);
        }
        .adminops__facts--wide { grid-column: 1 / -1; }
        .adminops__paths {
          margin: 0;
          padding-left: var(--sp-4);
          font-size: var(--fs-075);
          color: var(--text-secondary);
          word-break: break-all;
        }
        .adminops__byuser {
          list-style: none;
          margin: var(--sp-3) 0 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: var(--sp-2);
        }
        .adminops__byuser li {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--sp-3);
          font-size: var(--fs-100);
          color: var(--text-secondary);
        }
        .adminops__pitr {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: var(--sp-3);
          margin-bottom: var(--sp-3);
        }
        .adminops__pitr-actions {
          display: flex;
          align-items: center;
          gap: var(--sp-3);
          margin-top: var(--sp-3);
          flex-wrap: wrap;
        }
        .adminops__pre {
          margin-top: var(--sp-3);
          padding: var(--sp-3);
          overflow-x: auto;
          font-size: var(--fs-075);
          background: var(--bg-subtle, var(--bg-surface));
          border: 1px solid var(--border-default);
          border-radius: var(--radius-sm);
          color: var(--text-secondary);
        }
        .adminops__ua {
          display: inline-block;
          max-width: 320px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          vertical-align: bottom;
        }
        .adminops__danger {
          display: flex;
          gap: var(--sp-2);
          align-items: flex-start;
          margin-bottom: var(--sp-4);
          font-size: var(--fs-100);
          color: var(--danger-text, #b42318);
          line-height: 1.5;
        }
      `}</style>
    </div>
  );
}
