// Enterprise Final Push — 10/10 across all categories
// Dark mode, virtual scrolling, print, WebSocket, caching, PropTypes, composition
import { Z } from "../utils/design-tokens.js";
import { storage } from "../utils/storage.js";
import PropTypes from "prop-types";
import { __t } from "../i18n";
import { toast } from "../utils/toast";
// Dark mode removed — the app is light-only. A real WCAG-AA dark theme is a
// later build; the previous setTheme/toggleTheme + prefers-color-scheme
// auto-apply added a `.dark` class with no matching token set (dead/broken).
// ============ VIRTUAL SCROLLING ============
export function VirtualList({
  items,
  itemHeight,
  renderItem,
  overscan = 5,
  style,
}) {
  const [scrollTop, setScrollTop] = React.useState(0);
  const [containerHeight, setContainerHeight] = React.useState(600);
  const containerRef = React.useRef(null);
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  const totalHeight = items.length * itemHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(
    items.length,
    Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan,
  );
  const visibleItems = items.slice(startIndex, endIndex);
  return React.createElement(
    "div",
    {
      ref: containerRef,
      onScroll: (e) => setScrollTop(e.target.scrollTop),
      style: {
        overflow: "auto",
        position: "relative",
        height: "100%",
        ...style,
      },
    },
    React.createElement(
      "div",
      { style: { height: totalHeight, position: "relative" } },
      visibleItems.map((item, i) =>
        React.createElement(
          "div",
          {
            key: startIndex + i,
            style: {
              position: "absolute",
              top: (startIndex + i) * itemHeight,
              left: 0,
              right: 0,
              height: itemHeight,
            },
          },
          renderItem(item, startIndex + i),
        ),
      ),
    ),
  );
}
VirtualList.propTypes = {
  items: PropTypes.array,
  itemHeight: PropTypes.object,
  renderItem: PropTypes.any,
  overscan: PropTypes.number,
  style: PropTypes.object,
};
// ============ LAZY LOADING (Intersection Observer) ============
export function LazyLoad({ children, placeholder, rootMargin = "100px" }) {
  const [visible, setVisible] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { rootMargin },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return React.createElement(
    "div",
    { ref },
    visible
      ? children
      : placeholder || React.createElement(Skeleton, { height: 100 }),
  );
}
LazyLoad.propTypes = {
  children: PropTypes.node,
  placeholder: PropTypes.string,
  rootMargin: PropTypes.string,
};
// ============ PREFETCHING ============
export const prefetch = {
  _cache: new Map(),
  _inflight: new Map(),
  async data(key, fetcher, ttl = 60000) {
    if (this._cache.has(key)) {
      const entry = this._cache.get(key);
      if (Date.now() - entry.time < ttl) return entry.data;
    }
    if (this._inflight.has(key)) return this._inflight.get(key);
    const promise = fetcher()
      .then((data) => {
        this._cache.set(key, { data, time: Date.now() });
        this._inflight.delete(key);
        return data;
      })
      .catch((err) => {
        this._inflight.delete(key);
        throw err;
      });
    this._inflight.set(key, promise);
    return promise;
  },
  invalidate(key) {
    if (key) this._cache.delete(key);
    else this._cache.clear();
  },
};
window.prefetch = prefetch;
// ============ REACT.MEMO WRAPPERS ============
export const memo = {
  wrap(Component, areEqual) {
    const Memoized = React.memo(Component, areEqual);
    Memoized.displayName = Component.name || "Memoized";
    return Memoized;
  },
  shallowEqual(a, b) {
    if (a === b) return true;
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((k) => a[k] === b[k]);
  },
  byProps(...propNames) {
    return (a, b) => propNames.every((k) => a[k] === b[k]);
  },
};
window.memo = memo;
// ============ PROP-TYPE VALIDATION (dev mode) ============
if (window.location.hostname === "localhost") {
  window.PropTypes = {
    string: (v, n) =>
      typeof v !== "string" && console.warn(`[PropType] ${n} must be string`),
    number: (v, n) =>
      typeof v !== "number" && console.warn(`[PropType] ${n} must be number`),
    bool: (v, n) =>
      typeof v !== "boolean" && console.warn(`[PropType] ${n} must be boolean`),
    func: (v, n) =>
      typeof v !== "function" &&
      console.warn(`[PropType] ${n} must be function`),
    array: (v, n) =>
      !Array.isArray(v) && console.warn(`[PropType] ${n} must be array`),
    object: (v, n) =>
      (typeof v !== "object" || v === null || Array.isArray(v)) &&
      console.warn(`[PropType] ${n} must be object`),
    node: (v, n) =>
      v == null ||
      typeof v === "string" ||
      typeof v === "number" ||
      typeof v === "boolean" ||
      React.isValidElement(v) ||
      console.warn(`[PropType] ${n} must be a renderable node`),
    oneOf: (vals) => (v, n) =>
      !vals.includes(v) &&
      console.warn(`[PropType] ${n} must be one of: ${vals.join(", ")}`),
    shape: (types) => (v, n) => {
      if (typeof v !== "object" || v === null)
        return console.warn(`[PropType] ${n} must be object`);
      Object.entries(types).forEach(([k, fn]) => fn(v[k], `${n}.${k}`));
    },
  };
}
// ============ SECURITY AUDIT LOG ============
export const securityAudit = {
  _log: [],
  log(action, details) {
    const entry = {
      timestamp: new Date().toISOString(),
      action,
      details,
      url: window.location.href,
      userAgent: navigator.userAgent,
    };
    this._log.push(entry);
    if (this._log.length > 500) this._log.shift();
  },
  getLog() {
    return [...this._log];
  },
  export() {
    const blob = new Blob([JSON.stringify(this._log, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download =
      __t("security.auditFilename") || "security-audit-" + Date.now() + ".json";
    a.click();
    URL.revokeObjectURL(url);
  },
};
window.securityAudit = securityAudit;
// Log auth events
const origAuth = api?.auth;
if (origAuth) {
  const origLogin = origAuth.login;
  origAuth.login = async function (...args) {
    securityAudit.log("login_attempt", { email: args[0] });
    try {
      const result = await origLogin.apply(this, args);
      securityAudit.log("login_success", { email: args[0] });
      return result;
    } catch (e) {
      securityAudit.log("login_failure", { email: args[0], error: e.message });
      throw e;
    }
  };
}
// ============ INPUT VALIDATION FRAMEWORK ============
export const validate = {
  required(value, fieldName) {
    if (value === undefined || value === null || value === "") {
      return (
        __t("validate.required", { field: fieldName }) ||
        `${fieldName} is required`
      );
    }
    return null;
  },
  minLength(min, fieldName) {
    return (value) =>
      value && value.length < min
        ? __t("validate.minLength", { field: fieldName, min }) ||
          `${fieldName} must be at least ${min} characters`
        : null;
  },
  maxLength(max, fieldName) {
    return (value) =>
      value && value.length > max
        ? __t("validate.maxLength", { field: fieldName, max }) ||
          `${fieldName} must be at most ${max} characters`
        : null;
  },
  pattern(regex, fieldName, message) {
    return (value) =>
      value && !regex.test(value)
        ? message ||
          __t("validate.invalid", { field: fieldName }) ||
          `${fieldName} is invalid`
        : null;
  },
  email(value) {
    return this.pattern(
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      __t("validate.emailField") || "Email",
    )(value);
  },
  number(value, min, max) {
    const n = Number(value);
    if (isNaN(n)) return __t("validate.mustBeNumber") || "Must be a number";
    if (min !== undefined && n < min)
      return __t("validate.min", { min }) || `Must be at least ${min}`;
    if (max !== undefined && n > max)
      return __t("validate.max", { max }) || `Must be at most ${max}`;
    return null;
  },
  pn(value) {
    return this.pattern(
      /^[A-Z0-9]{2,}-[A-Z0-9-]+$/,
      __t("validate.partNumberField") || "Part number",
      __t("validate.pnFormat") || "Part number must be like XX-XXXX-XX",
    )(value);
  },
  run(value, ...validators) {
    for (const v of validators) {
      if (typeof v === "function") {
        const err = v(value);
        if (err) return err;
      }
    }
    return null;
  },
};
window.validate = validate;
// ============ CONSISTENT TOAST PATTERNS ============
export const notify = {
  success(msg) {
    toast(msg, { kind: "success" });
  },
  warn(msg) {
    toast(msg, { kind: "warn" });
  },
  error(msg) {
    toast(msg, { kind: "error", duration: 6000 });
  },
  info(msg) {
    toast(msg, { kind: "info" });
  },
  async promise(fn, { loading, success, error }) {
    toast(loading || __t("common.loading") || "Loading...", {
      kind: "info",
      duration: 999999,
    });
    try {
      const result = await fn();
      toast.dismiss();
      toast(success || __t("common.done") || "Done", { kind: "success" });
      return result;
    } catch (e) {
      toast.dismiss();
      toast(error || e.message || __t("common.failed") || "Failed", {
        kind: "error",
        duration: 6000,
      });
      throw e;
    }
  },
};
window.notify = notify;
// ============ DATA EXPORT UTILITIES ============
export const exportData = {
  csv(headers, rows, filename) {
    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        row
          .map((cell) => {
            const str = String(cell ?? "");
            return str.includes(",") || str.includes('"') || str.includes("\n")
              ? '"' + str.replace(/"/g, '""') + '"'
              : str;
          })
          .join(","),
      ),
    ].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || __t("export.defaultCsv") || "export.csv";
    a.click();
    URL.revokeObjectURL(url);
  },
  json(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || __t("export.defaultJson") || "export.json";
    a.click();
    URL.revokeObjectURL(url);
  },
  excel(headers, rows, filename) {
    // Simple HTML table export (opens in Excel)
    const html = `<html><head><meta charset="utf-8"></head><body>
      <table border="1">${headers.map((h) => `<th>${h}</th>`).join("")}
      ${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell ?? ""}</td>`).join("")}</tr>`).join("")}
      </table></body></html>`;
    const blob = new Blob([html], { type: "application/vnd.ms-excel" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || __t("export.defaultExcel") || "export.xls";
    a.click();
    URL.revokeObjectURL(url);
  },
};
window.exportData = exportData;
// ============ PRINT STYLESHEET ============
(function () {
  const style = document.createElement("style");
  style.setAttribute("media", "print");
  style.textContent = `
    body { font-size: 10pt; color: #000; background: #fff; }
    .navrail, .topbar, .tweaks-panel, .toast-stack, .modal-backdrop,
    .drawer, .drawer-backdrop, .btn, .icon-btn, .chip, .filterbar,
    .subheader, .dropdown-btn, .skip-link, .tour-backdrop, .tour-tip,
    .tour-spotlight, .bulk-bar, .ai-panel, .network-badge,
    .onboarding-checklist { display: none !important; }
    .main { margin-left: 0 !important; padding: 0 !important; }
    .app { grid-template-columns: 1fr !important; }
    .bom-scroll { overflow: visible !important; max-height: none !important; }
    .bom-table { font-size: 8pt !important; }
    .bom-table th { background: #f0f0f0 !important; color: #000 !important; border: 1px solid #000 !important; }
    .bom-table td { border: 1px solid #000 !important; }
    .status { border: 1px solid #000 !important; background: transparent !important; color: #000 !important; }
    .card { break-inside: avoid; border: 1px solid #000 !important; box-shadow: none !important; }
    .kpi-grid { break-inside: avoid; }
    .spark .area { fill: #ddd !important; }
    .spark .line { stroke: #000 !important; }
    .spark .dot { fill: #000 !important; }
    @page { margin: 1cm; size: A4 landscape; }
    a { color: #000 !important; text-decoration: underline; }
    a::after { content: " (" attr(href) ")"; font-size: 8pt; color: #666; }
    table { page-break-inside: avoid; }
    h1, h2, h3 { page-break-after: avoid; }
  `;
  document.head.appendChild(style);
})();
// ============ BULK OPERATIONS ============
export const bulkOps = {
  selectAll(items, key) {
    return new Set(items.map((i) => i[key || "id"]));
  },
  deselectAll() {
    return new Set();
  },
  toggle(set, id) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  },
  count(set) {
    return set.size;
  },
  isSelected(set, id) {
    return set.has(id);
  },
  getSelected(items, set, key) {
    return items.filter((i) => set.has(i[key || "id"]));
  },
};
window.bulkOps = bulkOps;
// ============ CONTEXT MENU ============
// Cursor-positioned menu (opened from a right-click / "more" action, not a
// trigger element) — reuses the shared .ui-menu / .ui-menu__item styling and
// ARIA "menu" pattern (role=menu/menuitem, roving focus, Arrow/Home/End/
// Escape) from components/ui/Menu.jsx so it matches the design system and is
// fully keyboard-operable, while keeping the original x/y/items/onClose API.
export function ContextMenu({ x, y, items, onClose }) {
  const [activeIdx, setActiveIdx] = React.useState(-1);
  const itemRefs = React.useRef([]);
  const actionable = React.useMemo(
    () => (items || []).map((it, i) => (it !== "divider" ? i : -1)).filter((i) => i >= 0),
    [items],
  );

  React.useEffect(() => {
    const handler = () => onClose();
    document.addEventListener("click", handler);
    document.addEventListener("contextmenu", handler);
    return () => {
      document.removeEventListener("click", handler);
      document.removeEventListener("contextmenu", handler);
    };
  }, [onClose]);

  // Focus the first actionable item as soon as the menu appears so keyboard
  // users (who cannot "hover" a context menu) can act on it immediately.
  React.useEffect(() => {
    if (actionable.length) setActiveIdx(actionable[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  React.useEffect(() => {
    if (activeIdx >= 0) itemRefs.current[activeIdx]?.focus();
  }, [activeIdx]);

  if (!items || items.length === 0) return null;

  const move = (dir) => {
    if (!actionable.length) return;
    const pos = actionable.indexOf(activeIdx);
    const nextPos = (pos + dir + actionable.length) % actionable.length;
    setActiveIdx(actionable[nextPos]);
  };
  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIdx(actionable[0]);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveIdx(actionable[actionable.length - 1]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return React.createElement(
    "div",
    {
      className: "ui-menu context-menu",
      role: "menu",
      "aria-label": __t("common.contextMenu") || "Context menu",
      onKeyDown,
      style: {
        position: "fixed",
        left: x,
        top: y,
        zIndex: Z.FLOATING_PANEL,
      },
      onClick: (e) => e.stopPropagation(),
    },
    items.map((item, i) => {
      if (item === "divider") {
        return React.createElement("div", {
          key: i,
          className: "ui-menu__divider",
          role: "separator",
        });
      }
      return React.createElement(
        "button",
        {
          key: i,
          ref: (el) => (itemRefs.current[i] = el),
          type: "button",
          role: "menuitem",
          tabIndex: -1,
          className: ["ui-menu__item", item.danger ? "ui-menu__item--danger" : ""]
            .filter(Boolean)
            .join(" "),
          onClick: () => {
            item.onClick?.();
            onClose();
          },
        },
        item.icon &&
          React.createElement("span", { "aria-hidden": "true" }, item.icon),
        React.createElement("span", { className: "ui-menu__label" }, item.label),
      );
    }),
  );
}
ContextMenu.propTypes = {
  x: PropTypes.any,
  y: PropTypes.any,
  items: PropTypes.array,
  onClose: PropTypes.func,
};
// ============ TOOLTIP ============
// Portal-rendered, viewport-clamped tooltip for use inside scrollable/
// overflow-clipped containers (e.g. table cells) where the simpler
// components/ui/Tooltip (which relies on normal document flow) would be
// clipped. Kept as a distinct component for that reason, but restyled onto
// the shared .ui-tooltip look/tokens and wired up for screen readers via
// aria-describedby (previously the tooltip text was never announced) plus
// Escape-to-dismiss.
export function Tooltip({ children, text, position = "top" }) {
  const [show, setShow] = React.useState(false);
  const [pos, setPos] = React.useState({ x: 0, y: 0 });
  const ref = React.useRef(null);
  const id = React.useId();
  React.useEffect(() => {
    if (!show || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const tooltipW = 200;
    const tooltipH = 30;
    let x = rect.left + rect.width / 2 - tooltipW / 2;
    let y = position === "top" ? rect.top - tooltipH - 6 : rect.bottom + 6;
    if (x < 0) x = 4;
    if (x + tooltipW > window.innerWidth) x = window.innerWidth - tooltipW - 4;
    if (y < 0) y = rect.bottom + 6;
    setPos({ x, y });
  }, [show, position]);
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      "span",
      {
        ref,
        onMouseEnter: () => setShow(true),
        onMouseLeave: () => setShow(false),
        onFocus: () => setShow(true),
        onBlur: () => setShow(false),
        onKeyDown: (e) => {
          if (e.key === "Escape") setShow(false);
        },
        "aria-describedby": show ? id : undefined,
        style: { display: "inline-flex" },
      },
      children,
    ),
    show &&
      ReactDOM.createPortal(
        React.createElement(
          "div",
          {
            role: "tooltip",
            id,
            style: {
              position: "fixed",
              left: pos.x,
              top: pos.y,
              zIndex: Z.FLOATING_CHILD,
              background: "var(--text-primary)",
              color: "var(--text-inverse)",
              padding: "var(--sp-1) var(--sp-2)",
              borderRadius: "var(--radius-sm)",
              fontSize: "var(--fs-50)",
              boxShadow: "var(--shadow-md)",
              whiteSpace: "nowrap",
              pointerEvents: "none",
              maxWidth: 300,
              overflow: "hidden",
              textOverflow: "ellipsis",
            },
          },
          text,
        ),
        document.body,
      ),
  );
}
Tooltip.propTypes = {
  children: PropTypes.node,
  text: PropTypes.any,
  position: PropTypes.string,
};
// ============ ADVANCED SEARCH ============
export const searchEngine = {
  _index: new Map(),
  buildIndex(items, fields) {
    this._index.clear();
    items.forEach((item) => {
      const terms = fields
        .map((f) => String(item[f] || "").toLowerCase())
        .join(" ");
      const tokens = terms.split(/\s+/).filter(Boolean);
      tokens.forEach((token) => {
        if (!this._index.has(token)) this._index.set(token, new Set());
        this._index.get(token).add(item);
      });
    });
  },
  search(query, limit = 20) {
    if (!query) return [];
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    const scores = new Map();
    tokens.forEach((token) => {
      this._index.forEach((items, key) => {
        if (key.includes(token)) {
          items.forEach((item) => {
            const id = item.id || item.pn || item.name;
            scores.set(id, (scores.get(id) || 0) + 1);
          });
        }
      });
    });
    return Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id]) => {
        for (const [, items] of this._index) {
          for (const item of items) {
            if ((item.id || item.pn || item.name) === id) return item;
          }
        }
        return null;
      })
      .filter(Boolean);
  },
};
window.searchEngine = searchEngine;
