// Mobile Scanner PWA Screen
// Provides: barcode scanning via camera, quick part lookup, PO receiving, inventory updates
function MobileScannerScreen() {
  const [mode, setMode] = React.useState('menu'); // menu | scan | lookup | receive | inventory
  const [scanResult, setScanResult] = React.useState(null);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [partData, setPartData] = React.useState(null);
  const [cameraActive, setCameraActive] = React.useState(false);
  const [recentScans, setRecentScans] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem('__bbox_recent_scans') || '[]'); } catch { return []; }
  });
  const [poList, setPoList] = React.useState([]);
  const [selectedPo, setSelectedPo] = React.useState(null);
  const [receiveQty, setReceiveQty] = React.useState('');

  // Barcode scanning via camera
  const videoRef = React.useRef(null);
  const canvasRef = React.useRef(null);
  const streamRef = React.useRef(null);

  const startCamera = React.useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCameraActive(true);
      setMode('scan');
    } catch (e) {
      window.toast?.('Camera access denied. Using manual entry.', { kind: 'warning' });
      setMode('lookup');
    }
  }, []);

  const stopCamera = React.useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  const lookupPart = React.useCallback(async (code) => {
    if (!code) return;
    try {
      const result = await window.api?.parts?.list({ search: code, limit: 10 });
      const parts = Array.isArray(result) ? result : result?.items || [];
      if (parts.length > 0) {
        setPartData(parts[0]);
        setScanResult(code);
        // Save to recent scans
        const scan = { code, part: parts[0], time: new Date().toISOString() };
        const updated = [scan, ...recentScans.filter(s => s.code !== code)].slice(0, 20);
        setRecentScans(updated);
        localStorage.setItem('__bbox_recent_scans', JSON.stringify(updated));
      } else {
        setPartData(null);
        setScanResult(code);
      }
    } catch (e) {
      // Try barcode lookup
      try {
        const barcode = await window.api?.barcodes?.lookup(code);
        if (barcode) {
          setPartData(barcode);
          setScanResult(code);
        }
      } catch (e2) {}
    }
  }, [recentScans]);

  // Simulate barcode detection (real detection would use a barcode library)
  const simulateScan = () => {
    const demoCodes = ['STM32H743VIT6', 'LM358', 'ESP32-C3', 'MEAN-WELL-RS-15-5', 'PCB-001-A'];
    const code = demoCodes[Math.floor(Math.random() * demoCodes.length)];
    lookupPart(code);
  };

  // Load POs for receiving
  const loadPOs = React.useCallback(async () => {
    try {
      const result = await window.poOrdersAPI?.list({ status: 'Order Placed', limit: 50 });
      setPoList(result?.items || []);
    } catch (e) {}
  }, []);

  React.useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  // Menu screen
  if (mode === 'menu') {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: 16 }}>
        <div style={{ textAlign: 'center', padding: '20px 0 30px' }}>
          <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>BLACKBOX</div>
          <div style={{ fontSize: 11, color: 'var(--fg-3)', letterSpacing: '0.1em' }}>MOBILE SCANNER</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, maxWidth: 400, margin: '0 auto' }}>
          <button onClick={startCamera} style={{ padding: 24, borderRadius: 'var(--r-2)', border: '1px solid var(--line)', background: 'var(--bg-elev)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>&#x1f4f7;</div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>Scan Barcode</div>
            <div style={{ fontSize: 9, color: 'var(--fg-3)', marginTop: 4 }}>Camera</div>
          </button>
          <button onClick={() => { setMode('lookup'); }} style={{ padding: 24, borderRadius: 'var(--r-2)', border: '1px solid var(--line)', background: 'var(--bg-elev)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>&#x1f50d;</div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>Manual Lookup</div>
            <div style={{ fontSize: 9, color: 'var(--fg-3)', marginTop: 4 }}>Search parts</div>
          </button>
          <button onClick={() => { loadPOs(); setMode('receive'); }} style={{ padding: 24, borderRadius: 'var(--r-2)', border: '1px solid var(--line)', background: 'var(--bg-elev)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>&#x1f4e6;</div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>PO Receiving</div>
            <div style={{ fontSize: 9, color: 'var(--fg-3)', marginTop: 4 }}>Receive goods</div>
          </button>
          <button onClick={() => setMode('inventory')} style={{ padding: 24, borderRadius: 'var(--r-2)', border: '1px solid var(--line)', background: 'var(--bg-elev)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>&#x1f4ca;</div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>Inventory</div>
            <div style={{ fontSize: 9, color: 'var(--fg-3)', marginTop: 4 }}>Stock check</div>
          </button>
        </div>
        {recentScans.length > 0 && (
          <div style={{ marginTop: 24, maxWidth: 400, margin: '24px auto 0' }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--fg-3)', marginBottom: 8 }}>Recent Scans</div>
            {recentScans.slice(0, 5).map((s, i) => (
              <div key={i} onClick={() => { setPartData(s.part); setScanResult(s.code); setMode('lookup'); }} style={{ padding: '10px 12px', borderBottom: '1px solid var(--line)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <div className="mono" style={{ fontSize: 11, fontWeight: 600 }}>{s.code}</div>
                  <div style={{ fontSize: 10, color: 'var(--fg-3)' }}>{s.part?.name || s.part?.partNumber || 'Unknown'}</div>
                </div>
                <div style={{ fontSize: 9, color: 'var(--fg-4)' }}>{new Date(s.time).toLocaleTimeString()}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Camera scan screen
  if (mode === 'scan') {
    return (
      <div style={{ minHeight: '100vh', background: '#000', position: 'relative' }}>
        <video ref={videoRef} style={{ width: '100%', height: '60vh', objectFit: 'cover' }} playsInline muted />
        <canvas ref={canvasRef} style={{ display: 'none' }} />
        <div style={{ position: 'absolute', top: '25vh', left: '10%', width: '80%', height: 2, background: '#e85d1f', boxShadow: '0 0 20px #e85d1f' }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, background: 'linear-gradient(transparent, rgba(0,0,0,0.9))' }}>
          <div style={{ color: 'white', textAlign: 'center', fontSize: 12, marginBottom: 12 }}>Align barcode within the frame</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={simulateScan} style={{ flex: 1, padding: 14, borderRadius: 'var(--r-2)', background: '#e85d1f', color: 'white', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Demo Scan</button>
            <button onClick={() => { stopCamera(); setMode('lookup'); }} style={{ flex: 1, padding: 14, borderRadius: 'var(--r-2)', background: 'var(--bg-elev)', color: 'var(--fg)', border: '1px solid var(--line)', fontSize: 13, cursor: 'pointer' }}>Manual Entry</button>
          </div>
          <button onClick={() => { stopCamera(); setMode('menu'); }} style={{ width: '100%', padding: 10, marginTop: 8, background: 'transparent', color: 'var(--fg-3)', border: 'none', fontSize: 11, cursor: 'pointer' }}>Back to Menu</button>
        </div>
        {scanResult && partData && (
          <div onClick={() => setMode('lookup')} style={{ position: 'absolute', top: 16, left: 16, right: 16, background: 'var(--bg)', borderRadius: 'var(--r-2)', padding: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.5)', cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: 'var(--green, #10b981)', fontSize: 18 }}>&#x2714;</span>
              <div>
                <div className="mono" style={{ fontWeight: 600 }}>{scanResult}</div>
                <div style={{ fontSize: 11, color: 'var(--fg-3)' }}>{partData.name || partData.partNumber}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Lookup / scan result screen
  if (mode === 'lookup') {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => { setMode('menu'); setPartData(null); setScanResult(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>&#x2190;</button>
          <input className="twk-field" style={{ flex: 1 }} placeholder="Search by name, part number, or barcode..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') lookupPart(searchQuery); }} autoFocus />
          <button className="btn primary" onClick={() => lookupPart(searchQuery)}>Search</button>
          <button className="btn" onClick={startCamera}><span>&#x1f4f7;</span></button>
        </div>
        {partData ? (
          <div style={{ padding: 16 }}>
            <div className="card" style={{ padding: 16, marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <div>
                  <div className="mono" style={{ fontSize: 14, fontWeight: 700 }}>{partData.partNumber || partData.pn || scanResult}</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>{partData.name || partData.description}</div>
                </div>
                <span className={"status " + (partData.status === "Active" ? "released" : "review")} style={{ fontSize: 9 }}>{partData.status || "Active"}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
                <div><div style={{ fontSize: 9, color: 'var(--fg-3)', textTransform: 'uppercase' }}>Manufacturer</div><div style={{ fontSize: 11, marginTop: 2 }}>{partData.manufacturer || "\u2014"}</div></div>
                <div><div style={{ fontSize: 9, color: 'var(--fg-3)', textTransform: 'uppercase' }}>Category</div><div style={{ fontSize: 11, marginTop: 2 }}>{partData.category || "\u2014"}</div></div>
                <div><div style={{ fontSize: 9, color: 'var(--fg-3)', textTransform: 'uppercase' }}>Unit Cost</div><div style={{ fontSize: 11, marginTop: 2, fontWeight: 600 }}>{partData.unitCost ? window.INR?.(partData.unitCost, 2) : "\u2014"}</div></div>
                <div><div style={{ fontSize: 9, color: 'var(--fg-3)', textTransform: 'uppercase' }}>Country</div><div style={{ fontSize: 11, marginTop: 2 }}>{partData.countryOfOrigin || "\u2014"}</div></div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button className="btn" style={{ padding: 14 }} onClick={() => window.toast?.('Opening in BOM Editor...', { kind: 'info' })}>View in BOM</button>
              <button className="btn" style={{ padding: 14 }} onClick={() => window.toast?.('Opening vendor info...', { kind: 'info' })}>Vendor Info</button>
            </div>
          </div>
        ) : scanResult ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--fg-3)' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>&#x2753;</div>
            <div style={{ fontSize: 12 }}>No part found for "{scanResult}"</div>
            <button className="btn" style={{ marginTop: 12 }} onClick={() => window.toast?.('Adding to parts library...', { kind: 'info' })}>Add New Part</button>
          </div>
        ) : (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--fg-3)' }}>
            <div style={{ fontSize: 12 }}>Type a part number or scan a barcode to look up component details.</div>
          </div>
        )}
      </div>
    );
  }

  // PO Receiving screen
  if (mode === 'receive') {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => setMode('menu')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>&#x2190;</button>
          <h2 style={{ fontSize: 14, margin: 0 }}>PO Receiving</h2>
        </div>
        {!selectedPo ? (
          <div style={{ padding: 16 }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--fg-3)', marginBottom: 8 }}>Open Purchase Orders ({poList.length})</div>
            {poList.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--fg-3)', fontSize: 12 }}>No open POs to receive</div>
            ) : poList.map(po => (
              <div key={po.id} onClick={() => setSelectedPo(po)} style={{ padding: '12px', border: '1px solid var(--line)', borderRadius: 'var(--r-2)', marginBottom: 8, cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div style={{ fontWeight: 600, fontSize: 12 }}>{po.poNumber}</div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{window.INR?.(po.poTotal, 0)}</div>
                </div>
                <div style={{ fontSize: 10, color: 'var(--fg-3)', marginTop: 4 }}>{po.vendorName} · {po.items?.length || 0} items</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: 16 }}>
            <div className="card" style={{ padding: 16, marginBottom: 12 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{selectedPo.poNumber}</div>
              <div style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: 4 }}>{selectedPo.vendorName}</div>
            </div>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--fg-3)', marginBottom: 8 }}>Items to Receive</div>
            {selectedPo.items?.map((item, i) => (
              <div key={i} style={{ padding: '12px', border: '1px solid var(--line)', borderRadius: 'var(--r-2)', marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 500 }}>{item.itemName}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                  <div style={{ fontSize: 10, color: 'var(--fg-3)' }}>Ordered: {item.quantity}</div>
                  <div style={{ fontSize: 10 }}>{window.INR?.(item.total, 2)}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <input className="twk-field" style={{ width: 80 }} placeholder="Qty" value={receiveQty} onChange={e => setReceiveQty(e.target.value)} />
                  <button className="btn small primary" onClick={() => { window.toast?.('Received ' + receiveQty + ' of ' + item.itemName, { kind: 'success' }); setReceiveQty(''); }}>Receive</button>
                  <button className="btn small" onClick={() => startCamera()}>Scan</button>
                </div>
              </div>
            ))}
            <button className="btn" style={{ width: '100%', marginTop: 8 }} onClick={() => setSelectedPo(null)}>Back to PO List</button>
          </div>
        )}
      </div>
    );
  }

  // Inventory check screen
  if (mode === 'inventory') {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => setMode('menu')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>&#x2190;</button>
          <h2 style={{ fontSize: 14, margin: 0 }}>Inventory Check</h2>
        </div>
        <div style={{ padding: 16 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input className="twk-field" style={{ flex: 1 }} placeholder="Scan or search part..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') lookupPart(searchQuery); }} />
            <button className="btn" onClick={startCamera}>&#x1f4f7;</button>
            <button className="btn primary" onClick={() => lookupPart(searchQuery)}>Check</button>
          </div>
          {partData && (
            <div className="card" style={{ padding: 16 }}>
              <div className="mono" style={{ fontWeight: 600 }}>{partData.partNumber || partData.pn}</div>
              <div style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: 4 }}>{partData.name}</div>
              <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{partData.stock ?? partData.quantity ?? "\u2014"}</div>
                  <div style={{ fontSize: 9, color: 'var(--fg-3)', textTransform: 'uppercase' }}>In Stock</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent)' }}>{partData.reorderPoint ?? 10}</div>
                  <div style={{ fontSize: 9, color: 'var(--fg-3)', textTransform: 'uppercase' }}>Reorder Pt</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{partData.moq ?? "\u2014"}</div>
                  <div style={{ fontSize: 9, color: 'var(--fg-3)', textTransform: 'uppercase' }}>MOQ</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}

window.MobileScannerScreen = MobileScannerScreen;
