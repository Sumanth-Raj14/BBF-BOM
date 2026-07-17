import PropTypes from "prop-types";

import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import { DropdownButton, INR, poOrdersAPI } from "../../globals";
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
          transition: "transform 0.15s",
        }}
      />
    );

  // Summary stats
  const totalValue = filteredPOs.reduce((s, p) => s + (p.poTotal || 0), 0);
  const totalItems = filteredPOs.reduce(
    (s, p) => s + (p.items?.length || 0),
    0,
  );

  // Status color
  const statusColor = (s) => {
    const n = normalizeStatus(s);
    if (n === "Received") return "released";
    if (n === "Completed") return "released";
    if (n === "Order Placed") return "approved";
    if (n === "Cancelled") return "deprecated";
    if (n === "Advance Paid") return "review";
    return "draft";
  };

  return (
    <div className="screen-wrap">
      <div className="screen-header">
        <div>
          <h1>{__t("procurement.title") || "Purchase Orders"}</h1>
          <div className="sub">
            {loading
              ? __t("common.loading") || "Loading..."
              : `${filteredPOs.length} ${__t("procurement.orders") || "orders"} \u00B7 ${totalItems} ${__t("procurement.items") || "items"} \u00B7 ${INR(totalValue, 0)} ${__t("procurement.total") || "total"}`}
          </div>
        </div>
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
              aria-label={__t("procurement.searchPos") || "Search POs"}
            />
          </div>
          <DropdownButton
            width={180}
            trigger={
              <button className="btn">
                <Icon.Filter size={12} /> {__t("common.status") || "Status"}:{" "}
                {statusFilter} <Icon.ChevronDown size={10} />
              </button>
            }
            items={statuses.map((s) => ({
              icon:
                statusFilter === s ? (
                  <Icon.Check size={11} />
                ) : (
                  <span className="w-11" />
                ),
              label: s,
              onClick: () => setStatusFilter(s),
            }))}
          />
          <DropdownButton
            width={200}
            trigger={
              <button className="btn">
                <Icon.Folder size={12} />{" "}
                {__t("procurement.project") || "Project"}:{" "}
                {projectFilter === "All"
                  ? __t("common.all") || "All"
                  : projectFilter.slice(0, 20)}{" "}
                <Icon.ChevronDown size={10} />
              </button>
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
              onClick: () => setProjectFilter(p),
            }))}
          />
          <button className="btn" onClick={() => openModal("import-rfqs")}>
            <Icon.Import size={12} /> {__t("common.import") || "Import"}
          </button>
        </div>
      </div>

      {/* Summary KPIs */}
      {stats && (
        <div className="kpi-grid mb-14">
          <div className="kpi">
            <div className="l">
              {__t("procurement.totalPos") || "Total POs"}
            </div>
            <div className="v">{stats.totalPOs}</div>
          </div>
          <div className="kpi l v fg-accent">{INR(stats.totalValue, 0)}</div>
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
      <div className="card overflow-vis">
        <table className="bom-table table-auto">
          <thead>
            <tr>
              <th style={{ width: 30 }} className="pl-16"></th>
              <th
                className="cursor-pointer"
                onClick={() => toggleSort("poDate")}
              >
                {__t("procurement.date") || "Date"} <SortIcon field="poDate" />
              </th>
              <th
                className="cursor-pointer"
                onClick={() => toggleSort("poNumber")}
              >
                {__t("procurement.poNumber") || "PO Number"}{" "}
                <SortIcon field="poNumber" />
              </th>
              <th
                className="cursor-pointer"
                onClick={() => toggleSort("vendorName")}
              >
                {__t("procurement.vendor") || "Vendor"}{" "}
                <SortIcon field="vendorName" />
              </th>
              <th>{__t("procurement.project") || "Project"}</th>
              <th>{__t("procurement.items") || "Items"}</th>
              <th
                className="num cursor-pointer"
                onClick={() => toggleSort("poTotal")}
              >
                {__t("procurement.poTotal") || "PO Total"}{" "}
                <SortIcon field="poTotal" />
              </th>
              <th>{__t("common.status") || "Status"}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={8}
                  style={{ padding: 40 }}
                  className="text-center spinner"
                >
                  {__t("procurement.loadingOrders") ||
                    "Loading purchase orders..."}
                </td>
              </tr>
            ) : filteredPOs.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  style={{ padding: 40 }}
                  className="text-center fg-3"
                >
                  {__t("procurement.noMatchFilter") ||
                    "No purchase orders match your filters"}
                </td>
              </tr>
            ) : (
              filteredPOs.map((po) => {
                const isExpanded = expandedRow === po.id;
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
                        <span
                          style={{
                            transition: "transform 0.15s",
                            transform: isExpanded ? "rotate(90deg)" : "none",
                          }}
                          className="items-center bg-sunk inline-flex justify-center w-18 h-18 br-4"
                        >
                          <Icon.Chevron size={10} />
                        </span>
                      </td>
                      <td className="mono fs-11">{po.poDate || "\u2014"}</td>
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
                        <span
                          className={
                            "status fs-9 overflow-h nowrap d-iblock " +
                            statusColor(po.status)
                          }
                          style={{ maxWidth: 160, textOverflow: "ellipsis" }}
                          title={po.status}
                        >
                          {normalizeStatus(po.status)}
                        </span>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={8} className="p-0" className="bg-sunk">
                          <div style={{ padding: "12px 16px 12px 46px" }}>
                            <div className="flex justify-between items-center mb-8">
                              <div className="font-mono fs-10 uppercase letter-sp-6 fg-3">
                                {__t("procurement.lineItems") || "Line Items"}{" "}
                                \u00B7 {po.items?.length || 0}{" "}
                                {__t("procurement.items") || "items"}
                              </div>
                              <div className="flex gap-6">
                                <button
                                  className="btn small"
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
                                </button>
                                <button
                                  className="btn small"
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
                                </button>
                                <button
                                  className="btn small"
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
                                </button>
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
                                          className="fw-500 fs-11 fg-accent cursor-pointer"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            toast(
                                              "Opening component: " +
                                                item.itemName.slice(0, 40),
                                            );
                                          }}
                                        >
                                          {item.itemName.length > 50
                                            ? item.itemName.slice(0, 50) +
                                              "\u2026"
                                            : item.itemName}
                                        </span>
                                      </td>
                                      <td
                                        style={{ textOverflow: "ellipsis" }}
                                        className="fs-10 fg-3 overflow-h nowrap max-w-200"
                                      >
                                        {item.itemDesc || "\u2014"}
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
                              <div
                                style={{ padding: 16 }}
                                className="text-center fg-3 fs-11"
                              >
                                {__t("procurement.noLineItems") ||
                                  "No line items for this PO"}
                              </div>
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
