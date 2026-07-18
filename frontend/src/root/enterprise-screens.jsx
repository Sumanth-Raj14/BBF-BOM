import React from "react";
import { storage } from "../utils/storage.js";
import { __t } from "../i18n";
import { toast } from "../utils/toast";
import {
  ScreenHeader,
  Tabs,
  TabPanel,
  DataTable,
  Card,
  Badge,
  StatusPill,
  Modal,
  Field,
  Input,
  Select,
  Button,
  EmptyState,
} from "../components/ui";

// Enterprise Screens — Service BOM, Routing, Work Centers, Labor, Currency,
// Compliance, Custom Attrs, API Keys, Dashboards.
// Hoist window registrations early (function declarations are hoisted).
window.EnterpriseDashboardsScreen = EnterpriseDashboardsScreen;
window.ServiceBOMScreen = ServiceBOMScreen;
window.RoutingScreen = RoutingScreen;
window.WorkCentersScreen = WorkCentersScreen;
window.LaborScreen = LaborScreen;
window.CurrencyScreen = CurrencyScreen;
window.ComplianceAutoNumberScreen = ComplianceAutoNumberScreen;
window.CustomAttributesScreen = CustomAttributesScreen;
window.APIKeysScreen = APIKeysScreen;

// Shared date formatter (date-only) used across the enterprise tables below.
function fmtDateOnly(value) {
  if (!value) return "-";
  try {
    const d = new Date(value);
    return isNaN(d.getTime()) ? "-" : d.toLocaleDateString();
  } catch (_e) {
    return "-";
  }
}

function EnterpriseDashboardsScreen() {
  const TABS_ID = "dashboards-tabs";
  const [tab, setTab] = React.useState("executive");
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    setLoading(true);
    apiRequest("/dashboards/" + tab)
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => {
        console.error("Failed to load dashboard");
        setData(null);
        setLoading(false);
      });
  }, [tab]);
  const tabs = [
    {
      value: "executive",
      label: __t("enterprise.dashboards.tabExecutive") || "Executive",
    },
    {
      value: "engineering",
      label: __t("enterprise.dashboards.tabEngineering") || "Engineering",
    },
    {
      value: "manufacturing",
      label: __t("enterprise.dashboards.tabManufacturing") || "Manufacturing",
    },
    {
      value: "procurement",
      label: __t("enterprise.dashboards.tabProcurement") || "Procurement",
    },
  ];
  return (
    <div className="screen-wrap" data-screen-label="Enterprise Dashboards">
      <ScreenHeader
        title={__t("enterprise.dashboards.title") || "Enterprise Dashboards"}
        description={
          __t("enterprise.dashboards.subtitle") ||
          "Real-time KPIs across your organization"
        }
      />
      <Tabs
        id={TABS_ID}
        items={tabs}
        value={tab}
        onChange={setTab}
        ariaLabel={
          __t("enterprise.dashboards.title") || "Enterprise Dashboards"
        }
      />
      <TabPanel id={TABS_ID} value={tab} active className="mt-16">
        {loading ? (
          <SkeletonCards />
        ) : !data ? (
          <EmptyState
            icon="⚠️"
            title={
              __t("enterprise.dashboards.failedToLoad") ||
              "Failed to load dashboard"
            }
          />
        ) : (
          <>
            {data.kpis && (
              <div
                className="gap-12 mb-16"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                }}
              >
                {Object.entries(data.kpis).map(([k, v]) => (
                  <Card key={k} bodyClassName="text-center">
                    <div className="fs-28 fw-700 fg m-0">
                      {typeof v === "number" ? v.toLocaleString() : v}
                    </div>
                    <div className="fs-11 fg-3 m-0 mt-4 uppercase">
                      {k.replace(/_/g, " ")}
                    </div>
                  </Card>
                ))}
              </div>
            )}
            {data.monthly_spend && data.monthly_spend.length > 0 && (
              <Card
                className="mb-16"
                title={
                  __t("enterprise.dashboards.monthlySpend") ||
                  "Monthly Spend"
                }
              >
                <DataTable
                  dense
                  ariaLabel={
                    __t("enterprise.dashboards.monthlySpend") ||
                    "Monthly Spend"
                  }
                  getRowKey={(_r, i) => i}
                  rows={data.monthly_spend}
                  columns={[
                    {
                      key: "month",
                      header: __t("enterprise.dashboards.month") || "Month",
                    },
                    {
                      key: "spend",
                      header: __t("enterprise.dashboards.spend") || "Spend",
                      align: "num",
                      render: (r) => "$" + (r.spend || 0).toLocaleString(),
                    },
                  ]}
                />
              </Card>
            )}
            {data.top_vendors_by_spend &&
              data.top_vendors_by_spend.length > 0 && (
                <Card
                  className="mb-16"
                  title={
                    __t("enterprise.dashboards.topVendors") ||
                    "Top Vendors by Spend"
                  }
                >
                  <DataTable
                    dense
                    ariaLabel={
                      __t("enterprise.dashboards.topVendors") ||
                      "Top Vendors by Spend"
                    }
                    getRowKey={(_r, i) => i}
                    rows={data.top_vendors_by_spend}
                    columns={[
                      {
                        key: "vendorName",
                        header:
                          __t("enterprise.dashboards.vendor") || "Vendor",
                      },
                      {
                        key: "total_spend",
                        header:
                          __t("enterprise.dashboards.spend") || "Spend",
                        align: "num",
                        render: (v) =>
                          "$" + (v.total_spend || 0).toLocaleString(),
                      },
                      {
                        key: "po_count",
                        header:
                          __t("enterprise.dashboards.poCount") || "POs",
                        align: "num",
                      },
                    ]}
                  />
                </Card>
              )}
            {data.status_summary && data.status_summary.length > 0 && (
              <Card
                title={
                  __t("enterprise.dashboards.statusSummary") ||
                  "Status Summary"
                }
              >
                <DataTable
                  dense
                  ariaLabel={
                    __t("enterprise.dashboards.statusSummary") ||
                    "Status Summary"
                  }
                  getRowKey={(_r, i) => i}
                  rows={data.status_summary}
                  columns={[
                    {
                      key: "status",
                      header:
                        __t("enterprise.dashboards.status") || "Status",
                    },
                    {
                      key: "cnt",
                      header: __t("enterprise.dashboards.count") || "Count",
                      align: "num",
                    },
                  ]}
                />
              </Card>
            )}
          </>
        )}
      </TabPanel>
    </div>
  );
}

