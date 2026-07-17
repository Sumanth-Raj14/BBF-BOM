// PDM / CAD Vault feature set: vault tree, check-in/out, CAD revision history,
// 3D viewer, drawing markup, CAD attribute extraction, bidirectional sync,
// drawing release workflow, watermarking.

// ============ PDM VAULT SCREEN ============
function PDMVaultScreen() {
  const ctx = window.useAppStore();
  const [selectedPath, setSelectedPath] = React.useState("/ATLAS/Mainframe/CAD");
  const [vaultStats, setVaultStats] = React.useState(null);

  // Load vault stats from API
  React.useEffect(() => {
    window.cadAPI?.vaultStats().then(result => {
      if (result) setVaultStats(result);
    }).catch(() => {});
  }, []);

  // Per-folder file sets so clicking the tree actually changes contents
  const FILES_BY_PATH = {
    "/": [
      { name: "Workspace_archive.zip", ext: "ZIP", size: "412 MB", rev: "—", checked_out: null, modified: "2026-04-30", author: "System", state: "released", path: "/" },
    ],
    "/ATLAS": [
      { name: "ATLAS_master_BOM.xlsx", ext: "XLSX", size: "248 KB", rev: "C", checked_out: null, modified: "2026-05-12", author: "E. Chen", state: "released", path: "/ATLAS" },
      { name: "ATLAS_project_charter.PDF", ext: "PDF", size: "1.1 MB", rev: "A", checked_out: null, modified: "2026-02-10", author: "E. Chen", state: "released", path: "/ATLAS" },
    ],
    "/ATLAS/Mainframe": [
      { name: "Mainframe_overview.PDF", ext: "PDF", size: "2.4 MB", rev: "C", checked_out: null, modified: "2026-05-12", author: "E. Chen", state: "released", path: "/ATLAS/Mainframe" },
    ],
    "/ATLAS/Mainframe/CAD": [
      { name: "ATL-MFR-A_v3.2.SLDASM", ext: "SLDASM", size: "8.4 MB", rev: "C", checked_out: null, modified: "2026-05-12", author: "E. Chen", state: "released" },
      { name: "ATL-MFR-CHS_v2.SLDPRT", ext: "SLDPRT", size: "1.2 MB", rev: "B", checked_out: "M. Park", modified: "2026-05-24", author: "M. Park", state: "wip" },
      { name: "ATL-MFR-PWR_v1.SLDPRT", ext: "SLDPRT", size: "924 KB", rev: "A", checked_out: null, modified: "2026-05-09", author: "R. Sato", state: "released" },
      { name: "MEC-PL-040A.STEP", ext: "STEP", size: "612 KB", rev: "D", checked_out: null, modified: "2026-05-12", author: "E. Chen", state: "released" },
      { name: "MEC-PL-040A_drawing.PDF", ext: "PDF", size: "184 KB", rev: "D", checked_out: null, modified: "2026-05-12", author: "E. Chen", state: "released" },
      { name: "EL-PCB-MAIN-R3.zip", ext: "ZIP", size: "3.4 MB", rev: "C", checked_out: null, modified: "2026-05-09", author: "R. Sato", state: "review" },
      { name: "Chassis_3D_v3.STEP", ext: "STEP", size: "8.7 MB", rev: "B", checked_out: "E. Chen", modified: "2026-05-25", author: "E. Chen", state: "wip" },
    ],
    "/ATLAS/Mainframe/Drawings": [
      { name: "MEC-PL-040A_drawing.PDF", ext: "PDF", size: "184 KB", rev: "D", checked_out: null, modified: "2026-05-12", author: "E. Chen", state: "released" },
      { name: "MEC-PL-041A_drawing.PDF", ext: "PDF", size: "210 KB", rev: "B", checked_out: null, modified: "2026-05-09", author: "M. Park", state: "review" },
      { name: "Chassis_assembly.PDF", ext: "PDF", size: "892 KB", rev: "C", checked_out: null, modified: "2026-05-12", author: "E. Chen", state: "draft" },
      { name: "Mainframe_exploded.PDF", ext: "PDF", size: "1.4 MB", rev: "A", checked_out: null, modified: "2026-05-08", author: "E. Chen", state: "released" },
      { name: "Schematic_main_R3.PDF", ext: "PDF", size: "640 KB", rev: "C", checked_out: null, modified: "2026-05-09", author: "R. Sato", state: "released" },
    ],
    "/ATLAS/Mainframe/Datasheets": [
      { name: "STM32H743_datasheet.PDF", ext: "PDF", size: "4.2 MB", rev: "B", checked_out: null, modified: "2026-05-12", author: "STMicro", state: "released" },
      { name: "MeanWell_PSU_240W.PDF", ext: "PDF", size: "1.8 MB", rev: "A", checked_out: null, modified: "2026-04-22", author: "Mean Well", state: "released" },
      { name: "IMX477_specs.PDF", ext: "PDF", size: "2.1 MB", rev: "A", checked_out: null, modified: "2026-04-28", author: "Sony", state: "released" },
      { name: "Daly_BMS_12S.PDF", ext: "PDF", size: "924 KB", rev: "C", checked_out: null, modified: "2026-04-15", author: "Daly", state: "released" },
    ],
    "/ATLAS/Mainframe/Tests": [
      { name: "Thermal_test_report.PDF", ext: "PDF", size: "892 KB", rev: "A", checked_out: null, modified: "2026-05-07", author: "M. Park", state: "released" },
      { name: "EMC_compliance_results.PDF", ext: "PDF", size: "1.2 MB", rev: "A", checked_out: null, modified: "2026-05-02", author: "Intertek", state: "released" },
      { name: "Burn_in_24h.xlsx", ext: "XLSX", size: "186 KB", rev: "—", checked_out: null, modified: "2026-04-30", author: "R. Sato", state: "released" },
    ],
    "/ATLAS/Eval": [
      { name: "ATL-EV-A_v1.SLDASM", ext: "SLDASM", size: "2.8 MB", rev: "A", checked_out: null, modified: "2026-05-08", author: "R. Sato", state: "draft" },
      { name: "Eval_board_schematic.PDF", ext: "PDF", size: "412 KB", rev: "A", checked_out: null, modified: "2026-05-08", author: "R. Sato", state: "draft" },
    ],
    "/HORIZON": [
      { name: "HORIZON_charter.PDF", ext: "PDF", size: "780 KB", rev: "A", checked_out: null, modified: "2026-04-12", author: "M. Park", state: "released" },
    ],
    "/HORIZON/Pod": [
      { name: "HZN-POD-A_v1.4.SLDASM", ext: "SLDASM", size: "4.2 MB", rev: "B", checked_out: null, modified: "2026-05-21", author: "M. Park", state: "review" },
      { name: "MEC-SHELL-A.STEP", ext: "STEP", size: "1.4 MB", rev: "B", checked_out: null, modified: "2026-05-18", author: "M. Park", state: "released" },
      { name: "Pod_drawing_pkg.zip", ext: "ZIP", size: "5.8 MB", rev: "A", checked_out: null, modified: "2026-05-19", author: "M. Park", state: "review" },
    ],
    "/_archive": [
      { name: "ATL-MFR-A_v2.0_LEGACY.SLDASM", ext: "SLDASM", size: "7.2 MB", rev: "Z", checked_out: null, modified: "2025-09-12", author: "E. Chen", state: "released" },
      { name: "Old_camera_module.STEP", ext: "STEP", size: "1.1 MB", rev: "D", checked_out: null, modified: "2025-08-04", author: "Archive", state: "released" },
    ],
  };

  const [filesByPath, setFilesByPath] = React.useState(FILES_BY_PATH);
  const files = filesByPath[selectedPath] || [];
  const [previewFile, setPreviewFile] = React.useState(null);

  const tree = [
    { path: "/", label: "Workspace", icon: <Icon.Folder size={14}/> },
    { path: "/ATLAS", label: "ATLAS", icon: <Icon.Folder size={14}/>, indent: 1 },
    { path: "/ATLAS/Mainframe", label: "Mainframe", icon: <Icon.Folder size={14}/>, indent: 2 },
    { path: "/ATLAS/Mainframe/CAD", label: "CAD", icon: <Icon.Folder size={14}/>, indent: 3, count: FILES_BY_PATH["/ATLAS/Mainframe/CAD"].length },
    { path: "/ATLAS/Mainframe/Drawings", label: "Drawings", icon: <Icon.Folder size={14}/>, indent: 3, count: FILES_BY_PATH["/ATLAS/Mainframe/Drawings"].length },
    { path: "/ATLAS/Mainframe/Datasheets", label: "Datasheets", icon: <Icon.Folder size={14}/>, indent: 3, count: FILES_BY_PATH["/ATLAS/Mainframe/Datasheets"].length },
    { path: "/ATLAS/Mainframe/Tests", label: "Test Reports", icon: <Icon.Folder size={14}/>, indent: 3, count: FILES_BY_PATH["/ATLAS/Mainframe/Tests"].length },
    { path: "/ATLAS/Eval", label: "Eval Board", icon: <Icon.Folder size={14}/>, indent: 2, count: FILES_BY_PATH["/ATLAS/Eval"].length },
    { path: "/HORIZON", label: "HORIZON", icon: <Icon.Folder size={14}/>, indent: 1 },
    { path: "/HORIZON/Pod", label: "Sensor Pod", icon: <Icon.Folder size={14}/>, indent: 2, count: FILES_BY_PATH["/HORIZON/Pod"].length },
    { path: "/_archive", label: "Archive", icon: <Icon.Doc size={14}/>, indent: 1, count: FILES_BY_PATH["/_archive"].length },
  ];

  const toggleCheckout = (i) => {
    const f = files[i];
    const me = "E. Chen";
    if (f.checked_out === me) {
      const next = files.map((x, j) => j === i ? { ...x, checked_out: null } : x);
      setFilesByPath({ ...filesByPath, [selectedPath]: next });
      window.toast(`Checked in ${f.name} · others can now edit`, { kind: "success" });
    } else if (f.checked_out) {
      window.toast(`Cannot check out — locked by ${f.checked_out}`, { kind: "warn" });
    } else {
      const next = files.map((x, j) => j === i ? { ...x, checked_out: me } : x);
      setFilesByPath({ ...filesByPath, [selectedPath]: next });
      window.toast(`Checked out ${f.name} · locked for your edits`, { kind: "success" });
    }
  };

  return (
    <div className="screen-wrap" style={{padding: 0, display: "flex", height: "100%", minHeight: 0, overflow: "hidden"}}>
      {/* Tree sidebar */}
      <aside style={{width: 240, flexShrink: 0, borderRight: "1px solid var(--line)", background: "var(--bg-elev)", padding: 14, overflowY: "auto", overflowX: "hidden"}}>
        <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10}}>
          <div style={{fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-3)"}}>Vault</div>
          <button className="icon-btn" style={{width: 22, height: 22}} title="New folder" onClick={() => window.toast("New folder")}><Icon.Plus size={11}/></button>
        </div>
        {tree.map(n => (
          <button key={n.path} onClick={() => setSelectedPath(n.path)} style={{
            display: "block", width: "100%", textAlign: "left",
            padding: "5px 8px", paddingLeft: 8 + (n.indent || 0) * 14,
            background: selectedPath === n.path ? "var(--bg-sunk)" : "transparent",
            color: selectedPath === n.path ? "var(--fg)" : "var(--fg-2)",
            border: "none", borderRadius: "var(--r-2)",
            fontSize: 12, cursor: "pointer", marginBottom: 1,
            fontFamily: selectedPath === n.path ? "var(--font-sans)" : "var(--font-sans)",
            fontWeight: selectedPath === n.path ? 600 : 400,
          }}>
            {n.icon} {n.label}
            {n.count && <span style={{float: "right", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)"}}>{n.count}</span>}
          </button>
        ))}
      </aside>

      {/* Main content */}
      <div style={{flex: 1, padding: 20, overflow: "auto", minWidth: 0, minHeight: 0}}>
        <div className="screen-header">
          <div>
            <h1>PDM Vault</h1>
            <div className="sub" style={{fontFamily: "var(--font-mono)", color: "var(--fg-3)", fontSize: 11}}>{selectedPath} · {files.length} files · 2 checked out</div>
          </div>
          <div style={{display: "flex", gap: 8}}>
            <button className="btn" onClick={() => ctx?.openModal("cad-sync")}><Icon.Import size={12}/> Sync from CAD</button>
            <button className="btn" onClick={() => ctx?.openModal("upload")}><Icon.Plus size={12}/> Upload</button>
            <button className="btn primary" onClick={() => ctx?.openModal("drawing-release")}><Icon.Check size={12}/> Release drawings</button>
          </div>
        </div>

        <div className="card">
          <table className="bom-table" style={{tableLayout: "auto"}}>
            <thead><tr>
              <th style={{paddingLeft: 16}}>File</th>
              <th>Rev</th>
              <th>Size</th>
              <th>Checked out</th>
              <th>State</th>
              <th>Modified</th>
              <th></th>
            </tr></thead>
            <tbody>
              {files.map((f, i) => (
                <tr key={f.name} onClick={() => setPreviewFile(f)} style={{cursor: "pointer", background: f.checked_out === "E. Chen" ? "color-mix(in oklch, var(--accent) 6%, var(--bg))" : undefined}}>
                  <td style={{paddingLeft: 16}}>
                    <div style={{display: "flex", alignItems: "center", gap: 8}}>
                      <span style={{padding: "2px 5px", background: "var(--fg)", color: "var(--bg)", fontFamily: "var(--font-mono)", fontSize: 9, borderRadius: 2, letterSpacing: "0.06em"}}>{f.ext}</span>
                      <span style={{fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 500}}>{f.name}</span>
                      {f.checked_out && <span title={"Locked by " + f.checked_out} style={{
                        fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--warn)",
                        display: "inline-flex", alignItems: "center", gap: 2,
                        background: "color-mix(in oklch, var(--warn) 14%, var(--bg))",
                        padding: "1px 5px", borderRadius: 3, border: "1px solid color-mix(in oklch, var(--warn) 30%, transparent)",
                      }}>
                        <Icon.X size={9}/> LOCKED
                      </span>}
                    </div>
                  </td>
                  <td className="mono">{f.rev}</td>
                  <td className="mono" style={{color: "var(--fg-3)"}}>{f.size}</td>
                  <td>
                    {f.checked_out ? (
                      <span style={{fontFamily: "var(--font-mono)", fontSize: 11, color: f.checked_out === "E. Chen" ? "var(--accent)" : "var(--warn)"}}>{f.checked_out}{f.checked_out === "E. Chen" && " (you)"}</span>
                    ) : <span style={{color: "var(--fg-4)", fontFamily: "var(--font-mono)", fontSize: 11}}>—</span>}
                  </td>
                  <td>
                    <span className={"status " + (f.state === "released" ? "released" : f.state === "review" ? "review" : "draft")}>{f.state.toUpperCase()}</span>
                  </td>
                  <td className="mono" style={{color: "var(--fg-3)"}}>{f.modified}<div style={{fontSize: 9}}>{f.author}</div></td>
                  <td onClick={e => e.stopPropagation()}>
                    <span style={{display: "inline-flex", gap: 2}}>
                      <button className="icon-btn" style={{width: 22, height: 22}} onClick={() => toggleCheckout(i)} title={f.checked_out === "E. Chen" ? "Check in" : "Check out"}>{f.checked_out === "E. Chen" ? <Icon.Check size={11}/> : <Icon.X size={11}/>}</button>
                      <window.DropdownButton width={180} trigger={<button className="icon-btn" style={{width: 22, height: 22}}><Icon.Dots size={11}/></button>} items={[
                        { icon: <Icon.Chevron size={11}/>, label: "Preview / View 3D", onClick: () => setPreviewFile(f) },
                        { icon: <Icon.Diff size={11}/>, label: "Revision history", onClick: () => ctx?.openModal("cad-revisions", f) },
                        { icon: <Icon.Search size={11}/>, label: "Where used in CAD", onClick: () => ctx?.openModal("cad-where-used", f) },
                        { icon: <Icon.Edit size={11}/>, label: "Markup drawing", onClick: () => ctx?.openModal("cad-markup", f) },
                        { icon: <Icon.Export size={11}/>, label: "Download", onClick: () => window.toast("Downloaded " + f.name, { kind: "success" }) },
                        "divider",
                        { icon: <Icon.Sparkles size={11}/>, label: "Extract attributes", onClick: () => ctx?.openModal("cad-attrs", f) },
                      ]}/>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Stats */}
        <div style={{marginTop: 14, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10}}>
          {[
            { l: "Total files", v: vaultStats?.totalFiles || 182 },
            { l: "Checked out", v: vaultStats?.checkedOut || 2 },
            { l: "Pending review", v: vaultStats?.pendingReview || 1 },
            { l: "Vault size", v: vaultStats?.vaultSize || "412 MB" },
          ].map((k, i) => <div key={i} className="kpi"><div className="l">{k.l}</div><div className="v">{k.v}</div></div>)}
        </div>
      </div>

      {/* Preview panel */}
      {previewFile && <div style={{width: 460, flexShrink: 0, display: "flex", flexDirection: "column", minHeight: 0}}><CADPreview file={previewFile} onClose={() => setPreviewFile(null)}/></div>}
    </div>
  );
}

// ============ CAD 3D PREVIEW (faux 3D using SVG) ============
function CADPreview({ file, onClose }) {
  const [rot, setRot] = React.useState({ x: -15, y: 25, z: 0 });
  const [zoom, setZoom] = React.useState(1);
  const dragRef = React.useRef(null);
  const dragging = React.useRef(false);
  const last = React.useRef({ x: 0, y: 0 });

  const onMouseDown = (e) => { dragging.current = true; last.current = { x: e.clientX, y: e.clientY }; };
  const onMouseMove = (e) => {
    if (!dragging.current) return;
    const dx = e.clientX - last.current.x;
    const dy = e.clientY - last.current.y;
    last.current = { x: e.clientX, y: e.clientY };
    setRot(r => ({ ...r, y: r.y + dx * 0.5, x: Math.max(-89, Math.min(89, r.x - dy * 0.5)) }));
  };
  const onMouseUp = () => { dragging.current = false; };
  React.useEffect(() => {
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => { document.removeEventListener("mousemove", onMouseMove); document.removeEventListener("mouseup", onMouseUp); };
  }, []);

  // 3D-ish wireframe box rendered using CSS transforms
  return (
    <div style={{flex: 1, borderLeft: "1px solid var(--line)", background: "var(--bg-elev)", display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden"}}>
      <div style={{padding: 12, borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center"}}>
        <div>
          <div style={{fontWeight: 600, fontSize: 13}}>{file.name}</div>
          <div style={{fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)"}}>{file.ext} · Rev {file.rev} · {file.size}</div>
        </div>
        <button className="icon-btn" style={{width: 26, height: 26}} onClick={onClose}><Icon.X size={12}/></button>
      </div>

      <div style={{flex: 1, padding: 20, background: "var(--bg-sunk)", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden", cursor: dragging.current ? "grabbing" : "grab", perspective: 1000}} onMouseDown={onMouseDown}>
        <div ref={dragRef} style={{width: 200 * zoom, height: 140 * zoom, position: "relative", transformStyle: "preserve-3d", transform: `rotateX(${rot.x}deg) rotateY(${rot.y}deg) rotateZ(${rot.z}deg)`, transition: dragging.current ? "none" : "transform 0.1s"}}>
          {/* 6 faces of a box */}
          {[
            { t: "translateZ(70px)", c: "oklch(0.7 0.06 60)" },
            { t: "translateZ(-70px) rotateY(180deg)", c: "oklch(0.55 0.06 60)" },
            { t: "translateX(100px) rotateY(90deg)", c: "oklch(0.65 0.06 60)" },
            { t: "translateX(-100px) rotateY(-90deg)", c: "oklch(0.6 0.06 60)" },
            { t: "translateY(-70px) rotateX(90deg)", c: "oklch(0.75 0.06 60)" },
            { t: "translateY(70px) rotateX(-90deg)", c: "oklch(0.5 0.06 60)" },
          ].map((f, i) => (
            <div key={i} style={{position: "absolute", inset: 0, background: f.c, border: "1.5px solid #1a1a1a", transform: f.t, opacity: 0.85}}/>
          ))}
        </div>
        {/* Tri-axis indicator */}
        <div style={{position: "absolute", bottom: 10, left: 10, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)"}}>
          <div>X: {rot.x.toFixed(0)}°</div>
          <div>Y: {rot.y.toFixed(0)}°</div>
          <div>Z: {rot.z.toFixed(0)}°</div>
        </div>
        <div style={{position: "absolute", top: 10, right: 10, display: "flex", gap: 4}}>
          <button className="icon-btn" style={{width: 26, height: 26}} onClick={() => setZoom(z => Math.min(2, z * 1.2))}>+</button>
          <button className="icon-btn" style={{width: 26, height: 26}} onClick={() => setZoom(z => Math.max(0.5, z / 1.2))}>−</button>
          <button className="icon-btn" style={{width: 26, height: 26}} onClick={() => { setRot({x:-15,y:25,z:0}); setZoom(1); }}>⟲</button>
        </div>
      </div>

      <div style={{padding: 12, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)", borderTop: "1px solid var(--line)"}}>
        Drag to rotate · Scroll to zoom · Auto-extracted: 120×80×12mm, 89g, Aluminum 6061-T6
      </div>
    </div>
  );
}

// ============ CAD REVISION HISTORY ============
function CADRevisionsModal({ open, onClose, file }) {
  if (!open || !file) return null;
  const revs = [
    { rev: "C", date: "2026-05-12", author: "E. Chen", note: "Vented top plate cutout sized for 92mm fan", size: file.size, current: file.rev === "C" },
    { rev: "B", date: "2026-04-22", author: "M. Park", note: "Wall thickness 2mm → 2.5mm for stiffness", size: "8.1 MB", current: file.rev === "B" },
    { rev: "A", date: "2026-03-08", author: "E. Chen", note: "Initial release", size: "7.8 MB", current: file.rev === "A" },
  ];
  return (
    <window.Modal open={open} onClose={onClose} icon={<Icon.Diff size={16}/>} title={`Revision history · ${file.name}`} subtitle={`${revs.length} revisions tracked`} wide>
      <div style={{position: "relative", paddingLeft: 24}}>
        <div style={{position: "absolute", left: 9, top: 4, bottom: 4, width: 1, background: "var(--line)"}}/>
        {revs.map((r, i) => (
          <div key={r.rev} style={{position: "relative", marginBottom: 16, padding: 14, background: r.current ? "var(--accent-soft)" : "var(--bg)", border: "1px solid " + (r.current ? "var(--accent)" : "var(--line)"), borderRadius: "var(--r-2)"}}>
            <div style={{position: "absolute", left: -19, top: 16, width: 12, height: 12, borderRadius: 99, background: r.current ? "var(--accent)" : "var(--bg)", border: "2px solid " + (r.current ? "var(--accent)" : "var(--fg-3)")}}/>
            <div style={{display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6}}>
              <div style={{display: "flex", gap: 8, alignItems: "baseline"}}>
                <span style={{fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 14}}>Rev {r.rev}</span>
                {r.current && <span className="tag-pill" style={{background: "var(--accent)", color: "white", borderColor: "var(--accent)"}}>CURRENT</span>}
              </div>
              <span style={{fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)"}}>{r.date} · {r.author} · {r.size}</span>
            </div>
            <div style={{fontSize: 12, color: "var(--fg-2)", marginBottom: 8}}>{r.note}</div>
            <div style={{display: "flex", gap: 6}}>
              <button className="btn small" onClick={() => window.toast("Downloaded Rev " + r.rev)}><Icon.Export size={11}/> Download</button>
              <button className="btn small" onClick={() => window.toast("Comparing Rev " + r.rev + " ↔ current")}><Icon.Diff size={11}/> Compare</button>
              {!r.current && <button className="btn small" onClick={() => { onClose(); window.toast("Restored Rev " + r.rev + " as current", { kind: "warn" }); }}>Restore as current</button>}
            </div>
          </div>
        ))}
      </div>
    </window.Modal>
  );
}

// ============ CAD WHERE-USED ============
function CADWhereUsedModal({ open, onClose, file }) {
  if (!open || !file) return null;
  const refs = [
    { project: "ATLAS / Mainframe", path: "/CAD/ATL-MFR-A_v3.2.SLDASM", instances: 2, status: "Released" },
    { project: "ATLAS / Mainframe", path: "/CAD/Service spares/SVC-001.SLDASM", instances: 4, status: "Released" },
    { project: "ATLAS-LITE / Eval", path: "/CAD/ATL-EV-A_v1.SLDASM", instances: 1, status: "Draft" },
    { project: "HORIZON / Sensor Pod", path: "/CAD/HZN-POD-A_v1.4.SLDASM", instances: 0, status: "Archived" },
  ];
  return (
    <window.Modal open={open} onClose={onClose} icon={<Icon.Search size={16}/>} title={`Where used · ${file.name}`} subtitle={`Referenced by ${refs.filter(r => r.instances > 0).length} active assemblies`}>
      {refs.map((r, i) => (
        <div key={i} style={{padding: 10, border: "1px solid var(--line)", borderRadius: "var(--r-2)", marginBottom: 6, opacity: r.instances === 0 ? 0.5 : 1}}>
          <div style={{display: "flex", justifyContent: "space-between", alignItems: "baseline"}}>
            <div>
              <div style={{fontWeight: 600, fontSize: 12}}>{r.project}</div>
              <div style={{fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)"}}>{r.path}</div>
            </div>
            <div style={{textAlign: "right"}}>
              <div style={{fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700}}>×{r.instances}</div>
              <div style={{fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--fg-3)"}}>{r.status}</div>
            </div>
          </div>
        </div>
      ))}
    </window.Modal>
  );
}

// ============ DRAWING MARKUP ============
function CADMarkupModal({ open, onClose, file }) {
  const [tool, setTool] = React.useState("rect");
  const [marks, setMarks] = React.useState([]);
  const svgRef = React.useRef(null);

  React.useEffect(() => { if (open) setMarks([]); }, [open]);
  if (!open || !file) return null;

  const onClick = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (tool === "rect") setMarks([...marks, { type: "rect", x: x - 30, y: y - 20, w: 60, h: 40, color: "var(--danger)", id: Date.now() }]);
    else if (tool === "text") {
      const txt = prompt("Enter markup text:", "Check tolerance");
      if (txt) setMarks([...marks, { type: "text", x, y, text: txt, color: "var(--danger)", id: Date.now() }]);
    } else if (tool === "arrow") setMarks([...marks, { type: "arrow", x: x - 60, y: y - 30, x2: x, y2: y, color: "var(--danger)", id: Date.now() }]);
  };

  return (
    <window.Modal open={open} onClose={onClose} icon={<Icon.Edit size={16}/>} title={`Markup · ${file.name}`} subtitle={`${marks.length} annotations · click drawing to add`} wide
      footer={<><button className="btn" onClick={() => setMarks([])}>Clear all</button><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => { onClose(); window.toast(`Saved ${marks.length} markup annotations`, { kind: "success" }); }}><Icon.Check size={12}/> Save markup ({marks.length})</button></>}>
      <div style={{display: "flex", gap: 6, marginBottom: 10}}>
        {[["rect","□ Box"],["text","T Text"],["arrow","→ Arrow"]].map(([k, l]) => (
          <button key={k} className={"btn small " + (tool === k ? "primary" : "")} onClick={() => setTool(k)}>{l}</button>
        ))}
      </div>
      <svg ref={svgRef} viewBox="0 0 600 360" onClick={onClick} style={{width: "100%", height: 400, background: "white", border: "1px solid var(--line)", borderRadius: "var(--r-2)", cursor: "crosshair"}}>
        {/* Background drawing */}
        {Array.from({length: 31}).map((_, i) => <line key={"v"+i} x1={i*20} x2={i*20} y1={0} y2={360} stroke="#eee" strokeWidth="0.5"/>)}
        {Array.from({length: 19}).map((_, i) => <line key={"h"+i} x1={0} x2={600} y1={i*20} y2={360} stroke="#eee" strokeWidth="0.5"/>)}
        <rect x="100" y="100" width="400" height="160" stroke="#1a1a1a" strokeWidth="2" fill="none"/>
        <circle cx="140" cy="140" r="8" stroke="#1a1a1a" strokeWidth="1.5" fill="none"/>
        <circle cx="460" cy="140" r="8" stroke="#1a1a1a" strokeWidth="1.5" fill="none"/>
        <circle cx="140" cy="220" r="8" stroke="#1a1a1a" strokeWidth="1.5" fill="none"/>
        <circle cx="460" cy="220" r="8" stroke="#1a1a1a" strokeWidth="1.5" fill="none"/>
        <text x="300" y="80" textAnchor="middle" fontSize="12" fontFamily="monospace">MEC-PL-040A · Side Panel · Rev D</text>
        {marks.map((m) => {
          if (m.type === "rect") return <rect key={m.id} x={m.x} y={m.y} width={m.w} height={m.h} stroke={m.color} strokeWidth="2" fill="rgba(232, 93, 31, 0.1)"/>;
          if (m.type === "text") return <text key={m.id} x={m.x} y={m.y} fill={m.color} fontSize="14" fontFamily="sans-serif" fontWeight="600">{m.text}</text>;
          if (m.type === "arrow") return <g key={m.id}>
            <line x1={m.x} y1={m.y} x2={m.x2} y2={m.y2} stroke={m.color} strokeWidth="2"/>
            <polygon points={`${m.x2},${m.y2} ${m.x2-8},${m.y2-4} ${m.x2-8},${m.y2+4}`} fill={m.color}/>
          </g>;
          return null;
        })}
      </svg>
    </window.Modal>
  );
}

// ============ CAD ATTRIBUTE EXTRACTION ============
function CADAttrsModal({ open, onClose, file }) {
  const [extracting, setExtracting] = React.useState(false);
  const [attrs, setAttrs] = React.useState(null);
  React.useEffect(() => {
    if (open) {
      setExtracting(true);
      setAttrs(null);
      // Try API first, fall back to mock
      window.cadAPI?.extractAttrs({ filePath: file?.name || "", fileType: file?.ext || "SLDPRT" })
        .then(result => {
          if (result && result.material) {
            setAttrs({
              material: result.material, density: result.density,
              mass: result.mass, volume: result.volume,
              bounding_box: result.boundingBox, surface_area: result.surfaceArea,
              center_of_mass: result.centerOfMass,
              file_format: result.fileFormat,
              sw_version: result.cadVersion,
              custom: result.customProperties || {},
            });
          } else {
            setAttrs({
              material: "Aluminum 6061-T6", density: "2.70 g/cm\u00B3",
              mass: "89.4 g", volume: "33.1 cm\u00B3",
              bounding_box: "120 \u00D7 80 \u00D7 12 mm", surface_area: "264 cm\u00B2",
              center_of_mass: "(60.0, 40.0, 6.0) mm",
              file_format: file?.ext + " (ASCII)",
              sw_version: "SolidWorks 2026 SP2",
              custom: { Part_Number: "MEC-PL-040A", Revision: file?.rev || "D", Vendor: "Protolabs", Finish: "Type II Anodized, Black" },
            });
          }
          setExtracting(false);
        })
        .catch(() => {
          setAttrs({
            material: "Aluminum 6061-T6", density: "2.70 g/cm\u00B3",
            mass: "89.4 g", volume: "33.1 cm\u00B3",
            bounding_box: "120 \u00D7 80 \u00D7 12 mm", surface_area: "264 cm\u00B2",
            center_of_mass: "(60.0, 40.0, 6.0) mm",
            file_format: file?.ext + " (ASCII)",
            sw_version: "SolidWorks 2026 SP2",
            custom: { Part_Number: "MEC-PL-040A", Revision: file?.rev || "D", Vendor: "Protolabs", Finish: "Type II Anodized, Black" },
          });
          setExtracting(false);
        });
    }
  }, [open]);
  if (!open || !file) return null;
  return (
    <window.Modal open={open} onClose={onClose} icon={<Icon.Sparkles size={16}/>} title={`Extract attributes · ${file.name}`} subtitle="Auto-parsed from CAD metadata"
      footer={attrs && <><button className="btn" onClick={onClose}>Close</button><button className="btn primary" onClick={() => { onClose(); window.toast("Attributes synced to part record", { kind: "success" }); }}><Icon.Check size={12}/> Sync to part</button></>}>
      {extracting && <div style={{textAlign: "center", padding: 40}}><span className="spinner"/> Parsing {file.ext} metadata…</div>}
      {attrs && (
        <>
          <div style={{fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8}}>Geometric properties</div>
          <dl style={{display: "grid", gridTemplateColumns: "140px 1fr", gap: "6px 14px", margin: "0 0 18px", fontSize: 12}}>
            {Object.entries(attrs).filter(([k]) => k !== "custom").map(([k, v]) => (
              <React.Fragment key={k}>
                <dt style={{fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--fg-3)"}}>{k.replace(/_/g, " ")}</dt>
                <dd style={{margin: 0, fontFamily: "var(--font-mono)"}}>{v}</dd>
              </React.Fragment>
            ))}
          </dl>
          <div style={{fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8}}>Custom properties (SW)</div>
          <dl style={{display: "grid", gridTemplateColumns: "140px 1fr", gap: "6px 14px", margin: 0, fontSize: 12}}>
            {Object.entries(attrs.custom).map(([k, v]) => (
              <React.Fragment key={k}>
                <dt style={{fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--fg-3)"}}>{k.replace(/_/g, " ")}</dt>
                <dd style={{margin: 0, fontFamily: "var(--font-mono)"}}>{v}</dd>
              </React.Fragment>
            ))}
          </dl>
        </>
      )}
    </window.Modal>
  );
}

// ============ BIDIRECTIONAL CAD SYNC ============
function CADSyncModal({ open, onClose }) {
  if (!open) return null;
  const [step, setStep] = React.useState("compare");
  const [diffs, setDiffs] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [synced, setSynced] = React.useState(false);

  React.useEffect(() => {
    if (open && !synced) {
      setLoading(true);
      window.cadAPI?.sync().then(result => {
        if (result && result.diffs) setDiffs(result.diffs);
        setLoading(false);
      }).catch(() => setLoading(false));
    }
  }, [open]);

  return (
    <window.Modal open={open} onClose={onClose} icon={<Icon.Diff size={16}/>} title="Bidirectional CAD \u2194 BOM sync" subtitle={loading ? "Comparing CAD and BOM..." : diffs.length + " changes detected \u00B7 review and apply each direction"} wide
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={loading || synced} onClick={() => { setSynced(true); onClose(); window.toast("Sync complete \u00B7 " + diffs.length + " changes applied \u00B7 audit logged", { kind: "success" }); }}><Icon.Check size={12}/> Apply all changes</button></>}>
      {loading ? (
        <div style={{textAlign: "center", padding: 40}}><span className="spinner"/> Comparing CAD and BOM data...</div>
      ) : (
        <>
          <div style={{display: "grid", gridTemplateColumns: "1fr 100px 1fr", gap: 12, marginBottom: 14, fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--fg-3)"}}>
            <div style={{textAlign: "center"}}>SolidWorks</div>
            <div style={{textAlign: "center"}}>Direction</div>
            <div style={{textAlign: "center"}}>BOM</div>
          </div>
          {diffs.map((d, i) => (
            <div key={i} style={{display: "grid", gridTemplateColumns: "1fr 100px 1fr", gap: 12, padding: 12, border: "1px solid var(--line)", borderRadius: "var(--r-2)", marginBottom: 6, alignItems: "center"}}>
              <div style={{textAlign: "right", opacity: d.direction === "pull" ? 1 : 0.4}}>
                <div style={{fontWeight: 600, fontSize: 12}}>{d.pn}</div>
                {d.direction === "pull" && <div style={{fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--accent)"}}>{d.change}</div>}
              </div>
              <div style={{textAlign: "center", color: "var(--accent)", fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700}}>
                {d.direction === "pull" ? "\u2192 pull" : "\u2190 push"}
              </div>
              <div style={{opacity: d.direction === "push" ? 1 : 0.4}}>
                <div style={{fontWeight: 600, fontSize: 12}}>{d.pn}</div>
                {d.direction === "push" && <div style={{fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--accent)"}}>{d.change}</div>}
              </div>
            </div>
          ))}
        </>
      )}
    </window.Modal>
  );
}

// ============ DRAWING RELEASE WORKFLOW ============
function DrawingReleaseModal({ open, onClose }) {
  if (!open) return null;
  const drawings = [
    { name: "MEC-PL-040A_drawing.PDF", rev: "D", state: "approved", reviewer: "M. Park", date: "2026-05-12", watermark: "RELEASED" },
    { name: "MEC-PL-041A_drawing.PDF", rev: "B", state: "review", reviewer: "—", date: "—", watermark: "FOR APPROVAL" },
    { name: "Chassis_assembly.PDF", rev: "C", state: "draft", reviewer: "—", date: "—", watermark: "DRAFT — NOT FOR PRODUCTION" },
    { name: "Mainframe_exploded.PDF", rev: "A", state: "approved", reviewer: "E. Chen", date: "2026-05-08", watermark: "RELEASED" },
  ];
  return (
    <window.Modal open={open} onClose={onClose} icon={<Icon.Check size={16}/>} title="Drawing Release Workflow" subtitle="Separate sign-off for drawings before production" wide
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => { onClose(); window.toast("Released 2 drawings · PDFs watermarked", { kind: "success" }); }}><Icon.Check size={12}/> Release approved drawings</button></>}>
      <div className="card" style={{overflow: "visible"}}>
        <table className="bom-table" style={{tableLayout: "auto"}}>
          <thead><tr><th style={{paddingLeft: 16}}>Drawing</th><th>Rev</th><th>State</th><th>Watermark</th><th>Reviewer</th><th>Date</th><th></th></tr></thead>
          <tbody>
            {drawings.map(d => (
              <tr key={d.name}>
                <td className="mono" style={{paddingLeft: 16, fontWeight: 500}}>{d.name}</td>
                <td className="mono">{d.rev}</td>
                <td><span className={"status " + (d.state === "approved" ? "released" : d.state === "review" ? "review" : "draft")}>{d.state}</span></td>
                <td><span style={{fontFamily: "var(--font-mono)", fontSize: 10, padding: "2px 6px", borderRadius: 2, background: d.state === "approved" ? "var(--ok)" : d.state === "review" ? "var(--warn)" : "var(--fg-3)", color: "white", letterSpacing: "0.05em"}}>{d.watermark}</span></td>
                <td className="mono" style={{color: "var(--fg-3)"}}>{d.reviewer}</td>
                <td className="mono" style={{color: "var(--fg-3)"}}>{d.date}</td>
                <td>
                  <button className="btn small" onClick={() => window.toast("Preview with watermark")}>Preview</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{marginTop: 12, padding: 10, background: "var(--bg-sunk)", border: "1px solid var(--line)", borderRadius: "var(--r-2)", fontSize: 11, color: "var(--fg-3)", fontFamily: "var(--font-mono)"}}>
        💡 Released drawings are watermarked, locked from edit, and immutable. Reissuing creates a new revision.
      </div>
    </window.Modal>
  );
}

Object.assign(window, {
  PDMVaultScreen, CADRevisionsModal, CADWhereUsedModal, CADMarkupModal,
  CADAttrsModal, CADSyncModal, DrawingReleaseModal,
});
