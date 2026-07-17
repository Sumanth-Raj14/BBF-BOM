import PropTypes from "prop-types";

import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import { Modal, api } from "../../globals";
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

  const icons = { critical: "\uD83D\uDEA8", warning: "\u26A0", info: "\u2139" };

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
              .replace(
                "{critical}",
                alerts.filter((a) => a.level === "critical").length,
              )
              .replace(
                "{warnings}",
                alerts.filter((a) => a.level === "warning").length,
              )
      }
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {__t("common.close") || "Close"}
          </button>
          <button
            className="btn primary"
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
          </button>
        </>
      }
    >
      {loading ? (
        <div className="text-center fg-3" style={{ padding: 24 }}>
          {__t("procurementAlerts.loadingAlerts") || "Loading alerts..."}
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {alerts.map((a, i) => (
            <div
              key={a.title + "-" + a.level}
              style={{
                padding: 12,
                border:
                  "1px solid " +
                  (a.level === "critical"
                    ? "var(--danger)"
                    : a.level === "warning"
                      ? "var(--warn)"
                      : "var(--line)"),
                borderRadius: "var(--r-2)",
                background:
                  a.level === "critical"
                    ? "color-mix(in oklch, var(--danger) 6%, var(--bg))"
                    : "var(--bg)",
                borderLeft:
                  "3px solid " +
                  (a.level === "critical"
                    ? "var(--danger)"
                    : a.level === "warning"
                      ? "var(--warn)"
                      : "var(--info)"),
              }}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="fw-600 fs-12 flex items-center gap-6">
                    <span>{icons[a.level] || "\u2139"}</span> {a.title}
                  </div>
                  <div className="fs-11 fg-2 mt-4">{a.desc}</div>
                </div>
                <button
                  className="btn small flex-shrink-0 ml-8"
                  onClick={() => toast(a.action + " \u2014 opening\u2026")}
                >
                  {a.action}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
ProcurementAlertsModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
};

export { ProcurementAlertsModal };
window.ProcurementAlertsModal = ProcurementAlertsModal;
