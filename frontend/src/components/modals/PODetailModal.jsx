import PropTypes from "prop-types";

import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import { INR, Icon, api, printPO } from "../../globals";
import { Modal, Button, StatusPill, Card, DataTable, EmptyState } from "../ui";
// ============ PO DETAIL ============
export default function PODetailModal({ open, onClose, item }) {
  const [advancing, setAdvancing] = React.useState(false);
  const [poData, setPoData] = React.useState(null);
  const [vendorInfo, setVendorInfo] = React.useState(null);
  const [activity, setActivity] = React.useState([]);
  const [loadingDetail, setLoadingDetail] = React.useState(false);

  const itemId = item && item.id;
  const vendorName = item && item.vendor;

  React.useEffect(() => {
    let cancelled = false;
    if (!open || !itemId) {
      setPoData(null);
      setVendorInfo(null);
      setActivity([]);
      return undefined;
    }
    setLoadingDetail(true);
    (async () => {
      try {
        const data = api?.poOrders?.get ? await api.poOrders.get(itemId) : null;
        if (!cancelled) setPoData(data || null);
      } catch (_e) {
        if (!cancelled) setPoData(null);
      }
      try {
        if (vendorName && api?.vendors?.list) {
          const res = await api.vendors.list({ search: vendorName, per_page: 1 });
          const found = res?.items?.[0];
          if (!cancelled) setVendorInfo(found || null);
        } else if (!cancelled) {
          setVendorInfo(null);
        }
      } catch (_e) {
        if (!cancelled) setVendorInfo(null);
      }
      try {
        if (api?.auditLogs?.list) {
          const res = await api.auditLogs.list({ entityType: "po", entityId: itemId });
          if (!cancelled) setActivity(res?.items || []);
        } else if (!cancelled) {
          setActivity([]);
        }
      } catch (_e) {
        if (!cancelled) setActivity([]);
      } finally {
        if (!cancelled) setLoadingDetail(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, itemId, vendorName]);

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
  const effectiveStatus = (poData && poData.status) || item.status || "Not Ordered";
  const currentStatusIdx = allStatuses.indexOf(effectiveStatus);
  const currentStatus = currentStatusIdx >= 0 ? allStatuses[currentStatusIdx] : effectiveStatus;

  const realLines = poData && Array.isArray(poData.items) ? poData.items : null;
  const fallbackCost = item.cost || 0;
  const lineCost = realLines
    ? realLines.reduce((sum, li) => sum + (Number(li.amount) || 0), 0)
    : (item.qty || 0) * fallbackCost;
  const tax = realLines
    ? realLines.reduce((sum, li) => sum + (Number(li.gst) || 0), 0)
    : Number((poData && poData.taxTotal) || 0);
  const ship = Number((poData && poData.freightTotal) || 0);
  const total =
    (poData && poData.poTotal != null ? Number(poData.poTotal) : null) ?? lineCost + tax + ship;

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

  const poNumber = (poData && poData.poNumber) || item.poNumber || "—";
  const resolvedVendorName =
    (poData && poData.vendorName && poData.vendorName.trim()) ||
    (vendorInfo && vendorInfo.name) ||
    item.vendor ||
    __t("modals.poDetail.unknownVendor") ||
    "Unknown vendor";
  const totalQty = realLines
    ? realLines.reduce((sum, li) => sum + (Number(li.quantity) || 0), 0)
    : item.qty || 0;

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
  const lineRows = realLines
    ? realLines.map((li, idx) => ({
        _key: li.id != null ? `line-${li.id}` : `line-idx-${idx}`,
        pn: li.itemName || item.pn || "—",
        name: li.itemDesc || item.name || "",
        qty: li.quantity != null ? li.quantity : 0,
        cost: Number(li.itemPrice) || 0,
        ext: Number(li.amount) || 0,
      }))
    : [
        {
          _key: "fallback-line",
          pn: item.pn,
          name: item.name,
          qty: item.qty,
          cost: fallbackCost,
          ext: lineCost,
        },
      ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Cart size={16} />}
      title={`${poNumber} · ${item.pn}`}
      subtitle={`${resolvedVendorName} · ${totalQty} units · ETA ${item.eta || "—"}`}
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
            onClick={() => printPO(item, vendorInfo || undefined)}
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
          <div className="fw-600 fs-13 mb-4">{resolvedVendorName}</div>
          {vendorInfo ? (
            <>
              <div className="font-mono fs-11 fg-3 mb-4">
                {[vendorInfo.contactEmail, vendorInfo.contactPhone]
                  .filter(Boolean)
                  .join(" · ") ||
                  __t("modals.poDetail.noContact") ||
                  "No contact on file"}
              </div>
              <div className="font-mono fs-11 fg-3">
                {[
                  vendorInfo.terms,
                  vendorInfo.country,
                  vendorInfo.reliabilityRating != null
                    ? `★ ${Number(vendorInfo.reliabilityRating).toFixed(1)}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </>
          ) : (
            <div className="font-mono fs-11 fg-3">
              {__t("modals.poDetail.noVendorDetails") ||
                "No vendor details on file"}
            </div>
          )}
        </Card>
        <Card title={__t("modals.poDetail.shipping") || "Shipping"}>
          {poData && (poData.shippingAddress || poData.shippingMethod) ? (
            <>
              {poData.shippingAddress
                ? poData.shippingAddress.split("\n").map((line, i) => (
                    <div className="font-mono fs-11 fg-3 mb-4" key={i}>
                      {line}
                    </div>
                  ))
                : null}
              {poData.shippingMethod && (
                <div className="font-mono fs-11 fg-3">
                  {poData.shippingMethod}
                </div>
              )}
            </>
          ) : (
            <div className="font-mono fs-11 fg-3">
              {__t("modals.poDetail.noShippingAddress") ||
                "No shipping address on file"}
            </div>
          )}
        </Card>
      </div>

      {/* Line items */}
      <h3
        className="font-mono fs-10 uppercase letter-sp-6 fg-3 mb-8"
        style={{ margin: "0 0 8px", fontWeight: 400 }}
      >
        {__t("modals.poDetail.lineItems") || "Line items"}
        {loadingDetail && !poData && (
          <span className="fg-3" style={{ marginLeft: 8, fontWeight: 400 }}>
            {__t("common.loading") || "Loading…"}
          </span>
        )}
      </h3>
      <div style={{ marginBottom: 14 }}>
        <DataTable
          ariaLabel={__t("modals.poDetail.lineItems") || "Line items"}
          columns={lineColumns}
          rows={lineRows}
          getRowKey={(r) => r._key || r.pn}
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
            <span className="fg-3">{__t("modals.poDetail.tax") || "Tax"}</span>
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
      {activity.length > 0 ? (
        <ul
          className="fs-11 font-mono fg-2"
          style={{ listStyle: "none", margin: 0, padding: 0 }}
        >
          {activity.map((entry, i) => (
            <li
              key={entry.id != null ? entry.id : i}
              style={{
                padding: "4px 0",
                borderBottom:
                  i < activity.length - 1
                    ? "1px solid var(--line-soft)"
                    : "none",
              }}
            >
              {(entry.createdAt ? String(entry.createdAt).slice(0, 10) : "—") +
                " · " +
                (entry.userEmail || __t("common.system") || "System") +
                " · " +
                (entry.action || "—")}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title={__t("modals.poDetail.noActivity") || "No activity recorded"}
          message={
            __t("modals.poDetail.noActivityMsg") ||
            "Status changes and edits to this PO will appear here."
          }
        />
      )}
    </Modal>
  );
}

PODetailModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
  item: PropTypes.object,
};
