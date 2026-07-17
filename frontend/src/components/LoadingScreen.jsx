import PropTypes from "prop-types";

export function LoadingScreen({ message, height }) {
  return (
    <div className="loading-screen flex">
      <div
        style={{
          width: 28,
          height: 28,
          border: "3px solid var(--line)",
          borderTopColor: "var(--accent)",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
          marginBottom: 12,
        }}
      />
      <span style={{ fontSize: 13, fontWeight: 500 }}>
        {message || "Loading..."}
      </span>
    </div>
  );
}
LoadingScreen.propTypes = {
  message: PropTypes.string,
  height: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
};

export function LoadingSkeleton({ width, height, count }) {
  const items = Array.from({ length: count || 3 });
  return (
    <div style={{ padding: "24px 32px" }}>
      {items.map((_, i) => (
        <div
          key={i}
          style={{
            height: height || 16,
            width: width || "60%",
            background: "var(--bg-sunk)",
            borderRadius: 4,
            marginBottom: 12,
            animation: "pulse 1.5s ease-in-out infinite",
            opacity: 1 - i * 0.15,
          }}
        />
      ))}
    </div>
  );
}
LoadingSkeleton.propTypes = {
  width: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  height: PropTypes.number,
  count: PropTypes.number,
};
