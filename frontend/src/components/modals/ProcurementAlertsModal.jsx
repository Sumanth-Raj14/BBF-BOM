import PropTypes from "prop-types";

import { __t } from "../../i18n";
import { Icon, api } from "../../globals";
import { Badge, Button, EmptyState, Modal, Spinner, toast } from "../ui";

const LEVEL_META = {
  critical: { tone: "danger", icon: "🚨" },
  warning: { tone: "warning", icon: "⚠" },
  info: { tone: "info", icon: "ℹ" },
};

function levelMeta(level) {
  return LEVEL_META[level] || LEVEL_META.info;
}

function ProcurementAlertsModal({ open, onClose }) {
  const [alerts, setAlerts] = React.useState([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setLoading(true);
    (api?.procurement?.alerts?.() || Promise.resolve(null))
      .then((data) => {
        if (data) setAlerts(data);
      })
      .catch((e) => {
        console.warn("Failed to load procurement alerts:", e);
        toast(
          __t("procurementAlerts.loadFailed") ||
            "Could not load procurement alerts",
          { kind: "warn" },
        );
      })
      .finally(() => setLoading(false));
  }, [open]);

  const criticalCount = alerts.filter((a) => a.level === "critical").length;
  const warningCount = alerts.filter((a) => a.level === "warning").length;

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Bell size={16} />}
      title={__t("procurementAlerts.title") || "Procurement Alerts"}
      subtitle={
        loading
          ? __t("common.loading") || "Loading..."
          : (
              __t("procurementAlerts.subtitle") ||
              "{critical} critical · {warnings} warnings"
            )
              .replace("{critical}", criticalCount)
              .replace("{warnings}", warningCount)
      }
      closeLabel={
        __t("procurementAlerts.closeDialog") ||
        "Close procurement alerts dialog"
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {__t("common.close") || "Close"}
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              onClose();
              toast(
                __t("procurementAlerts.allReviewed") ||
                  "All alerts marked as reviewed",
                { kind: "success" },
              );
            }}
          >
            {__t("procurementAlerts.markAllReviewed") || "Mark all reviewed"}
          </Button>
        </>
      }
    >
      {loading ? (
        <div
          className="flex items-center justify-center gap-8 fg-3"
          style={{ padding: 30 }}
        >
          <Spinner
            size="sm"
            label={
              __t("procurementAlerts.loadingAlerts") || "Loading alerts…"
            }
          />
          <span aria-hidden="true">
            {__t("procurementAlerts.loadingAlerts") || "Loading alerts..."}
          </span>
        </div>
      ) : alerts.length === 0 ? (
        <EmptyState
          icon={<Icon.Bell size={28} />}
          title={
            __t("procurementAlerts.noAlerts") || "No procurement alerts"
          }
          message={
            __t("procurementAlerts.noAlertsMsg") ||
            "You're all caught up — nothing needs attention right now."
          }
        />
      ) : (
        <ul className="proc-alerts" aria-label={__t("procurementAlerts.title") || "Procurement Alerts"}>
          {alerts.map((a) => {
            const meta = levelMeta(a.level);
            return (
              <li
                key={a.title + "-" + a.level}
                className={`proc-alerts__item proc-alerts__item--${meta.tone}`}
              >
                <div className="proc-alerts__body">
                  <div className="proc-alerts__head">
                    <span className="proc-alerts__ico" aria-hidden="true">
                      {meta.icon}
                    </span>
                    <span className="proc-alerts__title">{a.title}</span>
                    <Badge tone={meta.tone}>{a.level}</Badge>
                  </div>
                  <div className="proc-alerts__desc">{a.desc}</div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="proc-alerts__action"
                  onClick={() => toast(a.action + " — opening…")}
                >
                  {a.action}
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <style>{`
        .proc-alerts {
          display: flex;
          flex-direction: column;
          gap: var(--sp-2);
          margin: 0;
          padding: 0;
          list-style: none;
        }
        .proc-alerts__item {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: var(--sp-3);
          padding: var(--sp-3);
          border: 1px solid var(--line);
          border-left-width: 3px;
          border-radius: var(--r-2);
          background: var(--bg);
        }
        .proc-alerts__item--danger {
          border-left-color: var(--danger);
          background: color-mix(in oklch, var(--danger) 6%, var(--bg));
        }
        .proc-alerts__item--warning {
          border-left-color: var(--warn);
        }
        .proc-alerts__item--info {
          border-left-color: var(--info);
        }
        .proc-alerts__body {
          min-width: 0;
          flex: 1;
        }
        .proc-alerts__head {
          display: flex;
          align-items: center;
          gap: 6px;
          font-weight: var(--fw-semibold, 600);
          font-size: var(--fs-200, 12px);
        }
        .proc-alerts__title {
          overflow-wrap: anywhere;
        }
        .proc-alerts__desc {
          margin-top: 4px;
          font-size: var(--fs-100, 11px);
          color: var(--text-secondary);
        }
        .proc-alerts__action {
          flex-shrink: 0;
        }
      `}</style>
    </Modal>
  );
}
ProcurementAlertsModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
};

export { ProcurementAlertsModal };
window.ProcurementAlertsModal = ProcurementAlertsModal;
