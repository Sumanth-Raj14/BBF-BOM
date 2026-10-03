import { Routes, Route, useLocation } from "react-router-dom";
import MembersScreen from "../components/screens/MembersScreen.jsx";
import PlanningScreen from "../components/screens/PlanningScreen.jsx";
import ContractsScreen from "../components/screens/ContractsScreen.jsx";
import MakeVsBuyScreen from "../components/screens/MakeVsBuyScreen.jsx";
import SupplierScorecardsScreen from "../components/screens/SupplierScorecardsScreen.jsx";
import ESignaturesScreen from "../components/screens/ESignaturesScreen.jsx";
import AdminOpsScreen from "../components/screens/AdminOpsScreen.jsx";
import PublicShareScreen from "../components/screens/PublicShareScreen.jsx";
import { storage } from "../utils/storage.js";
import {
  isOfflineCapableError,
  rememberOfflineCredential,
  verifyOfflineCredential,
} from "../utils/offlineAuth.js";
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
  SSOCallbackScreen,
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
  CatalogsScreen,
  TraceabilityScreen,
  DeviationsScreen,
  RequirementsScreen,
  BomVariantsScreen,
  MbomScreen,
  CadConnectorsScreen,
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
        setSearch={ctx.setSearch}
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

function MembersScreenWrapper() {
  return (
    <ErrBD>
      <MembersScreen />
    </ErrBD>
  );
}

function PlanningScreenWrapper() {
  return (
    <ErrBD>
      <PlanningScreen />
    </ErrBD>
  );
}

// These four features had a complete backend AND a working api.js client, but no
// screen ever called them — so they were unreachable from the product. Adding the
// missing surface; nothing existing is changed.
function ContractsScreenWrapper() {
  return (
    <ErrBD>
      <ContractsScreen />
    </ErrBD>
  );
}

function MakeVsBuyScreenWrapper() {
  return (
    <ErrBD>
      <MakeVsBuyScreen />
    </ErrBD>
  );
}

function SupplierScorecardsScreenWrapper() {
  return (
    <ErrBD>
      <SupplierScorecardsScreen />
    </ErrBD>
  );
}

function ESignaturesScreenWrapper() {
  return (
    <ErrBD>
      <ESignaturesScreen />
    </ErrBD>
  );
}

// Backup/restore/PITR and session management: both backends were live and
// superuser-gated, but no screen ever called them, so disaster recovery and
// "who is signed in" were unreachable from the product.
function AdminOpsScreenWrapper() {
  return (
    <ErrBD>
      <AdminOpsScreen />
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
      <DiffScreen data={ctx.data} openModal={ctx.openModal} bomId={ctx.bomId} />
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

  // SSO provider redirect lands here (?code&state, or ?error on denied
  // consent) — must render regardless of authed/authChecking, since the
  // user isn't authenticated yet when they arrive. Placed after every hook
  // call above (not before) so this early return never changes the hook
  // call order/count across renders of the same AppShell instance — e.g.
  // when onComplete's setRoute("dashboard") re-renders this same instance
  // straight out of the "auth/callback" branch.
  if (route === "auth/callback") {
    return (
      <SSOCallbackScreen
        onComplete={(result) => {
          const u = result?.user || {};
          const authedUser = {
            id: u.id,
            email: u.email,
            name:
              u.fullName || u.username || (u.email || "").split("@")[0] || "",
            avatarUrl: u.avatarUrl,
          };
          storage.auth.set(authedUser);
          ctx.setAuthed(authedUser);
          toast(__t("common.apiConnected") + " - " + authedUser.name, {
            kind: "success",
          });
          setRoute("dashboard");
        }}
      />
    );
  }

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
            const pw = u.password; // also needed by the offline check in catch
            try {
              const result = await api.auth.login(u.email, pw);
              if (result && result.access_token) {
                // Auth is cookie-based (credentials:'include'); do not persist
                // the token or password. storage.auth.set strips credentials.
                storage.auth.set(u);
                // The server just vouched for these credentials — record the
                // verifier so a genuinely-offline login can be checked against
                // something instead of being waved through.
                await rememberOfflineCredential(u.email, pw);
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
              // Audit finding A10 (auth bypass): the rule for when a failed
              // login may fall back to the local-first offline path lives in
              // utils/offlineAuth.js, where it is unit-tested.
              const isNetworkError = isOfflineCapableError(e.message);
              if (isNetworkError) {
                // WHAT WAS FALSE BEFORE: an unreachable server admitted ANY
                // email + any 4-char password and told them "Offline mode",
                // i.e. claimed an authentication that never happened. Offline
                // access now requires a credential this device has already
                // seen the server accept.
                const known = await verifyOfflineCredential(u.email, pw);
                if (known) {
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
                toast(
                  __t("auth.loginFailed") +
                    ": server unreachable, and this account has not signed in on this device before. Offline sign-in needs a previous successful sign-in here.",
                  { kind: "error" },
                );
                return;
              }
              toast(__t("auth.loginFailed") + ": " + e.message, {
                kind: "error",
              });
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
            <Route path="/members" element={<MembersScreenWrapper />} />
            <Route path="/contracts" element={<ContractsScreenWrapper />} />
            <Route path="/planning" element={<PlanningScreenWrapper />} />
            <Route
              path="/make-vs-buy"
              element={<MakeVsBuyScreenWrapper />}
            />
            <Route
              path="/supplier-scorecards"
              element={<SupplierScorecardsScreenWrapper />}
            />
            <Route
              path="/esignatures"
              element={<ESignaturesScreenWrapper />}
            />
            <Route path="/admin-ops" element={<AdminOpsScreenWrapper />} />
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
            <Route
              path="/catalogs"
              element={<GenericScreen Component={CatalogsScreen} />}
            />
            <Route
              path="/traceability"
              element={<GenericScreen Component={TraceabilityScreen} />}
            />
            <Route
              path="/deviations"
              element={<GenericScreen Component={DeviationsScreen} />}
            />
            <Route
              path="/requirements"
              element={<GenericScreen Component={RequirementsScreen} />}
            />
            <Route
              path="/bom-variants"
              element={<GenericScreen Component={BomVariantsScreen} />}
            />
            <Route
              path="/mbom"
              element={<GenericScreen Component={MbomScreen} />}
            />
            <Route
              path="/cad-connectors"
              element={<GenericScreen Component={CadConnectorsScreen} />}
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
  // /share/:token is the ONE public route: an external supplier has no session,
  // and AppShell renders <AuthScreen> for anyone unauthenticated. So it is
  // matched here, above the auth gate and outside AppCtxProvider (whose data
  // fetches are all tenant-scoped and would 401 for a public viewer).
  const { pathname } = useLocation();
  const shared = /^\/share\/(.+)$/.exec(pathname);
  if (shared) {
    return <PublicShareScreen token={decodeURIComponent(shared[1])} />;
  }
  return (
    <AppCtxProvider>
      <AppShell />
    </AppCtxProvider>
  );
}
