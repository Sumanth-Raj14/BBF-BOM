import React from "react";
import ErrorBoundary from "./ErrorBoundary.jsx";
import { LeadHeat, STATUS_CLASS, Sparkline } from "../globals";

function createLazyScreen(importFn, globalName) {
  return React.lazy(function () {
    return importFn().then(function () {
      return {
        default: React.forwardRef(function LazyScreen(props, ref) {
          const C = window[globalName];
          if (!C) {
            console.error(
              "[LazyScreen] " +
                globalName +
                " is not defined on window after dynamic import",
            );
            return React.createElement(
              "div",
              {
                style: {
                  padding: 40,
                  textAlign: "center",
                  color: "var(--fg-3)",
                },
              },
              React.createElement(
                "div",
                { style: { fontSize: 14, fontWeight: 600, marginBottom: 8 } },
                'Screen "' + globalName + '" failed to register',
              ),
              React.createElement(
                "div",
                { style: { fontSize: 12 } },
                "The component was loaded but did not register correctly. Check the console for errors.",
              ),
            );
          }
          return React.createElement(
            ErrorBoundary,
            {
              title: "Screen failed to load",
              message:
                "An error occurred while loading this screen. Please try again.",
            },
            React.createElement(
              C,
              Object.assign({}, props, ref ? { ref: ref } : {}),
            ),
          );
        }),
      };
    });
  });
}

// Screens from lazy-loaded root files (removed from main.jsx initial bundle)
export const DashboardScreen = createLazyScreen(function () {
  return import("../root/dashboard.jsx");
}, "DashboardScreen");
// PartsScreen needs LeadHeat, STATUS_CLASS, Sparkline from bom-editor.jsx
export const PartsScreen = createLazyScreen(function () {
  return import("../root/bom-editor.jsx").then(function () {
    return import("../root/parts-screen.jsx");
  });
}, "PartsScreen");
export const PDMVaultScreen = createLazyScreen(function () {
  return import("../root/pdm-cad.jsx");
}, "PDMVaultScreen");
export const TenantsAdminScreen = createLazyScreen(function () {
  return import("../root/tenant-admin.jsx");
}, "TenantsAdminScreen");
export const MobileScannerScreen = createLazyScreen(function () {
  return import("../root/mobile-scanner.jsx");
}, "MobileScannerScreen");

// BomShell needs bom-editor.jsx + BomEditorScreen.jsx (orphaned file, never eagerly imported)
export const BomShell = createLazyScreen(function () {
  return import("../root/bom-editor.jsx").then(function () {
    return import("../screens/BomEditorScreen.jsx");
  });
}, "BomShell");

// Screens from secondary-screens.jsx (re-exports from components/screens/index.jsx)
// VendorsScreen and ProcurementScreen need LeadHeat from bom-editor.jsx
export const VendorsScreen = createLazyScreen(function () {
  return import("../root/bom-editor.jsx").then(function () {
    return import("../root/secondary-screens.jsx");
  });
}, "VendorsScreen");
export const ProcurementScreen = createLazyScreen(function () {
  return import("../root/bom-editor.jsx").then(function () {
    return import("../root/secondary-screens.jsx");
  });
}, "ProcurementScreen");
export const DiffScreen = createLazyScreen(function () {
  return import("../root/secondary-screens.jsx");
}, "DiffScreen");
export const OCRScreen = createLazyScreen(function () {
  return import("../root/secondary-screens.jsx");
}, "OCRScreen");
export const DocumentsScreen = createLazyScreen(function () {
  return import("../root/secondary-screens.jsx");
}, "DocumentsScreen");
export const AnalyticsScreen = createLazyScreen(function () {
  return import("../root/secondary-screens.jsx");
}, "AnalyticsScreen");
export const ActivityScreen = createLazyScreen(function () {
  return import("../root/secondary-screens.jsx");
}, "ActivityScreen");

