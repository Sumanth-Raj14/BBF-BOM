import PropTypes from "prop-types";
import { useState } from "react";

import { Icon } from "../../globals";
import { Modal, Button, Field, Input, Card, Badge, DataTable, Spinner } from "../ui";

function InternetScrapeModal({ open, onClose }) {
  const [url, setUrl] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  if (!open) return null;

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
          <Button variant="primary" disabled={!results}>
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

      {results && !loading && (
        <Card
          title={results.pn}
          subtitle={results.mfr}
          actions={
            <Badge tone="accent" pill>
              {results.source || "source"}
            </Badge>
          }
          className="mb-16"
        >
          <p className="fs-11 fg-2">{results.desc}</p>
          <div className="flex items-center gap-8 font-mono fs-10 fg-3 mt-8">
            <span>
              {results.stock != null
                ? `${results.stock.toLocaleString()} in stock`
                : "Stock N/A"}
            </span>
            <span aria-hidden="true">·</span>
            <span>Lead: {results.lead}</span>
            {results.rohs != null && (
              <Badge tone={results.rohs ? "success" : "neutral"} pill>
                {results.rohs ? "RoHS compliant" : "RoHS unknown"}
              </Badge>
            )}
          </div>
        </Card>
      )}

      {results && !loading && (
        <DataTable
          columns={specColumns}
          rows={Object.entries(results.specs).map(([spec, value]) => ({
            spec,
            value,
          }))}
          getRowKey={(r) => r.spec}
          ariaLabel="Scraped specifications"
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
