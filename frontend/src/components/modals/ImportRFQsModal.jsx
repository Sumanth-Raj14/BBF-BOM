import PropTypes from "prop-types";

import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import { INR, Modal } from "../../globals";
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
  const total = items
    .filter((i) => i.status === "accepted")
    .reduce((s, i) => s + i.total, 0);
  const submit = () => {
    onClose();
    const n = items.filter((i) => i.status === "accepted").length;
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
      wide
      footer={
        <>
          <span className="left">
            {items.filter((i) => i.status === "accepted").length}{" "}
            {__t("importRfqs.accepted") || "accepted"} ·{" "}
            {items.filter((i) => i.status === "rejected").length}{" "}
            {__t("importRfqs.rejected") || "rejected"}
          </span>
          <button className="btn" onClick={onClose}>
            {__t("common.cancel") || "Cancel"}
          </button>
          <button className="btn primary" onClick={submit}>
            {__t("importRfqs.importAccepted") || "Import accepted"} (
            {items.filter((i) => i.status === "accepted").length})
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-8">
        {items.map((it, i) => (
          <div
            key={it.pn + "-" + i}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 80px 100px 110px 80px",
              gap: 10,
              alignItems: "center",
              padding: 12,
              border:
                "1px solid " +
                (it.status === "accepted"
                  ? "var(--ok)"
                  : it.status === "rejected"
                    ? "var(--danger)"
                    : "var(--line)"),
              borderRadius: "var(--r-2)",
              background:
                it.status === "accepted"
                  ? "color-mix(in oklch, var(--ok) 6%, var(--bg))"
                  : it.status === "rejected"
                    ? "color-mix(in oklch, var(--danger) 6%, var(--bg))"
                    : "var(--bg)",
              opacity: it.status === "rejected" ? 0.6 : 1,
            }}
          >
            <div>
              <div className="font-mono fs-10 fg-3">{it.vendor}</div>
              <div className="font-mono fs-12 fw-600">{it.pn}</div>
            </div>
            <div className="fs-11 fg-2">RFQ-2026-0{120 + i}</div>
            <div className="font-mono fs-12 text-right">×{it.qty}</div>
            <div className="font-mono fs-12 text-right">
              {INR(it.unit, 2)}/ea
            </div>
            <div className="font-mono fs-13 fw-700 text-right">
              {INR(it.total, 0)}
            </div>
            <div className="flex gap-4 justify-end">
              <button
                className="icon-btn w-26 h-26"
                style={{
                  color: it.status === "accepted" ? "var(--ok)" : "var(--fg-3)",
                }}
                onClick={() => accept(i)}
                title={__t("common.accept") || "Accept"}
                aria-label={__t("common.accept") || "Accept"}
              >
                <Icon.Check size={12} />
              </button>
              <button
                className="icon-btn w-26 h-26"
                style={{
                  color:
                    it.status === "rejected" ? "var(--danger)" : "var(--fg-3)",
                }}
                onClick={() => reject(i)}
                title={__t("common.reject") || "Reject"}
                aria-label={__t("common.reject") || "Reject"}
              >
                <Icon.X size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

ImportRFQsModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
};
