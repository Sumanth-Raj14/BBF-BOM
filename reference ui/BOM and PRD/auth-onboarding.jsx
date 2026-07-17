// Auth screens + Onboarding wizard + Mobile scan view + Role context.
// These attach to window so app.jsx can show them based on app state.

// ============ ROLES & PERMISSIONS ============
window.ROLES = {
  Admin:        { canEdit: true,  canRelease: true,  canCreatePO: true,  canManageVendors: true,  canDelete: true,  canViewCosts: true },
  Engineering:  { canEdit: true,  canRelease: true,  canCreatePO: false, canManageVendors: false, canDelete: false, canViewCosts: true },
  Procurement:  { canEdit: false, canRelease: true,  canCreatePO: true,  canManageVendors: true,  canDelete: false, canViewCosts: true },
  Finance:      { canEdit: false, canRelease: true,  canCreatePO: false, canManageVendors: false, canDelete: false, canViewCosts: true },
  Viewer:       { canEdit: false, canRelease: false, canCreatePO: false, canManageVendors: false, canDelete: false, canViewCosts: false },
};

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
    if (!email || !email.includes("@")) { setErr("Enter a valid email"); return; }
    if (mode !== "forgot" && (!password || password.length < 4)) { setErr("Password must be 4+ characters"); return; }
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      if (mode === "forgot") {
        window.toast("Password reset link sent to " + email, { kind: "success" });
        setMode("signin");
        return;
      }
      onSignIn({ email, password, name: email.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, c => c.toUpperCase()) });
    }, 700);
  };

  const sso = (provider) => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      onSignIn({ email: "elena@blackboxfactories.com", name: "Elena Chen", via: provider });
    }, 800);
  };

  return (
    <div className="auth-screen">
      <div className="auth-side">
        <div className="auth-brand">
          <div className="brand-mark" style={{width: 32, height: 32, padding: 5}}><span/><span/><span/><span/></div>
          <div>
            <div style={{fontFamily: "var(--font-mono)", fontWeight: 700, letterSpacing: "0.18em", fontSize: 14}}>BLACKBOX</div>
            <div style={{fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)", letterSpacing: "0.12em"}}>BOM MANAGEMENT</div>
          </div>
        </div>
        <div className="auth-tagline">
          <h1>The single source of truth for every part you ship.</h1>
          <p>Centralize BOMs, vendors, costs, and procurement across engineering, finance, and operations.</p>
        </div>
        <div className="auth-features">
          <div><Icon.Bom size={14}/> Multi-level BOMs with revision control</div>
          <div><Icon.Vendor size={14}/> Vendor risk + cost trend analytics</div>
          <div><Icon.Scan size={14}/> Barcode / QR traceability</div>
          <div><Icon.Sparkles size={14}/> OCR + AI part enrichment</div>
        </div>
        <div className="auth-foot">
          <div style={{fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-4)"}}>SOC 2 · ISO 27001 · GDPR</div>
        </div>
      </div>

      <div className="auth-main">
        <div className="auth-card">
          <h2 style={{margin: "0 0 4px", fontSize: 22, letterSpacing: "-0.01em"}}>
            {mode === "signin" ? "Welcome back" : mode === "signup" ? "Create your workspace" : "Reset password"}
          </h2>
          <p style={{margin: "0 0 22px", fontSize: 13, color: "var(--fg-3)"}}>
            {mode === "signin" ? "Sign in to your Blackbox BOM workspace" : mode === "signup" ? "Start tracking BOMs in 60 seconds" : "We'll send you a reset link"}
          </p>

          {mode !== "forgot" && (
            <>
              <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14}}>
                <button className="btn" onClick={() => sso("Google")} disabled={loading} style={{height: 38, justifyContent: "center"}}>
                  <span style={{fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 13, color: "#4285F4"}}>G</span> Google
                </button>
                <button className="btn" onClick={() => sso("Microsoft")} disabled={loading} style={{height: 38, justifyContent: "center"}}>
                  <span style={{fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 13}}>⊞</span> Microsoft
                </button>
              </div>
              <button className="btn" onClick={() => sso("SAML SSO")} disabled={loading} style={{width: "100%", height: 38, justifyContent: "center", marginBottom: 14}}>
                <Icon.Link size={12}/> Continue with SAML SSO
              </button>
              <div style={{display: "flex", alignItems: "center", gap: 10, margin: "16px 0", color: "var(--fg-4)", fontSize: 10, fontFamily: "var(--font-mono)", letterSpacing: "0.08em"}}>
                <span style={{flex: 1, height: 1, background: "var(--line)"}}/>
                OR
                <span style={{flex: 1, height: 1, background: "var(--line)"}}/>
              </div>
            </>
          )}

          <form onSubmit={submit}>
            <div className="field"><label>Email</label><input autoFocus className="input mono" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" type="email"/></div>
            {mode !== "forgot" && (
              <div className="field">
                <label>Password {mode === "signin" && <span style={{float: "right", fontFamily: "inherit", textTransform: "none", letterSpacing: 0, cursor: "pointer", color: "var(--accent)"}} onClick={() => setMode("forgot")}>Forgot?</span>}</label>
                <input className="input mono" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" type="password"/>
              </div>
            )}
            {err && <div style={{padding: 8, background: "color-mix(in oklch, var(--danger) 10%, var(--bg))", border: "1px solid var(--danger)", borderRadius: "var(--r-2)", color: "var(--danger)", fontSize: 11, fontFamily: "var(--font-mono)", marginBottom: 12}}>{err}</div>}
            <button type="submit" className="btn primary" disabled={loading} style={{width: "100%", height: 38, justifyContent: "center", marginTop: 4}}>
              {loading ? <><span className="spinner"/> {mode === "signin" ? "Signing in…" : mode === "signup" ? "Creating…" : "Sending…"}</> : (mode === "signin" ? "Sign in" : mode === "signup" ? "Create workspace" : "Send reset link")}
            </button>
          </form>

          <div style={{textAlign: "center", marginTop: 18, fontSize: 12, color: "var(--fg-3)"}}>
            {mode === "signin" && <>New to Blackbox? <a onClick={() => setMode("signup")} style={{color: "var(--accent)", cursor: "pointer", fontWeight: 600}}>Create a workspace</a></>}
            {mode === "signup" && <>Already have an account? <a onClick={() => setMode("signin")} style={{color: "var(--accent)", cursor: "pointer", fontWeight: 600}}>Sign in</a></>}
            {mode === "forgot" && <a onClick={() => setMode("signin")} style={{color: "var(--accent)", cursor: "pointer", fontWeight: 600}}>← Back to sign in</a>}
          </div>
        </div>

        <div className="auth-legal">
          By continuing you agree to our <a>Terms</a> and <a>Privacy Policy</a>
        </div>
      </div>
    </div>
  );
}

