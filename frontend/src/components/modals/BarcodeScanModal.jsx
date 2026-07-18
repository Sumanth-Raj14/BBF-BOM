import PropTypes from "prop-types";
import { ANIM } from "../../utils/design-tokens.js";

import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import { Icon, api } from "../../globals";
import { Modal, Button, Input, StatusPill } from "../ui";
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
            "Real camera · point at barcode"
          : phase === "scanning"
            ? __t("modals.barcode.pointCamera") || "Point camera at barcode"
            : phase === "error"
              ? __t("common.error") || "Error"
              : __t("modals.barcode.matchFound") || "Match found"
      }
      closeLabel={__t("modals.barcode.closeDialog") || "Close scan dialog"}
      footer={
        phase === "found" ? (
          <>
            <Button variant="secondary" onClick={scanAnother}>
              {__t("modals.barcode.scanAnother") || "Scan another"}
            </Button>
            <Button variant="secondary" onClick={onClose}>
              {__t("common.close") || "Close"}
            </Button>
            <Button variant="primary" onClick={apply}>
              <Icon.Plus size={12} />{" "}
              {__t("modals.barcode.addToPo") || "Add to PO"}
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="secondary"
              aria-pressed={useCamera}
              onClick={() => setUseCamera(!useCamera)}
              className={useCamera ? "barcode-modal__camera-btn--on" : ""}
            >
              <Icon.Scan size={12} />{" "}
              {useCamera
                ? __t("modals.barcode.usingCamera") || "Using camera"
                : __t("modals.barcode.useCamera") || "Use camera"}
            </Button>
            <Button variant="secondary" onClick={onClose}>
              {__t("common.cancel") || "Cancel"}
            </Button>
          </>
        )
      }
    >
      <div
        className="barcode-modal__viewfinder pos-relative rounded-r3 overflow-h border-line"
        style={{ aspectRatio: "16 / 10" }}
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
          const bt = i < 2 ? "3px solid var(--accent-interactive)" : "none";
          const bb = i >= 2 ? "3px solid var(--accent-interactive)" : "none";
          const bl = i % 2 === 0 ? "3px solid var(--accent-interactive)" : "none";
          const br = i % 2 === 1 ? "3px solid var(--accent-interactive)" : "none";
          return (
            <div
              key={"ov-" + i}
              className="pos-absolute w-28 h-28"
              aria-hidden="true"
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
            aria-hidden="true"
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
        {/* Status text */}
        <div
          className="pos-absolute font-mono fs-11 flex justify-between"
          role="status"
          aria-live="polite"
          style={{ bottom: 12, left: 12, right: 12, color: "white" }}
        >
          <span className="inline-flex items-center gap-6">
            <span
              aria-hidden="true"
              style={{
                width: 6,
                height: 6,
                borderRadius: 99,
                background:
                  phase === "found"
                    ? "var(--status-success)"
                    : phase === "error"
                      ? "var(--status-danger)"
                      : "var(--accent-interactive)",
                animation:
                  phase === "scanning"
                    ? "barcode-modal-pulse " + ANIM.PULSE + " infinite"
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
              ? __t("modals.barcode.liveRearCam") || "LIVE · rear cam"
              : __t("modals.barcode.manualEntry") || "MANUAL ENTRY"}
          </span>
        </div>
      </div>

      {/* Manual barcode entry when not using camera */}
      {!useCamera && phase === "scanning" && (
        <div className="mt-14 flex gap-8">
          <Input
            id="barcode-manual"
            name="manualBarcode"
            type="text"
            mono
            aria-label={
              __t("modals.barcode.manualPlaceholder") ||
              "Enter barcode manually..."
            }
            placeholder={
              __t("modals.barcode.manualPlaceholder") ||
              "Enter barcode manually..."
            }
            value={manualBarcode}
            onChange={(e) => setManualBarcode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleManualLookup()}
            className="flex-1"
            disabled={loading}
          />
          <Button
            variant="primary"
            onClick={handleManualLookup}
            loading={loading}
            disabled={!manualBarcode.trim()}
          >
            {loading
              ? __t("modals.barcode.lookingUp") || "Looking up..."
              : __t("modals.barcode.lookup") || "Lookup"}
          </Button>
        </div>
      )}

      {/* Error message */}
      {phase === "error" && error && (
        <div className="barcode-modal__error mt-14 rounded-r2" role="alert">
          <div className="fs-13">{error}</div>
          <Button variant="secondary" className="mt-8" onClick={scanAnother}>
            {__t("modals.barcode.tryAgain") || "Try Again"}
          </Button>
        </div>
      )}

      {/* Found part details */}
      {phase === "found" && foundPart && (
        <div className="barcode-modal__result mt-14 rounded-r2" role="status">
          <div className="font-mono fs-11 fg-accent letter-sp-6 uppercase">
            EAN-13 · {foundPart.barcode} · {foundPart.pn}
          </div>
          <div className="fs-14 fw-600 mt-4">{foundPart.name}</div>
          <div className="flex items-center gap-6 font-mono fs-11 fg-2 mt-2">
            <span>
              {foundPart.vendor || __t("modals.barcode.unknown") || "Unknown"}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {foundPart.cost
                ? `₹${(foundPart.cost * (window.INR_RATE || 83)).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
                : "N/A"}
            </span>
            {foundPart.status && (
              <>
                <span aria-hidden="true">·</span>
                <StatusPill status={foundPart.status} />
              </>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes barcode-modal-pulse { 50% { opacity: 0.3; } }
        @media (prefers-reduced-motion: reduce) {
          .barcode-modal__viewfinder * { animation: none !important; }
        }
        .barcode-modal__viewfinder { background: #0a0a0a; }
        .barcode-modal__camera-btn--on { color: var(--accent-text); }
        .barcode-modal__error {
          padding: 12px;
          border: 1px solid var(--status-danger);
          background: color-mix(in srgb, var(--status-danger) 10%, var(--bg-surface));
          color: var(--status-danger-text);
        }
        .barcode-modal__result {
          padding: 12px;
          border: 1px solid var(--accent-interactive);
          background: color-mix(in srgb, var(--accent-interactive) 8%, var(--bg-surface));
        }
      `}</style>
    </Modal>
  );
}

BarcodeScanModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
  onFound: PropTypes.func,
};
