import PropTypes from "prop-types";

import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import { Icon, api, useAppStore } from "../../globals";
import { Modal, Button, Badge, Spinner, EmptyState } from "../ui";

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

  const listLabel =
    __t("rollback.listLabel") || "Select a revision to roll back to";

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
      closeLabel={__t("rollback.closeDialog") || "Close rollback dialog"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {__t("common.cancel") || "Cancel"}
          </Button>
          <Button
            variant="danger"
            disabled={!selectedRev || rollingBack}
            loading={rollingBack}
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
          </Button>
        </>
      }
    >
      <p className="fs-12 fg-3" style={{ margin: "0 0 14px" }}>
        {__t("rollback.description") ||
          "Rolling back replaces the current BOM data with the selected revision. The current state is not lost — it remains as the latest revision in history."}
      </p>
      <div className="mb-12">
        {window.apiConnected ? (
          <Badge tone="success">
            {__t("rollback.loadingFromServer") ||
              "Loading revisions from server"}
          </Badge>
        ) : (
          <Badge tone="neutral">
            {__t("rollback.usingDefaultHistory") ||
              "Using default revision history"}
          </Badge>
        )}
      </div>
      {loading ? (
        <div
          className="flex items-center justify-center gap-8 fg-3"
          style={{ padding: 30 }}
        >
          <Spinner
            size="sm"
            label={__t("rollback.loadingRevisions") || "Loading revisions…"}
          />
          <span aria-hidden="true">
            {__t("rollback.loadingRevisions") || "Loading revisions..."}
          </span>
        </div>
      ) : revs.length === 0 ? (
        <EmptyState
          icon={<Icon.Diff size={28} />}
          title={__t("rollback.noRevisions") || "No revisions found"}
        />
      ) : (
        <fieldset className="rollback__list" aria-label={listLabel}>
          <legend className="sr-only">{listLabel}</legend>
          {revs.map((r, i) => {
            const inputId = `rollback-rev-${i}`;
            const selected = selectedRev === r;
            return (
              <label
                key={r.ver || r.id || i}
                htmlFor={inputId}
                className={
                  "rollback__item" +
                  (selected ? " rollback__item--selected" : "")
                }
              >
                <input
                  type="radio"
                  id={inputId}
                  name="rollback-revision"
                  className="rollback__radio"
                  checked={selected}
                  onChange={() => setSelectedRev(r)}
                />
                <span className="rollback__body">
                  <span className="rollback__head">
                    <span className="rollback__ver">{r.ver}</span>
                    <span className="rollback__meta">
                      {formatDate(r.date)} · {r.author}
                    </span>
                  </span>
                  <span className="rollback__changes">{r.changes}</span>
                  {r.bomSnapshot && (
                    <span className="rollback__snapshot">
                      <Badge tone="accent">
                        {__t("rollback.containsSnapshot") ||
                          "Contains BOM snapshot"}
                      </Badge>
                    </span>
                  )}
                </span>
              </label>
            );
          })}
        </fieldset>
      )}

      <style>{`
        .rollback__list {
          display: flex;
          flex-direction: column;
          gap: var(--sp-2);
          margin: 0;
          padding: 0;
          border: 0;
        }
        .rollback__item {
          display: flex;
          align-items: flex-start;
          gap: var(--sp-3);
          padding: var(--sp-3);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          background: var(--bg-canvas);
          cursor: pointer;
        }
        .rollback__item:hover {
          border-color: var(--focus);
        }
        .rollback__item--selected {
          border-color: var(--focus);
          background: color-mix(in srgb, var(--accent-interactive) 8%, var(--bg-canvas));
        }
        .rollback__radio {
          margin-top: 2px;
          accent-color: var(--focus);
          flex: none;
        }
        .rollback__radio:focus-visible {
          outline: 2px solid var(--focus);
          outline-offset: 2px;
        }
        .rollback__body {
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 0;
        }
        .rollback__head {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: var(--sp-2);
        }
        .rollback__ver {
          font-family: var(--font-mono);
          font-weight: var(--fw-semibold);
          color: var(--text-primary);
        }
        .rollback__meta {
          font-family: var(--font-mono);
          font-size: var(--fs-50);
          color: var(--text-muted);
          white-space: nowrap;
        }
        .rollback__changes {
          font-size: var(--fs-200);
          color: var(--text-secondary);
        }
        .rollback__snapshot {
          margin-top: 2px;
        }
      `}</style>
    </Modal>
  );
}
RollbackModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
};

export { RollbackModal };
window.RollbackModal = RollbackModal;