function ServiceBOMScreen() {
  const [boms, setBoms] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [_selected, setSelected] = React.useState(null);
  const [showCreate, setShowCreate] = React.useState(false);
  const [form, setForm] = React.useState({
    name: "",
    description: "",
    service_type: "maintenance",
  });
  const load = () => {
    setLoading(true);
    apiRequest("/enterprise/service-bom")
      .then((d) => {
        setBoms(d);
        setLoading(false);
      })
      .catch(() => {
        console.error("Failed to load service BOMs");
        setBoms([]);
        setLoading(false);
      });
  };
  React.useEffect(load, []);
  const create = async () => {
    try {
      await apiRequest("/enterprise/service-bom", {
        method: "POST",
        body: JSON.stringify(form),
      });
      toast(__t("enterprise.serviceBom.created") || "Service BOM created", {
        kind: "success",
      });
      setShowCreate(false);
      setForm({ name: "", description: "", service_type: "maintenance" });
      load();
    } catch (e) {
      toast(e.message, { kind: "error" });
    }
  };
  return (
    <div className="screen-wrap" data-screen-label="Service BOM">
      <ScreenHeader
        title={__t("enterprise.serviceBom.title") || "Service BOM"}
        description={
          __t("enterprise.serviceBom.subtitle") ||
          "Manage service/maintenance BOMs for field operations"
        }
        actions={
          <Button variant="primary" onClick={() => setShowCreate(true)}>
            {__t("enterprise.serviceBom.new") || "+ New Service BOM"}
          </Button>
        }
      />
      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title={
          __t("enterprise.serviceBom.create.title") || "New Service BOM"
        }
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setShowCreate(false)}
            >
              {__t("common.cancel") || "Cancel"}
            </Button>
            <Button variant="primary" onClick={create}>
              {__t("common.create") || "Create"}
            </Button>
          </>
        }
      >
        <Field
          label={
            __t("enterprise.serviceBom.create.namePlaceholder") || "Name"
          }
        >
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>
        <Field
          label={
            __t("enterprise.serviceBom.create.descriptionPlaceholder") ||
            "Description"
          }
        >
          <Input
            value={form.description}
            onChange={(e) =>
              setForm({ ...form, description: e.target.value })
            }
          />
        </Field>
        <Field
          label={__t("enterprise.serviceBom.table.type") || "Type"}
        >
          <Select
            value={form.service_type}
            onChange={(e) =>
              setForm({ ...form, service_type: e.target.value })
            }
          >
            <option value="maintenance">
              {__t("enterprise.serviceBom.type.maintenance") ||
                "Maintenance"}
            </option>
            <option value="repair">
              {__t("enterprise.serviceBom.type.repair") || "Repair"}
            </option>
            <option value="overhaul">
              {__t("enterprise.serviceBom.type.overhaul") || "Overhaul"}
            </option>
            <option value="inspection">
              {__t("enterprise.serviceBom.type.inspection") || "Inspection"}
            </option>
          </Select>
        </Field>
      </Modal>
      {loading ? (
        <SkeletonTable />
      ) : boms.length === 0 ? (
        <EmptyState
          icon="📋"
          title={__t("enterprise.serviceBom.empty.title") || "No Service BOMs"}
          message={
            __t("enterprise.serviceBom.empty.description") ||
            "Get started by creating your first service BOM."
          }
          actions={
            <Button variant="primary" onClick={() => setShowCreate(true)}>
              {__t("enterprise.serviceBom.empty.action") ||
                "Create Service BOM"}
            </Button>
          }
        />
      ) : (
        <DataTable
          dense
          ariaLabel={__t("enterprise.serviceBom.title") || "Service BOM"}
          rows={boms}
          onRowClick={(b) => setSelected(b)}
          columns={[
            {
              key: "name",
              header: __t("enterprise.serviceBom.table.name") || "Name",
            },
            {
              key: "service_type",
              header: __t("enterprise.serviceBom.table.type") || "Type",
              render: (b) => <Badge tone="info">{b.service_type}</Badge>,
            },
            {
              key: "items_count",
              header: __t("enterprise.serviceBom.table.items") || "Items",
              align: "num",
              render: (b) => b.items_count || 0,
            },
            {
              key: "created_at",
              header:
                __t("enterprise.serviceBom.table.created") || "Created",
              render: (b) => fmtDateOnly(b.created_at),
            },
          ]}
        />
      )}
    </div>
  );
}

