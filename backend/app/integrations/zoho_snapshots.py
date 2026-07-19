"""Outbound event snapshots for Zoho Books (increment 2a).

Small pure builders that turn a local Part/Vendor/POHeader into the payload an
`IntegrationOutbox` row carries. Kept separate from the endpoints so the create/
update emit hooks and the manual sync-trigger endpoint build identical payloads.

Only tool-owned identity fields (+ cost on parts, which the deliver path pushes
on CREATE only) are included — the delivery worker enforces field ownership
(spec §4.5), these snapshots just carry the source values.
"""


def _f(v):
    return None if v is None else float(v)


def part_snapshot(part) -> dict:
    return {
        "pn": part.pn,
        "name": part.name,
        "description": part.description,
        "uom": part.uom,
        "cost": _f(part.cost),
        "mpn": part.mpn,
        "manufacturer": part.manufacturer,
        "status": part.status,
    }


def vendor_snapshot(vendor) -> dict:
    return {
        "name": vendor.name,
        "contactEmail": vendor.contactEmail,
        "contactPhone": vendor.contactPhone,
        "address": vendor.address,
        "active": vendor.active,
        "country": vendor.country,
    }


def po_snapshot(header) -> dict:
    # Thin by design: the deliver path loads the header + lines from the DB to
    # build the Books Purchase Order body (line ordering / FK resolution).
    return {"ref": header.poNumber, "status": header.status}
