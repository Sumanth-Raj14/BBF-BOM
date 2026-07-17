import PropTypes from "prop-types";

const TONES = ["neutral", "accent", "success", "warning", "danger", "info"];

/**
 * Domain status → semantic tone map. Covers part/ECO/WO/PO/NCR states.
 * Keys are compared case-insensitively.
 */
export const STATUS_TONES = {
  // Part / item lifecycle
  released: "success",
  approved: "info",
  active: "success",
  draft: "neutral",
  review: "warning",
  "in review": "warning",
  pending: "warning",
  deprecated: "danger",
  obsolete: "neutral",
  rejected: "danger",
  // ECO / change
  open: "info",
  "in progress": "warning",
  implemented: "success",
  closed: "neutral",
  cancelled: "neutral",
  // Work order
  planned: "neutral",
  scheduled: "info",
  wip: "warning",
  "on hold": "warning",
  complete: "success",
  completed: "success",
  // PO / procurement
  ordered: "info",
  received: "success",
  overdue: "danger",
  // NCR / quality
  fail: "danger",
  failed: "danger",
  pass: "success",
  passed: "success",
};

export function toneForStatus(status, fallback = "neutral") {
  if (!status) return fallback;
  return STATUS_TONES[String(status).toLowerCase()] || fallback;
}

/** Badge / Tag — compact labelled chip in a semantic tone. */
export function Badge({ tone = "neutral", pill = false, className = "", children, ...rest }) {
  const cls = [
    "ui-badge",
    `ui-badge--${tone}`,
    pill ? "ui-badge--pill" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={cls} {...rest}>
      {children}
    </span>
  );
}
Badge.propTypes = {
  tone: PropTypes.oneOf(TONES),
  pill: PropTypes.bool,
  className: PropTypes.string,
  children: PropTypes.node,
};

/**
 * StatusPill — dot + label; maps a domain status string to a tone
 * automatically (override with `tone`).
 */
export function StatusPill({ status, label, tone, className = "", ...rest }) {
  const resolved = tone || toneForStatus(status);
  const cls = ["ui-status", `ui-status--${resolved}`, className]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={cls} {...rest}>
      <span className="ui-status__dot" aria-hidden="true" />
      {label ?? status}
    </span>
  );
}
StatusPill.propTypes = {
  status: PropTypes.string,
  label: PropTypes.node,
  tone: PropTypes.oneOf(TONES),
  className: PropTypes.string,
};
