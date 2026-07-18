// Substance-compliance status -> semantic tone map (spec Â§6, P12).
//
// This is a NEW, parallel, status-keyed map â€” it is intentionally NOT an
// extension of the existing valid/expiring/expired/missing map used by the
// (still-mocked) ComplianceScreen cert-tracking view. `UNKNOWN` must not read
// as benign gray: it outranks `COMPLIANT_WITH_EXEMPTION` in the RoHS/REACH
// status lattice ("absence of data â‰  compliance"), so it gets the
// attention-getting `info` tone rather than `neutral`.
export const COMPLIANCE_TONE = {
  COMPLIANT: "success",
  COMPLIANT_WITH_EXEMPTION: "warning",
  UNKNOWN: "info",
  NON_COMPLIANT: "danger",
  NOT_APPLICABLE: "neutral",
};

export function toneForComplianceStatus(status, fallback = "neutral") {
  if (!status) return fallback;
  return COMPLIANCE_TONE[status] || fallback;
}
