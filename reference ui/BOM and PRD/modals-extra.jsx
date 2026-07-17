// Extra modals: PO Detail, Vendor Detail, CAD Import, Barcode Scan,
// Global Search, Profile, Workspace Settings, Help / Shortcuts, RFQ Responses.

// ============ PO DETAIL ============
function PODetailModal({ open, onClose, item }) {
  const ctx = window.useAppStore();
  if (!open || !item || !item.pn) return null;
  const allStatuses = ["Not Ordered", "RFQ Sent", "Under Review", "Ordered", "In Transit", "Received", "Quality Check", "Approved", "Rejected", "Closed"];
  const currentStatusIdx = allStatuses.indexOf(item.status || "Ordered");
  const lineCost = (item.qty || 0) * (item.cost || 12);
  const tax = lineCost * 0.08;
  const ship = 12.50;
  const total = lineCost + tax + ship;

  const advance = async () => {
    if (currentStatusIdx >= allStatuses.length - 1) return;
    const nextStatus = allStatuses[currentStatusIdx + 1];
    try {
      if (item.id && window.api?.procurement?.advance) {
        await window.api.procurement.advance(item.id);
      }
    } catch (e) {}
    onClose();
    window.toast(`PO advanced to "${nextStatus}"`, { kind: "success" });
  };

  const poNumber = item.poNumber || `PO-2026-${String(item.pn ? item.pn.charCodeAt(item.pn.length-1) * 7 : 481).padStart(4, "0")}`;

  return (
    <window.Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Cart size={16}/>}
      title={`${poNumber} \u00B7 ${item.pn}`}
      subtitle={`${item.vendor || "Mean Well"} \u00B7 ${item.qty} units \u00B7 ETA ${item.eta || "\u2014"}`}
      wide
      footer={
        <>
          <span className="left">Total: <strong>{window.INR(total, 2)}</strong></span>
          <button className="btn" onClick={onClose}>Close</button>
          <button className="btn" onClick={() => window.printPO(item, { country: "TW" })}><Icon.Doc size={12}/> Print PDF</button>
          {currentStatusIdx >= 0 && currentStatusIdx < allStatuses.length - 1 && allStatuses[currentStatusIdx] !== "Rejected" && (
            <button className="btn primary" onClick={advance}>
              <Icon.Check size={12}/> Advance to {allStatuses[currentStatusIdx + 1]}
            </button>
          )}
        </>
      }
    >
      {/* Status timeline */}
      <div style={{marginBottom: 18}}>
        <div style={{fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-3)", marginBottom: 10}}>Status</div>
        <div style={{display: "flex", alignItems: "center", gap: 0, overflowX: "auto"}}>
          {allStatuses.map((s, i) => (
            <React.Fragment key={s}>
              <div style={{flex: 1, textAlign: "center", position: "relative", minWidth: 60}}>
                <span style={{
                  width: 22, height: 22, borderRadius: 99,
                  background: i === currentStatusIdx ? "var(--accent)" : i < currentStatusIdx && allStatuses[currentStatusIdx] !== "Rejected" ? "var(--ok)" : "var(--bg-sunk)",
                  border: i === currentStatusIdx ? "none" : i < currentStatusIdx && allStatuses[currentStatusIdx] !== "Rejected" ? "none" : "1px solid var(--line)",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  color: "white",
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  fontWeight: 700,
                  position: "relative", zIndex: 1,
                }}>
                  {i < currentStatusIdx && allStatuses[currentStatusIdx] !== "Rejected" ? <Icon.Check size={9}/> : i + 1}
                </span>
                <div style={{fontFamily: "var(--font-mono)", fontSize: 8, marginTop: 3, color: i === currentStatusIdx ? "var(--accent)" : "var(--fg-3)", fontWeight: i === currentStatusIdx ? 700 : 400, letterSpacing: "0.04em", whiteSpace: "nowrap"}}>{s.toUpperCase()}</div>
              </div>
              {i < allStatuses.length - 1 && (
                <div style={{flex: 0.3, height: 1, background: i < currentStatusIdx && allStatuses[currentStatusIdx] !== "Rejected" ? "var(--accent)" : "var(--line)", marginBottom: 18}}/>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Two-column metadata */}
      <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 20}}>
        <div>
          <div style={{fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-3)", marginBottom: 8}}>Vendor</div>
          <div style={{padding: 12, border: "1px solid var(--line)", borderRadius: "var(--r-2)", background: "var(--bg)"}}>
            <div style={{fontWeight: 600, fontSize: 13, marginBottom: 4}}>{item.vendor || "Mean Well"}</div>
            <div style={{fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)", marginBottom: 2}}>orders@meanwell.tw · +886-2-2917-6666</div>
            <div style={{fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)"}}>Net 30 · TW · ★ 4.6</div>
          </div>
        </div>
        <div>
          <div style={{fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-3)", marginBottom: 8}}>Shipping</div>
          <div style={{padding: 12, border: "1px solid var(--line)", borderRadius: "var(--r-2)", background: "var(--bg)"}}>
            <div style={{fontWeight: 600, fontSize: 13, marginBottom: 4}}>Blackbox Factories · Receiving</div>
            <div style={{fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)", marginBottom: 2}}>2451 Engineering Way</div>
            <div style={{fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)"}}>Mountain View, CA 94043 · USA</div>
          </div>
        </div>
      </div>

      {/* Line items */}
      <div style={{fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-3)", marginBottom: 8}}>Line items</div>
      <div style={{border: "1px solid var(--line)", borderRadius: "var(--r-2)", overflow: "hidden", marginBottom: 14}}>
        <table className="bom-table" style={{tableLayout: "auto"}}>
          <thead>
            <tr>
              <th style={{paddingLeft: 12}}>Part No.</th>
              <th>Name</th>
              <th className="num">Qty</th>
              <th className="num">Unit</th>
              <th className="num">Ext.</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="mono" style={{paddingLeft: 12}}>{item.pn}</td>
              <td style={{fontWeight: 500}}>{item.name}</td>
              <td className="num mono">{item.qty}</td>
              <td className="num mono">{window.INR((item.cost || 12), 2)}</td>
              <td className="num mono" style={{fontWeight: 600}}>{window.INR(lineCost, 2)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div style={{display: "flex", justifyContent: "flex-end", marginBottom: 14}}>
        <div style={{width: 260, fontFamily: "var(--font-mono)", fontSize: 12}}>
          <div style={{display:"flex", justifyContent:"space-between", padding: "4px 0"}}>
            <span style={{color: "var(--fg-3)"}}>Subtotal</span>
            <span>{window.INR(lineCost, 2)}</span>
          </div>
          <div style={{display:"flex", justifyContent:"space-between", padding: "4px 0"}}>
            <span style={{color: "var(--fg-3)"}}>Tax (8%)</span>
            <span>{window.INR(tax, 2)}</span>
          </div>
          <div style={{display:"flex", justifyContent:"space-between", padding: "4px 0"}}>
            <span style={{color: "var(--fg-3)"}}>Shipping</span>
            <span>{window.INR(ship, 2)}</span>
          </div>
          <div style={{display:"flex", justifyContent:"space-between", padding: "8px 0 0", borderTop: "1px solid var(--line)", marginTop: 4, fontWeight: 700, fontSize: 14}}>
            <span>Total</span>
            <span>{window.INR(total, 2)}</span>
          </div>
        </div>
      </div>

      {/* Activity */}
      <div style={{fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-3)", marginBottom: 8}}>Activity</div>
      <div style={{fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--fg-2)"}}>
        <div style={{padding: "4px 0", borderBottom: "1px solid var(--line-soft)"}}>2026-05-22 · E. Chen · Draft created</div>
        <div style={{padding: "4px 0", borderBottom: "1px solid var(--line-soft)"}}>2026-05-23 · K. Singh · Approved · ₹1,74,300 · Net 30</div>
        <div style={{padding: "4px 0", borderBottom: "1px solid var(--line-soft)"}}>2026-05-23 · System · PO sent to {item.vendor || "Mean Well"}</div>
        {currentStatusIdx >= 2 && <div style={{padding: "4px 0"}}>2026-05-24 · System · Order confirmed · ETA {item.eta}</div>}
      </div>
    </window.Modal>
  );
}

// ============ VENDOR DETAIL ============
function VendorDetailModal({ open, onClose, vendor }) {
  if (!open || !vendor || !vendor.id) return null;
  const data = window.BOM_DATA;
  // Pretend this vendor supplies some parts
  const parts = data.rows[0].children.flatMap(s => s.children || []).filter(r => r.vendor === vendor.name).slice(0, 6);
  return (
    <window.Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Vendor size={16}/>}
      title={vendor.name}
      subtitle={`${vendor.country} · ${vendor.terms} · ★ ${vendor.rating} · ${vendor.preferred ? "PREFERRED" : "Standard"}`}
      wide
      footer={
        <>
          <span className="left">{vendor.parts} active parts · {vendor.lead}d avg lead</span>
          <button className="btn" onClick={onClose}>Close</button>
          <button className="btn" onClick={() => window.toast("Open in CRM")}><Icon.Link size={12}/> Open in CRM</button>
          <button className="btn primary" onClick={() => { onClose(); window.toast("RFQ drafted for " + vendor.name, { action: { label: "View", onClick: () => window.__nav?.("procurement") } }); }}><Icon.Cart size={12}/> Send RFQ</button>
        </>
      }
    >
      {/* Header stats */}
      <div style={{display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20}}>
        {[
          { l: "Active parts", v: vendor.parts, sub: "across 3 projects" },
          { l: "Lead time", v: vendor.lead + "d", sub: "avg, 28d max" },
          { l: "On-time rate", v: "92%", sub: "last 24 POs" },
          { l: "Quality score", v: vendor.rating + " / 5", sub: "32 reviews" },
        ].map((k) => (
          <div key={k.l} style={{padding: 12, border: "1px solid var(--line)", borderRadius: "var(--r-2)", background: "var(--bg)"}}>
            <div style={{fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-3)"}}>{k.l}</div>
            <div style={{fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 600, margin: "2px 0"}}>{k.v}</div>
            <div style={{fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)"}}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Two-column */}
      <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginBottom: 16}}>
        <div>
          <div style={{fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-3)", marginBottom: 8}}>Contact</div>
          <div style={{padding: 12, border: "1px solid var(--line)", borderRadius: "var(--r-2)", background: "var(--bg)"}}>
            <div style={{display:"grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px", fontFamily: "var(--font-mono)", fontSize: 11}}>
              <span style={{color:"var(--fg-3)"}}>Email</span><span>orders@{vendor.name.toLowerCase().replace(/\s+/g, "")}.com</span>
              <span style={{color:"var(--fg-3)"}}>Phone</span><span>+1-555-{Math.floor(1000 + vendor.id.charCodeAt(1) * 13)}-{Math.floor(1000 + vendor.id.charCodeAt(1) * 27)}</span>
              <span style={{color:"var(--fg-3)"}}>Address</span><span>1234 Industrial Park · {vendor.country}</span>
              <span style={{color:"var(--fg-3)"}}>MOQ</span><span>{vendor.moq} units</span>
              <span style={{color:"var(--fg-3)"}}>Terms</span><span>{vendor.terms}</span>
              <span style={{color:"var(--fg-3)"}}>Risk</span><span><span className={"status " + (vendor.risk === "Low" ? "released" : vendor.risk === "Med" ? "review" : "deprecated")}>{vendor.risk}</span></span>
            </div>
          </div>
        </div>
        <div>
          <div style={{fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-3)", marginBottom: 8}}>On-time delivery (last 6 mo)</div>
          <div style={{padding: 16, border: "1px solid var(--line)", borderRadius: "var(--r-2)", background: "var(--bg)", display: "flex", alignItems: "flex-end", gap: 8, height: 120}}>
            {[88, 92, 90, 94, 91, 92].map((v, i) => (
              <div key={i} style={{flex: 1, position: "relative", height: "100%"}}>
                <div style={{
                  position: "absolute", bottom: 0, left: 0, right: 0,
                  height: v + "%",
                  background: v >= 90 ? "var(--ok)" : "var(--warn)",
                  borderRadius: "2px 2px 0 0",
                  opacity: 0.85,
                }}/>
                <div style={{position: "absolute", bottom: -16, left: 0, right: 0, textAlign: "center", fontFamily:"var(--font-mono)", fontSize: 9, color: "var(--fg-3)"}}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Parts sourced */}
      <div style={{fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-3)", marginBottom: 8}}>Parts sourced ({parts.length})</div>
      <div style={{border: "1px solid var(--line)", borderRadius: "var(--r-2)", overflow: "hidden"}}>
        {parts.length === 0 ? (
          <div style={{padding: 24, textAlign: "center", color: "var(--fg-3)", fontSize: 12}}>No parts currently sourced from {vendor.name}.</div>
        ) : (
          <table className="bom-table" style={{tableLayout: "auto"}}>
            <thead>
              <tr>
                <th style={{paddingLeft: 12}}>Part No.</th>
                <th>Name</th>
                <th className="num">Qty</th>
                <th className="num">Unit</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {parts.map(p => (
                <tr key={p.id}>
                  <td className="mono" style={{paddingLeft: 12}}>{p.pn}</td>
                  <td>{p.name}</td>
                  <td className="num mono">{p.qty}</td>
                  <td className="num mono">{window.INR(p.cost, 2)}</td>
                  <td><span className={"status " + (window.STATUS_CLASS[p.status] || "")}>{p.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </window.Modal>
  );
}

// ============ CAD IMPORT (SolidWorks-style sync) ============
function CADImportModal({ open, onClose }) {
  const [step, setStep] = React.useState("upload"); // upload | scanning | review
  const [progress, setProgress] = React.useState(0);
  const [foundParts, setFoundParts] = React.useState([]);
  const [selected, setSelected] = React.useState(new Set());

  React.useEffect(() => {
    if (!open) { setStep("upload"); setProgress(0); setFoundParts([]); setSelected(new Set()); }
  }, [open]);

  const startScan = () => {
    setStep("scanning");
    setProgress(0);
    const interval = setInterval(() => {
      setProgress(p => {
        const next = p + Math.random() * 18 + 6;
        if (next >= 100) {
          clearInterval(interval);
          const fakeParts = [
            { pn: "MEC-PL-040A", name: "Side Panel (Anodized)", qty: 2, status: "matched" },
            { pn: "MEC-PL-041A", name: "Top Plate (Vented)", qty: 1, status: "matched" },
            { pn: "MEC-BR-013", name: "Mounting Bracket, Type B (NEW)", qty: 6, status: "new" },
            { pn: "HW-FAS-M3-08", name: "Screw, M3×8", qty: 32, status: "matched" },
            { pn: "HW-FAS-M4-12", name: "Screw, M4×12 (NEW)", qty: 8, status: "new" },
            { pn: "EL-CON-RJ45", name: "Connector, RJ45", qty: 2, status: "matched" },
            { pn: "MEC-GSK-A", name: "Gasket, EPDM (NEW)", qty: 1, status: "new" },
          ];
          setFoundParts(fakeParts);
          setSelected(new Set(fakeParts.map(p => p.pn)));
          setStep("review");
          return 100;
        }
        return next;
      });
    }, 250);
  };

  const apply = () => {
    onClose();
    const newCount = foundParts.filter(p => p.status === "new" && selected.has(p.pn)).length;
    const matchedCount = foundParts.filter(p => p.status === "matched" && selected.has(p.pn)).length;
    window.toast(`Imported · ${newCount} new parts, ${matchedCount} matched`, { kind: "success" });
  };

  return (
    <window.Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Import size={16}/>}
      title="Import from SolidWorks"
      subtitle="Sync assembly BOM → component library"
      wide
      footer={
        step === "review" ? (
          <>
            <span className="left">{selected.size} of {foundParts.length} parts will be imported</span>
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn primary" onClick={apply} disabled={selected.size === 0}><Icon.Check size={12}/> Import {selected.size} parts</button>
          </>
        ) : null
      }
    >
      {step === "upload" && (
        <>
          <p style={{margin: "0 0 14px", fontSize: 12, color: "var(--fg-3)"}}>Connect to SolidWorks, upload an assembly file, or paste a PDM link.</p>
          <div style={{display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14}}>
            {[
              { l: "SolidWorks", s: "Live API connection", icon: "⌬" },
              { l: "Assembly file", s: ".sldasm or .step upload", icon: "⤓" },
              { l: "PDM link", s: "Paste assembly URL", icon: "🔗" },
            ].map((opt, i) => (
              <button
                key={i}
                onClick={startScan}
                style={{
                  padding: 18,
                  border: "1.5px solid var(--line)",
                  borderRadius: "var(--r-3)",
                  background: "var(--bg)",
                  cursor: "pointer",
                  textAlign: "center",
                  transition: "border-color 0.1s, background 0.1s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.background = "var(--bg-elev)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--line)"; e.currentTarget.style.background = "var(--bg)"; }}
              >
                <div style={{fontFamily: "var(--font-mono)", fontSize: 26, color: "var(--fg-3)", marginBottom: 6}}>{opt.icon}</div>
                <div style={{fontWeight: 600, fontSize: 13}}>{opt.l}</div>
                <div style={{fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)", marginTop: 2}}>{opt.s}</div>
              </button>
            ))}
          </div>
          <div style={{padding: 12, background: "var(--bg-sunk)", border: "1px solid var(--line)", borderRadius: "var(--r-2)", fontSize: 12, color: "var(--fg-3)"}}>
            <div style={{fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4}}>RECENT IMPORTS</div>
            <div style={{display:"flex", justifyContent: "space-between", padding: "4px 0", fontFamily: "var(--font-mono)", fontSize: 11}}>
              <span>ATL-MFR-A_v3.2.sldasm</span><span style={{color:"var(--fg-3)"}}>5 days ago · 87 parts</span>
            </div>
            <div style={{display:"flex", justifyContent: "space-between", padding: "4px 0", fontFamily: "var(--font-mono)", fontSize: 11}}>
              <span>HZN-POD-CTL_v1.4.sldasm</span><span style={{color:"var(--fg-3)"}}>12 days ago · 24 parts</span>
            </div>
          </div>
        </>
      )}

      {step === "scanning" && (
        <div style={{textAlign: "center", padding: "40px 20px"}}>
          <div style={{fontFamily: "var(--font-mono)", fontSize: 36, color: "var(--accent)", marginBottom: 14}}>⌬</div>
          <div style={{fontSize: 14, fontWeight: 600, marginBottom: 6}}>Scanning assembly…</div>
          <div style={{fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)", marginBottom: 20}}>
            Walking tree · extracting parts · matching against library
          </div>
          <div style={{maxWidth: 360, margin: "0 auto"}}>
            <div style={{height: 8, background: "var(--bg-sunk)", borderRadius: 4, overflow: "hidden"}}>
              <div style={{height: "100%", width: Math.min(100, progress) + "%", background: "var(--accent)", transition: "width 0.25s ease-out"}}/>
            </div>
            <div style={{fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)", marginTop: 6, display: "flex", justifyContent: "space-between"}}>
              <span>{progress >= 30 ? "Walking subassemblies" : "Loading assembly"}</span>
              <span>{Math.round(Math.min(100, progress))}%</span>
            </div>
          </div>
          <div style={{marginTop: 30, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-4)", lineHeight: 1.8, textAlign: "left", maxWidth: 480, margin: "30px auto 0"}}>
            {progress > 10 && <div>✓ Loaded ATL-MFR-A_v3.2.sldasm</div>}
            {progress > 30 && <div>✓ Walked 4 subassemblies · 87 part references</div>}
            {progress > 55 && <div>✓ Captured isometric thumbnails (S3 → /atlas/v3.2/)</div>}
            {progress > 75 && <div>✓ Matched 64 parts to library</div>}
            {progress > 90 && <div>✓ Identified 3 new parts requiring review</div>}
          </div>
        </div>
      )}

      {step === "review" && (
        <>
          <div style={{display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12}}>
            <div style={{fontSize: 13}}>
              <strong style={{color: "var(--ok)"}}>{foundParts.filter(p => p.status === "matched").length} matched</strong> ·{" "}
              <strong style={{color: "var(--accent)"}}>{foundParts.filter(p => p.status === "new").length} new</strong>
            </div>
            <div style={{fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)"}}>{foundParts.length} total · 8.4 MB</div>
          </div>
          <div style={{border: "1px solid var(--line)", borderRadius: "var(--r-2)", overflow: "hidden"}}>
            <table className="bom-table" style={{tableLayout: "auto"}}>
              <thead>
                <tr>
                  <th className="col-check"><input type="checkbox" className="row-checkbox" checked={selected.size === foundParts.length} onChange={(e) => setSelected(e.target.checked ? new Set(foundParts.map(p => p.pn)) : new Set())}/></th>
                  <th>Part No.</th>
                  <th>Name</th>
                  <th className="num">Qty</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {foundParts.map(p => (
                  <tr key={p.pn}>
                    <td className="col-check">
                      <input type="checkbox" className="row-checkbox" checked={selected.has(p.pn)} onChange={() => {
                        const next = new Set(selected);
                        next.has(p.pn) ? next.delete(p.pn) : next.add(p.pn);
                        setSelected(next);
                      }}/>
                    </td>
                    <td className="mono">{p.pn}</td>
                    <td>{p.name}</td>
                    <td className="num mono">{p.qty}</td>
                    <td>
                      {p.status === "matched" ? (
                        <span className="status released">Matched</span>
                      ) : (
                        <span style={{fontFamily:"var(--font-mono)", fontSize: 10, padding: "1px 6px", background: "var(--accent-soft)", color: "var(--accent)", border: "1px solid var(--accent)", borderRadius: 99}}>NEW</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </window.Modal>
  );
}

// ============ BARCODE SCAN ============

function BarcodeScanModal({ open, onClose, onFound }) {
  const [phase, setPhase] = React.useState("scanning"); // scanning | found | error
  const [foundPart, setFoundPart] = React.useState(null);
  const [manualBarcode, setManualBarcode] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [useCamera, setUseCamera] = React.useState(false);
  const videoRef = React.useRef(null);
  const streamRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) { 
      setPhase("scanning"); 
      setFoundPart(null); 
      setManualBarcode("");
      setError(null);
      setUseCamera(false); 
      return; 
    }
  }, [open]);

  React.useEffect(() => {
    if (!open || !useCamera) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      return;
    }
    let cancelled = false;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: "environment" } })
      .then(stream => {
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => {
        if (!cancelled) window.toast("Camera access denied or unavailable", { kind: "warn" });
      });
    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
    };
  }, [open, useCamera]);

  const lookupBarcode = async (barcode) => {
    if (!barcode.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await window.api.barcodes.lookup(barcode);
      if (result.found) {
        setFoundPart(result);
        setPhase("found");
      } else {
        setError(`No part found for barcode: ${barcode}`);
        setPhase("error");
      }
    } catch (err) {
      setError(err.message || "Failed to lookup barcode");
      setPhase("error");
    } finally {
      setLoading(false);
    }
  };

  const handleManualLookup = () => {
    lookupBarcode(manualBarcode);
  };

  const apply = () => {
    if (foundPart) {
      onClose();
      onFound && onFound(foundPart.pn, foundPart);
      window.toast(`Found: ${foundPart.pn} · added to draft PO`, { kind: "success" });
    }
  };

  const scanAnother = () => {
    setPhase("scanning");
    setFoundPart(null);
    setManualBarcode("");
    setError(null);
  };

  return (
    <window.Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Scan size={16}/>}
      title="Scan barcode"
      subtitle={useCamera ? "Real camera · point at barcode" : phase === "scanning" ? "Point camera at barcode" : phase === "error" ? "Error" : "Match found"}
      footer={
        phase === "found" ? (
          <>
            <button className="btn" onClick={scanAnother}>Scan another</button>
            <button className="btn" onClick={onClose}>Close</button>
            <button className="btn primary" onClick={apply}><Icon.Plus size={12}/> Add to PO</button>
          </>
        ) : (
          <>
            <button className="btn" onClick={() => setUseCamera(!useCamera)} style={{color: useCamera ? "var(--accent)" : "var(--fg-3)"}}>
              <Icon.Scan size={12}/> {useCamera ? "Using camera" : "Use camera"}
            </button>
            <button className="btn" onClick={onClose}>Cancel</button>
          </>
        )
      }
    >
      <div style={{position: "relative", aspectRatio: "16 / 10", background: "#0a0a0a", borderRadius: "var(--r-3)", overflow: "hidden", border: "1px solid var(--line)"}}>
        {useCamera ? (
          <video ref={videoRef} autoPlay playsInline muted style={{width:"100%", height:"100%", objectFit:"cover", display:"block"}}/>
        ) : (
          <div style={{position: "absolute", inset: 0, background: "radial-gradient(circle at center, #1a1a1a 0%, #050505 80%)"}}/>
        )}
        {!useCamera && <div style={{position: "absolute", inset: 0, background: "repeating-linear-gradient(0deg, transparent 0 3px, rgba(255,255,255,0.02) 3px 4px)"}}/>}
        {/* Viewfinder corners */}
        {[0, 1, 2, 3].map(i => {
          const top = i < 2 ? "20%" : "auto";
          const bottom = i >= 2 ? "20%" : "auto";
          const left = i % 2 === 0 ? "20%" : "auto";
          const right = i % 2 === 1 ? "20%" : "auto";
          const bt = i < 2 ? "3px solid var(--accent)" : "none";
          const bb = i >= 2 ? "3px solid var(--accent)" : "none";
          const bl = i % 2 === 0 ? "3px solid var(--accent)" : "none";
          const br = i % 2 === 1 ? "3px solid var(--accent)" : "none";
          return <div key={i} style={{position: "absolute", width: 28, height: 28, top, bottom, left, right, borderTop: bt, borderBottom: bb, borderLeft: bl, borderRight: br}}/>;
        })}
        {/* Fake barcode */}
        {phase === "found" && foundPart && (
          <div style={{position: "absolute", left: "30%", right: "30%", top: "50%", transform: "translateY(-50%)", display: "flex", gap: 1, justifyContent: "center"}}>
            {[2,1,3,1,1,2,3,1,2,1,1,3,2,1,3,1,2,1,3,1,1,2,1,3,1,2,3,1,2,1].map((w, i) => (
              <div key={i} style={{width: w * 2 + "px", height: 60, background: i % 2 === 0 ? "white" : "transparent"}}/>
            ))}
          </div>
        )}
        {/* Scan line */}
        {phase === "scanning" && (
          <div style={{
            position: "absolute",
            left: "20%", right: "20%",
            height: 2,
            background: "var(--accent)",
            boxShadow: "0 0 12px var(--accent)",
            animation: "scan 1.4s ease-in-out infinite",
          }}/>
        )}
        {/* Status text */}
        <div style={{position: "absolute", bottom: 12, left: 12, right: 12, color: "white", fontFamily: "var(--font-mono)", fontSize: 11, display: "flex", justifyContent: "space-between"}}>
          <span style={{display: "inline-flex", alignItems: "center", gap: 6}}>
            <span style={{width: 6, height: 6, borderRadius: 99, background: phase === "found" ? "var(--ok)" : phase === "error" ? "var(--err)" : "var(--accent)", animation: phase === "scanning" ? "pulse 1s infinite" : "none"}}/>
            {phase === "scanning" ? "SCANNING" : phase === "error" ? "ERROR" : "MATCH FOUND"}
          </span>
          <span style={{opacity: 0.6}}>{useCamera ? "LIVE · rear cam" : "MANUAL ENTRY"}</span>
        </div>
      </div>
      
      {/* Manual barcode entry when not using camera */}
      {!useCamera && phase === "scanning" && (
        <div style={{marginTop: 14}}>
          <div style={{display: "flex", gap: 8}}>
            <input
              type="text"
              placeholder="Enter barcode manually..."
              value={manualBarcode}
              onChange={(e) => setManualBarcode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleManualLookup()}
              style={{
                flex: 1,
                padding: "8px 12px",
                background: "var(--bg-2)",
                border: "1px solid var(--line)",
                borderRadius: "var(--r-2)",
                color: "var(--fg)",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
              }}
              disabled={loading}
            />
            <button 
              className="btn primary" 
              onClick={handleManualLookup}
              disabled={loading || !manualBarcode.trim()}
            >
              {loading ? "Looking up..." : "Lookup"}
            </button>
          </div>
        </div>
      )}
      
      {/* Error message */}
      {phase === "error" && error && (
        <div style={{marginTop: 14, padding: 12, border: "1px solid var(--err)", borderRadius: "var(--r-2)", background: "var(--err-soft)"}}>
          <div style={{fontSize: 13, color: "var(--err)"}}>{error}</div>
          <button className="btn" onClick={scanAnother} style={{marginTop: 8}}>Try Again</button>
        </div>
      )}
      
      {/* Found part details */}
      {phase === "found" && foundPart && (
        <div style={{marginTop: 14, padding: 12, border: "1px solid var(--accent)", borderRadius: "var(--r-2)", background: "var(--accent-soft)"}}>
          <div style={{fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--accent)", letterSpacing: "0.06em", textTransform: "uppercase"}}>EAN-13 · {foundPart.barcode} · {foundPart.pn}</div>
          <div style={{fontSize: 14, fontWeight: 600, marginTop: 4}}>{foundPart.name}</div>
          <div style={{fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-2)", marginTop: 2}}>
            {foundPart.vendor || "Unknown"} · {foundPart.cost ? `₹${(foundPart.cost * 83).toLocaleString('en-IN', {minimumFractionDigits: 2})}` : "N/A"} · {foundPart.status || "Unknown"}
          </div>
        </div>
      )}
      
      <style>{`
        @keyframes scan { 0% { top: 20%; } 50% { top: 80%; } 100% { top: 20%; } }
        @keyframes pulse { 50% { opacity: 0.3; } }
      `}</style>
    </window.Modal>
  );
}

// ============ GLOBAL SEARCH (⌘K) ============
function GlobalSearchModal({ open, onClose }) {
  const [q, setQ] = React.useState("");
  const [idx, setIdx] = React.useState(0);
  React.useEffect(() => { if (open) { setQ(""); setIdx(0); } }, [open]);

  const data = window.BOM_DATA;
  const results = React.useMemo(() => {
    if (!q.trim()) return null;
    const ql = q.toLowerCase();
    const out = [];
    // BOM parts
    const walk = (rs) => rs.forEach(r => {
      if ((r.pn + " " + r.name).toLowerCase().includes(ql) || (r.barcode && r.barcode.includes(ql))) {
        out.push({ kind: "part", route: "bom", title: r.name, subtitle: r.pn + " · " + r.category + (r.barcode ? " · " + r.barcode : ""), icon: <Icon.Parts size={13}/> });
      }
      if (r.children) walk(r.children);
    });
    walk(data.rows);
    // Vendors
    data.vendors.forEach(v => {
      if (v.name.toLowerCase().includes(ql)) {
        out.push({ kind: "vendor", route: "vendors", title: v.name, subtitle: v.country + " · ★ " + v.rating, icon: <Icon.Vendor size={13}/> });
      }
    });
    // Documents
    data.docs.forEach(d => {
      if (d.name.toLowerCase().includes(ql)) {
        out.push({ kind: "doc", route: "docs", title: d.name, subtitle: d.tag + " · " + d.size, icon: <Icon.Doc size={13}/> });
      }
    });
    // Quick actions
    if ("new po new purchase order order procurement".includes(ql)) out.push({ kind: "action", action: "new-po", title: "Create new PO", subtitle: "Quick action", icon: <Icon.Plus size={13}/> });
    if ("compare diff revision".includes(ql)) out.push({ kind: "action", route: "diff", title: "Compare revisions", subtitle: "Open diff view", icon: <Icon.Diff size={13}/> });
    if ("analytics dashboard kpi".includes(ql)) out.push({ kind: "action", route: "analytics", title: "Analytics dashboard", subtitle: "Open analytics", icon: <Icon.Chart size={13}/> });
    return out.slice(0, 12);
  }, [q]);

  const choose = (r) => {
    onClose();
    if (r.action === "new-po") { window.__nav?.("procurement"); setTimeout(() => window.dispatchEvent(new CustomEvent("open-modal", { detail: "new-po" })), 50); return; }
    if (r.route) window.__nav?.(r.route);
  };

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (!results?.length) return;
      if (e.key === "ArrowDown") { e.preventDefault(); setIdx(i => Math.min(results.length - 1, i + 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setIdx(i => Math.max(0, i - 1)); }
      else if (e.key === "Enter") { e.preventDefault(); choose(results[idx]); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, results, idx]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose} style={{alignItems: "flex-start", paddingTop: "12vh"}}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{width: "min(640px, calc(100vw - 40px))"}}>
        <div style={{display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderBottom: "1px solid var(--line)"}}>
          <Icon.Search size={14}/>
          <input
            autoFocus
            value={q}
            onChange={(e) => { setQ(e.target.value); setIdx(0); }}
            placeholder="Search parts, BOMs, vendors, documents, actions…"
            style={{flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 14, color: "var(--fg)"}}
          />
          <span className="kbd" style={{fontFamily: "var(--font-mono)", fontSize: 10}}>ESC</span>
        </div>
        <div style={{maxHeight: 420, overflowY: "auto"}}>
          {results === null ? (
            <div style={{padding: "20px 16px", color: "var(--fg-3)"}}>
              <div style={{fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10}}>QUICK ACCESS</div>
              {[
                { title: "Open BOM Editor", sub: "ATLAS / Mainframe Rev C", route: "bom", icon: <Icon.Bom size={13}/> },
                { title: "Component Library", sub: "Browse all parts", route: "parts", icon: <Icon.Parts size={13}/> },
                { title: "Procurement Pipeline", sub: "Active POs and RFQs", route: "procurement", icon: <Icon.Cart size={13}/> },
                { title: "Analytics", sub: "Cost trends and scorecards", route: "analytics", icon: <Icon.Chart size={13}/> },
              ].map((r, i) => (
                <button key={i} className="popover-item" style={{padding: "10px 14px"}} onClick={() => { onClose(); window.__nav?.(r.route); }}>
                  <span className="ic">{r.icon}</span>
                  <div style={{flex: 1, textAlign: "left"}}>
                    <div>{r.title}</div>
                    <div style={{fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)"}}>{r.sub}</div>
                  </div>
                  <span className="kbd">↵</span>
                </button>
              ))}
            </div>
          ) : results.length === 0 ? (
            <div style={{padding: 40, textAlign: "center", color: "var(--fg-3)"}}>
              <div style={{fontFamily: "var(--font-mono)", fontSize: 24, marginBottom: 6, color: "var(--fg-4)"}}>∅</div>
              <div style={{fontSize: 12}}>No matches for "{q}"</div>
            </div>
          ) : (
            results.map((r, i) => (
              <button
                key={i}
                className="popover-item"
                style={{padding: "10px 14px", background: i === idx ? "var(--bg-sunk)" : undefined}}
                onMouseEnter={() => setIdx(i)}
                onClick={() => choose(r)}
              >
                <span className="ic">{r.icon}</span>
                <div style={{flex: 1, textAlign: "left", minWidth: 0}}>
                  <div style={{whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"}}>{r.title}</div>
                  <div style={{fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"}}>{r.subtitle}</div>
                </div>
                <span style={{fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--fg-4)", textTransform: "uppercase", letterSpacing: "0.06em"}}>{r.kind}</span>
              </button>
            ))
          )}
        </div>
        <div style={{padding: "8px 14px", borderTop: "1px solid var(--line)", background: "var(--bg-elev)", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)", display: "flex", gap: 14}}>
          <span><span className="kbd">↑↓</span> navigate</span>
          <span><span className="kbd">↵</span> open</span>
          <span style={{marginLeft: "auto"}}>{results?.length || 0} result{results?.length === 1 ? "" : "s"}</span>
        </div>
      </div>
    </div>
  );
}

// ============ PROFILE ============
function ProfileModal({ open, onClose }) {
  return (
    <window.Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Parts size={16}/>}
      title="Profile"
      subtitle="Elena Chen · Engineering Lead"
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={() => { onClose(); window.toast("Profile saved", { kind: "success" }); }}>Save changes</button>
        </>
      }
    >
      <div style={{display: "flex", alignItems: "center", gap: 14, marginBottom: 18, padding: 14, background: "var(--bg-sunk)", borderRadius: "var(--r-2)"}}>
        <span className="avatar" style={{width: 56, height: 56, fontSize: 20}}>EC</span>
        <div style={{flex: 1}}>
          <div style={{fontWeight: 600, fontSize: 14}}>Elena Chen</div>
          <div style={{fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)"}}>ENGINEERING LEAD · 4 projects · 312 contributions</div>
        </div>
        <button className="btn small" onClick={() => window.toast("Photo upload — choose a file")}>Change photo</button>
      </div>
      <div className="field-row">
        <div className="field"><label>Full name</label><input className="input" defaultValue="Elena Chen"/></div>
        <div className="field"><label>Title</label><input className="input" defaultValue="Engineering Lead"/></div>
      </div>
      <div className="field-row">
        <div className="field"><label>Email</label><input className="input mono" defaultValue="elena@blackboxfactories.com"/></div>
        <div className="field"><label>Phone</label><input className="input mono" defaultValue="+1-555-0142"/></div>
      </div>
      <div className="field"><label>Role</label><select className="select"><option>Admin</option><option>Engineering</option><option>Procurement</option><option>Finance</option><option>Viewer</option></select></div>
      <div className="field"><label>Bio</label><textarea className="input" defaultValue="ME/EE generalist. Leading mechanical for ATLAS + HORIZON. Previously @ Boring Co., Skunkworks."/></div>
    </window.Modal>
  );
}

// ============ WORKSPACE SETTINGS ============
function SettingsModal({ open, onClose }) {
  const [tab, setTab] = React.useState("general");
  return (
    <window.Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Settings size={16}/>}
      title="Workspace Settings"
      subtitle="Blackbox · 24 members · 4 projects"
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>Close</button>
          <button className="btn primary" onClick={() => { onClose(); window.toast("Settings saved", { kind: "success" }); }}>Save changes</button>
        </>
      }
    >
      <div style={{display: "grid", gridTemplateColumns: "160px 1fr", gap: 18, minHeight: 420}}>
        <div style={{borderRight: "1px solid var(--line)", paddingRight: 16}}>
          {[
            ["general", "General"],
            ["members", "Members"],
            ["roles", "Roles & permissions"],
            ["integrations", "Integrations"],
            ["billing", "Billing"],
            ["danger", "Danger zone"],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "8px 10px",
                background: tab === id ? "var(--bg-sunk)" : "transparent",
                border: "none",
                borderRadius: "var(--r-2)",
                fontSize: 12,
                cursor: "pointer",
                color: id === "danger" ? "var(--danger)" : "var(--fg)",
                fontWeight: tab === id ? 600 : 400,
                marginBottom: 2,
              }}
            >{label}</button>
          ))}
        </div>
        <div>
          {tab === "general" && (
            <>
              <h3 style={{margin: "0 0 14px", fontSize: 14}}>General</h3>
              <div className="field"><label>Workspace name</label><input className="input" defaultValue="Blackbox Factories"/></div>
              <div className="field"><label>Workspace URL</label><input className="input mono" defaultValue="blackbox.bom.dev"/></div>
              <div className="field-row">
                <div className="field"><label>Default currency</label><select className="select"><option>USD</option><option>EUR</option><option>JPY</option><option>CNY</option></select></div>
                <div className="field"><label>Date format</label><select className="select"><option>YYYY-MM-DD (ISO)</option><option>MM/DD/YYYY</option><option>DD/MM/YYYY</option></select></div>
              </div>
              <div className="field"><label>Description</label><textarea className="input" defaultValue="Internal BOM, procurement, and vendor management for Blackbox internal product dev."/></div>
            </>
          )}
          {tab === "members" && (
            <>
              <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14}}>
                <h3 style={{margin: 0, fontSize: 14}}>Members <span style={{color: "var(--fg-3)", fontWeight: 400}}>(24)</span></h3>
                <button className="btn small" onClick={() => window.toast("Invite sent")}><Icon.Plus size={11}/> Invite</button>
              </div>
              {[
                ["E. Chen", "elena@blackboxfactories.com", "Admin", "EC", ""],
                ["M. Park", "marie@blackboxfactories.com", "Engineering", "MP", "user-2"],
                ["K. Singh", "karan@blackboxfactories.com", "Procurement", "KS", "user-4"],
                ["R. Sato", "ryo@blackboxfactories.com", "Engineering", "RS", "user-3"],
                ["T. Reyes", "tom@blackboxfactories.com", "Finance", "TR", "user-2"],
              ].map((m, i) => (
                <div key={i} style={{display: "grid", gridTemplateColumns: "30px 1fr 130px 80px 24px", gap: 12, alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--line-soft)"}}>
                  <span className={"ava " + m[4]} style={{width: 26, height: 26, fontSize: 10}}>{m[3]}</span>
                  <div>
                    <div style={{fontWeight: 500, fontSize: 12}}>{m[0]}</div>
                    <div style={{fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)"}}>{m[1]}</div>
                  </div>
                  <select className="select" defaultValue={m[2]} style={{height: 26, fontSize: 11}}><option>Admin</option><option>Engineering</option><option>Procurement</option><option>Finance</option><option>Viewer</option></select>
                  <span style={{fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)"}}>active</span>
                  <window.DropdownButton width={160} trigger={<button className="icon-btn" style={{width: 22, height: 22}}><Icon.Dots size={11}/></button>} items={[
                    { icon: <Icon.Edit size={11}/>, label: "Change role", onClick: () => window.toast("Role updated for " + m[0]) },
                    { icon: <Icon.Trash size={11}/>, label: "Remove", danger: true, onClick: () => window.toast(m[0] + " removed", { kind: "warn" }) },
                  ]}/>
                </div>
              ))}
            </>
          )}
          {tab === "roles" && (
            <>
              <h3 style={{margin: "0 0 14px", fontSize: 14}}>Roles & Permissions</h3>
              <div style={{border: "1px solid var(--line)", borderRadius: "var(--r-2)", overflow: "hidden"}}>
                <table className="bom-table" style={{tableLayout: "auto"}}>
                  <thead><tr><th style={{paddingLeft: 12}}>Action</th><th>Admin</th><th>Eng</th><th>Proc</th><th>Fin</th><th>View</th></tr></thead>
                  <tbody>
                    {[
                      ["Create/edit BOMs", true, true, false, false, false],
                      ["Approve revisions", true, true, true, true, false],
                      ["Create POs", true, false, true, false, false],
                      ["View costs", true, true, true, true, true],
                      ["Manage vendors", true, false, true, false, false],
                      ["Delete data", true, false, false, false, false],
                    ].map((r, i) => (
                      <tr key={i}>
                        <td style={{paddingLeft: 12, fontSize: 11}}>{r[0]}</td>
                        {r.slice(1).map((v, j) => (
                          <td key={j}>{v ? <Icon.Check size={12}/> : <span style={{color: "var(--fg-4)"}}>—</span>}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {tab === "integrations" && (
            <>
              <h3 style={{margin: "0 0 14px", fontSize: 14}}>Integrations</h3>
              {[
                ["SolidWorks", "CAD assembly sync", true, "⌬"],
                ["NetSuite", "ERP & finance", false, "$"],
                ["Slack", "Notifications", true, "≡"],
                ["Google Drive", "Document storage", false, "▤"],
                ["Jira", "Issue tracking", false, "▦"],
              ].map((i, idx) => (
                <div key={idx} style={{display: "flex", alignItems: "center", gap: 12, padding: 12, border: "1px solid var(--line)", borderRadius: "var(--r-2)", marginBottom: 8}}>
                  <span style={{width: 32, height: 32, borderRadius: "var(--r-2)", background: "var(--bg-sunk)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", fontSize: 16, color: "var(--fg-2)"}}>{i[3]}</span>
                  <div style={{flex: 1}}>
                    <div style={{fontWeight: 600, fontSize: 12}}>{i[0]}</div>
                    <div style={{fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)"}}>{i[1]}</div>
                  </div>
                  <button className="btn small" style={i[2] ? {background: "var(--ok)", color: "white", borderColor: "var(--ok)"} : {}} onClick={() => window.toast(i[2] ? i[0] + " disconnected" : i[0] + " connected", { kind: i[2] ? "warn" : "success" })}>
                    {i[2] ? <><Icon.Check size={11}/> Connected</> : "Connect"}
                  </button>
                </div>
              ))}
            </>
          )}
          {tab === "billing" && (
            <>
              <h3 style={{margin: "0 0 14px", fontSize: 14}}>Billing</h3>
              <div style={{padding: 16, background: "var(--bg-sunk)", border: "1px solid var(--line)", borderRadius: "var(--r-2)", marginBottom: 14}}>
                <div style={{fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)", letterSpacing: "0.06em", textTransform: "uppercase"}}>CURRENT PLAN</div>
                <div style={{display: "flex", alignItems: "baseline", gap: 10, marginTop: 4}}>
                  <span style={{fontSize: 22, fontWeight: 700}}>Team</span>
                  <span style={{fontFamily: "var(--font-mono)", color: "var(--fg-3)"}}>₹19,920/mo · 24 seats</span>
                </div>
                <div style={{fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)", marginTop: 6}}>Next invoice: 2026-06-12 · Visa **** 4242</div>
              </div>
              <button className="btn" onClick={() => window.toast("Opening billing portal…")}>Manage subscription</button>
              <button className="btn" style={{marginLeft: 8}} onClick={() => window.toast("12 invoices · opening…")}>View invoices</button>
            </>
          )}
          {tab === "danger" && (
            <>
              <h3 style={{margin: "0 0 14px", fontSize: 14, color: "var(--danger)"}}>Danger zone</h3>
              <div style={{padding: 14, border: "1px solid var(--danger)", borderRadius: "var(--r-2)", marginBottom: 12}}>
                <div style={{fontWeight: 600, fontSize: 13}}>Export all data</div>
                <div style={{fontSize: 11, color: "var(--fg-3)", marginTop: 4, marginBottom: 8}}>Download an archive of BOMs, vendors, documents, and audit logs.</div>
                <button className="btn small" onClick={() => window.toast("Preparing full export · email link when ready", { kind: "success" })}>Export</button>
              </div>
              <div style={{padding: 14, border: "1px solid var(--danger)", borderRadius: "var(--r-2)"}}>
                <div style={{fontWeight: 600, fontSize: 13, color: "var(--danger)"}}>Delete workspace</div>
                <div style={{fontSize: 11, color: "var(--fg-3)", marginTop: 4, marginBottom: 8}}>This action cannot be undone. All data will be permanently deleted.</div>
                <button className="btn small" style={{background: "var(--danger)", color: "white", borderColor: "var(--danger)"}} onClick={() => window.toast("Type the workspace name to confirm deletion", { kind: "warn" })}>Delete workspace</button>
              </div>
            </>
          )}
        </div>
      </div>
    </window.Modal>
  );
}

// ============ HELP / SHORTCUTS ============
function HelpModal({ open, onClose }) {
  return (
    <window.Modal
      open={open}
      onClose={onClose}
      icon={<span style={{fontFamily:"var(--font-mono)", fontSize: 14, fontWeight: 700}}>?</span>}
      title="Help & keyboard shortcuts"
      subtitle="Blackbox BOM v3.2 · Press ? anywhere to open"
      wide
      footer={<><button className="btn" onClick={onClose}>Close</button><button className="btn primary" onClick={() => { onClose(); window.toast("Opening docs in new tab…"); }}><Icon.Link size={12}/> Open full docs</button></>}
    >
      <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18}}>
        {[
          ["Global", [
            ["Open search", "⌘ K"],
            ["Open help", "?"],
            ["Toggle dark/light", "⌘ ⇧ L"],
            ["Quick new (PO/Vendor/Part)", "⌘ N"],
          ]],
          ["BOM Editor", [
            ["Expand all", "⌥ ⇧ →"],
            ["Collapse all", "⌥ ⇧ ←"],
            ["Edit cell", "Double-click"],
            ["Select row", "Space"],
            ["Open detail", "↵"],
          ]],
          ["Editing", [
            ["Commit edit", "↵"],
            ["Cancel edit", "Esc"],
            ["Send comment", "⌘ ↵"],
            ["Undo last action", "⌘ Z"],
          ]],
          ["Navigation", [
            ["Go to BOM", "G B"],
            ["Go to Components", "G C"],
            ["Go to Vendors", "G V"],
            ["Go to Procurement", "G P"],
          ]],
        ].map(([section, items], i) => (
          <div key={i}>
            <div style={{fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-3)", marginBottom: 8}}>{section}</div>
            {items.map(([label, key], j) => (
              <div key={j} style={{display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid var(--line-soft)", fontSize: 12}}>
                <span>{label}</span>
                <span style={{fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)", border: "1px solid var(--line)", padding: "1px 6px", borderRadius: 3, background: "var(--bg-sunk)"}}>{key}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </window.Modal>
  );
}

// ============ IMPORT RFQs ============
function ImportRFQsModal({ open, onClose }) {
  const [items, setItems] = React.useState([
    { vendor: "Mean Well", pn: "EL-PSU-240W", qty: 50, unit: 82.50, total: 4125, status: "pending" },
    { vendor: "Daly", pn: "EL-BMS-12S", qty: 25, unit: 58.20, total: 1455, status: "pending" },
    { vendor: "JLCPCB", pn: "EL-PCB-MAIN-R3", qty: 100, unit: 58.40, total: 5840, status: "pending" },
    { vendor: "Edmund Optics", pn: "OPT-LNS-25MM", qty: 30, unit: 184.20, total: 5526, status: "pending" },
  ]);
  const accept = (i) => {
    const next = [...items];
    next[i].status = "accepted";
    setItems(next);
  };
  const reject = (i) => {
    const next = [...items];
    next[i].status = "rejected";
    setItems(next);
  };
  const total = items.filter(i => i.status === "accepted").reduce((s, i) => s + i.total, 0);
  const submit = () => {
    onClose();
    const n = items.filter(i => i.status === "accepted").length;
    if (n > 0) window.toast(`${n} RFQs imported · added to procurement pipeline`, { kind: "success", action: { label: "View", onClick: () => window.__nav?.("procurement") } });
    else window.toast("No RFQs imported", { kind: "warn" });
  };
  return (
    <window.Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Import size={16}/>}
      title="Import RFQs"
      subtitle={`4 quotes detected from inbox · ${window.INR(total, 0)} accepted`}
      wide
      footer={
        <>
          <span className="left">{items.filter(i => i.status === "accepted").length} accepted · {items.filter(i => i.status === "rejected").length} rejected</span>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={submit}>Import accepted ({items.filter(i => i.status === "accepted").length})</button>
        </>
      }
    >
      <div style={{display: "flex", flexDirection: "column", gap: 8}}>
        {items.map((it, i) => (
          <div key={i} style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 80px 100px 110px 80px",
            gap: 10,
            alignItems: "center",
            padding: 12,
            border: "1px solid " + (it.status === "accepted" ? "var(--ok)" : it.status === "rejected" ? "var(--danger)" : "var(--line)"),
            borderRadius: "var(--r-2)",
            background: it.status === "accepted" ? "color-mix(in oklch, var(--ok) 6%, var(--bg))" : it.status === "rejected" ? "color-mix(in oklch, var(--danger) 6%, var(--bg))" : "var(--bg)",
            opacity: it.status === "rejected" ? 0.6 : 1,
          }}>
            <div>
              <div style={{fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)"}}>{it.vendor}</div>
              <div style={{fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600}}>{it.pn}</div>
            </div>
            <div style={{fontSize: 11, color: "var(--fg-2)"}}>RFQ-2026-0{120 + i}</div>
            <div style={{fontFamily: "var(--font-mono)", fontSize: 12, textAlign: "right"}}>×{it.qty}</div>
            <div style={{fontFamily: "var(--font-mono)", fontSize: 12, textAlign: "right"}}>{window.INR(it.unit, 2)}/ea</div>
            <div style={{fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, textAlign: "right"}}>{window.INR(it.total, 0)}</div>
            <div style={{display: "flex", gap: 4, justifyContent: "flex-end"}}>
              <button className="icon-btn" style={{width: 26, height: 26, color: it.status === "accepted" ? "var(--ok)" : "var(--fg-3)"}} onClick={() => accept(i)} title="Accept"><Icon.Check size={12}/></button>
              <button className="icon-btn" style={{width: 26, height: 26, color: it.status === "rejected" ? "var(--danger)" : "var(--fg-3)"}} onClick={() => reject(i)} title="Reject"><Icon.X size={12}/></button>
            </div>
          </div>
        ))}
      </div>
    </window.Modal>
  );
}

Object.assign(window, {
  PODetailModal, VendorDetailModal, CADImportModal, BarcodeScanModal,
  GlobalSearchModal, ProfileModal, SettingsModal, HelpModal, ImportRFQsModal,
});

// ============ QUOTE HISTORY ============
function QuoteHistoryModal({ open, onClose, vendor }) {
  if (!open || !vendor || !vendor.name) return null;
  const quotes = [
    { id: "Q-2026-0182", date: "2026-05-12", pn: "EL-PSU-240W", qty: 100, unit: 82.50, total: 8250, status: "accepted" },
    { id: "Q-2026-0167", date: "2026-04-28", pn: "EL-PSU-240W", qty: 50, unit: 84.00, total: 4200, status: "accepted" },
    { id: "Q-2026-0142", date: "2026-04-08", pn: "EL-PSU-240W", qty: 200, unit: 78.20, total: 15640, status: "accepted" },
    { id: "Q-2026-0124", date: "2026-03-22", pn: "EL-PSU-300W", qty: 25, unit: 112.00, total: 2800, status: "rejected" },
    { id: "Q-2026-0098", date: "2026-02-14", pn: "EL-PSU-240W", qty: 50, unit: 80.50, total: 4025, status: "accepted" },
    { id: "Q-2025-1842", date: "2025-12-05", pn: "EL-PSU-240W", qty: 100, unit: 75.00, total: 7500, status: "accepted" },
    { id: "Q-2025-1721", date: "2025-10-18", pn: "EL-PSU-240W", qty: 50, unit: 74.20, total: 3710, status: "accepted" },
    { id: "Q-2025-1602", date: "2025-09-02", pn: "EL-PSU-160W", qty: 25, unit: 58.00, total: 1450, status: "expired" },
  ];
  const accepted = quotes.filter(q => q.status === "accepted");
  const avgUnit = accepted.reduce((s, q) => s + q.unit, 0) / accepted.length;
  return (
    <window.Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Doc size={16}/>}
      title="Quote history"
      subtitle={`${vendor.name} · ${quotes.length} quotes over 12 months`}
      wide
      footer={<><button className="btn" onClick={onClose}>Close</button><button className="btn primary" onClick={() => { onClose(); window.toast("New RFQ drafted for " + vendor.name); }}><Icon.Cart size={12}/> New RFQ</button></>}
    >
      {/* Stats */}
      <div style={{display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16}}>
        {[
          { l: "Avg unit", v: window.INR(avgUnit, 2), sub: "across " + accepted.length + " accepted" },
          { l: "Acceptance rate", v: Math.round(accepted.length / quotes.length * 100) + "%", sub: accepted.length + " of " + quotes.length },
          { l: "Total value", v: window.INR(accepted.reduce((s, q) => s + q.total, 0), 0), sub: "lifetime" },
          { l: "Best price", v: window.INR(Math.min(...accepted.map(q => q.unit)), 2), sub: "Oct '25" },
        ].map(k => (
          <div key={k.l} style={{padding: 10, border: "1px solid var(--line)", borderRadius: "var(--r-2)", background: "var(--bg)"}}>
            <div style={{fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-3)"}}>{k.l}</div>
            <div style={{fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 600, margin: "2px 0"}}>{k.v}</div>
            <div style={{fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)"}}>{k.sub}</div>
          </div>
        ))}
      </div>
      {/* Quote table */}
      <div style={{border: "1px solid var(--line)", borderRadius: "var(--r-2)", overflow: "hidden"}}>
        <table className="bom-table" style={{tableLayout: "auto"}}>
          <thead>
            <tr>
              <th style={{paddingLeft: 12}}>Quote ID</th>
              <th>Date</th>
              <th>Part No.</th>
              <th className="num">Qty</th>
              <th className="num">Unit</th>
              <th className="num">Total</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {quotes.map(q => (
              <tr key={q.id} onClick={() => window.toast("Opening " + q.id)} style={{cursor: "pointer", opacity: q.status === "expired" ? 0.5 : 1}}>
                <td className="mono" style={{paddingLeft: 12, fontWeight: 600}}>{q.id}</td>
                <td className="mono">{q.date}</td>
                <td className="mono">{q.pn}</td>
                <td className="num mono">{q.qty}</td>
                <td className="num mono">{window.INR(q.unit, 2)}</td>
                <td className="num mono" style={{fontWeight: 600}}>{window.INR(q.total, 0)}</td>
                <td>
                  <span className={"status " + (q.status === "accepted" ? "released" : q.status === "rejected" ? "deprecated" : "obsolete")}>
                    {q.status === "accepted" ? "Accepted" : q.status === "rejected" ? "Rejected" : "Expired"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </window.Modal>
  );
}

// ============ AUTO-SCRAPE (Internet enrichment) ============
function AutoScrapeModal({ open, onClose, row }) {
  const [step, setStep] = React.useState("input");
  const [pn, setPn] = React.useState((row && row.pn) || "");
  const [progress, setProgress] = React.useState(0);
  const [sources, setSources] = React.useState([]);
  const [merged, setMerged] = React.useState({});
  const [selected, setSelected] = React.useState({});

  React.useEffect(() => {
    if (open) {
      setStep("input"); setProgress(0); setSources([]); setMerged({}); setSelected({});
      if (row && row.pn) setPn(row.pn);
    }
  }, [open, row]);

  if (!open) return null;

  const start = () => {
    setStep("scraping");
    setProgress(0);
    const ints = setInterval(() => {
      setProgress(p => {
        const n = p + 14;
        if (n >= 100) {
          clearInterval(ints);
          const fake = {
            "manufacturer": "STMicroelectronics",
            "package": "LQFP-100",
            "core_speed_mhz": 480,
            "flash_mb": 2,
            "ram_mb": 1,
            "voltage_v": "1.62–3.6",
            "operating_temp_c": "-40 to +85",
            "rohs": "Compliant",
            "datasheet_url": "https://st.com/datasheets/stm32h743.pdf",
            "image_url": "https://st.com/img/stm32h743.jpg",
            "market_price_min": 14.20,
            "market_price_max": 22.80,
            "alternate_vendors": "Digi-Key, Mouser, Arrow, RS Components",
          };
          setMerged(fake);
          setSelected(Object.fromEntries(Object.keys(fake).map(k => [k, true])));
          setSources([
            { name: "Manufacturer (ST.com)", fields: 6, confidence: 0.96 },
            { name: "Digi-Key", fields: 4, confidence: 0.92 },
            { name: "Mouser", fields: 4, confidence: 0.90 },
            { name: "OctopartAPI", fields: 8, confidence: 0.85 },
            { name: "FindChips", fields: 3, confidence: 0.71 },
          ]);
          setStep("review");
          return 100;
        }
        return n;
      });
    }, 220);
  };

  const apply = () => {
    onClose();
    const n = Object.values(selected).filter(Boolean).length;
    window.toast(`${n} fields applied to ${pn} · sourced from ${sources.length} websites`, { kind: "success" });
  };

  return (
    <window.Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Sparkles size={16}/>}
      title="Auto-scrape part info"
      subtitle="Pull specs, pricing, alternate vendors and images from the public web"
      wide
      footer={
        step === "review" ? (
          <>
            <span className="left">{Object.values(selected).filter(Boolean).length} fields will be applied</span>
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn primary" onClick={apply}><Icon.Check size={12}/> Apply selected</button>
          </>
        ) : null
      }
    >
      {step === "input" && (
        <>
          <p style={{margin: "0 0 14px", fontSize: 12, color: "var(--fg-3)"}}>Enter a part number — we'll query manufacturer sites, Octopart, Digi-Key, Mouser, and FindChips. You'll review before applying.</p>
          <div className="field"><label>Part number</label><input className="input mono" autoFocus value={pn} onChange={e => setPn(e.target.value)} placeholder="e.g. STM32H743VIT6"/></div>
          <div className="field"><label>Sources to query</label>
            <div style={{display: "flex", flexWrap: "wrap", gap: 6}}>
              {["Manufacturer", "Octopart", "Digi-Key", "Mouser", "Arrow", "FindChips", "RS Components"].map(s => (
                <label key={s} style={{display:"inline-flex", alignItems:"center", gap: 6, padding: "4px 10px", border: "1px solid var(--line)", borderRadius: 99, background: "var(--bg-elev)", fontSize: 11, fontFamily: "var(--font-mono)"}}>
                  <input type="checkbox" defaultChecked className="row-checkbox" style={{width: 11, height: 11}}/>
                  {s}
                </label>
              ))}
            </div>
          </div>
          <div style={{marginTop: 14}}>
            <button className="btn primary" disabled={!pn.trim()} onClick={start}><Icon.Sparkles size={12}/> Start scraping</button>
          </div>
        </>
      )}
      {step === "scraping" && (
        <div style={{padding: "20px 0", textAlign: "center"}}>
          <div style={{fontFamily: "var(--font-mono)", fontSize: 36, color: "var(--accent)", marginBottom: 10}}>⟳</div>
          <div style={{fontSize: 14, fontWeight: 600, marginBottom: 4}}>Querying {sources.length || 5} sources for {pn}…</div>
          <div style={{fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)", marginBottom: 18}}>Merging results · resolving conflicts · scoring confidence</div>
          <div style={{maxWidth: 360, margin: "0 auto"}}>
            <div style={{height: 8, background: "var(--bg-sunk)", borderRadius: 4, overflow: "hidden"}}>
              <div style={{height: "100%", width: progress + "%", background: "var(--accent)", transition: "width 0.2s"}}/>
            </div>
          </div>
          <div style={{marginTop: 24, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)", lineHeight: 1.8, textAlign: "left", maxWidth: 480, margin: "24px auto 0"}}>
            {progress > 10 && <div>→ Querying ST.com/parametrics/{pn} …</div>}
            {progress > 30 && <div>→ Querying digikey.com search?keywords={pn} …</div>}
            {progress > 50 && <div>→ Querying mouser.com/ProductDetail/?{pn} …</div>}
            {progress > 70 && <div>→ Querying octopart.com/search?q={pn} …</div>}
            {progress > 90 && <div>→ Merging 18 fields across 5 sources …</div>}
          </div>
        </div>
      )}
      {step === "review" && (
        <div style={{display: "grid", gridTemplateColumns: "1fr 220px", gap: 16}}>
          <div>
            <div style={{fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-3)", marginBottom: 8}}>Extracted fields</div>
            <div style={{border: "1px solid var(--line)", borderRadius: "var(--r-2)", overflow: "hidden"}}>
              {Object.entries(merged).map(([k, v], i) => (
                <label key={k} style={{display: "grid", gridTemplateColumns: "20px 130px 1fr", gap: 10, padding: "8px 12px", borderBottom: i < Object.keys(merged).length - 1 ? "1px solid var(--line-soft)" : "none", alignItems: "center", cursor: "pointer", background: selected[k] ? "var(--bg)" : "var(--bg-sunk)"}}>
                  <input type="checkbox" className="row-checkbox" checked={!!selected[k]} onChange={(e) => setSelected({ ...selected, [k]: e.target.checked })}/>
                  <span style={{fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.04em"}}>{k.replace(/_/g, " ")}</span>
                  <span style={{fontFamily: "var(--font-mono)", fontSize: 11, color: selected[k] ? "var(--fg)" : "var(--fg-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"}}>{String(v)}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <div style={{fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-3)", marginBottom: 8}}>Sources</div>
            {sources.map(s => (
              <div key={s.name} style={{padding: 10, border: "1px solid var(--line)", borderRadius: "var(--r-2)", marginBottom: 6, background: "var(--bg)"}}>
                <div style={{display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4}}>
                  <span style={{fontWeight: 600, fontSize: 11}}>{s.name}</span>
                  <span style={{fontFamily: "var(--font-mono)", fontSize: 10, color: s.confidence >= 0.9 ? "var(--ok)" : s.confidence >= 0.8 ? "var(--warn)" : "var(--danger)"}}>{Math.round(s.confidence * 100)}%</span>
                </div>
                <div style={{fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)"}}>{s.fields} fields</div>
                <div style={{height: 2, background: "var(--bg-sunk)", borderRadius: 1, marginTop: 4, overflow: "hidden"}}>
                  <div style={{height: "100%", width: (s.confidence * 100) + "%", background: s.confidence >= 0.9 ? "var(--ok)" : s.confidence >= 0.8 ? "var(--warn)" : "var(--danger)"}}/>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </window.Modal>
  );
}

// ============ AUDIT LOG ============
function AuditLogModal({ open, onClose }) {
  const [filter, setFilter] = React.useState("All");
  const events = [
    { at: "2026-05-25 09:42:18", actor: "elena@blackboxfactories.com", action: "created", target: "BOM v3.3.0", details: "Forked from v3.2.0", kind: "create" },
    { at: "2026-05-24 16:08:42", actor: "marie@blackboxfactories.com", action: "edited", target: "EL-MCU-STM32H7", details: "rev A → B; lead 35 → 42", kind: "edit" },
    { at: "2026-05-24 15:11:09", actor: "karan@blackboxfactories.com", action: "approved", target: "PO-2026-0481", details: "₹1,74,300.00 · Mean Well", kind: "approve" },
    { at: "2026-05-24 14:55:33", actor: "system", action: "auto-scraped", target: "EL-MCU-STM32H7", details: "5 sources, 12 fields, 91% confidence", kind: "system" },
    { at: "2026-05-24 11:30:00", actor: "elena@blackboxfactories.com", action: "released", target: "BOM v3.2.0", details: "Rev C locked", kind: "release" },
    { at: "2026-05-23 18:22:15", actor: "ryo@blackboxfactories.com", action: "commented on", target: "EL-PCB-MAIN-R3", details: "Safety stock concern", kind: "comment" },
    { at: "2026-05-23 14:08:01", actor: "system", action: "detected", target: "HW-FAS-M3-08", details: "Duplicate match HW-SCR-M3X8 · 95%", kind: "system" },
    { at: "2026-05-22 17:55:18", actor: "tom@blackboxfactories.com", action: "exported", target: "BOM_v3.1.4.xlsx", details: "412 KB · finance review", kind: "export" },
    { at: "2026-05-22 13:14:42", actor: "marie@blackboxfactories.com", action: "deleted", target: "EL-FAN-80", details: "Replaced by EL-FAN-92", kind: "delete" },
    { at: "2026-05-22 09:00:00", actor: "system", action: "synced", target: "ATL-MFR-A_v3.2.sldasm", details: "87 parts imported from SolidWorks", kind: "system" },
  ];
  const kindIcon = { create: "+", edit: "✎", approve: "✓", release: "▲", comment: "“", export: "↓", delete: "✕", system: "⌬" };
  const kindColor = { create: "var(--ok)", edit: "var(--accent)", approve: "var(--ok)", release: "var(--info)", comment: "var(--fg-3)", export: "var(--fg-2)", delete: "var(--danger)", system: "var(--fg-2)" };
  const filters = ["All", "Edits", "Approvals", "System", "Deletes", "Exports"];
  const matches = (e) => filter === "All" ? true : filter === "Edits" ? (e.kind === "edit" || e.kind === "create") : filter === "Approvals" ? (e.kind === "approve" || e.kind === "release") : filter === "System" ? e.kind === "system" : filter === "Deletes" ? e.kind === "delete" : e.kind === "export";
  const filtered = events.filter(matches);

  return (
    <window.Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Activity size={16}/>}
      title="Audit log"
      subtitle="Tamper-proof event history · all actions recorded"
      wide
      footer={<><button className="btn" onClick={onClose}>Close</button><button className="btn" onClick={() => { onClose(); window.toast("Exporting audit log…"); window.downloadBlob && window.downloadBlob(events.map(e => `${e.at}\t${e.actor}\t${e.action}\t${e.target}\t${e.details}`).join("\n"), "audit_log.txt"); }}><Icon.Export size={12}/> Export TSV</button><button className="btn primary" onClick={() => window.toast("Subscribed to audit alerts")}>Subscribe to alerts</button></>}
    >
      <div style={{display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap"}}>
        {filters.map(f => (
          <span key={f} className={"chip " + (f === filter ? "active" : "")} onClick={() => setFilter(f)} style={{cursor: "pointer"}}>{f} <span style={{color: "var(--fg-4)", marginLeft: 4}}>{events.filter(e => f === "All" ? true : matches({...e})).length}</span></span>
        ))}
      </div>
      <div style={{border: "1px solid var(--line)", borderRadius: "var(--r-2)", overflow: "hidden", maxHeight: 460, overflowY: "auto"}}>
        {filtered.map((e, i) => (
          <div key={i} style={{display: "grid", gridTemplateColumns: "auto 150px 160px 1fr", gap: 12, padding: "10px 14px", borderBottom: i < filtered.length - 1 ? "1px solid var(--line-soft)" : "none", alignItems: "center", fontSize: 11, fontFamily: "var(--font-mono)"}}>
            <span style={{width: 22, height: 22, borderRadius: 4, background: "var(--bg-sunk)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: kindColor[e.kind], fontSize: 12, fontWeight: 700}}>{kindIcon[e.kind]}</span>
            <span style={{color: "var(--fg-3)"}}>{e.at}</span>
            <span>{e.actor}</span>
            <span>
              <span style={{color: "var(--fg-2)"}}>{e.action}</span>{" "}
              <span style={{padding: "0 4px", background: "var(--bg-sunk)", borderRadius: 2, color: "var(--fg)"}}>{e.target}</span>
              <span style={{color: "var(--fg-3)", marginLeft: 8}}>· {e.details}</span>
            </span>
          </div>
        ))}
      </div>
    </window.Modal>
  );
}

// ============ API KEYS ============
function APIKeysModal({ open, onClose }) {
  const [keys, setKeys] = React.useState([
    { id: "ak_live_aZ7…32fK", label: "Production API", created: "2026-01-12", last: "5 min ago", scope: "read+write" },
    { id: "sk_live_19xQ…0Lpm", label: "SolidWorks integration", created: "2026-02-04", last: "2 hr ago", scope: "read+sync" },
    { id: "rk_read_n3jB…X8sR", label: "Analytics dashboard", created: "2025-12-18", last: "yesterday", scope: "read" },
  ]);
  const generate = () => {
    const id = "ak_live_" + Math.random().toString(36).slice(2, 8) + "…" + Math.random().toString(36).slice(2, 6);
    setKeys([{ id, label: "New API key", created: "just now", last: "—", scope: "read+write" }, ...keys]);
    window.toast("New API key generated — copy now, it won't be shown again", { kind: "warn", action: { label: "Copy", onClick: () => window.toast("Copied " + id) } });
  };
  const revoke = (id) => {
    setKeys(keys.filter(k => k.id !== id));
    window.toast("Key revoked", { kind: "warn" });
  };
  return (
    <window.Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Link size={16}/>}
      title="API Keys"
      subtitle={`${keys.length} active key${keys.length === 1 ? "" : "s"} · all requests audited`}
      wide
      footer={<><button className="btn" onClick={onClose}>Close</button><button className="btn primary" onClick={generate}><Icon.Plus size={12}/> Generate new key</button></>}
    >
      <p style={{margin: "0 0 14px", fontSize: 12, color: "var(--fg-3)"}}>Use API keys to authenticate Blackbox BOM API requests. Keep keys secret — anyone with the key can act on your behalf.</p>
      <div style={{border: "1px solid var(--line)", borderRadius: "var(--r-2)", overflow: "hidden"}}>
        <table className="bom-table" style={{tableLayout: "auto"}}>
          <thead>
            <tr>
              <th style={{paddingLeft: 12}}>Key</th>
              <th>Label</th>
              <th>Scope</th>
              <th>Created</th>
              <th>Last used</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {keys.map(k => (
              <tr key={k.id}>
                <td className="mono" style={{paddingLeft: 12, fontWeight: 600}}>{k.id}</td>
                <td>{k.label}</td>
                <td><span className="tag-pill" style={{borderColor: k.scope === "read" ? "var(--info)" : "var(--accent)", color: k.scope === "read" ? "var(--info)" : "var(--accent)"}}>{k.scope}</span></td>
                <td className="mono" style={{color: "var(--fg-3)"}}>{k.created}</td>
                <td className="mono" style={{color: "var(--fg-3)"}}>{k.last}</td>
                <td>
                  <span style={{display: "inline-flex", gap: 2}}>
                    <button className="icon-btn" style={{width: 22, height: 22}} onClick={() => window.toast("Copied " + k.id)} title="Copy"><Icon.Link size={11}/></button>
                    <button className="icon-btn" style={{width: 22, height: 22, color: "var(--danger)"}} onClick={() => revoke(k.id)} title="Revoke"><Icon.Trash size={11}/></button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{marginTop: 18}}>
        <div style={{fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-3)", marginBottom: 6}}>Quick start</div>
        <pre style={{background: "var(--bg-sunk)", padding: 12, borderRadius: "var(--r-2)", border: "1px solid var(--line)", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-2)", overflow: "auto"}}>{`curl https://api.bbox.dev/v1/boms/atlas-mfr-a \\
  -H "Authorization: Bearer ak_live_aZ7…32fK"`}</pre>
      </div>
    </window.Modal>
  );
}

Object.assign(window, { QuoteHistoryModal, AutoScrapeModal, AuditLogModal, APIKeysModal });

// ============ BULK CSV IMPORT ============
function BulkImportModal({ open, onClose }) {
  const [step, setStep] = React.useState("upload"); // upload | mapping | review
  const [csvText, setCsvText] = React.useState("");
  const [rows, setRows] = React.useState([]);
  const [headers, setHeaders] = React.useState([]);
  const [mapping, setMapping] = React.useState({});
  const ctx = window.useAppStore();

  React.useEffect(() => { if (open) { setStep("upload"); setCsvText(""); setRows([]); setHeaders([]); setMapping({}); } }, [open]);

  const FIELDS = ["pn", "name", "rev", "qty", "uom", "category", "vendor", "cost", "lead", "origin", "status"];
  const guess = (h) => {
    const l = h.toLowerCase();
    if (/part.?no|^pn$|sku/.test(l)) return "pn";
    if (/name|desc/.test(l)) return "name";
    if (/^rev|revision/.test(l)) return "rev";
    if (/^qty|quantity/.test(l)) return "qty";
    if (/uom|unit$/.test(l)) return "uom";
    if (/cat/.test(l)) return "category";
    if (/vendor|supplier/.test(l)) return "vendor";
    if (/cost|price/.test(l)) return "cost";
    if (/lead/.test(l)) return "lead";
    if (/origin|country/.test(l)) return "origin";
    if (/status/.test(l)) return "status";
    return "";
  };

  const parseCSV = (text) => {
    const lines = text.trim().split(/\r?\n/);
    if (!lines.length) return;
    const hdrs = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
    const data = lines.slice(1).map(line => {
      const cells = []; let cur = ""; let q = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') q = !q;
        else if (c === "," && !q) { cells.push(cur); cur = ""; }
        else cur += c;
      }
      cells.push(cur);
      return cells;
    });
    setHeaders(hdrs);
    setRows(data);
    const m = {};
    hdrs.forEach((h, i) => { const g = guess(h); if (g) m[g] = i; });
    setMapping(m);
    setStep("mapping");
  };

  const loadSample = () => {
    parseCSV(`Part Number,Description,Rev,Qty,UoM,Category,Vendor,Unit Cost,Lead,Origin,Status
EL-CAP-22UF-50V,Capacitor 22µF 50V,A,12,EA,Electrical,Nichicon,0.18,14,JP,Released
EL-RES-4.7K-1%,Resistor 4.7kΩ 1% 0805,—,48,EA,Electrical,Yageo,0.01,7,TW,Released
EL-DIO-SOD123,Schottky Diode SOD-123,B,8,EA,Electrical,Vishay,0.12,10,DE,Released
EL-CON-MICROHDMI,Connector microHDMI receptacle,A,2,EA,Electrical,Molex,0.84,14,US,Review
MEC-WSH-M3-NL,Nylon Washer M3,—,40,EA,Hardware,McMaster,0.02,2,US,Released
CB-RIBBON-26P,Ribbon Cable 26-pin 200mm,—,2,EA,Cable,3M,3.40,14,US,Released
OPT-DIFF-30,Optical Diffuser 30mm,A,1,EA,Optical,Edmund Optics,18.50,21,US,Released`);
  };

  const onFileChosen = async (file) => {
    const text = await file.text();
    setCsvText(text);
    parseCSV(text);
  };

  const buildPreview = () => rows.map(r => {
    const o = {};
    FIELDS.forEach(f => { if (mapping[f] != null) o[f] = r[mapping[f]]; });
    o.qty = Number(o.qty) || 0;
    o.cost = Number(o.cost) || 0;
    o.lead = Number(o.lead) || 0;
    return o;
  });

  const apply = () => {
    const newRows = buildPreview().map((r, i) => ({
      id: "imp-" + Date.now() + "-" + i,
      pn: r.pn, name: r.name || "(no name)", rev: r.rev || "—",
      qty: r.qty, uom: r.uom || "EA",
      category: r.category || "Hardware",
      vendor: r.vendor || "—",
      cost: r.cost, lead: r.lead, origin: r.origin || "—",
      status: r.status || "Draft",
    }));
    if (ctx?.setRows && ctx.rows) {
      const next = [...ctx.rows];
      if (next[0] && next[0].children) {
        next[0] = { ...next[0], children: [...next[0].children, ...newRows] };
      } else {
        next.push(...newRows);
      }
      ctx.setRows(next);
    }
    onClose();
    window.toast(`Imported ${newRows.length} parts into BOM`, { kind: "success" });
  };

  return (
    <window.Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Import size={16}/>}
      title="Bulk import parts"
      subtitle={step === "upload" ? "Drop a CSV or paste rows" : step === "mapping" ? `Map ${headers.length} columns to BOM fields` : `Review ${rows.length} rows`}
      wide
      footer={
        step === "mapping" ? (
          <>
            <button className="btn" onClick={() => setStep("upload")}>Back</button>
            <button className="btn primary" onClick={() => setStep("review")} disabled={!mapping.pn}>Next: Review</button>
          </>
        ) : step === "review" ? (
          <>
            <span className="left">{rows.length} rows will be appended to the active BOM</span>
            <button className="btn" onClick={() => setStep("mapping")}>Back</button>
            <button className="btn primary" onClick={apply}><Icon.Check size={12}/> Import {rows.length} rows</button>
          </>
        ) : null
      }
    >
      {step === "upload" && (
        <>
          <div
            className="dropzone"
            onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("active"); }}
            onDragLeave={(e) => e.currentTarget.classList.remove("active")}
            onDrop={(e) => {
              e.preventDefault(); e.currentTarget.classList.remove("active");
              const f = e.dataTransfer.files[0];
              if (f) onFileChosen(f);
            }}
            onClick={() => document.getElementById("__bulk-csv-input")?.click()}
          >
            <div className="big">⤓</div>
            <div className="l1">Drop CSV here or click to browse</div>
            <div className="l2">First row = headers. Comma-separated. UTF-8.</div>
          </div>
          <input type="file" id="__bulk-csv-input" accept=".csv,text/csv" style={{display:"none"}} onChange={(e) => e.target.files[0] && onFileChosen(e.target.files[0])}/>
          <div style={{margin: "14px 0 8px", display: "flex", justifyContent: "space-between", alignItems: "center"}}>
            <span className="hint">Or paste CSV directly</span>
            <button className="btn small" onClick={loadSample}><Icon.Sparkles size={11}/> Use sample data</button>
          </div>
          <textarea className="input" style={{minHeight: 140, fontFamily: "var(--font-mono)"}}
            placeholder="Part Number,Description,Qty,Vendor,Cost…"
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}/>
          <div style={{marginTop: 10, display: "flex", justifyContent: "flex-end"}}>
            <button className="btn primary" disabled={!csvText.trim()} onClick={() => parseCSV(csvText)}>Parse CSV →</button>
          </div>
        </>
      )}

      {step === "mapping" && (
        <>
          <p style={{margin: "0 0 14px", fontSize: 12, color: "var(--fg-3)"}}>Match your CSV columns to BOM fields. <strong style={{color:"var(--accent)"}}>Part Number</strong> is required.</p>
          <div style={{display: "grid", gridTemplateColumns: "1fr 24px 1fr", gap: 10, alignItems: "center", maxHeight: 360, overflowY: "auto", paddingRight: 6}}>
            {FIELDS.map(f => (
              <React.Fragment key={f}>
                <div style={{padding: "8px 12px", background: "var(--bg-sunk)", border: "1px solid var(--line)", borderRadius: "var(--r-2)", fontFamily: "var(--font-mono)", fontSize: 12}}>
                  {f} {f === "pn" && <span style={{color: "var(--accent)"}}>*</span>}
                </div>
                <div style={{textAlign: "center", color: "var(--fg-3)"}}>←</div>
                <select className="select" value={mapping[f] ?? ""} onChange={(e) => setMapping({ ...mapping, [f]: e.target.value === "" ? undefined : Number(e.target.value) })}>
                  <option value="">(skip)</option>
                  {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                </select>
              </React.Fragment>
            ))}
          </div>
        </>
      )}

      {step === "review" && (
        <div style={{border: "1px solid var(--line)", borderRadius: "var(--r-2)", overflow: "auto", maxHeight: 400}}>
          <table className="bom-table" style={{tableLayout: "auto"}}>
            <thead><tr>{FIELDS.filter(f => mapping[f] != null).map(f => <th key={f} style={{paddingLeft: 12}}>{f}</th>)}</tr></thead>
            <tbody>
              {buildPreview().map((r, i) => (
                <tr key={i}>
                  {FIELDS.filter(f => mapping[f] != null).map(f => (
                    <td key={f} className="mono" style={{paddingLeft: 12, fontWeight: f === "pn" ? 600 : 400}}>{r[f] || "—"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </window.Modal>
  );
}

// ============ BOM TEMPLATES ============
function BOMTemplatesModal({ open, onClose }) {
  const [tab, setTab] = React.useState("save");
  const [templateName, setTemplateName] = React.useState("");
  const [templates, setTemplates] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const ctx = window.useAppStore();

  // Load templates from API when modal opens
  React.useEffect(() => {
    if (open && window.apiConnected) {
      setLoading(true);
      window.api.bomTemplates.list()
        .then(data => {
          setTemplates(data || []);
          setLoading(false);
        })
        .catch(e => {
          console.warn("Failed to load templates from API:", e);
          // Fallback to localStorage
          try {
            setTemplates(JSON.parse(localStorage.getItem("__bbox_templates") || "[]"));
          } catch { setTemplates([]); }
          setLoading(false);
        });
    }
  }, [open, window.apiConnected]);

  const saveTemplate = async () => {
    if (!templateName.trim() || !ctx) return;
    setSaving(true);
    
    const templateData = {
      name: templateName.trim(),
      bomData: JSON.parse(JSON.stringify(ctx.rows)),
      partCount: ctx.rows.reduce((sum, r) => sum + (r.children ? r.children.length : 1), 0),
      projectCode: ctx.project?.code || null,
    };

    if (window.apiConnected) {
      try {
        const saved = await window.api.bomTemplates.create(templateData);
        setTemplates(prev => [{ ...templateData, id: saved.id, createdAt: saved.createdAt }, ...prev]);
        setTemplateName("");
        window.toast(`Template "${templateData.name}" saved to server`, { kind: "success" });
      } catch (e) {
        console.warn("Failed to save template to API:", e);
        window.toast("Failed to save to server, saving locally", { kind: "warn" });
        // Fallback to localStorage
        const local = { id: "tpl-" + Date.now(), ...templateData, saved: new Date().toISOString().slice(0, 10) };
        const next = [local, ...templates];
        setTemplates(next);
        localStorage.setItem("__bbox_templates", JSON.stringify(next));
        setTemplateName("");
      }
    } else {
      // Offline mode - save to localStorage
      const local = { id: "tpl-" + Date.now(), ...templateData, saved: new Date().toISOString().slice(0, 10) };
      const next = [local, ...templates];
      setTemplates(next);
      localStorage.setItem("__bbox_templates", JSON.stringify(next));
      setTemplateName("");
      window.toast(`Template "${templateData.name}" saved locally`, { kind: "success" });
    }
    setSaving(false);
  };

  const loadTemplate = async (tmpl) => {
    if (!ctx) return;
    
    let bomData = tmpl.bomData || tmpl.rows;
    
    // If template has an ID but no bomData, try loading from API
    if (tmpl.id && !bomData && window.apiConnected) {
      try {
        const loaded = await window.api.bomTemplates.load(tmpl.id);
        bomData = loaded.bomData;
      } catch (e) {
        console.warn("Failed to load template from API:", e);
        window.toast("Failed to load template", { kind: "warn" });
        return;
      }
    }
    
    if (bomData) {
      ctx.setRows(JSON.parse(JSON.stringify(bomData)));
      onClose();
      window.toast(`Template "${tmpl.name || tmpl.name}" loaded into current BOM`, { kind: "success", action: { label: "Undo", onClick: () => ctx.setRows(ctx.rows) } });
    }
  };

  const deleteTemplate = async (id) => {
    if (window.apiConnected) {
      try {
        await window.api.bomTemplates.delete(id);
        setTemplates(prev => prev.filter(t => t.id !== id));
        window.toast("Template deleted from server", { kind: "warn" });
      } catch (e) {
        console.warn("Failed to delete template from API:", e);
        window.toast("Failed to delete from server", { kind: "warn" });
      }
    } else {
      const next = templates.filter(t => t.id !== id);
      setTemplates(next);
      localStorage.setItem("__bbox_templates", JSON.stringify(next));
      window.toast("Template deleted", { kind: "warn" });
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "Unknown date";
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString();
    } catch {
      return dateStr;
    }
  };

  return (
    <window.Modal open={open} onClose={onClose} icon={<Icon.Doc size={16}/>} title="BOM Templates" subtitle="Save and load BOM structures" wide
      footer={<><button className="btn" onClick={onClose}>Close</button></>}>
      <div style={{display: "flex", gap: 6, marginBottom: 14}}>
        {[["save", "Save current BOM"], ["load", "Load template"]].map(([id, label]) => (
          <button key={id} className={"btn small " + (tab === id ? "primary" : "")} onClick={() => setTab(id)}>{label}</button>
        ))}
        {window.apiConnected && <span style={{marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ok)"}}>● Connected to API</span>}
        {!window.apiConnected && <span style={{marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)"}}>○ Offline mode</span>}
      </div>
      {tab === "save" && (
        <div className="field">
          <label>Template name</label>
          <div style={{display: "flex", gap: 8}}>
            <input className="input" autoFocus value={templateName} onChange={e => setTemplateName(e.target.value)} placeholder="e.g. ATLAS chassis template" style={{flex: 1}}/>
            <button className="btn primary" disabled={!templateName.trim() || saving} onClick={saveTemplate}>
              {saving ? "Saving..." : <><Icon.Plus size={12}/> Save</>}
            </button>
          </div>
          {loading && <div style={{marginTop: 10, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)"}}>Loading templates...</div>}
          {!loading && templates.length > 0 && (
            <div style={{marginTop: 14}}>
              <div style={{fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-3)", marginBottom: 8}}>Saved templates ({templates.length})</div>
              {templates.map(t => (
                <div key={t.id} style={{display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: "var(--r-2)", marginBottom: 4}}>
                  <div>
                    <div style={{fontWeight: 600, fontSize: 12}}>{t.name}</div>
                    <div style={{fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)"}}>Saved {formatDate(t.saved || t.createdAt)}</div>
                  </div>
                  <span style={{display: "inline-flex", gap: 4}}>
                    <button className="btn small" onClick={() => loadTemplate(t)}>Load</button>
                    <button className="icon-btn" style={{width: 22, height: 22, color: "var(--danger)"}} onClick={() => deleteTemplate(t.id)}><Icon.Trash size={11}/></button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {tab === "load" && (
        loading ? (
          <div style={{padding: 40, textAlign: "center", color: "var(--fg-3)"}}>Loading templates...</div>
        ) : templates.length === 0 ? (
          <div style={{padding: 40, textAlign: "center", color: "var(--fg-3)"}}>
            <div style={{fontSize: 32, fontFamily: "var(--font-mono)", marginBottom: 6, color: "var(--fg-4)"}}>∅</div>
            <div>No saved templates yet. Save a template first.</div>
          </div>
        ) : (
          <div style={{display: "flex", flexDirection: "column", gap: 6}}>
            {templates.map(t => (
              <div key={t.id} style={{padding: 12, border: "1px solid var(--line)", borderRadius: "var(--r-2)", cursor: "pointer", background: "var(--bg)"}} onClick={() => loadTemplate(t)}>
                <div style={{display: "flex", justifyContent: "space-between", alignItems: "center"}}>
                  <div>
                    <div style={{fontWeight: 600}}>{t.name}</div>
                    <div style={{fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)"}}>Saved {formatDate(t.saved || t.createdAt)}</div>
                  </div>
                  <div><span className="tag-pill">{t.partCount || t.rows?.[0]?.children?.length || 0} parts</span></div>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </window.Modal>
  );
}

// ============ BOM DUPLICATION ============
function BOMDuplicationModal({ open, onClose }) {
  const ctx = window.useAppStore();
  const [name, setName] = React.useState("");
  const [includeRev, setIncludeRev] = React.useState(true);
  const [includeCosts, setIncludeCosts] = React.useState(false);
  const [duplicating, setDuplicating] = React.useState(false);

  React.useEffect(() => {
    if (open && ctx?.project) setName(ctx.project.name + " (Variant)");
  }, [open, ctx]);

  const duplicate = async () => {
    if (!name.trim() || !ctx) return;
    setDuplicating(true);
    
    const newRows = JSON.parse(JSON.stringify(ctx.rows));
    const stamp = Date.now();
    const relabel = (rs) => rs.map(r => ({ ...r, id: r.id + "-dup-" + stamp, children: r.children ? relabel(r.children) : undefined, cost: includeCosts ? r.cost : 0 }));
    const dupRows = relabel(newRows);

    if (window.apiConnected) {
      try {
        // Create a new project via API to represent the duplicated BOM
        const newCode = (ctx.project?.code || "BOM") + "-V" + Math.floor(Math.random() * 100);
        const newProject = await window.api.projects.create({
          code: newCode,
          name: name.trim(),
          description: `Duplicated from ${ctx.project?.name || "BOM"} on ${new Date().toISOString().slice(0, 10)}`,
          status: "active",
        });
        
        // Save the BOM data as a template for the new project
        await window.api.bomTemplates.create({
          name: name.trim(),
          bomData: dupRows,
          partCount: dupRows.reduce((sum, r) => sum + (r.children ? r.children.length : 1), 0),
          projectCode: newCode,
        });
        
        ctx.setRows(dupRows);
        onClose();
        window.toast(`BOM duplicated as "${name}" (${newCode})`, { kind: "success", action: { label: "Switch", onClick: () => { window.__nav?.("bom"); } } });
      } catch (e) {
        console.warn("Failed to duplicate via API:", e);
        // Fallback to local only
        ctx.setRows(dupRows);
        onClose();
        window.toast(`BOM duplicated locally as "${name}"`, { kind: "success", action: { label: "Switch", onClick: () => { window.__nav?.("bom"); } } });
      }
    } else {
      // Offline mode - just duplicate in memory
      ctx.setRows(dupRows);
      onClose();
      window.toast(`BOM duplicated as "${name}"`, { kind: "success", action: { label: "Switch", onClick: () => { window.__nav?.("bom"); } } });
    }
    setDuplicating(false);
  };

  return (
    <window.Modal open={open} onClose={onClose} icon={<Icon.Bom size={16}/>} title="Duplicate BOM" subtitle="Create a variant copy of the current BOM"
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!name.trim() || duplicating} onClick={duplicate}>{duplicating ? "Duplicating..." : <><Icon.Bom size={12}/> Duplicate</>}</button></>}>
      <div className="field"><label>Variant name <span className="req">*</span></label><input className="input" autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. ATLAS - High-temp variant"/></div>
      <div className="field" style={{marginTop: 10}}>
        <label style={{display: "flex", alignItems: "center", gap: 8, cursor: "pointer"}}>
          <input type="checkbox" className="row-checkbox" checked={includeRev} onChange={e => setIncludeRev(e.target.checked)}/>
          <span style={{fontSize: 12}}>Reset revision to A</span>
        </label>
      </div>
      <div className="field">
        <label style={{display: "flex", alignItems: "center", gap: 8, cursor: "pointer"}}>
          <input type="checkbox" className="row-checkbox" checked={includeCosts} onChange={e => setIncludeCosts(e.target.checked)}/>
          <span style={{fontSize: 12}}>Include cost data (clear for fresh costing)</span>
        </label>
      </div>
      {window.apiConnected && (
        <div style={{marginTop: 14, padding: 10, background: "color-mix(in oklch, var(--ok) 8%, var(--bg))", border: "1px solid var(--ok)", borderRadius: "var(--r-2)", fontSize: 11, color: "var(--fg-2)", fontFamily: "var(--font-mono)"}}>
          ● Will create a new project and save BOM to server
        </div>
      )}
      {!window.apiConnected && (
        <div style={{marginTop: 14, padding: 10, background: "var(--bg-sunk)", border: "1px solid var(--line)", borderRadius: "var(--r-2)", fontSize: 11, color: "var(--fg-3)", fontFamily: "var(--font-mono)"}}>
          ○ Offline mode: BOM will be duplicated in browser only
        </div>
      )}
      <div style={{marginTop: 14, padding: 12, background: "var(--bg-sunk)", border: "1px solid var(--line)", borderRadius: "var(--r-2)", fontSize: 11, color: "var(--fg-3)", fontFamily: "var(--font-mono)"}}>
        The duplicated BOM will contain all the same parts and structure. Part IDs will be regenerated to prevent conflicts.
      </div>
    </window.Modal>
  );
}

// ============ ROLLBACK REVISION ============
function RollbackModal({ open, onClose }) {
  const ctx = window.useAppStore();
  const [selectedRev, setSelectedRev] = React.useState(null);
  const [revs, setRevs] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [rollingBack, setRollingBack] = React.useState(false);

  // Default revisions (fallback when API unavailable)
  const defaultRevs = [
    { ver: "v3.2.0", date: "2026-05-12", author: "E. Chen", changes: "+12 parts, −4 removed, 38 changed", bomSnapshot: null },
    { ver: "v3.1.4", date: "2026-04-28", author: "M. Park", changes: "+3 parts, cost −2.4%", bomSnapshot: null },
    { ver: "v3.1.0", date: "2026-03-15", author: "M. Park", changes: "PCB R3, lens added, fan upgrade", bomSnapshot: null },
    { ver: "v3.0.0", date: "2026-01-20", author: "E. Chen", changes: "Initial production release", bomSnapshot: null },
  ];

  // Load revisions from API when modal opens
  React.useEffect(() => {
    if (open) {
      setSelectedRev(null);
      if (window.apiConnected) {
        setLoading(true);
        window.api.revisions.list({ limit: 20 })
          .then(data => {
            if (data && data.length > 0) {
              setRevs(data.map(r => ({
                id: r.id,
                ver: r.revisionNumber || r.version,
                date: r.createdAt ? new Date(r.createdAt).toISOString().slice(0, 10) : "Unknown",
                author: r.createdBy || "System",
                changes: r.description || r.revisionLabel || "No description",
                bomSnapshot: r.bomSnapshot,
              })));
            } else {
              setRevs(defaultRevs);
            }
            setLoading(false);
          })
          .catch(e => {
            console.warn("Failed to load revisions from API:", e);
            setRevs(defaultRevs);
            setLoading(false);
          });
      } else {
        setRevs(defaultRevs);
      }
    }
  }, [open, window.apiConnected]);

  const rollback = async () => {
    if (!selectedRev || !ctx) return;
    setRollingBack(true);
    
    // If revision has a bomSnapshot, restore it
    if (selectedRev.bomSnapshot) {
      ctx.setRows(selectedRev.bomSnapshot);
    }
    
    onClose();
    setRollingBack(false);
    window.toast(`Rolled back to ${selectedRev.ver} · BOM state restored`, { kind: "warn", action: { label: "Undo", onClick: () => window.toast("Current revision restored", { kind: "info" }) } });
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "Unknown";
    try {
      return new Date(dateStr).toLocaleDateString();
    } catch {
      return dateStr;
    }
  };

  return (
    <window.Modal open={open} onClose={onClose} icon={<Icon.Diff size={16}/>} title="Rollback revision" subtitle="Restore a previous revision as the active BOM"
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn" style={{background: "var(--warn)", color: "white", borderColor: "var(--warn)"}} disabled={!selectedRev || rollingBack} onClick={rollback}>{rollingBack ? "Rolling back..." : <><Icon.Diff size={12}/> Rollback to {selectedRev?.ver || "..."}</>}</button></>}>
      <p style={{margin: "0 0 14px", fontSize: 12, color: "var(--fg-3)"}}>Rolling back replaces the current BOM data with the selected revision. The current state is not lost — it remains as the latest revision in history.</p>
      {window.apiConnected && (
        <div style={{marginBottom: 12, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ok)"}}>● Loading revisions from server</div>
      )}
      {!window.apiConnected && (
        <div style={{marginBottom: 12, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)"}}>○ Using default revision history</div>
      )}
      {loading ? (
        <div style={{padding: 30, textAlign: "center", color: "var(--fg-3)", fontFamily: "var(--font-mono)", fontSize: 11}}>Loading revisions...</div>
      ) : (
        <div style={{position: "relative", paddingLeft: 24}}>
          <div style={{position: "absolute", left: 9, top: 4, bottom: 4, width: 1, background: "var(--line)"}}/>
          {revs.map((r, i) => (
            <div key={r.ver || r.id || i} onClick={() => setSelectedRev(r)} style={{
              position: "relative", marginBottom: 10, padding: 12,
              border: "1.5px solid " + (selectedRev?.ver === r.ver ? "var(--accent)" : "var(--line)"),
              borderRadius: "var(--r-2)", cursor: "pointer",
              background: selectedRev?.ver === r.ver ? "var(--accent-soft)" : "var(--bg)",
            }}>
              <div style={{position: "absolute", left: -19, top: 14, width: 12, height: 12, borderRadius: 99,
                background: selectedRev?.ver === r.ver ? "var(--accent)" : "var(--bg)",
                border: "2px solid " + (selectedRev?.ver === r.ver ? "var(--accent)" : "var(--fg-3)")}}/>
              <div style={{display: "flex", justifyContent: "space-between", alignItems: "baseline"}}>
                <span style={{fontFamily: "var(--font-mono)", fontWeight: 700}}>{r.ver}</span>
                <span style={{fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)"}}>{formatDate(r.date)} · {r.author}</span>
              </div>
              <div style={{fontSize: 11, color: "var(--fg-2)", marginTop: 4}}>{r.changes}</div>
              {r.bomSnapshot && <div style={{fontSize: 10, color: "var(--accent)", marginTop: 4}}>Contains BOM snapshot</div>}
            </div>
          ))}
          {revs.length === 0 && !loading && (
            <div style={{padding: 20, textAlign: "center", color: "var(--fg-3)", fontSize: 12}}>No revisions found</div>
          )}
        </div>
      )}
    </window.Modal>
  );
}

// ============ PROCUREMENT ALERTS ============
function ProcurementAlertsModal({ open, onClose }) {
  const [alerts, setAlerts] = React.useState([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setLoading(true);
    (window.api?.procurement?.alerts?.() || Promise.resolve(null))
      .then(data => { if (data) setAlerts(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  const icons = { critical: "\uD83D\uDEA8", warning: "\u26A0", info: "\u2139" };

  return (
    <window.Modal open={open} onClose={onClose} icon={<Icon.Bell size={16}/>} title="Procurement Alerts" subtitle={loading ? "Loading..." : `${alerts.filter(a => a.level === "critical").length} critical \u00B7 ${alerts.filter(a => a.level === "warning").length} warnings`}
      footer={<><button className="btn" onClick={onClose}>Close</button><button className="btn primary" onClick={() => { onClose(); window.toast("All alerts marked as reviewed", { kind: "success" }); }}>Mark all reviewed</button></>}>
      {loading ? (
        <div style={{padding: 24, textAlign: "center", color: "var(--fg-3)"}}>Loading alerts...</div>
      ) : (
        <div style={{display: "flex", flexDirection: "column", gap: 8}}>
          {alerts.map((a, i) => (
            <div key={i} style={{
              padding: 12, border: "1px solid " + (a.level === "critical" ? "var(--danger)" : a.level === "warning" ? "var(--warn)" : "var(--line)"),
              borderRadius: "var(--r-2)", background: a.level === "critical" ? "color-mix(in oklch, var(--danger) 6%, var(--bg))" : "var(--bg)",
              borderLeft: "3px solid " + (a.level === "critical" ? "var(--danger)" : a.level === "warning" ? "var(--warn)" : "var(--info)"),
            }}>
              <div style={{display: "flex", justifyContent: "space-between", alignItems: "flex-start"}}>
                <div style={{flex: 1}}>
                  <div style={{fontWeight: 600, fontSize: 12, display: "flex", alignItems: "center", gap: 6}}>
                    <span>{icons[a.level] || "\u2139"}</span> {a.title}
                  </div>
                  <div style={{fontSize: 11, color: "var(--fg-2)", marginTop: 4}}>{a.desc}</div>
                </div>
                <button className="btn small" onClick={() => window.toast(a.action + " \u2014 opening\u2026")} style={{flexShrink: 0, marginLeft: 8}}>{a.action}</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </window.Modal>
  );
}

// ============ DOCUMENT FOLDER TREE (Documents screen enhancement) ============
function DocumentFolderTree({ folders = [], onSelect, selected }) {
  const [expanded, setExpanded] = React.useState(new Set(["/"]));
  const toggle = (path) => {
    const next = new Set(expanded);
    next.has(path) ? next.delete(path) : next.add(path);
    setExpanded(next);
  };
  return (
    <div style={{fontSize: 12}}>
      {folders.map(f => (
        <div key={f.path}>
          <button onClick={() => { toggle(f.path); onSelect?.(f); }} style={{
            display: "flex", alignItems: "center", gap: 6, width: "100%", textAlign: "left",
            padding: "5px 8px", paddingLeft: 8 + (f.depth || 0) * 16,
            background: selected?.path === f.path ? "var(--bg-sunk)" : "transparent",
            border: "none", borderRadius: "var(--r-2)", cursor: "pointer", fontSize: 12,
            color: selected?.path === f.path ? "var(--fg)" : "var(--fg-2)", fontWeight: selected?.path === f.path ? 600 : 400,
          }}>
            {f.children ? (expanded.has(f.path) ? "▼" : "▶") : <span style={{width: 10}}/>}
            <span>{f.icon || "📁"}</span>
            <span>{f.label}</span>
            {f.count != null && <span style={{marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)"}}>{f.count}</span>}
          </button>
          {f.children && expanded.has(f.path) && (
            <DocumentFolderTree folders={f.children} onSelect={onSelect} selected={selected}/>
          )}
        </div>
      ))}
    </div>
  );
}
window.DocumentFolderTree = DocumentFolderTree;

Object.assign(window, { BulkImportModal, BOMTemplatesModal, BOMDuplicationModal, RollbackModal, ProcurementAlertsModal });
