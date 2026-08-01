import PropTypes from "prop-types";
import { useState } from "react";

import { Icon } from "../../globals";
import { Modal, Button, Field, Input, Card, Badge, DataTable, Spinner } from "../ui";
import { api } from "../../../api.js";
import { toast } from "../../utils/toast";

// Fields already surfaced in the summary card above the table — don't repeat
// them in the raw-extraction spec list.
const SUMMARY_KEYS = new Set(["pn", "mpn", "manufacturer", "description", "price"]);

function InternetScrapeModal({ open, onClose }) {
  const [url, setUrl] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!open) return null;

  const scrape = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.scraping.scrape(url.trim());
      setResults(data || null);
      if (!data) {
        setError("Scrape returned no data for this URL.");
      }
    } catch (e) {
      setResults(null);
      setError(e?.message || "Scrape failed");
      toast(`Scrape failed: ${e?.message || "unknown error"}`, { kind: "error" });
    } finally {
      setLoading(false);
    }
  };

  const applyToBom = () => {
    // The scraping modal is opened as a standalone tool (see BomEditorScreen's
    // "scraping" trigger) without a target part/BOM-line id, and there is no
    // backend endpoint yet to merge scraped fields into a BOM item. Rather
    // than silently doing nothing, tell the user honestly why this is a
    // no-op instead of fabricating a success state.
    toast(
      "Apply to BOM isn't wired yet — open scraping from a specific BOM line so there's a target part to update.",
      { kind: "info", duration: 5000 },
    );
  };

  const specRows = results
    ? Object.entries(results.rawExtracted || {})
        .filter(([key, value]) => !SUMMARY_KEYS.has(key) && value)
        .map(([spec, value]) => ({ spec, value: String(value) }))
    : [];

  const specColumns = [
    {
      key: "spec",
      header: "Specification",
      width: 160,
      render: (r) => <span className="font-mono fs-10 fg-3">{r.spec}</span>,
    },
    {
      key: "value",
      header: "Value",
      render: (r) => <span className="fw-500 fs-12">{r.value}</span>,
    },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Search size={16} />}
      title="Internet Scraping Engine"
      subtitle="Extract component data from distributor sites"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" onClick={applyToBom} disabled={!results}>
            Apply to BOM
          </Button>
        </>
      }
    >
      <div className="flex gap-8 items-end mb-16" style={{ flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <Field label="Product URL">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste DigiKey / Mouser URL…"
              onKeyDown={(e) => {
                if (e.key === "Enter") scrape();
              }}
            />
          </Field>
        </div>
        <Button
          variant="primary"
          onClick={scrape}
          loading={loading}
          disabled={loading || !url.trim()}
        >
          {loading ? "Scraping…" : "Scrape"}
        </Button>
      </div>

      {loading && (
        <div className="text-center" style={{ padding: 60 }}>
          <Spinner size="lg" label="Fetching from source" />
          <div className="font-mono fs-11 fg-3 mt-14" aria-hidden="true">
            Fetching from source…
          </div>
        </div>
      )}

      {!loading && error && (
        <div className="text-center fg-3 fs-12" style={{ padding: 40 }}>
          {error}
        </div>
      )}

      {results && !loading && !error && (
        <Card
          title={results.pn || "Unknown part"}
          subtitle={results.manufacturer || "Manufacturer unknown"}
          actions={
            <Badge tone="accent" pill>
              {results.source || "source"}
            </Badge>
          }
          className="mb-16"
        >
          <p className="fs-11 fg-2">{results.description || "No description extracted."}</p>
          <div className="flex items-center gap-8 font-mono fs-10 fg-3 mt-8">
            <span>
              {typeof results.stock === "number"
                ? `${results.stock.toLocaleString()} in stock`
                : results.stock || "Stock N/A"}
            </span>
            {results.priceBreaks && results.priceBreaks.length > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  ${results.priceBreaks[0].price} @ qty {results.priceBreaks[0].qty}
                </span>
              </>
            )}
          </div>
        </Card>
      )}

      {results && !loading && !error && (
        <DataTable
          columns={specColumns}
          rows={specRows}
          getRowKey={(r) => r.spec}
          ariaLabel="Scraped specifications"
          empty={
            <span className="fs-11 fg-3">
              No additional specifications were extracted from this page.
            </span>
          }
          dense
        />
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
