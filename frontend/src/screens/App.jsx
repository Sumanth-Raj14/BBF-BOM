import { Routes, Route, useLocation } from "react-router-dom";
import { storage } from "../utils/storage.js";
import { ACCENT_PRESETS } from "../utils/constants.js";
import { AppContext, AppCtxProvider } from "../context/AppCtx.jsx";
import useKeyboardShortcuts from "../hooks/useKeyboardShortcuts.js";
import TopBar from "../components/TopBar.jsx";
import NavRail, { findNav, GROUPS } from "../components/NavRail.jsx";
import ModalsHost from "../components/ModalsHost.jsx";
import { __t } from "../i18n";
import { toast } from "../utils/toast";
import {
  AuthScreen,
  Drawer,
  ErrorBoundary,
  ErrorScreen,
  MobileScanView,
  OnboardingWizard,
  Skeleton,
  SkeletonTable,
  ToastHost,
  api,
} from "../globals";
import {
  DashboardScreen,
  BomShell,
  PartsScreen,
  InventoryScreen,
  VendorsScreen,
  ProcurementScreen,
  DiffScreen,
  ECRScreen,
  CalendarScreen,
  WorkOrdersScreen,
  NCRScreen,
  QMSScreen,
  ComplianceScreen,
  PDMVaultScreen,
  ApprovalsScreen,
  OCRScreen,
  DocumentsScreen,
  AnalyticsScreen,
  ActivityScreen,
  WebhooksScreen,
  BulkImportScreen,
  ERPConnectorsScreen,
  SupplierPortalScreen,
  AIFeaturesScreen,
  MonitoringScreen,
  OrderTrackingScreen,
  MobileScannerScreen,
  EnterpriseDashboardsScreen,
  TenantsAdminScreen,
  ServiceBOMScreen,
  RoutingScreen,
  WorkCentersScreen,
  LaborScreen,
  CurrencyScreen,
  ComplianceAutoNumberScreen,
  CustomAttributesScreen,
  APIKeysScreen,
  WorkQueueScreen,
  IntegrationsScreen,
  AuditTrailScreen,
  ZohoBooksScreen,
} from "../components/LazyScreens.jsx";

const ErrBD = (p) =>
  ErrorBoundary
    ? React.createElement(ErrorBoundary, null, p.children)
    : p.children;

function ScreenSkeleton() {
  return (
    <div style={{ padding: "24px 32px" }}>
      <Skeleton height={32} width="40%" style={{ marginBottom: 24 }} />
      <SkeletonTable rows={6} cols={5} />
    </div>
  );
}

function DashboardWrapper() {
  return (
    <ErrBD>
      <DashboardScreen />
    </ErrBD>
  );
}

function BomShellWrapper() {
  const ctx = React.useContext(AppContext);
  return (
    <ErrBD>
      <BomShell
        data={ctx.data}
        search={ctx.search}
        activeCats={ctx.activeCats}
        setActiveCats={ctx.setActiveCats}
        density={ctx.gridDensity}
        onOpenDetail={(r) => ctx.setSelectedRow(r)}
        selectedRow={ctx.selectedRow}
        onCloseDetail={() => ctx.setSelectedRow(null)}
        bomTab={ctx.bomTab}
        setBomTab={ctx.setBomTab}
        openModal={ctx.openModal}
      />
    </ErrBD>
  );
}

function PartsScreenWrapper() {
  const ctx = React.useContext(AppContext);
  return (
    <ErrBD>
      <PartsScreen
        openModal={ctx.openModal}
        onOpenDetail={(r) => ctx.setSelectedRow(r)}
      />
    </ErrBD>
  );
}

function VendorsScreenWrapper() {
  const ctx = React.useContext(AppContext);
  return (
    <ErrBD>
      <VendorsScreen data={ctx.data} openModal={ctx.openModal} />
    </ErrBD>
  );
}

function ProcurementScreenWrapper() {
  const ctx = React.useContext(AppContext);
  return (
    <ErrBD>
      <ProcurementScreen data={ctx.data} openModal={ctx.openModal} />
    </ErrBD>
  );
}

function DiffScreenWrapper() {
  const ctx = React.useContext(AppContext);
  return (
    <ErrBD>
      <DiffScreen data={ctx.data} />
    </ErrBD>
  );
}

