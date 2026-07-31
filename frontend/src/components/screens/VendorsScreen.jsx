import PropTypes from "prop-types";

import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import { api } from "../../../api.js";
import { Icon, LeadHeat, useAppStore } from "../../globals";
import { Button, Menu, StatusPill, EmptyState, ScreenHeader } from "../ui";
// ============ VENDORS ============
//
// Wired to the real backend (api.vendors.*). A few UI-visible fields have no
// backing column on the Vendor model yet:
//   - `risk`      — derived client-side from real leadTime (same heuristic
//                    SourcingView.jsx already uses), not a stored rating.
//   - `preferred` — no vendor-level "preferred" concept exists server-side
//                    (part_vendors.isPreferred is scoped per part+vendor
//                    pair, not the vendor record itself), so this stays a
//                    local, session-only mark instead of pretending to
//                    persist.
//   - `parts`     — the Vendor API doesn't return a sourced-parts count, so
//                    it renders as "—" rather than a fabricated number.
// `active` is a real column and now round-trips through the API (see
// backend/app/api/endpoints/vendors.py).
export default function VendorsScreen({ data, openModal }) {
  const ctx = useAppStore();
  const [vendors, setVendors] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [riskFilter, setRiskFilter] = React.useState("All");
  const [vSearch, setVSearch] = React.useState("");

  const deriveRisk = (lead) =>
    lead >= 30 ? "High" : lead >= 14 ? "Med" : "Low";

  // Preserve the app-wide vendor id convention ("v" + numeric id — see
  // AppCtx.jsx's own api.vendors.list() mapping) so this object stays
  // compatible with other already-shipped consumers (VendorDetailModal,
  // SendRFQModal, etc.) that expect a string id. `apiId` carries the raw
  // numeric id needed for real api.vendors.* calls.
  const mapVendor = (v, prevById) => {
    const prev = prevById?.get(v.id);
    const lead = v.leadTime ?? 0;
    return {
      id: "v" + v.id,
      apiId: v.id,
      name: v.name,
      country: v.country || "—",
      terms: v.terms || "—",
      rating: v.reliabilityRating ?? 0,
      lead,
      moq: v.moq ?? 0,
      parts: prev?.parts ?? null,
      risk: deriveRisk(lead),
      preferred: prev?.preferred ?? false,
      active: v.active !== false,
    };
  };

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.vendors.list();
      const list = Array.isArray(r) ? r : r?.items || [];
      setVendors((prevVendors) => {
        const prevById = new Map(prevVendors.map((pv) => [pv.apiId, pv]));
        return list.map((v) => mapVendor(v, prevById));
      });
    } catch (e) {
      // Honest failure — do not fall back to fabricated/sample rows.
      setError(e?.message || "Failed to load vendors.");
      setVendors([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  // The "New vendor" / "Bulk import" modals already call api.vendors.create
  // themselves (overlays.jsx / BulkImportModal) but have no way to notify
  // this screen. Re-fetch once they close so newly created vendors show up
  // without a manual page reload.
  const prevModalRef = React.useRef(ctx?.modal);
  React.useEffect(() => {
    const prevModal = prevModalRef.current;
    const justClosedCreateFlow =
      (prevModal === "new-vendor" || prevModal === "bulk-vendor-import") &&
      ctx?.modal !== prevModal;
    prevModalRef.current = ctx?.modal;
    if (justClosedCreateFlow) load();
  }, [ctx?.modal, load]);

  const filtered = vendors.filter((v) => {
    if (riskFilter !== "All" && v.risk !== riskFilter) return false;
    if (vSearch && !v.name.toLowerCase().includes(vSearch.toLowerCase()))
      return false;
    return true;
  });

  const togglePreferred = (id) => {
    const v = vendors.find((x) => x.id === id);
    if (!v) return;
    setVendors((prev) =>
      prev.map((x) => (x.id === id ? { ...x, preferred: !x.preferred } : x)),
    );
    toast(
      v.name +
        (v.preferred
          ? " · " +
            (__t("vendor.unmarkedPreferred") || "unmarked preferred")
          : " · " + (__t("vendor.markedPreferred") || "marked preferred")),
      { kind: "success" },
    );
  };

  const toggleActive = async (id) => {
    const v = vendors.find((x) => x.id === id);
    if (!v) return;
    const nextActive = v.active === false ? true : false;
    setVendors((prev) =>
      prev.map((x) => (x.id === id ? { ...x, active: nextActive } : x)),
    );
    try {
      await api.vendors.update(v.apiId, { active: nextActive });
      toast(
        v.name +
          " " +
          (nextActive
            ? __t("vendor.reactivated") || "reactivated"
            : __t("vendor.deactivated") || "deactivated"),
        { kind: "warn" },
      );
    } catch (e) {
      // Roll back — don't leave the UI claiming a change that didn't persist.
      setVendors((prev) =>
        prev.map((x) => (x.id === id ? { ...x, active: v.active } : x)),
      );
      toast(
        (__t("vendor.updateFailed") || "Could not update vendor") +
          ": " +
          (e?.message || ""),
        { kind: "error" },
      );
    }
  };

  const exportCsv = () => {
    if (vendors.length === 0) {
      toast(__t("vendor.nothingToExport") || "No vendors to export", {
        kind: "warn",
      });
      return;
    }
    const header = [
      "Name",
      "Country",
      "Terms",
      "Rating",
      "Lead",
      "MOQ",
      "Parts",
      "Risk",
      "Status",
    ];
    const rows = vendors.map((v) => [
      v.name,
      v.country,
      v.terms,
      v.rating,
      v.lead,
      v.moq,
      v.parts ?? "",
      v.risk,
      v.active === false ? "Inactive" : "Active",
    ]);
    const csv = [header, ...rows]
      .map((r) =>
        r.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","),
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vendors.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast(__t("vendor.exported") || "Exported vendors.csv", {
      kind: "success",
    });
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
                  onSelect: exportCsv,
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
            {loading ? (
              <tr>
                <td colSpan={10} className="p-0">
                  <EmptyState
                    title={__t("common.loading") || "Loading vendors…"}
                  />
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={10} className="p-0">
                  <EmptyState
                    title={error}
                    actions={
                      <Button variant="secondary" size="sm" onClick={load}>
                        {__t("common.retry") || "Retry"}
                      </Button>
                    }
                  />
                </td>
              </tr>
            ) : filtered.length === 0 ? (
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
                          onClick={() => openModal("new-vendor")}
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
                  <td className="num">{v.parts ?? "—"}</td>
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
                              pn: "RFQ-" + String(v.id).toUpperCase(),
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
