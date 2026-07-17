import PropTypes from "prop-types";
import { forwardRef } from "react";

/**
 * Button — token-only primitive.
 * variant: primary | secondary | ghost | danger
 * size:    sm | md | lg
 * icon-only via `iconOnly`; `loading` shows a spinner and disables.
 */
export const Button = forwardRef(function Button(
  {
    variant = "secondary",
    size = "md",
    iconOnly = false,
    block = false,
    loading = false,
    disabled = false,
    type = "button",
    className = "",
    children,
    ...rest
  },
  ref,
) {
  const cls = [
    "ui-btn",
    `ui-btn--${variant}`,
    `ui-btn--${size}`,
    iconOnly ? "ui-btn--icon" : "",
    block ? "ui-btn--block" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      ref={ref}
      type={type}
      className={cls}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <span className="ui-btn__spinner" aria-hidden="true" />}
      {children}
    </button>
  );
});

Button.propTypes = {
  variant: PropTypes.oneOf(["primary", "secondary", "ghost", "danger"]),
  size: PropTypes.oneOf(["sm", "md", "lg"]),
  iconOnly: PropTypes.bool,
  block: PropTypes.bool,
  loading: PropTypes.bool,
  disabled: PropTypes.bool,
  type: PropTypes.string,
  className: PropTypes.string,
  children: PropTypes.node,
};

export default Button;
