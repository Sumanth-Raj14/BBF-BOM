import PropTypes from "prop-types";

import { __t } from "../i18n";
import { toast } from "../utils/toast";
import { INR, Icon, LeadHeat, Sparkline, useAppStore } from "../globals";
import { Badge, Button, DataTable, EmptyState, StatusPill, Tooltip } from "./ui";

function SourcingView({ data, onOpenDetail }) {
  const ctx = useAppStore();
  const rows = ctx?.rows || data.rows;
  const leaves = [];
  const walk = (rs) =>
    rs.forEach((r) => {
      if (r.children) walk(r.children);
      else leaves.push(r);
    });
  walk(rows);

  const sourcingRows = leaves.map((r, i) => ({
    ...r,
    _alts: Math.max(0, (r.pn.charCodeAt(0) + i) % 4),
    _risk: r.lead >= 30 ? "High" : r.lead >= 14 ? "Med" : "Low",
  }));

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
      render: (r) =>
        r._alts === 0 ? (
          <Badge tone="danger" className="fs-10 font-mono">
            {__t("part.singleSource")}
          </Badge>
        ) : (
          <Tooltip label={`${r._alts} ${__t("bomShell.altVendors")}`}>
            <Badge tone="neutral" pill className="font-mono">
              {r._alts}
            </Badge>
          </Tooltip>
        ),
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
        <div className="hint">
          {leaves.length} sourceable parts · 14 vendors · 6 countries
        </div>
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
