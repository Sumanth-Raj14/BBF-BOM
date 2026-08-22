import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import { api } from "../../../api.js";
import { Icon } from "../../globals";
import { Button, EmptyState, Modal, ScreenHeader, StatusPill } from "../ui";
import { DataTable } from "../ui/DataTable.jsx";

// ============ PLANNING & PO GENERATION ============
//
// Pick a BOM, preview what it needs (GET /planning/{bom_id}/summary), then
// generate the draft purchase order(s) (POST /planning/{bom_id}/generate-po).
// Both endpoints and planning_service.py have been live for a while with no
// caller — this screen is the missing surface, nothing backend changed.
//
// The summary groups by the part's resolved vendor (Part.primary_vendor_id,
// else a PartVendor.isPreferred row, else the literal "Unassigned" group).
// Generation writes ONE draft PO per vendor group, so the "Unassigned" rows
// become their own PO that a planner has to re-vendor by hand — that is worth
// showing before the write, not after.
//
// Note on "short": the backend exposes required quantity and cost only; there
// is no on-hand/stock figure in this payload, so nothing here pretends to know
// coverage. What it does flag is what will actually block purchasing — parts
// with no vendor and parts with no unit cost on file.
const UNASSIGNED = "Unassigned";
const NO_ITEMS = [];

const asList = (res) => (Array.isArray(res) ? res : res?.items || res?.data || []);

const money = (n) =>
  Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const qty = (n) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 4 });