// Screens from enterprise-screens.jsx (inline definitions)
export const EnterpriseDashboardsScreen = createLazyScreen(function () {
  return import("../root/enterprise-screens.jsx");
}, "EnterpriseDashboardsScreen");
export const ServiceBOMScreen = createLazyScreen(function () {
  return import("../root/enterprise-screens.jsx");
}, "ServiceBOMScreen");
export const RoutingScreen = createLazyScreen(function () {
  return import("../root/enterprise-screens.jsx");
}, "RoutingScreen");
export const WorkCentersScreen = createLazyScreen(function () {
  return import("../root/enterprise-screens.jsx");
}, "WorkCentersScreen");
export const LaborScreen = createLazyScreen(function () {
  return import("../root/enterprise-screens.jsx");
}, "LaborScreen");
export const CurrencyScreen = createLazyScreen(function () {
  return import("../root/enterprise-screens.jsx");
}, "CurrencyScreen");
export const ComplianceAutoNumberScreen = createLazyScreen(function () {
  return import("../root/enterprise-screens.jsx");
}, "ComplianceAutoNumberScreen");
export const CustomAttributesScreen = createLazyScreen(function () {
  return import("../root/enterprise-screens.jsx");
}, "CustomAttributesScreen");
export const APIKeysScreen = createLazyScreen(function () {
  return import("../root/enterprise-screens.jsx");
}, "APIKeysScreen");

export const QMSScreen = createLazyScreen(function () {
  return import("../root/qms-dashboard.jsx");
}, "QMSScreen");

// Screens from integration-screens.jsx
export const WebhooksScreen = createLazyScreen(function () {
  return import("../root/integration-screens.jsx");
}, "WebhooksScreen");
export const BulkImportScreen = createLazyScreen(function () {
  return import("../root/integration-screens.jsx");
}, "BulkImportScreen");
export const ERPConnectorsScreen = createLazyScreen(function () {
  return import("../root/integration-screens.jsx");
}, "ERPConnectorsScreen");
export const SupplierPortalScreen = createLazyScreen(function () {
  return import("../root/integration-screens.jsx");
}, "SupplierPortalScreen");
export const AIFeaturesScreen = createLazyScreen(function () {
  return import("../root/integration-screens.jsx");
}, "AIFeaturesScreen");
export const MonitoringScreen = createLazyScreen(function () {
  return import("../root/integration-screens.jsx");
}, "MonitoringScreen");
export const OrderTrackingScreen = createLazyScreen(function () {
  return import("../root/integration-screens.jsx");
}, "OrderTrackingScreen");

// Screens from eagerly-loaded root files (wrappers resolve from cache)
export const InventoryScreen = createLazyScreen(function () {
  return import("../root/prod-additions.jsx");
}, "InventoryScreen");
export const ECRScreen = createLazyScreen(function () {
  return import("../root/advanced-features.jsx");
}, "ECRScreen");
export const CalendarScreen = createLazyScreen(function () {
  return import("../root/advanced-features.jsx");
}, "CalendarScreen");
export const ComplianceScreen = createLazyScreen(function () {
  return import("../root/advanced-features.jsx");
}, "ComplianceScreen");
export const WorkOrdersScreen = createLazyScreen(function () {
  return import("../root/power-features.jsx");
}, "WorkOrdersScreen");
export const NCRScreen = createLazyScreen(function () {
  return import("../root/power-features.jsx");
}, "NCRScreen");
export const ApprovalsScreen = createLazyScreen(function () {
  return import("../root/final-polish.jsx");
}, "ApprovalsScreen");

// WS2 — unified My Work / Team Work board (self-registers on window)
export const WorkQueueScreen = createLazyScreen(function () {
  return import("./screens/WorkQueueScreen.jsx");
}, "WorkQueueScreen");

export const IntegrationsScreen = createLazyScreen(function () {
  return import("./screens/IntegrationsScreen.jsx");
}, "IntegrationsScreen");
