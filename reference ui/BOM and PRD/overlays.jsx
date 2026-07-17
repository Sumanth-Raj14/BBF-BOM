// Toasts, Modals, Popovers, App context — shared UI primitives.

// ============ APP CONTEXT ============
// All cross-screen mutable state lives here. Components consume via
// `const ctx = window.useAppStore();` and call ctx.setRows etc.
const AppCtx = React.createContext(null);
window.AppCtx = AppCtx;
window.useAppStore = () => React.useContext(AppCtx);

// ============ TOASTS ============
function ToastHost() {
  const [toasts, setToasts] = React.useState([]);
  const idRef = React.useRef(0);

  React.useEffect(() => {
    window.toast = (msg, opts = {}) => {
      const id = ++idRef.current;
      const t = {
        id,
        msg,
        kind: opts.kind || "info",
        action: opts.action,
        duration: opts.duration ?? 3400,
      };
      setToasts((arr) => [...arr, t]);
      if (t.duration > 0) {
        setTimeout(() => setToasts((arr) => arr.filter((x) => x.id !== id)), t.duration);
      }
      return id;
    };
    window.toast.dismiss = (id) =>
      setToasts((arr) => arr.filter((x) => x.id !== id));
    return () => { delete window.toast; };
  }, []);

  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <div key={t.id} className={"toast " + t.kind}>
          <span className="ico">
            {t.kind === "success" ? <Icon.Check size={14}/> :
             t.kind === "warn" ? <Icon.Bell size={14}/> :
             t.kind === "error" ? <Icon.X size={14}/> :
             <Icon.Sparkles size={14}/>}
          </span>
          <span className="msg">{t.msg}</span>
          {t.action && (
            <button className="action" onClick={() => { t.action.onClick(); window.toast.dismiss(t.id); }}>
              {t.action.label}
            </button>
          )}
          <button className="x" onClick={() => window.toast.dismiss(t.id)}>
            <Icon.X size={11}/>
          </button>
        </div>
      ))}
    </div>
  );
}

// ============ MODAL ============
function Modal({ open, onClose, icon, title, subtitle, footer, wide, children }) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={"modal " + (wide ? "wide" : "")} onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          {icon && <div className="icn">{icon}</div>}
          <div style={{flex: 1, minWidth: 0}}>
            <h2>{title}</h2>
            {subtitle && <div className="sub">{subtitle}</div>}
          </div>
          <button className="close" onClick={onClose}><Icon.X size={14}/></button>
        </div>
        <div className="modal-b">{children}</div>
        {footer && <div className="modal-f">{footer}</div>}
      </div>
    </div>
  );
}

// ============ POPOVER ============
// Anchored to a button. `anchorRef` is the element to position next to.
// `align`: "left" | "right" (default right of anchor)
function Popover({ open, onClose, anchorRef, align = "right", width = 280, children }) {
  const [pos, setPos] = React.useState(null);

  React.useEffect(() => {
    if (!open) return;
    const place = () => {
      const a = anchorRef?.current;
      if (!a) return;
      const r = a.getBoundingClientRect();
      const top = r.bottom + 6;
      const left = align === "right" ? r.right - width : r.left;
      setPos({ top, left });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, anchorRef, align, width]);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      const a = anchorRef?.current;
      if (a && a.contains(e.target)) return;
      const popEls = document.querySelectorAll(".popover");
      for (const el of popEls) if (el.contains(e.target)) return;
      onClose();
    };
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    setTimeout(() => {
      window.addEventListener("mousedown", onDown);
      window.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, anchorRef]);

  if (!open || !pos) return null;
  return ReactDOM.createPortal(
    <div className="popover" style={{ top: pos.top, left: Math.max(8, pos.left), width }}>
      {children}
    </div>,
    document.body
  );
}

// Smart dropdown attached to a trigger button
function DropdownButton({ trigger, items, align = "right", width = 220, popClass = "" }) {
  const ref = React.useRef(null);
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <span ref={ref} onClick={() => setOpen(o => !o)} style={{display: "inline-flex"}}>{trigger}</span>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={ref} align={align} width={width}>
        <div className={popClass}>
          {items.map((it, i) => {
            if (it === "divider") return <div key={i} className="popover-divider"/>;
            if (it.header) return <div key={i} className="popover-h"><span className="t">{it.header}</span></div>;
            return (
              <button
                key={i}
                className={"popover-item " + (it.danger ? "danger" : "")}
                onClick={() => { setOpen(false); it.onClick && it.onClick(); }}
              >
                {it.icon && <span className="ic">{it.icon}</span>}
                <span className="lbl">{it.label}</span>
                {it.kbd && <span className="kbd">{it.kbd}</span>}
                {it.checked && <Icon.Check size={11}/>}
              </button>
            );
          })}
        </div>
      </Popover>
    </>
  );
}

window.ToastHost = ToastHost;
window.Modal = Modal;
window.Popover = Popover;
window.DropdownButton = DropdownButton;

// ============ Pre-baked modal contents ============

