import PropTypes from "prop-types";

import { __t } from "../../i18n";
import { Icon } from "../../globals";
import { Button, Modal } from "../ui";

// Fix (dead-fakes cleanup): this modal used to fake a multi-source scrape —
// a canned progress bar always ending in the same hardcoded STM32H743
// dataset, regardless of the part number typed in. There is no backend
// endpoint that looks up a part by number across manufacturer/distributor
// sites (only POST /scraping/scrape, which fetches ONE distributor URL —
// see InternetScrapeModal, wired to the "scraping" modal). Rather than
// invent a second fake dataset, this is now an honest "not available yet"
// state that points at the real feature instead of pretending to scrape.
export default function AutoScrapeModal({ open, onClose, row }) {
  if (!open) return null;

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
      size="md"
      footer={
        <Button variant="secondary" onClick={onClose}>
          {__t("common.close") || "Close"}
        </Button>
      }
    >
      <p className="fs-12 fg-3" style={{ margin: "0 0 8px" }}>
        {__t("autoScrape.unavailable") ||
          "Automatic multi-source enrichment isn't available yet — there's no backend endpoint that looks up a part by number across manufacturer and distributor sites."}
        {row?.pn ? ` (${row.pn})` : ""}
      </p>
      <p className="fs-12 fg-3" style={{ margin: 0 }}>
        {__t("autoScrape.useInternetScraping") ||
          "Use “Internet Scraping” instead — paste a specific distributor product URL and it fetches real data from that page."}
      </p>
    </Modal>
  );
}

AutoScrapeModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
  row: PropTypes.object,
};
