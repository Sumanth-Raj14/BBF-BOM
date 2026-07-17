import React from "react";
import { AppContext } from "../context/AppCtx.jsx";

import { __t } from "../i18n";
export const GROUPS = [
  {
    label: __t("navGroup.core"),
    items: [
      { id: "dashboard", label: "Dashboard", icon: <Icon.Chart size={18} /> },
      { id: "bom", label: "BOM Editor", icon: <Icon.Bom size={18} /> },
      { id: "parts", label: "Components", icon: <Icon.Parts size={18} /> },
    ],
  },
  {
    label: __t("navGroup.supplyChain"),
    items: [
      { id: "inventory", label: "Inventory", icon: <Icon.Scan size={18} /> },
      { id: "vendors", label: "Vendors", icon: <Icon.Vendor size={18} /> },
      {
        id: "procurement",
        label: "Procurement",
        icon: <Icon.Cart size={18} />,
      },
      {
        id: "order-tracking",
        label: "Order Tracking",
        icon: <Icon.Send size={18} />,
      },
    ],
  },
  {
    label: __t("navGroup.engineering"),
    items: [
      { id: "diff", label: "Compare Revisions", icon: <Icon.Diff size={18} /> },
      { id: "pdm", label: "CAD Vault", icon: <Icon.Doc size={18} /> },
      { id: "ecr", label: "Change Requests", icon: <Icon.Edit size={18} /> },
      {
        id: "routing",
        label: "Routings & Processes",
        icon: <Icon.Activity size={18} />,
      },
    ],
  },
  {
    label: __t("navGroup.quality"),
    items: [
      { id: "qms", label: "QMS Dashboard", icon: <Icon.Activity size={18} /> },
      { id: "ncr", label: "Non-Conformance", icon: <Icon.Flag size={18} /> },
      { id: "compliance", label: "Compliance", icon: <Icon.Check size={18} /> },
    ],
  },
  {
    label: __t("navGroup.operations"),
    items: [
      {
        id: "my-work",
        label: "My Work",
        icon: <Icon.User size={18} />,
      },
      {
        id: "work-orders",
        label: "Work Orders",
        icon: <Icon.Tools size={18} />,
      },
      {
        id: "work-centers",
        label: "Work Centers",
        icon: <Icon.Settings size={18} />,
      },
      {
        id: "labor",
        label: "Labor & Timesheets",
        icon: <Icon.History size={18} />,
      },
      {
        id: "calendar",
        label: "Calendar & Timeline",
        icon: <Icon.Calendar size={18} />,
      },
      {
        id: "approvals",
        label: "Approvals Inbox",
        icon: <Icon.Bell size={18} />,
      },
    ],
  },
  {
    label: __t("navGroup.documents"),
    items: [
      {
        id: "docs",
        label: __t("navGroup.documents"),
        icon: <Icon.Folder size={18} />,
      },
      { id: "ocr", label: "OCR Upload", icon: <Icon.Upload size={18} /> },
      {
        id: "bulk-import",
        label: "Bulk Import",
        icon: <Icon.Import size={18} />,
      },
    ],
  },
  {
    label: __t("navGroup.insights"),
    items: [
      { id: "analytics", label: "Analytics", icon: <Icon.Chart size={18} /> },
      { id: "ai", label: "AI & Automation", icon: <Icon.Sparkles size={18} /> },
      { id: "activity", label: "Team Activity", icon: <Icon.User size={18} /> },
    ],
  },
  {
    label: __t("navGroup.integration"),
    items: [
      { id: "webhooks", label: "Webhooks", icon: <Icon.Link size={18} /> },
      { id: "erp", label: "ERP Connectors", icon: <Icon.Refresh size={18} /> },
      {
        id: "supplier-portal",
        label: "Supplier Portal",
        icon: <Icon.Export size={18} />,
      },
    ],
  },
  {
    label: __t("navGroup.enterprise"),
    items: [
      {
        id: "enterprise-dashboards",
        label: "Enterprise Dashboards",
        icon: <Icon.Chart size={18} />,
      },
      {
        id: "service-bom",
        label: "Service BOMs",
        icon: <Icon.Bom size={18} />,
      },
      { id: "currency", label: "Currency & FX", icon: <Icon.Cart size={18} /> },
      {
        id: "compliance-autonumber",
        label: "Compliance & Numbering",
        icon: <Icon.Flag size={18} />,
      },
      {
        id: "custom-attributes",
        label: "Custom Attributes",
        icon: <Icon.Sliders size={18} />,
      },
      { id: "api-keys", label: "API Keys", icon: <Icon.Key size={18} /> },
    ],
  },
  {
    label: __t("navGroup.system"),
    items: [
      {
        id: "tenant-admin",
        label: "Tenant Admin",
        icon: <Icon.User size={18} />,
      },
      {
        id: "monitoring",
        label: "Monitoring",
        icon: <Icon.Activity size={18} />,
      },
      { id: "scanner", label: "Mobile Scanner", icon: <Icon.Scan size={18} /> },
    ],
  },
];

export function findNav(id) {
  for (const g of GROUPS) {
    const f = g.items.find((n) => n.id === id);
    if (f) return f;
  }
}

export default function NavRail() {
  const { route, setRoute, setSelectedRow } = React.useContext(AppContext);

  return (
    <nav className="navrail" aria-label="Main navigation">
      <div className="navrail-brand" style={{ background: "var(--bbf-white)", padding: "12px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "center", alignItems: "center" }}>
        <img src="/bbf-logo.svg" alt="Blackbox Factories" style={{ width: "100%", maxWidth: "48px", height: "auto" }} />
      </div>
      {(() => {
        let idx = 0;
        return GROUPS.map((g, gi) => (
          <React.Fragment key={gi}>
            <div
              className="nav-group-label"
              role="group"
              title={g.label}
              aria-label={g.label}
            >
              <span className="nav-group-bar" />
            </div>
            {g.items.map((n) => {
              idx++;
              const shortcut = idx <= 9 ? `\u2318${idx}` : null;
              const isActive = route === n.id;
              return (
                <button
                  key={n.id}
                  className={"nav-item " + (isActive ? "active" : "")}
                  aria-label={n.label}
                  onClick={() => {
                    setRoute(n.id);
                    setSelectedRow(null);
                  }}
                >
                  <span
                    className={"nav-icon-wrap " + (isActive ? "active" : "")}
                  >
                    {n.icon}
                  </span>
                  <span className="nav-tip">
                    {n.label}
                    {shortcut ? `  ${shortcut}` : ""}
                  </span>
                </button>
              );
            })}
          </React.Fragment>
        ));
      })()}
    </nav>
  );
}
