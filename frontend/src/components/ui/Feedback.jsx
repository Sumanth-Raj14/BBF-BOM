import PropTypes from "prop-types";

/** Spinner — indeterminate busy indicator with an accessible name. */
export function Spinner({ size = "md", label = "Loading", className = "" }) {
  return (
    <span
      className={["ui-spinner", `ui-spinner--${size}`, className]
        .filter(Boolean)
        .join(" ")}
      role="status"
      aria-label={label}
    />
  );
}
Spinner.propTypes = {
  size: PropTypes.oneOf(["sm", "md", "lg"]),
  label: PropTypes.string,
  className: PropTypes.string,
};

/** Skeleton — shimmer placeholder. variant: line | block | circle */
export function Skeleton({ width, height, variant = "line", className = "", style }) {
  const h = height ?? (variant === "line" ? 12 : variant === "circle" ? 32 : 80);
  const w = width ?? (variant === "circle" ? h : "100%");
  return (
    <span
      className={[
        "ui-skeleton",
        variant === "circle" ? "ui-skeleton--circle" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-hidden="true"
      style={{ width: w, height: h, ...style }}
    />
  );
}
Skeleton.propTypes = {
  width: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  height: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  variant: PropTypes.oneOf(["line", "block", "circle"]),
  className: PropTypes.string,
  style: PropTypes.object,
};

/** EmptyState — centered zero-data / no-results panel. */
export function EmptyState({ icon, title, message, actions, className = "" }) {
  return (
    <div className={["ui-empty", className].filter(Boolean).join(" ")}>
      {icon && (
        <div className="ui-empty__icon" aria-hidden="true">
          {icon}
        </div>
      )}
      {title && <h3 className="ui-empty__title">{title}</h3>}
      {message && <p className="ui-empty__msg">{message}</p>}
      {actions && <div className="ui-empty__actions">{actions}</div>}
    </div>
  );
}
EmptyState.propTypes = {
  icon: PropTypes.node,
  title: PropTypes.node,
  message: PropTypes.node,
  actions: PropTypes.node,
  className: PropTypes.string,
};
