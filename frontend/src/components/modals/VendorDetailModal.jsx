import PropTypes from "prop-types";
import { navigateTo } from "../../services/navigation.js";

import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import { Icon, INR, api } from "../../globals";
import { Badge, Button, Card, DataTable, EmptyState, Modal, StatusPill } from "../ui";

// Resolve the numeric backend vendor id. VendorsScreen.jsx maps API vendors
// to { id: "v"+id, apiId: id, ... } so existing consumers keep a string id;
// fall back to parsing a numeric/"v123" id in case a future caller passes
// the raw API vendor object instead.
function resolveVendorId(vendor) {
  if (!vendor) return null;
  if (vendor.apiId != null) return vendor.apiId;
  if (typeof vendor.id === "number") return vendor.id;
  if (typeof vendor.id === "string") {
    const m = vendor.id.match(/^v?(\d+)$/);
    if (m) return Number(m[1]);
  }
  return null;
}

// ============ VENDOR DETAIL ============
//
// Wired to the real backend:
//   - Contact fields (email/phone/address) come from api.vendors.get(id) —
//     the Vendors list only carries summary fields, not contact details.
//   - "Parts sourced" comes from api.partVendors.list({ vendorId }), joined
//     client-side with api.parts.get(partId) for pn/name/qty/status (the
//     part-vendor link itself only carries the vendor-specific cost/lead/
//     moq/quality/on-time numbers, not the part record).
//   - Anything with no backing data anywhere (a monthly on-time trend, a
//     "reviews" count, a per-project breakdown) shows an honest placeholder
//     or a value derived from real numbers instead of an invented one.
export default function VendorDetailModal({ open, onClose, vendor }) {
  const vendorId = resolveVendorId(vendor);

  const [detail, setDetail] = React.useState(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [links, setLinks] = React.useState([]); // raw part-vendor links (up to 100)
  const [partsTotal, setPartsTotal] = React.useState(null);
  const [parts, setParts] = React.useState([]); // top rows, joined with part pn/name/qty/status
  const [partsLoading, setPartsLoading] = React.useState(false);
  const [partsError, setPartsError] = React.useState(null);

  React.useEffect(() => {
    if (!open || vendorId == null) {
      setDetail(null);
      setLinks([]);
      setPartsTotal(null);
      setParts([]);
      setPartsError(null);
      return undefined;
    }
    let cancelled = false;

    setDetailLoading(true);
    api.vendors
      .get(vendorId)
      .then((v) => {
        if (!cancelled) setDetail(v || null);
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    setPartsLoading(true);
    setPartsError(null);
    api.partVendors
      .list({ vendorId, per_page: 100 })
      .then(async (r) => {
        if (cancelled) return;
        const items = Array.isArray(r) ? r : r?.items || [];
        setLinks(items);
        setPartsTotal(typeof r?.total === "number" ? r.total : items.length);

        const shown = items.slice(0, 8);
        const partDetails = await Promise.all(
          shown.map((link) =>
            link.partId != null
              ? api.parts.get(link.partId).catch(() => null)
              : Promise.resolve(null),
          ),
        );
        if (cancelled) return;
        setParts(
          shown.map((link, i) => {
            const p = partDetails[i];
            return {
              id: link.id,
              pn: p?.pn || link.vendorPn || null,
              name: p?.name || null,
              qty: p?.qty ?? null,
              cost: link.vendorCost ?? p?.cost ?? null,
              status: p?.status || null,
              onTimeRate: link.onTimeRate,
            };
          }),
        );
      })
      .catch((e) => {
        if (cancelled) return;
        setPartsError(e?.message || "Failed to load parts sourced.");
        setLinks([]);
        setPartsTotal(null);
        setParts([]);
      })
      .finally(() => {
        if (!cancelled) setPartsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, vendorId]);

  if (!open || !vendor || !vendor.id) return null;

  const riskTone =
    vendor.risk === "Low" ? "success" : vendor.risk === "Med" ? "warning" : "danger";

  const avgOnTime = links.length
    ? Math.round(
        links.reduce((sum, l) => sum + (Number(l.onTimeRate) || 0), 0) / links.length,
      )
    : null;

  const partColumns = [
    {
      key: "pn",
      header: __t("part.partNumber") || "Part No.",
      render: (p) => <span className="font-mono">{p.pn || "—"}</span>,
    },
    {
      key: "name",
      header: __t("part.name") || "Name",
      render: (p) => p.name || <span className="fg-3">—</span>,
    },
    {
      key: "qty",
      header: __t("part.quantity") || "Qty",
      align: "num",
      render: (p) => (p.qty != null ? p.qty : "—"),
    },
    {
      key: "cost",
      header: __t("part.unitCost") || "Unit",
      align: "num",
      render: (p) => (p.cost != null ? INR(p.cost, 2) : "—"),
    },
    {
      key: "status",
      header: __t("part.status") || "Status",
      render: (p) =>
        p.status ? <StatusPill status={p.status} /> : <span className="fg-3">—</span>,
    },
  ];

  const partsHeadingCount = partsTotal != null ? partsTotal : parts.length;

  const partsEmpty = (
    <EmptyState
      message={
        partsError
          ? partsError
          : (__t("modals.vendorDetail.noPartsSourced") ||
              "No parts currently sourced from") +
            " " +
            vendor.name +
            "."
      }
    />
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Vendor size={16} />}
      title={vendor.name}
      subtitle={
        <>
          {vendor.country} · {vendor.terms} · ★ {vendor.rating}{" "}
          <Badge tone={vendor.preferred ? "accent" : "neutral"} pill>
            {vendor.preferred
              ? __t("modals.vendorDetail.preferred") || "PREFERRED"
              : __t("modals.vendorDetail.standard") || "Standard"}
          </Badge>
        </>
      }
      size="lg"
      closeLabel={
        __t("modals.vendorDetail.closeDialog") || "Close vendor detail dialog"
      }
      footer={
        <>
          <span className="font-mono fs-11 fg-3" style={{ marginRight: "auto" }}>
            {partsHeadingCount}{" "}
            {__t("modals.vendorDetail.activeParts") || "active parts"} ·{" "}
            {vendor.lead}d {__t("modals.vendorDetail.avgLead") || "avg lead"}
          </span>
          <Button variant="secondary" onClick={onClose}>
            {__t("common.close") || "Close"}
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              toast(__t("modals.vendorDetail.openInCrm") || "Open in CRM")
            }
          >
            <Icon.Link size={12} />{" "}
            {__t("modals.vendorDetail.openInCrm") || "Open in CRM"}
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              onClose();
              navigateTo("procurement");
              toast(
                (__t("modals.vendorDetail.openProcurementFor") ||
                  "Opening procurement for") +
                  " " +
                  vendor.name,
              );
            }}
          >
            <Icon.Cart size={12} />{" "}
            {__t("modals.vendorDetail.sendRfq") || "Send RFQ"}
          </Button>
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
            v: partsLoading && partsTotal == null ? "…" : partsHeadingCount,
            sub:
              __t("modals.vendorDetail.acrossProjects") ||
              "sourced from this vendor",
          },
          {
            l: __t("modals.vendorDetail.leadTime") || "Lead time",
            v: vendor.lead != null ? vendor.lead + "d" : "—",
            sub:
              __t("modals.vendorDetail.avgLeadMax") ||
              "average, per vendor record",
          },
          {
            l: __t("modals.vendorDetail.onTimeRate") || "On-time rate",
            v: avgOnTime != null ? avgOnTime + "%" : "—",
            sub:
              avgOnTime != null
                ? links.length +
                  " " +
                  (__t("modals.vendorDetail.sourcedParts") || "sourced parts")
                : partsLoading
                  ? __t("common.loading") || "Loading…"
                  : __t("modals.vendorDetail.noPartsYet") ||
                    "no sourced parts yet",
          },
          {
            l: __t("modals.vendorDetail.qualityScore") || "Quality score",
            v: (vendor.rating ?? 0) + " / 5",
            sub:
              __t("modals.vendorDetail.reviews") ||
              "vendor reliability rating",
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
        <Card title={__t("modals.vendorDetail.contact") || "Contact"}>
          <div
            className="d-grid font-mono fs-11"
            style={{ gridTemplateColumns: "auto 1fr", gap: "4px 12px" }}
          >
            <span className="fg-3">
              {__t("modals.vendorDetail.email") || "Email"}
            </span>
            <span>
              {detail?.contactEmail || (detailLoading ? "…" : "—")}
            </span>
            <span className="fg-3">
              {__t("modals.vendorDetail.phone") || "Phone"}
            </span>
            <span>
              {detail?.contactPhone || (detailLoading ? "…" : "—")}
            </span>
            <span className="fg-3">
              {__t("modals.vendorDetail.address") || "Address"}
            </span>
            <span>{detail?.address || (detailLoading ? "…" : "—")}</span>
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
              <Badge tone={riskTone}>{vendor.risk}</Badge>
            </span>
          </div>
        </Card>
        <Card
          title={
            __t("modals.vendorDetail.onTimeDelivery") ||
            "On-time rate by sourced part"
          }
        >
          {partsLoading && parts.length === 0 ? (
            <div
              className="font-mono fs-11 fg-3"
              style={{ padding: "24px 4px" }}
            >
              {__t("common.loading") || "Loading…"}
            </div>
          ) : parts.length === 0 ? (
            <EmptyState
              message={
                partsError ||
                __t("modals.vendorDetail.noOnTimeData") ||
                "No on-time data yet — link parts to this vendor to see rates."
              }
            />
          ) : (
            <div
              className="flex items-end gap-8 h-120"
              style={{ padding: "0 4px" }}
            >
              {parts.map((p) => {
                const pct = Math.max(
                  0,
                  Math.min(100, Math.round(Number(p.onTimeRate) || 0)),
                );
                return (
                  <div
                    key={"del-" + p.id}
                    className="flex-1 pos-relative h-100p"
                  >
                    <div
                      className="pos-absolute bg-sunk rounded-r2"
                      style={{ left: 0, right: 0, top: 0, bottom: 16 }}
                    />
                    <div
                      className="pos-absolute bg-accent rounded-r2"
                      style={{ left: 0, right: 0, bottom: 16, height: pct + "%" }}
                    />
                    <div
                      className="pos-absolute text-center font-mono fs-9 fg-3"
                      style={{ bottom: -16, left: 0, right: 0 }}
                    >
                      {p.onTimeRate != null ? Math.round(p.onTimeRate) : "—"}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Parts sourced */}
      <h3
        className="font-mono fs-10 uppercase letter-sp-6 fg-3 mb-8"
        style={{ margin: "0 0 8px", fontWeight: 400 }}
      >
        {__t("modals.vendorDetail.partsSourced") || "Parts sourced"} (
        {partsHeadingCount})
      </h3>
      <DataTable
        ariaLabel={__t("modals.vendorDetail.partsSourced") || "Parts sourced"}
        columns={partColumns}
        rows={parts}
        getRowKey={(p) => p.id}
        dense
        empty={partsEmpty}
      />
    </Modal>
  );
}

VendorDetailModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
  vendor: PropTypes.any,
};
