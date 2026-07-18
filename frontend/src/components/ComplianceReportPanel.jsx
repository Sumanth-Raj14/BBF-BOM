import { __t } from "../i18n";
import { api, useAppStore } from "../globals";
import { DataTable, EmptyState, StatusPill, Spinner } from "./ui";

// BOM-wide RoHS/REACH compliance rollup — GET
// /substance-compliance/bom/{bom_id}/compliance
// (app.services.substance_compliance_service.compute_bom_compliance).
// Overall status + the union of SVHC substances are server-derived from
// every part reachable anywhere in the assembly tree; nothing here is
// computed client-side.
const ROHS_TONE = {
  compliant: "success",
  non_compliant: "danger",
  exempt: "warning",
  unknown: "neutral",
};

function statusLabel(status) {
  return String(status || "unknown").replace("_", " ");
}

export function ComplianceReportPanel() {
  const ctx = useAppStore();
  const bomId = ctx?.bomId;
  const [report, setReport] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    if (bomId == null) {
      setLoading(false);
      setError("No BOM id available for this project.");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.substanceCompliance
      .bomCompliance(bomId)
      .then((r) => {
        if (!cancelled) setReport(r);
      })
      .catch((e) => {
        // Honest failure — never fall back to fabricated compliance data.
        if (!cancelled) setError(e?.message || "Failed to load BOM compliance report.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bomId]);

  const columns = [
    {
      key: "part_number",
      header: __t("bomShell.colPartNo") || "Part No.",
      render: (r) => <span className="font-mono">{r.part_number || `#${r.part_id}`}</span>,
    },
    {
      key: "rohs_status",
      header: "RoHS",
      render: (r) => (
        <StatusPill tone={ROHS_TONE[r.rohs_status] || "neutral"} label={statusLabel(r.rohs_status)} />
      ),
    },
    {
      key: "svhc",
      header: "SVHC substances",
      render: (r) =>
        r.svhc_substances && r.svhc_substances.length ? (
          <span className="fs-11">{r.svhc_substances.map((s) => s.name).join(", ")}</span>
        ) : (
          <span className="fs-11 fg-3">—</span>
        ),
    },
  ];

  return (
    <div className="bom-scroll" style={{ padding: "var(--sp-5) var(--sp-6)" }}>
      <div className="flex justify-between items-baseline mb-12">
        <h2 className="m-0 fs-16 fw-600">
          {__t("complianceRollup.title") || "BOM Compliance Report"}
          {loading && (
            <span className="fs-10 fg-3 ml-8" role="status">
              <Spinner size="sm" /> {__t("bomShell.loading") || "Loading…"}
            </span>
          )}
        </h2>
        {report && (
          <StatusPill
            tone={ROHS_TONE[report.rohs_status] || "neutral"}
            label={`Overall: ${statusLabel(report.rohs_status)}`}
          />
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="mb-14 fs-12"
          style={{
            padding: "8px 12px",
            borderRadius: "var(--r-2, 6px)",
            background: "color-mix(in oklch, var(--status-danger, red) 10%, transparent)",
          }}
        >
          {error}
        </div>
      )}

      {report && report.svhc_substances && report.svhc_substances.length > 0 && (
        <div className="mb-14">
          <div className="fs-9 uppercase fg-3 font-mono mb-6 fw-600">
            SVHC substances present anywhere in this BOM
          </div>
          <div className="flex gap-6" style={{ flexWrap: "wrap" }}>
            {report.svhc_substances.map((s) => (
              <span
                key={s.id}
                className="fs-10 font-mono"
                style={{
                  padding: "2px 8px",
                  borderRadius: 999,
                  background: "color-mix(in oklch, var(--status-warning, orange) 14%, transparent)",
                }}
                title={s.cas_number || undefined}
              >
                {s.name}
              </span>
            ))}
          </div>
        </div>
      )}

      <DataTable
        dense
        zebra
        ariaLabel={__t("complianceRollup.title") || "BOM Compliance Report"}
        columns={columns}
        rows={report?.parts || []}
        getRowKey={(r) => r.part_id}
        empty={
          loading ? null : <EmptyState message={error ? undefined : __t("common.noData") || "No data"} />
        }
      />
    </div>
  );
}

export default ComplianceReportPanel;
