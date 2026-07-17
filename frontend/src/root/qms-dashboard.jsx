import { useState, useEffect } from "react";
import { __t } from "../i18n";
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

export function QMSDashboard() {
  const [activeTab, setActiveTab] = useState("NCR");
  const [data, setData] = useState({ ncrs: [], capas: [], fais: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Mock fetch
    const timer = setTimeout(() => {
      setData({
        ncrs: [
          { id: "NCR-001", part: "PT-998", issue: "Dimension out of spec", status: "Open", date: "2024-03-01" },
          { id: "NCR-002", part: "PT-112", issue: "Surface scratch", status: "Closed", date: "2024-02-15" }
        ],
        capas: [
          { id: "CAPA-40", title: "Update calibration process", status: "In Progress", dueDate: "2024-04-10" }
        ],
        fais: [
          { id: "FAI-901", part: "PT-998-A", result: "Pass", inspector: "J. Doe" }
        ]
      });
      setLoading(false);
    }, 400);
    return () => clearTimeout(timer);
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