function NewPOModal({ open, onClose }) {
  const [vendor, setVendor] = React.useState("Mean Well");
  const [vendorId, setVendorId] = React.useState(1);
  const [eta, setEta] = React.useState("2026-06-12");
  const [items, setItems] = React.useState([
    { pn: "EL-PSU-240W", partId: 2, qty: 25, cost: 84.00 },
  ]);
  const [submitting, setSubmitting] = React.useState(false);
  const total = items.reduce((s, i) => s + i.qty * i.cost, 0);

  const vendors = window.BOM_DATA?.vendors || [];

  const submit = async () => {
    setSubmitting(true);
    try {
      for (const item of items) {
        if (window.api?.procurement?.create) {
          await window.api.procurement.create({
            partId: item.partId || 1,
            vendorId: vendorId,
            qty: item.qty,
            unitCost: item.cost,
            totalCost: item.qty * item.cost,
            eta: eta,
          });
        }
      }
      onClose();
      window.toast(`PO created \u00B7 ${vendor} \u00B7 ${window.INR(total, 2)}`, {
        kind: "success",
        action: { label: "View", onClick: () => window.__nav?.("procurement") },
      });
    } catch (err) {
      window.toast("Failed to create PO: " + err.message, { kind: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Cart size={16}/>}
      title="New Purchase Order"
      subtitle="Create a new purchase order"
      footer={
        <>
          <span className="left">Items: {items.length} \u00B7 Total: {window.INR(total, 2)}</span>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={submit} disabled={submitting}>{submitting ? "Creating..." : "Create PO"}</button>
        </>
      }
    >
      <div className="field-row">
        <div className="field">
          <label>Vendor <span className="req">*</span></label>
          <select className="select" value={vendorId} onChange={e => {
            const v = vendors.find(v => v.id === Number(e.target.value));
            setVendorId(Number(e.target.value));
            if (v) setVendor(v.name);
          }}>
            {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Required by</label>
          <input className="input mono" value={eta} onChange={e => setEta(e.target.value)}/>
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label>Project</label>
          <select className="select"><option>ATLAS · Mainframe</option><option>HORIZON · Sensor Pod</option></select>
        </div>
        <div className="field">
          <label>Currency</label>
          <select className="select"><option>USD</option><option>EUR</option><option>JPY</option><option>CNY</option></select>
        </div>
      </div>

      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", margin:"16px 0 8px"}}>
        <span style={{fontFamily:"var(--font-mono)", fontSize:10, textTransform:"uppercase", letterSpacing:"0.06em", color:"var(--fg-3)"}}>Line items</span>
        <button className="btn small" onClick={() => setItems([...items, { pn: "", qty: 1, cost: 0 }])}><Icon.Plus size={11}/> Add line</button>
      </div>
      <div style={{border: "1px solid var(--line)", borderRadius: "var(--r-2)", overflow:"hidden"}}>
        <table className="bom-table" style={{tableLayout:"auto"}}>
          <thead>
            <tr>
              <th style={{paddingLeft: 12}}>Part No.</th>
              <th className="num">Qty</th>
              <th className="num">Unit</th>
              <th className="num">Ext.</th>
              <th style={{width: 30}}></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i}>
                <td style={{paddingLeft: 12}}>
                  <input className="input mono" style={{height: 26, fontSize: 11}} value={it.pn} onChange={e => { const n = [...items]; n[i].pn = e.target.value; setItems(n); }}/>
                </td>
                <td className="num">
                  <input className="input mono" style={{height: 26, fontSize: 11, textAlign: "right"}} type="number" value={it.qty} onChange={e => { const n = [...items]; n[i].qty = +e.target.value || 0; setItems(n); }}/>
                </td>
                <td className="num">
                  <input className="input mono" style={{height: 26, fontSize: 11, textAlign: "right"}} type="number" step="0.01" value={it.cost} onChange={e => { const n = [...items]; n[i].cost = +e.target.value || 0; setItems(n); }}/>
                </td>
                <td className="num mono" style={{fontWeight: 600}}>{window.INR((it.qty * it.cost), 2)}</td>
                <td><button className="icon-btn" style={{width: 22, height: 22}} onClick={() => setItems(items.filter((_, j) => j !== i))}><Icon.X size={11}/></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="field" style={{marginTop: 14}}>
        <label>Notes</label>
        <textarea className="input" placeholder="Internal notes for vendor or finance…"/>
      </div>
    </Modal>
  );
}

function NewVendorModal({ open, onClose }) {
  const [form, setForm] = React.useState({});
  const [saving, setSaving] = React.useState(false);
  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const countryMap = { "United States": "US", "China": "CN", "Japan": "JP", "Germany": "DE", "Taiwan": "TW" };

  const submit = async () => {
    if (!form.name) {
      window.toast("Vendor name is required", { kind: "warn" });
      return;
    }
    setSaving(true);
    try {
      if (window.apiConnected !== false) {
        await window.api.vendors.create({
          name: form.name,
          country: countryMap[form.country] || form.country || "US",
          leadTime: parseInt(form.leadTime) || 14,
          moq: parseInt(form.moq) || 1,
          terms: form.terms || "Net 30",
          reliabilityRating: 4.0,
        });
        window.toast("Vendor added to database", { kind: "success" });
      } else {
        window.toast("Vendor added (mock mode)", { kind: "success" });
      }
    } catch (e) {
      window.toast("Failed to add vendor: " + e.message, { kind: "error" });
    }
    setSaving(false);
    setForm({});
    onClose();
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Vendor size={16}/>}
      title="Add Vendor"
      subtitle="Will be sent for procurement approval"
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={submit} disabled={saving}>{saving ? "Adding..." : "Add vendor"}</button>
        </>
      }
    >
      <div className="field-row">
        <div className="field"><label>Vendor name <span className="req">*</span></label><input className="input" placeholder="e.g. Acme Components" onChange={e => update("name", e.target.value)}/></div>
        <div className="field"><label>Country</label><select className="select" onChange={e => update("country", e.target.value)}><option>United States</option><option>China</option><option>Japan</option><option>Germany</option><option>Taiwan</option></select></div>
      </div>
      <div className="field-row">
        <div className="field"><label>Lead time (days)</label><input className="input mono" type="number" defaultValue={14} onChange={e => update("leadTime", e.target.value)}/></div>
        <div className="field"><label>MOQ</label><input className="input mono" type="number" defaultValue={1} onChange={e => update("moq", e.target.value)}/></div>
      </div>
      <div className="field-row">
        <div className="field"><label>Payment terms</label><select className="select" onChange={e => update("terms", e.target.value)}><option>Net 30</option><option>Net 45</option><option>Net 60</option><option>Prepaid</option></select></div>
      </div>
      <div className="field"><label>Notes</label><textarea className="input" placeholder="Sourcing history, quality..." onChange={e => update("notes", e.target.value)}/></div>
    </Modal>
  );
}