function RoutingScreen() {
  const TABS_ID = "routing-tabs";
  const [tab, setTab] = React.useState("routings");
  const [routings, setRoutings] = React.useState([]);
  const [plans, setPlans] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    setLoading(true);
    Promise.all([
      apiRequest("/manufacturing/routings").catch(() => []),
      apiRequest("/manufacturing/process-plans").catch(() => []),
    ])
      .then(([r, p]) => {
        setRoutings(r || []);
        setPlans(p || []);
        setLoading(false);
      })
      .catch(() => {
        console.error("Failed to load routing data");
        setLoading(false);
      });
  }, []);
  const tabs = [
    {
      value: "routings",
      label: __t("enterprise.routing.tabRoutings") || "Routings",
    },
    {
      value: "plans",
      label: __t("enterprise.routing.tabPlans") || "Process Plans",
    },
  ];
  return (
    <div className="screen-wrap" data-screen-label="Routing">
      <ScreenHeader
        title={__t("enterprise.routing.title") || "Routing & Process Plans"}
        description={
          __t("enterprise.routing.subtitle") ||
          "Define manufacturing routings and process plans"
        }
      />
      <Tabs
        id={TABS_ID}
        items={tabs}
        value={tab}
        onChange={setTab}
        ariaLabel={
          __t("enterprise.routing.title") || "Routing & Process Plans"
        }
      />
      <TabPanel id={TABS_ID} value={tab} active className="mt-16">
        {loading ? (
          <SkeletonTable />
        ) : tab === "routings" ? (
          routings.length === 0 ? (
            <EmptyState
              icon="📋"
              title={
                __t("enterprise.routing.emptyRoutings.title") ||
                "No Routings"
              }
              message={
                __t("enterprise.routing.emptyRoutings.description") ||
                "No manufacturing routings have been defined yet."
              }
            />
          ) : (
            <DataTable
              dense
              ariaLabel={
                __t("enterprise.routing.tabRoutings") || "Routings"
              }
              rows={routings}
              columns={[
                {
                  key: "code",
                  header: __t("enterprise.routing.table.code") || "Code",
                  render: (r) => <span className="font-mono">{r.code}</span>,
                },
                {
                  key: "name",
                  header: __t("enterprise.routing.table.name") || "Name",
                },
                {
                  key: "part_id",
                  header:
                    __t("enterprise.routing.table.partId") || "Part ID",
                },
                {
                  key: "operations_count",
                  header:
                    __t("enterprise.routing.table.operations") ||
                    "Operations",
                  align: "num",
                  render: (r) => r.operations_count || 0,
                },
                {
                  key: "status",
                  header:
                    __t("enterprise.routing.table.status") || "Status",
                  render: (r) => (
                    <StatusPill
                      status={r.is_active !== false ? "active" : "inactive"}
                      label={
                        r.is_active !== false
                          ? __t("enterprise.routing.active") || "Active"
                          : __t("enterprise.routing.inactive") || "Inactive"
                      }
                    />
                  ),
                },
              ]}
            />
          )
        ) : plans.length === 0 ? (
          <EmptyState
            icon="📝"
            title={
              __t("enterprise.routing.emptyPlans.title") || "No Process Plans"
            }
            message={
              __t("enterprise.routing.emptyPlans.description") ||
              "No process plans have been defined yet."
            }
          />
        ) : (
          <DataTable
            dense
            ariaLabel={__t("enterprise.routing.tabPlans") || "Process Plans"}
            rows={plans}
            columns={[
              {
                key: "code",
                header: __t("enterprise.routing.table.code") || "Code",
                render: (p) => <span className="font-mono">{p.code}</span>,
              },
              {
                key: "name",
                header: __t("enterprise.routing.table.name") || "Name",
              },
              {
                key: "steps_count",
                header: __t("enterprise.routing.table.steps") || "Steps",
                align: "num",
                render: (p) => p.steps_count || 0,
              },
              {
                key: "estimated_hours",
                header:
                  __t("enterprise.routing.table.estHours") || "Est. Hours",
                align: "num",
                render: (p) => p.estimated_hours || "-",
              },
            ]}
          />
        )}
      </TabPanel>
    </div>
  );
}

