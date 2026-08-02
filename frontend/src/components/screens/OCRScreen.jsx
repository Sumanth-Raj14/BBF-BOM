import { __t } from "../../i18n";
import { navigateTo } from "../../services/navigation.js";

import { toast } from "../../utils/toast";
import { Icon, api, useAppStore } from "../../globals";
import { Button, Card, Badge, EmptyState, Input, ScreenHeader } from "../ui";
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
  const [partId, setPartId] = React.useState(null);
  const [rawText, setRawText] = React.useState(null);
  const fileInputRef = React.useRef(null);

  const runExtraction = React.useCallback((documentId, pId) => {
    setLoading(true);
    (api?.ocr?.extract?.(documentId, pId) || Promise.resolve(null))
      .then((data) => {
        if (data && data.fields) {
          setExtracted(
            data.fields.map((f) => ({
              label: f.label,
              value: f.value,
              conf: f.confidence,
            })),
          );
          setDocId(data.documentId ?? null);
          setPartPn(data.partPn ?? null);
          setRawText(data.raw_text_preview || data.rawTextPreview || null);
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
    runExtraction(docId, partId);
    setTimeout(() => setReextracting(false), 1100);
  };

  const confirm = async () => {
    // The confirm/apply persists extracted fields onto a real Part record
    // (api.ocr.confirm -> /ocr/confirm), so we need a numeric part id. The
    // extraction response only gives us a part number string (partPn) or,
    // failing that, whatever the "Part Number" field itself extracted — so
    // resolve that to an id via a part search before persisting.
    const candidatePn =
      partPn ||
      extracted.find(
        (f) => f.label === "Part Number" && f.value && f.value !== "Not detected",
      )?.value ||
      null;

    let targetPartId = partId;
    if (!targetPartId && candidatePn && api?.parts?.list) {
      try {
        const res = await api.parts.list({ search: candidatePn });
        const match = res?.items?.[0];
        if (match?.id) targetPartId = match.id;
      } catch (err) {
        console.warn("[OCRScreen] part lookup failed:", err?.message || err);
      }
    }

    if (!targetPartId) {
      toast(
        (__t("ocr.noMatchingPart") || "No matching part found for ") +
          (candidatePn || __t("ocr.thisDatasheet") || "this datasheet") +
          " — " +
          (__t("ocr.nothingApplied") || "nothing was applied"),
        { kind: "warn" },
      );
      return;
    }

    setConfirmed(true);
    try {
      const data = await (api?.ocr?.confirm
        ? api.ocr.confirm(
            targetPartId,
            extracted.map((e) => ({ label: e.label, value: e.value })),
          )
        : Promise.resolve(null));

      setPartId(targetPartId);
      const appliedPn = data?.partPn || candidatePn;
      if (appliedPn) setPartPn(appliedPn);

      if (ctx?.setNotifications) {
        ctx.setNotifications([
          {
            id: Date.now(),
            who: "System",
            init: "⌌",
            color: "sys",
            action: "OCR applied to",
            obj: appliedPn || "part",
            time: "just now",
            read: false,
            route: "bom",
          },
          ...ctx.notifications,
        ]);
      }
      toast(
        (data?.updatedFields?.length ?? extracted.length) +
          " " +
          (__t("ocr.fieldsApplied") || "fields applied to part") +
          " " +
          (appliedPn || __t("ocr.part") || "part") +
          " · " +
          (__t("ocr.auditLogged") || "audit logged"),
        {
          kind: "success",
          action: {
            label: __t("ocr.openPart") || "Open part",
            onClick: () => navigateTo("bom"),
          },
        },
      );
    } catch (err) {
      toast(
        (__t("ocr.applyFailed") || "Failed to apply fields: ") +
          (err?.message || __t("ocr.backendError") || "backend error"),
        { kind: "error" },
      );
    } finally {
      setTimeout(() => setConfirmed(false), 1500);
    }
  };

  const updateField = (i, value) => {
    const next = [...extracted];
    next[i] = { ...next[i], value, conf: Math.max(next[i].conf, 0.99) };
    setExtracted(next);
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    toast((__t("ocr.uploading") || "Uploading ") + file.name + "...", {
      kind: "info",
    });
    if (api?.ocr?.upload) {
      api.ocr
        .upload(file)
        .then((data) => {
          setRawText(data?.raw_text_preview || data?.rawTextPreview || null);
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
            setPartId(data.partId || null);
          } else {
            setDocId(data.documentId || null);
            setPartPn(data.partPn || null);
            setPartId(data.partId || null);
            setExtracted([
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
              (err.message || __t("ocr.backendError") || "backend error"),
            { kind: "error" },
          );
          setExtracted([
            {
              label: __t("ocr.fieldError") || "Error",
              value: err.message || __t("ocr.uploadFailed") || "Upload failed",
              conf: 0,
            },
          ]);
        })
        .finally(() => setLoading(false));
    } else {
      // api.ocr.upload is always provided by the real API client — this
      // branch only guards against it being unavailable (e.g. not yet
      // loaded). Never fabricate extracted data in that case.
      setLoading(false);
      toast(
        __t("ocr.uploadUnavailable") ||
          "OCR upload is unavailable right now — please try again",
        { kind: "error" },
      );
    }
    e.target.value = "";
  };

  return (
    <div className="screen-wrap">
      <ScreenHeader
        title={__t("ocr.title") || "Datasheet OCR"}
        description={
          <>
            {loading
              ? __t("ocr.extracting") || "Extracting..."
              : `${extracted.length} ${__t("ocr.fields") || "fields"} · ${extracted.filter((e) => e.conf >= 0.9).length} ${__t("ocr.highConfidence") || "high confidence"}`}
            {partPn ? ` · ${partPn}` : ""}
          </>
        }
        actions={
          <div className="flex gap-8">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.tiff"
              className="d-none"
              onChange={handleFileChange}
              aria-label={__t("ocr.uploadDatasheet") || "Upload datasheet"}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <Icon.Import size={12} />{" "}
              {__t("ocr.uploadDatasheet") || "Upload datasheet"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={reextract}
              loading={reextracting}
              disabled={reextracting}
            >
              {!reextracting && <Icon.Sparkles size={12} />}{" "}
              {reextracting
                ? __t("ocr.reextracting") || "Re-extracting…"
                : __t("ocr.reextract") || "Re-extract"}
            </Button>
            <Button variant="primary" size="sm" onClick={confirm}>
              <Icon.Check size={12} />{" "}
              {__t("ocr.confirmApply") || "Confirm & Apply"}
            </Button>
          </div>
        }
      />

      <div className="ocr-grid" style={{ minHeight: 520 }}>
        <div className="ocr-doc">
          {rawText ? (
            <div className="ocr-text">{rawText}</div>
          ) : (
          <div className="ocr-text">
            <div className="fs-11" style={{ opacity: 0.6, marginBottom: 8 }}>
              {(__t("ocr.sampleLabel") ||
                "Sample preview — upload a datasheet to see real extracted text")}
            </div>
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
          )}
        </div>

        <Card title={__t("ocr.extractedFields") || "Extracted Fields"}>
          {extracted.length === 0 ? (
            <EmptyState
              icon={<Icon.Sparkles size={20} />}
              title={
                loading
                  ? __t("ocr.extracting") || "Extracting..."
                  : __t("ocr.noFields") || "No fields extracted yet"
              }
              message={
                loading
                  ? undefined
                  : __t("ocr.noFieldsHint") ||
                    "Upload a datasheet to extract fields automatically."
              }
            />
          ) : (
            <div className="extract-list">
              {extracted.map((e, i) => {
                const level =
                  e.conf >= 0.9 ? "" : e.conf >= 0.7 ? "med" : "low";
                const isEd = editing === i;
                const tone =
                  e.conf >= 0.9
                    ? "success"
                    : e.conf >= 0.7
                      ? "warning"
                      : "danger";
                return (
                  <div
                    key={e.label + "-" + i}
                    className={"extract-row " + (confirmed ? "flash-ok" : "")}
                  >
                    <div className="l">{e.label}</div>
                    <div>
                      {isEd ? (
                        <Input
                          id={"extract-edit-" + i}
                          name="extractValue"
                          mono
                          className="fs-11"
                          style={{ height: 24, padding: "0 6px" }}
                          autoFocus
                          defaultValue={e.value}
                          aria-label={e.label}
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
                    <div className="conf">
                      <Badge tone={tone} pill>
                        {Math.round(e.conf * 100)}%
                      </Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      iconOnly
                      className="w-22 h-22"
                      title={__t("common.edit") || "Edit"}
                      aria-label={__t("common.edit") || "Edit"}
                      onClick={() => setEditing(isEd ? null : i)}
                    >
                      <Icon.Edit size={11} />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