function UploadModal({ open, onClose, title = "Upload document", files: externalFiles }) {
  const [active, setActive] = React.useState(false);
  const [files, setFiles] = React.useState([]);
  const [fileObjects, setFileObjects] = React.useState([]);
  const [uploading, setUploading] = React.useState(false);
  const [category, setCategory] = React.useState("Datasheet");
  const fileInputRef = React.useRef(null);
  React.useEffect(() => {
    if (open && externalFiles?.length) {
      setFiles(prev => {
        const names = externalFiles.map(f => f.name || f);
        const merged = [...prev];
        names.forEach(n => { if (!merged.includes(n)) merged.push(n); });
        return merged;
      });
    }
  }, [open, externalFiles]);
  const onDrop = (e) => {
    e.preventDefault(); setActive(false);
    const droppedFiles = [...(e.dataTransfer?.files || [])];
    if (droppedFiles.length) {
      setFiles([...files, ...droppedFiles.map(f => f.name)]);
      setFileObjects([...fileObjects, ...droppedFiles]);
    } else {
      setFiles([...files, "Datasheet_STM32H743.pdf"]);
    }
  };
  const handleFileSelect = (e) => {
    const selected = [...(e.target?.files || [])];
    if (selected.length) {
      setFiles([...files, ...selected.map(f => f.name)]);
      setFileObjects([...fileObjects, ...selected]);
    }
    e.target.value = "";
  };
  const submit = async () => {
    setUploading(true);
    try {
      if (fileObjects.length > 0 && window.api?.documents?.upload) {
        for (const file of fileObjects) {
          await window.api.documents.upload(file, { category });
        }
        window.toast(`${files.length} file(s) uploaded`, { kind: "success" });
      } else {
        window.toast(`${files.length || 1} file(s) uploaded \u00B7 OCR queued`, {
          kind: "success",
          action: { label: "Open OCR", onClick: () => window.__nav?.("ocr") },
        });
      }
      onClose();
      setFiles([]);
      setFileObjects([]);
    } catch (err) {
      window.toast("Upload failed: " + err.message, { kind: "error" });
    } finally {
      setUploading(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={() => { setFiles([]); onClose(); }}
      icon={<Icon.Import size={16}/>}
      title={title}
      subtitle="PDF · DWG · STEP · XLSX · ZIP · max 200 MB"
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={submit} disabled={uploading}>{uploading ? "Uploading..." : `Upload ${files.length > 0 ? `(${files.length})` : ""}`}</button>
        </>
      }
    >
      <input ref={fileInputRef} type="file" multiple style={{display:"none"}} onChange={handleFileSelect}/>
      <div
        className={"dropzone " + (active ? "active" : "")}
        onDragOver={(e) => { e.preventDefault(); setActive(true); }}
        onDragLeave={() => setActive(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="big">⤓</div>
        <div className="l1">Drop files here or click to browse (multi-select)</div>
        <div className="l2">Auto-tagged · OCR extracts specs from datasheets</div>
      </div>
      {files.length > 0 && (
        <div style={{marginTop: 14}}>
          {files.map((f, i) => (
            <div key={i} style={{display:"flex", alignItems:"center", gap: 10, padding:"8px 10px", border:"1px solid var(--line)", borderRadius:"var(--r-2)", marginBottom: 6, background:"var(--bg-elev)"}}>
              <span style={{fontFamily:"var(--font-mono)", fontSize: 9, padding:"2px 4px", background:"var(--fg)", color:"var(--bg)", borderRadius: 2, letterSpacing:"0.06em"}}>{f.split(".").pop().toUpperCase()}</span>
              <span style={{flex: 1, fontFamily:"var(--font-mono)", fontSize: 11}}>{f}</span>
              <span style={{fontFamily:"var(--font-mono)", fontSize: 10, color:"var(--ok)"}}>READY</span>
              <button className="icon-btn" style={{width: 22, height: 22}} onClick={() => setFiles(files.filter((_, j) => j !== i))}><Icon.X size={11}/></button>
            </div>
          ))}
        </div>
      )}
      <div className="field-row" style={{marginTop: 14}}>
        <div className="field"><label>Document type</label><select className="select" value={category} onChange={e => setCategory(e.target.value)}><option>Datasheet</option><option>Drawing</option><option>Quote</option><option>Compliance</option><option>Test</option><option>CAD</option></select></div>
        <div className="field"><label>Attach to</label><select className="select"><option>Project ATLAS</option><option>Selected part</option><option>Vendor: Mean Well</option></select></div>
      </div>
    </Modal>
  );
}

function NewPartModal({ open, onClose }) {
  const [form, setForm] = React.useState({});
  const [saving, setSaving] = React.useState(false);
  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.pn || !form.name) {
      window.toast("Part number and name are required", { kind: "warn" });
      return;
    }
    setSaving(true);
    try {
      if (window.apiConnected !== false) {
        await window.api.parts.create({
          pn: form.pn,
          name: form.name,
          rev: form.rev || "A",
          qty: 1,
          uom: form.uom || "EA",
          category: form.category || "Electrical",
          subCategory: form.subCategory || "",
          status: form.status || "Draft",
          barcode: form.barcode || null,
          manufacturer: form.manufacturer || "",
          origin: form.origin || "",
          material: form.material || "",
          weight: form.weight ? parseFloat(form.weight) : null,
          dimensions: form.dimensions || "",
          imageUrl: form.imageUrl || null,
          description: form.description || "",
        });
        window.toast("Part created in database", { kind: "success" });
      } else {
        window.toast("Part created (mock mode)", { kind: "success" });
      }
    } catch (e) {
      window.toast("Failed to create part: " + e.message, { kind: "error" });
    }
    setSaving(false);
    setForm({});
    onClose();
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Parts size={16}/>}
      title="New component"
      subtitle="Add a new part to the library"
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={submit} disabled={saving}>{saving ? "Creating..." : "Create part"}</button>
        </>
      }
    >
      <div className="field-row">
        <div className="field"><label>Part number <span className="req">*</span></label><input className="input mono" placeholder="e.g. EL-CAP-100UF-25V" onChange={e => update("pn", e.target.value)}/></div>
        <div className="field"><label>Revision</label><input className="input mono" defaultValue="A" onChange={e => update("rev", e.target.value)}/></div>
      </div>
      <div className="field"><label>Name <span className="req">*</span></label><input className="input" placeholder="e.g. Capacitor, 100µF 25V Electrolytic" onChange={e => update("name", e.target.value)}/></div>
      <div className="field-row-3">
        <div className="field"><label>Category</label><select className="select" onChange={e => update("category", e.target.value)}><option>Electrical</option><option>Mechanical</option><option>Optical</option><option>Cable</option><option>Hardware</option><option>Assembly</option></select></div>
        <div className="field"><label>Sub-category</label><input className="input" placeholder="e.g. IC, Connector" onChange={e => update("subCategory", e.target.value)}/></div>
        <div className="field"><label>UoM</label><select className="select" onChange={e => update("uom", e.target.value)}><option>EA</option><option>M</option><option>KG</option><option>L</option></select></div>
      </div>
      <div className="field-row">
        <div className="field"><label>Status</label><select className="select" onChange={e => update("status", e.target.value)}><option>Draft</option><option>Review</option><option>Released</option></select></div>
        <div className="field"><label>Barcode</label><input className="input mono" placeholder="e.g. 8901234567890" onChange={e => update("barcode", e.target.value)}/></div>
      </div>
      <div className="field-row">
        <div className="field"><label>Manufacturer</label><input className="input" onChange={e => update("manufacturer", e.target.value)}/></div>
        <div className="field"><label>Origin</label><select className="select" onChange={e => update("origin", e.target.value)}><option>US</option><option>CN</option><option>JP</option><option>DE</option><option>TW</option><option>FR</option></select></div>
      </div>
      <div className="field-row">
        <div className="field"><label>Material</label><input className="input" placeholder="e.g. Aluminum 6061-T6" onChange={e => update("material", e.target.value)}/></div>
        <div className="field"><label>Weight (g)</label><input className="input mono" type="number" step="0.1" placeholder="e.g. 45" onChange={e => update("weight", e.target.value)}/></div>
      </div>
      <div className="field-row">
        <div className="field"><label>Dimensions</label><input className="input mono" placeholder="e.g. 120 × 80 × 12 mm" onChange={e => update("dimensions", e.target.value)}/></div>
        <div className="field"><label>Image URL</label><input className="input mono" placeholder="https://..." onChange={e => update("imageUrl", e.target.value)}/></div>
      </div>
      <div className="field"><label>Description</label><textarea className="input" placeholder="Brief description, key specs..." onChange={e => update("description", e.target.value)}/></div>
    </Modal>
  );
}