function DocumentsScreenWrapper() {
  const ctx = React.useContext(AppContext);
  return (
    <ErrBD>
      <DocumentsScreen
        data={ctx.data}
        openModal={ctx.openModal}
        perms={ctx.perms}
      />
    </ErrBD>
  );
}

function AnalyticsScreenWrapper() {
  const ctx = React.useContext(AppContext);
  return (
    <ErrBD>
      <AnalyticsScreen data={ctx.data} />
    </ErrBD>
  );
}

function ActivityScreenWrapper() {
  const ctx = React.useContext(AppContext);
  return (
    <ErrBD>
      <ActivityScreen data={ctx.data} />
    </ErrBD>
  );
}

function GenericScreen({ Component }) {
  return (
    <ErrBD>
      <Component />
    </ErrBD>
  );
}

function FourOhFour() {
  const ctx = React.useContext(AppContext);
  return (
    <ErrBD>
      <ErrorScreen
        kind="404"
        action="Go to Dashboard"
        onAction={() => ctx.setRoute("dashboard")}
      />
    </ErrBD>
  );
}

function AppShell() {
  const location = useLocation();
  const ctx = React.useContext(AppContext);
  const route =
    location.pathname === "/" ? "dashboard" : location.pathname.slice(1);
  const {
    route: _,
    setRoute,
    t,
    setTweak,
    selectedRow,
    setSelectedRow,
    search,
    activeCats,
    setActiveCats,
    bomTab,
    setBomTab,
    openModal,
    data,
    apiLoading,
    apiError,
    authed,
    authChecking,
    onboardingDone,
    showMobileScan,
    perms,
  } = ctx;

  useKeyboardShortcuts({
    route,
    setRoute,
    setModal: ctx.setModal,
    setSearch: ctx.setSearch,
    setTweak,
    setSelectedRow,
    GROUPS,
  });

  const intendedRoute = React.useRef(route);

  React.useEffect(() => {
    if (!authed && !authChecking) {
      sessionStorage.setItem("intended_route", route);
    }
  }, [authed, authChecking, route]);

  if (authChecking) {
    return React.createElement(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          background: "var(--bg)",
        },
      },
      React.createElement(
        "div",
        { style: { textAlign: "center" } },
        React.createElement("div", {
          style: {
            width: 32,
            height: 32,
            border: "3px solid var(--line)",
            borderTopColor: "var(--accent)",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
            margin: "0 auto 16px",
          },
        }),
        React.createElement(
          "div",
          { style: { fontWeight: 600, fontSize: 14, color: "var(--fg)" } },
          __t("app.verifyingSession"),
        ),
      ),
    );
  }
  if (!authed) {
    intendedRoute.current = route;
    return (
      <AuthScreen
        onSignIn={async (u) => {
          if (u.email) {
            try {
              const pw = u.password;
              const result = await api.auth.login(u.email, pw);
              if (result && result.access_token) {
                // Auth is cookie-based (credentials:'include'); do not persist
                // the token or password. storage.auth.set strips credentials.
                storage.auth.set(u);
                ctx.setAuthed(u);
                toast(__t("common.apiConnected") + " - " + u.name, {
                  kind: "success",
                });
                if (
                  intendedRoute.current &&
                  intendedRoute.current !== "login"
                ) {
                  setRoute(intendedRoute.current);
                }
                return;
              }
              toast(__t("auth.loginFailed"), { kind: "error" });
            } catch (e) {
              const msg = e.message || "";
              const isNetworkError =
                msg.includes("Failed to fetch") ||
                msg.includes("NetworkError") ||
                msg.includes("Unable to connect") ||
                msg.includes("temporarily unavailable") ||
                msg.includes("Internal server error");
              if (isNetworkError) {
                storage.auth.set(u);
                ctx.setAuthed(u);
                toast(__t("common.offlineMode"), { kind: "warn" });
                if (
                  intendedRoute.current &&
                  intendedRoute.current !== "login"
                ) {
                  setRoute(intendedRoute.current);
                }
                return;
              }
              toast(__t("auth.loginFailed") + ": " + e.message, {
                kind: "error",
              });
              return;
            }
          }
        }}
      />
    );
  }
  if (!onboardingDone) {
    return (
      <OnboardingWizard
        user={authed}
        onComplete={(setup) => {
          storage.onboarding.setDone();
          if (setup.role) {
            storage.role.set(setup.role);
            ctx.setUserRole(setup.role);
          }
          ctx.setOnboardingDone(true);
          toast(__t("onboarding.finishSetup"), { kind: "success" });
        }}
      />
    );
  }
  if (showMobileScan) {
    return <MobileScanView onClose={() => ctx.setShowMobileScan(false)} />;
  }

  return (
    <div
      className="app"
      data-screen-label="Blackbox BOM"
      onDragOver={(e) => {
        if (e.dataTransfer?.types?.includes("Files")) {
          e.preventDefault();
          document.body.classList.add("file-dragover");
        }
      }}
      onDragLeave={(e) => {
        if (e.target === e.currentTarget)
          document.body.classList.remove("file-dragover");
      }}
      onDrop={(e) => {
        if (!e.dataTransfer?.files?.length) return;
        e.preventDefault();
        document.body.classList.remove("file-dragover");
        const files = [...e.dataTransfer.files];
        const csv = files.find((f) => /\.csv$/i.test(f.name));
        if (csv) {
          ctx.setModalContext({ initialFile: csv });
          ctx.setModal("bulk-import");
        } else {
          ctx.setModalContext({ files });
          ctx.setModal("upload");
        }
        toast(__t("common.loading") + ": " + files.length + " files", {
          kind: "info",
        });
      }}
    >
      <a
        href="#main-content"
        className="pos-absolute w-1 h-1 overflow-h z-9999"
        style={{ left: -9999 }}
        onFocus={(e) => {
          e.target.style.position = "fixed";
          e.target.style.top = "8px";
          e.target.style.left = "8px";
          e.target.style.padding = "8px 16px";
          e.target.style.background = "var(--bg-elev)";
          e.target.style.color = "var(--fg)";
          e.target.style.borderRadius = "var(--r-2)";
          e.target.style.zIndex = 9999;
          e.target.style.width = "auto";
          e.target.style.height = "auto";
        }}
        onBlur={(e) => {
          e.target.style.position = "absolute";
          e.target.style.left = -9999;
          e.target.style.width = 1;
          e.target.style.height = 1;
        }}
      >
        {__t("app.skipToContent")}
      </a>

      <TopBar />
      <NavRail />

      <main
        id="main-content"
        className="main"
        data-screen-label={findNav(route)?.label}
      >
        {apiLoading && <ScreenSkeleton />}
        {apiError && !apiLoading && (
          <div
            className="bb-danger flex items-center gap-8"
            style={{
              padding: "8px 16px",
              background: "color-mix(in oklch, var(--danger) 8%, var(--bg))",
            }}
          >
            <span className="fg-danger fs-12 fw-600">
              {__t("app.apiError")}
            </span>
            <span className="fs-11 fg-2">{apiError}</span>
          </div>
        )}
        <React.Suspense fallback={<ScreenSkeleton />}>
          <Routes>
            <Route path="/" element={<DashboardWrapper />} />
            <Route path="/dashboard" element={<DashboardWrapper />} />
            <Route path="/bom" element={<BomShellWrapper />} />
            <Route path="/parts" element={<PartsScreenWrapper />} />
            <Route
              path="/inventory"
              element={<GenericScreen Component={InventoryScreen} />}
            />
            <Route path="/vendors" element={<VendorsScreenWrapper />} />
            <Route path="/procurement" element={<ProcurementScreenWrapper />} />
            <Route path="/diff" element={<DiffScreenWrapper />} />
            <Route
              path="/ecr"
              element={<GenericScreen Component={ECRScreen} />}
            />
            <Route
              path="/calendar"
              element={<GenericScreen Component={CalendarScreen} />}
            />
            <Route
              path="/work-orders"
              element={<GenericScreen Component={WorkOrdersScreen} />}
            />
            <Route
              path="/ncr"
              element={<GenericScreen Component={NCRScreen} />}
            />
            <Route
              path="/qms"
              element={<GenericScreen Component={QMSScreen} />}
            />
            <Route
              path="/compliance"
              element={<GenericScreen Component={ComplianceScreen} />}
            />
            <Route
              path="/pdm"
              element={<GenericScreen Component={PDMVaultScreen} />}
            />
            <Route
              path="/approvals"
              element={<GenericScreen Component={ApprovalsScreen} />}
            />
            <Route
              path="/ocr"
              element={<GenericScreen Component={OCRScreen} />}
            />
            <Route path="/docs" element={<DocumentsScreenWrapper />} />
            <Route path="/analytics" element={<AnalyticsScreenWrapper />} />
            <Route path="/activity" element={<ActivityScreenWrapper />} />
            <Route
              path="/webhooks"
              element={<GenericScreen Component={WebhooksScreen} />}
            />
            <Route
              path="/bulk-import"
              element={<GenericScreen Component={BulkImportScreen} />}
            />
            <Route
              path="/erp"
              element={<GenericScreen Component={ERPConnectorsScreen} />}
            />
            <Route
              path="/supplier-portal"
              element={<GenericScreen Component={SupplierPortalScreen} />}
            />
            <Route
              path="/ai"
              element={<GenericScreen Component={AIFeaturesScreen} />}
            />
            <Route
              path="/monitoring"
              element={<GenericScreen Component={MonitoringScreen} />}
            />
            <Route
              path="/order-tracking"
              element={<GenericScreen Component={OrderTrackingScreen} />}
            />
            <Route
              path="/scanner"
              element={<GenericScreen Component={MobileScannerScreen} />}
            />
            <Route
              path="/enterprise-dashboards"
              element={<GenericScreen Component={EnterpriseDashboardsScreen} />}
            />
            <Route
              path="/tenant-admin"
              element={<GenericScreen Component={TenantsAdminScreen} />}
            />
            <Route
              path="/service-bom"
              element={<GenericScreen Component={ServiceBOMScreen} />}
            />
            <Route
              path="/routing"
              element={<GenericScreen Component={RoutingScreen} />}
            />
            <Route
              path="/work-centers"
              element={<GenericScreen Component={WorkCentersScreen} />}
            />
            <Route
              path="/labor"
              element={<GenericScreen Component={LaborScreen} />}
            />
            <Route
              path="/currency"
              element={<GenericScreen Component={CurrencyScreen} />}
            />
            <Route
              path="/compliance-autonumber"
              element={<GenericScreen Component={ComplianceAutoNumberScreen} />}
            />
            <Route
              path="/custom-attributes"
              element={<GenericScreen Component={CustomAttributesScreen} />}
            />
            <Route
              path="/api-keys"
              element={<GenericScreen Component={APIKeysScreen} />}
            />
            <Route
              path="/my-work"
              element={<GenericScreen Component={WorkQueueScreen} />}
            />
            <Route
              path="/integrations"
              element={<GenericScreen Component={IntegrationsScreen} />}
            />
            <Route
              path="/audit-trail"
              element={<GenericScreen Component={AuditTrailScreen} />}
            />
            <Route
              path="/zoho-books"
              element={<GenericScreen Component={ZohoBooksScreen} />}
            />
            <Route path="*" element={<FourOhFour />} />
          </Routes>
        </React.Suspense>
      </main>

      <window.TweaksPanel title="Tweaks">
        <window.TweakSection label="Appearance">
          <window.TweakRadio
            label="Density"
            value={t.density}
            onChange={(v) => setTweak("density", v)}
            options={[
              { value: "dense", label: "Dense" },
              { value: "normal", label: "Normal" },
              { value: "comfortable", label: "Comfy" },
            ]}
          />
          <window.TweakColor
            label="Accent"
            value={t.accent}
            options={ACCENT_PRESETS}
            onChange={(v) => setTweak("accent", v)}
          />
        </window.TweakSection>
      </window.TweaksPanel>

      {selectedRow && route !== "bom" && (
        <Drawer
          row={selectedRow}
          onClose={() => setSelectedRow(null)}
          data={data}
          openModal={openModal}
          overlay
        />
      )}

      <ToastHost />
      <ModalsHost />
    </div>
  );
}

export default function App() {
  return (
    <AppCtxProvider>
      <AppShell />
    </AppCtxProvider>
  );
}
