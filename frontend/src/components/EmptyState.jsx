import PropTypes from "prop-types";

export function EmptyState({ icon, title, message, action, onAction }) {
  return (
    <div className="empty-state flex">
      <span style={{ fontSize: 36, marginBottom: 12, opacity: 0.5 }}>
        {icon || "∅"}
      </span>
      <h3
        style={{
          margin: "0 0 6px",
          fontSize: 14,
          fontWeight: 600,
          color: "var(--fg)",
        }}
      >
        {title || "No data"}
      </h3>
      {message && (
        <p style={{ margin: "0 0 16px", fontSize: 12, maxWidth: 400 }}>
          {message}
        </p>
      )}
      {action && onAction && (
        <button className="btn primary" onClick={onAction}>
          {action}
        </button>
      )}
    </div>
  );
}
EmptyState.propTypes = {
  icon: PropTypes.string,
  title: PropTypes.string,
  message: PropTypes.string,
  action: PropTypes.string,
  onAction: PropTypes.func,
};
