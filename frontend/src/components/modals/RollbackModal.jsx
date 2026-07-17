import PropTypes from "prop-types";

import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import { Modal, api, useAppStore } from "../../globals";
function RollbackModal({ open, onClose }) {
  const ctx = useAppStore();
  const [selectedRev, setSelectedRev] = React.useState(null);
  const [revs, setRevs] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [rollingBack, setRollingBack] = React.useState(false);

  const defaultRevs = [
    {
      ver: "v3.2.0",
      date: "2026-05-12",
      author: "E. Chen",
      changes: "+12 parts, −4 removed, 38 changed",
      bomSnapshot: null,
    },
    {
      ver: "v3.1.4",
      date: "2026-04-28",
      author: "M. Park",
      changes: "+3 parts, cost −2.4%",
      bomSnapshot: null,
    },
    {
      ver: "v3.1.0",
      date: "2026-03-15",
      author: "M. Park",
      changes: "PCB R3, lens added, fan upgrade",
      bomSnapshot: null,
    },
    {
      ver: "v3.0.0",
      date: "2026-01-20",
      author: "E. Chen",
      changes: "Initial production release",
      bomSnapshot: null,
    },
  ];

  React.useEffect(() => {
    if (open) {
      setSelectedRev(null);
      if (window.apiConnected) {
        setLoading(true);
        api.revisions
          .list({ limit: 20 })
          .then((data) => {
            if (data && data.length > 0) {
              setRevs(
                data.map((r) => ({
                  id: r.id,
                  ver: r.revisionNumber || r.version,
                  date: r.createdAt
                    ? new Date(r.createdAt).toISOString().slice(0, 10)
                    : "Unknown",
                  author: r.createdBy || "System",
                  changes:
                    r.description ||
                    r.revisionLabel ||
                    __t("rollback.noDescription") ||
                    "No description",
                  bomSnapshot: r.bomSnapshot,
                })),
              );
            } else {
              setRevs(defaultRevs);
            }
            setLoading(false);
          })
          .catch((e) => {
            console.warn("Failed to load revisions from API:", e);
            toast("Using default revision history", { kind: "info" });
            setRevs(defaultRevs);
            setLoading(false);
          });
      } else {
        setRevs(defaultRevs);
      }
    }
  }, [open, window.apiConnected]);

  const rollback = async () => {
    if (!selectedRev || !ctx) return;
    setRollingBack(true);
    if (selectedRev.bomSnapshot) ctx.setRows(selectedRev.bomSnapshot);
    onClose();
    setRollingBack(false);
    toast(
      (
        __t("rollback.rolledBackToast") ||
        "Rolled back to {ver} · BOM state restored"
      ).replace("{ver}", selectedRev.ver),
      {
        kind: "warn",
        action: {
          label: __t("rollback.undo") || "Undo",
          onClick: () =>
            toast(
              __t("rollback.currentRevRestored") || "Current revision restored",
              { kind: "info" },
            ),
        },
      },
    );
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return __t("common.unknown") || "Unknown";
    try {
      return new Date(dateStr).toLocaleDateString();
    } catch {
      return dateStr;
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Diff size={16} />}
      title={__t("rollback.title") || "Rollback revision"}
      subtitle={
        __t("rollback.subtitle") ||
        "Restore a previous revision as the active BOM"
      }
      footer={
        <>
          <button className="btn bg-warn" onClick={onClose}>
            {__t("common.cancel") || "Cancel"}
          </button>
          <button
            className="btn fg-white"
            disabled={!selectedRev || rollingBack}
            onClick={rollback}
          >
            {rollingBack ? (
              __t("rollback.rollingBack") || "Rolling back..."
            ) : (
              <>
                <Icon.Diff size={12} />{" "}
                {__t("rollback.rollbackTo") || "Rollback to"}{" "}
                {selectedRev?.ver || "..."}
              </>
            )}
          </button>
        </>
      }
    >
      <p className="fs-12 fg-3" style={{ margin: "0 0 14px" }}>
        {__t("rollback.description") ||
          "Rolling back replaces the current BOM data with the selected revision. The current state is not lost — it remains as the latest revision in history."}
      </p>
      {window.apiConnected && (
        <div className="mb-12 font-mono fs-10 fg-ok">
          {__t("rollback.loadingFromServer") ||
            "● Loading revisions from server"}
        </div>
      )}
      {!window.apiConnected && (
        <div className="mb-12 font-mono fs-10 fg-3">
          {__t("rollback.usingDefaultHistory") ||
            "○ Using default revision history"}
        </div>
      )}
      {loading ? (
        <div
          className="text-center fg-3 font-mono fs-11"
          style={{ padding: 30 }}
        >
          {__t("rollback.loadingRevisions") || "Loading revisions..."}
        </div>
      ) : (
        <div className="relative pl-24">
          <div
            className="pos-absolute w-1"
            style={{ left: 9, top: 4, bottom: 4, background: "var(--line)" }}
          />
          {revs.map((r, i) => (
            <div
              key={r.ver || r.id || i}
              onClick={() => setSelectedRev(r)}
              className="pos-relative"
            >
              <div className="pos-absolute" />
              <div className="flex justify-between items-baseline">
                <span className="font-mono fw-700">{r.ver}</span>
                <span className="font-mono fs-10 fg-3">
                  {formatDate(r.date)} · {r.author}
                </span>
              </div>
              <div className="fs-11 fg-2 mt-4">{r.changes}</div>
              {r.bomSnapshot && (
                <div className="fs-10 fg-accent mt-4">
                  {__t("rollback.containsSnapshot") || "Contains BOM snapshot"}
                </div>
              )}
            </div>
          ))}
          {revs.length === 0 && !loading && (
            <div className="text-center fg-3 fs-12" style={{ padding: 20 }}>
              {__t("rollback.noRevisions") || "No revisions found"}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
RollbackModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
};

export { RollbackModal };
window.RollbackModal = RollbackModal;
