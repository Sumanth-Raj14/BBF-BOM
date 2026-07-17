import PropTypes from "prop-types";
import { __t } from "../i18n";
import { toast } from "../utils/toast";
// Enterprise Utilities — Error boundaries, loading states, keyboard shortcuts,
// input sanitization, accessibility helpers, performance utilities.

// ============ ERROR BOUNDARY ============
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error("[ErrorBoundary]", error, errorInfo);
    toast(
      __t("enterprise.componentCrashed") ||
        "A component crashed. The error has been logged.",
      { kind: "error", duration: 6000 },
    );
  }

  render() {
    if (this.state.hasError) {
      const fallback = this.props.fallback;
      if (fallback && typeof fallback === "function") {
        return React.createElement(fallback, {
          error: this.state.error,
          reset: () =>
            this.setState({ hasError: false, error: null, errorInfo: null }),
        });
      }
      return React.createElement(
        "div",
        {
          style: {
            padding: 24,
            textAlign: "center",
            background: "var(--bg-2)",
            borderRadius: "var(--r-3)",
            border: "1px solid var(--danger)",
            margin: 16,
          },
        },
        React.createElement(
          "div",
          { style: { fontSize: 20, marginBottom: 8 } },
          __t("enterprise.somethingWrong") || "Something went wrong",
        ),
        React.createElement(
          "p",
          { style: { color: "var(--fg-3)", fontSize: 13, marginBottom: 16 } },
          this.state.error?.message ||
            __t("enterprise.unexpectedError") ||
            "An unexpected error occurred",
        ),
        React.createElement(
          "button",
          {
            className: "btn",
            onClick: () =>
              this.setState({ hasError: false, error: null, errorInfo: null }),
          },
          __t("enterprise.tryAgain") || "Try Again",
        ),
      );
    }
    return this.props.children;
  }
}

// ============ LOADING SKELETON ============
export function Skeleton({ width, height, borderRadius, style }) {
  return React.createElement("div", {
    className: "skeleton",
    style: {
      width: width || "100%",
      height: height || 16,
      borderRadius: borderRadius || "var(--r-2)",
      ...style,
    },
  });
}
Skeleton.propTypes = {
  width: PropTypes.any,
  height: PropTypes.any,
  borderRadius: PropTypes.any,
  style: PropTypes.object,
};

export function SkeletonTable({ rows = 5, cols = 4 }) {
  return React.createElement(
    "div",
    { style: { padding: 16 } },
    React.createElement(Skeleton, { height: 32, style: { marginBottom: 12 } }),
    Array.from({ length: rows }).map((_, i) =>
      React.createElement(
        "div",
        { key: i, style: { display: "flex", gap: 12, marginBottom: 8 } },
        Array.from({ length: cols }).map((_, j) =>
          React.createElement(Skeleton, {
            key: j,
            height: 24,
            width: j === 0 ? "40%" : "20%",
          }),
        ),
      ),
    ),
  );
}
SkeletonTable.propTypes = {
  rows: PropTypes.number,
  cols: PropTypes.number,
};

export function SkeletonCards({ count = 6 }) {
  return React.createElement(
    "div",
    {
      style: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        gap: 16,
        padding: 16,
      },
    },
    Array.from({ length: count }).map((_, i) =>
      React.createElement(
        "div",
        {
          key: i,
          style: {
            padding: 16,
            borderRadius: "var(--r-3)",
            border: "1px solid var(--line)",
            background: "var(--bg)",
          },
        },
        React.createElement(Skeleton, {
          height: 16,
          width: "60%",
          style: { marginBottom: 8 },
        }),
        React.createElement(Skeleton, {
          height: 12,
          width: "40%",
          style: { marginBottom: 12 },
        }),
        React.createElement(Skeleton, {
          height: 12,
          width: "80%",
          style: { marginBottom: 8 },
        }),
        React.createElement(Skeleton, { height: 12, width: "50%" }),
      ),
    ),
  );
}
SkeletonCards.propTypes = {
  count: PropTypes.number,
};