function ConfirmModal({ open, onClose, title, body, danger, onConfirm, confirmLabel = "Confirm" }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={danger ? <Icon.Flag size={16}/> : <Icon.Check size={16}/>}
      title={title}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className={"btn " + (danger ? "" : "primary")} onClick={() => { onClose(); onConfirm && onConfirm(); }} style={danger ? {background: "var(--danger)", color: "white", borderColor: "var(--danger)"} : {}}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <div style={{fontSize: 13, color: "var(--fg-2)", lineHeight: 1.5}}>{body}</div>
    </Modal>
  );
}

Object.assign(window, { NewPOModal, NewVendorModal, UploadModal, NewPartModal, ConfirmModal });

// ============ FIND ALTERNATES ============
function FindAlternatesModal({ open, onClose, row }) {
  const [selected, setSelected] = React.useState(null);
  React.useEffect(() => { if (open) setSelected(null); }, [open]);
  if (!open || !row || !row.pn) return null;
  const baseCost = row.cost || 10;
  const alts = [
    { pn: row.pn.replace(/-([A-Z])$/, "-B") + "-A", name: row.name + " (alt)", vendor: "Mouser", cost: baseCost * 1.04, lead: Math.max(2, (row.lead || 14) - 4), origin: "US", stock: "1,240 in stock", rating: 4.7 },
    { pn: row.pn + "-CN", name: row.name + " (compatible)", vendor: "LCSC", cost: baseCost * 0.74, lead: (row.lead || 14) + 7, origin: "CN", stock: "8,500 in stock", rating: 4.1 },
    { pn: row.pn.slice(0, -1) + "X", name: row.name + " (premium)", vendor: "Digi-Key", cost: baseCost * 1.18, lead: Math.max(2, (row.lead || 14) - 7), origin: "US", stock: "320 in stock", rating: 4.8 },
  ];

  const apply = () => {
    const alt = alts.find(a => a.pn === selected);
    onClose();
    window.toast(`${row.pn} → ${alt.pn} swapped`, {
      kind: "success",
      action: { label: "Undo", onClick: () => window.toast("Reverted to " + row.pn) },
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Search size={16}/>}
      title="Find alternates"
      subtitle={row.pn + " · " + row.name}
      wide
      footer={
        <>
          <span className="left">{alts.length} alternates · 1 cheaper · 1 faster · 1 higher quality</span>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!selected} onClick={apply} style={{opacity: selected ? 1 : 0.5}}>
            <Icon.Check size={12}/> Swap to selected
          </button>
        </>
      }
    >
      {/* Current part — pinned for comparison */}
      <div style={{padding: "10px 12px", background: "var(--bg-sunk)", border: "1px solid var(--line)", borderRadius: "var(--r-2)", marginBottom: 14}}>
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 6}}>
          <div>
            <div style={{fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)"}}>CURRENT</div>
            <div style={{fontWeight: 600, fontSize: 13}}>{row.pn} · {row.name}</div>
          </div>
        </div>
        <div style={{display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap: 16, fontFamily:"var(--font-mono)", fontSize: 11}}>
          <div><span style={{color:"var(--fg-3)"}}>Cost </span>{window.INR((row.cost || 0), 2)}</div>
          <div><span style={{color:"var(--fg-3)"}}>Lead </span>{row.lead || "—"}d</div>
          <div><span style={{color:"var(--fg-3)"}}>Origin </span>{row.origin}</div>
          <div><span style={{color:"var(--fg-3)"}}>Vendor </span>{row.vendor}</div>
        </div>
      </div>

      {/* Alternates */}
      <div style={{display: "flex", flexDirection: "column", gap: 8}}>
        {alts.map((a, i) => {
          const cheaper = a.cost < row.cost;
          const faster = a.lead < (row.lead || 999);
          const isSelected = selected === a.pn;
          return (
            <div
              key={a.pn}
              onClick={() => setSelected(a.pn)}
              style={{
                padding: 14,
                border: "1.5px solid " + (isSelected ? "var(--accent)" : "var(--line)"),
                borderRadius: "var(--r-3)",
                background: isSelected ? "var(--accent-soft)" : "var(--bg)",
                cursor: "pointer",
                position: "relative",
              }}
            >
              <div style={{display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 8}}>
                <div style={{flex: 1, minWidth: 0}}>
                  <div style={{display:"flex", alignItems:"center", gap: 8, marginBottom: 2}}>
                    <span style={{fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)"}}>{a.pn}</span>
                    {cheaper && <span className="tag-pill" style={{background: "color-mix(in oklch, var(--ok) 14%, var(--bg))", borderColor: "var(--ok)", color: "var(--ok)"}}>{((row.cost - a.cost) / row.cost * 100).toFixed(0)}% CHEAPER</span>}
                    {faster && <span className="tag-pill" style={{background: "color-mix(in oklch, var(--info) 14%, var(--bg))", borderColor: "var(--info)", color: "var(--info)"}}>{(row.lead || 14) - a.lead}d FASTER</span>}
                    {a.rating >= 4.7 && <span className="tag-pill" style={{background: "color-mix(in oklch, var(--accent) 12%, var(--bg))", borderColor: "var(--accent)", color: "var(--accent)"}}>★ {a.rating}</span>}
                  </div>
                  <div style={{fontWeight: 600, fontSize: 13}}>{a.name}</div>
                </div>
                <div style={{
                  width: 18, height: 18,
                  borderRadius: 99,
                  border: "1.5px solid " + (isSelected ? "var(--accent)" : "var(--line)"),
                  background: isSelected ? "var(--accent)" : "transparent",
                  flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {isSelected && <Icon.Check size={10}/>}
                </div>
              </div>
              <div style={{display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, fontFamily: "var(--font-mono)", fontSize: 11}}>
                <div><span style={{color: "var(--fg-3)"}}>Cost </span><span style={{fontWeight: 600, color: cheaper ? "var(--ok)" : "var(--fg)"}}>{window.INR(a.cost, 2)}</span></div>
                <div><span style={{color: "var(--fg-3)"}}>Lead </span><span style={{color: faster ? "var(--info)" : "var(--fg)"}}>{a.lead}d</span></div>
                <div><span style={{color: "var(--fg-3)"}}>Origin </span>{a.origin}</div>
                <div><span style={{color: "var(--fg-3)"}}>Vendor </span>{a.vendor}</div>
                <div style={{color: "var(--fg-3)"}}>{a.stock}</div>
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

// ============ SEND RFQ ============
function SendRFQModal({ open, onClose, row }) {
  const [vendors, setVendors] = React.useState(["Mean Well", "STMicro", "Mouser"]);
  const [qty, setQty] = React.useState(100);
  const [deadline, setDeadline] = React.useState("2026-06-05");
  const submit = () => {
    onClose();
    window.toast(`RFQ sent to ${vendors.length} vendors · responses by ${deadline}`, {
      kind: "success",
      action: { label: "View RFQ", onClick: () => window.__nav?.("procurement") },
    });
  };
  if (!open || !row || !row.pn) return null;
  if (!open || !row || !row.pn) return null;
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Cart size={16}/>}
      title="Send RFQ"
      subtitle={`${row.pn} · ${row.name}`}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={() => { onClose(); window.toast("RFQ saved as draft", { kind: "success" }); }}>Save draft</button>
          <button className="btn primary" onClick={submit}><Icon.Cart size={12}/> Send to {vendors.length} vendors</button>
        </>
      }
    >
      <div className="field-row">
        <div className="field">
          <label>Quantity needed <span className="req">*</span></label>
          <input className="input mono" type="number" value={qty} onChange={e => setQty(+e.target.value)}/>
        </div>
        <div className="field">
          <label>Response deadline</label>
          <input className="input mono" type="date" value={deadline} onChange={e => setDeadline(e.target.value)}/>
        </div>
      </div>
      <div className="field">
        <label>Vendors</label>
        <div style={{display: "flex", flexWrap: "wrap", gap: 6, padding: 6, border: "1px solid var(--line)", borderRadius: "var(--r-2)", background: "var(--bg-elev)", minHeight: 36}}>
          {vendors.map((v, i) => (
            <span key={v} className="tag-pill" style={{background: "var(--accent-soft)", color: "var(--accent)", borderColor: "var(--accent)"}}>
              {v}
              <span className="x" onClick={() => setVendors(vendors.filter((_, j) => j !== i))}><Icon.X size={9}/></span>
            </span>
          ))}
          <window.DropdownButton
            width={200}
            trigger={<button className="btn small" style={{height: 22, fontSize: 10}}><Icon.Plus size={10}/> Add vendor</button>}
            items={window.BOM_DATA.vendors.filter(v => !vendors.includes(v.name)).slice(0, 8).map(v => ({
              icon: <Icon.Vendor size={11}/>,
              label: v.name + " · " + v.country,
              onClick: () => setVendors([...vendors, v.name]),
            }))}
          />
        </div>
      </div>
      <div className="field">
        <label>Required specifications</label>
        <textarea className="input" defaultValue={`Part: ${row.pn} ${row.name}\nQuantity: ${qty}\nTarget unit cost: ${window.INR((row.cost * 0.95), 2)}\nDelivery: by ${deadline}\nPackaging: bulk, anti-static where applicable.`}/>
      </div>
      <div className="field-row">
        <div className="field">
          <label>Currency</label>
          <select className="select"><option>USD</option><option>EUR</option><option>JPY</option></select>
        </div>
        <div className="field">
          <label>Incoterms</label>
          <select className="select"><option>DDP (delivered)</option><option>FOB</option><option>EXW</option></select>
        </div>
      </div>
    </Modal>
  );
}

// ============ DOC PREVIEW ============
function DocPreviewModal({ open, onClose, doc }) {
  if (!open || !doc || !doc.name) return null;
  // Synthesize a "preview" — different content per file type
  const previewByExt = {
    PDF: doc.tag === "Datasheet" ? "datasheet" : doc.tag === "Quote" ? "quote" : "report",
    DWG: "drawing",
    STEP: "step",
    XLSX: "spreadsheet",
    ZIP: "archive",
    JSON: "json",
  };
  const kind = previewByExt[doc.ext] || "doc";
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Doc size={16}/>}
      title={doc.name}
      subtitle={`${doc.tag} · ${doc.size} · uploaded ${doc.updated}`}
      wide
      footer={
        <>
          <span className="left" style={{display:"inline-flex", alignItems:"center", gap: 8}}>
            <Icon.Sparkles size={12}/>
            <span>OCR extracted 12 fields · 91% avg confidence</span>
          </span>
          <button className="btn" onClick={onClose}>Close</button>
          <button className="btn" onClick={() => window.toast("Link copied")}><Icon.Link size={12}/> Copy link</button>
          <button className="btn primary" onClick={() => window.toast("Downloading " + doc.name, { kind: "success" })}><Icon.Export size={12}/> Download</button>
        </>
      }
    >
      <DocPreviewBody kind={kind} doc={doc}/>
    </Modal>
  );
}

function DocPreviewBody({ kind, doc }) {
  if (kind === "datasheet") {
    return (
      <div style={{padding: 24, background: "white", border: "1px solid var(--line)", borderRadius: "var(--r-2)", color: "#1a1a1a", fontFamily: "var(--font-mono)", fontSize: 11, lineHeight: 1.7, minHeight: 480}}>
        <div style={{borderBottom: "2px solid #1a1a1a", paddingBottom: 10, marginBottom: 14}}>
          <div style={{fontSize: 18, fontWeight: 700, letterSpacing: "0.04em"}}>STMicroelectronics</div>
          <div style={{fontSize: 11, color: "#666"}}>Component Datasheet · Rev B · ES0392-compatible</div>
        </div>
        <div style={{fontSize: 22, fontWeight: 700, marginBottom: 6}}>STM32H743VIT6</div>
        <div style={{color: "#666", marginBottom: 18}}>HIGH-PERFORMANCE 32-BIT MCU WITH ARM® CORTEX®-M7</div>
        <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24}}>
          <div>
            <div style={{fontWeight: 700, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6, color: "#444"}}>Memory</div>
            <div>• 2 MB Flash (dual-bank)</div>
            <div>• 1 MB SRAM (with ECC)</div>
            <div>• External memory interface</div>
            <div style={{fontWeight: 700, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", margin: "14px 0 6px", color: "#444"}}>Operating</div>
            <div>• Voltage: 1.62 V – 3.6 V</div>
            <div>• Temp: −40 °C to +85 °C</div>
            <div>• 280 µA / MHz typ.</div>
          </div>
          <div>
            <div style={{fontWeight: 700, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6, color: "#444"}}>Core</div>
            <div>• Arm® Cortex®-M7 @ 480 MHz</div>
            <div>• 1027 DMIPS / 2400 CoreMark®</div>
            <div>• Single + double FPU</div>
            <div style={{fontWeight: 700, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", margin: "14px 0 6px", color: "#444"}}>Package</div>
            <div>• LQFP-100 · 14×14mm</div>
            <div>• RoHS, REACH compliant</div>
          </div>
        </div>
        <div style={{marginTop: 24, padding: 12, background: "#fff8e8", border: "1px solid #d4a44a", color: "#7a5414"}}>
          ⚠ ERRATA ES0392 — Rev A: I2C wakeup race condition. Use Rev B or later.
        </div>
      </div>
    );
  }
  if (kind === "drawing") {
    return (
      <div style={{padding: 24, background: "white", border: "1px solid var(--line)", borderRadius: "var(--r-2)", minHeight: 480, color: "#1a1a1a", fontFamily: "var(--font-mono)", position: "relative"}}>
        <div style={{display: "flex", justifyContent: "space-between", fontSize: 9, color: "#444", marginBottom: 16}}>
          <span>DRAWING NO. {doc.name.replace(/\.[^.]+$/, "")}</span>
          <span>SCALE 1:1 · SHEET 1 OF 1</span>
        </div>
        <svg viewBox="0 0 400 280" style={{width: "100%", height: 380, background: "#fafafa", border: "1px solid #ccc"}}>
          {/* grid */}
          {Array.from({length: 21}).map((_, i) => <line key={"v"+i} x1={i*20} x2={i*20} y1={0} y2={280} stroke="#e8e8e8" strokeWidth="0.5"/>)}
          {Array.from({length: 15}).map((_, i) => <line key={"h"+i} x1={0} x2={400} y1={i*20} y2={280} stroke="#e8e8e8" strokeWidth="0.5"/>)}
          {/* part outline */}
          <rect x="60" y="80" width="280" height="120" stroke="#1a1a1a" strokeWidth="1.5" fill="none"/>
          <circle cx="80" cy="100" r="6" stroke="#1a1a1a" strokeWidth="1" fill="none"/>
          <circle cx="320" cy="100" r="6" stroke="#1a1a1a" strokeWidth="1" fill="none"/>
          <circle cx="80" cy="180" r="6" stroke="#1a1a1a" strokeWidth="1" fill="none"/>
          <circle cx="320" cy="180" r="6" stroke="#1a1a1a" strokeWidth="1" fill="none"/>
          <line x1="120" y1="120" x2="280" y2="120" stroke="#1a1a1a" strokeWidth="0.5" strokeDasharray="3 3"/>
          <line x1="120" y1="160" x2="280" y2="160" stroke="#1a1a1a" strokeWidth="0.5" strokeDasharray="3 3"/>
          {/* dim lines */}
          <line x1="60" y1="60" x2="340" y2="60" stroke="#1a1a1a" strokeWidth="0.6"/>
          <line x1="60" y1="55" x2="60" y2="65" stroke="#1a1a1a" strokeWidth="0.6"/>
          <line x1="340" y1="55" x2="340" y2="65" stroke="#1a1a1a" strokeWidth="0.6"/>
          <text x="200" y="52" textAnchor="middle" fontSize="9" fill="#1a1a1a" fontFamily="monospace">120.00 ± 0.05</text>
          <line x1="370" y1="80" x2="370" y2="200" stroke="#1a1a1a" strokeWidth="0.6"/>
          <line x1="365" y1="80" x2="375" y2="80" stroke="#1a1a1a" strokeWidth="0.6"/>
          <line x1="365" y1="200" x2="375" y2="200" stroke="#1a1a1a" strokeWidth="0.6"/>
          <text x="378" y="143" fontSize="9" fill="#1a1a1a" fontFamily="monospace">80.00</text>
        </svg>
        <div style={{display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, fontSize: 9, marginTop: 14, padding: 10, background: "#fafafa", border: "1px solid #ddd"}}>
          <div><div style={{color:"#666"}}>MATERIAL</div><div>Aluminum 6061-T6</div></div>
          <div><div style={{color:"#666"}}>FINISH</div><div>Type II Anodized, Black</div></div>
          <div><div style={{color:"#666"}}>TOLERANCE</div><div>±0.05 mm</div></div>
          <div><div style={{color:"#666"}}>WEIGHT</div><div>89.4 g</div></div>
        </div>
      </div>
    );
  }
  if (kind === "spreadsheet") {
    return (
      <div style={{padding: 0, background: "white", border: "1px solid var(--line)", borderRadius: "var(--r-2)", color: "#1a1a1a", minHeight: 480, overflow: "hidden"}}>
        <div style={{padding: "10px 14px", background: "#107c41", color: "white", fontFamily: "var(--font-mono)", fontSize: 11}}>BOM_v3.2.0.xlsx · Sheet1</div>
        <table style={{width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-mono)", fontSize: 10}}>
          <thead>
            <tr style={{background: "#f5f5f5", color: "#444"}}>
              {["#","Part No.","Description","Rev","Qty","UoM","Vendor","Unit Cost","Ext. Cost"].map(h => <th key={h} style={{padding: "5px 8px", textAlign: "left", borderBottom: "1px solid #ccc", borderRight: "1px solid #e0e0e0"}}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {window.BOM_DATA.rows[0].children.flatMap(s => s.children).slice(0, 14).map((r, i) => (
              <tr key={r.id} style={{borderBottom: "1px solid #f0f0f0", color: "#1a1a1a"}}>
                <td style={{padding: "4px 8px", borderRight: "1px solid #f0f0f0", color: "#888"}}>{i + 1}</td>
                <td style={{padding: "4px 8px", borderRight: "1px solid #f0f0f0", fontWeight: 600}}>{r.pn}</td>
                <td style={{padding: "4px 8px", borderRight: "1px solid #f0f0f0"}}>{r.name}</td>
                <td style={{padding: "4px 8px", borderRight: "1px solid #f0f0f0"}}>{r.rev}</td>
                <td style={{padding: "4px 8px", borderRight: "1px solid #f0f0f0", textAlign: "right"}}>{r.qty}</td>
                <td style={{padding: "4px 8px", borderRight: "1px solid #f0f0f0"}}>{r.uom}</td>
                <td style={{padding: "4px 8px", borderRight: "1px solid #f0f0f0"}}>{r.vendor}</td>
                <td style={{padding: "4px 8px", borderRight: "1px solid #f0f0f0", textAlign: "right"}}>{window.INR(r.cost, 2)}</td>
                <td style={{padding: "4px 8px", textAlign: "right"}}>{window.INR(((r.cost || 0) * (r.qty || 0)), 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  // Generic fallback
  return (
    <div style={{padding: 60, background: "var(--bg-sunk)", border: "1px solid var(--line)", borderRadius: "var(--r-2)", textAlign: "center", minHeight: 380}}>
      <div style={{fontFamily: "var(--font-mono)", fontSize: 48, color: "var(--fg-4)", marginBottom: 14}}>{doc.ext}</div>
      <div style={{fontSize: 13, color: "var(--fg-3)"}}>{doc.name}</div>
      <div style={{fontSize: 11, color: "var(--fg-4)", marginTop: 6, fontFamily: "var(--font-mono)"}}>Preview not available · use Download</div>
    </div>
  );
}

// ============ BULK EDIT ============
function BulkEditModal({ open, onClose, count, onApply }) {
  const [vendorEnabled, setVendorEnabled] = React.useState(false);
  const [vendor, setVendor] = React.useState("Mean Well");
  const [statusEnabled, setStatusEnabled] = React.useState(false);
  const [status, setStatus] = React.useState("Released");
  const [leadEnabled, setLeadEnabled] = React.useState(false);
  const [lead, setLead] = React.useState(14);
  const apply = () => {
    const patch = {};
    if (vendorEnabled) patch.vendor = vendor;
    if (statusEnabled) patch.status = status;
    if (leadEnabled) patch.lead = lead;
    const fieldCount = Object.keys(patch).length;
    onApply && onApply(patch);
    onClose();
    if (fieldCount === 0) return;
    window.toast(`${count} rows updated · ${fieldCount} field${fieldCount !== 1 ? "s" : ""}`, { kind: "success" });
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Edit size={16}/>}
      title="Edit fields in bulk"
      subtitle={`Update ${count} selected row${count !== 1 ? "s" : ""}`}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={apply}>Apply to {count} rows</button>
        </>
      }
    >
      <p style={{margin: "0 0 14px", fontSize: 12, color: "var(--fg-3)"}}>Check the fields you want to update — unchecked fields stay as-is.</p>
      <div style={{display: "flex", flexDirection: "column", gap: 12}}>
        <label style={{display:"flex", alignItems:"center", gap: 10, padding: 10, border:"1px solid var(--line)", borderRadius:"var(--r-2)", background: vendorEnabled ? "var(--bg-elev)" : "transparent"}}>
          <input type="checkbox" checked={vendorEnabled} onChange={e => setVendorEnabled(e.target.checked)} className="row-checkbox"/>
          <span style={{flex:1, fontSize: 12, fontWeight: 500}}>Vendor</span>
          <select className="select" disabled={!vendorEnabled} value={vendor} onChange={e => setVendor(e.target.value)} style={{width: 200, opacity: vendorEnabled ? 1 : 0.4}}>
            {window.BOM_DATA.vendors.map(v => <option key={v.id}>{v.name}</option>)}
          </select>
        </label>
        <label style={{display:"flex", alignItems:"center", gap: 10, padding: 10, border:"1px solid var(--line)", borderRadius:"var(--r-2)", background: statusEnabled ? "var(--bg-elev)" : "transparent"}}>
          <input type="checkbox" checked={statusEnabled} onChange={e => setStatusEnabled(e.target.checked)} className="row-checkbox"/>
          <span style={{flex:1, fontSize: 12, fontWeight: 500}}>Status</span>
          <select className="select" disabled={!statusEnabled} value={status} onChange={e => setStatus(e.target.value)} style={{width: 200, opacity: statusEnabled ? 1 : 0.4}}>
            {["Draft","Review","Approved","Released","Deprecated"].map(s => <option key={s}>{s}</option>)}
          </select>
        </label>
        <label style={{display:"flex", alignItems:"center", gap: 10, padding: 10, border:"1px solid var(--line)", borderRadius:"var(--r-2)", background: leadEnabled ? "var(--bg-elev)" : "transparent"}}>
          <input type="checkbox" checked={leadEnabled} onChange={e => setLeadEnabled(e.target.checked)} className="row-checkbox"/>
          <span style={{flex:1, fontSize: 12, fontWeight: 500}}>Lead time (days)</span>
          <input type="number" className="input mono" disabled={!leadEnabled} value={lead} onChange={e => setLead(+e.target.value)} style={{width: 200, opacity: leadEnabled ? 1 : 0.4}}/>
        </label>
      </div>
    </Modal>
  );
}

// ============ SAVE VIEW ============
function SaveViewModal({ open, onClose, filters, onSave }) {
  const [name, setName] = React.useState("");
  const save = () => {
    if (!name.trim()) return;
    onSave(name.trim());
    onClose();
    setName("");
    window.toast(`View "${name}" saved`, { kind: "success" });
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Filter size={16}/>}
      title="Save view"
      subtitle="Save current filters for quick access"
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={save} disabled={!name.trim()}>Save view</button>
        </>
      }
    >
      <div className="field">
        <label>View name</label>
        <input className="input" autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. High-cost electrical"/>
      </div>
      <div style={{padding: 10, background: "var(--bg-sunk)", border: "1px solid var(--line)", borderRadius: "var(--r-2)", fontSize: 11, color: "var(--fg-3)", fontFamily: "var(--font-mono)"}}>
        <div style={{textTransform:"uppercase", letterSpacing: "0.06em", color: "var(--fg-3)", marginBottom: 4}}>CURRENT FILTERS</div>
        {Object.entries(filters || {}).filter(([, v]) => v && v.length).map(([k, v]) => (
          <div key={k}>{k}: {Array.isArray(v) ? v.join(", ") : v}</div>
        )) || <div>(none — saves an empty view)</div>}
        {Object.values(filters || {}).every(v => !v || v.length === 0) && <div>(no filters active)</div>}
      </div>
    </Modal>
  );
}

// ============ CHANGE OWNER ============
function ChangeOwnerModal({ open, onClose, row }) {
  const [owner, setOwner] = React.useState("");
  const [note, setNote] = React.useState("");
  const TEAM = [
    { name: "Elena Chen", handle: "elena", role: "ENG LEAD" },
    { name: "Marie Park", handle: "marie", role: "ENG" },
    { name: "Karan Singh", handle: "karan", role: "PROC" },
    { name: "Ryo Sato", handle: "ryo", role: "ENG" },
    { name: "Tom Reyes", handle: "tom", role: "FIN" },
  ];
  React.useEffect(() => { if (open) { setOwner(""); setNote(""); } }, [open]);
  if (!open || !row) return null;
  const submit = () => {
    if (!owner) return;
    onClose();
    window.toast(`Owner changed to ${owner} · ${row.pn}`, { kind: "success" });
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.User size={16}/>}
      title="Change owner"
      subtitle={`${row.pn} · ${row.name}`}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={submit} disabled={!owner}>Transfer ownership</button>
        </>
      }
    >
      <div style={{fontSize: 12, color: "var(--fg-3)", marginBottom: 14}}>
        Current: <strong>{window.BOM_DATA.project.owner}</strong>
      </div>
      <div className="field">
        <label>Transfer to <span className="req">*</span></label>
        <select className="select" value={owner} onChange={e => setOwner(e.target.value)}>
          <option value="">— Select team member —</option>
          {TEAM.map(t => <option key={t.handle} value={t.name}>{t.name} · {t.role}</option>)}
        </select>
      </div>
      <div className="field">
        <label>Note (optional)</label>
        <textarea className="input" value={note} onChange={e => setNote(e.target.value)} placeholder="Reason for ownership change…" style={{minHeight: 60}}/>
      </div>
      <div style={{padding: "10px 12px", background: "var(--bg-sunk)", border: "1px solid var(--line)", borderRadius: "var(--r-2)", fontSize: 11, color: "var(--fg-3)"}}>
        Owner change will be logged in the activity feed and a notification sent to the new owner.
      </div>
    </Modal>
  );
}

Object.assign(window, { FindAlternatesModal, SendRFQModal, DocPreviewModal, BulkEditModal, SaveViewModal, ChangeOwnerModal });
