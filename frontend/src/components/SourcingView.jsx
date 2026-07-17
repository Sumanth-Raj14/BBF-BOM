import PropTypes from "prop-types";

import { __t } from "../i18n";
import { toast } from "../utils/toast";
import { INR, useAppStore } from "../globals";
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

  return (
    <div className="bom-scroll" style={{ padding: "20px 28px" }}>
      <div className="flex justify-between items-baseline mb-12">
        <h2 className="m-0 fs-16 fw-600">Sourcing matrix</h2>
        <div className="hint">
          {leaves.length} sourceable parts \u00B7 14 vendors \u00B7 6 countries
        </div>
      </div>

      <div className="border-line rounded-r3 overflow-h">
        <table className="bom-table table-auto">
          <thead>
            <tr>
              <th className="pl-14">{__t("bomShell.colPartNo")}</th>
              <th>{__t("bomShell.colName")}</th>
              <th>{__t("bomShell.colVendor")}</th>
              <th>{__t("bomShell.colOrigin")}</th>
              <th>{__t("bomShell.altVendors")}</th>
              <th>{__t("bomShell.colLead")}</th>
              <th className="num">{__t("bomShell.colUnit")}</th>
              <th>{__t("bomShell.trend")}</th>
              <th>{__t("bomShell.risk")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {leaves.map((r, i) => {
              const alts = Math.max(0, (r.pn.charCodeAt(0) + i) % 4);
              const risk = r.lead >= 30 ? "High" : r.lead >= 14 ? "Med" : "Low";
              return (
                <tr
                  key={r.id}
                  onClick={() => onOpenDetail(r)}
                  className="cursor-pointer"
                >
                  <td className="mono pl-14">{r.pn}</td>
                  <td>
                    <span className="fw-500">{r.name}</span>
                  </td>
                  <td>{r.vendor}</td>
                  <td className="mono">{r.origin}</td>
                  <td>
                    {alts === 0 ? (
                      <span className="fg-danger font-mono fs-10">
                        {__t("part.singleSource")}
                      </span>
                    ) : (
                      <span className="inline-flex gap-4 w-16 h-16 bg-sunk border-line inline-flex items-center justify-center font-mono">
                        {Array.from({ length: alts }, (_, j) => (
                          <span
                            key={j}
                            style={{ borderRadius: 99, fontSize: 8 }}
                          >
                            {j + 2}
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                  <td>
                    <LeadHeat days={r.lead} />
                  </td>
                  <td className="num mono">{INR(r.cost, 2)}</td>
                  <td>
                    <Sparkline data={r.trend} />
                  </td>
                  <td>
                    <span
                      className={
                        "status " +
                        (risk === "Low"
                          ? "released"
                          : risk === "Med"
                            ? "review"
                            : "deprecated")
                      }
                    >
                      {risk}
                    </span>
                  </td>
                  <td>
                    <button
                      className="icon-btn w-22 h-22"
                      aria-label={__t("bomShell.searchAlternates")}
                      onClick={(e) => {
                        e.stopPropagation();
                        toast(__t("bomShell.searchAlternates") + ": " + r.pn);
                      }}
                    >
                      <Icon.Search size={11} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

SourcingView.propTypes = {
  data: PropTypes.object,
  onOpenDetail: PropTypes.func,
};

export default SourcingView;
window.SourcingView = SourcingView;
