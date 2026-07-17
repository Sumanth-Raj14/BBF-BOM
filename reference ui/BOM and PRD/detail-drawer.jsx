// Component Detail Drawer — opens when a row is selected.

function Drawer({ row, onClose, data, openModal, overlay }) {
  const ctx = window.useAppStore();
  const [tab, setTab] = React.useState("specs");
  if (!row) return null;
  const ext = (row.cost || 0) * (row.qty || 0);
  const commentList = (ctx?.comments && ctx.comments[row.pn]) || [];
  const approvalKey = row.assembly ? row.pn : (data.rows[0].children.find(s => s.children?.some(c => c.id === row.id))?.pn);
  const approval = approvalKey && ctx?.approvals?.[approvalKey];

  return (
    <>
      {overlay && <div className="drawer-backdrop" onClick={onClose} style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 99,
      }}/>}
      <div className={"drawer " + (overlay ? "overlay" : "")}>
      <div className="drawer-header">
        {row.imageUrl ? (
          <img src={row.imageUrl} alt={row.pn} style={{
            width: 48, height: 48, borderRadius: 8, objectFit: "cover",
            border: "1px solid var(--line)", flexShrink: 0,
          }}/>
        ) : (
          <div className="drawer-image" data-pn={row.pn} style={{
            width: 48, height: 48, borderRadius: 8,
            background: row.category === "Electrical" ? "oklch(0.55 0.13 240)" :
                        row.category === "Mechanical" ? "oklch(0.55 0.08 60)" :
                        row.category === "Optical" ? "oklch(0.55 0.13 320)" :
                        row.category === "Hardware" ? "oklch(0.6 0.10 30)" :
                        row.category === "Cable" ? "oklch(0.55 0.06 280)" :
                        "var(--accent)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 18, color: "white", flexShrink: 0,
          }}>
            {row.category === "Electrical" ? "⚡" :
             row.category === "Mechanical" ? "⚙" :
             row.category === "Optical" ? "◉" :
             row.category === "Hardware" ? "⊘" :
             row.category === "Cable" ? "≡" :
             "📦"}
          </div>
        )}
        <div className="drawer-title">
          <div className="pn">{row.pn} · Rev {row.rev}</div>
          <h3>{row.name}</h3>
          <div className="meta">
            <span className={"cat " + row.category.toLowerCase()}>{row.category}</span>
            <span className={"status " + (STATUS_CLASS[row.status] || "")}>{row.status}</span>
          </div>
        </div>
        <button className="drawer-close" onClick={onClose} title="Close"><Icon.X /></button>
      </div>

      <div className="drawer-tabs">
        {[
          ["specs", "specs"],
          ["vendors", "vendors"],
          ["where-used", "where used"],
          ["files", "files"],
          ["barcode", "barcode"],
          ["comments", `comments ${commentList.length ? `(${commentList.length})` : ""}`],
          ["history", "history"],
        ].map(([id, label]) => (
          <button key={id} className={"drawer-tab " + (tab === id ? "active" : "")} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      <div className="drawer-body">
        {tab === "specs" && <SpecsTab row={row} ext={ext} approval={approval} approvalKey={approvalKey}/>}
        {tab === "vendors" && <VendorsTab row={row} data={data} openModal={openModal}/>}
        {tab === "where-used" && <WhereUsedTab row={row}/>}
        {tab === "files" && <FilesTab row={row} openModal={openModal}/>}
        {tab === "barcode" && <BarcodeTab row={row}/>}
        {tab === "comments" && <CommentsTab row={row}/>}
        {tab === "history" && <HistoryTab row={row}/>}
      </div>
    </div>
    </>
  );
}

function SpecsTab({ row, ext, approval, approvalKey }) {
  const ctx = window.useAppStore();
  const advance = (role) => {
    if (!ctx?.setApprovals || !approvalKey) return;
    const cur = ctx.approvals[approvalKey] || {};
    const next = { ...cur, [role]: cur[role] === "approved" ? "pending" : "approved" };
    ctx.setApprovals({ ...ctx.approvals, [approvalKey]: next });
    window.toast(`${role[0].toUpperCase() + role.slice(1)} · ${next[role] === "approved" ? "approved" : "reset to pending"}`, { kind: next[role] === "approved" ? "success" : "info" });
  };

  return (
    <>
      {/* Approval widget — appears for assemblies or parts under an assembly */}
      {approval && (
        <div style={{padding: 12, border: "1px solid var(--line)", borderRadius: "var(--r-3)", background: "var(--bg)", marginBottom: 16}}>
          <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10}}>
            <span style={{fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-3)"}}>Approval workflow</span>
            <span style={{fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)"}}>
              {Object.values(approval).filter(v => v === "approved").length} of {Object.keys(approval).length} signed off
            </span>
          </div>
          <div style={{display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, background: "var(--line)", border: "1px solid var(--line)", borderRadius: "var(--r-2)", overflow: "hidden"}}>
            {[
              ["engineering", "ENG", "E. Chen", "user-2"],
              ["procurement", "PROC", "K. Singh", "user-4"],
              ["finance", "FIN", "T. Reyes", "user-3"],
            ].map(([key, lbl, who, color]) => {
              const state = approval[key];
              return (
                <button
                  key={key}
                  onClick={() => advance(key)}
                  style={{
                    padding: "10px 8px",
                    background: state === "approved" ? "color-mix(in oklch, var(--ok) 16%, var(--bg))" : "var(--bg)",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <div style={{display: "flex", alignItems: "center", gap: 6}}>
                    <span style={{
                      width: 16, height: 16, borderRadius: 99,
                      background: state === "approved" ? "var(--ok)" : "var(--bg-sunk)",
                      border: state === "approved" ? "none" : "1px dashed var(--fg-3)",
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      color: "white",
                    }}>
                      {state === "approved" && <Icon.Check size={9}/>}
                    </span>
                    <span style={{fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em"}}>{lbl}</span>
                  </div>
                  <div style={{marginTop: 6, fontSize: 11, fontWeight: 500}}>{who}</div>
                  <div style={{fontFamily: "var(--font-mono)", fontSize: 9, color: state === "approved" ? "var(--ok)" : "var(--fg-3)", marginTop: 1}}>
                    {state === "approved" ? "APPROVED" : "PENDING"}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <dl className="kv-grid">
        <dt>Part No.</dt><dd>{row.pn}</dd>
        <dt>Revision</dt><dd>{row.rev}</dd>
        <dt>Quantity</dt><dd>{fmt.qty(row.qty)} {row.uom}</dd>
        <dt>Category</dt><dd>{row.category}{row.subCategory ? <span style={{color:"var(--fg-3)"}}> / {row.subCategory}</span> : ""}</dd>
        <dt>Unit Cost</dt><dd>{fmt.money(row.cost)}</dd>
        <dt>Ext. Cost</dt><dd style={{fontWeight: 600, color: "var(--accent)"}}>{fmt.money(ext)}</dd>
        <dt>Lead Time</dt><dd>{row.lead ? row.lead + " days" : "—"}</dd>
        <dt>Origin</dt><dd>{row.origin}</dd>
        <dt>Manufacturer</dt><dd className="sans">{row.manufacturer || row.vendor || "—"}</dd>
        <dt>Vendor</dt><dd className="sans">{row.vendor}</dd>
      </dl>

      <div className="section-title">Engineering</div>
      <dl className="kv-grid">
        <dt>Material</dt><dd className="sans">{row.material || "—"}</dd>
        <dt>Weight</dt><dd>{row.weight ? (typeof row.weight === "number" ? row.weight + " g" : row.weight) : "—"}</dd>
        <dt>Dimensions</dt><dd>{row.dimensions || "—"}</dd>
        <dt>Finish</dt><dd className="sans">Black anodized</dd>
        <dt>Tolerance</dt><dd>±0.05 mm</dd>
      </dl>
      {row.cadUrl && (
        <div style={{marginBottom: 16}}>
          <div className="section-title">CAD Reference</div>
          <div style={{display:"flex", gap: 8, alignItems:"center"}}>
            <span style={{fontFamily:"var(--font-mono)", fontSize: 10, color:"var(--accent)", padding:"4px 8px", background:"var(--accent-soft)", borderRadius: 4}}>{row.cadUrl.split("/").pop()}</span>
            <button className="btn small" onClick={() => window.toast("Opening " + row.cadUrl, { kind: "info" })}><Icon.Import size={10}/> Open CAD</button>
            <button className="btn small" onClick={() => window.toast("3D preview not available in browser", { kind: "warn" })}><Icon.Search size={10}/> Preview</button>
          </div>
        </div>
      )}

      {row.tags && row.tags.length > 0 && (
        <div style={{marginBottom: 16}}>
          <div className="section-title">Tags</div>
          <div style={{display: "flex", gap: 4, flexWrap: "wrap"}}>
            {row.tags.map(t => (
              <span key={t} className="chip active" style={{fontSize: 10, padding: "2px 8px", cursor: "default"}}>{t}</span>
            ))}
          </div>
        </div>
      )}

      {row.compliance && row.compliance.length > 0 && (
        <div style={{marginBottom: 16}}>
          <div className="section-title">Compliance</div>
          <div style={{display: "flex", gap: 4, flexWrap: "wrap"}}>
            {row.compliance.map(c => (
              <span key={c} style={{
                fontSize: 10, fontFamily: "var(--font-mono)", padding: "2px 8px",
                border: "1px solid var(--ok)", borderRadius: 4, color: "var(--ok)", background: "color-mix(in oklch, var(--ok) 10%, var(--bg))",
              }}>{c}</span>
            ))}
          </div>
        </div>
      )}

      {row.customFields && Object.keys(row.customFields).length > 0 && (
        <>
          <div className="section-title">Custom Fields</div>
          <dl className="kv-grid">
            {Object.entries(row.customFields).map(([key, value]) => (
              <React.Fragment key={key}>
                <dt>{key}</dt><dd className="sans">{String(value)}</dd>
              </React.Fragment>
            ))}
          </dl>
        </>
      )}

      <div className="section-title">Cost trend (12 wk)</div>
      <div style={{padding: "8px 0"}}>
        {row.trend ? (
          <div style={{display:"flex", alignItems:"center", gap: 12}}>
            <svg className="spark" viewBox="0 0 240 60" style={{width: "100%", height: 60}}>
              {(() => {
                const data = row.trend;
                const min = Math.min(...data), max = Math.max(...data);
                const range = max - min || 1;
                const w = 240, h = 60, pad = 6;
                const pts = data.map((v, i) => {
                  const x = pad + (i / (data.length - 1)) * (w - pad * 2);
                  const y = pad + (1 - (v - min) / range) * (h - pad * 2);
                  return [x, y];
                });
                const linePath = pts.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
                const areaPath = linePath + ` L ${pts[pts.length-1][0]} ${h-pad} L ${pts[0][0]} ${h-pad} Z`;
                return (
                  <>
                    <path className="area" d={areaPath}/>
                    <path className="line" d={linePath} style={{strokeWidth: 1.5}}/>
                    {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={i === pts.length - 1 ? 2.5 : 1.5} fill={i === pts.length - 1 ? "var(--accent)" : "var(--fg-3)"}/>)}
                  </>
                );
              })()}
            </svg>
          </div>
        ) : <span style={{color: "var(--fg-3)", fontSize: 11}}>No price history for this part.</span>}
      </div>

      <div className="section-title">Notes</div>
      <div style={{
        border: "1px solid var(--line)",
        borderRadius: "var(--r-2)",
        background: "var(--bg)",
        padding: "10px 12px",
        fontSize: 12,
        color: "var(--fg-2)",
        lineHeight: 1.5
      }}>
        {row.category === "Electrical"
          ? "Validated against the H743 errata sheet ES0392. Stock 100 units min — lead time creep observed Q1-Q2."
          : row.category === "Optical"
          ? "Lens is critical for the August field demo. Order in pairs."
          : "Refer to drawing in Files tab. Confirm finish on PO."}
      </div>

      {row.freight !== undefined && (
        <>
          <div className="section-title">Cost Breakdown</div>
          <dl className="kv-grid">
            <dt>Unit Cost</dt><dd>{fmt.money(row.cost)}</dd>
            {row.freight !== undefined && <React.Fragment key="f"><dt>Freight</dt><dd>{fmt.money(row.freight)}</dd></React.Fragment>}
            {row.tax !== undefined && <React.Fragment key="t"><dt>Tax / Duties</dt><dd>{fmt.money(row.tax)}</dd></React.Fragment>}
            {row.landedCost !== undefined && <React.Fragment key="l"><dt>Landed Cost</dt><dd style={{fontWeight: 600, color: "var(--accent)"}}>{fmt.money(row.landedCost)}</dd></React.Fragment>}
          </dl>
        </>
      )}

      {row.countryHistory && row.countryHistory.length > 0 && (
        <div style={{marginBottom: 16}}>
          <div className="section-title">Country History</div>
          <div style={{position: "relative", paddingLeft: 18}}>
            <div style={{position: "absolute", left: 6, top: 4, bottom: 4, width: 1, background: "var(--line)"}}/>
            {row.countryHistory.map((ch, i) => (
              <div key={i} style={{position: "relative", marginBottom: 10}}>
                <div style={{
                  position: "absolute", left: -16, top: 4,
                  width: 9, height: 9, borderRadius: 99,
                  background: i === row.countryHistory.length - 1 ? "var(--accent)" : "var(--bg)",
                  border: "2px solid " + (i === row.countryHistory.length - 1 ? "var(--accent)" : "var(--fg-3)"),
                }}/>
                <div style={{fontSize: 11, fontWeight: 600}}><span className="chip" style={{fontSize:9, padding:"0 4px", marginRight:4}}>{ch.country}</span> {ch.reason}</div>
                <div style={{fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)", marginTop: 1}}>{ch.date}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap"}}>
        <button className="btn small" onClick={() => ctx?.openModal("auto-scrape", row)}><Icon.Sparkles size={11}/> Auto-scrape from web</button>
        <button className="btn small" onClick={() => ctx?.openModal("find-alternates", row)}><Icon.Search size={11}/> Find alternates</button>
        <button className="btn small" onClick={() => ctx?.openModal("send-rfq", row)}><Icon.Cart size={11}/> Send RFQ</button>
        <button className="btn small" onClick={() => ctx?.openModal("change-owner", row)}><Icon.User size={11}/> Change owner</button>
      </div>
    </>
  );
}

function VendorsTab({ row, data, openModal }) {
  const vp = row.vendorPrices || [];
  const matched = vp.length > 0 ? vp.slice(0, 5) : data.vendors.slice(0, 3);
  return (
    <>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 10}}>
        <div className="hint">{matched.length} vendor{matched.length !== 1 ? "s" : ""} · {vp.length > 0 && <span>prices from catalog</span>}</div>
        <button className="btn small" onClick={() => openModal && openModal("new-vendor")}><Icon.Plus size={11}/> Add vendor</button>
      </div>
      {matched.map((it, i) => {
        const isPricing = vp.length > 0;
        const v = isPricing ? data.vendors.find(dv => dv.name === it.vendor) || { name: it.vendor, terms: "—", country: "—", rating: 0, lead: it.lead, moq: it.moq || 1 } : it;
        return (
          <div key={i} className={"vcard " + (i === 0 ? "preferred" : "")}>
            <div className="vname">
              <div>
                <div className="name">{v.name}</div>
                <div style={{fontSize: 10, color: "var(--fg-3)", marginTop: 2, fontFamily: "var(--font-mono)"}}>
                  {v.terms || "—"} · {v.country} · ★ {v.rating || "—"}
                </div>
              </div>
              <div className="country">{v.country}</div>
            </div>
            <div className="vstats">
              <div className="vstat">
                <div className="l">Unit</div>
                <div className="v">{fmt.money(isPricing ? it.cost : row.cost * (1 + (i * 0.08 - 0.04)), 2)}</div>
              </div>
              <div className="vstat">
                <div className="l">Lead</div>
                <div className="v">{v.lead || "—"}d</div>
              </div>
              <div className="vstat">
                <div className="l">MOQ</div>
                <div className="v">{v.moq || "—"}</div>
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}

function WhereUsedTab({ row }) {
  const ctx = window.useAppStore();
  const go = (project) => {
    window.toast(`Navigating to ${project}…`);
    ctx?.openModal && window.__nav?.("bom");
  };
  return (
    <>
      <div className="hint" style={{marginBottom: 10}}>Used in 3 assemblies across 2 projects.</div>
      <div className="deptree">
        <div className="node parent" style={{cursor: "pointer"}} onClick={() => go("ATLAS / Mainframe")}>ATLAS / Mainframe / Rev C</div>
        <div className="branch">
          <div className="node parent" style={{cursor: "pointer"}} onClick={() => go("ATL-MFR-CTL")}>ATL-MFR-CTL / Control Subsystem · Rev D</div>
          <div className="branch">
            <div className="node self">{row.pn}</div>
          </div>
        </div>
        <div style={{height: 8}}/>
        <div className="node parent" style={{cursor: "pointer"}} onClick={() => go("HORIZON / Sensor Pod")}>HORIZON / Sensor Pod / Rev B</div>
        <div className="branch">
          <div className="node parent" style={{cursor: "pointer"}} onClick={() => go("HZN-POD-CTL")}>HZN-POD-CTL · Rev A</div>
          <div className="branch">
            <div className="node self">{row.pn} (qty 2)</div>
          </div>
        </div>
        <div style={{height: 8}}/>
        <div className="node parent" style={{cursor: "pointer"}} onClick={() => go("ATLAS-LITE")}>ATLAS-LITE / Eval Board · Rev A</div>
        <div className="branch">
          <div className="node self">{row.pn}</div>
        </div>
      </div>
    </>
  );
}

function FilesTab({ row, openModal }) {
  const ctx = window.useAppStore();
  const files = [
    { name: `${row.pn}_datasheet.pdf`, ext: "PDF", size: "1.2 MB", date: "05-12", tag: "Datasheet", updated: "05-12", icon: "DS" },
    { name: `${row.pn}_drawing_v2.dwg`, ext: "DWG", size: "324 KB", date: "05-09", tag: "Drawing", updated: "05-09", icon: "⌗" },
    { name: `${row.pn}_specs_extracted.json`, ext: "JSON", size: "4 KB", date: "05-09", tag: "Extracted", updated: "05-09", icon: "{}" },
    { name: `Quote_${row.pn}_2026Q2.pdf`, ext: "PDF", size: "88 KB", date: "04-22", tag: "Quote", updated: "04-22", icon: "$" },
  ];
  const open = (f) => (ctx || {openModal})?.openModal?.("doc-preview", f);
  return (
    <>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 10}}>
        <div className="hint">4 files · versioned</div>
        <button className="btn small" onClick={() => (ctx || {openModal}).openModal?.("upload")}><Icon.Plus size={11}/> Upload</button>
      </div>
      {files.map((f, i) => (
        <div key={i} style={{
          display: "grid",
          gridTemplateColumns: "44px 1fr auto",
          gap: 10,
          alignItems: "center",
          padding: "8px 10px",
          border: "1px solid var(--line)",
          borderRadius: "var(--r-2)",
          marginBottom: 6,
          background: "var(--bg)",
        }}>
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            padding: "2px 4px",
            background: "var(--fg)",
            color: "var(--bg)",
            borderRadius: 2,
            textAlign: "center",
            letterSpacing: "0.06em",
          }}>{f.ext}</span>
          <div onClick={() => open(f)} style={{cursor:"pointer"}}>
            <div style={{fontSize: 12, fontFamily: "var(--font-mono)"}}>{f.name}</div>
            <div style={{fontSize: 10, color: "var(--fg-3)", fontFamily: "var(--font-mono)"}}>{f.size} · {f.date}</div>
          </div>
          <window.DropdownButton
            width={170}
            trigger={<button className="icon-btn" style={{width:22, height:22}}><Icon.Dots size={12}/></button>}
            items={[
              { icon: <Icon.Chevron size={11}/>, label: "Preview", onClick: () => open(f) },
              { icon: <Icon.Export size={11}/>, label: "Download", onClick: () => window.toast("Downloaded " + f.name, { kind: "success" }) },
              { icon: <Icon.Link size={11}/>, label: "Copy link", onClick: () => window.toast("Link copied") },
              "divider",
              { icon: <Icon.Trash size={11}/>, label: "Delete", danger: true, onClick: () => window.toast(f.name + " deleted", { kind: "warn" }) },
            ]}
          />
        </div>
      ))}
    </>
  );
}

function CommentsTab({ row }) {
  const ctx = window.useAppStore();
  const [draft, setDraft] = React.useState("");
  const [mentionOpen, setMentionOpen] = React.useState(false);
  const [mentionQ, setMentionQ] = React.useState("");
  const [mentionIdx, setMentionIdx] = React.useState(0);
  const textareaRef = React.useRef(null);
  const list = (ctx?.comments && ctx.comments[row.pn]) || [];

  const TEAM = [
    { handle: "elena", name: "Elena Chen", role: "ENG LEAD", init: "EC", color: "" },
    { handle: "marie", name: "Marie Park", role: "ENG", init: "MP", color: "user-2" },
    { handle: "karan", name: "Karan Singh", role: "PROC", init: "KS", color: "user-4" },
    { handle: "ryo", name: "Ryo Sato", role: "ENG", init: "RS", color: "user-3" },
    { handle: "tom", name: "Tom Reyes", role: "FIN", init: "TR", color: "user-2" },
  ];

  const filteredMentions = TEAM.filter(t =>
    !mentionQ || t.handle.includes(mentionQ.toLowerCase()) || t.name.toLowerCase().includes(mentionQ.toLowerCase())
  );

  const onChange = (e) => {
    const v = e.target.value;
    setDraft(v);
    const pos = e.target.selectionStart;
    const upto = v.slice(0, pos);
    const m = upto.match(/(?:^|\s)@([\w]*)$/);
    if (m) {
      setMentionOpen(true);
      setMentionQ(m[1]);
      setMentionIdx(0);
    } else {
      setMentionOpen(false);
    }
  };

  const pickMention = (t) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const pos = ta.selectionStart;
    const upto = draft.slice(0, pos);
    const rest = draft.slice(pos);
    const replaced = upto.replace(/@[\w]*$/, "@" + t.handle + " ");
    const next = replaced + rest;
    setDraft(next);
    setMentionOpen(false);
    setTimeout(() => {
      ta.focus();
      const caret = replaced.length;
      ta.setSelectionRange(caret, caret);
    }, 0);
  };

  const onKeyDown = (e) => {
    if (mentionOpen && filteredMentions.length) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMentionIdx(i => Math.min(filteredMentions.length - 1, i + 1)); return; }
      if (e.key === "ArrowUp")   { e.preventDefault(); setMentionIdx(i => Math.max(0, i - 1)); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pickMention(filteredMentions[mentionIdx]); return; }
      if (e.key === "Escape")    { setMentionOpen(false); return; }
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") post();
  };

  const post = async () => {
    if (!draft.trim() || !ctx) return;
    const mentions = [...draft.matchAll(/@(\w+)/g)].map(m => m[1]);
    const newComment = {
      id: Date.now(),
      who: "E. Chen",
      init: "EC",
      color: "",
      text: draft.trim(),
      time: "just now",
    };

    // Optimistic update
    ctx.setComments({ ...ctx.comments, [row.pn]: [...list, newComment] });

    // Save to API
    try {
      if (window.api?.comments?.create) {
        await window.api.comments.create({
          content: draft.trim(),
          entityType: "part",
          entityId: row.id || 0,
          mentions: mentions.length ? mentions : undefined,
        });
      }
    } catch (e) {}

    if (mentions.length && ctx.setNotifications) {
      ctx.setNotifications([
        { id: Date.now(), who: "E. Chen", init: "EC", color: "", action: "mentioned you on", obj: row.pn, time: "just now", read: false, route: "bom" },
        ...ctx.notifications,
      ]);
    }
    setDraft("");
  };

  const renderText = (text) => {
    const parts = text.split(/(@\w+)/g);
    return parts.map((p, i) => p.startsWith("@") ? (
      <span key={i} style={{color: "var(--accent)", fontWeight: 600, background: "var(--accent-soft)", padding: "0 3px", borderRadius: 2}}>{p}</span>
    ) : p);
  };

  return (
    <>
      {list.length === 0 ? (
        <div style={{padding: 30, textAlign: "center", color: "var(--fg-3)"}}>
          <div style={{fontFamily: "var(--font-mono)", fontSize: 28, color: "var(--fg-4)"}}>“ ”</div>
          <div style={{fontSize: 12, marginTop: 4}}>No comments yet. Start the conversation.</div>
        </div>
      ) : (
        <div style={{display: "flex", flexDirection: "column", gap: 12, marginBottom: 14}}>
          {list.map((c) => (
            <div key={c.id} style={{display: "grid", gridTemplateColumns: "26px 1fr", gap: 10}}>
              <span className={"ava " + (c.color || "")} style={{width: 24, height: 24, fontSize: 10}}>{c.init}</span>
              <div>
                <div style={{display: "flex", alignItems: "baseline", gap: 6, marginBottom: 2}}>
                  <span style={{fontWeight: 600, fontSize: 12}}>{c.who}</span>
                  <span style={{fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)"}}>{c.time}</span>
                </div>
                <div style={{fontSize: 12, color: "var(--fg-2)", lineHeight: 1.5}}>{renderText(c.text)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{borderTop: "1px solid var(--line)", paddingTop: 12, position: "relative"}}>
        <div style={{display: "grid", gridTemplateColumns: "26px 1fr", gap: 10, alignItems: "flex-start"}}>
          <span className="ava" style={{width: 24, height: 24, fontSize: 10}}>EC</span>
          <div style={{position: "relative"}}>
            <textarea
              ref={textareaRef}
              className="input"
              placeholder="Add a comment…  Type @ to mention. Markdown supported."
              value={draft}
              onChange={onChange}
              onKeyDown={onKeyDown}
              style={{minHeight: 70, fontSize: 12, fontFamily: "var(--font-sans)"}}
            />
            {mentionOpen && filteredMentions.length > 0 && (
              <div style={{
                position: "absolute",
                bottom: "100%",
                left: 0,
                marginBottom: 4,
                background: "var(--bg-elev)",
                border: "1px solid var(--line)",
                borderRadius: "var(--r-2)",
                boxShadow: "var(--shadow-md)",
                width: 240,
                zIndex: 50,
                overflow: "hidden",
              }}>
                <div style={{padding: "6px 10px", fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-3)", borderBottom: "1px solid var(--line)"}}>Mention</div>
                {filteredMentions.map((t, i) => (
                  <button
                    key={t.handle}
                    onClick={() => pickMention(t)}
                    onMouseEnter={() => setMentionIdx(i)}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "26px 1fr auto",
                      gap: 8, alignItems: "center",
                      width: "100%",
                      padding: "6px 10px",
                      background: i === mentionIdx ? "var(--bg-sunk)" : "transparent",
                      border: "none",
                      textAlign: "left",
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                  >
                    <span className={"ava " + (t.color || "")} style={{width: 22, height: 22, fontSize: 9}}>{t.init}</span>
                    <div style={{minWidth: 0}}>
                      <div style={{fontWeight: 500}}>{t.name}</div>
                      <div style={{fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)"}}>@{t.handle}</div>
                    </div>
                    <span style={{fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--fg-4)", letterSpacing: "0.06em"}}>{t.role}</span>
                  </button>
                ))}
              </div>
            )}
            <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6}}>
              <div style={{display: "flex", gap: 6}}>
                <button className="icon-btn" style={{width: 22, height: 22}} title="Mention @user" onClick={() => { setDraft(draft + (draft.endsWith(" ") || !draft ? "" : " ") + "@"); setMentionOpen(true); setMentionQ(""); setTimeout(() => textareaRef.current?.focus(), 0); }}><span style={{fontFamily:"var(--font-mono)", fontWeight: 600, fontSize: 12}}>@</span></button>
                <button className="icon-btn" style={{width: 22, height: 22}} title="Attach file" onClick={() => ctx?.openModal("upload")}><Icon.Import size={11}/></button>
                <button className="icon-btn" style={{width: 22, height: 22}} title="Mark as decision" onClick={() => window.toast("Comment will be flagged as decision")}><Icon.Flag size={11}/></button>
              </div>
              <div style={{display: "flex", alignItems: "center", gap: 8}}>
                <span className="hint">⌘↵ to send</span>
                <button className="btn primary small" onClick={post} disabled={!draft.trim()} style={{opacity: draft.trim() ? 1 : 0.5}}>
                  Comment
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function BarcodeTab({ row }) {
  const bars = React.useMemo(() => {
    const s = (row.pn || "X").repeat(6);
    return [...s].map((c, i) => ((c.charCodeAt(0) + i * 7) % 4) + 1);
  }, [row.pn]);

  const qrCells = React.useMemo(() => {
    const size = 21;
    const cells = Array.from({ length: size }, () => Array(size).fill(0));
    const isFinder = (x, y) => {
      const inSquare = (cx, cy) => x >= cx && x < cx + 7 && y >= cy && y < cy + 7;
      return inSquare(0, 0) || inSquare(size - 7, 0) || inSquare(0, size - 7);
    };
    const drawFinder = (cx, cy) => {
      for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
        const edge = x === 0 || x === 6 || y === 0 || y === 6;
        const inner = x >= 2 && x <= 4 && y >= 2 && y <= 4;
        cells[cy + y][cx + x] = (edge || inner) ? 1 : 0;
      }
    };
    drawFinder(0, 0); drawFinder(size - 7, 0); drawFinder(0, size - 7);
    const seed = (row.pn || "X").split("").reduce((a, c) => a * 31 + c.charCodeAt(0), 7);
    let s = seed;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (isFinder(x, y)) continue;
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        cells[y][x] = (s % 3 === 0) ? 1 : 0;
      }
    }
    for (let i = 8; i < size - 8; i++) {
      cells[6][i] = i % 2 === 0 ? 1 : 0;
      cells[i][6] = i % 2 === 0 ? 1 : 0;
    }
    return cells;
  }, [row.pn]);

  const downloadSVG = (svgEl, name) => {
    const xml = new XMLSerializer().serializeToString(svgEl);
    const blob = new Blob([xml], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
    window.toast("Downloaded " + name, { kind: "success" });
  };

  const printOne = (svgHTML, title) => {
    const w = window.open("", "_blank", "width=600,height=400");
    if (!w) { window.toast("Pop-up blocked", { kind: "warn" }); return; }
    w.document.write("<html><head><title>" + title + "</title><style>body{font-family:monospace;text-align:center;padding:30px}</style></head><body>" + svgHTML + "<div style='margin-top:14px;font-size:14px'>" + row.pn + "</div><div style='font-size:11px;color:#666'>" + row.name + "</div></body></html>");
    w.document.close();
    setTimeout(() => w.print(), 200);
  };

  const barcodeRef = React.useRef(null);
  const qrRef = React.useRef(null);
  const cell = 6;
  const qrSize = qrCells.length * cell;

  return (
    <>
      <div className="hint" style={{marginBottom: 14}}>Auto-generated traceability codes for {row.pn}.</div>

      <div style={{padding: 16, background: "white", border: "1px solid var(--line)", borderRadius: "var(--r-3)", textAlign: "center", marginBottom: 12, color: "#000"}}>
        <div style={{fontFamily: "var(--font-mono)", fontSize: 9, color: "#666", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6}}>CODE 128</div>
        <svg ref={barcodeRef} width="320" height="74" viewBox={`0 0 ${bars.reduce((s, b) => s + b, 0) + 4} 60`} style={{display: "block", margin: "0 auto"}} xmlns="http://www.w3.org/2000/svg">
          <rect x="0" y="0" width="100%" height="100%" fill="white"/>
          {(() => {
            let x = 2;
            return bars.map((w, i) => {
              const fill = i % 2 === 0 ? "#000" : "#fff";
              const r = <rect key={i} x={x} y="6" width={w} height="42" fill={fill}/>;
              x += w;
              return r;
            });
          })()}
        </svg>
        <div style={{fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: "0.15em", marginTop: 4, color: "#000"}}>{row.pn}</div>
      </div>

      <div style={{padding: 16, background: "white", border: "1px solid var(--line)", borderRadius: "var(--r-3)", textAlign: "center", marginBottom: 12, color: "#000"}}>
        <div style={{fontFamily: "var(--font-mono)", fontSize: 9, color: "#666", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6}}>QR · LINKS TO PART RECORD</div>
        <svg ref={qrRef} width={qrSize + 24} height={qrSize + 24} viewBox={`0 0 ${qrSize + 24} ${qrSize + 24}`} style={{display: "block", margin: "0 auto"}} xmlns="http://www.w3.org/2000/svg">
          <rect x="0" y="0" width="100%" height="100%" fill="white"/>
          {qrCells.map((r, y) => r.map((v, x) => v ? <rect key={`${x}-${y}`} x={12 + x * cell} y={12 + y * cell} width={cell} height={cell} fill="#000"/> : null))}
        </svg>
        <div style={{fontFamily: "var(--font-mono)", fontSize: 10, color: "#666", marginTop: 4}}>bbox.dev/p/{row.pn}</div>
      </div>

      <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8}}>
        <button className="btn small" onClick={() => barcodeRef.current && downloadSVG(barcodeRef.current, row.pn + "_barcode.svg")}><Icon.Export size={11}/> Download barcode</button>
        <button className="btn small" onClick={() => qrRef.current && downloadSVG(qrRef.current, row.pn + "_qr.svg")}><Icon.Export size={11}/> Download QR</button>
        <button className="btn small" onClick={() => barcodeRef.current && printOne(barcodeRef.current.outerHTML, row.pn + " barcode")}>Print barcode label</button>
        <button className="btn small" onClick={() => qrRef.current && printOne(qrRef.current.outerHTML, row.pn + " QR")}>Print QR label</button>
      </div>
      <div style={{marginTop: 10, padding: 10, background: "var(--bg-sunk)", border: "1px solid var(--line)", borderRadius: "var(--r-2)", fontSize: 11, color: "var(--fg-3)", fontFamily: "var(--font-mono)"}}>
        WMS compat: GS1-128 · QR points to internal part record · scan with the Scan button in topbar/Components to look up.
      </div>
    </>
  );
}

function HistoryTab({ row }) {
  const events = [
    { ver: "Rev " + row.rev, who: "E. Chen", what: "Current revision", when: "2026-05-12", current: true },
    { ver: "Rev " + (row.rev === "A" ? "—" : String.fromCharCode(row.rev.charCodeAt(0) - 1)), who: "M. Park", what: "Updated specifications + datasheet", when: "2026-04-28" },
    { ver: "Rev A", who: "E. Chen", what: "Initial release", when: "2026-02-14" },
  ];
  return (
    <>
      <div className="hint" style={{marginBottom: 10}}>Revision history</div>
      <div style={{position: "relative", paddingLeft: 18}}>
        <div style={{position: "absolute", left: 6, top: 4, bottom: 4, width: 1, background: "var(--line)"}}/>
        {events.map((e, i) => (
          <div key={i} style={{position: "relative", marginBottom: 14}}>
            <div style={{
              position: "absolute",
              left: -16,
              top: 4,
              width: 9, height: 9,
              borderRadius: 99,
              background: e.current ? "var(--accent)" : "var(--bg)",
              border: "2px solid " + (e.current ? "var(--accent)" : "var(--fg-3)"),
            }}/>
            <div style={{fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600}}>{e.ver}</div>
            <div style={{fontSize: 12, color: "var(--fg-2)", marginTop: 2}}>{e.what}</div>
            <div style={{fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)", marginTop: 2}}>
              {e.who} · {e.when}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

window.Drawer = Drawer;
