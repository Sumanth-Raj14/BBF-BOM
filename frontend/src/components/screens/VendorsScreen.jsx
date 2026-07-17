import PropTypes from "prop-types";

import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import { Icon, LeadHeat, useAppStore } from "../../globals";
import { Button, Menu, StatusPill, EmptyState, ScreenHeader } from "../ui";
// ============ VENDORS ============
export default function VendorsScreen({ data, openModal }) {
  const ctx = useAppStore();
  const vendors = ctx?.vendors || data.vendors;
  const setVendors = ctx?.setVendors || (() => {});
  const [riskFilter, setRiskFilter] = React.useState("All");
  const [vSearch, setVSearch] = React.useState("");

  const filtered = vendors.filter((v) => {
    if (riskFilter !== "All" && v.risk !== riskFilter) return false;
    if (vSearch && !v.name.toLowerCase().includes(vSearch.toLowerCase()))
      return false;
    return true;
  });

  const togglePreferred = (id) => {
    const next = vendors.map((v) =>
      v.id === id ? { ...v, preferred: !v.preferred } : v,
    );
    setVendors(next);
    const v = vendors.find((x) => x.id === id);
    toast(
      v.name +
        (v.preferred
          ? " · " +
            (__t("vendor.unmarkedPreferred") || "unmarked preferred")
          : " · " + (__t("vendor.markedPreferred") || "marked preferred")),
      { kind: "success" },
    );
  };
  const toggleActive = (id) => {
    const next = vendors.map((v) =>
      v.id === id ? { ...v, active: v.active === false ? true : false } : v,
    );
    setVendors(next);
    const v = vendors.find((x) => x.id === id);
    toast(
      v.name +
        " " +
        (v.active === false
          ? __t("vendor.reactivated") || "reactivated"
          : __t("vendor.deactivated") || "deactivated"),
      { kind: "warn" },
    );
  };

  // Risk / lifecycle -> StatusPill semantic tone (risk labels aren't in the
  // shared STATUS_TONES map, so resolve explicitly).
  const riskTone = (r) => (r === "Low" ? "success" : r === "Med" ? "warning" : "danger");

  return (
    <div className="screen-wrap">
      <ScreenHeader
        title={__t("vendor.title") || "Vendors"}
        description={
          <>
            {vendors.length} {__t("vendor.vendors") || "vendors"} ·{" "}
            {new Set(vendors.map((v) => v.country)).size}{" "}
            {__t("dashboard.countries") || "countries"} ·{" "}
            {vendors.filter((v) => v.preferred).length}{" "}
            {__t("vendor.preferred") || "preferred"}
          </>
        }
        actions={
          <div className="flex gap-8">
            <div className="search w-220 h-32">
              <Icon.Search size={12} />
              <input
                id="vendor-search"
                name="vendorSearch"
                value={vSearch}
                onChange={(e) => setVSearch(e.target.value)}
                placeholder={
                  __t("vendor.filterPlaceholder") || "Filter vendors…"
                }
                aria-label={__t("vendor.filterVendors") || "Filter vendors"}
              />
            </div>
            <Menu
              ariaLabel={__t("common.risk") || "Risk"}
              trigger={
                <Button variant="secondary" size="sm">
                  <Icon.Filter size={12} /> {__t("common.risk") || "Risk"}:{" "}
                  {riskFilter} <Icon.ChevronDown size={10} />
                </Button>
              }
              items={["All", "Low", "Med", "High"].map((r) => ({
                icon:
                  r === riskFilter ? (
                    <Icon.Check size={11} />
                  ) : (
                    <span className="w-11" />
                  ),
                label:
                  r === "All"
                    ? __t("vendor.allRisks") || "All risks"
                    : r + " " + (__t("common.risk") || "risk"),
                onSelect: () => setRiskFilter(r),
              }))}
            />
            <Button
              variant="primary"
              size="sm"
              onClick={() => openModal("new-vendor")}
            >
              <Icon.Plus size={12} /> {__t("vendor.newVendor") || "New vendor"}
            </Button>
            <Menu
              ariaLabel={__t("common.moreOptions") || "More options"}
              trigger={
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  aria-label={__t("common.moreOptions") || "More options"}
                >
                  <Icon.Dots size={12} />
                </Button>
              }
              items={[
                {
                  icon: <Icon.Import size={11} />,
                  label: __t("common.bulkImportCsv") || "Bulk import (CSV)",
                  onSelect: () =>
                    (ctx?.openModal || (() => {}))("bulk-vendor-import"),
                },
                {
                  icon: <Icon.Export size={11} />,
                  label: __t("common.exportAll") || "Export all",
                  onSelect: () =>
                    toast(__t("vendor.exported") || "Exported vendors.csv", {
                      kind: "success",
                    }),
                },
              ]}
            />
          </div>
        }
      />

      <div className="card overflow-vis" data-density="dense">
        <table className="bom-table table-auto">
          <thead>
            <tr>
              <th className="pl-16" scope="col">{__t("vendor.name") || "Vendor"}</th>
              <th scope="col">{__t("vendor.country") || "Country"}</th>
              <th scope="col">{__t("vendor.terms") || "Terms"}</th>
              <th scope="col">{__t("vendor.rating") || "Rating"}</th>
              <th scope="col">{__t("vendor.leadDays") || "Lead"}</th>
              <th className="num" scope="col">{__t("vendor.moq") || "MOQ"}</th>
              <th className="num" scope="col">{__t("vendor.partsCount") || "Parts"}</th>
              <th scope="col">{__t("vendor.risk") || "Risk"}</th>
              <th scope="col">{__t("common.status") || "Status"}</th>
              <th scope="col">
                <span className="sr-only">{__t("common.actions") || "Actions"}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-0">
                  <EmptyState
                    title={
                      vSearch || riskFilter !== "All"
                        ? __t("vendor.noMatchFilter") ||
                          "No vendors match your filters"
                        : __t("vendor.noVendorsYet") || "No vendors yet"
                    }
                    actions={
                      !vSearch && riskFilter === "All" ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            (ctx || { openModal }).openModal?.(
                              "vendor-detail",
                              null,
                            )
                          }
                        >
                          <Icon.Plus size={11} />{" "}
                          {__t("vendor.addFirstVendor") || "Add first vendor"}
                        </Button>
                      ) : null
                    }
                  />
                </td>
              </tr>
            ) : (
              filtered.map((v) => (
                <tr
                  key={v.id}
                  onClick={() =>
                    (ctx || { openModal }).openModal?.("vendor-detail", v)
                  }
                  style={{ opacity: v.active === false ? 0.5 : 1 }}
                  className="cursor-pointer"
                >
                  <td className="pl-16">
                    <div className="flex items-center gap-8">
                      <span
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: "var(--radius-sm, 4px)",
                          background: "var(--bg-sunk)",
                          border: "1px solid var(--line)",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontFamily: "var(--font-mono)",
                          fontSize: 9,
                          fontWeight: 600,
                          color: "var(--fg-2)",
                        }}
                        aria-hidden="true"
                      >
                        {v.name
                          .split(" ")
                          .map((w) => w[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </span>
                      <div>
                        <div className="fw-600 fs-13">{v.name}</div>
                        {v.preferred && (
                          <div className="font-mono fs-9 fg-accent letter-sp-8">
                            {__t("vendor.preferredBadge") || "PREFERRED"}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="mono">{v.country}</td>
                  <td className="mono fg-2">{v.terms}</td>
                  <td className="mono fg-accent">★ {v.rating}</td>
                  <td>
                    <LeadHeat days={v.lead} />
                  </td>
                  <td className="num">{v.moq}</td>
                  <td className="num">{v.parts}</td>
                  <td>
                    <StatusPill tone={riskTone(v.risk)} label={v.risk} />
                  </td>
                  <td>
                    <StatusPill
                      tone={v.active === false ? "danger" : "success"}
                      label={
                        v.active === false
                          ? __t("vendor.inactive") || "Inactive"
                          : __t("vendor.active") || "Active"
                      }
                    />
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <Menu
                      ariaLabel={__t("common.moreOptions") || "More options"}
                      align="right"
                      trigger={
                        <Button
                          variant="ghost"
                          size="sm"
                          iconOnly
                          aria-label={
                            __t("common.moreOptions") || "More options"
                          }
                        >
                          <Icon.Dots size={12} />
                        </Button>
                      }
                      items={[
                        {
                          icon: <Icon.Chevron size={11} />,
                          label: __t("vendor.openVendor") || "Open vendor",
                          onSelect: () =>
                            (ctx?.openModal || openModal)?.("vendor-detail", v),
                        },
                        {
                          icon: <Icon.Cart size={11} />,
                          label: __t("bom.sendRfq") || "Send RFQ",
                          onSelect: () =>
                            (ctx?.openModal || openModal)?.("send-rfq", {
                              pn: "RFQ-" + v.id.toUpperCase(),
                              name: "Multi-part RFQ",
                              cost: 10,
                              lead: v.lead,
                              origin: v.country,
                              vendor: v.name,
                            }),
                        },
                        {
                          icon: <Icon.Doc size={11} />,
                          label: __t("vendor.quoteHistory") || "Quote history",
                          onSelect: () =>
                            (ctx?.openModal || openModal)?.("quote-history", v),
                        },
                        "divider",
                        {
                          icon: <Icon.Flag size={11} />,
                          label: v.preferred
                            ? __t("vendor.unmarkPreferred") ||
                              "Unmark preferred"
                            : __t("vendor.markPreferred") || "Mark preferred",
                          onSelect: () => togglePreferred(v.id),
                        },
                        {
                          icon:
                            v.active === false ? (
                              <Icon.Check size={11} />
                            ) : (
                              <Icon.Trash size={11} />
                            ),
                          label:
                            v.active === false
                              ? __t("vendor.reactivate") || "Reactivate"
                              : __t("vendor.deactivate") || "Deactivate",
                          danger: v.active !== false,
                          onSelect: () => toggleActive(v.id),
                        },
                      ]}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
VendorsScreen.propTypes = {
  data: PropTypes.object,
  openModal: PropTypes.func,
};
