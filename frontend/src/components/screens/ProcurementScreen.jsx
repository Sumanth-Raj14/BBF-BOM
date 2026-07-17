import PropTypes from "prop-types";

import { __t } from "../../i18n";
import { Icon, INR, poOrdersAPI } from "../../globals";
import {
  Button,
  Menu,
  StatusPill,
  EmptyState,
  Spinner,
  ScreenHeader,
  toast,
} from "../ui";
// ============ PROCUREMENT ============
export default function ProcurementScreen({ data, openModal }) {
  const [poData, setPoData] = React.useState([]);
  const [stats, setStats] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [expandedRow, setExpandedRow] = React.useState(null);
  const [statusFilter, setStatusFilter] = React.useState("All");
  const [projectFilter, setProjectFilter] = React.useState("All");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [sortField, setSortField] = React.useState("poDate");
  const [sortDir, setSortDir] = React.useState("desc");

  React.useEffect(() => {
    setLoading(true);
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), 10000),
    );
    const loadPromise = Promise.all([
      poOrdersAPI?.list({ limit: 200 }),
      poOrdersAPI?.stats(),
    ]);
    Promise.race([loadPromise, timeout])
      .then(([listResult, statsResult]) => {
        if (listResult && listResult.items) setPoData(listResult.items);
        if (statsResult) setStats(statsResult);
        setLoading(false);
      })
      .catch(() => {
        console.error("Failed to load purchase orders");
        setLoading(false);
      });
  }, []);

  // Normalize status for filtering
  const normalizeStatus = (s) => {
    if (!s) return "Unknown";
    if (s.startsWith("Consignment Received")) return "Received";
    if (s.startsWith("All Consignments")) return "Received";
    if (s.startsWith("Order Placed")) return "Order Placed";
    if (s.startsWith("Payment Completed")) return "Completed";
    if (s.startsWith("Order Cancelled")) return "Cancelled";
    if (s.startsWith("50% Advance")) return "Advance Paid";
    if (s === "Completed") return "Completed";
    return s;
  };

  // Get unique values for filters
  const statuses = React.useMemo(() => {
    const set = new Set(poData.map((p) => normalizeStatus(p.status)));
    return ["All", ...Array.from(set).sort()];
  }, [poData]);

  const projects = React.useMemo(() => {
    const set = new Set(poData.filter((p) => p.project).map((p) => p.project));
    return ["All", ...Array.from(set).sort()];
  }, [poData]);

  // Filter and sort
  const filteredPOs = React.useMemo(() => {
    let result = poData;

    if (statusFilter !== "All") {
      result = result.filter((p) => normalizeStatus(p.status) === statusFilter);
    }
    if (projectFilter !== "All") {
      result = result.filter((p) => p.project === projectFilter);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.poNumber.toLowerCase().includes(q) ||
          p.vendorName.toLowerCase().includes(q) ||
          (p.project && p.project.toLowerCase().includes(q)),
      );
    }

    // Sort
    result.sort((a, b) => {
      let va = a[sortField] || "";
      let vb = b[sortField] || "";
      if (sortField === "poTotal") {
        va = Number(va);
        vb = Number(vb);
      }
      if (sortField === "poDate") {
        va = va || "";
        vb = vb || "";
      }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [poData, statusFilter, projectFilter, searchQuery, sortField, sortDir]);

  const toggleSort = (field) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const toggleExpand = (id) => {
    setExpandedRow(expandedRow === id ? null : id);
  };

  const SortIcon = ({ field }) =>
    sortField !== field ? (
      <Icon.ChevronDown size={8} className="op-03" />
    ) : (
      <Icon.ChevronDown
        size={8}
        style={{
          transform: sortDir === "asc" ? "rotate(180deg)" : "none",
          transition: "transform var(--dur-fast, 0.15s)",
        }}
      />
    );

  // Sortable column header: keyboard-operable button + aria-sort on the <th>.
  const SortHeader = ({ field, align, children }) => {
    const active = sortField === field;
    const ariaSort = active
      ? sortDir === "asc"
        ? "ascending"
        : "descending"
      : "none";
    return (
      <th
        scope="col"
        aria-sort={ariaSort}
        className={align === "num" ? "num" : undefined}
      >
        <button
          type="button"
          className="ui-table__sort"
          onClick={() => toggleSort(field)}
        >
          {children} <SortIcon field={field} />
        </button>
      </th>
    );
  };

  // Summary stats
  const totalValue = filteredPOs.reduce((s, p) => s + (p.poTotal || 0), 0);
  const totalItems = filteredPOs.reduce(
    (s, p) => s + (p.items?.length || 0),
    0,
  );

  // Status tone (maps to StatusPill's semantic tones)
  const statusTone = (s) => {
    const n = normalizeStatus(s);
    if (n === "Received") return "success";
    if (n === "Completed") return "success";
    if (n === "Order Placed") return "info";
    if (n === "Cancelled") return "danger";
    if (n === "Advance Paid") return "warning";
    return "neutral";
  };

  const searchLabel = __t("procurement.searchPos") || "Search POs";

  return (
    <div className="screen-wrap">
      <ScreenHeader
        title={__t("procurement.title") || "Purchase Orders"}
        description={
          loading
            ? __t("common.loading") || "Loading..."
            : `${filteredPOs.length} ${__t("procurement.orders") || "orders"} · ${totalItems} ${__t("procurement.items") || "items"} · ${INR(totalValue, 0)} ${__t("procurement.total") || "total"}`
        }
        actions={
          <div className="flex gap-8">
            <div className="search w-220 h-32">
              <Icon.Search size={12} />
              <input
                id="po-search"
                name="poSearch"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  __t("procurement.searchPlaceholder") || "Search POs..."
                }
                aria-label={searchLabel}
              />
            </div>
            <Menu
              ariaLabel={__t("common.status") || "Status"}
              trigger={
                <Button variant="secondary" size="sm">
                  <Icon.Filter size={12} /> {__t("common.status") || "Status"}:{" "}
                  {statusFilter} <Icon.ChevronDown size={10} />
                </Button>
              }
              items={statuses.map((s) => ({
                icon:
                  statusFilter === s ? (
                    <Icon.Check size={11} />
                  ) : (
                    <span className="w-11" />
                  ),
                label: s,
                onSelect: () => setStatusFilter(s),
              }))}
            />
            <Menu
              ariaLabel={__t("procurement.project") || "Project"}
              trigger={
                <Button variant="secondary" size="sm">
                  <Icon.Folder size={12} />{" "}
                  {__t("procurement.project") || "Project"}:{" "}
                  {projectFilter === "All"
                    ? __t("common.all") || "All"
                    : projectFilter.slice(0, 20)}{" "}
                  <Icon.ChevronDown size={10} />
                </Button>
              }
              items={projects.map((p) => ({
                icon:
                  projectFilter === p ? (
                    <Icon.Check size={11} />
                  ) : (
                    <span className="w-11" />
                  ),
                label:
                  p === "All"
                    ? __t("procurement.allProjects") || "All projects"
                    : p,
                onSelect: () => setProjectFilter(p),
              }))}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => openModal("import-rfqs")}
            >
              <Icon.Import size={12} /> {__t("common.import") || "Import"}
            </Button>
          </div>
        }
      />

      {/* Summary KPIs */}
      {stats && (
        <div className="kpi-grid mb-14">
          <div className="kpi">
            <div className="l">
              {__t("procurement.totalPos") || "Total POs"}
            </div>
            <div className="v">{stats.totalPOs}</div>
          </div>
          <div className="kpi">
            <div className="l">
              {__t("procurement.totalValue") || "Total Value"}
            </div>
            <div className="v fg-accent">{INR(stats.totalValue, 0)}</div>
          </div>
          <div className="kpi">
            <div className="l">
              {__t("procurement.totalLineItems") || "Total Line Items"}
            </div>
            <div className="v">{stats.totalItems}</div>
          </div>
          <div className="kpi">
            <div className="l">
              {__t("procurement.uniqueVendors") || "Unique Vendors"}
            </div>
            <div className="v">{Object.keys(stats.byVendor || {}).length}</div>
          </div>
        </div>
      )}

      {/* PO Table with Expandable Rows */}
      <div className="card overflow-vis" data-density="dense">
        <table className="bom-table table-auto">
          <thead>
            <tr>
              <th style={{ width: 30 }} className="pl-16">
                <span className="sr-only">
                  {__t("common.expand") || "Expand"}
                </span>
              </th>
              <SortHeader field="poDate">
                {__t("procurement.date") || "Date"}
              </SortHeader>
              <SortHeader field="poNumber">
                {__t("procurement.poNumber") || "PO Number"}
              </SortHeader>
              <SortHeader field="vendorName">
                {__t("procurement.vendor") || "Vendor"}
              </SortHeader>
              <th scope="col">{__t("procurement.project") || "Project"}</th>
              <th scope="col">{__t("procurement.items") || "Items"}</th>
              <SortHeader field="poTotal" align="num">
                {__t("procurement.poTotal") || "PO Total"}
              </SortHeader>
              <th scope="col">{__t("common.status") || "Status"}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} style={{ padding: "var(--sp-7, 40px)" }}>
                  <div className="flex items-center justify-center gap-8">
                    <Spinner size="sm" label={__t("procurement.loadingOrders") || "Loading purchase orders..."} />
                    <span className="fg-3">
                      {__t("procurement.loadingOrders") ||
                        "Loading purchase orders..."}
                    </span>
                  </div>
                </td>
              </tr>
            ) : filteredPOs.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <EmptyState
                    title={
                      __t("procurement.noMatchFilter") ||
                      "No purchase orders match your filters"
                    }
                  />
                </td>
              </tr>
            ) : (
              filteredPOs.map((po) => {
                const isExpanded = expandedRow === po.id;
                const detailId = `po-detail-${po.id}`;
                return (
                  <React.Fragment key={po.id}>
                    <tr
                      onClick={() => toggleExpand(po.id)}
                      style={{
                        background: isExpanded
                          ? "var(--accent-soft)"
                          : undefined,
                      }}
                      className="cursor-pointer"
                    >
                      <td style={{ width: 30 }} className="pl-16">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          iconOnly
                          aria-expanded={isExpanded}
                          aria-controls={detailId}
                          aria-label={
                            isExpanded
                              ? __t("procurement.collapseLineItems") ||
                                "Collapse line items"
                              : __t("procurement.expandLineItems") ||
                                "Expand line items"
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExpand(po.id);
                          }}
                          className="w-18 h-18 br-4 bg-sunk"
                        >
                          <span
                            style={{
                              display: "inline-flex",
                              transition: "transform var(--dur-fast, 0.15s)",
                              transform: isExpanded
                                ? "rotate(90deg)"
                                : "none",
                            }}
                          >
                            <Icon.Chevron size={10} />
                          </span>
                        </Button>
                      </td>
                      <td className="mono fs-11">{po.poDate || "—"}</td>
                      <td className="mono fw-600 fs-12">{po.poNumber}</td>
                      <td>
                        <div
                          style={{ maxWidth: 260, textOverflow: "ellipsis" }}
                          className="fw-500 fs-12 overflow-h nowrap"
                        >
                          {po.vendorName}
                        </div>
                      </td>
                      <td>
                        {po.project && (
                          <span className="tag-pill fs-9 fg-4">
                            {po.project}
                          </span>
                        )}
                      </td>
                      <td className="mono fs-11">{po.items?.length || 0}</td>
                      <td className="num mono fw-700 fs-13">
                        {INR(po.poTotal, 0)}
                      </td>
                      <td>
                        <StatusPill
                          tone={statusTone(po.status)}
                          label={normalizeStatus(po.status)}
                          title={po.status}
                          className="overflow-h nowrap"
                          style={{ maxWidth: 160, textOverflow: "ellipsis" }}
                        />
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr id={detailId}>
                        <td colSpan={8} className="p-0 bg-sunk">
                          <div style={{ padding: "12px 16px 12px 46px" }}>
                            <div className="flex justify-between items-center mb-8">
                              <div className="font-mono fs-10 uppercase letter-sp-6 fg-3">
                                {__t("procurement.lineItems") || "Line Items"}{" "}
                                · {po.items?.length || 0}{" "}
                                {__t("procurement.items") || "items"}
                              </div>
                              <div className="flex gap-6">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toast(
                                      __t("procurement.exported") ||
                                        "Exported " + po.poNumber,
                                      { kind: "success" },
                                    );
                                  }}
                                >
                                  <Icon.Export size={10} />{" "}
                                  {__t("common.export") || "Export"}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    window.routeSetter
                                      ? window.routeSetter("order-tracking")
                                      : toast(
                                          __t(
                                            "procurement.goToOrderTracking",
                                          ) || "Go to Order Tracking screen",
                                        );
                                  }}
                                >
                                  <Icon.Cart size={10} />{" "}
                                  {__t("procurement.trackOrder") ||
                                    "Track Order"}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toast(
                                      __t("procurement.viewingScorecard") ||
                                        "Viewing vendor scorecard for " +
                                          po.vendorName,
                                    );
                                  }}
                                >
                                  <Icon.Chart size={10} />{" "}
                                  {__t("procurement.vendorScorecard") ||
                                    "Vendor scorecard"}
                                </Button>
                              </div>
                            </div>
                            {po.items && po.items.length > 0 ? (
                              <table className="bom-table table-auto bg-canvas">
                                <thead>
                                  <tr>
                                    <th className="pl-12 fs-9">
                                      {__t("procurement.itemName") ||
                                        "Item Name"}
                                    </th>
                                    <th className="fs-9">
                                      {__t("common.description") ||
                                        "Description"}
                                    </th>
                                    <th className="num fs-9">
                                      {__t("procurement.qty") || "Qty"}
                                    </th>
                                    <th className="num fs-9">
                                      {__t("procurement.unitPrice") ||
                                        "Unit Price"}
                                    </th>
                                    <th className="num fs-9">
                                      {__t("procurement.amount") || "Amount"}
                                    </th>
                                    <th className="num fs-9">
                                      {__t("procurement.gst") || "GST"}
                                    </th>
                                    <th className="num fs-9">
                                      {__t("procurement.total") || "Total"}
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {po.items.map((item, idx) => (
                                    <tr key={idx}>
                                      <td className="pl-12">
                                        <span
                                          role="button"
                                          tabIndex={0}
                                          className="fw-500 fs-11 fg-accent cursor-pointer"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            toast(
                                              "Opening component: " +
                                                item.itemName.slice(0, 40),
                                            );
                                          }}
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter" || e.key === " ") {
                                              e.preventDefault();
                                              e.stopPropagation();
                                              toast(
                                                "Opening component: " +
                                                  item.itemName.slice(0, 40),
                                              );
                                            }
                                          }}
                                        >
                                          {item.itemName.length > 50
                                            ? item.itemName.slice(0, 50) +
                                              "…"
                                            : item.itemName}
                                        </span>
                                      </td>
                                      <td
                                        style={{ textOverflow: "ellipsis" }}
                                        className="fs-10 fg-3 overflow-h nowrap max-w-200"
                                      >
                                        {item.itemDesc || "—"}
                                      </td>
                                      <td className="num mono fs-11">
                                        {item.quantity}
                                      </td>
                                      <td className="num mono fs-11">
                                        {INR(item.itemPrice, 2)}
                                      </td>
                                      <td className="num mono fs-11">
                                        {INR(item.amount, 2)}
                                      </td>
                                      <td className="num mono fs-11 fg-3">
                                        {INR(item.gst, 2)}
                                      </td>
                                      <td className="num mono fs-12 fw-600">
                                        {INR(item.total, 2)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot>
                                  <tr className="bg-elev">
                                    <td
                                      colSpan={2}
                                      className="pl-12 fw-600 fs-11"
                                    >
                                      {__t("procurement.poTotal") || "PO Total"}
                                    </td>
                                    <td></td>
                                    <td></td>
                                    <td className="num mono fs-11 fw-600">
                                      {INR(
                                        po.items.reduce(
                                          (s, i) => s + (i.amount || 0),
                                          0,
                                        ),
                                        2,
                                      )}
                                    </td>
                                    <td className="num mono fs-11 fw-600">
                                      {INR(
                                        po.items.reduce(
                                          (s, i) => s + (i.gst || 0),
                                          0,
                                        ),
                                        2,
                                      )}
                                    </td>
                                    <td className="num mono fs-12 fw-700 fg-accent">
                                      {INR(
                                        po.items.reduce(
                                          (s, i) => s + (i.total || 0),
                                          0,
                                        ),
                                        2,
                                      )}
                                    </td>
                                  </tr>
                                </tfoot>
                              </table>
                            ) : (
                              <EmptyState
                                title={
                                  __t("procurement.noLineItems") ||
                                  "No line items for this PO"
                                }
                              />
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
ProcurementScreen.propTypes = {
  data: PropTypes.object,
  openModal: PropTypes.func,
};
