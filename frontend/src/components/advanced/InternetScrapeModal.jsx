import PropTypes from "prop-types";
import { Modal } from "../../globals";

function InternetScrapeModal({ open, onClose }) {
  if (!open) return null;
  const [url, setUrl] = React.useState("");
  const [results, setResults] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const scrape = async () => {
    if (!url.trim()) return;
    setLoading(true);
    await new Promise((r) => setTimeout(r, 800 + Math.random() * 400));
    const domain = url.includes("digikey")
      ? "digikey"
      : url.includes("mouser")
        ? "mouser"
        : "generic";
    const mock = {
      digikey: {
        pn: "STM32H743VIT6",
        mfr: "STMicroelectronics",
        desc: "ARM Cortex-M7 480MHz 2MB Flash LQFP-100",
        specs: {
          Core: "ARM Cortex-M7 @ 480 MHz",
          Flash: "2 MB",
          Package: "LQFP-100",
        },
        price_breaks: [
          { qty: 1, price: 22.8 },
          { qty: 10, price: 20.5 },
          { qty: 100, price: 17.2 },
        ],
        stock: 4850,
        lead: "12 weeks",
        rohs: true,
      },
      mouser: {
        pn: "EL-PSU-240W",
        mfr: "Mean Well",
        desc: "240W AC/DC Power Supply 24V 10A",
        specs: { "Output Power": "240W", "Output Voltage": "24V DC" },
        price_breaks: [
          { qty: 1, price: 92.5 },
          { qty: 25, price: 84.3 },
          { qty: 50, price: 78.0 },
        ],
        stock: 230,
        lead: "8 weeks",
        rohs: true,
      },
      generic: {
        pn: url.split("/").pop() || "Unknown",
        mfr: "Unknown",
        desc: "Scraped from " + domain,
        specs: { Manufacturer: "Unknown" },
        price_breaks: [{ qty: 1, price: 10.0 }],
        stock: null,
        lead: "Contact vendor",
        rohs: null,
      },
    };
    setResults(mock[domain] || mock.generic);
    setLoading(false);
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Search size={16} />}
      title="Internet Scraping Engine"
      subtitle="Extract component data from distributor sites"
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Close
          </button>
          <button className="btn primary" disabled={!results}>
            Apply to BOM
          </button>
        </>
      }
    >
      <div className="flex gap-8 mb-14">
        <div className="search flex-1" style={{ height: 34 }}>
          <Icon.Search size={11} />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste DigiKey / Mouser URL\u2026"
            className="fs-12 flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter") scrape();
            }}
          />
        </div>
        <button
          className="btn primary"
          onClick={scrape}
          disabled={loading || !url.trim()}
        >
          {loading ? "Scraping\u2026" : "Scrape"}
        </button>
      </div>
      {loading && (
        <div className="text-center" style={{ padding: 60 }}>
          <div className="spinner" style={{ margin: "0 auto 14px" }} />
          <div className="font-mono fs-11 fg-3">Fetching from source\u2026</div>
        </div>
      )}
      {results && !loading && (
        <div
          className="bg-sunk rounded-r2 border-line mb-14"
          style={{ padding: "10px 14px" }}
        >
          <div className="flex items-center gap-8 mb-4">
            <span className="tag-pill font-mono">
              {results.source || "source"}
            </span>
            <span className="fw-700">{results.pn}</span>
            <span className="fg-3">{results.mfr}</span>
          </div>
          <div className="fs-11 fg-2">{results.desc}</div>
          <div className="font-mono fs-10 fg-3 mt-4">
            {results.stock != null
              ? `${results.stock.toLocaleString()} in stock`
              : "Stock N/A"}{" "}
            · Lead: {results.lead}
          </div>
        </div>
      )}
      {results && !loading && (
        <div className="border-line rounded-r2 overflow-h">
          <div
            className="bg-sunk font-mono fs-9 uppercase letter-sp-6 fg-3 border-bottom"
            style={{ padding: "8px 12px" }}
          >
            Specifications
          </div>
          <table className="bom-table table-auto">
            <tbody>
              {Object.entries(results.specs).map(([k, v]) => (
                <tr key={k}>
                  <td
                    className="font-mono fs-10 fg-3"
                    style={{ padding: "6px 12px", width: 140 }}
                  >
                    {k}
                  </td>
                  <td className="fw-500 fs-12" style={{ padding: "6px 12px" }}>
                    {v}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
InternetScrapeModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
};

export { InternetScrapeModal };
export default InternetScrapeModal;