export default function PlanningScreen() {
  const [boms, setBoms] = React.useState([]);
  const [bomsLoading, setBomsLoading] = React.useState(true);
  const [bomsError, setBomsError] = React.useState(null);

  const [bomId, setBomId] = React.useState("");
  const [purchasedAsLeaf, setPurchasedAsLeaf] = React.useState(true);

  const [summary, setSummary] = React.useState(null);
  const [summaryLoading, setSummaryLoading] = React.useState(false);
  const [summaryError, setSummaryError] = React.useState(null);

  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);
  const [created, setCreated] = React.useState(null);

  React.useEffect(() => {
    let cancelled = false;
    setBomsLoading(true);
    setBomsError(null);
    api.bomEnterprise
      .list({ limit: 500 })
      .then((res) => {
        if (!cancelled) setBoms(asList(res));
      })
      .catch((e) => {
        if (!cancelled) setBomsError(e?.message || String(e));
      })
      .finally(() => {
        if (!cancelled) setBomsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadSummary = React.useCallback(async (id, leaf) => {
    if (!id) {
      setSummary(null);
      setSummaryError(null);
      return;
    }
    setSummaryLoading(true);
    setSummaryError(null);
    setCreated(null);
    try {
      setSummary(await api.planning.summary(id, leaf));
    } catch (e) {
      setSummary(null);
      setSummaryError(e?.message || String(e));
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadSummary(bomId, purchasedAsLeaf);
  }, [bomId, purchasedAsLeaf, loadSummary]);

  const items = summary?.items || NO_ITEMS;

  // One row per vendor group — this is exactly how the server will split the
  // POs it writes, so the preview and the result line up.
  const groups = React.useMemo(() => {
    const byVendor = new Map();
    items.forEach((row) => {
      const key = row.vendor_id ?? UNASSIGNED;
      const g = byVendor.get(key) || {
        key,
        vendor_id: row.vendor_id ?? null,
        vendor_name: row.vendor_name || UNASSIGNED,
        lines: 0,
        cost: 0,
      };
      g.lines += 1;
      g.cost += Number(row.extended_cost || 0);
      byVendor.set(key, g);
    });
    return [...byVendor.values()].sort((a, b) => b.cost - a.cost);
  }, [items]);

  const noVendorCount = items.filter((r) => !r.vendor_id).length;
  const noCostCount = items.filter((r) => !Number(r.unit_cost)).length;
  const selectedBom = boms.find((b) => String(b.id) === String(bomId));

  const generate = async () => {
    setGenerating(true);
    try {
      const res = await api.planning.generatePO(bomId, purchasedAsLeaf);
      const pos = asList(res);
      setCreated(pos);
      setConfirmOpen(false);
      toast(
        (__t("planning.generated") || "Created") +
          " " +
          pos.length +
          " " +
          (pos.length === 1
            ? __t("planning.draftPo") || "draft purchase order"
            : __t("planning.draftPos") || "draft purchase orders") +
          ": " +
          pos.map((p) => p.poNumber || `#${p.id}`).join(", "),
        { kind: "success" },
      );
    } catch (e) {
      toast(
        (__t("planning.generateFailed") || "Could not generate purchase orders") +
          ": " +
          (e?.message || String(e)),
        { kind: "error" },
      );
    } finally {
      setGenerating(false);
    }
  };

  const itemColumns = [
    {
      key: "part",
      header: __t("planning.part") || "Part",
      render: (row) => (
        <div>
          <div className="planning__name">{row.part_name || row.part_number || `#${row.part_id}`}</div>
          <div className="planning__sub">{row.part_number || "—"}</div>
        </div>
      ),
    },
    {
      key: "vendor",
      header: __t("planning.vendor") || "Vendor",
      render: (row) =>
        row.vendor_id ? (
          row.vendor_name
        ) : (
          <StatusPill tone="warn">{__t("planning.noVendor") || "Unassigned"}</StatusPill>
        ),
    },
    {
      key: "required_qty",
      header: __t("planning.requiredQty") || "Required qty",
      align: "right",
      render: (row) => `${qty(row.required_qty)}${row.unit ? " " + row.unit : ""}`,
    },
    {
      key: "unit_cost",
      header: __t("planning.unitCost") || "Unit cost",
      align: "right",
      render: (row) =>
        Number(row.unit_cost) ? (
          money(row.unit_cost)
        ) : (
          <span className="planning__muted">{__t("planning.noCost") || "no cost on file"}</span>
        ),
    },
    {
      key: "extended_cost",
      header: __t("planning.extendedCost") || "Extended cost",
      align: "right",
      render: (row) => money(row.extended_cost),
    },
  ];

  const createdColumns = [
    {
      key: "poNumber",
      header: __t("planning.poNumber") || "PO number",
      render: (row) => (
        <div>
          <div className="planning__name">{row.poNumber || `#${row.id}`}</div>
          <div className="planning__sub">
            {(__t("planning.poId") || "id")} {row.id}
          </div>
        </div>
      ),
    },
    {
      key: "vendorName",
      header: __t("planning.vendor") || "Vendor",
      render: (row) => row.vendorName || "—",
    },
    {
      key: "status",
      header: __t("planning.status") || "Status",
      render: (row) => <StatusPill tone="neutral">{row.status || "—"}</StatusPill>,
    },
    {
      key: "line_count",
      header: __t("planning.lines") || "Lines",
      align: "right",
      render: (row) => row.line_count ?? (row.items || []).length,
    },
    {
      key: "poTotal",
      header: __t("planning.poTotal") || "PO total",
      align: "right",
      render: (row) => money(row.poTotal),
    },
  ];

  return (
    <div className="planning">
      <ScreenHeader
        title={__t("planning.title") || "Planning & PO Generation"}
        description={
          __t("planning.subtitle") ||
          "Explode a BOM into required quantities and turn them into draft purchase orders, grouped by vendor"
        }
      />

      <div className="planning__toolbar">
        <label className="planning__label" htmlFor="planning-bom">
          {__t("planning.bom") || "BOM"}
        </label>
        <select
          id="planning-bom"
          name="planningBom"
          className="planning__select"
          value={bomId}
          disabled={bomsLoading || generating}
          onChange={(e) => setBomId(e.target.value)}
        >
          <option value="">{__t("planning.selectBom") || "Select a BOM…"}</option>
          {boms.map((b) => (
            <option key={b.id} value={b.id}>
              {[b.bom_number, b.name].filter(Boolean).join(" — ") || `BOM #${b.id}`}
            </option>
          ))}
        </select>

        <label className="planning__check">
          <input
            type="checkbox"
            name="planningPurchasedAsLeaf"
            checked={purchasedAsLeaf}
            disabled={generating}
            onChange={(e) => setPurchasedAsLeaf(e.target.checked)}
          />
          {__t("planning.purchasedAsLeaf") || "Treat purchased parts as leaves"}
        </label>

        <Button
          variant="secondary"
          disabled={!bomId || summaryLoading || generating}
          onClick={() => loadSummary(bomId, purchasedAsLeaf)}
        >
          <Icon.Refresh size={12} /> {__t("common.refresh") || "Refresh"}
        </Button>
      </div>

      {bomsError && (
        <div className="planning__state planning__state--error" role="alert">
          {(__t("planning.bomsFailed") || "Could not load BOMs") + ": " + bomsError}
        </div>
      )}

      {!bomsLoading && !bomsError && boms.length === 0 && (
        <EmptyState
          title={__t("planning.noBomsTitle") || "No BOMs available"}
          message={
            __t("planning.noBoms") ||
            "There is no BOM to plan against yet. Create one first, then come back here."
          }
        />
      )}

      {!bomId && boms.length > 0 && (
        <EmptyState
          title={__t("planning.pickTitle") || "Pick a BOM to plan"}
          message={
            __t("planning.pick") ||
            "Choose a BOM above to see what it requires and what the purchase orders would cost."
          }
        />
      )}

      {bomId && summaryLoading && (
        <div className="planning__state" role="status">
          {__t("common.loading") || "Loading…"}
        </div>
      )}

      {bomId && !summaryLoading && summaryError && (
        <div className="planning__state planning__state--error" role="alert">
          {(__t("planning.summaryFailed") || "Could not load the planning summary") +
            ": " +
            summaryError}
        </div>
      )}

      {bomId && !summaryLoading && !summaryError && summary && items.length === 0 && (
        <EmptyState
          title={__t("planning.emptyTitle") || "Nothing to purchase"}
          message={
            __t("planning.empty") ||
            "This BOM explodes to no purchasable line items, so there is nothing to raise a PO for."
          }
        />
      )}

      {bomId && !summaryLoading && !summaryError && items.length > 0 && (
        <>
          <div className="planning__stats">
            <div className="planning__stat">
              <span className="planning__stat-label">
                {__t("planning.uniqueParts") || "Unique parts"}
              </span>
              <span className="planning__stat-value">{summary.unique_parts}</span>
            </div>
            <div className="planning__stat">
              <span className="planning__stat-label">
                {__t("planning.totalQty") || "Total required qty"}
              </span>
              <span className="planning__stat-value">{qty(summary.total_required_qty)}</span>
            </div>
            <div className="planning__stat">
              <span className="planning__stat-label">
                {__t("planning.totalCost") || "Total extended cost"}
              </span>
              <span className="planning__stat-value">{money(summary.total_extended_cost)}</span>
            </div>
            <div className="planning__stat">
              <span className="planning__stat-label">
                {__t("planning.posToCreate") || "POs to create"}
              </span>
              <span className="planning__stat-value">{groups.length}</span>
            </div>
          </div>

          {(noVendorCount > 0 || noCostCount > 0) && (
            <div className="planning__warn" role="note">
              {noVendorCount > 0 &&
                `${noVendorCount} ${
                  __t("planning.warnNoVendor") ||
                  "part(s) have no vendor and will land on one “Unassigned” draft PO."
                } `}
              {noCostCount > 0 &&
                `${noCostCount} ${
                  __t("planning.warnNoCost") ||
                  "part(s) have no unit cost on file and will be priced at 0."
                }`}
            </div>
          )}

          <h3 className="planning__h3">
            {__t("planning.byVendor") || "Draft POs that would be created"}
          </h3>
          <DataTable
            columns={[
              {
                key: "vendor_name",
                header: __t("planning.vendor") || "Vendor",
                render: (row) =>
                  row.vendor_id ? (
                    row.vendor_name
                  ) : (
                    <StatusPill tone="warn">{__t("planning.noVendor") || "Unassigned"}</StatusPill>
                  ),
              },
              {
                key: "lines",
                header: __t("planning.lines") || "Lines",
                align: "right",
                render: (row) => row.lines,
              },
              {
                key: "cost",
                header: __t("planning.extendedCost") || "Extended cost",
                align: "right",
                render: (row) => money(row.cost),
              },
            ]}
            rows={groups}
            getRowKey={(row) => String(row.key)}
            ariaLabel={__t("planning.byVendor") || "Draft POs that would be created"}
            dense
          />

          <div className="planning__actions">
            <Button
              variant="primary"
              disabled={generating}
              onClick={() => setConfirmOpen(true)}
            >
              {generating
                ? __t("planning.generating") || "Generating…"
                : __t("planning.generate") || "Generate purchase orders"}
            </Button>
          </div>

          <h3 className="planning__h3">
            {__t("planning.requirements") || "Required quantities"}
          </h3>
          <DataTable
            columns={itemColumns}
            rows={items}
            getRowKey={(row) => row.part_id}
            ariaLabel={__t("planning.requirements") || "Required quantities"}
            dense
          />
        </>
      )}

      {created && (
        <div className="planning__created">
          <h3 className="planning__h3">
            {created.length +
              " " +
              (__t("planning.createdTitle") || "draft purchase order(s) created")}
          </h3>
          {created.length === 0 ? (
            <EmptyState
              title={__t("planning.createdNoneTitle") || "No purchase orders were created"}
              message={
                __t("planning.createdNone") ||
                "The server accepted the request but returned no purchase orders."
              }
            />
          ) : (
            <DataTable
              columns={createdColumns}
              rows={created}
              getRowKey={(row) => row.id}
              ariaLabel={__t("planning.createdTitle") || "Created purchase orders"}
              dense
            />
          )}
        </div>
      )}

      <Modal
        open={confirmOpen}
        onClose={() => (generating ? null : setConfirmOpen(false))}
        title={__t("planning.confirmTitle") || "Generate purchase orders?"}
        subtitle={
          selectedBom
            ? [selectedBom.bom_number, selectedBom.name].filter(Boolean).join(" — ")
            : undefined
        }
        footer={
          <>
            <Button
              variant="secondary"
              disabled={generating}
              onClick={() => setConfirmOpen(false)}
            >
              {__t("common.cancel") || "Cancel"}
            </Button>
            <Button variant="primary" disabled={generating} onClick={generate}>
              {generating
                ? __t("planning.generating") || "Generating…"
                : __t("planning.confirm") || "Yes, create them"}
            </Button>
          </>
        }
      >
        <p>
          {__t("planning.confirmBody") ||
            "This writes real draft purchase orders to the system. It cannot be undone from this screen."}
        </p>
        <ul className="planning__confirm-list">
          <li>
            {groups.length} {__t("planning.confirmPos") || "draft PO(s), one per vendor"}
          </li>
          <li>
            {items.length} {__t("planning.confirmLines") || "line(s) in total"}
          </li>
          <li>
            {money(summary?.total_extended_cost)}{" "}
            {__t("planning.confirmValue") || "estimated value"}
          </li>
          {noVendorCount > 0 && (
            <li>
              {noVendorCount}{" "}
              {__t("planning.confirmUnassigned") ||
                "line(s) with no vendor go onto an “Unassigned” PO"}
            </li>
          )}
        </ul>
      </Modal>

      <style>{`
        .planning__toolbar {
          display: flex;
          gap: var(--sp-2);
          align-items: center;
          flex-wrap: wrap;
          margin-bottom: var(--sp-3);
        }
        .planning__label { font-size: var(--fs-075); color: var(--text-muted); }
        .planning__select {
          height: var(--control-h);
          padding: 0 var(--sp-2);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-sm);
          background: var(--bg-surface);
          color: var(--text-primary);
          font-size: var(--fs-100);
          min-width: 280px;
        }
        .planning__check {
          display: inline-flex;
          align-items: center;
          gap: var(--sp-1);
          font-size: var(--fs-075);
          color: var(--text-secondary);
        }
        .planning__stats {
          display: flex;
          gap: var(--sp-4);
          flex-wrap: wrap;
          margin-bottom: var(--sp-3);
        }
        .planning__stat { display: flex; flex-direction: column; gap: 2px; }
        .planning__stat-label { font-size: var(--fs-075); color: var(--text-muted); }
        .planning__stat-value { font-size: var(--fs-125); color: var(--text-primary); }
        .planning__warn {
          margin-bottom: var(--sp-3);
          font-size: var(--fs-075);
          color: var(--text-secondary);
        }
        .planning__h3 {
          margin: var(--sp-4) 0 var(--sp-2);
          font-size: var(--fs-100);
          color: var(--text-secondary);
        }
        .planning__actions { margin-top: var(--sp-3); }
        .planning__name { font-weight: var(--fw-medium); color: var(--text-primary); }
        .planning__sub { font-size: var(--fs-075); color: var(--text-muted); }
        .planning__muted { color: var(--text-muted); }
        .planning__confirm-list {
          margin: var(--sp-2) 0 0 var(--sp-4);
          font-size: var(--fs-075);
          color: var(--text-secondary);
        }
        .planning__state {
          padding: var(--sp-5);
          text-align: center;
          color: var(--text-secondary);
          font-size: var(--fs-100);
        }
        .planning__state--error { color: var(--danger-text, #b42318); }
      `}</style>
    </div>
  );
}
