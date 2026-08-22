"""Every entityType the code writes must be in AuditLog.ALLOWED_ENTITY_TYPES.

Why this matters more than a missing audit row: the validator RAISES on an
unlisted value, and services write the audit entry AFTER the business change is
already persisted. So a missing entry 500s the request while the change stays
saved — the user is told it failed when it succeeded.

That is exactly what happened to `inventory` (inventory_service.adjust) and
`quality` (quality_service inspection records): both written, neither listed.

This test greps the source rather than exercising every endpoint, because the
failure is a data-mismatch between two lists, and the grep catches a new writer
the day it is added instead of whenever someone happens to test that endpoint.
"""

import pathlib
import re

APP = pathlib.Path(__file__).resolve().parents[1]


def _entity_types_written_in_source() -> dict[str, str]:
    """Map entityType literal -> first file that writes it."""
    found: dict[str, str] = {}
    for f in APP.rglob("*.py"):
        if "tests" in f.parts:
            continue
        text = f.read_text(encoding="utf8", errors="replace")
        for m in re.finditer(r'entityType\s*=\s*["\']([a-zA-Z_]+)["\']', text):
            found.setdefault(m.group(1), str(f.relative_to(APP)))
    return found


def test_every_written_entity_type_is_allowed():
    from app.models.audit_log import AuditLog

    written = _entity_types_written_in_source()
    assert written, "found no entityType= literals at all — has the pattern changed?"

    missing = {k: v for k, v in written.items() if k not in AuditLog.ALLOWED_ENTITY_TYPES}
    assert not missing, (
        "These entityType values are written by services but rejected by "
        f"AuditLog.ALLOWED_ENTITY_TYPES: {missing}. The validator raises on insert, "
        "and the audit write happens after the business change is committed — so "
        "each of these 500s the request while the change stays persisted."
    )


def test_validator_actually_rejects_an_unknown_type():
    """Guard the guard — if the validator stopped firing, the test above is moot."""
    import pytest

    from app.models.audit_log import AuditLog, validate_audit_log_entity

    ok = AuditLog(entityType="part", action="create")
    validate_audit_log_entity(None, None, ok)  # must not raise

    bad = AuditLog(entityType="definitely_not_a_real_entity", action="create")
    with pytest.raises(ValueError):
        validate_audit_log_entity(None, None, bad)
