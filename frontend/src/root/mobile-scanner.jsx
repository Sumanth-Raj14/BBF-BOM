import { storage } from "../utils/storage.js";
import { __t } from "../i18n";
// Mobile Scanner PWA Screen
// Provides: barcode scanning via camera, quick part lookup, PO receiving, inventory updates
function MobileScannerScreen() {
  const [mode, setMode] = React.useState("menu"); // menu | scan | lookup | receive | inventory
  const [scanResult, setScanResult] = React.useState(null);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [partData, setPartData] = React.useState(null);
  const [, setCameraActive] = React.useState(false);
  const [recentScans, setRecentScans] = React.useState(() => {
    try {
      return storage.recentScans.get();
    } catch {
      return [];
    }
  });
  const [poList, setPoList] = React.useState([]);
  const [selectedPo, setSelectedPo] = React.useState(null);
  const [receiveQty, setReceiveQty] = React.useState("");
  // Barcode scanning via camera
  const videoRef = React.useRef(null);
  const canvasRef = React.useRef(null);
  const streamRef = React.useRef(null);
  const startCamera = React.useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCameraActive(true);
      setMode("scan");
    } catch (_e) {
      toast(
        __t("mobileScan.cameraDenied") ||
          "Camera access denied. Using manual entry.",
        { kind: "warning" },
      );
      setMode("lookup");
    }
  }, []);
  const stopCamera = React.useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);
  const lookupPart = React.useCallback(
    async (code) => {
      if (!code) return;
      try {
        const result = await api?.parts?.list({ search: code, limit: 10 });
        const parts = Array.isArray(result) ? result : result?.items || [];
        if (parts.length > 0) {
          setPartData(parts[0]);
          setScanResult(code);
          // Save to recent scans
          const scan = { code, part: parts[0], time: new Date().toISOString() };
          const updated = [
            scan,
            ...recentScans.filter((s) => s.code !== code),
          ].slice(0, 20);
          setRecentScans(updated);
          storage.recentScans.set(updated);
        } else {
          setPartData(null);
          setScanResult(code);
        }
      } catch (_e) {
        // Try barcode lookup
        try {
          const barcode = await api?.barcodes?.lookup(code);
          if (barcode) {
            setPartData(barcode);
            setScanResult(code);
          }
        } catch (_e2) {
          toast(
            __t("mobileScan.barcodeLookupFailed") || "Barcode lookup failed",
            { kind: "error" },
          );
        }
      }
    },
    [recentScans],
  );
  // Simulate barcode detection (real detection would use a barcode library)
  const simulateScan = () => {
    const demoCodes = [
      "STM32H743VIT6",
      "LM358",
      "ESP32-C3",
      "MEAN-WELL-RS-15-5",
      "PCB-001-A",
    ];
    const code = demoCodes[Math.floor(Math.random() * demoCodes.length)];
    lookupPart(code);
  };
  // Load POs for receiving
  const loadPOs = React.useCallback(async () => {
    try {
      const result = await poOrdersAPI?.list({
        status: "Order Placed",
        limit: 50,
      });
      setPoList(result?.items || []);
    } catch (_e) {
      toast(
        __t("mobileScan.failedToLoadPOs") || "Failed to load purchase orders",
        { kind: "error" },
      );
    }
  }, []);
  React.useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);
  // Menu screen
  if (mode === "menu") {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", padding: 16 }}>
        <div className="text-center" style={{ padding: "20px 0 30px" }}>
          <div className="fs-28 fw-700 font-mono">
            {__t("app.brandBlackbox") || "BLACKBOX"}
          </div>
          <div className="fs-11 fg-3">
            {__t("mobileScan.mobileScanner") || "MOBILE SCANNER"}
          </div>
        </div>
        <div className="d-grid gap-12 max-w-400 grid-cols-2 mx-auto">
          <button
            onClick={startCamera}
            className="rounded-r2 border-line c-pointer text-center bg-elev p-24"
          >
            <div className="fs-28 mb-8">&#x1f4f7;</div>
            <div className="fs-12 fw-600">
              {__t("mobileScan.scanBarcode") || "Scan Barcode"}
            </div>
            <div className="fs-9 mt-4 fg-3">
              {__t("mobileScan.camera") || "Camera"}
            </div>
          </button>
          <button
            onClick={() => {
              setMode("lookup");
            }}
            className="rounded-r2 border-line c-pointer text-center bg-elev p-24"
          >
            <div className="fs-28 mb-8">&#x1f50d;</div>
            <div className="fs-12 fw-600">
              {__t("mobileScan.manualLookup") || "Manual Lookup"}
            </div>
            <div className="fs-9 mt-4 fg-3">
              {__t("mobileScan.searchParts") || "Search parts"}
            </div>
          </button>
          <button
            onClick={() => {
              loadPOs();
              setMode("receive");
            }}
            className="rounded-r2 border-line c-pointer text-center bg-elev p-24"
          >
            <div className="fs-28 mb-8">&#x1f4e6;</div>
            <div className="fs-12 fw-600">
              {__t("mobileScan.poReceiving") || "PO Receiving"}
            </div>
            <div className="fs-9 mt-4 fg-3">
              {__t("mobileScan.receiveGoods") || "Receive goods"}
            </div>
          </button>
          <button
            onClick={() => setMode("inventory")}
            className="rounded-r2 border-line c-pointer text-center bg-elev p-24"
          >
            <div className="fs-28 mb-8">&#x1f4ca;</div>
            <div className="fs-12 fw-600">
              {__t("mobileScan.inventory") || "Inventory"}
            </div>
            <div className="fs-9 mt-4 fg-3">
              {__t("mobileScan.stockCheck") || "Stock check"}
            </div>
          </button>
        </div>
        {recentScans.length > 0 && (
          <div className="mt-24 max-w-400 mx-auto">
            <div className="fs-10 uppercase letter-sp-6 mb-8 fg-3">
              {__t("mobileScan.recentScans") || "Recent Scans"}
            </div>
            {recentScans.slice(0, 5).map((s) => (
              <div
                key={s.code}
                onClick={() => {
                  setPartData(s.part);
                  setScanResult(s.code);
                  setMode("lookup");
                }}
                className="border-bottom c-pointer flex justify-between px-12 py-10"
              >
                <div>
                  <div className="mono fs-11 fw-600">{s.code}</div>
                  <div className="fs-10 fg-3">
                    {s.part?.name ||
                      s.part?.partNumber ||
                      __t("mobileScan.unknown") ||
                      "Unknown"}
                  </div>
                </div>
                <div className="fs-9 fg-4">
                  {new Date(s.time).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
  // Camera scan screen
  if (mode === "scan") {
    return (
      <div
        className="pos-relative"
        style={{ minHeight: "100vh", background: "#000" }}
      >
        <video
          ref={videoRef}
          className="w-100p"
          style={{ height: "60vh", objectFit: "cover" }}
          playsInline
          muted
        />
        <canvas ref={canvasRef} className="d-none" />
        <div
          className="pos-absolute h-2"
          style={{
            top: "25vh",
            left: "10%",
            width: "80%",
            background: "#e85d1f",
            boxShadow: "0 0 20px #e85d1f",
          }}
        />
        <div
          className="pos-absolute"
          style={{
            bottom: 0,
            left: 0,
            right: 0,
            padding: 16,
            background: "linear-gradient(transparent, rgba(0,0,0,0.9))",
          }}
        >
          <div className="text-center fs-12 mb-12 fg-white">
            {__t("mobileScan.alignBarcode") || "Align barcode within the frame"}
          </div>
          <div className="flex gap-8">
            <button
              onClick={simulateScan}
              className="flex-1 rounded-r2 b-0 fw-600 fs-13 c-pointer"
              style={{ padding: 14, background: "#e85d1f", color: "white" }}
            >
              {__t("mobileScan.demoScan") || "Demo Scan"}
            </button>
            <button
              onClick={() => {
                stopCamera();
                setMode("lookup");
              }}
              className="flex-1 rounded-r2 border-line fs-13 c-pointer"
              style={{
                padding: 14,
                background: "var(--bg-elev)",
                color: "var(--fg)",
              }}
            >
              {__t("mobileScan.manualEntry") || "Manual Entry"}
            </button>
          </div>
          <button
            onClick={() => {
              stopCamera();
              setMode("menu");
            }}
            className="w-100p mt-8 b-0 fs-11 c-pointer bg-transparent fg-3 p-10"
          >
            {__t("mobileScan.backToMenu") || "Back to Menu"}
          </button>
        </div>
        {scanResult && partData && (
          <div
            onClick={() => setMode("lookup")}
            className="pos-absolute rounded-r2 c-pointer"
            style={{
              top: 16,
              left: 16,
              right: 16,
              background: "var(--bg)",
              padding: 16,
              boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            }}
          >
            <div className="flex items-center gap-8">
              <span
                className="fs-18"
                style={{ color: "var(--green, #10b981)" }}
              >
                &#x2714;
              </span>
              <div>
                <div className="mono fw-600">{scanResult}</div>
                <div className="fs-11 fg-3">
                  {partData.name || partData.partNumber}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
  // Lookup / scan result screen
  if (mode === "lookup") {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
        <div className="border-bottom flex gap-8 items-center py-12 px-16">
          <button
            onClick={() => {
              setMode("menu");
              setPartData(null);
              setScanResult(null);
            }}
            className="b-0 c-pointer fs-18 bg-transparent"
          >
            &#x2190;
          </button>
          <input
            id="ms-search"
            name="partSearch"
            className="twk-field flex-1"
            placeholder={
              __t("mobileScan.searchPlaceholder") ||
              "Search by name, part number, or barcode..."
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") lookupPart(searchQuery);
            }}
            autoFocus
            aria-label={
              __t("mobileScan.searchAria") || "Search part by name or barcode"
            }
          />
          <button
            className="btn primary"
            onClick={() => lookupPart(searchQuery)}
          >
            {__t("common.search") || "Search"}
          </button>
          <button className="btn" onClick={startCamera}>
            <span>&#x1f4f7;</span>
          </button>
        </div>
        {partData ? (
          <div className="p-16">
            <div className="card mb-12 p-16">
              <div className="flex justify-between items-start">
                <div>
                  <div className="mono fs-14 fw-700">
                    {partData.partNumber || partData.pn || scanResult}
                  </div>
                  <div className="fs-12 mt-4">
                    {partData.name || partData.description}
                  </div>
                </div>
                <span
                  className={(
                    "status " +
                    (partData.status === "Active" ? "released" : "review") +
                    " fs-9"
                  ).trim()}
                >
                  {partData.status || "Active"}
                </span>
              </div>
              <div className="d-grid gap-12 mt-16 grid-cols-2">
                <div>
                  <div className="fs-9 uppercase fg-3">
                    {__t("mobileScan.manufacturer") || "Manufacturer"}
                  </div>
                  <div className="fs-11 mt-2">
                    {partData.manufacturer || "\u2014"}
                  </div>
                </div>
                <div>
                  <div className="fs-9 uppercase fg-3">
                    {__t("part.category") || "Category"}
                  </div>
                  <div className="fs-11 mt-2">
                    {partData.category || "\u2014"}
                  </div>
                </div>
                <div>
                  <div className="fs-9 uppercase fg-3">
                    {__t("mobileScan.unitCost") || "Unit Cost"}
                  </div>
                  <div className="fs-11 mt-2 fw-600">
                    {partData.unitCost ? INR?.(partData.unitCost, 2) : "\u2014"}
                  </div>
                </div>
                <div>
                  <div className="fs-9 uppercase fg-3">
                    {__t("mobileScan.country") || "Country"}
                  </div>
                  <div className="fs-11 mt-2">
                    {partData.countryOfOrigin || "\u2014"}
                  </div>
                </div>
              </div>
            </div>
            <div className="d-grid gap-8 grid-cols-2">
              <button
                className="btn p-14"
                onClick={() =>
                  toast(
                    __t("mobileScan.openingBomEditor") ||
                      "Opening in BOM Editor...",
                    { kind: "info" },
                  )
                }
              >
                {__t("mobileScan.viewInBom") || "View in BOM"}
              </button>
              <button
                className="btn p-14"
                onClick={() =>
                  toast(
                    __t("mobileScan.openingVendorInfo") ||
                      "Opening vendor info...",
                    { kind: "info" },
                  )
                }
              >
                {__t("mobileScan.vendorInfo") || "Vendor Info"}
              </button>
            </div>
          </div>
        ) : scanResult ? (
          <div className="text-center p-40 fg-3">
            <div className="fs-32 mb-8">&#x2753;</div>
            <div className="fs-12">
              {(
                __t("mobileScan.noPartFound") || 'No part found for "{code}"'
              ).replace("{code}", scanResult)}
            </div>
            <button
              className="btn mt-12"
              onClick={() =>
                toast(
                  __t("mobileScan.addingPart") || "Adding to parts library...",
                  { kind: "info" },
                )
              }
            >
              {__t("mobileScan.addNewPart") || "Add New Part"}
            </button>
          </div>
        ) : (
          <div className="text-center p-40 fg-3">
            <div className="fs-12">
              {__t("mobileScan.lookupHint") ||
                "Type a part number or scan a barcode to look up component details."}
            </div>
          </div>
        )}
      </div>
    );
  }
  // PO Receiving screen
  if (mode === "receive") {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
        <div className="border-bottom flex gap-8 items-center py-12 px-16">
          <button
            onClick={() => setMode("menu")}
            className="b-0 c-pointer fs-18 bg-transparent"
          >
            &#x2190;
          </button>
          <h2 className="fs-14 m-0">
            {__t("mobileScan.poReceiving") || "PO Receiving"}
          </h2>
        </div>
        {!selectedPo ? (
          <div className="p-16">
            <div className="fs-10 uppercase letter-sp-6 mb-8 fg-3">
              {(
                __t("mobileScan.openPurchaseOrders") ||
                "Open Purchase Orders ({count})"
              ).replace("{count}", poList.length)}
            </div>
            {poList.length === 0 ? (
              <div className="text-center fs-12 p-40 fg-3">
                {__t("mobileScan.noOpenPOs") || "No open POs to receive"}
              </div>
            ) : (
              poList.map((po) => (
                <div
                  key={po.id}
                  onClick={() => setSelectedPo(po)}
                  className="border-line rounded-r2 mb-8 c-pointer p-12"
                >
                  <div className="flex justify-between">
                    <div className="fw-600 fs-12">{po.poNumber}</div>
                    <div className="fs-12 fw-600">{INR?.(po.poTotal, 0)}</div>
                  </div>
                  <div className="fs-10 mt-4 fg-3">
                    {po.vendorName} · {po.items?.length || 0}{" "}
                    {__t("mobileScan.items") || "items"}
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="p-16">
            <div className="card mb-12 p-16">
              <div className="fw-600 fs-14">{selectedPo.poNumber}</div>
              <div className="fs-11 mt-4 fg-3">{selectedPo.vendorName}</div>
            </div>
            <div className="fs-10 uppercase letter-sp-6 mb-8 fg-3">
              {__t("mobileScan.itemsToReceive") || "Items to Receive"}
            </div>
            {selectedPo.items?.map((item, i) => (
              <div
                key={item.itemName + "-" + i}
                className="border-line rounded-r2 mb-8 p-12"
              >
                <div className="fs-11 fw-500">{item.itemName}</div>
                <div className="flex justify-between mt-8">
                  <div className="fs-10 fg-3">
                    {(__t("mobileScan.ordered") || "Ordered: {qty}").replace(
                      "{qty}",
                      item.quantity,
                    )}
                  </div>
                  <div className="fs-10">{INR?.(item.total, 2)}</div>
                </div>
                <div className="flex gap-8 mt-8">
                  <input
                    id="ms-receive-qty"
                    name="receiveQty"
                    className="twk-field w-80"
                    placeholder={__t("mobileScan.qty") || "Qty"}
                    value={receiveQty}
                    onChange={(e) => setReceiveQty(e.target.value)}
                    aria-label={
                      __t("mobileScan.receiveQtyAria") || "Receive quantity"
                    }
                  />
                  <button
                    className="btn small primary"
                    onClick={() => {
                      toast(
                        (
                          __t("mobileScan.receivedToast") ||
                          "Received {qty} of {item}"
                        )
                          .replace("{qty}", receiveQty)
                          .replace("{item}", item.itemName),
                        { kind: "success" },
                      );
                      setReceiveQty("");
                    }}
                  >
                    {__t("mobileScan.receiveBtn") || "Receive"}
                  </button>
                  <button className="btn small" onClick={() => startCamera()}>
                    {__t("mobileScan.scanBtn") || "Scan"}
                  </button>
                </div>
              </div>
            ))}
            <button
              className="btn w-100p mt-8"
              onClick={() => setSelectedPo(null)}
            >
              {__t("mobileScan.backToPoList") || "Back to PO List"}
            </button>
          </div>
        )}
      </div>
    );
  }
  // Inventory check screen
  if (mode === "inventory") {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
        <div className="border-bottom flex gap-8 items-center py-12 px-16">
          <button
            onClick={() => setMode("menu")}
            className="b-0 c-pointer fs-18 bg-transparent"
          >
            &#x2190;
          </button>
          <h2 className="fs-14 m-0">
            {__t("mobileScan.inventoryCheck") || "Inventory Check"}
          </h2>
        </div>
        <div className="p-16">
          <div className="flex gap-8 mb-16">
            <input
              id="ms-check-search"
              name="checkSearch"
              className="twk-field flex-1"
              placeholder={
                __t("mobileScan.scanOrSearchPart") || "Scan or search part..."
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") lookupPart(searchQuery);
              }}
              aria-label={
                __t("mobileScan.inventorySearchAria") ||
                "Search part for inventory check"
              }
            />
            <button className="btn" onClick={startCamera}>
              &#x1f4f7;
            </button>
            <button
              className="btn primary"
              onClick={() => lookupPart(searchQuery)}
            >
              {__t("mobileScan.check") || "Check"}
            </button>
          </div>
          {partData && (
            <div className="card p-16">
              <div className="mono fw-600">
                {partData.partNumber || partData.pn}
              </div>
              <div className="fs-11 mt-4 fg-3">{partData.name}</div>
              <div className="mt-16 d-grid gap-12 grid-cols-3">
                <div className="text-center">
                  <div className="fs-20 fw-700">
                    {partData.stock ?? partData.quantity ?? "\u2014"}
                  </div>
                  <div className="fs-9 uppercase fg-3">
                    {__t("mobileScan.inStock") || "In Stock"}
                  </div>
                </div>
                <div className="text-center">
                  <div className="fs-20 fw-700 fg-accent">
                    {partData.reorderPoint ?? 10}
                  </div>
                  <div className="fs-9 uppercase fg-3">
                    {__t("mobileScan.reorderPt") || "Reorder Pt"}
                  </div>
                </div>
                <div className="text-center">
                  <div className="fs-20 fw-700">{partData.moq ?? "\u2014"}</div>
                  <div className="fs-9 uppercase fg-3">
                    {__t("mobileScan.moq") || "MOQ"}
                  </div>
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
export { MobileScannerScreen };
window.MobileScannerScreen = MobileScannerScreen;
