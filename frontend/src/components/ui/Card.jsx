import PropTypes from "prop-types";

/** Card / Panel — surface container with optional header/footer. */
export function Card({
  title,
  subtitle,
  actions,
  footer,
  flush = false,
  raised = false,
  bodyClassName = "",
  className = "",
  children,
  ...rest
}) {
  const cls = [
    "ui-card",
    flush ? "ui-card--flush" : "",
    raised ? "ui-card--raised" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const hasHeader = title || subtitle || actions;
  return (
    <section className={cls} {...rest}>
      {hasHeader && (
        <header className="ui-card__header">
          <div>
            {title && <h3 className="ui-card__title">{title}</h3>}
            {subtitle && <p className="ui-card__subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="ui-card__actions">{actions}</div>}
        </header>
      )}
      <div className={["ui-card__body", bodyClassName].filter(Boolean).join(" ")}>
        {children}
      </div>
      {footer && <footer className="ui-card__footer">{footer}</footer>}
    </section>
  );
}
Card.propTypes = {
  title: PropTypes.node,
  subtitle: PropTypes.node,
  actions: PropTypes.node,
  footer: PropTypes.node,
  flush: PropTypes.bool,
  raised: PropTypes.bool,
  bodyClassName: PropTypes.string,
  className: PropTypes.string,
  children: PropTypes.node,
};

export default Card;
