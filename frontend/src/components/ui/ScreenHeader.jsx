import PropTypes from "prop-types";

/**
 * ScreenHeader — the one title treatment every screen consumes: a single
 * title scale/weight/case/prefix (matching the existing global .screen-header
 * convention already used across ~16 screens), an optional breadcrumb trail,
 * an optional description, and a right-aligned action cluster. Deliberately
 * reuses the pre-existing `.screen-header`/`h1`/`.sub` rules in styles.css
 * (Cross-screen tokens doc) rather than inventing a second header style —
 * screens that already hand-roll that markup can swap to this component with
 * zero visual change. Semantic `<header>` landmark + `<h1>` for AT/SR users.
 */
export function ScreenHeader({
  title,
  description,
  breadcrumbs,
  actions,
  className = "",
}) {
  return (
    <header className={["screen-header", className].filter(Boolean).join(" ")}>
      <div>
        {breadcrumbs ? <div className="screen-header__crumbs">{breadcrumbs}</div> : null}
        <h1>{title}</h1>
        {description ? <div className="sub">{description}</div> : null}
      </div>
      {actions ? <div className="screen-header__actions">{actions}</div> : null}
    </header>
  );
}
ScreenHeader.propTypes = {
  title: PropTypes.node.isRequired,
  description: PropTypes.node,
  breadcrumbs: PropTypes.node,
  actions: PropTypes.node,
  className: PropTypes.string,
};

/**
 * ContentFrame — centered ~1360-1440px reading/card/form width (UI decision
 * #7); pass `full` for the BOM/Parts data-grid exception (full-bleed).
 * `.content-frame` is also applied directly to the pre-existing global
 * `.screen-wrap` container in styles.css, so the ~16 screens already using
 * that wrapper are centered without a per-screen markup change; this
 * component exists for anything that isn't a `.screen-wrap` screen (modals,
 * card grids, future screens) that still wants the same frame.
 */
export function ContentFrame({ full = false, as: As = "div", className = "", children, ...rest }) {
  const cls = [
    "content-frame",
    full ? "content-frame--full" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <As className={cls} {...rest}>
      {children}
    </As>
  );
}
ContentFrame.propTypes = {
  full: PropTypes.bool,
  as: PropTypes.elementType,
  className: PropTypes.string,
  children: PropTypes.node,
};

export default ScreenHeader;
