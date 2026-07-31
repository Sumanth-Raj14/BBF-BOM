import { useState, useEffect } from "react";
import { __t } from "../i18n";
import { api } from "../globals";
import { toast } from "../utils/toast";
import {
  ScreenHeader,
  Tabs,
  TabPanel,
  DataTable,
  StatusPill,
  EmptyState,
  Spinner,
} from "../components/ui";

const QMS_TABS_ID = "qms-tabs";

const NCR_COLUMNS = [
  { key: "id", header: __t("enterprise.qms.col.id") || "ID" },
  { key: "part", header: __t("enterprise.qms.col.part") || "Part" },
  { key: "issue", header: __t("enterprise.qms.col.issue") || "Issue" },
  {
    key: "status",
    header: __t("enterprise.qms.col.status") || "Status",
    render: (row) => <StatusPill status={row.status} />,
  },
  { key: "date", header: __t("enterprise.qms.col.date") || "Date" },
];

const CAPA_COLUMNS = [
  { key: "id", header: __t("enterprise.qms.col.id") || "ID" },
  { key: "title", header: __t("enterprise.qms.col.title") || "Title" },
  {
    key: "status",
    header: __t("enterprise.qms.col.status") || "Status",
    render: (row) => <StatusPill status={row.status} />,
  },
  { key: "dueDate", header: __t("enterprise.qms.col.dueDate") || "Due Date" },
];

const FAI_COLUMNS = [
  { key: "id", header: __t("enterprise.qms.col.id") || "ID" },
  { key: "part", header: __t("enterprise.qms.col.part") || "Part" },
  {
    key: "result",
    header: __t("enterprise.qms.col.result") || "Result",
    render: (row) => <StatusPill status={row.result} />,
  },
  { key: "inspector", header: __t("enterprise.qms.col.inspector") || "Inspector" },
];

