import PropTypes from "prop-types";

import { __t } from "../i18n";
import { INR, api, useAppStore } from "../globals";
import { DataTable, EmptyState } from "./ui";

function CostRollupView({ data }) {
  const ctx = useAppStore();
  const rows = ctx?.rows || data.rows;
  const [apiRollup, setApiRollup] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const top = rows[0];

  React.useEffect(() => {
    if (api && api.bomEnterprise && top) {
      setLoading(true);
      api.bomEnterprise
        .costRollup(top.project_id || top.bomId || 1)
        .then((r) => setApiRollup(r))
        .catch(() => {
          console.warn("Cost rollup API call failed");
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

  const subs = top.children.map((s) => ({
    ...s,
    ext: (s.children || []).reduce(
      (acc, c) => acc + (c.cost || 0) * (c.qty || 0),
      0,
    ),
  }));
  const total = subs.reduce((s, x) => s + x.ext, 0);
  const max = Math.max(...subs.map((s) => s.ext), 1);

  const leaves = [];
  const walk = (rs) =>
    rs.forEach((r) => {
      if (r.children) walk(r.children);
      else leaves.push(r);
    });
  walk(rows);
  leaves.sort((a, b) => b.cost * b.qty - a.cost * a.qty);
  const topLeaves = leaves.slice(0, 10);

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
      key: "category",
      header: __t("bomShell.colCategory"),
      render: (r) => (
        <span className={"cat " + r.category.toLowerCase()}>
          {r.category}
        </span>
      ),
    },
    { key: "vendor", header: __t("bomShell.colVendor") },
    {
      key: "qty",
      header: __t("bomShell.colQty"),
      align: "num",
      render: (r) => r.qty,
    },
    {
      key: "cost",
      header: __t("bomShell.colUnit"),
      align: "num",
      render: (r) => INR(r.cost, 2),
    },
    {
      key: "ext",
      header: __t("bomShell.colExt"),
      align: "num",
      render: (r) => (
        <span className="fw-600">{INR(r.cost * r.qty, 2)}</span>
      ),
    },
    {
      key: "pctOfBom",
      header: __t("bomShell.colPctOfBom"),
      align: "num",
      render: (r) => {
        const ext = r.cost * r.qty;
        const p = (ext / total) * 100;
        return (
          <div className="inline-flex items-center gap-8 justify-end w-100p">
            <span
              className="d-iblock bg-sunk br-2 overflow-h"
              style={{ width: "48px", height: "4px" }}
            >
              <span
                className="d-block h-100p bg-accent"
                style={{ width: Math.min(100, p) + "%" }}
              />
            </span>
            <span className="font-mono">{p.toFixed(1)}%</span>
          </div>
        );
      },
    },
  ];

  return (
    <div
      className="bom-scroll"
      style={{ padding: "var(--sp-5) var(--sp-6)" }}
    >
      <div className="flex justify-between items-baseline mb-12">
        <h2 className="m-0 fs-16 fw-600">
          {__t("bomShell.bySubassembly")}
          {loading && (
            <span className="fs-10 fg-3 ml-8" role="status">
              {__t("bomShell.loading")}
            </span>
          )}
        </h2>
        <div className="hint">
          {__t("bomShell.total")} {INR(apiRollup?.total_cost || total, 2)}
        </div>
      </div>

      <div className="rollup-list">
        {subs.map((s) => {
          const pct = (s.ext / total) * 100;
          const width = (s.ext / max) * 100;
          return (
            <div key={s.id} className="rollup-row">
              <span className="cat assembly fs-9">{s.children.length}</span>
              <div>
                <div className="name">{s.name}</div>
                <div className="pn">
                  {s.pn} · Rev {s.rev}
                </div>
                <div className="col">
                  <div className="fill" style={{ width: width + "%" }} />
                  {pct >= 8 && (
                    <span className="lbl-in">{pct.toFixed(1)}%</span>
                  )}
                </div>
              </div>
              <div className="ext">{INR(s.ext, 2)}</div>
              <div className="pct">{pct.toFixed(1)}% of BOM</div>
            </div>
          );
        })}
      </div>

      <h3 className="fs-14 fw-600" style={{ margin: "var(--sp-6) 0 var(--sp-3)" }}>
        {__t("bomShell.mostExpensive")}
      </h3>
      <DataTable
        dense
        zebra
        columns={columns}
        rows={topLeaves}
        getRowKey={(r) => r.id}
        ariaLabel={__t("bomShell.mostExpensive")}
        empty={<EmptyState message={__t("common.noData")} />}
      />
    </div>
  );
}

CostRollupView.propTypes = {
  data: PropTypes.object,
};

export default CostRollupView;
window.CostRollupView = CostRollupView;
