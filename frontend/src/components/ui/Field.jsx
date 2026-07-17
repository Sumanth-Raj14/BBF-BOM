import PropTypes from "prop-types";
import { forwardRef, useId } from "react";

/**
 * Field — accessible label/hint/error wrapper.
 * Clones the single child control, wiring id, aria-describedby and
 * aria-invalid so labels and error text are correctly associated.
 */
export function Field({ label, hint, error, required, htmlFor, children }) {
  const autoId = useId();
  const controlId = htmlFor || autoId;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errId = error ? `${controlId}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(" ") || undefined;

  let control = children;
  if (children && typeof children === "object" && children.type) {
    control = {
      ...children,
      props: {
        id: controlId,
        "aria-describedby": describedBy,
        "aria-invalid": error ? "true" : undefined,
        ...children.props,
      },
    };
  }

  return (
    <div className="ui-field">
      {label && (
        <label className="ui-field__label" htmlFor={controlId}>
          {label}
          {required && (
            <span className="ui-field__req" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}
      {control}
      {hint && !error && (
        <span className="ui-field__hint" id={hintId}>
          {hint}
        </span>
      )}
      {error && (
        <span className="ui-field__error" id={errId} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
Field.propTypes = {
  label: PropTypes.node,
  hint: PropTypes.node,
  error: PropTypes.node,
  required: PropTypes.bool,
  htmlFor: PropTypes.string,
  children: PropTypes.node,
};

export const Input = forwardRef(function Input(
  { mono = false, className = "", ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={["ui-input", mono ? "ui-input--mono" : "", className]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    />
  );
});
Input.propTypes = { mono: PropTypes.bool, className: PropTypes.string };

export const Textarea = forwardRef(function Textarea(
  { className = "", rows = 3, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={["ui-textarea", className].filter(Boolean).join(" ")}
      {...rest}
    />
  );
});
Textarea.propTypes = { className: PropTypes.string, rows: PropTypes.number };

export const Select = forwardRef(function Select(
  { className = "", children, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      className={["ui-select", className].filter(Boolean).join(" ")}
      {...rest}
    >
      {children}
    </select>
  );
});
Select.propTypes = { className: PropTypes.string, children: PropTypes.node };
