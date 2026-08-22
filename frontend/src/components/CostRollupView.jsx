import PropTypes from "prop-types";

import { __t } from "../i18n";
import { INR, api, useAppStore } from "../globals";
import { DataTable, EmptyState, Select } from "./ui";

// Responses arrive as {items:[...]}, {data:[...]} or a bare array.
const unwrap = (r) =>
  Array.isArray(r) ? r : Array.isArray(r?.items) ? r.items : Array.isArray(r?.data) ? r.data : [];

const ccyCode = (c) => (typeof c === "string" ? c : c && (c.code || c.currency_code)) || "";

function CostRollupView({ data }) {
  const ctx = useAppStore();
  const rows = ctx?.rows || data.rows;
  const [apiRollup, setApiRollup] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  // "" = no reporting currency requested -> the legacy as-costed roll-up.
  const [currency, setCurrency] = React.useState("");
  const [currencies, setCurrencies] = React.useState([]);
  const top = rows[0];

  // Active currencies for the selector (GET /enterprise/currencies). A failure
  // here only costs us the dropdown options, not the roll-up itself.
  React.useEffect(() => {
    if (!api || !api.enterprise) return;
    api.enterprise
      .currencies()
      .then((r) => setCurrencies(unwrap(r)))
      .catch(() => setCurrencies([]));
  }, []);

  React.useEffect(() => {
    if (api && api.bomEnterprise && top) {
      setLoading(true);
      setError(null);
      api.bomEnterprise
        .costRollup(top.project_id || top.bomId || 1, currency || undefined)
        .then((r) => {
          setApiRollup(r);
          // Default the selector to whatever the server says it reported in,
          // so the control reflects reality instead of guessing.
          if (!currency && r && r.reporting_currency) {
            setCurrency(r.reporting_currency);
          }
        })
        .catch((e) => {
          setApiRollup(null);
          setError(e?.message || String(e));
        })
        .finally(() => setLoading(false));
    }
  }, [top?.id, currency]);

  if (!top || !top.children)
    return (
      <div className="bom-scroll flex items-center justify-center">
        <EmptyState message={__t("common.noData")} />
      </div>
    );

  // Extended cost of an entire subtree, with quantities multiplied through
  // every ancestor — the same "effective quantity" the server uses in
  // _compute_levels_and_effective_qty.
  //
  // This used to be `(s.children || []).reduce((a, c) => a + c.cost * c.qty)`:
  // exactly ONE level deep, and it never multiplied by the sub-assembly's own
  // qty. So a 3-level BOM under-counted, and a sub-assembly used twice counted
  // once. The per-row bars then disagreed with the authoritative total printed
  // directly above them.
  const extOf = (node, mult = 1) => {
    const qty = Number(node.qty) || 0;
    const effective = mult * qty;
    if (node.children && node.children.length) {
      return node.children.reduce((acc, c) => acc + extOf(c, effective), 0);
    }
    return (Number(node.cost) || 0) * effective;
  };

  const subs = top.children.map((s) => ({ ...s, ext: extOf(s) }));
  const clientTotal = subs.reduce((s, x) => s + x.ext, 0);

  // The server is authoritative: only it can convert mixed units (a part costed
  // per M on a line counted in CM) and it drops exclude_from_bom subtrees. Use
  // the client sum only as a fallback when the call has not landed or failed.
  const total = apiRollup?.total_cost ?? clientTotal;

  // Percentages must share the base with the headline number, or the bars sum
  // to something other than 100% of the total shown above them.
  const pctBase = total || 1;
  const uomWarnings = apiRollup?.uom_warnings || [];
  const currencyWarnings = apiRollup?.currency_warnings || [];

  // The server converted the total into rc; INR() would multiply it by the
  // local display rate on top of that, which would be a second, invented
  // conversion. So server figures in a reporting currency get formatted as-is.
  const rc = apiRollup?.reporting_currency || null;
  const money = (n) => {
    if (!rc) return INR(n, 2);
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: rc,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(Number(n) || 0);
    } catch {
      return `${(Number(n) || 0).toFixed(2)} ${rc}`;
    }
  };

  const options = currencies.map(ccyCode).filter(Boolean);
  if (currency && !options.includes(currency)) options.unshift(currency);
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
        const p = (ext / pctBase) * 100;
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
        <div className="flex items-center gap-8">
          <label className="hint" htmlFor="rollup-ccy">
            {__t("bomShell.reportingCurrency") || "Reporting currency"}
          </label>
          <Select
            id="rollup-ccy"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            disabled={loading}
          >
            <option value="">
              {__t("bomShell.asCosted") || "As costed (no conversion)"}
            </option>
            {options.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <div className="hint">
            {__t("bomShell.total")} {money(total)}
            {rc ? ` ${rc}` : ""}
          </div>
        </div>
      </div>

      {error && (
        <div className="rollup-warn" role="alert">
          <strong>
            {__t("bomShell.rollupError") || "Cost roll-up could not be loaded"}
          </strong>
          <div className="fs-10 fg-3">{error}</div>
        </div>
      )}

      {/* The server reports a warning per line whose unit it could not
          reconcile with the part's cost unit (e.g. costed per M, consumed in
          CM). Those lines fall back to an unconverted quantity, so the total
          is approximate for them. Silently dropping these warnings, as this
          view used to, presents an approximate number as an exact one. */}
      {uomWarnings.length > 0 && (
        <div className="rollup-warn" role="status">
          <strong>
            {__t("bomShell.uomWarning") ||
              "Some lines could not be unit-converted"}
          </strong>
          <ul>
            {uomWarnings.slice(0, 5).map((w, i) => (
              <li key={w.part_number || i}>
                <span className="font-mono">{w.part_number}</span> — {w.message}
              </li>
            ))}
          </ul>
          {uomWarnings.length > 5 && (
            <div className="fs-10 fg-3">
              +{uomWarnings.length - 5} more
            </div>
          )}
        </div>
      )}

      {/* A line whose source currency has no active exchange rate into the
          reporting currency is NOT folded into the total at 1:1 — the server
          leaves it out and reports it here. The headline number is therefore
          incomplete for those lines, and saying so is the whole point. */}
      {currencyWarnings.length > 0 && (
        <div className="rollup-warn" role="status">
          <strong>
            {__t("bomShell.currencyWarning") ||
              "Some lines have no exchange rate and are excluded from the total"}
          </strong>
          <ul>
            {currencyWarnings.slice(0, 5).map((w, i) => (
              <li key={(w.part_number || "") + i}>
                <span className="font-mono">{w.part_number}</span> — {w.message}
              </li>
            ))}
          </ul>
          {currencyWarnings.length > 5 && (
            <div className="fs-10 fg-3">
              +{currencyWarnings.length - 5} more
            </div>
          )}
        </div>
      )}

      <div className="rollup-list">
        {subs.map((s) => {
          const pct = (s.ext / pctBase) * 100;
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
