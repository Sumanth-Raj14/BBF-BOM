import PropTypes from "prop-types";

import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import { Icon } from "../../globals";
import { Badge, Button, Card, Field, Input, Modal, Spinner } from "../ui";
// ============ AUTO-SCRAPE (Internet enrichment) ============

const SOURCE_OPTIONS = [
  "autoScrape.sourceManufacturer",
  "Octopart",
  "Digi-Key",
  "Mouser",
  "Arrow",
  "FindChips",
  "RS Components",
];

function confidenceTone(confidence) {
  if (confidence >= 0.9) return "success";
  if (confidence >= 0.8) return "warning";
  return "danger";
}

export default function AutoScrapeModal({ open, onClose, row }) {
  const [step, setStep] = React.useState("input");
  const [pn, setPn] = React.useState((row && row.pn) || "");
  const [progress, setProgress] = React.useState(0);
  const [sources, setSources] = React.useState([]);
  const [merged, setMerged] = React.useState({});
  const [selected, setSelected] = React.useState({});
  const intRef = React.useRef(null);

  React.useEffect(() => {
    if (open) {
      setStep("input");
      setProgress(0);
      setSources([]);
      setMerged({});
      setSelected({});
      if (row && row.pn) setPn(row.pn);
    }
  }, [open, row]);

  React.useEffect(() => {
    return () => {
      if (intRef.current) {
        clearInterval(intRef.current);
        intRef.current = null;
      }
    };
  }, []);

  if (!open) return null;

  const start = () => {
    setStep("scraping");
    setProgress(0);
    intRef.current = setInterval(() => {
      setProgress((p) => {
        const n = p + 14;
        if (n >= 100) {
          clearInterval(intRef.current);
          intRef.current = null;
          const fake = {
            manufacturer: "STMicroelectronics",
            package: "LQFP-100",
            core_speed_mhz: 480,
            flash_mb: 2,
            ram_mb: 1,
            voltage_v: "1.62–3.6",
            operating_temp_c: "-40 to +85",
            rohs: "Compliant",
            datasheet_url: "https://st.com/datasheets/stm32h743.pdf",
            image_url: "https://st.com/img/stm32h743.jpg",
            market_price_min: 14.2,
            market_price_max: 22.8,
            alternate_vendors: "Digi-Key, Mouser, Arrow, RS Components",
          };
          setMerged(fake);
          setSelected(
            Object.fromEntries(Object.keys(fake).map((k) => [k, true])),
          );
          setSources([
            { name: "Manufacturer (ST.com)", fields: 6, confidence: 0.96 },
            { name: "Digi-Key", fields: 4, confidence: 0.92 },
            { name: "Mouser", fields: 4, confidence: 0.9 },
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
    toast(
      (
        __t("autoScrape.appliedToast") ||
        "{n} fields applied to {pn} · sourced from {count} websites"
      )
        .replace("{n}", n)
        .replace("{pn}", pn)
        .replace("{count}", sources.length),
      { kind: "success" },
    );
  };

  const selectedCount = Object.values(selected).filter(Boolean).length;
  const sourcesLabel = __t("autoScrape.sourcesToQuery") || "Sources to query";
  const extractedLabel =
    __t("autoScrape.extractedFields") || "Extracted fields";

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Sparkles size={16} />}
      title={__t("autoScrape.title") || "Auto-scrape part info"}
      subtitle={
        __t("autoScrape.subtitle") ||
        "Pull specs, pricing, alternate vendors and images from the public web"
      }
      size="lg"
      footer={
        step === "review" ? (
          <>
            <span className="fs-12 fg-3" style={{ marginRight: "auto" }}>
              {selectedCount}{" "}
              {__t("autoScrape.fieldsWillBeApplied") ||
                "fields will be applied"}
            </span>
            <Button variant="secondary" onClick={onClose}>
              {__t("common.cancel") || "Cancel"}
            </Button>
            <Button variant="primary" onClick={apply}>
              <Icon.Check size={12} />{" "}
              {__t("autoScrape.applySelected") || "Apply selected"}
            </Button>
          </>
        ) : null
      }
    >
      {step === "input" && (
        <>
          <p className="fs-12 fg-3" style={{ margin: "0 0 14px" }}>
            {__t("autoScrape.instruction") ||
              "Enter a part number — we'll query manufacturer sites, Octopart, Digi-Key, Mouser, and FindChips. You'll review before applying."}
          </p>
          <Field label={__t("autoScrape.partNumber") || "Part number"} htmlFor="scrape-pn">
            <Input
              id="scrape-pn"
              name="scrapePartNumber"
              mono
              autoFocus
              value={pn}
              onChange={(e) => setPn(e.target.value)}
              placeholder={
                __t("autoScrape.pnPlaceholder") || "e.g. STM32H743VIT6"
              }
            />
          </Field>
          <fieldset className="autoscrape__sources">
            <legend className="autoscrape__sources-legend">
              {sourcesLabel}
            </legend>
            <div className="autoscrape__source-list">
              {SOURCE_OPTIONS.map((s) => {
                const label = s === "autoScrape.sourceManufacturer"
                  ? __t(s) || "Manufacturer"
                  : s;
                return (
                  <label
                    key={label}
                    htmlFor={"scrape-source-" + label}
                    className="autoscrape__source-chip"
                  >
                    <input
                      id={"scrape-source-" + label}
                      name="scrapeSources"
                      type="checkbox"
                      defaultChecked
                      className="ui-check__input"
                    />
                    {label}
                  </label>
                );
              })}
            </div>
          </fieldset>
          <div className="mt-14">
            <Button
              variant="primary"
              disabled={!pn.trim()}
              onClick={start}
            >
              <Icon.Sparkles size={12} />{" "}
              {__t("autoScrape.startScraping") || "Start scraping"}
            </Button>
          </div>
        </>
      )}
      {step === "scraping" && (
        <div className="autoscrape__scraping">
          <div
            className="autoscrape__scraping-status"
            role="status"
            aria-live="polite"
          >
            <Spinner
              size="lg"
              label={
                (
                  __t("autoScrape.queryingSources") ||
                  "Querying {count} sources for {pn}…"
                )
                  .replace("{count}", sources.length || 5)
                  .replace("{pn}", pn)
              }
            />
            <div className="fs-14 fw-600 mt-10 mb-4" aria-hidden="true">
              {(
                __t("autoScrape.queryingSources") ||
                "Querying {count} sources for {pn}…"
              )
                .replace("{count}", sources.length || 5)
                .replace("{pn}", pn)}
            </div>
          </div>
          <div className="font-mono fs-11 fg-3" style={{ marginBottom: 18 }}>
            {__t("autoScrape.mergingResults") ||
              "Merging results · resolving conflicts · scoring confidence"}
          </div>
          <div
            className="autoscrape__progress-track"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={__t("autoScrape.progress") || "Scraping progress"}
          >
            <div
              className="autoscrape__progress-fill"
              style={{ width: progress + "%" }}
            />
          </div>
          <div className="autoscrape__log" aria-hidden="true">
            {progress > 10 && (
              <div>
                {__t("autoScrape.logQueryingSt") ||
                  "→ Querying ST.com/parametrics/"}{" "}
                {pn} …
              </div>
            )}
            {progress > 30 && (
              <div>
                {__t("autoScrape.logQueryingDigikey") ||
                  "→ Querying digikey.com search?keywords="}
                {pn} …
              </div>
            )}
            {progress > 50 && (
              <div>
                {__t("autoScrape.logQueryingMouser") ||
                  "→ Querying mouser.com/ProductDetail/?"}
                {pn} …
              </div>
            )}
            {progress > 70 && (
              <div>
                {__t("autoScrape.logQueryingOctopart") ||
                  "→ Querying octopart.com/search?q="}
                {pn} …
              </div>
            )}
            {progress > 90 && (
              <div>
                {__t("autoScrape.logMerging") ||
                  "→ Merging 18 fields across 5 sources …"}
              </div>
            )}
          </div>
        </div>
      )}
      {step === "review" && (
        <div className="autoscrape__review">
          <div>
            <div className="autoscrape__section-label">{extractedLabel}</div>
            <fieldset className="autoscrape__fields">
              <legend className="sr-only">{extractedLabel}</legend>
              {Object.entries(merged).map(([k, v]) => (
                <label
                  key={k}
                  htmlFor={"scrape-field-" + k}
                  className={
                    "autoscrape__field-row" +
                    (selected[k] ? "" : " autoscrape__field-row--off")
                  }
                >
                  <input
                    id={"scrape-field-" + k}
                    name="scrapeField"
                    type="checkbox"
                    className="ui-check__input"
                    checked={!!selected[k]}
                    onChange={(e) =>
                      setSelected({ ...selected, [k]: e.target.checked })
                    }
                  />
                  <span className="autoscrape__field-key">
                    {k.replace(/_/g, " ")}
                  </span>
                  <span className="autoscrape__field-val">{String(v)}</span>
                </label>
              ))}
            </fieldset>
          </div>
          <div>
            <div className="autoscrape__section-label">
              {__t("autoScrape.sources") || "Sources"}
            </div>
            {sources.map((s) => {
              const tone = confidenceTone(s.confidence);
              return (
                <Card
                  key={s.name}
                  className="autoscrape__source-card"
                  bodyClassName="autoscrape__source-card-body"
                >
                  <div className="autoscrape__source-head">
                    <span className="autoscrape__source-name">{s.name}</span>
                    <Badge tone={tone}>{Math.round(s.confidence * 100)}%</Badge>
                  </div>
                  <div className="autoscrape__source-meta">
                    {s.fields} {__t("autoScrape.fields") || "fields"}
                  </div>
                  <div
                    className="autoscrape__conf-track"
                    role="img"
                    aria-label={`${Math.round(s.confidence * 100)}% ${
                      __t("autoScrape.confidence") || "confidence"
                    }`}
                  >
                    <div
                      className={`autoscrape__conf-fill autoscrape__conf-fill--${tone}`}
                      style={{ width: s.confidence * 100 + "%" }}
                    />
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      <style>{`
        .autoscrape__sources {
          margin: 0 0 var(--sp-3);
          padding: 0;
          border: 0;
        }
        .autoscrape__sources-legend {
          padding: 0;
          margin-bottom: var(--sp-2);
          font-size: var(--fs-100);
          font-weight: var(--fw-medium);
          color: var(--text-secondary);
        }
        .autoscrape__source-list {
          display: flex;
          flex-wrap: wrap;
          gap: var(--sp-2);
        }
        .autoscrape__source-chip {
          display: inline-flex;
          align-items: center;
          gap: var(--sp-2);
          padding: 4px var(--sp-3);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-pill);
          background: var(--bg-subtle);
          font-family: var(--font-mono);
          font-size: var(--fs-50);
          color: var(--text-primary);
          cursor: pointer;
        }
        .autoscrape__scraping {
          padding: var(--sp-5) 0;
          text-align: center;
        }
        .autoscrape__scraping-status {
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .autoscrape__progress-track {
          max-width: 360px;
          height: 8px;
          margin: 0 auto;
          background: var(--bg-subtle);
          border-radius: var(--radius-sm);
          overflow: hidden;
        }
        .autoscrape__progress-fill {
          height: 100%;
          background: var(--accent-interactive);
          transition: width var(--dur-slow) var(--ease-standard);
        }
        .autoscrape__log {
          margin: var(--sp-6) auto 0;
          max-width: 480px;
          font-family: var(--font-mono);
          font-size: var(--fs-50);
          color: var(--text-muted);
          text-align: left;
          line-height: 1.8;
        }
        .autoscrape__review {
          display: grid;
          grid-template-columns: 1fr 220px;
          gap: var(--sp-4);
        }
        .autoscrape__section-label {
          margin-bottom: var(--sp-2);
          font-family: var(--font-mono);
          font-size: var(--fs-50);
          text-transform: uppercase;
          letter-spacing: var(--ls-wider);
          color: var(--text-muted);
        }
        .autoscrape__fields {
          margin: 0;
          padding: 0;
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          overflow: hidden;
        }
        .autoscrape__field-row {
          display: grid;
          grid-template-columns: 20px 130px 1fr;
          gap: var(--sp-2);
          align-items: center;
          padding: var(--sp-2) var(--sp-3);
          background: var(--bg-surface);
          cursor: pointer;
        }
        .autoscrape__field-row:not(:last-child) {
          border-bottom: 1px solid var(--border-subtle);
        }
        .autoscrape__field-row--off {
          background: var(--bg-subtle);
        }
        .autoscrape__field-key {
          font-family: var(--font-mono);
          font-size: var(--fs-50);
          text-transform: uppercase;
          letter-spacing: var(--ls-wide);
          color: var(--text-muted);
        }
        .autoscrape__field-val {
          font-family: var(--font-mono);
          font-size: var(--fs-100);
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .autoscrape__field-row--off .autoscrape__field-val {
          color: var(--text-muted);
        }
        .autoscrape__source-card {
          margin-bottom: var(--sp-2);
        }
        .autoscrape__source-card-body {
          padding: var(--sp-2) var(--sp-3);
        }
        .autoscrape__source-head {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: var(--sp-2);
          margin-bottom: 4px;
        }
        .autoscrape__source-name {
          font-size: var(--fs-100);
          font-weight: var(--fw-semibold);
          color: var(--text-primary);
        }
        .autoscrape__source-meta {
          font-family: var(--font-mono);
          font-size: var(--fs-50);
          color: var(--text-muted);
        }
        .autoscrape__conf-track {
          height: 2px;
          margin-top: 4px;
          background: var(--bg-subtle);
          border-radius: 1px;
          overflow: hidden;
        }
        .autoscrape__conf-fill {
          height: 100%;
        }
        .autoscrape__conf-fill--success { background: var(--status-success); }
        .autoscrape__conf-fill--warning { background: var(--status-warning); }
        .autoscrape__conf-fill--danger { background: var(--status-danger); }
      `}</style>
    </Modal>
  );
}

AutoScrapeModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
  row: PropTypes.object,
};
