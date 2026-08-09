import PropTypes from "prop-types";

import { __t } from "../../i18n";
import { api } from "../../../api.js";
import { Icon } from "../../globals";
import { Button, Input, Modal, Select } from "../ui";

/**
 * Unit Converter — minimal UI for app/services/uom_service.py's
 * convert(). Every BOM line already shows its own unit (see the `uom`
 * column in the BOM grid); this is the surface for the part this feature
 * adds: checking/using a conversion, and seeing EXACTLY why one is
 * impossible (unknown unit, or a genuine cross-dimension mismatch) instead
 * of a silently-wrong number.
 */
export default function UomConverterModal({ open, onClose }) {
  const [units, setUnits] = React.useState([]);
  const [quantity, setQuantity] = React.useState("1");
  const [fromUom, setFromUom] = React.useState("M");
  const [toUom, setToUom] = React.useState("CM");
  const [result, setResult] = React.useState(null);
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setResult(null);
    setError("");
    api.uom
      .units()
      .then((list) => setUnits(Array.isArray(list) ? list : []))
      .catch(() => setUnits([]));
  }, [open]);

  const handleConvert = async () => {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await api.uom.convert(quantity, fromUom, toUom);
      setResult(res.result);
    } catch (err) {
      // The backend's 422 detail is the exact reason (unknown unit vs.
      // cross-dimension) — shown verbatim, never swallowed into a generic
      // "conversion failed".
      setError(err?.message || __t("uom.convertFailed") || "Conversion failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Tools size={16} />}
      title={__t("uom.title") || "Unit Converter"}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {__t("common.close") || "Close"}
          </Button>
          <Button variant="primary" loading={loading} onClick={handleConvert}>
            {__t("uom.convert") || "Convert"}
          </Button>
        </>
      }
    >
      <div className="flex items-center gap-6 mb-12">
        <Input
          type="number"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          aria-label={__t("uom.quantity") || "Quantity"}
          style={{ width: 100 }}
        />
        <Select
          value={fromUom}
          onChange={(e) => setFromUom(e.target.value)}
          aria-label={__t("uom.fromUnit") || "From unit"}
        >
          {units.map((u) => (
            <option key={u.code} value={u.code}>
              {u.code} — {u.name}
            </option>
          ))}
        </Select>
        <Icon.ChevronDown size={12} style={{ transform: "rotate(-90deg)" }} />
        <Select
          value={toUom}
          onChange={(e) => setToUom(e.target.value)}
          aria-label={__t("uom.toUnit") || "To unit"}
        >
          {units.map((u) => (
            <option key={u.code} value={u.code}>
              {u.code} — {u.name}
            </option>
          ))}
        </Select>
      </div>

      {error && (
        <div className="fs-12" style={{ color: "var(--danger)" }} role="alert">
          {error}
        </div>
      )}
      {result != null && !error && (
        <div className="fs-13 font-bold" style={{ color: "var(--fg)" }}>
          {quantity} {fromUom} = {result} {toUom}
        </div>
      )}
    </Modal>
  );
}

UomConverterModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
};