// ============ ONBOARDING WIZARD ============
function OnboardingWizard({ user, onComplete }) {
  const [step, setStep] = React.useState(0);
  const [workspaceName, setWorkspaceName] = React.useState("");
  const [role, setRole] = React.useState("Engineering");
  const [invites, setInvites] = React.useState([""]);
  const [integrations, setIntegrations] = React.useState({ solidworks: true, slack: false, netsuite: false });
  const [template, setTemplate] = React.useState("blank");

  const steps = ["Workspace", "Role", "Team", "Integrations", "First BOM"];
  const total = steps.length;

  const next = () => step < total - 1 ? setStep(step + 1) : finish();
  const back = () => step > 0 && setStep(step - 1);

  const finish = () => {
    onComplete({ workspaceName: workspaceName || "My Workspace", role, invites: invites.filter(Boolean), integrations, template });
  };

  return (
    <div className="onboarding">
      <div className="ob-header">
        <div className="brand-mark"><span/><span/><span/><span/></div>
        <div style={{fontFamily: "var(--font-mono)", fontWeight: 700, letterSpacing: "0.18em", fontSize: 12}}>BLACKBOX BOM</div>
        <div style={{flex: 1}}/>
        <button onClick={() => onComplete({})} style={{background: "transparent", border: "none", color: "var(--fg-3)", fontSize: 11, cursor: "pointer", fontFamily: "var(--font-mono)"}}>Skip setup</button>
      </div>

      <div className="ob-progress">
        {steps.map((s, i) => (
          <div key={s} className="ob-step">
            <span className={"ob-dot " + (i < step ? "done" : i === step ? "active" : "")}>{i < step ? "✓" : i + 1}</span>
            <span style={{fontFamily: "var(--font-mono)", fontSize: 10, color: i <= step ? "var(--fg)" : "var(--fg-4)", textTransform: "uppercase", letterSpacing: "0.06em"}}>{s}</span>
            {i < steps.length - 1 && <div className={"ob-line " + (i < step ? "done" : "")}/>}
          </div>
        ))}
      </div>

      <div className="ob-content">
        {step === 0 && (
          <>
            <h1>Name your workspace</h1>
            <p>This is the home for your team's BOMs, vendors, and procurement.</p>
            <div className="field" style={{maxWidth: 420}}>
              <label>Workspace name</label>
              <input autoFocus className="input" value={workspaceName} onChange={e => setWorkspaceName(e.target.value)} placeholder="e.g. Acme Engineering"/>
            </div>
            <div style={{fontSize: 11, color: "var(--fg-3)", fontFamily: "var(--font-mono)", marginTop: 8}}>
              URL: <strong>{(workspaceName || "your-workspace").toLowerCase().replace(/[^\w]+/g, "-")}.bom.dev</strong>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h1>What's your role?</h1>
            <p>We'll customize the interface for your day-to-day. You can change this later.</p>
            <div style={{display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, maxWidth: 520}}>
              {[
                { id: "Admin", desc: "Manage everything · billing, users, settings" },
                { id: "Engineering", desc: "Create + edit BOMs, manage parts" },
                { id: "Procurement", desc: "Vendors, POs, sourcing decisions" },
                { id: "Finance", desc: "Costs, budgets, approvals" },
              ].map(r => (
                <button
                  key={r.id}
                  onClick={() => setRole(r.id)}
                  style={{
                    padding: 14,
                    border: "1.5px solid " + (role === r.id ? "var(--accent)" : "var(--line)"),
                    borderRadius: "var(--r-3)",
                    background: role === r.id ? "var(--accent-soft)" : "var(--bg)",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <div style={{fontWeight: 700, fontSize: 13, marginBottom: 3}}>{r.id}</div>
                  <div style={{fontSize: 11, color: "var(--fg-3)"}}>{r.desc}</div>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h1>Invite your team</h1>
            <p>You can always add more people later from Workspace Settings.</p>
            <div style={{maxWidth: 480}}>
              {invites.map((inv, i) => (
                <div key={i} style={{display: "flex", gap: 6, marginBottom: 6}}>
                  <input className="input mono" placeholder="teammate@company.com" value={inv} onChange={e => { const n = [...invites]; n[i] = e.target.value; setInvites(n); }}/>
                  <select className="select" style={{width: 140}}><option>Engineering</option><option>Procurement</option><option>Finance</option><option>Viewer</option></select>
                  {invites.length > 1 && <button className="icon-btn" style={{width: 32, height: 32}} onClick={() => setInvites(invites.filter((_, j) => j !== i))}><Icon.X size={12}/></button>}
                </div>
              ))}
              <button className="btn small" onClick={() => setInvites([...invites, ""])}><Icon.Plus size={11}/> Add another</button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h1>Connect your tools</h1>
            <p>You can connect more integrations later in Settings.</p>
            <div style={{display: "flex", flexDirection: "column", gap: 8, maxWidth: 520}}>
              {[
                { key: "solidworks", name: "SolidWorks", desc: "Sync CAD assemblies → BOM", icon: "⌬" },
                { key: "netsuite", name: "NetSuite ERP", desc: "Push POs and inventory data", icon: "$" },
                { key: "slack", name: "Slack", desc: "Notifications and approvals", icon: "≡" },
              ].map(it => (
                <label key={it.key} style={{display: "flex", alignItems: "center", gap: 12, padding: 12, border: "1px solid var(--line)", borderRadius: "var(--r-2)", cursor: "pointer", background: integrations[it.key] ? "var(--bg-elev)" : "var(--bg)"}}>
                  <span style={{width: 36, height: 36, borderRadius: "var(--r-2)", background: "var(--bg-sunk)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", fontSize: 18, color: "var(--fg-2)"}}>{it.icon}</span>
                  <div style={{flex: 1}}>
                    <div style={{fontWeight: 600, fontSize: 13}}>{it.name}</div>
                    <div style={{fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)"}}>{it.desc}</div>
                  </div>
                  <input type="checkbox" className="row-checkbox" style={{width: 18, height: 18}} checked={integrations[it.key]} onChange={e => setIntegrations({ ...integrations, [it.key]: e.target.checked })}/>
                </label>
              ))}
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <h1>Start with a template</h1>
            <p>Pick a starting point or begin with an empty BOM.</p>
            <div style={{display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, maxWidth: 720}}>
              {[
                { id: "blank", name: "Blank BOM", parts: "0 parts", desc: "Start from scratch" },
                { id: "sample", name: "Sample drone", parts: "87 parts", desc: "ATLAS demo BOM" },
                { id: "import", name: "Import existing", parts: "CSV / SolidWorks", desc: "Bring your current BOM" },
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setTemplate(t.id)}
                  style={{
                    padding: 16,
                    border: "1.5px solid " + (template === t.id ? "var(--accent)" : "var(--line)"),
                    borderRadius: "var(--r-3)",
                    background: template === t.id ? "var(--accent-soft)" : "var(--bg)",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <div style={{fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--fg-3)", letterSpacing: "0.06em", textTransform: "uppercase"}}>{t.parts}</div>
                  <div style={{fontWeight: 700, fontSize: 14, margin: "4px 0"}}>{t.name}</div>
                  <div style={{fontSize: 11, color: "var(--fg-3)"}}>{t.desc}</div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="ob-footer">
        {step > 0 ? <button className="btn" onClick={back}>← Back</button> : <div/>}
        <div style={{fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)"}}>Step {step + 1} of {total}</div>
        <button className="btn primary" onClick={next}>
          {step === total - 1 ? "Finish setup →" : "Continue →"}
        </button>
      </div>
    </div>
  );
}

// ============ MOBILE SCAN VIEW ============
function MobileScanView({ onClose }) {
  const [scans, setScans] = React.useState([]);
  const [scanning, setScanning] = React.useState(false);

  const fakeScan = () => {
    setScanning(true);
    setTimeout(() => {
      const samples = [
        { pn: "EL-MCU-STM32H7", name: "MCU Module STM32H743", loc: "A-12-03", stock: 142, status: "ok" },
        { pn: "EL-PSU-240W", name: "Power Supply 240W ATX", loc: "B-04-11", stock: 28, status: "low" },
        { pn: "MEC-PL-040A", name: "Side Panel Anodized", loc: "C-01-22", stock: 0, status: "out" },
        { pn: "HW-FAS-M3-08", name: "Screw M3×8 Socket", loc: "D-09-17", stock: 4820, status: "ok" },
      ];
      const pick = samples[Math.floor(Math.random() * samples.length)];
      setScans([{ ...pick, at: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) }, ...scans]);
      setScanning(false);
    }, 900);
  };

  return (
    <div className="mobile-scan">
      <div className="ms-bar">
        <button className="ms-back" onClick={onClose}>←</button>
        <div className="ms-title">Warehouse Scan</div>
        <button className="ms-menu"><Icon.Dots size={16}/></button>
      </div>

      <div className="ms-viewfinder">
        <div className="ms-corner tl"/><div className="ms-corner tr"/>
        <div className="ms-corner bl"/><div className="ms-corner br"/>
        {scanning && <div className="ms-scanline"/>}
        <div className="ms-hint">{scanning ? "SCANNING…" : "Point camera at barcode"}</div>
      </div>

      <div className="ms-actions">
        <button className="ms-action" onClick={fakeScan} disabled={scanning}>
          <Icon.Scan size={18}/> {scanning ? "Scanning…" : "Tap to scan"}
        </button>
        <button className="ms-action ms-secondary" onClick={() => window.toast("Manual entry coming soon")}>
          <Icon.Edit size={16}/> Type
        </button>
      </div>

      <div className="ms-history">
        <div className="ms-history-h">
          <span>Recent scans</span>
          <span>{scans.length}</span>
        </div>
        {scans.length === 0 && <div className="ms-empty">Scanned parts will appear here.</div>}
        {scans.map((s, i) => (
          <div key={i} className="ms-card">
            <div>
              <div className="ms-pn">{s.pn}</div>
              <div className="ms-name">{s.name}</div>
              <div className="ms-meta">📍 {s.loc} · {s.at}</div>
            </div>
            <div className={"ms-stock " + s.status}>
              <div className="ms-stock-num">{s.stock}</div>
              <div className="ms-stock-lbl">{s.status === "out" ? "OUT OF STOCK" : s.status === "low" ? "LOW STOCK" : "IN STOCK"}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { AuthScreen, OnboardingWizard, MobileScanView });

// ============ TENANT CONTEXT & SETTINGS ============
window.TenantContext = React.createContext({
  tenant: { id: 1, name: "My Workspace", code: "my-workspace", plan: "professional", status: "active", maxUsers: 25, maxStorageGb: 50 },
  setTenant: () => {},
});

function TenantSettingsModal({ open, onClose }) {
  const { tenant, setTenant } = React.useContext(window.TenantContext);
  const [name, setName] = React.useState(tenant?.name || "");
  const [plan, setPlan] = React.useState(tenant?.plan || "professional");
  const [maxUsers, setMaxUsers] = React.useState(tenant?.maxUsers || 25);
  const [maxStorage, setMaxStorage] = React.useState(tenant?.maxStorageGb || 50);

  if (!open) return null;

  const plans = [
    { id: "free", name: "Free", price: "$0", features: "3 users, 1 GB, basic BOM" },
    { id: "starter", name: "Starter", price: "$29/mo", features: "10 users, 10 GB, full BOM" },
    { id: "professional", name: "Professional", price: "$79/mo", features: "25 users, 50 GB, ECO + inventory" },
    { id: "enterprise", name: "Enterprise", price: "Custom", features: "Unlimited, SSO, audit, SLA" },
  ];

  const save = () => {
    setTenant({ ...tenant, name, plan, maxUsers: Number(maxUsers), maxStorageGb: Number(maxStorage) });
    window.toast("Workspace settings saved", { kind: "success" });
    onClose();
  };

  return React.createElement("div", { className: "modal-overlay", style: { position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)" } },
    React.createElement("div", { style: { background: "#fff", borderRadius: 12, padding: 24, width: 520, maxHeight: "80vh", overflow: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" } },
      React.createElement("h2", { style: { margin: "0 0 16px", fontSize: 18 } }, "Workspace Settings"),
      React.createElement("div", { className: "field" },
        React.createElement("label", null, "Workspace Name"),
        React.createElement("input", { className: "input", value: name, onChange: e => setName(e.target.value) })
      ),
      React.createElement("div", { className: "field" },
        React.createElement("label", null, "Plan"),
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 6 } },
          plans.map(p =>
            React.createElement("button", {
              key: p.id,
              onClick: () => setPlan(p.id),
              style: {
                padding: 10, border: "1.5px solid " + (plan === p.id ? "var(--accent)" : "var(--line)"),
                borderRadius: 8, background: plan === p.id ? "var(--accent-soft)" : "var(--bg)", cursor: "pointer", textAlign: "left"
              }
            },
              React.createElement("div", { style: { fontWeight: 700, fontSize: 13 } }, p.name + " " + p.price),
              React.createElement("div", { style: { fontSize: 10, color: "var(--fg-3)", fontFamily: "var(--font-mono)" } }, p.features)
            )
          )
        )
      ),
      React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 } },
        React.createElement("div", { className: "field" },
          React.createElement("label", null, "Max Users"),
          React.createElement("input", { className: "input mono", type: "number", value: maxUsers, onChange: e => setMaxUsers(e.target.value) })
        ),
        React.createElement("div", { className: "field" },
          React.createElement("label", null, "Max Storage (GB)"),
          React.createElement("input", { className: "input mono", type: "number", value: maxStorage, onChange: e => setMaxStorage(e.target.value) })
        )
      ),
      React.createElement("div", { style: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 } },
        React.createElement("button", { className: "btn", onClick: onClose }, "Cancel"),
        React.createElement("button", { className: "btn primary", onClick: save }, "Save Settings")
      )
    )
  );
}

Object.assign(window, { TenantSettingsModal });