function WorkCentersScreen() {
  const [centers, setCenters] = React.useState([]);
  const [capacity, setCapacity] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    setLoading(true);
    Promise.all([
      apiRequest("/manufacturing/work-centers").catch(() => []),
      apiRequest("/manufacturing/work-centers/capacity").catch(() => null),
    ])
      .then(([c, cap]) => {
        setCenters(c || []);
        setCapacity(cap);
        setLoading(false);
      })
      .catch(() => {
        console.error("Failed to load work centers");
        setLoading(false);
      });
  }, []);
  return (
    <div className="screen-wrap" data-screen-label="Work Centers">
      <ScreenHeader
        title={
          __t("enterprise.workCenters.title") || "Work Centers & Capacity"
        }
        description={
          __t("enterprise.workCenters.subtitle") ||
          "Manage work centers and monitor capacity utilization"
        }
      />
      {loading ? (
        <SkeletonTable />
      ) : (
        <>
          {capacity &&
            capacity.work_centers &&
            capacity.work_centers.length > 0 && (
              <div
                className="gap-12 mb-16"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                }}
              >
                {capacity.work_centers.map((wc) => (
                  <Card
                    key={wc.id}
                    title={wc.name || wc.code}
                    subtitle={
                      wc.description ||
                      __t("enterprise.workCenters.noDescription") ||
                      "No description"
                    }
                  >
                    <div className="flex justify-between items-center fs-11">
                      <span>
                        {__t("enterprise.workCenters.capacity") ||
                          "Capacity"}
                        :{" "}
                        <strong>
                          {wc.capacity_per_hour || "-"}{" "}
                          {__t("enterprise.workCenters.perHr") || "/hr"}
                        </strong>
                      </span>
                      <StatusPill
                        status={
                          wc.is_active !== false ? "active" : "inactive"
                        }
                        label={
                          wc.is_active !== false
                            ? __t("enterprise.workCenters.active") ||
                              "Active"
                            : __t("enterprise.workCenters.inactive") ||
                              "Inactive"
                        }
                      />
                    </div>
                  </Card>
                ))}
              </div>
            )}
          {centers.length === 0 ? (
            <EmptyState
              icon="⚙️"
              title={
                __t("enterprise.workCenters.empty.title") ||
                "No Work Centers"
              }
              message={
                __t("enterprise.workCenters.empty.description") ||
                "No work centers have been configured yet."
              }
            />
          ) : (
            <Card
              title={
                __t("enterprise.workCenters.allWorkCenters") ||
                "All Work Centers"
              }
            >
              <DataTable
                dense
                ariaLabel={
                  __t("enterprise.workCenters.allWorkCenters") ||
                  "All Work Centers"
                }
                rows={centers}
                columns={[
                  {
                    key: "code",
                    header:
                      __t("enterprise.workCenters.table.code") || "Code",
                    render: (wc) => (
                      <span className="font-mono">{wc.code}</span>
                    ),
                  },
                  {
                    key: "name",
                    header:
                      __t("enterprise.workCenters.table.name") || "Name",
                  },
                  {
                    key: "capacity_per_hour",
                    header:
                      __t("enterprise.workCenters.table.capacityHr") ||
                      "Capacity/Hr",
                    align: "num",
                  },
                  {
                    key: "available_hours_per_day",
                    header:
                      __t(
                        "enterprise.workCenters.table.availableHrsDay",
                      ) || "Available Hrs/Day",
                    align: "num",
                  },
                  {
                    key: "status",
                    header:
                      __t("enterprise.workCenters.table.status") ||
                      "Status",
                    render: (wc) => (
                      <StatusPill
                        status={
                          wc.is_active !== false ? "active" : "inactive"
                        }
                        label={
                          wc.is_active !== false
                            ? __t("enterprise.workCenters.active") ||
                              "Active"
                            : __t("enterprise.workCenters.inactive") ||
                              "Inactive"
                        }
                      />
                    ),
                  },
                ]}
              />
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function LaborScreen() {
  const TABS_ID = "labor-tabs";
  const [tab, setTab] = React.useState("rates");
  const [rates, setRates] = React.useState([]);
  const [timesheets, setTimesheets] = React.useState([]);
  const [laborCost, setLaborCost] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    setLoading(true);
    Promise.all([
      apiRequest("/manufacturing/labor-rates").catch(() => []),
      apiRequest("/manufacturing/timesheets").catch(() => []),
      apiRequest("/manufacturing/timesheets/labor-cost").catch(() => []),
    ])
      .then(([r, t, c]) => {
        setRates(r || []);
        setTimesheets(t || []);
        setLaborCost(c || []);
        setLoading(false);
      })
      .catch(() => {
        console.error("Failed to load labor data");
        setLoading(false);
      });
  }, []);
  const tabs = [
    { value: "rates", label: __t("enterprise.labor.tabRates") || "Labor Rates" },
    {
      value: "timesheets",
      label: __t("enterprise.labor.tabTimesheets") || "Timesheets",
    },
    { value: "cost", label: __t("enterprise.labor.tabCost") || "Cost Summary" },
  ];
  return (
    <div className="screen-wrap" data-screen-label="Labor">
      <ScreenHeader
        title={__t("enterprise.labor.title") || "Labor & Timesheets"}
        description={
          __t("enterprise.labor.subtitle") ||
          "Track labor rates, timesheets, and cost summaries"
        }
      />
      <Tabs
        id={TABS_ID}
        items={tabs}
        value={tab}
        onChange={setTab}
        ariaLabel={__t("enterprise.labor.title") || "Labor & Timesheets"}
      />
      <TabPanel id={TABS_ID} value={tab} active className="mt-16">
        {loading ? (
          <SkeletonTable />
        ) : tab === "rates" ? (
          rates.length === 0 ? (
            <EmptyState
              icon="💰"
              title={
                __t("enterprise.labor.emptyRates.title") || "No Labor Rates"
              }
              message={
                __t("enterprise.labor.emptyRates.description") ||
                "No labor rates have been defined yet."
              }
            />
          ) : (
            <DataTable
              dense
              ariaLabel={__t("enterprise.labor.tabRates") || "Labor Rates"}
              rows={rates}
              columns={[
                {
                  key: "employee_name",
                  header:
                    __t("enterprise.labor.table.employee") || "Employee",
                },
                {
                  key: "skill_level",
                  header:
                    __t("enterprise.labor.table.skillLevel") ||
                    "Skill Level",
                  render: (r) => r.skill_level || "-",
                },
                {
                  key: "regular_rate",
                  header:
                    __t("enterprise.labor.table.regularRate") ||
                    "Regular Rate",
                  align: "num",
                  render: (r) => "$" + (r.regular_rate || 0),
                },
                {
                  key: "overtime_rate",
                  header:
                    __t("enterprise.labor.table.otRate") || "OT Rate",
                  align: "num",
                  render: (r) => "$" + (r.overtime_rate || 0),
                },
                {
                  key: "status",
                  header:
                    __t("enterprise.labor.table.status") || "Status",
                  render: (r) => (
                    <StatusPill
                      status={r.is_active !== false ? "active" : "inactive"}
                      label={
                        r.is_active !== false
                          ? __t("enterprise.labor.active") || "Active"
                          : __t("enterprise.labor.inactive") || "Inactive"
                      }
                    />
                  ),
                },
              ]}
            />
          )
        ) : tab === "timesheets" ? (
          timesheets.length === 0 ? (
            <EmptyState
              icon="📅"
              title={
                __t("enterprise.labor.emptyTimesheets.title") ||
                "No Timesheets"
              }
              message={
                __t("enterprise.labor.emptyTimesheets.description") ||
                "No timesheet entries found."
              }
            />
          ) : (
            <DataTable
              dense
              ariaLabel={
                __t("enterprise.labor.tabTimesheets") || "Timesheets"
              }
              rows={timesheets}
              columns={[
                {
                  key: "employee_id",
                  header:
                    __t("enterprise.labor.table.employee") || "Employee",
                },
                {
                  key: "date",
                  header: __t("enterprise.labor.table.date") || "Date",
                  render: (t) => fmtDateOnly(t.date),
                },
                {
                  key: "hours_worked",
                  header: __t("enterprise.labor.table.hours") || "Hours",
                  align: "num",
                },
                {
                  key: "is_overtime",
                  header: __t("enterprise.labor.table.ot") || "OT",
                  render: (t) =>
                    t.is_overtime ? (
                      <Badge tone="accent">
                        {__t("enterprise.labor.otBadge") || "OT"}
                      </Badge>
                    ) : (
                      "-"
                    ),
                },
                {
                  key: "activity_type",
                  header:
                    __t("enterprise.labor.table.activity") || "Activity",
                  render: (t) => t.activity_type || "-",
                },
              ]}
            />
          )
        ) : laborCost.length === 0 ? (
          <EmptyState
            icon="📊"
            title={
              __t("enterprise.labor.emptyCost.title") || "No Labor Cost Data"
            }
            message={
              __t("enterprise.labor.emptyCost.description") ||
              "No labor cost data is available."
            }
          />
        ) : (
          <DataTable
            dense
            ariaLabel={__t("enterprise.labor.tabCost") || "Cost Summary"}
            getRowKey={(c) => c.employee_id}
            rows={laborCost}
            columns={[
              {
                key: "employee_name",
                header: __t("enterprise.labor.table.employee") || "Employee",
                render: (c) => c.employee_name || c.employee_id,
              },
              {
                key: "regular_hours",
                header:
                  __t("enterprise.labor.table.regHours") || "Reg Hours",
                align: "num",
                render: (c) => c.regular_hours || 0,
              },
              {
                key: "overtime_hours",
                header: __t("enterprise.labor.table.otHours") || "OT Hours",
                align: "num",
                render: (c) => c.overtime_hours || 0,
              },
              {
                key: "regular_cost",
                header: __t("enterprise.labor.table.regCost") || "Reg Cost",
                align: "num",
                render: (c) => "$" + (c.regular_cost || 0).toFixed(2),
              },
              {
                key: "overtime_cost",
                header: __t("enterprise.labor.table.otCost") || "OT Cost",
                align: "num",
                render: (c) => "$" + (c.overtime_cost || 0).toFixed(2),
              },
              {
                key: "total",
                header: __t("enterprise.labor.table.total") || "Total",
                align: "num",
                render: (c) => (
                  <strong>
                    $
                    {(
                      (Number(c.regular_cost) || 0) +
                      (Number(c.overtime_cost) || 0)
                    ).toFixed(2)}
                  </strong>
                ),
              },
            ]}
          />
        )}
      </TabPanel>
    </div>
  );
}

function CurrencyScreen() {
  const [rates, setRates] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [lastUpdated, setLastUpdated] = React.useState(null);
  const [convertFrom, setConvertFrom] = React.useState("INR");
  const [convertTo, setConvertTo] = React.useState("USD");
  const [convertAmt, setConvertAmt] = React.useState("1000");
  const [convertResult, setConvertResult] = React.useState(null);
  const fetchLiveRates = async () => {
    setLoading(true);
    try {
      const resp = await fetch(
        "https://v6.exchangerate-api.com/v6/69e3376010b559f3ff846fdb/latest/INR",
      );
      if (!resp.ok) throw new Error("API error");
      const data = await resp.json();
      if (data.result === "success" && data.conversion_rates) {
        const mapped = Object.entries(data.conversion_rates).map(
          ([to, rate], i) => ({
            id: i + 1,
            from_currency: "INR",
            to_currency: to,
            rate: rate,
            source: "exchangerate-api.com",
            effective_date: data.time_last_update_utc
              ? data.time_last_update_utc.slice(0, 10)
              : new Date().toISOString().slice(0, 10),
          }),
        );
        setRates(mapped);
        setLastUpdated(new Date().toISOString());
        toast(
          __t("enterprise.currency.ratesUpdated") || "Exchange rates updated",
          { kind: "success" },
        );
      } else {
        throw new Error("Invalid response");
      }
    } catch (e) {
      console.error("Live rates failed:", e);
      toast(
        __t("enterprise.currency.fetchFailed") ||
          "Failed to fetch exchange rates",
        { kind: "error" },
      );
    } finally {
      setLoading(false);
    }
  };
  const doConvert = () => {
    const fromRate = rates.find(
      (r) => r.from_currency === "INR" && r.to_currency === convertFrom,
    );
    const toRate = rates.find(
      (r) => r.from_currency === "INR" && r.to_currency === convertTo,
    );
    if (!fromRate || !toRate) {
      toast(
        __t("enterprise.currency.ratesNotAvailable") ||
          "Rates not available for selected currencies",
        { kind: "error" },
      );
      return;
    }
    const amount = parseFloat(convertAmt) || 0;
    const fromVal = convertFrom === "INR" ? 1 : fromRate.rate;
    const toVal = convertTo === "INR" ? 1 : toRate.rate;
    const result = (amount / fromVal) * toVal;
    const effectiveRate = toVal / fromVal;
    setConvertResult({
      converted_amount: result.toFixed(4),
      rate: effectiveRate.toFixed(6),
    });
  };
  React.useEffect(() => {
    fetchLiveRates();
  }, []);
  const fmtDate = function (d) {
    try {
      if (!d) return "-";
      const dt = new Date(d);
      return isNaN(dt.getTime()) ? "-" : dt.toLocaleString();
    } catch (_e) {
      return d || "-";
    }
  };
  const CURRENCIES = [
    "USD",
    "INR",
    "EUR",
    "GBP",
    "JPY",
    "CAD",
    "AUD",
    "CHF",
    "CNY",
    "BRL",
    "KRW",
  ];
  return (
    <div className="screen-wrap" data-screen-label="Currency">
      <ScreenHeader
        title={
          __t("enterprise.currency.title") || "Currency & Exchange Rates"
        }
        description={
          __t("enterprise.currency.subtitle") ||
          "Multi-currency support with live INR exchange rates"
        }
        actions={
          <Button
            variant="secondary"
            onClick={fetchLiveRates}
            loading={loading}
          >
            {loading
              ? __t("enterprise.currency.fetching") || "Fetching..."
              : __t("enterprise.currency.refresh") || "Refresh rates"}
          </Button>
        }
      />
      {lastUpdated && (
        <div className="mb-12 fs-11 fg-3">
          {__t("enterprise.currency.lastUpdated") || "Last updated:"}{" "}
          {fmtDate(lastUpdated)}
        </div>
      )}
      <Card
        className="mb-16"
        title={__t("enterprise.currency.quickConvert") || "Quick Convert"}
      >
        <div className="flex gap-12 items-end flex-wrap">
          <Field
            label={__t("enterprise.currency.amount") || "Amount"}
            className="flex-0"
          >
            <Input
              type="number"
              style={{ width: 140 }}
              value={convertAmt}
              onChange={(e) => setConvertAmt(e.target.value)}
            />
          </Field>
          <Field label={__t("enterprise.currency.fromLabel") || "From"}>
            <Select
              value={convertFrom}
              onChange={(e) => setConvertFrom(e.target.value)}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={__t("enterprise.currency.toLabel") || "To"}>
            <Select
              value={convertTo}
              onChange={(e) => setConvertTo(e.target.value)}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <Button variant="primary" onClick={doConvert}>
            {__t("enterprise.currency.convert") || "Convert"}
          </Button>
        </div>
        {convertResult && (
          <div className="mt-10 fs-14 fw-600">
            {convertAmt} {convertFrom} = {convertResult.converted_amount}{" "}
            {convertTo}
            {convertResult.rate && (
              <span className="fw-400 ml-8 fs-12 fg-3">
                ({__t("enterprise.currency.rate") || "rate"}:{" "}
                {convertResult.rate})
              </span>
            )}
          </div>
        )}
      </Card>
      {loading ? (
        <SkeletonTable />
      ) : rates.length === 0 ? (
        <EmptyState
          icon="💱"
          title={
            __t("enterprise.currency.empty.title") || "No Exchange Rates"
          }
          message={
            __t("enterprise.currency.empty.description") ||
            "No exchange rates are available. Try refreshing."
          }
        />
      ) : (
        <Card
          title={
            __t("enterprise.currency.exchangeRatesBase") ||
            "Exchange Rates (Base: INR)"
          }
        >
          <DataTable
            dense
            ariaLabel={
              __t("enterprise.currency.exchangeRatesBase") ||
              "Exchange Rates (Base: INR)"
            }
            rows={rates}
            columns={[
              {
                key: "from_currency",
                header: __t("enterprise.currency.table.from") || "From",
              },
              {
                key: "to_currency",
                header: __t("enterprise.currency.table.to") || "To",
              },
              {
                key: "rate",
                header: __t("enterprise.currency.table.rate") || "Rate",
                align: "num",
              },
              {
                key: "source",
                header: __t("enterprise.currency.table.source") || "Source",
                render: (r) =>
                  r.source || __t("enterprise.currency.manual") || "manual",
              },
              {
                key: "effective_date",
                header: __t("enterprise.currency.table.date") || "Date",
                render: (r) =>
                  r.effective_date ? fmtDate(r.effective_date) : "-",
              },
            ]}
          />
        </Card>
      )}
    </div>
  );
}

function ComplianceAutoNumberScreen() {
  const TABS_ID = "compliance-tabs";
  const [tab, setTab] = React.useState("compliance");
  const [certs, setCerts] = React.useState([]);
  const [schemes, setSchemes] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    setLoading(true);
    Promise.all([
      apiRequest("/enterprise/compliance-certificates").catch(() => []),
      apiRequest("/enterprise/auto-number-schemes").catch(() => []),
    ])
      .then(([c, s]) => {
        setCerts(c || []);
        setSchemes(s || []);
        setLoading(false);
      })
      .catch(() => {
        console.error("Failed to load compliance data");
        setLoading(false);
      });
  }, []);
  const tabs = [
    {
      value: "compliance",
      label:
        __t("enterprise.compliance.tabCertificates") ||
        "Compliance Certificates",
    },
    {
      value: "numbering",
      label: __t("enterprise.compliance.tabNumbering") || "Auto-Numbering",
    },
  ];
  return (
    <div className="screen-wrap" data-screen-label="Compliance">
      <ScreenHeader
        title={
          __t("enterprise.compliance.title") ||
          "Compliance & Auto-Numbering"
        }
        description={
          __t("enterprise.compliance.subtitle") ||
          "Track compliance certificates and manage auto-numbering schemes"
        }
      />
      <Tabs
        id={TABS_ID}
        items={tabs}
        value={tab}
        onChange={setTab}
        ariaLabel={
          __t("enterprise.compliance.title") || "Compliance & Auto-Numbering"
        }
      />
      <TabPanel id={TABS_ID} value={tab} active className="mt-16">
        {loading ? (
          <SkeletonTable />
        ) : tab === "compliance" ? (
          certs.length === 0 ? (
            <EmptyState
              icon="📜"
              title={
                __t("enterprise.compliance.emptyCerts.title") ||
                "No Compliance Certificates"
              }
              message={
                __t("enterprise.compliance.emptyCerts.description") ||
                "No compliance certificates are being tracked."
              }
            />
          ) : (
            <DataTable
              dense
              ariaLabel={
                __t("enterprise.compliance.tabCertificates") ||
                "Compliance Certificates"
              }
              rows={certs}
              columns={[
                {
                  key: "part_id",
                  header:
                    __t("enterprise.compliance.table.partId") || "Part ID",
                },
                {
                  key: "certificate_type",
                  header:
                    __t("enterprise.compliance.table.type") || "Type",
                  render: (c) => c.certificate_type || "-",
                },
                {
                  key: "status",
                  header:
                    __t("enterprise.compliance.table.status") || "Status",
                  render: (c) => (
                    <StatusPill
                      status={c.status}
                      tone={
                        c.status === "valid"
                          ? "success"
                          : c.status === "expired"
                            ? "danger"
                            : "warning"
                      }
                      label={c.status || "-"}
                    />
                  ),
                },
                {
                  key: "expiry_date",
                  header:
                    __t("enterprise.compliance.table.expiry") || "Expiry",
                  render: (c) => fmtDateOnly(c.expiry_date),
                },
              ]}
            />
          )
        ) : schemes.length === 0 ? (
          <EmptyState
            icon="🔢"
            title={
              __t("enterprise.compliance.emptySchemes.title") ||
              "No Numbering Schemes"
            }
            message={
              __t("enterprise.compliance.emptySchemes.description") ||
              "No auto-numbering schemes have been configured."
            }
          />
        ) : (
          <DataTable
            dense
            ariaLabel={
              __t("enterprise.compliance.tabNumbering") || "Auto-Numbering"
            }
            rows={schemes}
            columns={[
              {
                key: "entity_type",
                header:
                  __t("enterprise.compliance.table.entityType") ||
                  "Entity Type",
              },
              {
                key: "prefix",
                header:
                  __t("enterprise.compliance.table.prefix") || "Prefix",
                render: (s) => (
                  <span className="font-mono">{s.prefix || "-"}</span>
                ),
              },
              {
                key: "next_number",
                header:
                  __t("enterprise.compliance.table.nextNumber") ||
                  "Next Number",
                align: "num",
              },
              {
                key: "padding",
                header:
                  __t("enterprise.compliance.table.padding") || "Padding",
                align: "num",
                render: (s) => s.padding || 5,
              },
            ]}
          />
        )}
      </TabPanel>
    </div>
  );
}

