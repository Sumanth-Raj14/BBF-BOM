import PropTypes from "prop-types";

import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import { INR, Modal, api } from "../../globals";
// ============ PO DETAIL ============
export default function PODetailModal({ open, onClose, item }) {
  const [advancing, setAdvancing] = React.useState(false);
  if (!open || !item || !item.pn) return null;
  const allStatuses = [
    "Not Ordered",
    "RFQ Sent",
    "Under Review",
    "Ordered",
    "In Transit",
    "Received",
    "Quality Check",
    "Approved",
    "Rejected",
    "Closed",
  ];
  const currentStatusIdx = allStatuses.indexOf(item.status || "Ordered");
  const lineCost = (item.qty || 0) * (item.cost || 12);
  const tax = lineCost * 0.08;
  const ship = 12.5;
  const total = lineCost + tax + ship;

  const advance = async () => {
    if (currentStatusIdx >= allStatuses.length - 1) return;
    const nextStatus = allStatuses[currentStatusIdx + 1];
    setAdvancing(true);
    try {
      if (item.id && api?.procurement?.advance) {
        await api.procurement.advance(item.id);
      }
      onClose();
      toast(
        (__t("modals.poDetail.advancedTo") || "PO advanced to") +
          ' "' +
          nextStatus +
          '"',
        { kind: "success" },
      );
    } catch (_e) {
      toast(__t("modals.poDetail.failedToAdvance") || "Failed to advance PO", {
        kind: "error",
      });
    } finally {
      setAdvancing(false);
    }
  };

  const poNumber =
    item.poNumber ||
    `PO-2026-${String(item.pn ? item.pn.charCodeAt(item.pn.length - 1) * 7 : 481).padStart(4, "0")}`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Cart size={16} />}
      title={`${poNumber} \u00B7 ${item.pn}`}
      subtitle={`${item.vendor || "Mean Well"} \u00B7 ${item.qty} units \u00B7 ETA ${item.eta || "\u2014"}`}
      wide
      footer={
        <>
          <span className="left">
            {__t("modals.poDetail.total") || "Total"}:{" "}
            <strong>{INR(total, 2)}</strong>
          </span>
          <button className="btn" onClick={onClose}>
            {__t("common.close") || "Close"}
          </button>
          <button
            className="btn"
            onClick={() => window.printPO(item, { country: "TW" })}
          >
            <Icon.Doc size={12} />{" "}
            {__t("modals.poDetail.printPdf") || "Print PDF"}
          </button>
          {currentStatusIdx >= 0 &&
            currentStatusIdx < allStatuses.length - 1 &&
            allStatuses[currentStatusIdx] !== "Rejected" && (
              <button
                className="btn primary"
                disabled={advancing}
                onClick={advance}
              >
                {advancing ? (
                  <>
                    <span
                      className="spinner"
                      style={{ width: 10, height: 10 }}
                    />{" "}
                    {__t("modals.poDetail.advancing") || "Advancing\u2026"}
                  </>
                ) : (
                  <>
                    <Icon.Check size={12} />{" "}
                    {__t("modals.poDetail.advanceTo") || "Advance to"}{" "}
                    {allStatuses[currentStatusIdx + 1]}
                  </>
                )}
              </button>
            )}
        </>
      }
    >
      {/* Status timeline */}
      <div style={{ marginBottom: 18 }}>
        <div className="font-mono fs-10 uppercase letter-sp-6 fg-3 mb-10">
          {__t("modals.poDetail.status") || "Status"}
        </div>
        <div className="flex items-center ox-auto" style={{ gap: 0 }}>
          {allStatuses.map((s, i) => (
            <React.Fragment key={s}>
              <div
                className="flex-1 text-center pos-relative"
                style={{ minWidth: 60 }}
              >
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 99,
                    background:
                      i === currentStatusIdx
                        ? "var(--accent)"
                        : i < currentStatusIdx &&
                            allStatuses[currentStatusIdx] !== "Rejected"
                          ? "var(--ok)"
                          : "var(--bg-sunk)",
                    border:
                      i === currentStatusIdx
                        ? "none"
                        : i < currentStatusIdx &&
                            allStatuses[currentStatusIdx] !== "Rejected"
                          ? "none"
                          : "1px solid var(--line)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "white",
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    fontWeight: 700,
                    position: "relative",
                    zIndex: 1,
                  }}
                >
                  {i < currentStatusIdx &&
                  allStatuses[currentStatusIdx] !== "Rejected" ? (
                    <Icon.Check size={9} />
                  ) : (
                    i + 1
                  )}
                </span>
                <div
                  className="font-mono letter-sp-4 ws-nowrap"
                  style={{
                    fontSize: 8,
                    marginTop: 3,
                    color:
                      i === currentStatusIdx ? "var(--accent)" : "var(--fg-3)",
                    fontWeight: i === currentStatusIdx ? 700 : 400,
                  }}
                >
                  {s.toUpperCase()}
                </div>
              </div>
              {i < allStatuses.length - 1 && (
                <div
                  className="h-1"
                  style={{
                    flex: 0.3,
                    background:
                      i < currentStatusIdx &&
                      allStatuses[currentStatusIdx] !== "Rejected"
                        ? "var(--accent)"
                        : "var(--line)",
                    marginBottom: 18,
                  }}
                />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Two-column metadata */}
      <div
        className="d-grid gap-24 mb-20"
        style={{ gridTemplateColumns: "1fr 1fr" }}
      >
        <div>
          <div className="font-mono fs-10 uppercase letter-sp-6 fg-3 mb-8">
            {__t("vendor.title") || "Vendor"}
          </div>
          <div
            className="border-line rounded-r2 bg-canvas"
            style={{ padding: 12 }}
          >
            <div className="fw-600 fs-13 mb-4">
              {item.vendor || "Mean Well"}
            </div>
            <div className="font-mono fs-11 fg-3 mb-2">
              orders@meanwell.tw · +886-2-2917-6666
            </div>
            <div className="font-mono fs-11 fg-3">Net 30 · TW · ★ 4.6</div>
          </div>
        </div>
        <div>
          <div className="font-mono fs-10 uppercase letter-sp-6 fg-3 mb-8">
            {__t("modals.poDetail.shipping") || "Shipping"}
          </div>
          <div
            className="border-line rounded-r2 bg-canvas"
            style={{ padding: 12 }}
          >
            <div className="fw-600 fs-13 mb-4">
              Blackbox Factories · Receiving
            </div>
            <div className="font-mono fs-11 fg-3 mb-2">
              2451 Engineering Way
            </div>
            <div className="font-mono fs-11 fg-3">
              Mountain View, CA 94043 · USA
            </div>
          </div>
        </div>
      </div>

      {/* Line items */}
      <div className="font-mono fs-10 uppercase letter-sp-6 fg-3 mb-8">
        {__t("modals.poDetail.lineItems") || "Line items"}
      </div>
      <div className="border-line rounded-r2 overflow-h mb-14">
        <table className="bom-table table-auto">
          <thead>
            <tr>
              <th className="pl-12">{__t("part.partNumber") || "Part No."}</th>
              <th>{__t("part.name") || "Name"}</th>
              <th className="num">{__t("part.quantity") || "Qty"}</th>
              <th className="num">{__t("part.unitCost") || "Unit"}</th>
              <th className="num">{__t("part.extCost") || "Ext."}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="mono pl-12">{item.pn}</td>
              <td className="fw-500">{item.name}</td>
              <td className="num mono">{item.qty}</td>
              <td className="num mono">{INR(item.cost || 12, 2)}</td>
              <td className="num mono fw-600">{INR(lineCost, 2)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div className="flex justify-end mb-14">
        <div className="font-mono fs-12" style={{ width: 260 }}>
          <div className="flex justify-between" style={{ padding: "4px 0" }}>
            <span className="fg-3">
              {__t("modals.poDetail.subtotal") || "Subtotal"}
            </span>
            <span>{INR(lineCost, 2)}</span>
          </div>
          <div className="flex justify-between" style={{ padding: "4px 0" }}>
            <span className="fg-3">
              {__t("modals.poDetail.tax") || "Tax (8%)"}
            </span>
            <span>{INR(tax, 2)}</span>
          </div>
          <div className="flex justify-between" style={{ padding: "4px 0" }}>
            <span className="fg-3">
              {__t("modals.poDetail.shipping") || "Shipping"}
            </span>
            <span>{INR(ship, 2)}</span>
          </div>
          <div
            className="flex justify-between border-top mt-4 fw-700 fs-14"
            style={{ padding: "8px 0 0" }}
          >
            <span>{__t("modals.poDetail.total") || "Total"}</span>
            <span>{INR(total, 2)}</span>
          </div>
        </div>
      </div>

      {/* Activity */}
      <div className="font-mono fs-10 uppercase letter-sp-6 fg-3 mb-8">
        {__t("modals.poDetail.activity") || "Activity"}
      </div>
      <div className="fs-11 font-mono fg-2">
        <div
          style={{
            padding: "4px 0",
            borderBottom: "1px solid var(--line-soft)",
          }}
        >
          2026-05-22 · E. Chen · Draft created
        </div>
        <div
          style={{
            padding: "4px 0",
            borderBottom: "1px solid var(--line-soft)",
          }}
        >
          2026-05-23 · K. Singh · Approved · ₹1,74,300 · Net 30
        </div>
        <div
          style={{
            padding: "4px 0",
            borderBottom: "1px solid var(--line-soft)",
          }}
        >
          2026-05-23 · System · PO sent to {item.vendor || "Mean Well"}
        </div>
        {currentStatusIdx >= 2 && (
          <div style={{ padding: "4px 0" }}>
            2026-05-24 · System · Order confirmed · ETA {item.eta}
          </div>
        )}
      </div>
    </Modal>
  );
}

PODetailModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
  item: PropTypes.object,
};
