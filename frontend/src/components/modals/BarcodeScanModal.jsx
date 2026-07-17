import PropTypes from "prop-types";
import { ANIM } from "../../utils/design-tokens.js";

import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import { Modal, api } from "../../globals";
// ============ BARCODE SCAN ============

export default function BarcodeScanModal({ open, onClose, onFound }) {
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
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      return;
    }
    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "environment" } })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => {
        if (!cancelled)
          toast(
            __t("modals.barcode.cameraDenied") ||
              "Camera access denied or unavailable",
            { kind: "warn" },
          );
      });
    return () => {
      window.cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [open, useCamera]);

  const lookupBarcode = async (barcode) => {
    if (!barcode.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.barcodes.lookup(barcode);
      if (result.found) {
        setFoundPart(result);
        setPhase("found");
      } else {
        setError(
          (
            __t("modals.barcode.noPartFound") ||
            "No part found for barcode: {barcode}"
          ).replace("{barcode}", barcode),
        );
        setPhase("error");
      }
    } catch (err) {
      setError(
        err.message ||
          __t("modals.barcode.lookupFailed") ||
          "Failed to lookup barcode",
      );
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
      toast(
        (
          __t("modals.barcode.foundAndAdded") ||
          "Found: {pn} · added to draft PO"
        ).replace("{pn}", foundPart.pn),
        { kind: "success" },
      );
    }
  };

  const scanAnother = () => {
    setPhase("scanning");
    setFoundPart(null);
    setManualBarcode("");
    setError(null);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Scan size={16} />}
      title={__t("modals.barcode.title") || "Scan barcode"}
      subtitle={
        useCamera
          ? __t("modals.barcode.realCamera") ||
            "Real camera \u00B7 point at barcode"
          : phase === "scanning"
            ? __t("modals.barcode.pointCamera") || "Point camera at barcode"
            : phase === "error"
              ? __t("common.error") || "Error"
              : __t("modals.barcode.matchFound") || "Match found"
      }
      footer={
        phase === "found" ? (
          <>
            <button className="btn" onClick={scanAnother}>
              {__t("modals.barcode.scanAnother") || "Scan another"}
            </button>
            <button className="btn" onClick={onClose}>
              {__t("common.close") || "Close"}
            </button>
            <button className="btn primary" onClick={apply}>
              <Icon.Plus size={12} />{" "}
              {__t("modals.barcode.addToPo") || "Add to PO"}
            </button>
          </>
        ) : (
          <>
            <button
              className="btn"
              onClick={() => setUseCamera(!useCamera)}
              style={{ color: useCamera ? "var(--accent)" : "var(--fg-3)" }}
            >
              <Icon.Scan size={12} />{" "}
              {useCamera
                ? __t("modals.barcode.usingCamera") || "Using camera"
                : __t("modals.barcode.useCamera") || "Use camera"}
            </button>
            <button className="btn" onClick={onClose}>
              {__t("common.cancel") || "Cancel"}
            </button>
          </>
        )
      }
    >
      <div
        className="pos-relative rounded-r3 overflow-h border-line"
        style={{ aspectRatio: "16 / 10", background: "#0a0a0a" }}
      >
        {useCamera ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-100p h-100p d-block"
            style={{ objectFit: "cover" }}
          />
        ) : (
          <div
            className="pos-absolute"
            style={{
              inset: 0,
              background:
                "radial-gradient(circle at center, #1a1a1a 0%, #050505 80%)",
            }}
          />
        )}
        {!useCamera && (
          <div
            className="pos-absolute"
            style={{
              inset: 0,
              background:
                "repeating-linear-gradient(0deg, transparent 0 3px, rgba(255,255,255,0.02) 3px 4px)",
            }}
          />
        )}
        {/* Viewfinder corners */}
        {[0, 1, 2, 3].map((i) => {
          const bt = i < 2 ? "3px solid var(--accent)" : "none";
          const bb = i >= 2 ? "3px solid var(--accent)" : "none";
          const bl = i % 2 === 0 ? "3px solid var(--accent)" : "none";
          const br = i % 2 === 1 ? "3px solid var(--accent)" : "none";
          return (
            <div
              key={"ov-" + i}
              className="pos-absolute w-28 h-28"
              style={{
                borderTop: bt,
                borderBottom: bb,
                borderLeft: bl,
                borderRight: br,
              }}
            />
          );
        })}
        {/* Fake barcode */}
        {phase === "found" && foundPart && (
          <div
            className="pos-absolute flex justify-center"
            style={{
              left: "30%",
              right: "30%",
              top: "50%",
              transform: "translateY(-50%)",
              gap: 1,
            }}
          >
            {[
              2, 1, 3, 1, 1, 2, 3, 1, 2, 1, 1, 3, 2, 1, 3, 1, 2, 1, 3, 1, 1, 2,
              1, 3, 1, 2, 3, 1, 2, 1,
            ].map((w, i) => (
              <div
                key={"bc-" + i}
                className="h-60"
                style={{
                  width: w * 2 + "px",
                  background: i % 2 === 0 ? "white" : "transparent",
                }}
              />
            ))}
          </div>
        )}
        {/* Scan line */}
        {phase === "scanning" && <div className="pos-absolute" />}
        {/* Status text */}
        <div
          className="pos-absolute font-mono fs-11 flex justify-between"
          style={{ bottom: 12, left: 12, right: 12, color: "white" }}
        >
          <span className="inline-flex items-center gap-6">
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 99,
                background:
                  phase === "found"
                    ? "var(--ok)"
                    : phase === "error"
                      ? "var(--err)"
                      : "var(--accent)",
                animation:
                  phase === "scanning"
                    ? "pulse " + ANIM.PULSE + " infinite"
                    : "none",
              }}
            />
            {phase === "scanning"
              ? __t("modals.barcode.scanning") || "SCANNING"
              : phase === "error"
                ? __t("common.error") || "ERROR"
                : __t("modals.barcode.matchFound") || "MATCH FOUND"}
          </span>
          <span className="op-06">
            {useCamera
              ? __t("modals.barcode.liveRearCam") || "LIVE \u00B7 rear cam"
              : __t("modals.barcode.manualEntry") || "MANUAL ENTRY"}
          </span>
        </div>
      </div>

      {/* Manual barcode entry when not using camera */}
      {!useCamera && phase === "scanning" && (
        <div className="mt-14">
          <div className="flex gap-8">
            <input
              id="barcode-manual"
              name="manualBarcode"
              type="text"
              placeholder={
                __t("modals.barcode.manualPlaceholder") ||
                "Enter barcode manually..."
              }
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
              {loading
                ? __t("modals.barcode.lookingUp") || "Looking up..."
                : __t("modals.barcode.lookup") || "Lookup"}
            </button>
          </div>
        </div>
      )}

      {/* Error message */}
      {phase === "error" && error && (
        <div
          className="mt-14 rounded-r2"
          style={{
            padding: 12,
            border: "1px solid var(--err)",
            background: "var(--err-soft)",
          }}
        >
          <div className="fs-13" style={{ color: "var(--err)" }}>
            {error}
          </div>
          <button className="btn mt-8" onClick={scanAnother}>
            {__t("modals.barcode.tryAgain") || "Try Again"}
          </button>
        </div>
      )}

      {/* Found part details */}
      {phase === "found" && foundPart && (
        <div
          className="mt-14 rounded-r2"
          style={{
            padding: 12,
            border: "1px solid var(--accent)",
            background: "var(--accent-soft)",
          }}
        >
          <div className="font-mono fs-11 fg-accent letter-sp-6 uppercase">
            EAN-13 · {foundPart.barcode} · {foundPart.pn}
          </div>
          <div className="fs-14 fw-600 mt-4">{foundPart.name}</div>
          <div className="font-mono fs-11 fg-2 mt-2">
            {foundPart.vendor || __t("modals.barcode.unknown") || "Unknown"}{" "}
            \u00B7{" "}
            {foundPart.cost
              ? `\u20B9${(foundPart.cost * (window.INR_RATE || 83)).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
              : "N/A"}{" "}
            \u00B7{" "}
            {foundPart.status || __t("modals.barcode.unknown") || "Unknown"}
          </div>
        </div>
      )}

      <style>{`
        @keyframes scan { 0% { top: 20%; } 50% { top: 80%; } 100% { top: 20%; } }
        @keyframes pulse { 50% { opacity: 0.3; } }
      `}</style>
    </Modal>
  );
}

BarcodeScanModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
  onFound: PropTypes.func,
};
