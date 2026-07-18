import PropTypes from "prop-types";

import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import { INR, Icon, api } from "../../globals";
import { Modal, Button, StatusPill, Card, DataTable } from "../ui";
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
  const currentStatus =
    currentStatusIdx >= 0 ? allStatuses[currentStatusIdx] : item.status || "Ordered";
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

  const lineColumns = [
    {
      key: "pn",
      header: __t("part.partNumber") || "Part No.",
      render: (r) => <span className="font-mono">{r.pn}</span>,
    },
    { key: "name", header: __t("part.name") || "Name" },
    { key: "qty", header: __t("part.quantity") || "Qty", align: "num" },
    {
      key: "cost",
      header: __t("part.unitCost") || "Unit",
      align: "num",
      render: (r) => INR(r.cost, 2),
    },
    {
      key: "ext",
      header: __t("part.extCost") || "Ext.",
      align: "num",
      render: (r) => <span className="fw-600">{INR(r.ext, 2)}</span>,
    },
  ];
  const lineRows = [
    {
      pn: item.pn,
      name: item.name,
      qty: item.qty,
      cost: item.cost || 12,
      ext: lineCost,
    },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Cart size={16} />}
      title={`${poNumber} · ${item.pn}`}
      subtitle={`${item.vendor || "Mean Well"} · ${item.qty} units · ETA ${item.eta || "—"}`}
      size="lg"
      closeLabel={__t("modals.poDetail.closeDialog") || "Close PO detail dialog"}
      footer={
        <>
          <span
            className="font-mono fs-11 fg-3"
            style={{ marginRight: "auto" }}
          >
            {__t("modals.poDetail.total") || "Total"}:{" "}
            <strong>{INR(total, 2)}</strong>
          </span>
          <Button variant="secondary" onClick={onClose}>
            {__t("common.close") || "Close"}
          </Button>
          <Button
            variant="secondary"
            onClick={() => window.printPO(item, { country: "TW" })}
          >
            <Icon.Doc size={12} />{" "}
            {__t("modals.poDetail.printPdf") || "Print PDF"}
          </Button>
          {currentStatusIdx >= 0 &&
            currentStatusIdx < allStatuses.length - 1 &&
            currentStatus !== "Rejected" && (
              <Button variant="primary" loading={advancing} onClick={advance}>
                {advancing ? (
                  __t("modals.poDetail.advancing") || "Advancing…"
                ) : (
                  <>
                    <Icon.Check size={12} />{" "}
                    {__t("modals.poDetail.advanceTo") || "Advance to"}{" "}
                    {allStatuses[currentStatusIdx + 1]}
                  </>
                )}
              </Button>
            )}
        </>
      }
    >
      {/* Status timeline */}
      <div style={{ marginBottom: 18 }}>
        <div className="flex items-center justify-between mb-8">
          <span className="font-mono fs-10 uppercase letter-sp-6 fg-3">
            {__t("modals.poDetail.status") || "Status"}
          </span>
          <StatusPill status={currentStatus} />
        </div>
        <ol
          className="flex items-center ox-auto"
          style={{ gap: 0, listStyle: "none", margin: 0, padding: 0 }}
          aria-label={__t("modals.poDetail.status") || "Status"}
        >
          {allStatuses.map((s, i) => {
            const isCurrent = i === currentStatusIdx;
            const isDone = i < currentStatusIdx && currentStatus !== "Rejected";
            return (
              <React.Fragment key={s}>
                <li
                  className="flex-1 text-center pos-relative"
                  style={{ minWidth: 60 }}
                  aria-current={isCurrent ? "step" : undefined}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 99,
                      background: isCurrent
                        ? "var(--accent-strong)"
                        : isDone
                          ? "var(--ok)"
                          : "var(--bg-sunk)",
                      border:
                        isCurrent || isDone ? "none" : "1px solid var(--line)",
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
                    {isDone ? <Icon.Check size={9} /> : i + 1}
                  </span>
                  <div
                    className="font-mono letter-sp-4 ws-nowrap"
                    style={{
                      fontSize: 8,
                      marginTop: 3,
                      color: isCurrent ? "var(--accent-text)" : "var(--fg-3)",
                      fontWeight: isCurrent ? 700 : 400,
                    }}
                  >
                    {s.toUpperCase()}
                  </div>
                </li>
                {i < allStatuses.length - 1 && (
                  <div
                    aria-hidden="true"
                    className="h-1"
                    style={{
                      flex: 0.3,
                      background: isDone ? "var(--accent)" : "var(--line)",
                      marginBottom: 18,
                    }}
                  />
                )}
              </React.Fragment>
            );
          })}
        </ol>
      </div>

      {/* Two-column metadata */}
      <div
        className="d-grid gap-16 mb-20"
        style={{ gridTemplateColumns: "1fr 1fr" }}
      >
        <Card title={__t("vendor.title") || "Vendor"}>
          <div className="fw-600 fs-13 mb-4">{item.vendor || "Mean Well"}</div>
          <div className="font-mono fs-11 fg-3 mb-4">
            orders@meanwell.tw · +886-2-2917-6666
          </div>
          <div className="font-mono fs-11 fg-3">Net 30 · TW · ★ 4.6</div>
        </Card>
        <Card title={__t("modals.poDetail.shipping") || "Shipping"}>
          <div className="fw-600 fs-13 mb-4">
            Blackbox Factories · Receiving
          </div>
          <div className="font-mono fs-11 fg-3 mb-4">
            2451 Engineering Way
          </div>
          <div className="font-mono fs-11 fg-3">
            Mountain View, CA 94043 · USA
          </div>
        </Card>
      </div>

      {/* Line items */}
      <h3
        className="font-mono fs-10 uppercase letter-sp-6 fg-3 mb-8"
        style={{ margin: "0 0 8px", fontWeight: 400 }}
      >
        {__t("modals.poDetail.lineItems") || "Line items"}
      </h3>
      <div style={{ marginBottom: 14 }}>
        <DataTable
          ariaLabel={__t("modals.poDetail.lineItems") || "Line items"}
          columns={lineColumns}
          rows={lineRows}
          getRowKey={(r) => r.pn}
          dense
        />
      </div>

      {/* Totals */}
      <div className="flex justify-end" style={{ marginBottom: 14 }}>
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
      <h3
        className="font-mono fs-10 uppercase letter-sp-6 fg-3 mb-8"
        style={{ margin: "0 0 8px", fontWeight: 400 }}
      >
        {__t("modals.poDetail.activity") || "Activity"}
      </h3>
      <ul
        className="fs-11 font-mono fg-2"
        style={{ listStyle: "none", margin: 0, padding: 0 }}
      >
        <li
          style={{
            padding: "4px 0",
            borderBottom: "1px solid var(--line-soft)",
          }}
        >
          2026-05-22 · E. Chen · Draft created
        </li>
        <li
          style={{
            padding: "4px 0",
            borderBottom: "1px solid var(--line-soft)",
          }}
        >
          2026-05-23 · K. Singh · Approved · ₹1,74,300 · Net 30
        </li>
        <li
          style={{
            padding: "4px 0",
            borderBottom: "1px solid var(--line-soft)",
          }}
        >
          2026-05-23 · System · PO sent to {item.vendor || "Mean Well"}
        </li>
        {currentStatusIdx >= 2 && (
          <li style={{ padding: "4px 0" }}>
            2026-05-24 · System · Order confirmed · ETA {item.eta}
          </li>
        )}
      </ul>
    </Modal>
  );
}

PODetailModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
  item: PropTypes.object,
};