// Real API rows are camelCase (capas/fai) or snake_case (NCR, older quality
// module) depending on backend route. Map both shapes defensively onto the
// same row shape the columns above expect — never fabricate a value, fall
// back to an em dash placeholder instead.
function fmtDate(value) {
  if (!value) return "—";
  const s = String(value);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function mapNcrRow(n) {
  const partId = n.part_id ?? n.partId;
  return {
    id: n.ncr_number || n.ncrNumber || (n.id != null ? `NCR-${n.id}` : "—"),
    part: n.part_number || n.partNumber || (partId != null ? `Part #${partId}` : "—"),
    issue: n.defect_description || n.description || n.issue || "—",
    status: n.status || "—",
    date: fmtDate(n.detected_at || n.created_at || n.date),
  };
}

function mapCapaRow(c) {
  return {
    id: c.capaNumber || c.capa_number || (c.id != null ? `CAPA-${c.id}` : "—"),
    title: c.title || "—",
    status: c.status || "—",
    dueDate: fmtDate(c.targetDate || c.due_date || c.dueDate),
  };
}

function mapFaiRow(f) {
  return {
    id: f.faiNumber || f.fai_number || (f.id != null ? `FAI-${f.id}` : "—"),
    part: f.partNumber || f.partName || f.part_number || "—",
    result: f.result || "—",
    inspector: f.inspectorName || f.inspector_name || "—",
  };
}

function rowsOf(settledResult) {
  if (settledResult.status !== "fulfilled") return [];
  const value = settledResult.value;
  return Array.isArray(value) ? value : value?.items || [];
}

export function QMSDashboard() {
  const [activeTab, setActiveTab] = useState("NCR");
  const [data, setData] = useState({ ncrs: [], capas: [], fais: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    Promise.allSettled([
      api?.quality?.ncr?.list ? api.quality.ncr.list({ per_page: 100 }) : Promise.resolve([]),
      api?.capa?.list ? api.capa.list({ per_page: 100 }) : Promise.resolve([]),
      api?.fai?.list ? api.fai.list({ per_page: 100 }) : Promise.resolve([]),
    ]).then(([ncrRes, capaRes, faiRes]) => {
      if (cancelled) return;

      if (ncrRes.status === "rejected") {
        toast(ncrRes.reason?.message || (__t("enterprise.qms.ncrLoadError") || "Could not load NCRs"), { kind: "error" });
      }
      if (capaRes.status === "rejected") {
        toast(capaRes.reason?.message || (__t("enterprise.qms.capaLoadError") || "Could not load CAPAs"), { kind: "error" });
      }
      if (faiRes.status === "rejected") {
        toast(faiRes.reason?.message || (__t("enterprise.qms.faiLoadError") || "Could not load first article inspections"), { kind: "error" });
      }

      setData({
        ncrs: rowsOf(ncrRes).map(mapNcrRow),
        capas: rowsOf(capaRes).map(mapCapaRow),
        fais: rowsOf(faiRes).map(mapFaiRow),
      });
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const tabs = [
    { value: "NCR", label: __t("enterprise.qms.tab.ncr") || "NCR", count: data.ncrs.length },
    { value: "CAPA", label: __t("enterprise.qms.tab.capa") || "CAPA", count: data.capas.length },
    { value: "FAI", label: __t("enterprise.qms.tab.fai") || "FAI", count: data.fais.length },
  ];

  return (
    <div className="screen-wrap" data-screen-label="QMS Dashboard">
      <ScreenHeader
        title={__t("enterprise.qms.title") || "Quality Management (QMS)"}
        description={__t("enterprise.qms.subtitle") || "Manage NCRs, CAPAs, and First Article Inspections"}
      />

      <Tabs
        id={QMS_TABS_ID}
        items={tabs}
        value={activeTab}
        onChange={setActiveTab}
        ariaLabel={__t("enterprise.qms.tabsLabel") || "QMS record types"}
      />

      <TabPanel id={QMS_TABS_ID} value={activeTab} active className="mt-14">
        {loading ? (
          <div className="flex items-center gap-8 fg-3 fs-12" style={{ padding: "32px 0" }}>
            <Spinner size="sm" label={(__t("enterprise.qms.loading") || "Loading") + " " + activeTab + "…"} />
            <span aria-hidden="true">
              {(__t("enterprise.qms.loading") || "Loading")} {activeTab}…
            </span>
          </div>
        ) : (
          <>
            {activeTab === "NCR" && (
              <DataTable
                dense
                ariaLabel={__t("enterprise.qms.ncrTable") || "Non-conformance reports"}
                columns={NCR_COLUMNS}
                rows={data.ncrs}
                empty={
                  <EmptyState
                    title={__t("enterprise.qms.noNcr") || "No non-conformances"}
                    message={__t("enterprise.qms.noNcrMsg") || "No non-conformance reports found."}
                  />
                }
              />
            )}
            {activeTab === "CAPA" && (
              <DataTable
                dense
                ariaLabel={__t("enterprise.qms.capaTable") || "Corrective and preventive actions"}
                columns={CAPA_COLUMNS}
                rows={data.capas}
                empty={
                  <EmptyState
                    title={__t("enterprise.qms.noCapa") || "No corrective actions"}
                    message={__t("enterprise.qms.noCapaMsg") || "No corrective actions found."}
                  />
                }
              />
            )}
            {activeTab === "FAI" && (
              <DataTable
                dense
                ariaLabel={__t("enterprise.qms.faiTable") || "First article inspections"}
                columns={FAI_COLUMNS}
                rows={data.fais}
                empty={
                  <EmptyState
                    title={__t("enterprise.qms.noFai") || "No first article inspections"}
                    message={__t("enterprise.qms.noFaiMsg") || "No first article inspections found."}
                  />
                }
              />
            )}
          </>
        )}
      </TabPanel>
    </div>
  );
}

window.QMSScreen = QMSDashboard;