function CustomAttributesScreen() {
  const [attrs, setAttrs] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [showCreate, setShowCreate] = React.useState(false);
  const [form, setForm] = React.useState({
    name: "",
    entity_type: "part",
    data_type: "string",
    description: "",
  });
  const load = () => {
    setLoading(true);
    apiRequest("/enterprise/custom-attributes")
      .then((d) => {
        setAttrs(d);
        setLoading(false);
      })
      .catch(() => {
        console.error("Failed to load custom attributes");
        setAttrs([]);
        setLoading(false);
      });
  };
  React.useEffect(load, []);
  const create = async () => {
    try {
      await apiRequest("/enterprise/custom-attributes", {
        method: "POST",
        body: JSON.stringify(form),
      });
      toast(
        __t("enterprise.customAttributes.created") ||
          "Custom attribute created",
        { kind: "success" },
      );
      setShowCreate(false);
      setForm({
        name: "",
        entity_type: "part",
        data_type: "string",
        description: "",
      });
      load();
    } catch (e) {
      toast(e.message, { kind: "error" });
    }
  };
  return (
    <div className="screen-wrap" data-screen-label="Custom Attributes">
      <ScreenHeader
        title={
          __t("enterprise.customAttributes.title") || "Custom Attributes"
        }
        description={
          __t("enterprise.customAttributes.subtitle") ||
          "Define custom fields for parts, vendors, and other entities"
        }
        actions={
          <Button variant="primary" onClick={() => setShowCreate(true)}>
            {__t("enterprise.customAttributes.new") || "+ New Attribute"}
          </Button>
        }
      />
      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title={
          __t("enterprise.customAttributes.create.title") ||
          "New Custom Attribute"
        }
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setShowCreate(false)}
            >
              {__t("common.cancel") || "Cancel"}
            </Button>
            <Button variant="primary" onClick={create}>
              {__t("common.create") || "Create"}
            </Button>
          </>
        }
      >
        <Field
          label={
            __t("enterprise.customAttributes.create.namePlaceholder") ||
            "Name"
          }
        >
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>
        <Field
          label={
            __t("enterprise.customAttributes.table.entity") || "Entity"
          }
        >
          <Select
            value={form.entity_type}
            onChange={(e) =>
              setForm({ ...form, entity_type: e.target.value })
            }
          >
            <option value="part">
              {__t("enterprise.customAttributes.create.entityPart") ||
                "Part"}
            </option>
            <option value="vendor">
              {__t("enterprise.customAttributes.create.entityVendor") ||
                "Vendor"}
            </option>
            <option value="bom">
              {__t("enterprise.customAttributes.create.entityBom") || "BOM"}
            </option>
            <option value="project">
              {__t("enterprise.customAttributes.create.entityProject") ||
                "Project"}
            </option>
          </Select>
        </Field>
        <Field
          label={__t("enterprise.customAttributes.table.type") || "Type"}
        >
          <Select
            value={form.data_type}
            onChange={(e) => setForm({ ...form, data_type: e.target.value })}
          >
            <option value="string">
              {__t("enterprise.customAttributes.create.typeString") ||
                "String"}
            </option>
            <option value="number">
              {__t("enterprise.customAttributes.create.typeNumber") ||
                "Number"}
            </option>
            <option value="boolean">
              {__t("enterprise.customAttributes.create.typeBoolean") ||
                "Boolean"}
            </option>
            <option value="date">
              {__t("enterprise.customAttributes.create.typeDate") || "Date"}
            </option>
            <option value="json">
              {__t("enterprise.customAttributes.create.typeJson") || "JSON"}
            </option>
          </Select>
        </Field>
        <Field
          label={
            __t("enterprise.customAttributes.table.description") ||
            "Description"
          }
        >
          <Input
            placeholder={
              __t(
                "enterprise.customAttributes.create.descriptionPlaceholder",
              ) || "Description (optional)"
            }
            value={form.description}
            onChange={(e) =>
              setForm({ ...form, description: e.target.value })
            }
          />
        </Field>
      </Modal>
      {loading ? (
        <SkeletonTable />
      ) : attrs.length === 0 ? (
        <EmptyState
          icon="🏷️"
          title={
            __t("enterprise.customAttributes.empty.title") ||
            "No Custom Attributes"
          }
          message={
            __t("enterprise.customAttributes.empty.description") ||
            "Create custom attributes to extend your data model."
          }
          actions={
            <Button variant="primary" onClick={() => setShowCreate(true)}>
              {__t("enterprise.customAttributes.empty.action") ||
                "Create Attribute"}
            </Button>
          }
        />
      ) : (
        <DataTable
          dense
          ariaLabel={
            __t("enterprise.customAttributes.title") || "Custom Attributes"
          }
          rows={attrs}
          columns={[
            {
              key: "name",
              header: __t("enterprise.customAttributes.table.name") || "Name",
            },
            {
              key: "entity_type",
              header:
                __t("enterprise.customAttributes.table.entity") || "Entity",
              render: (a) => <Badge tone="info">{a.entity_type}</Badge>,
            },
            {
              key: "data_type",
              header:
                __t("enterprise.customAttributes.table.type") || "Type",
            },
            {
              key: "description",
              header:
                __t("enterprise.customAttributes.table.description") ||
                "Description",
              render: (a) => a.description || "-",
            },
          ]}
        />
      )}
    </div>
  );
}

