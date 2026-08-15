import PropTypes from "prop-types";

import { __t } from "../i18n";
import { toast } from "../utils/toast";
import { INR, Icon, LeadHeat, Sparkline, api, useAppStore } from "../globals";
import { Badge, Button, DataTable, EmptyState, StatusPill, Tooltip } from "./ui";

// Same id resolution the vendors tab in the detail drawer uses: BOM rows
// carry either a real numeric part id or the "api-<id>" form.
function partIdOf(row) {
  if (row && typeof row.partId === "number") return row.partId;
  if (row && typeof row.id === "string" && row.id.startsWith("api-")) {
    const n = parseInt(row.id.replace("api-", ""), 10);
    if (!isNaN(n)) return n;
  }
  if (row && typeof row.id === "number") return row.id;
  return null;
}

function SourcingView({ data, onOpenDetail }) {
  const ctx = useAppStore();
  // Real AVL counts from the part_vendors table (GET /part-vendors), keyed
  // by partId: every part that has any vendor link gets an entry, so a part
  // missing from the map means "no AVL data" (rendered as unknown) rather
  // than a measured zero. counts === null while loading or on failure —
  // neither ever falls back to a made-up number.
  const [avl, setAvl] = React.useState({
    loading: true,
    counts: null,
    error: null,
  });

  React.useEffect(() => {
    if (!api?.partVendors?.list) {
      setAvl({ loading: false, counts: null, error: "unavailable" });
      return undefined;
    }
    let cancelled = false;
    // The endpoint has no multi-part filter, so this reads the link table
    // in one paginated pass instead of one request per BOM leaf.
    // ponytail: client-side page loop, swap for a server-side
    // count-by-part endpoint if the link table ever gets large.
    const page = (n) => api.partVendors.list({ page: n, per_page: 500 });
    page(1)
      .then(async (first) => {
        let items = (first && first.items) || [];
        const pages = (first && first.total_pages) || 1;
        if (pages > 1) {
          const rest = await Promise.all(
            Array.from({ length: pages - 1 }, (_, k) => page(k + 2)),
          );
          rest.forEach((r) => {
            items = items.concat((r && r.items) || []);
          });
        }
        if (cancelled) return;
        const counts = {};
        items.forEach((pv) => {
          counts[pv.partId] = (counts[pv.partId] || 0) + (pv.isAlternate ? 1 : 0);
        });
        setAvl({ loading: false, counts, error: null });
      })
      .catch((e) => {
        if (cancelled) return;
        setAvl({
          loading: false,
          counts: null,
          error: e?.message || "Failed to load alternate vendors",
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = ctx?.rows || data.rows;
  const leaves = [];
  const walk = (rs) =>
    rs.forEach((r) => {
      if (r.children) walk(r.children);
      else leaves.push(r);
    });
  walk(rows);

  const sourcingRows = leaves.map((r) => {
    const pid = partIdOf(r);
    return {
      ...r,
      // null = no AVL row for this part (unknown), never a stand-in 0.
      _alts:
        avl.counts && pid != null && pid in avl.counts ? avl.counts[pid] : null,
      _risk: r.lead >= 30 ? "High" : r.lead >= 14 ? "Med" : "Low",
    };
  });

  const columns = [
    {
      key: "pn",
      header: __t("bomShell.colPartNo"),
      render: (r) => <span className="font-mono">{r.pn}</span>,
    },
    {
      key: "name",
      header: __t("bomShell.colName"),
      render: (r) => <span className="fw-500">{r.name}</span>,
    },
    { key: "vendor", header: __t("bomShell.colVendor") },
    {
      key: "origin",
      header: __t("bomShell.colOrigin"),
      render: (r) => <span className="font-mono">{r.origin}</span>,
    },
    {
      key: "alts",
      header: __t("bomShell.altVendors"),
      render: (r) => {
        if (avl.loading)
          return (
            <span className="hint font-mono">
              {__t("common.loading") || "Loading…"}
            </span>
          );
        if (avl.error)
          return (
            <Tooltip label={avl.error}>
              <Badge tone="warning" className="fs-10 font-mono">
                {__t("common.loadFailed") || "Load failed"}
              </Badge>
            </Tooltip>
          );
        if (r._alts == null)
          return (
            <Tooltip label={__t("common.noData") || "No data"}>
              <span className="hint font-mono">—</span>
            </Tooltip>
          );
        return r._alts === 0 ? (
          <Badge tone="danger" className="fs-10 font-mono">
            {__t("part.singleSource")}
          </Badge>
        ) : (
          <Tooltip label={`${r._alts} ${__t("bomShell.altVendors")}`}>
            <Badge tone="neutral" pill className="font-mono">
              {r._alts}
            </Badge>
          </Tooltip>
        );
      },
    },
    {
      key: "lead",
      header: __t("bomShell.colLead"),
      render: (r) => <LeadHeat days={r.lead} />,
    },
    {
      key: "cost",
      header: __t("bomShell.colUnit"),
      align: "num",
      render: (r) => <span className="font-mono">{INR(r.cost, 2)}</span>,
    },
    {
      key: "trend",
      header: __t("bomShell.trend"),
      render: (r) => <Sparkline data={r.trend} />,
    },
    {
      key: "risk",
      header: __t("bomShell.risk"),
      render: (r) => (
        <StatusPill
          status={r._risk}
          tone={
            r._risk === "Low"
              ? "success"
              : r._risk === "Med"
                ? "warning"
                : "danger"
          }
        />
      ),
    },
    {
      key: "actions",
      header: "",
      render: (r) => (
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          className="w-22 h-22"
          aria-label={__t("bomShell.searchAlternates")}
          title={__t("bomShell.searchAlternates")}
          onClick={(e) => {
            e.stopPropagation();
            toast(__t("bomShell.searchAlternates") + ": " + r.pn);
          }}
        >
          <Icon.Search size={11} />
        </Button>
      ),
    },
  ];

  return (
    <div className="bom-scroll" style={{ padding: "var(--sp-5) var(--sp-6)" }}>
      <div className="flex justify-between items-baseline mb-12">
        <h2 className="m-0 fs-16 fw-600">
          {__t("bomShell.tabSourcing") || "Sourcing matrix"}
        </h2>
        {/* Vendor/country totals used to be hardcoded here (14 · 6) — dropped
            rather than replaced: the AVL fetch below covers the whole link
            table, not just this BOM, so it can't honestly total either. */}
        <div className="hint">{leaves.length} sourceable parts</div>
      </div>

      <DataTable
        dense
        zebra
        columns={columns}
        rows={sourcingRows}
        getRowKey={(r) => r.id}
        onRowClick={(r) => onOpenDetail(r)}
        ariaLabel={__t("bomShell.tabSourcing") || "Sourcing matrix"}
        empty={<EmptyState message={__t("common.noData")} />}
      />
    </div>
  );
}

SourcingView.propTypes = {
  data: PropTypes.object,
  onOpenDetail: PropTypes.func,
};

export default SourcingView;
window.SourcingView = SourcingView;