// ============ EMPTY STATE ============
export function EmptyState({ icon, title, description, action, actionLabel }) {
  return React.createElement(
    "div",
    {
      style: { padding: 60, textAlign: "center", color: "var(--fg-3)" },
    },
    React.createElement(
      "div",
      { style: { fontSize: 40, marginBottom: 12, opacity: 0.3 } },
      icon || "📋",
    ),
    React.createElement(
      "h3",
      { style: { margin: "0 0 8px", color: "var(--fg-2)", fontSize: 16 } },
      title || __t("enterprise.nothingHere") || "Nothing here yet",
    ),
    React.createElement(
      "p",
      {
        style: {
          margin: "0 0 20px",
          fontSize: 13,
          maxWidth: 360,
          marginLeft: "auto",
          marginRight: "auto",
        },
      },
      description ||
        __t("enterprise.getStarted") ||
        "Get started by creating your first item.",
    ),
    action &&
      React.createElement(
        "button",
        {
          className: "btn primary",
          onClick: action,
        },
        actionLabel || __t("enterprise.create") || "Create",
      ),
  );
}
EmptyState.propTypes = {
  icon: PropTypes.node,
  title: PropTypes.string,
  description: PropTypes.any,
  action: PropTypes.func,
  actionLabel: PropTypes.string,
};

// ============ LOADING STATE ============
export function LoadingState({ message, spinner }) {
  return React.createElement(
    "div",
    {
      style: { padding: 40, textAlign: "center", color: "var(--fg-3)" },
    },
    spinner !== false &&
      React.createElement("div", {
        className: "spinner",
        style: {
          width: 24,
          height: 24,
          border: "2px solid var(--line)",
          borderTopColor: "var(--accent)",
          borderRadius: "50%",
          animation: "spin 0.6s linear infinite",
          margin: "0 auto 12px",
        },
      }),
    React.createElement(
      "div",
      { style: { fontSize: 13 } },
      message || __t("common.loading") || "Loading...",
    ),
  );
}
LoadingState.propTypes = {
  message: PropTypes.any,
  spinner: PropTypes.any,
};

// ============ ERROR STATE ============
export function ErrorState({ message, onRetry }) {
  return React.createElement(
    "div",
    {
      style: { padding: 40, textAlign: "center", color: "var(--danger)" },
    },
    React.createElement(
      "div",
      { style: { fontSize: 40, marginBottom: 12 } },
      "⚠️",
    ),
    React.createElement(
      "div",
      { style: { fontSize: 14, marginBottom: 8, color: "var(--fg-2)" } },
      __t("enterprise.somethingWrong") || "Something went wrong",
    ),
    React.createElement(
      "p",
      { style: { fontSize: 12, color: "var(--fg-3)", marginBottom: 16 } },
      message || __t("enterprise.failedToLoad") || "Failed to load data",
    ),
    onRetry &&
      React.createElement(
        "button",
        { className: "btn", onClick: onRetry },
        __t("enterprise.retry") || "Retry",
      ),
  );
}
ErrorState.propTypes = {
  message: PropTypes.any,
  onRetry: PropTypes.func,
};

// ============ KEYBOARD SHORTCUTS ============
const shortcuts = {};
let enabled = true;

export function register(key, callback, description) {
  shortcuts[key.toLowerCase()] = { callback, description };
}

export function unregister(key) {
  delete shortcuts[key.toLowerCase()];
}

export function getShortcuts() {
  return Object.entries(shortcuts).map(([key, { description }]) => ({
    key,
    description,
  }));
}

export function setEnabled(v) {
  enabled = v;
}

document.addEventListener("keydown", (e) => {
  if (!enabled) return;
  if (
    e.target.tagName === "INPUT" ||
    e.target.tagName === "TEXTAREA" ||
    e.target.isContentEditable
  )
    return;
  if (e.ctrlKey || e.metaKey) {
    const key = "ctrl+" + e.key.toLowerCase();
    if (shortcuts[key]) {
      e.preventDefault();
      shortcuts[key].callback(e);
    }
  } else if (shortcuts[e.key.toLowerCase()]) {
    shortcuts[e.key.toLowerCase()].callback(e);
  }
});

export const keyboardShortcuts = {
  register,
  unregister,
  getShortcuts,
  setEnabled,
};
window.keyboardShortcuts = keyboardShortcuts;