function APIKeysScreen() {
  const [keys, setKeys] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [showCreate, setShowCreate] = React.useState(false);
  const [form, setForm] = React.useState({
    name: "",
    description: "",
    expires_in_days: 90,
  });
  const [confirmRevokeId, setConfirmRevokeId] = React.useState(null);
  const STORAGE_KEY = "enterprise_api_keys";
  const loadSavedKeys = () => {
    try {
      const saved = storage.get(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch (_e) {
      return [];
    }
  };
  const saveKeys = (keysToSave) => {
    try {
      storage.set(STORAGE_KEY, JSON.stringify(keysToSave));
    } catch (_e) {
      /* ignore */
    }
  };
  const load = () => {
    setLoading(true);
    apiRequest("/api-keys/")
      .then((d) => {
        const saved = loadSavedKeys();
        const merged = [
          ...(Array.isArray(d) ? d : []),
          ...saved.filter((s) => !d.some((k) => k.id === s.id)),
        ];
        setKeys(merged);
        setLoading(false);
      })
      .catch(() => {
        const saved = loadSavedKeys();
        setKeys(saved);
        setLoading(false);
      });
  };
  React.useEffect(load, []);
  const create = async () => {
    try {
      const r = await apiRequest("/api-keys/", {
        method: "POST",
        body: JSON.stringify(form),
      });
      toast(__t("enterprise.apiKeys.created") || "API key created", {
        kind: "success",
      });
      setShowCreate(false);
      setForm({ name: "", description: "", expires_in_days: 90 });
      load();
      // Real keys must only ever come from the backend response.
      if (r && r.key) {
        toast("API Key: " + r.key, { kind: "info" });
      }
    } catch (_e) {
      // Do NOT fabricate or store a fake key on failure — surface the error only.
      toast(
        __t("enterprise.apiKeys.createFailed") ||
          "Could not create API key — please retry",
        { kind: "error" },
      );
    }
  };
  const revoke = (id) => {
    setConfirmRevokeId(id);
  };
  const executeRevoke = async () => {
    const id = confirmRevokeId;
    setConfirmRevokeId(null);
    try {
      await apiRequest("/api-keys/" + id, { method: "DELETE" });
      toast(__t("enterprise.apiKeys.revoked") || "API key revoked", {
        kind: "success",
      });
      load();
    } catch (_e) {
      const saved = loadSavedKeys();
      const updated = saved.filter((k) => k.id !== id);
      saveKeys(updated);
      toast(
        __t("enterprise.apiKeys.revokedLocal") ||
          "API key revoked (local only)",
        { kind: "success" },
      );
      load();
    }
  };
  return (
    <div className="screen-wrap" data-screen-label="API Keys">
      <ScreenHeader
        title={__t("enterprise.apiKeys.title") || "API Keys"}
        description={
          __t("enterprise.apiKeys.subtitle") ||
          "Manage API keys for programmatic access"
        }
        actions={
          <Button variant="primary" onClick={() => setShowCreate(true)}>
            {__t("enterprise.apiKeys.generateKey") || "+ Generate Key"}
          </Button>
        }
      />
      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title={__t("enterprise.apiKeys.generate.title") || "Generate API Key"}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setShowCreate(false)}
            >
              {__t("common.cancel") || "Cancel"}
            </Button>
            <Button variant="primary" onClick={create}>
              {__t("enterprise.apiKeys.generate") || "Generate"}
            </Button>
          </>
        }
      >
        <Field
          label={
            __t("enterprise.apiKeys.create.namePlaceholder") ||
            "Name (e.g., CI Pipeline)"
          }
        >
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>
        <Field
          label={
            __t("enterprise.apiKeys.create.descriptionPlaceholder") ||
            "Description (optional)"
          }
        >
          <Input
            value={form.description}
            onChange={(e) =>
              setForm({ ...form, description: e.target.value })
            }
          />
        </Field>
        <Field
          label={
            __t("enterprise.apiKeys.create.expiresPlaceholder") ||
            "Expires in days"
          }
        >
          <Input
            type="number"
            value={form.expires_in_days}
            onChange={(e) =>
              setForm({
                ...form,
                expires_in_days: parseInt(e.target.value) || 90,
              })
            }
          />
        </Field>
      </Modal>
      {loading ? (
        <SkeletonTable />
      ) : keys.length === 0 ? (
        <EmptyState
          icon="🔑"
          title={__t("enterprise.apiKeys.empty.title") || "No API Keys"}
          message={
            __t("enterprise.apiKeys.empty.description") ||
            "Generate an API key to start integrating with the platform."
          }
          actions={
            <Button variant="primary" onClick={() => setShowCreate(true)}>
              {__t("enterprise.apiKeys.empty.action") || "Generate Key"}
            </Button>
          }
        />
      ) : (
        <DataTable
          dense
          ariaLabel={__t("enterprise.apiKeys.title") || "API Keys"}
          rows={keys}
          columns={[
            {
              key: "name",
              header: __t("enterprise.apiKeys.table.name") || "Name",
            },
            {
              key: "key_prefix",
              header:
                __t("enterprise.apiKeys.table.keyPrefix") || "Key Prefix",
              render: (k) => (
                <span className="font-mono">{k.key_prefix}...</span>
              ),
            },
            {
              key: "description",
              header:
                __t("enterprise.apiKeys.table.description") ||
                "Description",
              render: (k) => k.description || "-",
            },
            {
              key: "created_at",
              header: __t("enterprise.apiKeys.table.created") || "Created",
              render: (k) => fmtDateOnly(k.created_at),
            },
            {
              key: "actions",
              header: __t("enterprise.apiKeys.table.actions") || "Actions",
              render: (k) => (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => revoke(k.id)}
                >
                  {__t("enterprise.apiKeys.revoke") || "Revoke"}
                </Button>
              ),
            },
          ]}
        />
      )}
      <Modal
        open={confirmRevokeId !== null}
        onClose={() => setConfirmRevokeId(null)}
        title={__t("enterprise.apiKeys.confirmRevoke") || "Revoke API key?"}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setConfirmRevokeId(null)}
            >
              {__t("common.cancel") || "Cancel"}
            </Button>
            <Button variant="danger" onClick={executeRevoke}>
              {__t("enterprise.apiKeys.revoke") || "Revoke"}
            </Button>
          </>
        }
      >
        <p className="fs-13 fg-2" style={{ lineHeight: 1.5, margin: 0 }}>
          {__t("enterprise.apiKeys.confirmRevokeBody") ||
            "Are you sure you want to revoke this API key? This cannot be undone."}
        </p>
      </Modal>
    </div>
  );
}

export {
  EnterpriseDashboardsScreen,
  ServiceBOMScreen,
  RoutingScreen,
  WorkCentersScreen,
  LaborScreen,
  CurrencyScreen,
  ComplianceAutoNumberScreen,
  CustomAttributesScreen,
  APIKeysScreen,
};
window.EnterpriseDashboardsScreen = EnterpriseDashboardsScreen;
window.ServiceBOMScreen = ServiceBOMScreen;
window.RoutingScreen = RoutingScreen;
window.WorkCentersScreen = WorkCentersScreen;
window.LaborScreen = LaborScreen;
window.CurrencyScreen = CurrencyScreen;
window.ComplianceAutoNumberScreen = ComplianceAutoNumberScreen;
window.CustomAttributesScreen = CustomAttributesScreen;
window.APIKeysScreen = APIKeysScreen;
