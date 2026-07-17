import PropTypes from "prop-types";
import { Z } from "../utils/design-tokens.js";
import { __t } from "../i18n";
import { toast } from "../utils/toast";
// Auth screens + Onboarding wizard + Mobile scan view + Role context.
// These attach to window so app.jsx can show them based on app state.
// ============ ROLES & PERMISSIONS ============
export const ROLES = {
  Admin: {
    canEdit: true,
    canRelease: true,
    canCreatePO: true,
    canManageVendors: true,
    canDelete: true,
    canViewCosts: true,
  },
  Engineering: {
    canEdit: true,
    canRelease: true,
    canCreatePO: false,
    canManageVendors: false,
    canDelete: false,
    canViewCosts: true,
  },
  Procurement: {
    canEdit: false,
    canRelease: true,
    canCreatePO: true,
    canManageVendors: true,
    canDelete: false,
    canViewCosts: true,
  },
  Finance: {
    canEdit: false,
    canRelease: true,
    canCreatePO: false,
    canManageVendors: false,
    canDelete: false,
    canViewCosts: true,
  },
  Viewer: {
    canEdit: false,
    canRelease: false,
    canCreatePO: false,
    canManageVendors: false,
    canDelete: false,
    canViewCosts: false,
  },
};
window.ROLES = ROLES;
// ============ AUTH SCREEN ============
function AuthScreen({ onSignIn }) {
  const [mode, setMode] = React.useState("signin"); // signin | signup | forgot
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState(null);
  const submit = (e) => {
    e?.preventDefault();
    setErr(null);
    if (!email || !email.includes("@")) {
      setErr(__t("auth.enterValidEmail"));
      return;
    }
    if (mode !== "forgot" && (!password || password.length < 4)) {
      setErr(__t("auth.passwordMinLength"));
      return;
    }
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      if (mode === "forgot") {
        toast(__t("auth.passwordResetSent") + " " + email, { kind: "success" });
        setMode("signin");
        return;
      }
      onSignIn({
        email,
        password,
        name: email
          .split("@")[0]
          .replace(/[._]/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase()),
      });
    }, 700);
  };
  const sso = (provider) => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      onSignIn({
        email: "admin@blackbox.com",
        password: "",
        name: "Admin User",
        via: provider,
      });
    }, 800);
  };
  return (
    <div className="auth-screen">
      <div className="auth-side">
        <div className="auth-brand">
          <div className="brand-mark w-32 h-32" style={{ padding: 5 }}>
            <span />
            <span />
            <span />
            <span />
          </div>
          <div>
            <div
              className="font-mono fw-700 fs-14"
              style={{ letterSpacing: "0.18em" }}
            >
              {__t("app.brandBlackbox")}
            </div>
            <div
              className="font-mono fs-10 fg-3"
              style={{ letterSpacing: "0.12em" }}
            >
              {__t("app.brandBom")} MANAGEMENT
            </div>
          </div>
        </div>
        <div className="auth-tagline">
          <h1>{__t("auth.tagline")}</h1>
          <p>{__t("auth.description")}</p>
        </div>
        <div className="auth-features">
          <div>
            <Icon.Bom size={14} /> {__t("auth.featureBoms")}
          </div>
          <div>
            <Icon.Vendor size={14} /> {__t("auth.featureVendors")}
          </div>
          <div>
            <Icon.Scan size={14} /> {__t("auth.featureBarcode")}
          </div>
          <div>
            <Icon.Sparkles size={14} /> {__t("auth.featureAI")}
          </div>
        </div>
        <div className="auth-foot">
          <div className="font-mono fs-10 fg-4">{__t("auth.compliance")}</div>
        </div>
      </div>
      <div className="auth-main">
        <div className="auth-card">
          <h2
            className="fs-22"
            style={{ margin: "0 0 4px", letterSpacing: "-0.01em" }}
          >
            {mode === "signin"
              ? __t("auth.welcomeBack")
              : mode === "signup"
                ? __t("auth.createYourWorkspace")
                : __t("auth.resetPasswordTitle")}
          </h2>
          <p className="fs-13 fg-3" style={{ margin: "0 0 22px" }}>
            {mode === "signin"
              ? __t("auth.signInSubtitle")
              : mode === "signup"
                ? __t("auth.signUpSubtitle")
                : __t("auth.resetSubtitle")}
          </p>
          {mode !== "forgot" && (
            <>
              <div
                className="d-grid gap-8 mb-14"
                style={{ gridTemplateColumns: "1fr 1fr" }}
              >
                <button
                  className="btn justify-center"
                  onClick={() => sso("Google")}
                  disabled={loading}
                  style={{ height: 38 }}
                >
                  <span
                    className="font-mono fw-700 fs-13"
                    style={{ color: "#4285F4" }}
                  >
                    G
                  </span>{" "}
                  Google
                </button>
                <button
                  className="btn justify-center"
                  onClick={() => sso("Microsoft")}
                  disabled={loading}
                  style={{ height: 38 }}
                >
                  <span className="font-mono fw-700 fs-13">⊞</span>{" "}
                  {__t("auth.ssoMicrosoft")}
                </button>
              </div>
              <button
                className="btn w-100p justify-center mb-14"
                onClick={() => sso("SAML SSO")}
                disabled={loading}
                style={{ height: 38 }}
              >
                <Icon.Link size={12} /> {__t("auth.ssoSaml")}
              </button>
              <div
                className="flex items-center gap-10 fg-4 fs-10 font-mono letter-sp-8"
                style={{ margin: "16px 0" }}
              >
                <span
                  className="flex-1 h-1"
                  style={{ background: "var(--line)" }}
                />
                {__t("auth.orDivider")}
                <span
                  className="flex-1 h-1"
                  style={{ background: "var(--line)" }}
                />
              </div>
            </>
          )}
          <form onSubmit={submit}>
            <div className="field">
              <label htmlFor="auth-email">{__t("auth.email")}</label>
              <input
                id="auth-email"
                name="email"
                autoFocus
                className="input mono"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={__t("auth.emailPlaceholder")}
                type="email"
              />
            </div>
            {mode !== "forgot" && (
              <div className="field">
                <label htmlFor="auth-password">
                  {__t("auth.password")}{" "}
                  {mode === "signin" && (
                    <span
                      className="c-pointer fg-accent"
                      style={{
                        float: "right",
                        fontFamily: "inherit",
                        textTransform: "none",
                        letterSpacing: 0,
                      }}
                      onClick={() => setMode("forgot")}
                    >
                      {__t("auth.forgotShort")}
                    </span>
                  )}
                </label>
                <input
                  id="auth-password"
                  name="password"
                  className="input mono"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={__t("auth.passwordPlaceholder")}
                  type="password"
                />
              </div>
            )}
            {err && (
              <div
                className="rounded-r2 fg-danger fs-11 font-mono mb-12"
                style={{
                  padding: 8,
                  background:
                    "color-mix(in oklch, var(--danger) 10%, var(--bg))",
                  border: "1px solid var(--danger)",
                }}
              >
                {err}
              </div>
            )}
            <button
              type="submit"
              className="btn primary w-100p justify-center mt-4"
              disabled={loading}
              style={{ height: 38 }}
            >
              {loading ? (
                <>
                  <span className="spinner" />{" "}
                  {mode === "signin"
                    ? __t("auth.signingIn")
                    : mode === "signup"
                      ? __t("auth.creating")
                      : __t("auth.sending")}
                </>
              ) : mode === "signin" ? (
                __t("auth.signIn")
              ) : mode === "signup" ? (
                __t("auth.createWorkspace")
              ) : (
                __t("auth.sendResetLink")
              )}
            </button>
          </form>
          <div className="text-center fs-12 fg-3" style={{ marginTop: 18 }}>
            {mode === "signin" && (
              <>
                {__t("auth.newToBlackbox")}{" "}
                <a
                  onClick={() => setMode("signup")}
                  className="fg-accent cursor-pointer fw-600"
                >
                  {__t("auth.createAccount")}
                </a>
              </>
            )}
            {mode === "signup" && (
              <>
                {__t("auth.alreadyHaveAccount")}{" "}
                <a
                  onClick={() => setMode("signin")}
                  className="fg-accent cursor-pointer fw-600"
                >
                  {__t("auth.signIn")}
                </a>
              </>
            )}
            {mode === "forgot" && (
              <a
                onClick={() => setMode("signin")}
                className="fg-accent cursor-pointer fw-600"
              >
                {__t("auth.backToSignIn")}
              </a>
            )}
          </div>
        </div>
        <div className="auth-legal">
          {__t("auth.legal")} <a>{__t("auth.terms")}</a> and{" "}
          <a>{__t("auth.privacyPolicy")}</a>
        </div>
      </div>
    </div>
  );
}
AuthScreen.propTypes = {
  onSignIn: PropTypes.func,
};
// ============ ONBOARDING WIZARD ============
function OnboardingWizard({ user, onComplete }) {
  const [step, setStep] = React.useState(0);
  const [workspaceName, setWorkspaceName] = React.useState("");
  const [role, setRole] = React.useState("Engineering");
  const [invites, setInvites] = React.useState([""]);
  const [integrations, setIntegrations] = React.useState({
    solidworks: true,
    slack: false,
    netsuite: false,
  });
  const [template, setTemplate] = React.useState("blank");
  const steps = [
    __t("onboarding.stepWorkspace"),
    __t("onboarding.stepRole"),
    __t("onboarding.stepTeam"),
    __t("onboarding.stepIntegrations"),
    __t("onboarding.stepFirstBom"),
  ];
  const total = steps.length;
  const next = () => (step < total - 1 ? setStep(step + 1) : finish());
  const back = () => step > 0 && setStep(step - 1);
  const finish = () => {
    onComplete({
      workspaceName: workspaceName || "My Workspace",
      role,
      invites: invites.filter(Boolean),
      integrations,
      template,
    });
  };
  return (
    <div className="onboarding">
      <div className="ob-header">
        <div className="brand-mark">
          <span />
          <span />
          <span />
          <span />
        </div>
        <div
          className="font-mono fw-700 fs-12"
          style={{ letterSpacing: "0.18em" }}
        >
          {__t("app.brandBlackbox")} {__t("app.brandBom")}
        </div>
        <div className="flex-1" />
        <button
          onClick={() => onComplete({})}
          className="bg-transparent b-0 fg-3 fs-11 c-pointer font-mono"
        >
          {__t("onboarding.skipSetup")}
        </button>
      </div>
      <div className="ob-progress">
        {steps.map((s, i) => (
          <div key={s} className="ob-step">
            <span
              className={
                "ob-dot " + (i < step ? "done" : i === step ? "active" : "")
              }
            >
              {i < step ? "✓" : i + 1}
            </span>
            <span
              className="font-mono fs-10 uppercase letter-sp-6"
              style={{ color: i <= step ? "var(--fg)" : "var(--fg-4)" }}
            >
              {s}
            </span>
            {i < steps.length - 1 && (
              <div className={"ob-line " + (i < step ? "done" : "")} />
            )}
          </div>
        ))}
      </div>
      <div className="ob-content">
        {step === 0 && (
          <>
            <h1>{__t("onboarding.nameWorkspace")}</h1>
            <p>{__t("onboarding.nameWorkspaceDesc")}</p>
            <div className="field" style={{ maxWidth: 420 }}>
              <label>{__t("onboarding.workspaceName")}</label>
              <input
                id="ob-workspace"
                name="workspaceName"
                autoFocus
                className="input"
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                placeholder={__t("onboarding.workspacePlaceholder")}
              />
            </div>
            <div className="fs-11 fg-3 font-mono mt-8">
              {__t("onboarding.urlLabel")}{" "}
              <strong>
                {(workspaceName || "your-workspace")
                  .toLowerCase()
                  .replace(/[^\w]+/g, "-")}
                .bom.dev
              </strong>
            </div>
          </>
        )}
        {step === 1 && (
          <>
            <h1>{__t("onboarding.whatsYourRole")}</h1>
            <p>{__t("onboarding.roleDesc")}</p>
            <div
              className="d-grid gap-10"
              style={{ gridTemplateColumns: "repeat(2, 1fr)", maxWidth: 520 }}
            >
              {[
                { id: "Admin", desc: __t("onboarding.roleAdmin") },
                { id: "Engineering", desc: __t("onboarding.roleEngineering") },
                { id: "Procurement", desc: __t("onboarding.roleProcurement") },
                { id: "Finance", desc: __t("onboarding.roleFinance") },
              ].map((r) => (
                <button
                  key={r.id}
                  onClick={() => setRole(r.id)}
                  style={{
                    padding: 14,
                    border:
                      "1.5px solid " +
                      (role === r.id ? "var(--accent)" : "var(--line)"),
                    borderRadius: "var(--r-3)",
                    background:
                      role === r.id ? "var(--accent-soft)" : "var(--bg)",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <div className="fw-700 fs-13" style={{ marginBottom: 3 }}>
                    {r.id}
                  </div>
                  <div className="fs-11 fg-3">{r.desc}</div>
                </button>
              ))}
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <h1>{__t("onboarding.inviteTeam")}</h1>
            <p>{__t("onboarding.inviteDesc")}</p>
            <div style={{ maxWidth: 480 }}>
              {invites.map((inv, i) => (
                <div key={inv + "-" + i} className="flex gap-6 mb-6">
                  <input
                    id={"ob-invite-" + i}
                    name="inviteEmail"
                    className="input mono"
                    placeholder={__t("onboarding.invitePlaceholder")}
                    value={inv}
                    onChange={(e) => {
                      const n = [...invites];
                      n[i] = e.target.value;
                      setInvites(n);
                    }}
                    aria-label={"Invite email " + (i + 1)}
                  />
                  <select
                    id={"ob-invite-role-" + i}
                    name="inviteRole"
                    className="select"
                    style={{ width: 140 }}
                    aria-label={"Invite role " + (i + 1)}
                  >
                    <option>Engineering</option>
                    <option>Procurement</option>
                    <option>Finance</option>
                    <option>Viewer</option>
                  </select>
                  {invites.length > 1 && (
                    <button
                      className="icon-btn w-32 h-32"
                      aria-label={__t("onboarding.inviteRemove")}
                      onClick={() =>
                        setInvites(invites.filter((_, j) => j !== i))
                      }
                    >
                      <Icon.X size={12} />
                    </button>
                  )}
                </div>
              ))}
              <button
                className="btn small"
                onClick={() => setInvites([...invites, ""])}
              >
                <Icon.Plus size={11} /> {__t("onboarding.inviteAdd")}
              </button>
            </div>
          </>
        )}
        {step === 3 && (
          <>
            <h1>{__t("onboarding.connectTools")}</h1>
            <p>{__t("onboarding.connectDesc")}</p>
            <div className="flex flex-col gap-8" style={{ maxWidth: 520 }}>
              {[
                {
                  key: "solidworks",
                  name: __t("onboarding.toolSolidworks"),
                  desc: __t("onboarding.toolSolidworksDesc"),
                  icon: "⌬",
                },
                {
                  key: "netsuite",
                  name: __t("onboarding.toolNetsuite"),
                  desc: __t("onboarding.toolNetsuiteDesc"),
                  icon: "$",
                },
                {
                  key: "slack",
                  name: __t("onboarding.toolSlack"),
                  desc: __t("onboarding.toolSlackDesc"),
                  icon: "≡",
                },
              ].map((it) => (
                <label
                  key={it.key}
                  className="flex items-center gap-12 border-line rounded-r2 c-pointer"
                  style={{
                    padding: 12,
                    background: integrations[it.key]
                      ? "var(--bg-elev)"
                      : "var(--bg)",
                  }}
                >
                  <span className="w-36 h-36 rounded-r2 bg-sunk inline-flex items-center justify-center font-mono fs-18 fg-2">
                    {it.icon}
                  </span>
                  <div className="flex-1">
                    <div className="fw-600 fs-13">{it.name}</div>
                    <div className="font-mono fs-10 fg-3">{it.desc}</div>
                  </div>
                  <input
                    type="checkbox"
                    id={"ob-integ-" + it.key}
                    name={"integration_" + it.key}
                    className="row-checkbox w-18 h-18"
                    checked={integrations[it.key]}
                    onChange={(e) =>
                      setIntegrations({
                        ...integrations,
                        [it.key]: e.target.checked,
                      })
                    }
                  />
                </label>
              ))}
            </div>
          </>
        )}
        {step === 4 && (
          <>
            <h1>{__t("onboarding.startTemplate")}</h1>
            <p>{__t("onboarding.templateDesc")}</p>
            <div
              className="d-grid gap-10"
              style={{ gridTemplateColumns: "repeat(3, 1fr)", maxWidth: 720 }}
            >
              {[
                {
                  id: "blank",
                  name: __t("onboarding.templateBlank"),
                  parts: __t("onboarding.templateBlankParts"),
                  desc: __t("onboarding.templateBlankDesc"),
                },
                {
                  id: "sample",
                  name: __t("onboarding.templateSample"),
                  parts: __t("onboarding.templateSampleParts"),
                  desc: __t("onboarding.templateSampleDesc"),
                },
                {
                  id: "import",
                  name: __t("onboarding.templateImport"),
                  parts: __t("onboarding.templateImportParts"),
                  desc: __t("onboarding.templateImportDesc"),
                },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTemplate(t.id)}
                  style={{
                    padding: 16,
                    border:
                      "1.5px solid " +
                      (template === t.id ? "var(--accent)" : "var(--line)"),
                    borderRadius: "var(--r-3)",
                    background:
                      template === t.id ? "var(--accent-soft)" : "var(--bg)",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <div className="font-mono fs-9 fg-3 letter-sp-6 uppercase">
                    {t.parts}
                  </div>
                  <div className="fw-700 fs-14" style={{ margin: "4px 0" }}>
                    {t.name}
                  </div>
                  <div className="fs-11 fg-3">{t.desc}</div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="ob-footer">
        {step > 0 ? (
          <button className="btn" onClick={back}>
            {__t("onboarding.back")}
          </button>
        ) : (
          <div />
        )}
        <div className="font-mono fs-10 fg-3">
          {__t("onboarding.stepOf", { current: step + 1, total: total })}
        </div>
        <button className="btn primary" onClick={next}>
          {step === total - 1
            ? __t("onboarding.finishSetup")
            : __t("onboarding.continue")}
        </button>
      </div>
    </div>
  );
}
OnboardingWizard.propTypes = {
  user: PropTypes.any,
  onComplete: PropTypes.func,
};
// ============ MOBILE SCAN VIEW ============
function MobileScanView({ onClose }) {
  const [scans, setScans] = React.useState([]);
  const [scanning, setScanning] = React.useState(false);
  const fakeScan = () => {
    setScanning(true);
    setTimeout(() => {
      const samples = [
        {
          pn: "EL-MCU-STM32H7",
          name: "MCU Module STM32H743",
          loc: "A-12-03",
          stock: 142,
          status: "ok",
        },
        {
          pn: "EL-PSU-240W",
          name: "Power Supply 240W ATX",
          loc: "B-04-11",
          stock: 28,
          status: "low",
        },
        {
          pn: "MEC-PL-040A",
          name: "Side Panel Anodized",
          loc: "C-01-22",
          stock: 0,
          status: "out",
        },
        {
          pn: "HW-FAS-M3-08",
          name: "Screw M3×8 Socket",
          loc: "D-09-17",
          stock: 4820,
          status: "ok",
        },
      ];
      const pick = samples[Math.floor(Math.random() * samples.length)];
      setScans([
        {
          ...pick,
          at: new Date().toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
          }),
        },
        ...scans,
      ]);
      setScanning(false);
    }, 900);
  };
  return (
    <div className="mobile-scan">
      <div className="ms-bar">
        <button className="ms-back" onClick={onClose}>
          ←
        </button>
        <div className="ms-title">{__t("mobileScan.title")}</div>
        <button className="ms-menu" aria-label={__t("mobileScan.moreOptions")}>
          <Icon.Dots size={16} />
        </button>
      </div>
      <div className="ms-viewfinder">
        <div className="ms-corner tl" />
        <div className="ms-corner tr" />
        <div className="ms-corner bl" />
        <div className="ms-corner br" />
        {scanning && <div className="ms-scanline" />}
        <div className="ms-hint">
          {scanning
            ? __t("mobileScan.scanning")
            : __t("mobileScan.pointCamera")}
        </div>
      </div>
      <div className="ms-actions">
        <button className="ms-action" onClick={fakeScan} disabled={scanning}>
          <Icon.Scan size={18} />{" "}
          {scanning
            ? __t("mobileScan.scanningVerb")
            : __t("mobileScan.tapToScan")}
        </button>
        <button
          className="ms-action ms-secondary"
          onClick={() => toast(__t("mobileScan.manualEntry"))}
        >
          <Icon.Edit size={16} /> {__t("mobileScan.type")}
        </button>
      </div>
      <div className="ms-history">
        <div className="ms-history-h">
          <span>{__t("mobileScan.recentScans")}</span>
          <span>{scans.length}</span>
        </div>
        {scans.length === 0 && (
          <div className="ms-empty">{__t("mobileScan.empty")}</div>
        )}
        {scans.map((s) => (
          <div key={s.pn} className="ms-card">
            <div>
              <div className="ms-pn">{s.pn}</div>
              <div className="ms-name">{s.name}</div>
              <div className="ms-meta">
                📍 {s.loc} · {s.at}
              </div>
            </div>
            <div className={"ms-stock " + s.status}>
              <div className="ms-stock-num">{s.stock}</div>
              <div className="ms-stock-lbl">
                {s.status === "out"
                  ? __t("mobileScan.outOfStock")
                  : s.status === "low"
                    ? __t("mobileScan.lowStock")
                    : __t("mobileScan.inStock")}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
MobileScanView.propTypes = {
  onClose: PropTypes.func,
};
export { AuthScreen, OnboardingWizard, MobileScanView };
Object.assign(window, { AuthScreen, OnboardingWizard, MobileScanView });
// ============ TENANT CONTEXT & SETTINGS ============
export const TenantContext = React.createContext({
  tenant: {
    id: 1,
    name: "My Workspace",
    code: "my-workspace",
    plan: "professional",
    status: "active",
    maxUsers: 25,
    maxStorageGb: 50,
  },
  setTenant: () => {},
});
window.TenantContext = TenantContext;
function TenantSettingsModal({ open, onClose }) {
  const { tenant, setTenant } = React.useContext(TenantContext);
  const [name, setName] = React.useState(tenant?.name || "");
  const [plan, setPlan] = React.useState(tenant?.plan || "professional");
  const [maxUsers, setMaxUsers] = React.useState(tenant?.maxUsers || 25);
  const [maxStorage, setMaxStorage] = React.useState(
    tenant?.maxStorageGb || 50,
  );
  if (!open) return null;
  const plans = [
    {
      id: "free",
      name: __t("tenant.planFree"),
      price: __t("tenant.planPriceFree"),
      features: __t("tenant.planFreeFeatures"),
    },
    {
      id: "starter",
      name: __t("tenant.planStarter"),
      price: __t("tenant.planPriceStarter"),
      features: __t("tenant.planStarterFeatures"),
    },
    {
      id: "professional",
      name: __t("tenant.planProfessional"),
      price: __t("tenant.planPriceProfessional"),
      features: __t("tenant.planProfessionalFeatures"),
    },
    {
      id: "enterprise",
      name: __t("tenant.planEnterprise"),
      price: __t("tenant.planPriceEnterprise"),
      features: __t("tenant.planEnterpriseFeatures"),
    },
  ];
  const save = () => {
    setTenant({
      ...tenant,
      name,
      plan,
      maxUsers: Number(maxUsers),
      maxStorageGb: Number(maxStorage),
    });
    toast(__t("tenant.saved"), { kind: "success" });
    onClose();
  };
  return React.createElement(
    "div",
    {
      className: "modal-overlay",
      style: {
        position: "fixed",
        inset: 0,
        zIndex: Z.MODAL,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.5)",
      },
    },
    React.createElement(
      "div",
      {
        style: {
          background: "#fff",
          borderRadius: 12,
          padding: 24,
          width: 520,
          maxHeight: "80vh",
          overflow: "auto",
          boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
        },
      },
      React.createElement(
        "h2",
        { style: { margin: "0 0 16px", fontSize: 18 } },
        __t("tenant.settings"),
      ),
      React.createElement(
        "div",
        { className: "field" },
        React.createElement("label", null, __t("tenant.workspaceName")),
        React.createElement("input", {
          className: "input",
          value: name,
          onChange: (e) => setName(e.target.value),
        }),
      ),
      React.createElement(
        "div",
        { className: "field" },
        React.createElement("label", null, __t("tenant.plan")),
        React.createElement(
          "div",
          {
            style: {
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
              marginTop: 6,
            },
          },
          plans.map((p) =>
            React.createElement(
              "button",
              {
                key: p.id,
                onClick: () => setPlan(p.id),
                style: {
                  padding: 10,
                  border:
                    "1.5px solid " +
                    (plan === p.id ? "var(--accent)" : "var(--line)"),
                  borderRadius: 8,
                  background:
                    plan === p.id ? "var(--accent-soft)" : "var(--bg)",
                  cursor: "pointer",
                  textAlign: "left",
                },
              },
              React.createElement(
                "div",
                { style: { fontWeight: 700, fontSize: 13 } },
                p.name + " " + p.price,
              ),
              React.createElement(
                "div",
                {
                  style: {
                    fontSize: 10,
                    color: "var(--fg-3)",
                    fontFamily: "var(--font-mono)",
                  },
                },
                p.features,
              ),
            ),
          ),
        ),
      ),
      React.createElement(
        "div",
        { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 } },
        React.createElement(
          "div",
          { className: "field" },
          React.createElement("label", null, __t("tenant.maxUsers")),
          React.createElement("input", {
            className: "input mono",
            type: "number",
            value: maxUsers,
            onChange: (e) => setMaxUsers(e.target.value),
          }),
        ),
        React.createElement(
          "div",
          { className: "field" },
          React.createElement("label", null, __t("tenant.maxStorage")),
          React.createElement("input", {
            className: "input mono",
            type: "number",
            value: maxStorage,
            onChange: (e) => setMaxStorage(e.target.value),
          }),
        ),
      ),
      React.createElement(
        "div",
        {
          style: {
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            marginTop: 16,
          },
        },
        React.createElement(
          "button",
          { className: "btn", onClick: onClose },
          __t("tenant.cancel"),
        ),
        React.createElement(
          "button",
          { className: "btn primary", onClick: save },
          __t("tenant.saveSettings"),
        ),
      ),
    ),
  );
}
TenantSettingsModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
};
export { TenantSettingsModal };
Object.assign(window, { TenantSettingsModal });
