import PropTypes from "prop-types";

import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import { Modal } from "../../globals";
// ============ AUTO-SCRAPE (Internet enrichment) ============
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
      wide
      footer={
        step === "review" ? (
          <>
            <span className="left">
              {Object.values(selected).filter(Boolean).length}{" "}
              {__t("autoScrape.fieldsWillBeApplied") ||
                "fields will be applied"}
            </span>
            <button className="btn" onClick={onClose}>
              {__t("common.cancel") || "Cancel"}
            </button>
            <button className="btn primary" onClick={apply}>
              <Icon.Check size={12} />{" "}
              {__t("autoScrape.applySelected") || "Apply selected"}
            </button>
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
          <div className="field">
            <label htmlFor="scrape-pn">
              {__t("autoScrape.partNumber") || "Part number"}
            </label>
            <input
              id="scrape-pn"
              name="scrapePartNumber"
              className="input mono"
              autoFocus
              value={pn}
              onChange={(e) => setPn(e.target.value)}
              placeholder={
                __t("autoScrape.pnPlaceholder") || "e.g. STM32H743VIT6"
              }
            />
          </div>
          <div className="field fs-12 fw-500 fg-2 d-block mb-6">
            <span>
              {__t("autoScrape.sourcesToQuery") || "Sources to query"}
            </span>
            <div className="flex gap-6" style={{ flexWrap: "wrap" }}>
              {[
                __t("autoScrape.sourceManufacturer") || "Manufacturer",
                "Octopart",
                "Digi-Key",
                "Mouser",
                "Arrow",
                "FindChips",
                "RS Components",
              ].map((s) => (
                <label
                  key={s}
                  htmlFor={"scrape-source-" + s}
                  className="inline-flex items-center gap-6 border-line bg-elev fs-11 font-mono"
                  style={{ padding: "4px 10px", borderRadius: 99 }}
                >
                  <input
                    id={"scrape-source-" + s}
                    name="scrapeSources"
                    type="checkbox"
                    defaultChecked
                    className="row-checkbox w-11 h-11"
                  />
                  {s}
                </label>
              ))}
            </div>
          </div>
          <div className="mt-14">
            <button
              className="btn primary"
              disabled={!pn.trim()}
              onClick={start}
            >
              <Icon.Sparkles size={12} />{" "}
              {__t("autoScrape.startScraping") || "Start scraping"}
            </button>
          </div>
        </>
      )}
      {step === "scraping" && (
        <div className="text-center" style={{ padding: "20px 0" }}>
          <div className="font-mono fg-accent mb-10" style={{ fontSize: 36 }}>
            ⟳
          </div>
          <div className="fs-14 fw-600 mb-4">
            {(
              __t("autoScrape.queryingSources") ||
              "Querying {count} sources for {pn}…"
            )
              .replace("{count}", sources.length || 5)
              .replace("{pn}", pn)}
          </div>
          <div className="font-mono fs-11 fg-3" style={{ marginBottom: 18 }}>
            {__t("autoScrape.mergingResults") ||
              "Merging results · resolving conflicts · scoring confidence"}
          </div>
          <div style={{ maxWidth: 360, margin: "0 auto" }}>
            <div className="h-8 bg-sunk br-4 overflow-h">
              <div
                className="h-100p bg-accent"
                style={{ width: progress + "%", transition: "width 0.2s" }}
              />
            </div>
          </div>
          <div
            className="mt-24 font-mono fs-10 fg-3 text-left"
            style={{ lineHeight: 1.8, maxWidth: 480, margin: "24px auto 0" }}
          >
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
        <div
          className="d-grid gap-16"
          style={{ gridTemplateColumns: "1fr 220px" }}
        >
          <div>
            <div className="font-mono fs-10 uppercase letter-sp-6 fg-3 mb-8">
              {__t("autoScrape.extractedFields") || "Extracted fields"}
            </div>
            <div className="border-line rounded-r2 overflow-h">
              {Object.entries(merged).map(([k, v], i) => (
                <label
                  key={k}
                  htmlFor={"scrape-field-" + k}
                  className="d-grid gap-10 items-center c-pointer"
                  style={{
                    gridTemplateColumns: "20px 130px 1fr",
                    padding: "8px 12px",
                    borderBottom:
                      i < Object.keys(merged).length - 1
                        ? "1px solid var(--line-soft)"
                        : "none",
                    background: selected[k] ? "var(--bg)" : "var(--bg-sunk)",
                  }}
                >
                  <input
                    id={"scrape-field-" + k}
                    name="scrapeField"
                    type="checkbox"
                    className="row-checkbox"
                    checked={!!selected[k]}
                    onChange={(e) =>
                      setSelected({ ...selected, [k]: e.target.checked })
                    }
                  />
                  <span className="font-mono fs-10 fg-3 uppercase letter-sp-4">
                    {k.replace(/_/g, " ")}
                  </span>
                  <span
                    className="font-mono fs-11 ws-nowrap overflow-h"
                    style={{
                      color: selected[k] ? "var(--fg)" : "var(--fg-3)",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {String(v)}
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <div className="font-mono fs-10 uppercase letter-sp-6 fg-3 mb-8">
              {__t("autoScrape.sources") || "Sources"}
            </div>
            {sources.map((s) => (
              <div
                key={s.name}
                className="border-line rounded-r2 mb-6 bg-canvas"
                style={{ padding: 10 }}
              >
                <div className="flex justify-between items-baseline mb-4">
                  <span className="fw-600 fs-11">{s.name}</span>
                  <span
                    className="font-mono fs-10"
                    style={{
                      color:
                        s.confidence >= 0.9
                          ? "var(--ok)"
                          : s.confidence >= 0.8
                            ? "var(--warn)"
                            : "var(--danger)",
                    }}
                  >
                    {Math.round(s.confidence * 100)}%
                  </span>
                </div>
                <div className="font-mono fs-10 fg-3">
                  {s.fields} {__t("autoScrape.fields") || "fields"}
                </div>
                <div
                  className="h-2 bg-sunk mt-4 overflow-h"
                  style={{ borderRadius: 1 }}
                >
                  <div
                    className="h-100p"
                    style={{
                      width: s.confidence * 100 + "%",
                      background:
                        s.confidence >= 0.9
                          ? "var(--ok)"
                          : s.confidence >= 0.8
                            ? "var(--warn)"
                            : "var(--danger)",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}

AutoScrapeModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
  row: PropTypes.object,
};
