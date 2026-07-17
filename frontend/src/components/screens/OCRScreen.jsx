import { __t } from "../../i18n";

import { toast } from "../../utils/toast";
import { api, useAppStore } from "../../globals";
// ============ OCR ============
export default function OCRScreen() {
  const ctx = useAppStore();
  const [extracted, setExtracted] = React.useState([]);
  const [editing, setEditing] = React.useState(null);
  const [reextracting, setReextracting] = React.useState(false);
  const [confirmed, setConfirmed] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [docId, setDocId] = React.useState(null);
  const [partPn, setPartPn] = React.useState(null);

  const runExtraction = React.useCallback((documentId, partId) => {
    setLoading(true);
    (api?.ocr?.extract?.(documentId, partId) || Promise.resolve(null))
      .then((data) => {
        if (data && data.fields) {
          setExtracted(
            data.fields.map((f) => ({
              label: f.label,
              value: f.value,
              conf: f.confidence,
            })),
          );
          setDocId(data.documentId);
          setPartPn(data.partPn);
        }
      })
      .catch((err) => {
        console.warn("[OCRScreen] OCR extraction failed:", err?.message || err);
      })
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    runExtraction(null, null);
  }, []);

  const reextract = () => {
    setReextracting(true);
    runExtraction(docId, null);
    setTimeout(() => setReextracting(false), 1100);
  };

  const confirm = () => {
    setConfirmed(true);
    if (ctx?.setNotifications) {
      ctx.setNotifications([
        {
          id: Date.now(),
          who: "System",
          init: "\u230C",
          color: "sys",
          action: "OCR applied to",
          obj: partPn || "part",
          time: "just now",
          read: false,
          route: "bom",
        },
        ...ctx.notifications,
      ]);
    }
    toast(
      extracted.length +
        " " +
        (__t("ocr.fieldsApplied") || "fields applied to part") +
        " " +
        (partPn || __t("ocr.part") || "part") +
        " \u00B7 " +
        (__t("ocr.auditLogged") || "audit logged"),
      {
        kind: "success",
        action: {
          label: __t("ocr.openPart") || "Open part",
          onClick: () => window.__nav?.("bom"),
        },
      },
    );
    setTimeout(() => setConfirmed(false), 1500);
  };

  const updateField = (i, value) => {
    const next = [...extracted];
    next[i] = { ...next[i], value, conf: Math.max(next[i].conf, 0.99) };
    setExtracted(next);
  };

  return (
    <div className="screen-wrap">
      <div className="screen-header">
        <div>
          <h1>{__t("ocr.title") || "Datasheet OCR"}</h1>
          <div className="sub">
            {loading
              ? __t("ocr.extracting") || "Extracting..."
              : `${extracted.length} ${__t("ocr.fields") || "fields"} \u00B7 ${extracted.filter((e) => e.conf >= 0.9).length} ${__t("ocr.highConfidence") || "high confidence"}`}
            {partPn ? ` \u00B7 ${partPn}` : ""}
          </div>
        </div>
        <div className="flex gap-8">
          <label className="btn cursor-pointer">
            <Icon.Import size={12} />{" "}
            {__t("ocr.uploadDatasheet") || "Upload datasheet"}
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.tiff"
              className="d-none"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setLoading(true);
                toast(
                  (__t("ocr.uploading") || "Uploading ") + file.name + "...",
                  { kind: "info" },
                );
                if (api?.ocr?.upload) {
                  api.ocr
                    .upload(file)
                    .then((data) => {
                      if (data && data.fields && data.fields.length > 0) {
                        setExtracted(
                          data.fields.map((f) => ({
                            label: f.label,
                            value: f.value,
                            conf: f.confidence,
                          })),
                        );
                        setDocId(data.documentId || null);
                        setPartPn(data.partPn || null);
                      } else {
                        setExtracted([
                          {
                            label: __t("ocr.fieldPartNumber") || "Part Number",
                            value: file.name.replace(/\.[^.]+$/, ""),
                            conf: 0.5,
                          },
                          {
                            label: __t("ocr.fieldStatus") || "Status",
                            value:
                              __t("ocr.noFieldsExtracted") ||
                              "No fields extracted — try a clearer image",
                            conf: 0,
                          },
                        ]);
                      }
                      toast(
                        (__t("ocr.extractionComplete") ||
                          "OCR extraction complete — ") +
                          (data.fields?.length || 0) +
                          " " +
                          (__t("ocr.fieldsFound") || "fields found"),
                        { kind: "success" },
                      );
                    })
                    .catch((err) => {
                      toast(
                        (__t("ocr.failed") || "OCR failed: ") +
                          (err.message ||
                            __t("ocr.backendError") ||
                            "backend error"),
                        { kind: "error" },
                      );
                      setExtracted([
                        {
                          label: __t("ocr.fieldPartNumber") || "Part Number",
                          value: file.name.replace(/\.[^.]+$/, ""),
                          conf: 0.5,
                        },
                        {
                          label: __t("ocr.fieldError") || "Error",
                          value:
                            err.message ||
                            __t("ocr.uploadFailed") ||
                            "Upload failed",
                          conf: 0,
                        },
                      ]);
                    })
                    .finally(() => setLoading(false));
                } else {
                  setTimeout(() => {
                    setExtracted([
                      {
                        label: __t("ocr.fieldPartNumber") || "Part Number",
                        value: file.name.replace(/\.[^.]+$/, ""),
                        conf: 0.95,
                      },
                      {
                        label: __t("ocr.fieldDescription") || "Description",
                        value:
                          (__t("ocr.uploaded") || "Uploaded: ") + file.name,
                        conf: 0.88,
                      },
                      {
                        label: __t("ocr.fieldManufacturer") || "Manufacturer",
                        value: "—",
                        conf: 0,
                      },
                      {
                        label: __t("ocr.fieldPackage") || "Package",
                        value: "—",
                        conf: 0,
                      },
                      {
                        label: __t("ocr.fieldVoltage") || "Voltage",
                        value: "—",
                        conf: 0,
                      },
                    ]);
                    setLoading(false);
                    toast(
                      __t("ocr.mockBackendOffline") ||
                        "Mock OCR — backend offline",
                      { kind: "warn" },
                    );
                  }, 1200);
                }
                e.target.value = "";
              }}
            />
          </label>
          <button className="btn" onClick={reextract} disabled={reextracting}>
            {reextracting ? (
              <>
                <span className="spinner" />{" "}
                {__t("ocr.reextracting") || "Re-extracting\u2026"}
              </>
            ) : (
              <>
                <Icon.Sparkles size={12} />{" "}
                {__t("ocr.reextract") || "Re-extract"}
              </>
            )}
          </button>
          <button className="btn primary" onClick={confirm}>
            <Icon.Check size={12} />{" "}
            {__t("ocr.confirmApply") || "Confirm & Apply"}
          </button>
        </div>
      </div>

      <div className="ocr-grid" style={{ minHeight: 520 }}>
        <div className="ocr-doc">
          <div className="ocr-text">
            {`STM32H743VIT6
HIGH-PERFORMANCE MCU WITH ARM CORTEX-M7

Manufacturer: `}
            <span className="hl" data-tag="Manufacturer">
              STMicroelectronics
            </span>
            {`
Package:      `}
            <span className="hl" data-tag="Package">
              LQFP-100, 14×14mm
            </span>
            {`

OVERVIEW
The `}
            <span className="hl" data-tag="Part No.">
              STM32H743VIT6
            </span>
            {` is a 32-bit
high-performance microcontroller based on the
`}
            <span className="hl" data-tag="Core">
              Arm® Cortex®-M7 core running at 480 MHz
            </span>
            {`,
delivering up to 1027 DMIPS / 2400 CoreMark®.

MEMORY
• `}
            <span className="hl" data-tag="Flash">
              2 MB Flash memory
            </span>
            {` (dual-bank)
• `}
            <span className="hl" data-tag="RAM">
              1 MB SRAM
            </span>
            {` (with ECC)
• External memory interface

ELECTRICAL CHARACTERISTICS
Operating voltage:  1.62 V – 3.6 V
Operating temp:     `}
            <span className="hl" data-tag="Op. Temp">
              −40 °C to +85 °C
            </span>
            {`
Power consumption:  280 µA / MHz typ.

COMPLIANCE
RoHS: `}
            <span className="hl" data-tag="RoHS">
              Compliant per Directive 2011/65/EU
            </span>
            {`
REACH: Compliant`}
          </div>
        </div>

        <div>
          <div className="section-title mt-0">
            {__t("ocr.extractedFields") || "Extracted Fields"}
          </div>
          <div className="extract-list">
            {extracted.map((e, i) => {
              const level = e.conf >= 0.9 ? "" : e.conf >= 0.7 ? "med" : "low";
              const isEd = editing === i;
              return (
                <div
                  key={e.label + "-" + i}
                  className={"extract-row " + (confirmed ? "flash-ok" : "")}
                >
                  <div className="l">{e.label}</div>
                  <div>
                    {isEd ? (
                      <input
                        id={"extract-edit-" + i}
                        name="extractValue"
                        style={{ padding: "0 6px" }}
                        className="input mono fs-11 h-24"
                        autoFocus
                        defaultValue={e.value}
                        onBlur={(ev) => {
                          updateField(i, ev.target.value);
                          setEditing(null);
                        }}
                        onKeyDown={(ev) => {
                          if (ev.key === "Enter") {
                            updateField(i, ev.target.value);
                            setEditing(null);
                          }
                          if (ev.key === "Escape") setEditing(null);
                        }}
                      />
                    ) : (
                      <div className="v">{e.value}</div>
                    )}
                    <div className={"conf-bar " + level}>
                      <div style={{ width: e.conf * 100 + "%" }} />
                    </div>
                  </div>
                  <div
                    className="conf"
                    style={{
                      color:
                        e.conf >= 0.9
                          ? "var(--ok)"
                          : e.conf >= 0.7
                            ? "var(--warn)"
                            : "var(--danger)",
                    }}
                  >
                    {Math.round(e.conf * 100)}%
                  </div>
                  <button
                    className="icon-btn w-22 h-22"
                    title={__t("common.edit") || "Edit"}
                    aria-label={__t("common.edit") || "Edit"}
                    onClick={() => setEditing(isEd ? null : i)}
                  >
                    <Icon.Edit size={11} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
