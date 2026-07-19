import PropTypes from "prop-types";
import { storage } from "../utils/storage.js";
import { useAutosave } from "../hooks/useAutosave.js";
import { __t } from "../i18n";
import { toast, subscribe } from "../utils/toast";
export const AppCtx = React.createContext(null);
window.AppCtx = AppCtx;
export const useAppStore = () => React.useContext(AppCtx);
window.useAppStore = useAppStore;
export function ToastHost() {
  const [toasts, setToasts] = React.useState([]);
  React.useEffect(() => {
    return subscribe((tList) => setToasts(tList));
  }, []);
  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <div key={t.id} className={"toast " + t.kind}>
          <span className="ico">
            {t.kind === "success" ? (
              <Icon.Check size={14} />
            ) : t.kind === "warn" ? (
              <Icon.Bell size={14} />
            ) : t.kind === "error" ? (
              <Icon.X size={14} />
            ) : (
              <Icon.Sparkles size={14} />
            )}
          </span>
          <span className="msg">{t.msg}</span>
          {t.action && (
            <button
              className="action"
              onClick={() => {
                t.action.onClick();
                toast.dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
          <button
            className="x"
            onClick={() => toast.dismiss(t.id)}
            aria-label={
              __t("overlays.dismissNotification") || "Dismiss notification"
            }
          >
            <Icon.X size={11} />
          </button>
        </div>
      ))}
    </div>
  );
}
function useFocusTrap(open, ref) {
  React.useEffect(() => {
    if (!open || !ref.current) return;
    const el = ref.current;
    const focusable =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const prev = document.activeElement;
    const focusFirst = () => {
      const els = el.querySelectorAll(focusable);
      if (els.length) els[0].focus();
    };
    focusFirst();
    const onKey = (e) => {
      if (e.key !== "Tab") return;
      const els = el.querySelectorAll(focusable);
      if (!els.length) return;
      const first = els[0],
        last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (prev && prev.focus) prev.focus();
    };
  }, [open, ref]);
}
export function Modal({
  open,
  onClose,
  icon,
  title,
  subtitle,
  footer,
  wide,
  children,
}) {
  const modalRef = React.useRef(null);
  useFocusTrap(open, modalRef);
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={modalRef}
        className={"modal " + (wide ? "wide" : "")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-h">
          {icon && <div className="icn">{icon}</div>}
          <div className="flex-1 min-w-0">
            <h2>{title}</h2>
            {subtitle && <div className="sub">{subtitle}</div>}
          </div>
          <button
            className="close"
            onClick={onClose}
            aria-label={__t("overlays.closeModal") || "Close modal"}
          >
            <Icon.X size={14} />
          </button>
        </div>
        <div className="modal-b">{children}</div>
        {footer && <div className="modal-f">{footer}</div>}
      </div>
    </div>
  );
}
Modal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
  icon: PropTypes.node,
  title: PropTypes.string,
  subtitle: PropTypes.any,
  footer: PropTypes.any,
  wide: PropTypes.any,
  children: PropTypes.node,
};
export function Popover({
  open,
  onClose,
  anchorRef,
  align = "right",
  width = 280,
  children,
}) {
  const [pos, setPos] = React.useState(null);
  const popoverRef = React.useRef(null);
  useFocusTrap(open, popoverRef);
  React.useEffect(() => {
    if (!open) return;
    const place = () => {
      const a = anchorRef?.current;
      if (!a) return;
      const r = a.getBoundingClientRect();
      const top = r.bottom + 6;
      const left = align === "right" ? r.right - width : r.left;
      setPos({ top, left });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, anchorRef, align, width]);
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      const a = anchorRef?.current;
      if (a && a.contains(e.target)) return;
      const popEls = document.querySelectorAll(".popover");
      for (const el of popEls) if (el.contains(e.target)) return;
      onClose();
    };
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    setTimeout(() => {
      window.addEventListener("mousedown", onDown);
      window.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, anchorRef]);
  if (!open || !pos) return null;
  return ReactDOM.createPortal(
    <div
      ref={popoverRef}
      className="popover"
      style={{ top: pos.top, left: Math.max(8, pos.left), width }}
    >
      {children}
    </div>,
    document.body,
  );
}
Popover.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
  anchorRef: PropTypes.any,
  align: PropTypes.string,
  width: PropTypes.number,
  children: PropTypes.node,
};
export function DropdownButton({
  trigger,
  items,
  align = "right",
  width = 220,
  popClass = "",
}) {
  const ref = React.useRef(null);
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <span
        ref={ref}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex"
      >
        {trigger}
      </span>
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={ref}
        align={align}
        width={width}
      >
        <div className={popClass}>
          {items.map((it, i) => {
            if (it === "divider")
              return <div key={"div-" + i} className="popover-divider" />;
            if (it.header)
              return (
                <div key={"hdr-" + it.header} className="popover-h">
                  <span className="t">{it.header}</span>
                </div>
              );
            return (
              <button
                key={it.label}
                className={"popover-item " + (it.danger ? "danger" : "")}
                onClick={() => {
                  setOpen(false);
                  it.onClick && it.onClick();
                }}
              >
                {it.icon && <span className="ic">{it.icon}</span>}
                <span className="lbl">{it.label}</span>
                {it.kbd && <span className="kbd">{it.kbd}</span>}
                {it.checked && <Icon.Check size={11} />}
              </button>
            );
          })}
        </div>
      </Popover>
    </>
  );
}
DropdownButton.propTypes = {
  trigger: PropTypes.any,
  items: PropTypes.array,
  align: PropTypes.string,
  width: PropTypes.number,
  popClass: PropTypes.string,
};
window.ToastHost = ToastHost;
window.Modal = Modal;
window.Popover = Popover;
window.DropdownButton = DropdownButton;
function NewPOModal({ open, onClose }) {
  const ctx = useAppStore();
  const [vendor, setVendor] = React.useState("Mean Well");
  const [vendorId, setVendorId] = React.useState(1);
  const [eta, setEta] = React.useState("2026-06-12");
  const [items, setItems] = React.useState([
    { pn: "EL-PSU-240W", partId: 2, qty: 25, cost: 84.0 },
  ]);
  const [submitting, setSubmitting] = React.useState(false);
  const total = items.reduce((s, i) => s + i.qty * i.cost, 0);
  const vendors = ctx?.vendors || BOM_DATA?.vendors || [];
  const submit = async () => {
    setSubmitting(true);
    try {
      for (const item of items) {
        if (api?.procurement?.create) {
          await api.procurement.create({
            partId: item.partId || 1,
            vendorId: vendorId,
            qty: item.qty,
            unitCost: item.cost,
            totalCost: item.qty * item.cost,
            eta: eta,
          });
        }
      }
      onClose();
      toast(`PO created \u00B7 ${vendor} \u00B7 ${INR(total, 2)}`, {
        kind: "success",
        action: {
          label: __t("common.view") || "View",
          onClick: () => window.__nav?.("procurement"),
        },
      });
    } catch (err) {
      toast(
        __t("overlays.newPo.failedToCreate") ||
          "Failed to create PO: " + err.message,
        { kind: "error" },
      );
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Cart size={16} />}
      title={__t("overlays.newPo.title") || "New Purchase Order"}
      subtitle={__t("overlays.newPo.subtitle") || "Create a new purchase order"}
      footer={
        <>
          <span className="left">
            {__t("overlays.newPo.items") || "Items"}: {items.length} \u00B7{" "}
            {__t("overlays.newPo.total") || "Total"}: {INR(total, 2)}
          </span>
          <button className="btn" onClick={onClose}>
            {__t("common.cancel") || "Cancel"}
          </button>
          <button
            className="btn primary"
            onClick={submit}
            disabled={submitting}
          >
            {submitting
              ? __t("overlays.newPo.creating") || "Creating..."
              : __t("overlays.newPo.createPo") || "Create PO"}
          </button>
        </>
      }
    >
      <div className="field-row">
        <div className="field">
          <label htmlFor="po-vendor">
            {__t("vendor.title") || "Vendor"} <span className="req">*</span>
          </label>
          <select
            id="po-vendor"
            name="poVendor"
            className="select"
            value={vendorId}
            onChange={(e) => {
              const v = vendors.find((v) => v.id === Number(e.target.value));
              setVendorId(Number(e.target.value));
              if (v) setVendor(v.name);
            }}
          >
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="po-eta">
            {__t("overlays.newPo.requiredBy") || "Required by"}
          </label>
          <input
            id="po-eta"
            name="poEta"
            className="input mono"
            value={eta}
            onChange={(e) => setEta(e.target.value)}
          />
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="po-project">
            {__t("overlays.newPo.project") || "Project"}
          </label>
          <select id="po-project" name="poProject" className="select">
            <option>ATLAS \u00B7 Mainframe</option>
            <option>HORIZON \u00B7 Sensor Pod</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="po-currency">
            {__t("overlays.newPo.currency") || "Currency"}
          </label>
          <select id="po-currency" name="poCurrency" className="select">
            <option>USD</option>
            <option>EUR</option>
            <option>JPY</option>
            <option>CNY</option>
          </select>
        </div>
      </div>
      <div
        className="flex justify-between items-center"
        style={{ margin: "16px 0 8px" }}
      >
        <span className="font-mono fs-10 uppercase letter-sp-6 fg-3">
          {__t("overlays.newPo.lineItems") || "Line items"}
        </span>
        <button
          className="btn small"
          onClick={() => setItems([...items, { pn: "", qty: 1, cost: 0 }])}
        >
          <Icon.Plus size={11} /> {__t("overlays.newPo.addLine") || "Add line"}
        </button>
      </div>
      <div className="border-line rounded-r2 overflow-h">
        <table className="bom-table table-auto">
          <thead>
            <tr>
              <th className="pl-12">{__t("part.partNumber") || "Part No."}</th>
              <th className="num">{__t("part.quantity") || "Qty"}</th>
              <th className="num">{__t("part.unitCost") || "Unit"}</th>
              <th className="num">{__t("part.extCost") || "Ext."}</th>
              <th style={{ width: 30 }}></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={it.pn + "-" + i}>
                <td className="pl-12">
                  <input
                    id={"po-item-pn-" + i}
                    name="poItemPn"
                    className="input mono h-26 fs-11"
                    value={it.pn}
                    onChange={(e) => {
                      const n = [...items];
                      n[i].pn = e.target.value;
                      setItems(n);
                    }}
                  />
                </td>
                <td className="num">
                  <input
                    id={"po-item-qty-" + i}
                    name="poItemQty"
                    className="input mono h-26 fs-11 text-right"
                    type="number"
                    value={it.qty}
                    onChange={(e) => {
                      const n = [...items];
                      n[i].qty = +e.target.value || 0;
                      setItems(n);
                    }}
                  />
                </td>
                <td className="num">
                  <input
                    id={"po-item-cost-" + i}
                    name="poItemCost"
                    className="input mono h-26 fs-11 text-right"
                    type="number"
                    step="0.01"
                    value={it.cost}
                    onChange={(e) => {
                      const n = [...items];
                      n[i].cost = +e.target.value || 0;
                      setItems(n);
                    }}
                  />
                </td>
                <td className="num mono fw-600">{INR(it.qty * it.cost, 2)}</td>
                <td>
                  <button
                    className="icon-btn w-22 h-22"
                    aria-label={__t("common.delete") || "Remove"}
                    onClick={() => setItems(items.filter((_, j) => j !== i))}
                  >
                    <Icon.X size={11} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="field mt-14">
        <label htmlFor="po-notes">
          {__t("overlays.newPo.notes") || "Notes"}
        </label>
        <textarea
          id="po-notes"
          name="poNotes"
          className="input"
          placeholder={
            __t("overlays.newPo.notesPlaceholder") ||
            "Internal notes for vendor or finance\u2026"
          }
        />
      </div>
    </Modal>
  );
}
NewPOModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
};
function NewVendorModal({ open, onClose }) {
  const [form, setForm] = React.useState({});
  const [saving, setSaving] = React.useState(false);
  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const countryMap = {
    "United States": "US",
    China: "CN",
    Japan: "JP",
    Germany: "DE",
    Taiwan: "TW",
  };
  const submit = async () => {
    if (!form.name) {
      toast(
        __t("overlays.newVendor.nameRequired") || "Vendor name is required",
        { kind: "warn" },
      );
      return;
    }
    setSaving(true);
    try {
      await api.vendors.create({
        name: form.name,
        country: countryMap[form.country] || form.country || "US",
        leadTime: parseInt(form.leadTime) || 14,
        moq: parseInt(form.moq) || 1,
        terms: form.terms || "Net 30",
        reliabilityRating: 4.0,
      });
      toast(__t("overlays.newVendor.addedToDb") || "Vendor added to database", {
        kind: "success",
      });
    } catch (e) {
      toast(
        __t("overlays.newVendor.failedToAdd") ||
          "Failed to add vendor: " + e.message,
        { kind: "error" },
      );
    }
    setSaving(false);
    setForm({});
    onClose();
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Vendor size={16} />}
      title={__t("overlays.newVendor.title") || "Add Vendor"}
      subtitle={
        __t("overlays.newVendor.subtitle") ||
        "Will be sent for procurement approval"
      }
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {__t("common.cancel") || "Cancel"}
          </button>
          <button className="btn primary" onClick={submit} disabled={saving}>
            {saving
              ? __t("overlays.newVendor.adding") || "Adding..."
              : __t("overlays.newVendor.addVendor") || "Add vendor"}
          </button>
        </>
      }
    >
      <div className="field-row">
        <div className="field">
          <label htmlFor="vendor-name">
            {__t("vendor.name") || "Vendor name"} <span className="req">*</span>
          </label>
          <input
            id="vendor-name"
            name="vendorName"
            className="input"
            placeholder={
              __t("overlays.newVendor.namePlaceholder") ||
              "e.g. Acme Components"
            }
            onChange={(e) => update("name", e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="vendor-country">
            {__t("vendor.country") || "Country"}
          </label>
          <select
            id="vendor-country"
            name="vendorCountry"
            className="select"
            onChange={(e) => update("country", e.target.value)}
          >
            <option>United States</option>
            <option>China</option>
            <option>Japan</option>
            <option>Germany</option>
            <option>Taiwan</option>
          </select>
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="vendor-lead">
            {__t("overlays.newVendor.leadTime") || "Lead time (days)"}
          </label>
          <input
            id="vendor-lead"
            name="vendorLead"
            className="input mono"
            type="number"
            defaultValue={14}
            onChange={(e) => update("leadTime", e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="vendor-moq">{__t("vendor.moq") || "MOQ"}</label>
          <input
            id="vendor-moq"
            name="vendorMoq"
            className="input mono"
            type="number"
            defaultValue={1}
            onChange={(e) => update("moq", e.target.value)}
          />
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="vendor-terms">
            {__t("vendor.terms") || "Payment terms"}
          </label>
          <select
            id="vendor-terms"
            name="vendorTerms"
            className="select"
            onChange={(e) => update("terms", e.target.value)}
          >
            <option>Net 30</option>
            <option>Net 45</option>
            <option>Net 60</option>
            <option>Prepaid</option>
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="vendor-notes">
          {__t("overlays.newVendor.notes") || "Notes"}
        </label>
        <textarea
          id="vendor-notes"
          name="vendorNotes"
          className="input"
          placeholder={
            __t("overlays.newVendor.notesPlaceholder") ||
            "Sourcing history, quality..."
          }
          onChange={(e) => update("notes", e.target.value)}
        />
      </div>
    </Modal>
  );
}
NewVendorModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
};
function UploadModal({ open, onClose, title, files: externalFiles }) {
  const [active, setActive] = React.useState(false);
  const [files, setFiles] = React.useState([]);
  const [fileObjects, setFileObjects] = React.useState([]);
  const [uploading, setUploading] = React.useState(false);
  const [category, setCategory] = React.useState("Datasheet");
  const fileInputRef = React.useRef(null);
  const resolvedTitle =
    title || __t("overlays.upload.title") || "Upload document";
  React.useEffect(() => {
    if (open && externalFiles?.length) {
      setFiles((prev) => {
        const names = externalFiles.map((f) => f.name || f);
        const merged = [...prev];
        names.forEach((n) => {
          if (!merged.includes(n)) merged.push(n);
        });
        return merged;
      });
    }
  }, [open, externalFiles]);
  const onDrop = (e) => {
    e.preventDefault();
    setActive(false);
    const droppedFiles = [...(e.dataTransfer?.files || [])];
    if (droppedFiles.length) {
      setFiles([...files, ...droppedFiles.map((f) => f.name)]);
      setFileObjects([...fileObjects, ...droppedFiles]);
    } else {
      setFiles([...files, "Datasheet_STM32H743.pdf"]);
    }
  };
  const handleFileSelect = (e) => {
    const selected = [...(e.target?.files || [])];
    if (selected.length) {
      setFiles([...files, ...selected.map((f) => f.name)]);
      setFileObjects([...fileObjects, ...selected]);
    }
    e.target.value = "";
  };
  const submit = async () => {
    setUploading(true);
    try {
      if (fileObjects.length > 0 && api?.documents?.upload) {
        for (const file of fileObjects) {
          await api.documents.upload(file, { category });
        }
        toast(
          `${files.length} ${__t("overlays.upload.fileCount") || "file(s) uploaded"}`,
          { kind: "success" },
        );
      } else {
        const existing = storage.docs.get();
        const now = new Date().toISOString().slice(0, 10);
        files.forEach((f) => {
          existing.push({
            id: Date.now() + Math.random(),
            name: f,
            ext: f.split(".").pop().toUpperCase(),
            category,
            size: (Math.random() * 5000 + 100).toFixed(1) + " KB",
            updated: now,
            who: "You",
          });
        });
        storage.docs.set(existing);
        toast(
          `${files.length || 1} ${__t("overlays.upload.fileCountUploaded") || "file(s) uploaded"} \u00B7 OCR queued`,
          {
            kind: "success",
            action: {
              label: __t("overlays.upload.openOcr") || "Open OCR",
              onClick: () => window.__nav?.("ocr"),
            },
          },
        );
      }
      window.dispatchEvent(new CustomEvent("documents-changed"));
      onClose();
      setFiles([]);
      setFileObjects([]);
    } catch (err) {
      toast(
        __t("overlays.upload.uploadFailed") || "Upload failed: " + err.message,
        { kind: "error" },
      );
    } finally {
      setUploading(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={() => {
        setFiles([]);
        onClose();
      }}
      icon={<Icon.Import size={16} />}
      title={resolvedTitle}
      subtitle={
        __t("overlays.upload.formats") ||
        "PDF \u00B7 DWG \u00B7 STEP \u00B7 XLSX \u00B7 ZIP \u00B7 max 200 MB"
      }
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {__t("common.cancel") || "Cancel"}
          </button>
          <button className="btn primary" onClick={submit} disabled={uploading}>
            {uploading
              ? __t("overlays.upload.uploading") || "Uploading..."
              : `${__t("common.upload") || "Upload"} ${files.length > 0 ? `(${files.length})` : ""}`}
          </button>
        </>
      }
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="d-none"
        onChange={handleFileSelect}
        aria-label={__t("overlays.upload.uploadFile") || "Upload file"}
      />
      <div
        className={"dropzone " + (active ? "active" : "")}
        onDragOver={(e) => {
          e.preventDefault();
          setActive(true);
        }}
        onDragLeave={() => setActive(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="big">⤓</div>
        <div className="l1">
          {__t("overlays.upload.dropFiles") ||
            "Drop files here or click to browse (multi-select)"}
        </div>
        <div className="l2">
          {__t("overlays.upload.autoTagged") ||
            "Auto-tagged \u00B7 OCR extracts specs from datasheets"}
        </div>
      </div>
      {files.length > 0 && (
        <div className="mt-14">
          {files.map((f, i) => (
            <div
              key={f}
              className="flex items-center gap-10 border-line rounded-r2 mb-6 bg-elev"
              style={{ padding: "8px 10px" }}
            >
              <span
                className="font-mono fs-9 br-2 letter-sp-6"
                style={{
                  padding: "2px 4px",
                  background: "var(--fg)",
                  color: "var(--bg)",
                }}
              >
                {f.split(".").pop().toUpperCase()}
              </span>
              <span className="flex-1 font-mono fs-11">{f}</span>
              <span className="font-mono fs-10 fg-ok">
                {__t("overlays.upload.ready") || "READY"}
              </span>
              <button
                className="icon-btn w-22 h-22"
                aria-label={__t("common.delete") || "Remove"}
                onClick={() => setFiles(files.filter((_, j) => j !== i))}
              >
                <Icon.X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="field-row mt-14">
        <div className="field">
          <label htmlFor="upload-type">
            {__t("overlays.upload.docType") || "Document type"}
          </label>
          <select
            id="upload-type"
            name="uploadType"
            className="select"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option>Datasheet</option>
            <option>Drawing</option>
            <option>Quote</option>
            <option>Compliance</option>
            <option>Test</option>
            <option>CAD</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="upload-attach">
            {__t("overlays.upload.attachTo") || "Attach to"}
          </label>
          <select id="upload-attach" name="uploadAttach" className="select">
            <option>Project ATLAS</option>
            <option>Selected part</option>
            <option>Vendor: Mean Well</option>
          </select>
        </div>
      </div>
    </Modal>
  );
}
UploadModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
  title: PropTypes.string,
  files: PropTypes.any,
};
function NewPartModal({ open, onClose }) {
  const [form, setForm] = React.useState({});
  const [saving, setSaving] = React.useState(false);
  // Draft-safety: debounce-persist the in-progress form so a reload/crash/
  // accidental close of this modal doesn't lose what was typed. Namespaced
  // to "new" since a create form has no entity id yet.
  const autosave = useAutosave({ screen: "new-part", entityId: "new", value: form });
  const [showRestoredBanner, setShowRestoredBanner] = React.useState(false);
  React.useEffect(() => {
    if (autosave.hasDraft && autosave.draftValue) {
      setForm(autosave.draftValue);
      setShowRestoredBanner(true);
    }
    // Only ever apply the draft once, right when the modal first mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const discardDraft = () => {
    autosave.discardDraft();
    setForm({});
    setShowRestoredBanner(false);
  };
  const submit = async () => {
    if (!form.pn || !form.name) {
      toast(
        __t("overlays.newPart.pnAndNameRequired") ||
          "Part number and name are required",
        { kind: "warn" },
      );
      return;
    }
    setSaving(true);
    try {
      await api.parts.create({
        pn: form.pn,
        name: form.name,
        rev: form.rev || "A",
        qty: 1,
        uom: form.uom || "EA",
        category: form.category || "Electrical",
        subCategory: form.subCategory || "",
        status: form.status || "Draft",
        barcode: form.barcode || null,
        manufacturer: form.manufacturer || "",
        origin: form.origin || "",
        material: form.material || "",
        weight: form.weight ? parseFloat(form.weight) : null,
        dimensions: form.dimensions || "",
        imageUrl: form.imageUrl || null,
        description: form.description || "",
      });
      toast(__t("overlays.newPart.createdInDb") || "Part created in database", {
        kind: "success",
      });
      // Saved successfully — the draft is now stale, drop it.
      autosave.clearDraft();
    } catch (e) {
      toast(
        __t("overlays.newPart.failedToCreate") ||
          "Failed to create part: " + e.message,
        { kind: "error" },
      );
    }
    setSaving(false);
    setForm({});
    setShowRestoredBanner(false);
    onClose();
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Parts size={16} />}
      title={__t("overlays.newPart.title") || "New component"}
      subtitle={
        __t("overlays.newPart.subtitle") || "Add a new part to the library"
      }
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {__t("common.cancel") || "Cancel"}
          </button>
          <button className="btn primary" onClick={submit} disabled={saving}>
            {saving
              ? __t("overlays.newPart.creating") || "Creating..."
              : __t("overlays.newPart.createPart") || "Create part"}
          </button>
        </>
      }
    >
      {showRestoredBanner && (
        <div
          className="flex items-center gap-8 fs-11 font-mono"
          style={{
            padding: "var(--sp-2) var(--sp-3)",
            marginBottom: "var(--sp-3)",
            border: "1px solid var(--accent)",
            borderRadius: "var(--r-2)",
            background: "var(--accent-soft)",
          }}
        >
          <Icon.Sparkles size={12} />
          <span>
            {__t("overlays.newPart.draftRestored") ||
              "Draft restored from your last unsaved edit"}
          </span>
          <span className="flex-1" />
          <button
            type="button"
            className="btn ghost sm"
            onClick={discardDraft}
          >
            {__t("overlays.newPart.discardDraft") || "Discard"}
          </button>
        </div>
      )}
      <div className="field-row">
        <div className="field">
          <label htmlFor="part-pn">
            {__t("part.partNumber") || "Part number"}{" "}
            <span className="req">*</span>
          </label>
          <input
            id="part-pn"
            name="partPn"
            className="input mono"
            placeholder={
              __t("overlays.newPart.pnPlaceholder") || "e.g. EL-CAP-100UF-25V"
            }
            value={form.pn || ""}
            onChange={(e) => update("pn", e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="part-rev">{__t("part.revision") || "Revision"}</label>
          <input
            id="part-rev"
            name="partRev"
            className="input mono"
            value={form.rev ?? "A"}
            onChange={(e) => update("rev", e.target.value)}
          />
        </div>
      </div>
      <div className="field">
        <label htmlFor="part-name">
          {__t("part.name") || "Name"} <span className="req">*</span>
        </label>
        <input
          id="part-name"
          name="partName"
          className="input"
          placeholder={
            __t("overlays.newPart.namePlaceholder") ||
            "e.g. Capacitor, 100\u00B5F 25V Electrolytic"
          }
          value={form.name || ""}
          onChange={(e) => update("name", e.target.value)}
        />
      </div>
      <div className="field-row-3">
        <div className="field">
          <label htmlFor="part-category">
            {__t("part.category") || "Category"}
          </label>
          <select
            id="part-category"
            name="partCategory"
            className="select"
            value={form.category || "Electrical"}
            onChange={(e) => update("category", e.target.value)}
          >
            <option>Electrical</option>
            <option>Mechanical</option>
            <option>Optical</option>
            <option>Cable</option>
            <option>Hardware</option>
            <option>Assembly</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="part-subcat">
            {__t("overlays.newPart.subCategory") || "Sub-category"}
          </label>
          <input
            id="part-subcat"
            name="partSubcat"
            className="input"
            placeholder={
              __t("overlays.newPart.subcatPlaceholder") || "e.g. IC, Connector"
            }
            value={form.subCategory || ""}
            onChange={(e) => update("subCategory", e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="part-uom">{__t("part.uom") || "UoM"}</label>
          <select
            id="part-uom"
            name="partUom"
            className="select"
            value={form.uom || "EA"}
            onChange={(e) => update("uom", e.target.value)}
          >
            <option>EA</option>
            <option>M</option>
            <option>KG</option>
            <option>L</option>
          </select>
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="part-status">{__t("part.status") || "Status"}</label>
          <select
            id="part-status"
            name="partStatus"
            className="select"
            value={form.status || "Draft"}
            onChange={(e) => update("status", e.target.value)}
          >
            <option>Draft</option>
            <option>Review</option>
            <option>Released</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="part-barcode">
            {__t("overlays.newPart.barcode") || "Barcode"}
          </label>
          <input
            id="part-barcode"
            name="partBarcode"
            className="input mono"
            placeholder={
              __t("overlays.newPart.barcodePlaceholder") || "e.g. 8901234567890"
            }
            value={form.barcode || ""}
            onChange={(e) => update("barcode", e.target.value)}
          />
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="part-manufacturer">
            {__t("overlays.newPart.manufacturer") || "Manufacturer"}
          </label>
          <input
            id="part-manufacturer"
            name="partManufacturer"
            className="input"
            value={form.manufacturer || ""}
            onChange={(e) => update("manufacturer", e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="part-origin">{__t("part.origin") || "Origin"}</label>
          <select
            id="part-origin"
            name="partOrigin"
            className="select"
            value={form.origin || "US"}
            onChange={(e) => update("origin", e.target.value)}
          >
            <option>US</option>
            <option>CN</option>
            <option>JP</option>
            <option>DE</option>
            <option>TW</option>
            <option>FR</option>
          </select>
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="part-material">
            {__t("overlays.newPart.material") || "Material"}
          </label>
          <input
            id="part-material"
            name="partMaterial"
            className="input"
            placeholder={
              __t("overlays.newPart.materialPlaceholder") ||
              "e.g. Aluminum 6061-T6"
            }
            value={form.material || ""}
            onChange={(e) => update("material", e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="part-weight">
            {__t("overlays.newPart.weight") || "Weight (g)"}
          </label>
          <input
            id="part-weight"
            name="partWeight"
            className="input mono"
            type="number"
            step="0.1"
            placeholder={__t("overlays.newPart.weightPlaceholder") || "e.g. 45"}
            value={form.weight || ""}
            onChange={(e) => update("weight", e.target.value)}
          />
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="part-dimensions">
            {__t("overlays.newPart.dimensions") || "Dimensions"}
          </label>
          <input
            id="part-dimensions"
            name="partDimensions"
            className="input mono"
            placeholder={
              __t("overlays.newPart.dimensionsPlaceholder") ||
              "e.g. 120 \u00D7 80 \u00D7 12 mm"
            }
            value={form.dimensions || ""}
            onChange={(e) => update("dimensions", e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="part-image">
            {__t("overlays.newPart.imageUrl") || "Image URL"}
          </label>
          <input
            id="part-image"
            name="partImageUrl"
            className="input mono"
            placeholder="https://..."
            value={form.imageUrl || ""}
            onChange={(e) => update("imageUrl", e.target.value)}
          />
        </div>
      </div>
      <div className="field">
        <label htmlFor="part-description">
          {__t("overlays.newPart.description") || "Description"}
        </label>
        <textarea
          id="part-description"
          name="partDescription"
          className="input"
          placeholder={
            __t("overlays.newPart.descPlaceholder") ||
            "Brief description, key specs..."
          }
          value={form.description || ""}
          onChange={(e) => update("description", e.target.value)}
        />
      </div>
    </Modal>
  );
}
NewPartModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
};
function ConfirmModal({
  open,
  onClose,
  title,
  body,
  danger,
  onConfirm,
  confirmLabel,
}) {
  const resolvedLabel = confirmLabel || __t("common.confirm") || "Confirm";
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={danger ? <Icon.Flag size={16} /> : <Icon.Check size={16} />}
      title={title}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {__t("common.cancel") || "Cancel"}
          </button>
          <button
            className={"btn " + (danger ? "" : "primary")}
            onClick={() => {
              onClose();
              onConfirm && onConfirm();
            }}
            style={
              danger
                ? {
                    background: "var(--danger)",
                    color: "white",
                    borderColor: "var(--danger)",
                  }
                : {}
            }
          >
            {resolvedLabel}
          </button>
        </>
      }
    >
      <div className="fs-13 fg-2" style={{ lineHeight: 1.5 }}>
        {body}
      </div>
    </Modal>
  );
}
ConfirmModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
  title: PropTypes.string,
  body: PropTypes.any,
  danger: PropTypes.any,
  onConfirm: PropTypes.func,
  confirmLabel: PropTypes.string,
};
Object.assign(window, {
  NewPOModal,
  NewVendorModal,
  UploadModal,
  NewPartModal,
  ConfirmModal,
});
function FindAlternatesModal({ open, onClose, row }) {
  const [selected, setSelected] = React.useState(null);
  React.useEffect(() => {
    if (open) setSelected(null);
  }, [open]);
  if (!open || !row || !row.pn) return null;
  const baseCost = row.cost || 10;
  const alts = [
    {
      pn: row.pn.replace(/-([A-Z])$/, "-B") + "-A",
      name: row.name + " (alt)",
      vendor: "Mouser",
      cost: baseCost * 1.04,
      lead: Math.max(2, (row.lead || 14) - 4),
      origin: "US",
      stock: "1,240 in stock",
      rating: 4.7,
    },
    {
      pn: row.pn + "-CN",
      name: row.name + " (compatible)",
      vendor: "LCSC",
      cost: baseCost * 0.74,
      lead: (row.lead || 14) + 7,
      origin: "CN",
      stock: "8,500 in stock",
      rating: 4.1,
    },
    {
      pn: row.pn.slice(0, -1) + "X",
      name: row.name + " (premium)",
      vendor: "Digi-Key",
      cost: baseCost * 1.18,
      lead: Math.max(2, (row.lead || 14) - 7),
      origin: "US",
      stock: "320 in stock",
      rating: 4.8,
    },
  ];
  const apply = () => {
    const alt = alts.find((a) => a.pn === selected);
    onClose();
    toast(
      `${row.pn} \u2192 ${alt.pn} ${__t("overlays.findAlternates.swapped") || "swapped"}`,
      {
        kind: "success",
        action: {
          label: __t("common.undo") || "Undo",
          onClick: () =>
            toast(
              __t("overlays.findAlternates.revertedTo") ||
                "Reverted to " + row.pn,
            ),
        },
      },
    );
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Search size={16} />}
      title={__t("overlays.findAlternates.title") || "Find alternates"}
      subtitle={row.pn + " \u00B7 " + row.name}
      wide
      footer={
        <>
          <span className="left">
            {alts.length}{" "}
            {__t("overlays.findAlternates.alternates") || "alternates"} \u00B7 1{" "}
            {__t("overlays.findAlternates.cheaper") || "cheaper"} \u00B7 1{" "}
            {__t("overlays.findAlternates.faster") || "faster"} \u00B7 1{" "}
            {__t("overlays.findAlternates.higherQuality") || "higher quality"}
          </span>
          <button className="btn" onClick={onClose}>
            {__t("common.cancel") || "Cancel"}
          </button>
          <button
            className="btn primary"
            disabled={!selected}
            onClick={apply}
            style={{ opacity: selected ? 1 : 0.5 }}
          >
            <Icon.Check size={12} />{" "}
            {__t("overlays.findAlternates.swapToSelected") ||
              "Swap to selected"}
          </button>
        </>
      }
    >
      <div
        className="bg-sunk border-line rounded-r2 mb-14"
        style={{ padding: "10px 12px" }}
      >
        <div className="flex justify-between items-center mb-6">
          <div>
            <div className="font-mono fs-10 fg-3">
              {__t("overlays.findAlternates.current") || "CURRENT"}
            </div>
            <div className="fw-600 fs-13">
              {row.pn} \u00B7 {row.name}
            </div>
          </div>
        </div>
        <div
          className="d-grid gap-16 font-mono fs-11"
          style={{ gridTemplateColumns: "repeat(4, 1fr)" }}
        >
          <div>
            <span className="fg-3">{__t("part.unitCost") || "Cost"} </span>
            {INR(row.cost || 0, 2)}
          </div>
          <div>
            <span className="fg-3">{__t("part.leadDays") || "Lead"} </span>
            {row.lead || "\u2014"}d
          </div>
          <div>
            <span className="fg-3">{__t("part.origin") || "Origin"} </span>
            {row.origin}
          </div>
          <div>
            <span className="fg-3">{__t("vendor.title") || "Vendor"} </span>
            {row.vendor}
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-8">
        {alts.map((a, i) => {
          const cheaper = a.cost < row.cost;
          const faster = a.lead < (row.lead || 999);
          const isSelected = selected === a.pn;
          return (
            <div
              key={a.pn}
              onClick={() => setSelected(a.pn)}
              style={{
                padding: 14,
                border:
                  "1.5px solid " +
                  (isSelected ? "var(--accent)" : "var(--line)"),
                borderRadius: "var(--r-3)",
                background: isSelected ? "var(--accent-soft)" : "var(--bg)",
                cursor: "pointer",
                position: "relative",
              }}
            >
              <div className="flex items-start justify-between gap-12 mb-8">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-8 mb-2">
                    <span className="font-mono fs-11 fg-3">{a.pn}</span>
                    {cheaper && (
                      <span
                        className="tag-pill fg-ok"
                        style={{
                          background:
                            "color-mix(in oklch, var(--ok) 10%, var(--bg))",
                          borderColor: "var(--ok)",
                        }}
                      >
                        {(((row.cost - a.cost) / row.cost) * 100).toFixed(0)}%{" "}
                        {__t("overlays.findAlternates.cheaper") || "CHEAPER"}
                      </span>
                    )}
                    {faster && (
                      <span
                        className="tag-pill"
                        style={{
                          background:
                            "color-mix(in oklch, var(--info) 22%, var(--bg))",
                          borderColor: "var(--info)",
                          color: "var(--info)",
                        }}
                      >
                        {(row.lead || 14) - a.lead}d{" "}
                        {__t("overlays.findAlternates.faster") || "FASTER"}
                      </span>
                    )}
                    {a.rating >= 4.7 && (
                      <span
                        className="tag-pill border-color-accent fg-accent"
                        style={{
                          background:
                            "color-mix(in oklch, var(--accent) 12%, var(--bg))",
                        }}
                      >
                        \u2605 {a.rating}
                      </span>
                    )}
                  </div>
                  <div className="fw-600 fs-13">{a.name}</div>
                </div>
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 99,
                    border:
                      "1.5px solid " +
                      (isSelected ? "var(--accent)" : "var(--line)"),
                    background: isSelected ? "var(--accent)" : "transparent",
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {isSelected && <Icon.Check size={10} />}
                </div>
              </div>
              <div
                className="d-grid gap-12 font-mono fs-11"
                style={{ gridTemplateColumns: "repeat(5, 1fr)" }}
              >
                <div>
                  <span className="fg-3 fw-600">
                    {__t("part.unitCost") || "Cost"}{" "}
                  </span>
                  <span style={{ color: cheaper ? "var(--ok)" : "var(--fg)" }}>
                    {INR(a.cost, 2)}
                  </span>
                </div>
                <div>
                  <span className="fg-3">
                    {__t("part.leadDays") || "Lead"}{" "}
                  </span>
                  <span style={{ color: faster ? "var(--info)" : "var(--fg)" }}>
                    {a.lead}d
                  </span>
                </div>
                <div>
                  <span className="fg-3">
                    {__t("part.origin") || "Origin"}{" "}
                  </span>
                  {a.origin}
                </div>
                <div>
                  <span className="fg-3">
                    {__t("vendor.title") || "Vendor"}{" "}
                  </span>
                  {a.vendor}
                </div>
                <div className="fg-3">{a.stock}</div>
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
FindAlternatesModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
  row: PropTypes.object,
};
function SendRFQModal({ open, onClose, row }) {
  const ctx = useAppStore();
  const [vendors, setVendors] = React.useState([
    "Mean Well",
    "STMicro",
    "Mouser",
  ]);
  const [qty, setQty] = React.useState(100);
  const [deadline, setDeadline] = React.useState("2026-06-05");
  const submit = () => {
    onClose();
    toast(
      (__t("overlays.sendRfq.sent") || "RFQ sent to") +
        " " +
        vendors.length +
        " " +
        (__t("overlays.sendRfq.vendors") || "vendors") +
        " \u00B7 " +
        (__t("overlays.sendRfq.responsesBy") || "responses by") +
        " " +
        deadline,
      {
        kind: "success",
        action: {
          label: __t("overlays.sendRfq.viewRfq") || "View RFQ",
          onClick: () => window.__nav?.("procurement"),
        },
      },
    );
  };
  if (!open || !row || !row.pn) return null;
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Cart size={16} />}
      title={__t("overlays.sendRfq.title") || "Send RFQ"}
      subtitle={`${row.pn} \u00B7 ${row.name}`}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {__t("common.cancel") || "Cancel"}
          </button>
          <button
            className="btn"
            onClick={() => {
              onClose();
              toast(
                __t("overlays.sendRfq.savedDraft") || "RFQ saved as draft",
                { kind: "success" },
              );
            }}
          >
            {__t("overlays.sendRfq.saveDraft") || "Save draft"}
          </button>
          <button className="btn primary" onClick={submit}>
            <Icon.Cart size={12} />{" "}
            {__t("overlays.sendRfq.sendTo") || "Send to"} {vendors.length}{" "}
            {__t("overlays.sendRfq.vendors") || "vendors"}
          </button>
        </>
      }
    >
      <div className="field-row">
        <div className="field">
          <label htmlFor="rfq-qty">
            {__t("overlays.sendRfq.quantityNeeded") || "Quantity needed"}{" "}
            <span className="req">*</span>
          </label>
          <input
            id="rfq-qty"
            name="rfqQty"
            className="input mono"
            type="number"
            value={qty}
            onChange={(e) => setQty(+e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="rfq-deadline">
            {__t("overlays.sendRfq.responseDeadline") || "Response deadline"}
          </label>
          <input
            id="rfq-deadline"
            name="rfqDeadline"
            className="input mono"
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />
        </div>
      </div>
      <div className="field">
        <span className="fs-12 fw-500 fg-2">
          {__t("vendor.title") || "Vendors"}
        </span>
        <div
          className="flex gap-6 border-line rounded-r2 bg-elev"
          style={{ flexWrap: "wrap", padding: 6, minHeight: 36 }}
        >
          {vendors.map((v, i) => (
            <span
              key={v}
              className="tag-pill fg-accent border-color-accent bg-accent-soft"
            >
              {v}
              <span
                className="x"
                onClick={() => setVendors(vendors.filter((_, j) => j !== i))}
              >
                <Icon.X size={9} />
              </span>
            </span>
          ))}
          <DropdownButton
            width={200}
            trigger={
              <button className="btn small h-22 fs-10">
                <Icon.Plus size={10} />{" "}
                {__t("overlays.sendRfq.addVendor") || "Add vendor"}
              </button>
            }
            items={(ctx?.vendors || BOM_DATA.vendors)
              .filter((v) => !vendors.includes(v.name))
              .slice(0, 8)
              .map((v) => ({
                icon: <Icon.Vendor size={11} />,
                label: v.name + " \u00B7 " + v.country,
                onClick: () => setVendors([...vendors, v.name]),
              }))}
          />
        </div>
      </div>
      <div className="field">
        <label htmlFor="rfq-specs">
          {__t("overlays.sendRfq.requiredSpecs") || "Required specifications"}
        </label>
        <textarea
          id="rfq-specs"
          name="rfqSpecs"
          className="input"
          defaultValue={`Part: ${row.pn} ${row.name}\nQuantity: ${qty}\nTarget unit cost: ${INR(row.cost * 0.95, 2)}\nDelivery: by ${deadline}\nPackaging: bulk, anti-static where applicable.`}
        />
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="rfq-currency">
            {__t("overlays.sendRfq.currency") || "Currency"}
          </label>
          <select id="rfq-currency" name="rfqCurrency" className="select">
            <option>USD</option>
            <option>EUR</option>
            <option>JPY</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="rfq-incoterms">
            {__t("overlays.sendRfq.incoterms") || "Incoterms"}
          </label>
          <select id="rfq-incoterms" name="rfqIncoterms" className="select">
            <option>{__t("overlays.sendRfq.ddp") || "DDP (delivered)"}</option>
            <option>FOB</option>
            <option>EXW</option>
          </select>
        </div>
      </div>
    </Modal>
  );
}
SendRFQModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
  row: PropTypes.object,
};
function DocPreviewModal({ open, onClose, doc }) {
  if (!open || !doc || !doc.name) return null;
  const previewByExt = {
    PDF:
      doc.tag === "Datasheet"
        ? "datasheet"
        : doc.tag === "Quote"
          ? "quote"
          : "report",
    DWG: "drawing",
    STEP: "step",
    XLSX: "spreadsheet",
    ZIP: "archive",
    JSON: "json",
  };
  const kind = previewByExt[doc.ext] || "doc";
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Doc size={16} />}
      title={doc.name}
      subtitle={`${doc.tag} \u00B7 ${doc.size} \u00B7 ${__t("overlays.docPreview.uploaded") || "uploaded"} ${doc.updated}`}
      wide
      footer={
        <>
          <span className="left inline-flex items-center gap-8">
            <Icon.Sparkles size={12} />
            <span>
              {__t("overlays.docPreview.ocrExtracted") ||
                "OCR extracted 12 fields \u00B7 91% avg confidence"}
            </span>
          </span>
          <button className="btn" onClick={onClose}>
            {__t("common.close") || "Close"}
          </button>
          <button
            className="btn"
            onClick={() => toast(__t("common.copied") || "Link copied")}
          >
            <Icon.Link size={12} />{" "}
            {__t("overlays.docPreview.copyLink") || "Copy link"}
          </button>
          <button
            className="btn primary"
            onClick={() =>
              toast(
                __t("overlays.docPreview.downloading") ||
                  "Downloading " + doc.name,
                { kind: "success" },
              )
            }
          >
            <Icon.Export size={12} /> {__t("common.download") || "Download"}
          </button>
        </>
      }
    >
      <DocPreviewBody kind={kind} doc={doc} />
    </Modal>
  );
}
DocPreviewModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
  doc: PropTypes.any,
};
function DocPreviewBody({ kind, doc }) {
  const ctx = useAppStore();
  if (kind === "datasheet") {
    return (
      <div
        className="border-line rounded-r2 font-mono fs-11"
        style={{
          padding: 24,
          background: "white",
          color: "#1a1a1a",
          lineHeight: 1.7,
          minHeight: 480,
        }}
      >
        <div
          className="pb-10 mb-14"
          style={{ borderBottom: "2px solid #1a1a1a" }}
        >
          <div className="fs-18 fw-700 letter-sp-4">STMicroelectronics</div>
          <div className="fs-11" style={{ color: "#666" }}>
            Component Datasheet \u00B7 Rev B \u00B7 ES0392-compatible
          </div>
        </div>
        <div className="fs-22 fw-700 mb-6">STM32H743VIT6</div>
        <div style={{ color: "#666", marginBottom: 18 }}>
          HIGH-PERFORMANCE 32-BIT MCU WITH ARM\u00AE CORTEX\u00AE-M7
        </div>
        <div
          className="d-grid gap-24"
          style={{ gridTemplateColumns: "1fr 1fr" }}
        >
          <div>
            <div
              className="fw-700 fs-10 uppercase mb-6"
              style={{ letterSpacing: "0.1em", color: "#444" }}
            >
              Memory
            </div>
            <div>\u2022 2 MB Flash (dual-bank)</div>
            <div>\u2022 1 MB SRAM (with ECC)</div>
            <div>\u2022 External memory interface</div>
            <div
              className="fw-700 fs-10 uppercase"
              style={{
                letterSpacing: "0.1em",
                margin: "14px 0 6px",
                color: "#444",
              }}
            >
              Operating
            </div>
            <div>\u2022 Voltage: 1.62 V \u2013 3.6 V</div>
            <div>\u2022 Temp: \u221240 \u00B0C to +85 \u00B0C</div>
            <div>\u2022 280 \u00B5A / MHz typ.</div>
          </div>
          <div>
            <div
              className="fw-700 fs-10 uppercase mb-6"
              style={{ letterSpacing: "0.1em", color: "#444" }}
            >
              Core
            </div>
            <div>\u2022 Arm\u00AE Cortex\u00AE-M7 @ 480 MHz</div>
            <div>\u2022 1027 DMIPS / 2400 CoreMark\u00AE</div>
            <div>\u2022 Single + double FPU</div>
            <div
              className="fw-700 fs-10 uppercase"
              style={{
                letterSpacing: "0.1em",
                margin: "14px 0 6px",
                color: "#444",
              }}
            >
              Package
            </div>
            <div>\u2022 LQFP-100 \u00B7 14\u00D714mm</div>
            <div>\u2022 RoHS, REACH compliant</div>
          </div>
        </div>
        <div
          className="mt-24"
          style={{
            padding: 12,
            background: "#fff8e8",
            border: "1px solid #d4a44a",
            color: "#7a5414",
          }}
        >
          \u26A0 ERRATA ES0392 \u2014 Rev A: I2C wakeup race condition. Use Rev
          B or later.
        </div>
      </div>
    );
  }
  if (kind === "drawing") {
    return (
      <div
        className="border-line rounded-r2 font-mono pos-relative"
        style={{
          padding: 24,
          background: "white",
          minHeight: 480,
          color: "#1a1a1a",
        }}
      >
        <div
          className="flex justify-between fs-9 mb-16"
          style={{ color: "#444" }}
        >
          <span>
            {__t("overlays.docPreview.drawingNo") || "DRAWING NO."}{" "}
            {doc.name.replace(/\.[^.]+$/, "")}
          </span>
          <span>
            {__t("overlays.docPreview.scale") ||
              "SCALE 1:1 \u00B7 SHEET 1 OF 1"}
          </span>
        </div>
        <svg
          viewBox="0 0 400 280"
          className="w-100p"
          style={{
            height: 380,
            background: "#fafafa",
            border: "1px solid #ccc",
          }}
        >
          {Array.from({ length: 21 }).map((_, i) => (
            <line
              key={"v" + i}
              x1={i * 20}
              x2={i * 20}
              y1={0}
              y2={280}
              stroke="#e8e8e8"
              strokeWidth="0.5"
            />
          ))}
          {Array.from({ length: 15 }).map((_, i) => (
            <line
              key={"h" + i}
              x1={0}
              x2={400}
              y1={i * 20}
              y2={280}
              stroke="#e8e8e8"
              strokeWidth="0.5"
            />
          ))}
          <rect
            x="60"
            y="80"
            width="280"
            height="120"
            stroke="#1a1a1a"
            strokeWidth="1.5"
            fill="none"
          />
          <circle
            cx="80"
            cy="100"
            r="6"
            stroke="#1a1a1a"
            strokeWidth="1"
            fill="none"
          />
          <circle
            cx="320"
            cy="100"
            r="6"
            stroke="#1a1a1a"
            strokeWidth="1"
            fill="none"
          />
          <circle
            cx="80"
            cy="180"
            r="6"
            stroke="#1a1a1a"
            strokeWidth="1"
            fill="none"
          />
          <circle
            cx="320"
            cy="180"
            r="6"
            stroke="#1a1a1a"
            strokeWidth="1"
            fill="none"
          />
          <line
            x1="120"
            y1="120"
            x2="280"
            y2="120"
            stroke="#1a1a1a"
            strokeWidth="0.5"
            strokeDasharray="3 3"
          />
          <line
            x1="120"
            y1="160"
            x2="280"
            y2="160"
            stroke="#1a1a1a"
            strokeWidth="0.5"
            strokeDasharray="3 3"
          />
          <line
            x1="60"
            y1="60"
            x2="340"
            y2="60"
            stroke="#1a1a1a"
            strokeWidth="0.6"
          />
          <line
            x1="60"
            y1="55"
            x2="60"
            y2="65"
            stroke="#1a1a1a"
            strokeWidth="0.6"
          />
          <line
            x1="340"
            y1="55"
            x2="340"
            y2="65"
            stroke="#1a1a1a"
            strokeWidth="0.6"
          />
          <text
            x="200"
            y="52"
            textAnchor="middle"
            fontSize="9"
            fill="#1a1a1a"
            fontFamily="monospace"
          >
            120.00 \u00B1 0.05
          </text>
          <line
            x1="370"
            y1="80"
            x2="370"
            y2="200"
            stroke="#1a1a1a"
            strokeWidth="0.6"
          />
          <line
            x1="365"
            y1="80"
            x2="375"
            y2="80"
            stroke="#1a1a1a"
            strokeWidth="0.6"
          />
          <line
            x1="365"
            y1="200"
            x2="375"
            y2="200"
            stroke="#1a1a1a"
            strokeWidth="0.6"
          />
          <text
            x="378"
            y="143"
            fontSize="9"
            fill="#1a1a1a"
            fontFamily="monospace"
          >
            80.00
          </text>
        </svg>
        <div
          className="d-grid gap-10 fs-9 mt-14"
          style={{
            gridTemplateColumns: "repeat(4, 1fr)",
            padding: 10,
            background: "#fafafa",
            border: "1px solid #ddd",
          }}
        >
          <div>
            <div style={{ color: "#666" }}>
              {__t("overlays.docPreview.material") || "MATERIAL"}
            </div>
            <div>Aluminum 6061-T6</div>
          </div>
          <div>
            <div style={{ color: "#666" }}>
              {__t("overlays.docPreview.finish") || "FINISH"}
            </div>
            <div>Type II Anodized, Black</div>
          </div>
          <div>
            <div style={{ color: "#666" }}>
              {__t("overlays.docPreview.tolerance") || "TOLERANCE"}
            </div>
            <div>\u00B10.05 mm</div>
          </div>
          <div>
            <div style={{ color: "#666" }}>
              {__t("overlays.docPreview.weight") || "WEIGHT"}
            </div>
            <div>89.4 g</div>
          </div>
        </div>
      </div>
    );
  }
  if (kind === "spreadsheet") {
    return (
      <div
        className="border-line rounded-r2 overflow-h"
        style={{
          padding: 0,
          background: "white",
          color: "#1a1a1a",
          minHeight: 480,
        }}
      >
        <div
          className="font-mono fs-11"
          style={{
            padding: "10px 14px",
            background: "#107c41",
            color: "white",
          }}
        >
          BOM_v3.2.0.xlsx \u00B7 Sheet1
        </div>
        <table
          className="w-100p font-mono fs-10"
          style={{ borderCollapse: "collapse" }}
        >
          <thead>
            <tr style={{ background: "#f5f5f5", color: "#444" }}>
              {[
                "#",
                __t("part.partNumber") || "Part No.",
                __t("part.name") || "Description",
                __t("part.revision") || "Rev",
                __t("part.quantity") || "Qty",
                __t("part.uom") || "UoM",
                __t("vendor.title") || "Vendor",
                __t("part.unitCost") || "Unit Cost",
                __t("part.extCost") || "Ext. Cost",
              ].map((h) => (
                <th
                  key={h}
                  className="text-left"
                  style={{
                    padding: "5px 8px",
                    borderBottom: "1px solid #ccc",
                    borderRight: "1px solid #e0e0e0",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(ctx?.rows || BOM_DATA.rows)[0].children
              .flatMap((s) => s.children || [])
              .slice(0, 14)
              .map((r, i) => (
                <tr
                  key={r.id}
                  style={{
                    borderBottom: "1px solid #f0f0f0",
                    color: "#1a1a1a",
                  }}
                >
                  <td
                    style={{
                      padding: "4px 8px",
                      borderRight: "1px solid #f0f0f0",
                      color: "#888",
                    }}
                  >
                    {i + 1}
                  </td>
                  <td
                    className="fw-600"
                    style={{
                      padding: "4px 8px",
                      borderRight: "1px solid #f0f0f0",
                    }}
                  >
                    {r.pn}
                  </td>
                  <td
                    style={{
                      padding: "4px 8px",
                      borderRight: "1px solid #f0f0f0",
                    }}
                  >
                    {r.name}
                  </td>
                  <td
                    style={{
                      padding: "4px 8px",
                      borderRight: "1px solid #f0f0f0",
                    }}
                  >
                    {r.rev}
                  </td>
                  <td
                    className="text-right"
                    style={{
                      padding: "4px 8px",
                      borderRight: "1px solid #f0f0f0",
                    }}
                  >
                    {r.qty}
                  </td>
                  <td
                    style={{
                      padding: "4px 8px",
                      borderRight: "1px solid #f0f0f0",
                    }}
                  >
                    {r.uom}
                  </td>
                  <td
                    style={{
                      padding: "4px 8px",
                      borderRight: "1px solid #f0f0f0",
                    }}
                  >
                    {r.vendor}
                  </td>
                  <td
                    className="text-right"
                    style={{
                      padding: "4px 8px",
                      borderRight: "1px solid #f0f0f0",
                    }}
                  >
                    {INR(r.cost, 2)}
                  </td>
                  <td className="text-right" style={{ padding: "4px 8px" }}>
                    {INR((r.cost || 0) * (r.qty || 0), 2)}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <div
      className="bg-sunk border-line rounded-r2 text-center"
      style={{ padding: 60, minHeight: 380 }}
    >
      <div className="font-mono fg-4 mb-14" style={{ fontSize: 48 }}>
        {doc.ext}
      </div>
      <div className="fs-13 fg-3">{doc.name}</div>
      <div className="fs-11 fg-4 mt-6 font-mono">
        {__t("overlays.docPreview.previewNotAvailable") ||
          "Preview not available \u00B7 use Download"}
      </div>
    </div>
  );
}
DocPreviewBody.propTypes = {
  kind: PropTypes.any,
  doc: PropTypes.any,
};
function BulkEditModal({ open, onClose, count, onApply }) {
  const ctx = useAppStore();
  const [vendorEnabled, setVendorEnabled] = React.useState(false);
  const [vendor, setVendor] = React.useState("Mean Well");
  const [statusEnabled, setStatusEnabled] = React.useState(false);
  const [status, setStatus] = React.useState("Released");
  const [leadEnabled, setLeadEnabled] = React.useState(false);
  const [lead, setLead] = React.useState(14);
  const apply = () => {
    const patch = {};
    if (vendorEnabled) patch.vendor = vendor;
    if (statusEnabled) patch.status = status;
    if (leadEnabled) patch.lead = lead;
    const fieldCount = Object.keys(patch).length;
    onApply && onApply(patch);
    onClose();
    if (fieldCount === 0) return;
    toast(
      `${count} ${__t("overlays.bulkEdit.rowsUpdated") || "rows updated"} \u00B7 ${fieldCount} ${__t("overlays.bulkEdit.field") || "field"}${fieldCount !== 1 ? "s" : ""}`,
      { kind: "success" },
    );
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Edit size={16} />}
      title={__t("overlays.bulkEdit.title") || "Edit fields in bulk"}
      subtitle={
        __t("overlays.bulkEdit.subtitle") ||
        "Update " + count + " selected row" + (count !== 1 ? "s" : "")
      }
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {__t("common.cancel") || "Cancel"}
          </button>
          <button className="btn primary" onClick={apply}>
            {__t("overlays.bulkEdit.applyTo") || "Apply to"} {count}{" "}
            {__t("overlays.bulkEdit.rows") || "rows"}
          </button>
        </>
      }
    >
      <p className="fs-12 fg-3" style={{ margin: "0 0 14px" }}>
        {__t("overlays.bulkEdit.instructions") ||
          "Check the fields you want to update \u2014 unchecked fields stay as-is."}
      </p>
      <div className="flex flex-col gap-12">
        <label
          className="flex items-center gap-10 border-line rounded-r2"
          style={{
            padding: 10,
            background: vendorEnabled ? "var(--bg-elev)" : "transparent",
          }}
        >
          <input
            id="bulk-vendor-enable"
            name="bulkVendorEnable"
            type="checkbox"
            checked={vendorEnabled}
            onChange={(e) => setVendorEnabled(e.target.checked)}
            className="row-checkbox"
          />
          <span className="flex-1 fs-12 fw-500">
            {__t("vendor.title") || "Vendor"}
          </span>
          <select
            id="bulk-vendor-value"
            name="bulkVendorValue"
            className="select w-200"
            disabled={!vendorEnabled}
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            style={{ opacity: vendorEnabled ? 1 : 0.4 }}
          >
            {(ctx?.vendors || BOM_DATA.vendors).map((v) => (
              <option key={v.id}>{v.name}</option>
            ))}
          </select>
        </label>
        <label
          className="flex items-center gap-10 border-line rounded-r2"
          style={{
            padding: 10,
            background: statusEnabled ? "var(--bg-elev)" : "transparent",
          }}
        >
          <input
            id="bulk-status-enable"
            name="bulkStatusEnable"
            type="checkbox"
            checked={statusEnabled}
            onChange={(e) => setStatusEnabled(e.target.checked)}
            className="row-checkbox"
          />
          <span className="flex-1 fs-12 fw-500">
            {__t("part.status") || "Status"}
          </span>
          <select
            id="bulk-status-value"
            name="bulkStatusValue"
            className="select w-200"
            disabled={!statusEnabled}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            style={{ opacity: statusEnabled ? 1 : 0.4 }}
          >
            {["Draft", "Review", "Approved", "Released", "Deprecated"].map(
              (s) => (
                <option key={s}>{s}</option>
              ),
            )}
          </select>
        </label>
        <label
          className="flex items-center gap-10 border-line rounded-r2"
          style={{
            padding: 10,
            background: leadEnabled ? "var(--bg-elev)" : "transparent",
          }}
        >
          <input
            id="bulk-lead-enable"
            name="bulkLeadEnable"
            type="checkbox"
            checked={leadEnabled}
            onChange={(e) => setLeadEnabled(e.target.checked)}
            className="row-checkbox"
          />
          <span className="flex-1 fs-12 fw-500">
            {__t("overlays.bulkEdit.leadTime") || "Lead time (days)"}
          </span>
          <input
            id="bulk-lead-value"
            name="bulkLeadValue"
            type="number"
            className="input mono w-200"
            disabled={!leadEnabled}
            value={lead}
            onChange={(e) => setLead(+e.target.value)}
            style={{ opacity: leadEnabled ? 1 : 0.4 }}
          />
        </label>
      </div>
    </Modal>
  );
}
BulkEditModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
  count: PropTypes.any,
  onApply: PropTypes.func,
};
function SaveViewModal({ open, onClose, filters, onSave }) {
  const [name, setName] = React.useState("");
  const save = () => {
    if (!name.trim()) return;
    onSave(name.trim());
    onClose();
    setName("");
    toast(
      `${__t("overlays.saveView.viewSaved") || "View"} "${name}" ${__t("overlays.saveView.saved") || "saved"}`,
      { kind: "success" },
    );
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Filter size={16} />}
      title={__t("overlays.saveView.title") || "Save view"}
      subtitle={
        __t("overlays.saveView.subtitle") ||
        "Save current filters for quick access"
      }
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {__t("common.cancel") || "Cancel"}
          </button>
          <button
            className="btn primary"
            onClick={save}
            disabled={!name.trim()}
          >
            {__t("overlays.saveView.saveView") || "Save view"}
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="save-view-name">
          {__t("overlays.saveView.viewName") || "View name"}
        </label>
        <input
          id="save-view-name"
          name="viewName"
          className="input"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={
            __t("overlays.saveView.viewNamePlaceholder") ||
            "e.g. High-cost electrical"
          }
        />
      </div>
      <div
        className="bg-sunk border-line rounded-r2 fs-11 fg-3 font-mono"
        style={{ padding: 10 }}
      >
        <div className="uppercase letter-sp-6 fg-3 mb-4">
          {__t("overlays.saveView.currentFilters") || "CURRENT FILTERS"}
        </div>
        {Object.entries(filters || {})
          .filter(([, v]) => v && v.length)
          .map(([k, v]) => (
            <div key={k}>
              {k}: {Array.isArray(v) ? v.join(", ") : v}
            </div>
          )) || (
          <div>
            {__t("overlays.saveView.none") ||
              "(none \u2014 saves an empty view)"}
          </div>
        )}
        {Object.values(filters || {}).every((v) => !v || v.length === 0) && (
          <div>
            {__t("overlays.saveView.noFilters") || "(no filters active)"}
          </div>
        )}
      </div>
    </Modal>
  );
}
SaveViewModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
  filters: PropTypes.any,
  onSave: PropTypes.func,
};
function ChangeOwnerModal({ open, onClose, row }) {
  const ctx = useAppStore();
  const [owner, setOwner] = React.useState("");
  const [note, setNote] = React.useState("");
  const TEAM = [
    { name: "Elena Chen", handle: "elena", role: "ENG LEAD" },
    { name: "Marie Park", handle: "marie", role: "ENG" },
    { name: "Karan Singh", handle: "karan", role: "PROC" },
    { name: "Ryo Sato", handle: "ryo", role: "ENG" },
    { name: "Tom Reyes", handle: "tom", role: "FIN" },
  ];
  React.useEffect(() => {
    if (open) {
      setOwner("");
      setNote("");
    }
  }, [open]);
  if (!open || !row) return null;
  const submit = () => {
    if (!owner) return;
    onClose();
    toast(
      (__t("overlays.changeOwner.changedTo") || "Owner changed to") +
        " " +
        owner +
        " \u00B7 " +
        row.pn,
      { kind: "success" },
    );
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.User size={16} />}
      title={__t("overlays.changeOwner.title") || "Change owner"}
      subtitle={`${row.pn} \u00B7 ${row.name}`}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {__t("common.cancel") || "Cancel"}
          </button>
          <button className="btn primary" onClick={submit} disabled={!owner}>
            {__t("overlays.changeOwner.transfer") || "Transfer ownership"}
          </button>
        </>
      }
    >
      <div className="fs-12 fg-3 mb-14">
        {__t("overlays.changeOwner.current") || "Current"}:{" "}
        <strong>{ctx?.project?.owner || BOM_DATA.project.owner}</strong>
      </div>
      <div className="field">
        <label htmlFor="change-owner">
          {__t("overlays.changeOwner.transferTo") || "Transfer to"}{" "}
          <span className="req">*</span>
        </label>
        <select
          id="change-owner"
          name="newOwner"
          className="select"
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
        >
          <option value="">
            {__t("overlays.changeOwner.selectMember") ||
              "\u2014 Select team member \u2014"}
          </option>
          {TEAM.map((t) => (
            <option key={t.handle} value={t.name}>
              {t.name} \u00B7 {t.role}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="change-note">
          {__t("overlays.changeOwner.note") || "Note (optional)"}
        </label>
        <textarea
          id="change-note"
          name="ownerChangeNote"
          className="input"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={
            __t("overlays.changeOwner.notePlaceholder") ||
            "Reason for ownership change\u2026"
          }
          style={{ minHeight: 60 }}
        />
      </div>
      <div
        className="bg-sunk border-line rounded-r2 fs-11 fg-3"
        style={{ padding: "10px 12px" }}
      >
        {__t("overlays.changeOwner.hint") ||
          "Owner change will be logged in the activity feed and a notification sent to the new owner."}
      </div>
    </Modal>
  );
}
ChangeOwnerModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
  row: PropTypes.object,
};
Object.assign(window, {
  FindAlternatesModal,
  SendRFQModal,
  DocPreviewModal,
  BulkEditModal,
  SaveViewModal,
  ChangeOwnerModal,
});
