import PropTypes from "prop-types";

import { __t } from "../i18n";
import { INR, api, useAppStore } from "../globals";
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
      <div className="empty" style={{ padding: 60 }}>
        <p>{__t("common.noData")}</p>
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

  return (
    <div className="bom-scroll" style={{ padding: "20px 28px" }}>
      <div className="flex justify-between items-baseline mb-12">
        <h2 className="m-0 fs-16 fw-600">
          Cost roll-up \u00B7 by sub-assembly{" "}
          {loading && <span className="fs-10 fg-3 ml-8">Loading\u2026</span>}
        </h2>
        <div className="hint">
          Total {INR(apiRollup?.total_cost || total, 2)}
        </div>
      </div>

      <div className="rollup-list w-full" className="p-0">
        {subs.map((s) => {
          const pct = (s.ext / total) * 100;
          const width = (s.ext / max) * 100;
          return (
            <div key={s.id} className="rollup-row">
              <span
                className={("cat assembly" + " fs-9").trim()}
                style={{ padding: "2px 4px" }}
              >
                {s.children.length}
              </span>
              <div>
                <div className="name">{s.name}</div>
                <div className="pn">
                  {s.pn} \u00B7 Rev {s.rev}
                </div>
                <div className="h-18 mt-8 bg-sunk br-2 overflow-h pos-relative">
                  <div
                    className="h-100p bg-accent br-2 flex items-center pl-8 font-mono fs-10 fw-600"
                    style={{ width: width + "%", color: "white" }}
                  >
                    {pct >= 8 ? pct.toFixed(1) + "%" : ""}
                  </div>
                </div>
              </div>
              <div className="ext">{INR(s.ext, 2)}</div>
              <div className="pct">{pct.toFixed(1)}% of BOM</div>
            </div>
          );
        })}
      </div>

      <h3 className="fs-14 fw-600" style={{ margin: "28px 0 12px" }}>
        {__t("bomShell.mostExpensive")}
      </h3>
      <div className="border-line rounded-r3 overflow-h">
        <table className="bom-table table-auto">
          <thead>
            <tr>
              <th className="pl-14">{__t("bomShell.colPartNo")}</th>
              <th>{__t("bomShell.colName")}</th>
              <th>{__t("bomShell.colCategory")}</th>
              <th>{__t("bomShell.colVendor")}</th>
              <th className="num">{__t("bomShell.colQty")}</th>
              <th className="num">{__t("bomShell.colUnit")}</th>
              <th className="num">{__t("bomShell.colExt")}</th>
              <th className="num">{__t("bomShell.colPctOfBom")}</th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              const leaves = [];
              const walk = (rs) =>
                rs.forEach((r) => {
                  if (r.children) walk(r.children);
                  else leaves.push(r);
                });
              walk(rows);
              leaves.sort((a, b) => b.cost * b.qty - a.cost * a.qty);
              return leaves.slice(0, 10).map((r, i) => {
                const ext = r.cost * r.qty;
                const p = (ext / total) * 100;
                return (
                  <tr key={r.id}>
                    <td className="mono pl-14">{r.pn}</td>
                    <td>
                      <span className="fw-500">{r.name}</span>
                    </td>
                    <td>
                      <span className={"cat " + r.category.toLowerCase()}>
                        {r.category}
                      </span>
                    </td>
                    <td>{r.vendor}</td>
                    <td className="num mono">{r.qty}</td>
                    <td className="num mono">{INR(r.cost, 2)}</td>
                    <td className="num mono fw-600">{INR(ext, 2)}</td>
                    <td className="num">
                      <div className="inline-flex items-center gap-8 justify-end w-100p">
                        <span className="d-iblock w-50 h-4 bg-sunk br-2 overflow-h">
                          <span
                            className="d-block h-100p bg-accent"
                            style={{ width: Math.min(100, p) + "%" }}
                          />
                        </span>
                        <span className="font-mono">{p.toFixed(1)}%</span>
                      </div>
                    </td>
                  </tr>
                );
              });
            })()}
          </tbody>
        </table>
      </div>
    </div>
  );
}

CostRollupView.propTypes = {
  data: PropTypes.object,
};

export default CostRollupView;
window.CostRollupView = CostRollupView;