// Register default shortcuts
keyboardShortcuts.register(
  "ctrl+k",
  () => {
    if (window.openModal) window.openModal("search");
  },
  __t("enterprise.shortcutGlobalSearch") || "Open global search",
);
keyboardShortcuts.register(
  "ctrl+s",
  (e) => {
    e.preventDefault();
    toast(__t("enterprise.bomSaved") || "BOM saved", { kind: "success" });
  },
  __t("enterprise.shortcutSaveBom") || "Save current BOM",
);
keyboardShortcuts.register(
  "escape",
  () => {
    if (window.openModal) window.openModal(null);
  },
  __t("enterprise.shortcutCloseModal") || "Close modal",
);

// CSRF is handled cookie-based in api.js (X-CSRF-Token from the csrf_token
// cookie). The previous client-side `sanitize` and `csrf` helpers were unused
// / provided no real protection and have been removed.

// ============ RATE LIMITER ============
export const rateLimiter = {
  _limits: {},
  check(key, maxPerMinute = 60) {
    const now = Date.now();
    const entry = this._limits[key] || { count: 0, resetAt: now + 60000 };
    if (now > entry.resetAt) {
      entry.count = 0;
      entry.resetAt = now + 60000;
    }
    entry.count++;
    this._limits[key] = entry;
    return entry.count <= maxPerMinute;
  },
  remaining(key, maxPerMinute = 60) {
    const entry = this._limits[key];
    if (!entry) return maxPerMinute;
    return Math.max(0, maxPerMinute - entry.count);
  },
};
window.rateLimiter = rateLimiter;

// ============ PERFORMANCE UTILITIES ============
export const perf = {
  _marks: {},
  start(name) {
    this._marks[name] = performance.now();
  },
  end(name) {
    const start = this._marks[name];
    if (!start) return 0;
    const duration = performance.now() - start;
    delete this._marks[name];
    return Math.round(duration * 100) / 100;
  },
  log(name) {
    const duration = this.end(name);
    return duration;
  },
};
window.perf = perf;

// ============ ACCESSIBILITY UTILITIES ============
export const a11y = {
  announce(message) {
    let el = document.getElementById("a11y-announcer");
    if (!el) {
      el = document.createElement("div");
      el.id = "a11y-announcer";
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      el.className = "sr-only";
      document.body.appendChild(el);
    }
    el.textContent = "";
    setTimeout(() => {
      el.textContent = message;
    }, 100);
  },
  trapFocus(container) {
    const focusable = container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length === 0) return () => {};
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    function handler(e) {
      if (e.key !== "Tab") return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    container.addEventListener("keydown", handler);
    first.focus();
    return () => container.removeEventListener("keydown", handler);
  },
};
window.a11y = a11y;

// ============ DATA NORMALIZATION ============
export const normalize = {
  bom(rows) {
    if (!Array.isArray(rows)) return [];
    return rows.map((r, i) => ({
      ...r,
      id: r.id || r.pn || `row-${i}`,
      qty: Number(r.qty) || 0,
      cost: Number(r.cost) || 0,
      status: r.status || "Draft",
      children: r.children ? normalize.bom(r.children) : undefined,
    }));
  },
  vendors(vendors) {
    if (!Array.isArray(vendors)) return [];
    return vendors.map((v) => ({
      ...v,
      id: v.id || v.name,
      rating: Number(v.rating) || 0,
      leadTime: Number(v.leadTime) || 0,
    }));
  },
};
window.normalize = normalize;

// ============ CONSISTENT FETCH WRAPPER ============
export async function fetchWithRetry(
  url,
  options = {},
  retries = 3,
  delay = 1000,
) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...options.headers,
        },
      });
      if (response.status === 401) {
        toast(
          __t("enterprise.sessionExpired") ||
            "Session expired. Please log in again.",
          { kind: "error" },
        );
        window.location.href = "/";
        throw new Error("Unauthorized");
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      if (i === retries - 1) throw error;
      if (error.message === "Unauthorized") throw error;
      await new Promise((resolve) => setTimeout(resolve, delay * (i + 1)));
    }
  }
}
window.fetchWithRetry = fetchWithRetry;

// ============ FOCUS STYLES ============
(function () {
  const style = document.createElement("style");
  style.textContent = `
    *:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  `;
  document.head.appendChild(style);
})();

window.Skeleton = Skeleton;
window.SkeletonTable = SkeletonTable;
window.SkeletonCards = SkeletonCards;
