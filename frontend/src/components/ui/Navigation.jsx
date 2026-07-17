import PropTypes from "prop-types";

/**
 * Breadcrumb — nav landmark; last crumb marked aria-current="page".
 * items: [{ label, onClick? }]
 */
export function Breadcrumb({ items = [], separator = "/", ariaLabel = "Breadcrumb" }) {
  return (
    <nav className="ui-breadcrumb" aria-label={ariaLabel}>
      <ol className="ui-breadcrumb__list">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li
              key={i}
              style={{ display: "inline-flex", alignItems: "center", gap: "var(--sp-1)" }}
            >
              {last || !item.onClick ? (
                <span
                  className="ui-breadcrumb__current"
                  aria-current={last ? "page" : undefined}
                >
                  {item.label}
                </span>
              ) : (
                <button
                  type="button"
                  className="ui-breadcrumb__link"
                  onClick={item.onClick}
                >
                  {item.label}
                </button>
              )}
              {!last && (
                <span className="ui-breadcrumb__sep" aria-hidden="true">
                  {separator}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
Breadcrumb.propTypes = {
  items: PropTypes.arrayOf(
    PropTypes.shape({ label: PropTypes.node, onClick: PropTypes.func }),
  ),
  separator: PropTypes.node,
  ariaLabel: PropTypes.string,
};

function pageRange(current, total) {
  // 1 … c-1 c c+1 … total  (with clamping)
  const out = [];
  const push = (v) => out.push(v);
  const window = new Set([1, total, current, current - 1, current + 1]);
  let prev = 0;
  for (let p = 1; p <= total; p++) {
    if (window.has(p) || (p >= current - 1 && p <= current + 1)) {
      if (p - prev > 1) push("…");
      push(p);
      prev = p;
    }
  }
  return out;
}

/** Pagination — nav landmark; current page marked aria-current="page". */
export function Pagination({ page = 1, pageCount = 1, onChange, ariaLabel = "Pagination" }) {
  if (pageCount <= 1) return null;
  const go = (p) => {
    if (p >= 1 && p <= pageCount && p !== page && onChange) onChange(p);
  };
  return (
    <nav className="ui-pagination" aria-label={ariaLabel}>
      <ul className="ui-pagination__list">
        <li>
          <button
            type="button"
            className="ui-page__btn"
            onClick={() => go(page - 1)}
            disabled={page <= 1}
            aria-label="Previous page"
          >
            ‹
          </button>
        </li>
        {pageRange(page, pageCount).map((p, i) =>
          p === "…" ? (
            <li key={`e-${i}`}>
              <span className="ui-page__ellipsis" aria-hidden="true">
                …
              </span>
            </li>
          ) : (
            <li key={p}>
              <button
                type="button"
                className="ui-page__btn"
                aria-current={p === page ? "page" : undefined}
                aria-label={`Page ${p}`}
                onClick={() => go(p)}
              >
                {p}
              </button>
            </li>
          ),
        )}
        <li>
          <button
            type="button"
            className="ui-page__btn"
            onClick={() => go(page + 1)}
            disabled={page >= pageCount}
            aria-label="Next page"
          >
            ›
          </button>
        </li>
      </ul>
    </nav>
  );
}
Pagination.propTypes = {
  page: PropTypes.number,
  pageCount: PropTypes.number,
  onChange: PropTypes.func,
  ariaLabel: PropTypes.string,
};
