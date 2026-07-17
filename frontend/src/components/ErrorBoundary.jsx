import React from "react";
import PropTypes from "prop-types";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.warn("[ErrorBoundary] Caught error:", error.message, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      const { fallback } = this.props;
      if (fallback) return fallback;
      return (
        <div className="error-boundary flex">
          <span style={{ fontSize: 32, marginBottom: 12 }}>⚠</span>
          <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 600 }}>
            {this.props.title || "Something went wrong"}
          </h3>
          <p style={{ margin: "0 0 16px", fontSize: 12, maxWidth: 400 }}>
            {this.props.message ||
              "An unexpected error occurred. Please try refreshing the page."}
          </p>
          {this.props.onRetry && (
            <button
              className="btn primary"
              onClick={() => {
                this.setState({ hasError: false, error: null });
                this.props.onRetry();
              }}
            >
              Retry
            </button>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

ErrorBoundary.propTypes = {
  children: PropTypes.node,
  fallback: PropTypes.node,
  title: PropTypes.string,
  message: PropTypes.string,
  onRetry: PropTypes.func,
};

export default ErrorBoundary;
