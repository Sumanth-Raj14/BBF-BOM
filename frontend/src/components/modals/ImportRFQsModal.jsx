import PropTypes from "prop-types";

import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import { INR, Icon } from "../../globals";
import { Modal, Button, StatusPill } from "../ui";

const STATUS_TONE = {
  accepted: "success",
  rejected: "danger",
  pending: "warning",
};
const STATUS_BORDER = {
  accepted: "var(--ok)",
  rejected: "var(--danger)",
  pending: "var(--line)",
};
const STATUS_LABEL = {
  accepted: () => __t("common.accepted") || "Accepted",
  rejected: () => __t("common.rejected") || "Rejected",
  pending: () => __t("common.pending") || "Pending",
};

// ============ IMPORT RFQs ============
export default function ImportRFQsModal({ open, onClose }) {
  const [items, setItems] = React.useState([
    {
      vendor: "Mean Well",
      pn: "EL-PSU-240W",
      qty: 50,
      unit: 82.5,
      total: 4125,
      status: "pending",
    },
    {
      vendor: "Daly",
      pn: "EL-BMS-12S",
      qty: 25,
      unit: 58.2,
      total: 1455,
      status: "pending",
    },
    {
      vendor: "JLCPCB",
      pn: "EL-PCB-MAIN-R3",
      qty: 100,
      unit: 58.4,
      total: 5840,
      status: "pending",
    },
    {
      vendor: "Edmund Optics",
      pn: "OPT-LNS-25MM",
      qty: 30,
      unit: 184.2,
      total: 5526,
      status: "pending",
    },
  ]);
  const accept = (i) => {
    const next = [...items];
    next[i].status = "accepted";
    setItems(next);
  };
  const reject = (i) => {
    const next = [...items];
    next[i].status = "rejected";
    setItems(next);
  };
  const acceptedItems = items.filter((i) => i.status === "accepted");
  const rejectedCount = items.filter((i) => i.status === "rejected").length;
  const total = acceptedItems.reduce((s, i) => s + i.total, 0);
  const submit = () => {
    onClose();
    const n = acceptedItems.length;
    if (n > 0)
      toast(
        (
          __t("importRfqs.importedToast") ||
          "{n} RFQs imported · added to procurement pipeline"
        ).replace("{n}", n),
        {
          kind: "success",
          action: {
            label: __t("common.view") || "View",
            onClick: () => window.__nav?.("procurement"),
          },
        },
      );
    else
      toast(__t("importRfqs.noImportToast") || "No RFQs imported", {
        kind: "warn",
      });
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Import size={16} />}
      title={__t("importRfqs.title") || "Import RFQs"}
      subtitle={(
        __t("importRfqs.subtitle") ||
        "4 quotes detected from inbox · {total} accepted"
      ).replace("{total}", INR(total, 0))}
      size="lg"
      closeLabel={__t("importRfqs.closeDialog") || "Close import RFQs dialog"}
      footer={
        <>
          <span
            className="font-mono fs-11 fg-3"
            style={{ marginRight: "auto" }}
          >
            {acceptedItems.length} {__t("importRfqs.accepted") || "accepted"}{" "}
            · {rejectedCount} {__t("importRfqs.rejected") || "rejected"}
          </span>
          <Button variant="secondary" onClick={onClose}>
            {__t("common.cancel") || "Cancel"}
          </Button>
          <Button
            variant="primary"
            disabled={acceptedItems.length === 0}
            onClick={submit}
          >
            {__t("importRfqs.importAccepted") || "Import accepted"} (
            {acceptedItems.length})
          </Button>
        </>
      }
    >
      <ul
        className="flex flex-col gap-8"
        style={{ listStyle: "none", margin: 0, padding: 0 }}
        aria-label={__t("importRfqs.detectedQuotes") || "Detected quotes"}
      >
        {items.map((it, i) => {
          const rfqNumber = `RFQ-2026-0${120 + i}`;
          return (
            <li
              key={it.pn + "-" + i}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 80px 100px 110px 100px 80px",
                gap: 10,
                alignItems: "center",
                padding: 12,
                border: `1px solid ${STATUS_BORDER[it.status]}`,
                borderRadius: "var(--radius-md, var(--r-2))",
                background:
                  it.status === "accepted"
                    ? "color-mix(in oklch, var(--ok) 6%, var(--bg))"
                    : it.status === "rejected"
                      ? "color-mix(in oklch, var(--danger) 6%, var(--bg))"
                      : "var(--bg)",
                opacity: it.status === "rejected" ? 0.7 : 1,
              }}
            >
              <div>
                <div className="font-mono fs-10 fg-3">{it.vendor}</div>
                <div className="font-mono fs-12 fw-600">{it.pn}</div>
              </div>
              <div className="fs-11 fg-2">{rfqNumber}</div>
              <div className="font-mono fs-12 text-right">×{it.qty}</div>
              <div className="font-mono fs-12 text-right">
                {INR(it.unit, 2)}/ea
              </div>
              <div className="font-mono fs-13 fw-700 text-right">
                {INR(it.total, 0)}
              </div>
              <div>
                <StatusPill
                  status={it.status}
                  tone={STATUS_TONE[it.status]}
                  label={STATUS_LABEL[it.status]()}
                />
              </div>
              <div className="flex gap-4 justify-end">
                <Button
                  variant={it.status === "accepted" ? "primary" : "secondary"}
                  size="sm"
                  iconOnly
                  aria-pressed={it.status === "accepted"}
                  aria-label={
                    (__t("common.accept") || "Accept") + ` ${it.pn}`
                  }
                  onClick={() => accept(i)}
                >
                  <Icon.Check size={12} />
                </Button>
                <Button
                  variant={it.status === "rejected" ? "danger" : "secondary"}
                  size="sm"
                  iconOnly
                  aria-pressed={it.status === "rejected"}
                  aria-label={
                    (__t("common.reject") || "Reject") + ` ${it.pn}`
                  }
                  onClick={() => reject(i)}
                >
                  <Icon.X size={12} />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

ImportRFQsModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
};
