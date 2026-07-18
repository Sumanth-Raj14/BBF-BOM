import PropTypes from "prop-types";

import { __t } from "../i18n";
import { api, useAppStore } from "../globals";
import { DataTable, EmptyState, StatusPill } from "./ui";
import { COMPLIANCE_TONE } from "./complianceTone";

// Per-assembly RoHS/REACH compliance roll-up (spec Â§6). Cloned from
// CostRollupView's shape/conventions. This increment is prop-driven only â€”
// the guard below keeps the (future) `api.compliance.boms.rollup` call
// inert until that endpoint/client method exists, so no network call
// happens yet and no error surface is introduced.
function ComplianceRollupView({ data }) {
  const ctx = useAppStore();
  const rows = ctx?.rows || data.rows;
  const [apiRollup, setApiRollup] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const top = rows[0];

  React.useEffect(() => {
    const rollupFn = api && api.compliance && api.compliance.boms && api.compliance.boms.rollup;
    if (typeof rollupFn === "function" && top) {
      setLoading(true);
      rollupFn(top.project_id || top.bomId || 1)
        .then((r) => setApiRollup(r))
        .catch(() => {
          console.warn("Compliance rollup API call failed");
        })
        .finally(() => setLoading(false));
    }
  }, [top?.id]);

  if (!top || !top.children)
    return (
      <div className="bom-scroll flex items-center justify-center">
        <EmptyState message={__t("common.noData")} />
      </div>
    );

  const statusLabel = (status) => __t(`complianceStatus.${status}`) || status;

  const subs = top.children.map((s) => {
    const fromApi = (apiRollup?.items || []).find(
      (i) => i.part_id === s.id || i.id === s.id,
    );
    return {
      ...s,
      rohs_status: fromApi?.rohs_status || s.rohs_status || "UNKNOWN",
      reach_status: fromApi?.reach_status || s.reach_status || "UNKNOWN",
      data_fidelity: fromApi?.data_fidelity || s.data_fidelity || "NO_DATA",
      reach_obligation_count:
        fromApi?.reach_obligation_count ?? s.reach_obligation_count ?? 0,
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
    {
      key: "rohs_status",
      header: __t("complianceRollup.colRohs"),
      render: (r) => (
        <StatusPill
          tone={COMPLIANCE_TONE[r.rohs_status] || "neutral"}
          label={statusLabel(r.rohs_status)}
        />
      ),
    },
    {
      key: "reach_status",
      header: __t("complianceRollup.colReach"),
      render: (r) => (
        <StatusPill
          tone={COMPLIANCE_TONE[r.reach_status] || "neutral"}
          label={statusLabel(r.reach_status)}
        />
      ),
    },
    {
      key: "data_fidelity",
      header: __t("complianceRollup.colFidelity"),
      render: (r) => (
        <span className="fs-11 fg-3">
          {__t(`complianceRollup.fidelity.${r.data_fidelity}`) || r.data_fidelity}
        </span>
      ),
    },
    {
      key: "reach_obligation_count",
      header: __t("complianceRollup.colObligations"),
      align: "num",
      render: (r) => <span className="font-mono">{r.reach_obligation_count}</span>,
    },
  ];

  return (
    <div
      className="bom-scroll"
      style={{ padding: "var(--sp-5) var(--sp-6)" }}
    >
      <div className="flex justify-between items-baseline mb-12">
        <h2 className="m-0 fs-16 fw-600">
          {__t("complianceRollup.bySubassembly")}
          {loading && (
            <span className="fs-10 fg-3 ml-8" role="status">
              {__t("bomShell.loading")}
            </span>
          )}
        </h2>
      </div>

      <DataTable
        dense
        zebra
        columns={columns}
        rows={subs}
        getRowKey={(r) => r.id}
        ariaLabel={__t("complianceRollup.bySubassembly")}
        empty={<EmptyState message={__t("common.noData")} />}
      />
    </div>
  );
}

ComplianceRollupView.propTypes = {
  data: PropTypes.object,
};

export default ComplianceRollupView;
window.ComplianceRollupView = ComplianceRollupView;
