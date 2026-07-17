import PropTypes from "prop-types";
import { forwardRef, useId } from "react";

/** Checkbox — native input styled via accent-color; label associated. */
export const Checkbox = forwardRef(function Checkbox(
  { label, disabled = false, className = "", id, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id || autoId;
  return (
    <label
      className={[
        "ui-check",
        disabled ? "ui-check--disabled" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      htmlFor={inputId}
    >
      <input
        ref={ref}
        id={inputId}
        type="checkbox"
        className="ui-check__input"
        disabled={disabled}
        {...rest}
      />
      {label != null && <span>{label}</span>}
    </label>
  );
});
Checkbox.propTypes = {
  label: PropTypes.node,
  disabled: PropTypes.bool,
  className: PropTypes.string,
  id: PropTypes.string,
};

/** Radio — native input styled via accent-color; label associated. */
export const Radio = forwardRef(function Radio(
  { label, disabled = false, className = "", id, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id || autoId;
  return (
    <label
      className={[
        "ui-check",
        disabled ? "ui-check--disabled" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      htmlFor={inputId}
    >
      <input
        ref={ref}
        id={inputId}
        type="radio"
        className="ui-check__input"
        disabled={disabled}
        {...rest}
      />
      {label != null && <span>{label}</span>}
    </label>
  );
});
Radio.propTypes = {
  label: PropTypes.node,
  disabled: PropTypes.bool,
  className: PropTypes.string,
  id: PropTypes.string,
};

/**
 * Switch — role="switch" button, keyboard operable (Space/Enter native),
 * aria-checked reflects state. Controlled via `checked`/`onChange`.
 */
export function Switch({
  checked = false,
  onChange,
  disabled = false,
  label,
  id,
  className = "",
  ...rest
}) {
  const autoId = useId();
  const swId = id || autoId;
  const toggle = () => {
    if (!disabled && onChange) onChange(!checked);
  };
  const sw = (
    <button
      type="button"
      id={swId}
      role="switch"
      aria-checked={checked}
      aria-label={typeof label === "string" ? label : undefined}
      disabled={disabled}
      className={["ui-switch", className].filter(Boolean).join(" ")}
      onClick={toggle}
      {...rest}
    >
      <span className="ui-switch__thumb" aria-hidden="true" />
    </button>
  );
  if (label == null) return sw;
  return (
    <span className="ui-check">
      {sw}
      <label htmlFor={swId}>{label}</label>
    </span>
  );
}
Switch.propTypes = {
  checked: PropTypes.bool,
  onChange: PropTypes.func,
  disabled: PropTypes.bool,
  label: PropTypes.node,
  id: PropTypes.string,
  className: PropTypes.string,
};
