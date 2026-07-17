// Phase 4-6 Integration Screens: Webhooks, Bulk Import, ERP Connectors,
// Supplier Portal, AI Features, Monitoring Dashboard

// ============ WEBHOOK MANAGEMENT ============
function WebhooksScreen() {
  const [subscriptions, setSubscriptions] = React.useState([]);
  const [deliveries, setDeliveries] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [showCreate, setShowCreate] = React.useState(false);
  const [newUrl, setNewUrl] = React.useState("");
  const [newEvents, setNewEvents] = React.useState("bom.created,part.updated");
  const [tab, setTab] = React.useState("subscriptions");

  const load = React.useCallback(() => {
    setLoading(true);
    Promise.all([
      window.webhooksAPI?.list().catch(() => []),
      window.webhooksAPI?.deliveries({ limit: 50 }).catch(() => []),
    ]).then(([subs, dels]) => {
      setSubscriptions(Array.isArray(subs) ? subs : []);
      setDeliveries(Array.isArray(dels) ? dels : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const createWebhook = async () => {
    if (!newUrl) return;
    try {
      await window.webhooksAPI?.create({ url: newUrl, events: newEvents, secret: Math.random().toString(36).slice(2), active: true });
      window.toast("Webhook created", { kind: "success" });
      setShowCreate(false); setNewUrl(""); setNewEvents("bom.created,part.updated");
      load();
    } catch (e) { window.toast("Failed: " + e.message, { kind: "error" }); }
  };

  const testWebhook = async (id) => {
    try { await window.webhooksAPI?.test(id); window.toast("Test event sent", { kind: "success" }); }
    catch (e) { window.toast("Test failed: " + e.message, { kind: "error" }); }
  };

  const toggleActive = async (id, active) => {
    try { await window.webhooksAPI?.update(id, { active: !active }); load(); }
    catch (e) { window.toast("Failed", { kind: "error" }); }
  };

  const deleteWebhook = async (id) => {
    if (!confirm("Delete this webhook?")) return;
    try { await window.webhooksAPI?.delete(id); window.toast("Deleted", { kind: "success" }); load(); }
    catch (e) { window.toast("Failed", { kind: "error" }); }
  };

  const retryDelivery = async (deliveryId) => {
    try { await window.webhooksAPI?.retry(deliveryId); window.toast("Retry queued", { kind: "success" }); load(); }
    catch (e) { window.toast("Retry failed", { kind: "error" }); }
  };

  return (
    <div className="screen-wrap">
      <div className="screen-header">
        <div>
          <h1>Webhooks</h1>
          <div className="sub">Register endpoints to receive real-time event notifications</div>
        </div>
        <div style={{display: "flex", gap: 8}}>
          <button className={"btn" + (tab === "subscriptions" ? " primary" : "")} onClick={() => setTab("subscriptions")}>Subscriptions ({subscriptions.length})</button>
          <button className={"btn" + (tab === "deliveries" ? " primary" : "")} onClick={() => setTab("deliveries")}>Delivery Log ({deliveries.length})</button>
          <button className="btn primary" onClick={() => setShowCreate(!showCreate)}><Icon.Plus size={12}/> New Webhook</button>
        </div>
      </div>

      {showCreate && (
        <div className="card" style={{marginBottom: 12, padding: 16}}>
          <div style={{display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap"}}>
            <div style={{flex: 1, minWidth: 260}}>
              <label style={{fontSize: 10, fontWeight: 600, textTransform: "uppercase", color: "var(--fg-3)", letterSpacing: "0.06em"}}>Endpoint URL</label>
              <input className="twk-field" style={{width: "100%", marginTop: 4}} value={newUrl} onChange={e => setNewUrl(e.target.value)} placeholder="https://example.com/webhook"/>
            </div>
            <div style={{flex: 1, minWidth: 200}}>
              <label style={{fontSize: 10, fontWeight: 600, textTransform: "uppercase", color: "var(--fg-3)", letterSpacing: "0.06em"}}>Events (comma-separated)</label>
              <input className="twk-field" style={{width: "100%", marginTop: 4}} value={newEvents} onChange={e => setNewEvents(e.target.value)} placeholder="bom.created,part.updated"/>
            </div>
            <button className="btn primary" onClick={createWebhook}><Icon.Check size={12}/> Create</button>
            <button className="btn" onClick={() => setShowCreate(false)}>Cancel</button>
          </div>
        </div>
      )}

      {tab === "subscriptions" ? (
        <div className="card">
          {loading ? <div style={{textAlign: "center", padding: 40}}><span className="spinner"/></div> :
          subscriptions.length === 0 ? (
            <div style={{textAlign: "center", padding: 40, color: "var(--fg-3)", fontSize: 12}}>
              No webhooks configured. Click "New Webhook" to add one.
            </div>
          ) : (
            <table className="bom-table">
              <thead><tr><th>URL</th><th>Events</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
              <tbody>
                {subscriptions.map(sub => (
                  <tr key={sub.id}>
                    <td className="mono" style={{fontSize: 11}}>{sub.url}</td>
                    <td><span style={{fontSize: 10}}>{sub.events}</span></td>
                    <td><span className={"status " + (sub.active ? "released" : "deprecated")}>{sub.active ? "Active" : "Paused"}</span></td>
                    <td style={{fontSize: 10, color: "var(--fg-3)"}}>{sub.createdAt || "\u2014"}</td>
                    <td>
                      <div style={{display: "flex", gap: 4}}>
                        <button className="btn small" onClick={() => testWebhook(sub.id)}><Icon.Send size={10}/> Test</button>
                        <button className="btn small" onClick={() => toggleActive(sub.id, sub.active)}>{sub.active ? "Pause" : "Activate"}</button>
                        <button className="btn small" style={{color: "var(--danger)"}} onClick={() => deleteWebhook(sub.id)}><Icon.Trash size={10}/></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className="card">
          {loading ? <div style={{textAlign: "center", padding: 40}}><span className="spinner"/></div> :
          deliveries.length === 0 ? (
            <div style={{textAlign: "center", padding: 40, color: "var(--fg-3)", fontSize: 12}}>No deliveries yet.</div>
          ) : (
            <table className="bom-table">
              <thead><tr><th>Event</th><th>Status</th><th>Code</th><th>Retries</th><th>Time</th><th></th></tr></thead>
              <tbody>
                {deliveries.map(d => (
                  <tr key={d.id}>
                    <td style={{fontSize: 11}}>{d.event}</td>
                    <td><span className={"status " + (d.status === "delivered" ? "released" : d.status === "failed" ? "deprecated" : "review")}>{d.status}</span></td>
                    <td className="mono" style={{fontSize: 11}}>{d.statusCode || "\u2014"}</td>
                    <td className="mono" style={{fontSize: 11}}>{d.retryCount || 0}</td>
                    <td style={{fontSize: 10, color: "var(--fg-3)"}}>{d.createdAt || "\u2014"}</td>
                    <td>{d.status === "failed" && <button className="btn small" onClick={() => retryDelivery(d.id)}><Icon.Refresh size={10}/> Retry</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// ============ BULK IMPORT ============
function BulkImportScreen() {
  const [jobs, setJobs] = React.useState([]);
  const [uploading, setUploading] = React.useState(false);
  const [selectedFile, setSelectedFile] = React.useState(null);
  const [mappingPreview, setMappingPreview] = React.useState(null);
  const [activeJob, setActiveJob] = React.useState(null);

  const loadJobs = React.useCallback(() => {
    window.bulkImportAPI?.status("all").then(r => {
      setJobs(Array.isArray(r) ? r : Array.isArray(r?.jobs) ? r.jobs : []);
    }).catch(() => {});
  }, []);

  React.useEffect(() => { loadJobs(); }, [loadJobs]);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setMappingPreview(null);
  };

  const startImport = async () => {
    if (!selectedFile) return;
    setUploading(true);
    try {
      const result = await window.bulkImportAPI?.upload(selectedFile);
      window.toast("File uploaded, " + (result.totalRows || 0) + " rows detected", { kind: "success" });
      if (result.jobId) {
        setActiveJob(result.jobId);
        await window.bulkImportAPI?.process(result.jobId, mappingPreview || {});
        window.toast("Import processing started", { kind: "success" });
        loadJobs();
      }
    } catch (e) { window.toast("Import failed: " + e.message, { kind: "error" }); }
    setUploading(false);
  };

  return (
    <div className="screen-wrap">
      <div className="screen-header">
        <div>
          <h1>Bulk Import</h1>
          <div className="sub">Import CSV/XLSX data with automatic field mapping</div>
        </div>
      </div>

      <div className="card" style={{marginBottom: 12, padding: 20}}>
        <div style={{display: "flex", gap: 16, alignItems: "center"}}>
          <div style={{flex: 1}}>
            <div style={{border: "2px dashed var(--line)", borderRadius: "var(--r-2)", padding: 24, textAlign: "center", cursor: "pointer"}} onClick={() => document.getElementById("import-file").click()}>
              <Icon.Upload size={24} style={{opacity: 0.3, marginBottom: 8}}/>
              <div style={{fontSize: 12, fontWeight: 500}}>{selectedFile ? selectedFile.name : "Click to select CSV or XLSX file"}</div>
              <div style={{fontSize: 10, color: "var(--fg-3)", marginTop: 4}}>Supports: Parts, BOMs, Vendors, Purchase Orders</div>
              <input id="import-file" type="file" accept=".csv,.xlsx,.xls" style={{display: "none"}} onChange={handleFile}/>
            </div>
          </div>
          <button className="btn primary" disabled={!selectedFile || uploading} onClick={startImport}>
            {uploading ? <><span className="spinner" style={{width: 12, height: 12}}/> Importing...</> : <><Icon.Import size={12}/> Start Import</>}
          </button>
        </div>
      </div>

      {jobs.length > 0 && (
        <div className="card">
          <div style={{padding: "10px 16px", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-3)"}}>Import History</div>
          <table className="bom-table">
            <thead><tr><th>File</th><th>Status</th><th>Total</th><th>Processed</th><th>Errors</th><th>Date</th></tr></thead>
            <tbody>
              {jobs.map(j => (
                <tr key={j.id || j.jobId}>
                  <td style={{fontSize: 11}}>{j.filename || "\u2014"}</td>
                  <td><span className={"status " + (j.status === "completed" ? "released" : j.status === "failed" ? "deprecated" : "review")}>{j.status}</span></td>
                  <td className="mono" style={{fontSize: 11}}>{j.totalRows || 0}</td>
                  <td className="mono" style={{fontSize: 11}}>{j.processedRows || 0}</td>
                  <td className="mono" style={{fontSize: 11, color: (j.errorRows || 0) > 0 ? "var(--danger)" : undefined}}>{j.errorRows || 0}</td>
                  <td style={{fontSize: 10, color: "var(--fg-3)"}}>{j.createdAt || "\u2014"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============ ERP CONNECTORS ============
function ERPConnectorsScreen() {
  const [connectors, setConnectors] = React.useState([]);
  const [logs, setLogs] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [showCreate, setShowCreate] = React.useState(false);
  const [form, setForm] = React.useState({ name: "", type: "sap", baseUrl: "", apiKey: "" });
  const [selectedConnector, setSelectedConnector] = React.useState(null);

  const load = React.useCallback(() => {
    setLoading(true);
    window.erpConnectorsAPI?.list().then(r => {
      setConnectors(Array.isArray(r) ? r : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const createConnector = async () => {
    if (!form.name || !form.baseUrl) return;
    try {
      await window.erpConnectorsAPI?.create(form);
      window.toast("Connector created", { kind: "success" });
      setShowCreate(false); setForm({ name: "", type: "sap", baseUrl: "", apiKey: "" });
      load();
    } catch (e) { window.toast("Failed: " + e.message, { kind: "error" }); }
  };

  const testConnection = async (id) => {
    try { await window.erpConnectorsAPI?.testConnection(id); window.toast("Connection successful", { kind: "success" }); }
    catch (e) { window.toast("Connection failed", { kind: "error" }); }
  };

  const syncNow = async (id) => {
    try {
      window.toast("Sync started...", { kind: "info" });
      await window.erpConnectorsAPI?.sync(id);
      window.toast("Sync completed", { kind: "success" });
      if (selectedConnector === id) loadLogs(id);
    } catch (e) { window.toast("Sync failed", { kind: "error" }); }
  };

  const loadLogs = async (id) => {
    setSelectedConnector(id);
    try {
      const r = await window.erpConnectorsAPI?.logs(id);
      setLogs(Array.isArray(r) ? r : []);
    } catch (e) { setLogs([]); }
  };

  const deleteConnector = async (id) => {
    if (!confirm("Delete this connector?")) return;
    try { await window.erpConnectorsAPI?.delete(id); window.toast("Deleted", { kind: "success" }); load(); }
    catch (e) { window.toast("Failed", { kind: "error" }); }
  };

  return (
    <div className="screen-wrap">
      <div className="screen-header">
        <div>
          <h1>ERP Connectors</h1>
          <div className="sub">Sync data with SAP, NetSuite, Oracle, and other ERP systems</div>
        </div>
        <button className="btn primary" onClick={() => setShowCreate(!showCreate)}><Icon.Plus size={12}/> New Connector</button>
      </div>

      {showCreate && (
        <div className="card" style={{marginBottom: 12, padding: 16}}>
          <div style={{display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8}}>
            <input className="twk-field" placeholder="Connector name" value={form.name} onChange={e => setForm({...form, name: e.target.value})}/>
            <select className="twk-field" value={form.type} onChange={e => setForm({...form, type: e.target.value})}>
              <option value="sap">SAP</option>
              <option value="netsuite">NetSuite</option>
              <option value="oracle">Oracle</option>
              <option value="custom">Custom REST</option>
            </select>
            <input className="twk-field" placeholder="Base URL" value={form.baseUrl} onChange={e => setForm({...form, baseUrl: e.target.value})}/>
            <input className="twk-field" placeholder="API Key" value={form.apiKey} onChange={e => setForm({...form, apiKey: e.target.value})}/>
          </div>
          <div style={{display: "flex", gap: 8, marginTop: 8}}>
            <button className="btn primary" onClick={createConnector}><Icon.Check size={12}/> Create</button>
            <button className="btn" onClick={() => setShowCreate(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="card">
        {loading ? <div style={{textAlign: "center", padding: 40}}><span className="spinner"/></div> :
        connectors.length === 0 ? (
          <div style={{textAlign: "center", padding: 40, color: "var(--fg-3)", fontSize: 12}}>No ERP connectors configured. Create one to start syncing.</div>
        ) : (
          <table className="bom-table">
            <thead><tr><th>Name</th><th>Type</th><th>URL</th><th>Status</th><th>Last Sync</th><th>Actions</th></tr></thead>
            <tbody>
              {connectors.map(c => (
                <tr key={c.id}>
                  <td style={{fontWeight: 600, fontSize: 12}}>{c.name}</td>
                  <td><span className="tag-pill" style={{fontSize: 9, textTransform: "uppercase"}}>{c.type}</span></td>
                  <td className="mono" style={{fontSize: 10}}>{c.baseUrl}</td>
                  <td><span className={"status " + (c.active ? "released" : "deprecated")}>{c.active ? "Connected" : "Disabled"}</span></td>
                  <td style={{fontSize: 10, color: "var(--fg-3)"}}>{c.lastSyncAt || "Never"}</td>
                  <td>
                    <div style={{display: "flex", gap: 4}}>
                      <button className="btn small" onClick={() => testConnection(c.id)}><Icon.Link size={10}/> Test</button>
                      <button className="btn small primary" onClick={() => syncNow(c.id)}><Icon.Refresh size={10}/> Sync</button>
                      <button className="btn small" onClick={() => loadLogs(c.id)}><Icon.Doc size={10}/> Logs</button>
                      <button className="btn small" style={{color: "var(--danger)"}} onClick={() => deleteConnector(c.id)}><Icon.Trash size={10}/></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selectedConnector && logs.length > 0 && (
        <div className="card" style={{marginTop: 12}}>
          <div style={{padding: "10px 16px", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-3)"}}>Sync Logs</div>
          <table className="bom-table">
            <thead><tr><th>Direction</th><th>Entity</th><th>Records</th><th>Status</th><th>Time</th></tr></thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id}>
                  <td><span className="tag-pill" style={{fontSize: 9}}>{l.direction}</span></td>
                  <td style={{fontSize: 11}}>{l.entityType}</td>
                  <td className="mono" style={{fontSize: 11}}>{l.recordsCount}</td>
                  <td><span className={"status " + (l.status === "success" ? "released" : "deprecated")}>{l.status}</span></td>
                  <td style={{fontSize: 10, color: "var(--fg-3)"}}>{l.createdAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============ SUPPLIER PORTAL ============
function SupplierPortalScreen() {
  const [users, setUsers] = React.useState([]);
  const [priceUpdates, setPriceUpdates] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [showCreateUser, setShowCreateUser] = React.useState(false);
  const [newUser, setNewUser] = React.useState({ email: "", name: "", vendorId: "" });

  const load = React.useCallback(() => {
    setLoading(true);
    Promise.all([
      window.supplierPortalAPI?.listUsers().catch(() => []),
      window.supplierPortalAPI?.listPriceUpdates().catch(() => []),
    ]).then(([u, p]) => {
      setUsers(Array.isArray(u) ? u : []);
      setPriceUpdates(Array.isArray(p) ? p : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const approve = async (id) => {
    try { await window.supplierPortalAPI?.approvePriceUpdate(id); window.toast("Approved", { kind: "success" }); load(); }
    catch (e) { window.toast("Failed", { kind: "error" }); }
  };

  const reject = async (id) => {
    try { await window.supplierPortalAPI?.rejectPriceUpdate(id); window.toast("Rejected", { kind: "success" }); load(); }
    catch (e) { window.toast("Failed", { kind: "error" }); }
  };

  return (
    <div className="screen-wrap">
      <div className="screen-header">
        <div>
          <h1>Supplier Portal</h1>
          <div className="sub">Manage vendor access and price update submissions</div>
        </div>
        <button className="btn primary" onClick={() => setShowCreateUser(!showCreateUser)}><Icon.Plus size={12}/> Add Supplier User</button>
      </div>

      {showCreateUser && (
        <div className="card" style={{marginBottom: 12, padding: 16}}>
          <div style={{display: "flex", gap: 8}}>
            <input className="twk-field" placeholder="Email" value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})}/>
            <input className="twk-field" placeholder="Name" value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})}/>
            <input className="twk-field" placeholder="Vendor ID" value={newUser.vendorId} onChange={e => setNewUser({...newUser, vendorId: e.target.value})}/>
            <button className="btn primary" onClick={async () => {
              try { await window.supplierPortalAPI?.createUser(newUser); window.toast("User created", { kind: "success" }); setShowCreateUser(false); load(); }
              catch (e) { window.toast("Failed", { kind: "error" }); }
            }}><Icon.Check size={12}/> Create</button>
          </div>
        </div>
      )}

      <div style={{display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12}}>
        <div className="card">
          <div style={{padding: "10px 16px", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-3)"}}>Supplier Users ({users.length})</div>
          {loading ? <div style={{textAlign: "center", padding: 20}}><span className="spinner"/></div> :
          users.length === 0 ? (
            <div style={{padding: 16, textAlign: "center", color: "var(--fg-3)", fontSize: 11}}>No supplier users yet</div>
          ) : (
            <div style={{padding: "0 16px 12px"}}>
              {users.map(u => (
                <div key={u.id} style={{display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--line)"}}>
                  <div>
                    <div style={{fontSize: 12, fontWeight: 500}}>{u.name}</div>
                    <div style={{fontSize: 10, color: "var(--fg-3)"}}>{u.email}</div>
                  </div>
                  <span className={"status " + (u.active ? "released" : "deprecated")} style={{fontSize: 9}}>{u.active ? "Active" : "Inactive"}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div style={{padding: "10px 16px", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-3)"}}>Price Update Submissions ({priceUpdates.length})</div>
          <table className="bom-table">
            <thead><tr><th>Part</th><th>Old Price</th><th>New Price</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead>
            <tbody>
              {priceUpdates.length === 0 ? (
                <tr><td colSpan={6} style={{textAlign: "center", padding: 20, color: "var(--fg-3)", fontSize: 11}}>No price updates submitted</td></tr>
              ) : priceUpdates.map(p => (
                <tr key={p.id}>
                  <td style={{fontSize: 11}}>{p.partId}</td>
                  <td className="mono" style={{fontSize: 11}}>{window.INR(p.oldPrice, 2)}</td>
                  <td className="mono" style={{fontSize: 11}}>{window.INR(p.newPrice, 2)}</td>
                  <td><span className={"status " + (p.status === "approved" ? "released" : p.status === "rejected" ? "deprecated" : "review")}>{p.status}</span></td>
                  <td style={{fontSize: 10, color: "var(--fg-3)"}}>{p.createdAt || "\u2014"}</td>
                  <td>
                    {p.status === "pending" && (
                      <div style={{display: "flex", gap: 4}}>
                        <button className="btn small primary" onClick={() => approve(p.id)}><Icon.Check size={10}/> Approve</button>
                        <button className="btn small" style={{color: "var(--danger)"}} onClick={() => reject(p.id)}><Icon.X size={10}/> Reject</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ============ AI & AUTOMATION ============
function AIFeaturesScreen() {
  const [tab, setTab] = React.useState("forecast");
  const [forecasts, setForecasts] = React.useState([]);
  const [suggestions, setSuggestions] = React.useState([]);
  const [validationResults, setValidationResults] = React.useState([]);
  const [rules, setRules] = React.useState([]);
  const [loading, setLoading] = React.useState(false);

  const loadForecast = React.useCallback(() => {
    setLoading(true);
    window.aiAPI?.demandForecast.list().then(r => {
      setForecasts(Array.isArray(r) ? r : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const loadSuggestions = React.useCallback(() => {
    setLoading(true);
    window.aiAPI?.interchangeability.list().then(r => {
      setSuggestions(Array.isArray(r) ? r : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const loadValidation = React.useCallback(() => {
    setLoading(true);
    window.aiAPI?.validation.results().then(r => {
      setValidationResults(Array.isArray(r) ? r : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const loadRules = React.useCallback(() => {
    setLoading(true);
    window.approvalAutomationAPI?.listRules().then(r => {
      setRules(Array.isArray(r) ? r : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    if (tab === "forecast") loadForecast();
    else if (tab === "interchange") loadSuggestions();
    else if (tab === "validation") loadValidation();
    else if (tab === "automation") loadRules();
  }, [tab]);

  const generateForecast = async () => {
    setLoading(true);
    try { await window.aiAPI?.demandForecast.generate(); window.toast("Forecasts generated", { kind: "success" }); loadForecast(); }
    catch (e) { window.toast("Generation failed", { kind: "error" }); }
    setLoading(false);
  };

  const runValidation = async () => {
    setLoading(true);
    try { await window.aiAPI?.validation.run(); window.toast("Validation complete", { kind: "success" }); loadValidation(); }
    catch (e) { window.toast("Validation failed", { kind: "error" }); }
    setLoading(false);
  };

  const analyzeInterchangeability = async () => {
    setLoading(true);
    try { await window.aiAPI?.interchangeability.analyze(); window.toast("Analysis complete", { kind: "success" }); loadSuggestions(); }
    catch (e) { window.toast("Analysis failed", { kind: "error" }); }
    setLoading(false);
  };

  return (
    <div className="screen-wrap">
      <div className="screen-header">
        <div>
          <h1>AI & Automation</h1>
          <div className="sub">Demand forecasting, part interchangeability, poka-yoke validation, and approval automation</div>
        </div>
      </div>

      <div style={{display: "flex", gap: 4, marginBottom: 12}}>
        {[["forecast", "Demand Forecast"], ["interchange", "Interchangeability"], ["validation", "Validation Rules"], ["automation", "Approval Automation"]].map(([key, label]) => (
          <button key={key} className={"btn" + (tab === key ? " primary" : "")} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>

      {tab === "forecast" && (
        <div className="card">
          <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px"}}>
            <span style={{fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-3)"}}>Demand Forecasts</span>
            <button className="btn primary" onClick={generateForecast} disabled={loading}><Icon.Sparkles size={12}/> Generate from PO History</button>
          </div>
          {loading ? <div style={{textAlign: "center", padding: 40}}><span className="spinner"/></div> :
          forecasts.length === 0 ? (
            <div style={{textAlign: "center", padding: 40, color: "var(--fg-3)", fontSize: 12}}>No forecasts yet. Click "Generate from PO History" to analyze demand patterns.</div>
          ) : (
            <table className="bom-table">
              <thead><tr><th>Part</th><th>Forecast Date</th><th>Predicted Qty</th><th>Confidence</th><th>Model</th></tr></thead>
              <tbody>
                {forecasts.map((f, i) => (
                  <tr key={i}>
                    <td style={{fontSize: 11}}>{f.partId}</td>
                    <td className="mono" style={{fontSize: 11}}>{f.forecastDate}</td>
                    <td className="mono" style={{fontSize: 11}}>{f.predictedQuantity}</td>
                    <td><span className={"status " + (f.confidence >= 0.8 ? "released" : f.confidence >= 0.5 ? "review" : "deprecated")}>{Math.round((f.confidence || 0) * 100)}%</span></td>
                    <td style={{fontSize: 10, color: "var(--fg-3)"}}>{f.model || "po-history"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "interchange" && (
        <div className="card">
          <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px"}}>
            <span style={{fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-3)"}}>Interchangeability Suggestions</span>
            <button className="btn primary" onClick={analyzeInterchangeability} disabled={loading}><Icon.Sparkles size={12}/> Analyze Parts</button>
          </div>
          {loading ? <div style={{textAlign: "center", padding: 40}}><span className="spinner"/></div> :
          suggestions.length === 0 ? (
            <div style={{textAlign: "center", padding: 40, color: "var(--fg-3)", fontSize: 12}}>No suggestions yet. Click "Analyze Parts" to find interchangeable components.</div>
          ) : (
            <table className="bom-table">
              <thead><tr><th>Part A</th><th>Part B</th><th>Similarity</th><th>Reason</th><th>Status</th></tr></thead>
              <tbody>
                {suggestions.map((s, i) => (
                  <tr key={i}>
                    <td style={{fontSize: 11}}>{s.partId1}</td>
                    <td style={{fontSize: 11}}>{s.partId2}</td>
                    <td><div style={{display: "flex", alignItems: "center", gap: 6}}><div style={{width: 50, height: 6, borderRadius: 3, background: "var(--line)"}}><div style={{width: (s.similarity || 0) * 50, height: "100%", borderRadius: 3, background: "var(--accent)"}}/></div><span className="mono" style={{fontSize: 10}}>{Math.round((s.similarity || 0) * 100)}%</span></div></td>
                    <td style={{fontSize: 10, color: "var(--fg-3)"}}>{s.reason}</td>
                    <td><span className={"status " + (s.status === "approved" ? "released" : "review")}>{s.status || "pending"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "validation" && (
        <div className="card">
          <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px"}}>
            <span style={{fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-3)"}}>Poka-yoke Validation Results</span>
            <button className="btn primary" onClick={runValidation} disabled={loading}><Icon.Sparkles size={12}/> Run Validation</button>
          </div>
          {loading ? <div style={{textAlign: "center", padding: 40}}><span className="spinner"/></div> :
          validationResults.length === 0 ? (
            <div style={{textAlign: "center", padding: 40, color: "var(--fg-3)", fontSize: 12}}>No validation results. Click "Run Validation" to check BOMs against poka-yoke rules.</div>
          ) : (
            <table className="bom-table">
              <thead><tr><th>Part</th><th>Rule</th><th>Result</th><th>Message</th><th>Severity</th></tr></thead>
              <tbody>
                {validationResults.map((v, i) => (
                  <tr key={i}>
                    <td style={{fontSize: 11}}>{v.partId}</td>
                    <td style={{fontSize: 11}}>{v.ruleName}</td>
                    <td><span className={"status " + (v.passed ? "released" : "deprecated")}>{v.passed ? "PASS" : "FAIL"}</span></td>
                    <td style={{fontSize: 10, color: "var(--fg-3)"}}>{v.message}</td>
                    <td><span className={"tag-pill"} style={{fontSize: 9, color: v.severity === "critical" ? "var(--danger)" : v.severity === "warning" ? "var(--warn)" : undefined}}>{v.severity}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "automation" && (
        <div className="card">
          <div style={{padding: "10px 16px", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-3)"}}>Approval Automation Rules</div>
          {loading ? <div style={{textAlign: "center", padding: 40}}><span className="spinner"/></div> :
          rules.length === 0 ? (
            <div style={{textAlign: "center", padding: 40, color: "var(--fg-3)", fontSize: 12}}>No automation rules configured. Rules auto-approve requests matching conditions.</div>
          ) : (
            <div style={{padding: "0 16px 12px"}}>
              {rules.map(r => (
                <div key={r.id} style={{display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--line)"}}>
                  <div>
                    <div style={{fontSize: 12, fontWeight: 500}}>{r.name}</div>
                    <div style={{fontSize: 10, color: "var(--fg-3)", fontFamily: "var(--font-mono)"}}>{r.conditions || "No conditions"}</div>
                  </div>
                  <span className={"status " + (r.active ? "released" : "deprecated")} style={{fontSize: 9}}>{r.active ? "Active" : "Disabled"}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============ MONITORING DASHBOARD ============
function MonitoringScreen() {
  const [metrics, setMetrics] = React.useState(null);
  const [health, setHealth] = React.useState(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    setLoading(true);
    Promise.all([
      window.monitoringAPI?.metrics().catch(() => null),
      window.monitoringAPI?.healthDetailed().catch(() => null),
    ]).then(([m, h]) => {
      setMetrics(m); setHealth(h); setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  return (
    <div className="screen-wrap">
      <div className="screen-header">
        <div>
          <h1>System Monitoring</h1>
          <div className="sub">Application health, metrics, and performance</div>
        </div>
        <button className="btn" onClick={() => { setLoading(true); Promise.all([window.monitoringAPI?.metrics(), window.monitoringAPI?.healthDetailed()]).then(([m, h]) => { setMetrics(m); setHealth(h); setLoading(false); }); }}><Icon.Refresh size={12}/> Refresh</button>
      </div>

      {health && (
        <div className="kpi-grid" style={{gridTemplateColumns: "repeat(4, 1fr)", marginBottom: 12}}>
          <div className="kpi"><div className="l">API Status</div><div className="v" style={{color: health.status === "healthy" ? "var(--green, #10b981)" : "var(--danger)"}}>{health.status}</div></div>
          <div className="kpi"><div className="l">Uptime</div><div className="v">{health.uptime || "\u2014"}</div></div>
          <div className="kpi"><div className="l">Memory</div><div className="v">{health.memory?.usedMB || "\u2014"} MB</div></div>
          <div className="kpi"><div className="l">DB</div><div className="v" style={{color: health.database?.status === "connected" ? "var(--green, #10b981)" : "var(--danger)"}}>{health.database?.status || "\u2014"}</div></div>
        </div>
      )}

      {metrics && (
        <div className="card">
          <div style={{padding: "10px 16px", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-3)"}}>Prometheus Metrics</div>
          <pre style={{padding: 16, fontSize: 10, fontFamily: "var(--font-mono)", overflow: "auto", maxHeight: 400, background: "var(--bg-sunk)", borderRadius: "var(--r-2)", margin: "0 16px 16px"}}>{metrics}</pre>
        </div>
      )}

      {!loading && !health && !metrics && (
        <div style={{textAlign: "center", padding: 40, color: "var(--fg-3)", fontSize: 12}}>Monitoring data unavailable. Backend may be offline.</div>
      )}
    </div>
  );
}

// Register screens globally
window.WebhooksScreen = WebhooksScreen;
// ============ ORDER TRACKING (Amazon-style) ============
function OrderTrackingScreen() {
  const [trackings, setTrackings] = React.useState([]);
  const [stats, setStats] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [selectedTracking, setSelectedTracking] = React.useState(null);
  const [detailData, setDetailData] = React.useState(null);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [stageFilter, setStageFilter] = React.useState("all");

  const STAGE_ICONS = {
    order_placed: "\u{1F4CB}", confirmed: "\u2705", processing: "\u2699\uFE0F",
    packed: "\u{1F4E6}", shipped: "\u{1F69A}", in_transit: "\u{1F310}",
    out_for_delivery: "\u{1F4CD}", delivered: "\u{1F3E0}", completed: "\u{1F389}",
  };

  const STAGE_COLORS = {
    order_placed: "#6b7280", confirmed: "#3b82f6", processing: "#8b5cf6",
    packed: "#f59e0b", shipped: "#e85d1f", in_transit: "#06b6d4",
    out_for_delivery: "#10b981", delivered: "#22c55e", completed: "#15803d",
  };

  const STAGE_LABELS = {
    order_placed: "Order Placed", confirmed: "Confirmed", processing: "Processing",
    packed: "Packed", shipped: "Shipped", in_transit: "In Transit",
    out_for_delivery: "Out for Delivery", delivered: "Delivered", completed: "Completed",
  };

  const load = React.useCallback(() => {
    setLoading(true);
    Promise.all([
      window.orderTrackingAPI?.list({ limit: 200 }).catch(() => ({ total: 0, items: [] })),
      window.orderTrackingAPI?.stats().catch(() => null),
    ]).then(([list, st]) => {
      setTrackings(list.items || []);
      setStats(st);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const loadDetail = async (id) => {
    try {
      const detail = await window.orderTrackingAPI?.get(id);
      setDetailData(detail);
      setSelectedTracking(id);
    } catch (e) { window.toast?.("Failed to load tracking details", { kind: "error" }); }
  };

  const advanceStage = async (id) => {
    try {
      const result = await window.orderTrackingAPI?.advance(id);
      window.toast?.(result.message, { kind: "success" });
      load();
      if (selectedTracking === id) loadDetail(id);
    } catch (e) { window.toast?.("Failed to advance", { kind: "error" }); }
  };

  const filtered = React.useMemo(() => {
    let r = trackings;
    if (stageFilter !== "all") r = r.filter(t => t.currentStage === stageFilter);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      r = r.filter(t =>
        (t.po?.poNumber || "").toLowerCase().includes(q) ||
        (t.po?.vendorName || "").toLowerCase().includes(q) ||
        (t.trackingNumber || "").toLowerCase().includes(q)
      );
    }
    return r;
  }, [trackings, stageFilter, searchQuery]);

  // Detail view with Amazon-style timeline
  if (selectedTracking && detailData) {
    return (
      <div className="screen-wrap">
        <div className="screen-header">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button className="btn" onClick={() => { setSelectedTracking(null); setDetailData(null); }}><Icon.ChevronLeft size={14}/> Back</button>
            <div>
              <h1>{detailData.po?.poNumber || "Order Tracking"}</h1>
              <div className="sub">{detailData.po?.vendorName} \u00B7 {detailData.po?.project || ""}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {detailData.currentStage !== "completed" && detailData.currentStage !== "delivered" && (
              <button className="btn primary" onClick={() => advanceStage(detailData.id)}><Icon.ChevronRight size={12}/> Advance Stage</button>
            )}
          </div>
        </div>

        {/* Status Banner */}
        <div style={{
          background: STAGE_COLORS[detailData.currentStage] || "#6b7280",
          color: "white", padding: "16px 20px", borderRadius: "var(--r-2)",
          marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center"
        }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{STAGE_ICONS[detailData.currentStage] || "\u{1F4E6}"} {STAGE_LABELS[detailData.currentStage] || detailData.currentStage}</div>
            {detailData.estimatedDelivery && (
              <div style={{ fontSize: 12, opacity: 0.9, marginTop: 4 }}>
                {detailData.currentStage === "delivered" || detailData.currentStage === "completed"
                  ? "Delivered on " + (detailData.actualDelivery || detailData.estimatedDelivery)
                  : "Expected delivery: " + detailData.estimatedDelivery
                }
              </div>
            )}
          </div>
          {detailData.trackingNumber && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, opacity: 0.7 }}>TRACKING</div>
              <div className="mono" style={{ fontSize: 13, fontWeight: 600 }}>{detailData.trackingNumber}</div>
            </div>
          )}
        </div>

        {/* Amazon-style milestone progress bar */}
        <div className="card" style={{ padding: "20px 16px", marginBottom: 16 }}>
          <div style={{ position: "relative", display: "flex", justifyContent: "space-between", padding: "0 8px" }}>
            {/* Progress line */}
            <div style={{ position: "absolute", top: 14, left: 20, right: 20, height: 3, background: "var(--line)", borderRadius: 2 }}/>
            <div style={{
              position: "absolute", top: 14, left: 20, height: 3, borderRadius: 2, transition: "width 0.5s ease",
              width: `calc(${(detailData.milestones || []).filter(m => m.completed).length / Math.max((detailData.milestones || []).length - 1, 1) * 100}% - 40px)`,
              background: STAGE_COLORS[detailData.currentStage] || "#e85d1f",
            }}/>
            {(detailData.milestones || []).filter(m => m.stage !== "completed").map((m, i, arr) => {
              const isActive = m.stage === detailData.currentStage;
              const isCompleted = m.completed;
              const progress = isCompleted ? 100 : isActive ? 50 : 0;
              return (
                <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", zIndex: 1, flex: 1 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontWeight: 700, border: "2px solid " + (isCompleted || isActive ? STAGE_COLORS[detailData.currentStage] : "var(--line)"),
                    background: isCompleted ? STAGE_COLORS[detailData.currentStage] : isActive ? STAGE_COLORS[detailData.currentStage] + "22" : "var(--bg)",
                    color: isCompleted ? "white" : isActive ? STAGE_COLORS[detailData.currentStage] : "var(--fg-3)",
                    boxShadow: isActive ? "0 0 0 4px " + STAGE_COLORS[detailData.currentStage] + "33" : "none",
                  }}>
                    {isCompleted ? "\u2714" : (i + 1)}
                  </div>
                  <div style={{
                    fontSize: 8, marginTop: 6, textAlign: "center", fontWeight: isActive ? 700 : 400,
                    color: isCompleted || isActive ? "var(--fg)" : "var(--fg-3)",
                    maxWidth: 60,
                  }}>{m.label}</div>
                  {m.completedAt && (
                    <div style={{ fontSize: 7, color: "var(--fg-4)", marginTop: 2 }}>
                      {m.completedAt.split(" ")[0] || m.completedAt.slice(0, 10)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Shipment Updates Timeline */}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
          <div className="card">
            <div style={{ padding: "10px 16px", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-3)" }}>
              Shipment Updates ({(detailData.shipmentUpdates || []).length})
            </div>
            {(detailData.shipmentUpdates || []).length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "var(--fg-3)", fontSize: 11 }}>No shipment updates yet</div>
            ) : (
              <div style={{ padding: "0 16px 12px" }}>
                {detailData.shipmentUpdates.map((u, i) => (
                  <div key={u.id} style={{ display: "flex", gap: 12, padding: "10px 0", borderBottom: i < detailData.shipmentUpdates.length - 1 ? "1px solid var(--line)" : "none" }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: i === 0 ? "#e85d1f" : "var(--line)", marginTop: 4, flexShrink: 0 }}/>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 11, fontWeight: 600 }}>{u.status}</span>
                        <span style={{ fontSize: 9, color: "var(--fg-4)" }}>{u.timestamp || u.createdAt || "\u2014"}</span>
                      </div>
                      {u.location && <div style={{ fontSize: 10, color: "var(--fg-3)", marginTop: 2 }}>{u.location}</div>}
                      {u.description && <div style={{ fontSize: 10, color: "var(--fg-3)", marginTop: 2 }}>{u.description}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Order Details Sidebar */}
          <div>
            <div className="card" style={{ padding: 16, marginBottom: 12 }}>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-3)", marginBottom: 8 }}>Order Details</div>
              <div style={{ display: "grid", gap: 8 }}>
                <div><div style={{ fontSize: 9, color: "var(--fg-4)" }}>Amount</div><div style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)" }}>{window.INR?.(detailData.po?.poTotal, 0) || "\u2014"}</div></div>
                <div><div style={{ fontSize: 9, color: "var(--fg-4)" }}>Carrier</div><div style={{ fontSize: 11 }}>{detailData.carrier || "\u2014"}</div></div>
                <div><div style={{ fontSize: 9, color: "var(--fg-4)" }}>Tracking #</div><div className="mono" style={{ fontSize: 10 }}>{detailData.trackingNumber || "\u2014"}</div></div>
                <div><div style={{ fontSize: 9, color: "var(--fg-4)" }}>Ship To</div><div style={{ fontSize: 10 }}>{detailData.shippingAddress || "\u2014"}</div></div>
                {detailData.notes && <div><div style={{ fontSize: 9, color: "var(--fg-4)" }}>Notes</div><div style={{ fontSize: 10 }}>{detailData.notes}</div></div>}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // List view
  return (
    <div className="screen-wrap">
      <div className="screen-header">
        <div>
          <h1>Order Tracking</h1>
          <div className="sub">{loading ? "Loading..." : `${filtered.length} orders being tracked \u00B7 ${stats?.overdue || 0} overdue`}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div className="search" style={{ width: 220, height: 32 }}>
            <Icon.Search size={12}/>
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search by PO, vendor, tracking..."/>
          </div>
          <select className="twk-field" style={{ width: 160, height: 32, fontSize: 11 }} value={stageFilter} onChange={e => setStageFilter(e.target.value)}>
            <option value="all">All Stages</option>
            {Object.entries(STAGE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>

      {/* Stage Summary Cards */}
      {stats && (
        <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(5, 1fr)", marginBottom: 14 }}>
          {["order_placed", "shipped", "in_transit", "delivered", "completed"].map(stage => (
            <div key={stage} className="kpi" style={{ cursor: "pointer", borderLeft: "3px solid " + STAGE_COLORS[stage] }} onClick={() => setStageFilter(stage)}>
              <div className="l">{STAGE_LABELS[stage]}</div>
              <div className="v" style={{ color: STAGE_COLORS[stage] }}>{stats.byStage?.[stage] || 0}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tracking Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: 12 }}>
        {loading ? (
          <div style={{ gridColumn: "1/-1", textAlign: "center", padding: 40 }}><span className="spinner"/></div>
        ) : filtered.length === 0 ? (
          <div style={{ gridColumn: "1/-1", textAlign: "center", padding: 40, color: "var(--fg-3)", fontSize: 12 }}>No orders match your filters</div>
        ) : filtered.map(t => {
          const completedStages = (t.milestones || []).filter(m => m.completed).length;
          const totalStages = (t.milestones || []).length || 9;
          const progress = totalStages > 0 ? (completedStages / totalStages) * 100 : 0;
          return (
            <div key={t.id} onClick={() => loadDetail(t.id)} style={{
              background: "var(--bg-elev)", border: "1px solid var(--line)", borderRadius: "var(--r-2)",
              padding: 16, cursor: "pointer", transition: "border-color 0.15s, box-shadow 0.15s",
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--line)"; e.currentTarget.style.boxShadow = "none"; }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{t.po?.poNumber || "PO-" + t.poHeaderId}</div>
                  <div style={{ fontSize: 11, color: "var(--fg-3)", marginTop: 2 }}>{t.po?.vendorName || "Unknown Vendor"}</div>
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 12,
                  background: STAGE_COLORS[t.currentStage] + "22", color: STAGE_COLORS[t.currentStage],
                }}>{STAGE_LABELS[t.currentStage] || t.currentStage}</span>
              </div>

              {/* Mini progress bar */}
              <div style={{ height: 4, borderRadius: 2, background: "var(--line)", marginBottom: 8 }}>
                <div style={{ height: "100%", borderRadius: 2, width: progress + "%", background: STAGE_COLORS[t.currentStage], transition: "width 0.3s" }}/>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 10, color: "var(--fg-4)" }}>
                  {completedStages}/{totalStages - 1} stages
                  {t.estimatedDelivery && " \u00B7 ETA: " + t.estimatedDelivery}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--accent)" }}>{window.INR?.(t.po?.poTotal, 0) || "\u2014"}</div>
              </div>
              {t.trackingNumber && (
                <div style={{ fontSize: 9, color: "var(--fg-4)", marginTop: 6 }}>
                  <Icon.Link size={9}/> <span className="mono">{t.trackingNumber}</span> \u00B7 {t.carrier || ""}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

window.BulkImportScreen = BulkImportScreen;
window.ERPConnectorsScreen = ERPConnectorsScreen;
window.SupplierPortalScreen = SupplierPortalScreen;
window.AIFeaturesScreen = AIFeaturesScreen;
window.MonitoringScreen = MonitoringScreen;
window.OrderTrackingScreen = OrderTrackingScreen;
