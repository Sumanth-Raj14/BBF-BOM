import PropTypes from "prop-types";

import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import { BOM_DATA, INR, Modal, STATUS_CLASS, useAppStore } from "../../globals";
// ============ VENDOR DETAIL ============
export default function VendorDetailModal({ open, onClose, vendor }) {
  const ctx = useAppStore();
  if (!open || !vendor || !vendor.id) return null;
  const data = BOM_DATA;
  // Pretend this vendor supplies some parts
  const parts = (ctx?.rows || data.rows)[0].children
    .flatMap((s) => s.children || [])
    .filter((r) => r.vendor === vendor.name)
    .slice(0, 6);
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Vendor size={16} />}
      title={vendor.name}
      subtitle={`${vendor.country} \u00B7 ${vendor.terms} \u00B7 \u2605 ${vendor.rating} \u00B7 ${vendor.preferred ? __t("modals.vendorDetail.preferred") || "PREFERRED" : __t("modals.vendorDetail.standard") || "Standard"}`}
      wide
      footer={
        <>
          <span className="left">
            {vendor.parts}{" "}
            {__t("modals.vendorDetail.activeParts") || "active parts"} \u00B7{" "}
            {vendor.lead}d {__t("modals.vendorDetail.avgLead") || "avg lead"}
          </span>
          <button className="btn" onClick={onClose}>
            {__t("common.close") || "Close"}
          </button>
          <button
            className="btn"
            onClick={() =>
              toast(__t("modals.vendorDetail.openInCrm") || "Open in CRM")
            }
          >
            <Icon.Link size={12} />{" "}
            {__t("modals.vendorDetail.openInCrm") || "Open in CRM"}
          </button>
          <button
            className="btn primary"
            onClick={() => {
              onClose();
              toast(
                (__t("modals.vendorDetail.rfqDrafted") || "RFQ drafted for") +
                  " " +
                  vendor.name,
                {
                  action: {
                    label: __t("common.view") || "View",
                    onClick: () => window.__nav?.("procurement"),
                  },
                },
              );
            }}
          >
            <Icon.Cart size={12} />{" "}
            {__t("modals.vendorDetail.sendRfq") || "Send RFQ"}
          </button>
        </>
      }
    >
      {/* Header stats */}
      <div
        className="d-grid gap-12 mb-20"
        style={{ gridTemplateColumns: "repeat(4, 1fr)" }}
      >
        {[
          {
            l: __t("modals.vendorDetail.activeParts") || "Active parts",
            v: vendor.parts,
            sub:
              __t("modals.vendorDetail.acrossProjects") || "across 3 projects",
          },
          {
            l: __t("modals.vendorDetail.leadTime") || "Lead time",
            v: vendor.lead + "d",
            sub: __t("modals.vendorDetail.avgLeadMax") || "avg, 28d max",
          },
          {
            l: __t("modals.vendorDetail.onTimeRate") || "On-time rate",
            v: "92%",
            sub: __t("modals.vendorDetail.last24Pos") || "last 24 POs",
          },
          {
            l: __t("modals.vendorDetail.qualityScore") || "Quality score",
            v: vendor.rating + " / 5",
            sub: __t("modals.vendorDetail.reviews") || "32 reviews",
          },
        ].map((k) => (
          <div
            key={k.l}
            className="border-line rounded-r2 bg-canvas"
            style={{ padding: 12 }}
          >
            <div className="font-mono fs-9 uppercase letter-sp-6 fg-3">
              {k.l}
            </div>
            <div className="font-mono fs-20 fw-600" style={{ margin: "2px 0" }}>
              {k.v}
            </div>
            <div className="font-mono fs-10 fg-3">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Two-column */}
      <div
        className="d-grid mb-16"
        style={{ gridTemplateColumns: "1fr 1fr", gap: 18 }}
      >
        <div>
          <div className="font-mono fs-10 uppercase letter-sp-6 fg-3 mb-8">
            {__t("modals.vendorDetail.contact") || "Contact"}
          </div>
          <div
            className="border-line rounded-r2 bg-canvas"
            style={{ padding: 12 }}
          >
            <div
              className="d-grid font-mono fs-11"
              style={{ gridTemplateColumns: "auto 1fr", gap: "4px 12px" }}
            >
              <span className="fg-3">
                {__t("modals.vendorDetail.email") || "Email"}
              </span>
              <span>
                orders@{vendor.name.toLowerCase().replace(/\s+/g, "")}.com
              </span>
              <span className="fg-3">
                {__t("modals.vendorDetail.phone") || "Phone"}
              </span>
              <span>
                +1-555-{Math.floor(1000 + vendor.id.charCodeAt(1) * 13)}-
                {Math.floor(1000 + vendor.id.charCodeAt(1) * 27)}
              </span>
              <span className="fg-3">
                {__t("modals.vendorDetail.address") || "Address"}
              </span>
              <span>1234 Industrial Park \u00B7 {vendor.country}</span>
              <span className="fg-3">{__t("vendor.moq") || "MOQ"}</span>
              <span>
                {vendor.moq} {__t("modals.vendorDetail.units") || "units"}
              </span>
              <span className="fg-3">{__t("vendor.terms") || "Terms"}</span>
              <span>{vendor.terms}</span>
              <span className="fg-3">
                {__t("modals.vendorDetail.risk") || "Risk"}
              </span>
              <span>
                <span
                  className={(
                    "status " +
                    (vendor.risk === "Low"
                      ? "released"
                      : vendor.risk === "Med"
                        ? "review"
                        : "deprecated") +
                    " fg-3"
                  ).trim()}
                >
                  {vendor.risk}
                </span>
              </span>
            </div>
          </div>
        </div>
        <div>
          <div className="font-mono fs-10 uppercase letter-sp-6 fg-3 mb-8">
            {__t("modals.vendorDetail.onTimeDelivery") ||
              "On-time delivery (last 6 mo)"}
          </div>
          <div
            className="border-line rounded-r2 bg-canvas flex items-end gap-8 h-120"
            style={{ padding: 16 }}
          >
            {[88, 92, 90, 94, 91, 92].map((v, i) => (
              <div key={"del-" + i} className="flex-1 pos-relative h-100p">
                <div className="pos-absolute" />
                <div
                  className="pos-absolute text-center font-mono fs-9 fg-3"
                  style={{ bottom: -16, left: 0, right: 0 }}
                >
                  {v}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Parts sourced */}
      <div className="font-mono fs-10 uppercase letter-sp-6 fg-3 mb-8">
        {__t("modals.vendorDetail.partsSourced") || "Parts sourced"} (
        {parts.length})
      </div>
      <div className="border-line rounded-r2 overflow-h">
        {parts.length === 0 ? (
          <div className="text-center fg-3 fs-12" style={{ padding: 24 }}>
            {(__t("modals.vendorDetail.noPartsSourced") ||
              "No parts currently sourced from") +
              " " +
              vendor.name}
            .
          </div>
        ) : (
          <table className="bom-table table-auto">
            <thead>
              <tr>
                <th className="pl-12">
                  {__t("part.partNumber") || "Part No."}
                </th>
                <th>{__t("part.name") || "Name"}</th>
                <th className="num">{__t("part.quantity") || "Qty"}</th>
                <th className="num">{__t("part.unitCost") || "Unit"}</th>
                <th>{__t("part.status") || "Status"}</th>
              </tr>
            </thead>
            <tbody>
              {parts.map((p) => (
                <tr key={p.id}>
                  <td className="mono pl-12">{p.pn}</td>
                  <td>{p.name}</td>
                  <td className="num mono">{p.qty}</td>
                  <td className="num mono">{INR(p.cost, 2)}</td>
                  <td>
                    <span
                      className={"status " + (STATUS_CLASS[p.status] || "")}
                    >
                      {p.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Modal>
  );
}

VendorDetailModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
  vendor: PropTypes.any,
};
