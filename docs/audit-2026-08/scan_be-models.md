# Backend models + schemas audit

Scope: backend/app/models (75 files) and backend/app/schemas (31 files), read in full.
No repository files modified.

## Finding 1 — HIGH — FK ondelete contradicts NOT NULL (crash on user delete)

File: `backend/app/models/supplier_portal.py:77`

```python
created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=False, index=True)
```

`RfqHeader.created_by` is declared `nullable=False` but its FK says `ondelete="SET NULL"`.
On Postgres, deleting any `User` who has ever created an RFQ fires the
`ON DELETE SET NULL` action on `rfq_headers.created_by`, which then violates
the column's own `NOT NULL` constraint — the DELETE fails with an
IntegrityError (`null value in column "created_by" violates not-null
constraint`), blocking user deletion/cleanup entirely for any tenant that has
used the RFQ feature.

Checked every other `ondelete="SET NULL"` FK in `app/models/*.py` (grepped
all occurrences) — this is the only one paired with `nullable=False`; every
other SET NULL column is correctly nullable (e.g. `team.py:30`,
`zoho_sync.py:108`, `compliance.py:49`).

Fix: either `nullable=True` (matches the SET NULL intent — the RFQ simply
loses its "created by" once that user is gone), or change to
`ondelete="CASCADE"`/`"RESTRICT"` if losing the RFQ (or blocking the delete)
is preferred.

## Finding 2 — MEDIUM — CHECK constraint / comment drift on Contract.contractType

File: `backend/app/models/contract.py:33` (column) vs `:83-86` (CHECK)

```python
contractType = Column(String)  # "Blanket PO", "Volume Discount", "Long-term Agreement", "NDA"
...
CheckConstraint(
    "\"contractType\" IN ('blanket_po', 'volume_discount', 'annual', 'fixed_price', 'other')",
    name="ck_contracts_contract_type",
),
```

The inline comment documents four display-style values, two of which
(`"Long-term Agreement"`, `"NDA"`) aren't in the CHECK's allow-list at all,
and the two that overlap use different casing (`"Blanket PO"` vs
`'blanket_po'`). A developer following the comment (the only "spec" for this
free-text `Column(String)` — `app/schemas/contract.py`'s `contractType` is an
unconstrained `Optional[str]`) will send a value the DB CHECK rejects,
producing a raw 500 IntegrityError instead of a validation error. Confirmed
via grep that the only place in the codebase that actually sets this field
(`backend/app/tests/test_contract.py:28`) uses the CHECK-compliant
`"blanket_po"`, not the value the model's own comment advertises — i.e. the
comment is simply stale/wrong.

## Finding 3 — MEDIUM — dead schema modules whose fields don't match their ORM models

Several files under `backend/app/schemas/` are never imported by any FastAPI
endpoint or by `app/schemas/__init__.py` (verified with
`grep -r "from app.schemas\."` across `backend/app` — see file-by-file
breakdown below). Each corresponding endpoint instead defines its own local
Pydantic model (correctly shaped to the ORM model), so today these dead
files cause no runtime failures — but they are exactly the kind of
"fields in model absent from schema and vice versa" drift the task asked to
watch for, and would break immediately if anyone imported them believing
they were the real, wired-up schema (e.g. `from app.schemas.project import
ProjectCreate` instead of the local class in `endpoints/projects.py`):

- `backend/app/schemas/document.py:7-14` (`DocumentBase`) declares
  `name: str` (required) and `description`. `app/models/document.py`'s
  `Document` model has neither column — it has `filename`/`originalName`
  instead. `DocumentResponse(from_attributes=True)` against a real `Document`
  row would raise a Pydantic validation error (missing required `name`);
  `DocumentCreate(**dict)` fed into `Document(**dict)` would raise
  `TypeError: 'name' is an invalid keyword argument`.

- `backend/app/schemas/price_history.py:7-13` (`PriceHistoryBase`) declares
  `vendor: str` (required) and `quantity: Optional[int]`.
  `app/models/price_history.py`'s `PriceHistory` model has neither — it has
  `vendorId` (nullable FK) and no quantity column at all. The real, wired-up
  schema lives inline in `backend/app/api/endpoints/price_history.py:19-26`
  and correctly uses `vendorId`.

- `backend/app/schemas/project.py:11` (`ProjectBase.status`) defaults to
  `"active"`, but `app/models/project.py`'s own CHECK constraint
  (`ck_projects_status`, line 30-33) only allows
  `'Draft','Review','Released','Deprecated','Archived','Completed','Cancelled'`
  — `"active"` isn't one of them, so `ProjectCreate()` with no status
  supplied would violate the DB CHECK on insert. The real, wired-up schema in
  `backend/app/api/endpoints/projects.py:23` correctly defaults to
  `"Released"`.

Confirmed dead via:
```
grep -rn "from app\.schemas\." backend/app          # only these three files never appear
grep -rn "from app\.schemas\.project"  backend/app   # 0 matches
grep -rn "from app\.schemas\.document" backend/app   # 0 matches
grep -rn "from app\.schemas\.price_history" backend/app  # 0 matches
```

## Notes on things checked but NOT flagged (verified fine)

- `User.tenantId` is redundantly re-declared as a plain `Column` even though
  `TenantAwareMixin` already provides it via `declared_attr` — harmless
  (subclass attribute wins, same shape), not a functional bug.
- `AuditLog.tenantId` intentionally overrides the mixin to be
  `nullable=True` / `ondelete="SET NULL"` (audit trail must survive tenant
  deletion) — this is documented/deliberate, and does NOT hit the Finding-1
  pattern because it's nullable.
- `LifecycleDefinition`, `CapaAction`, `RfqHeader`, etc. have `__repr__`
  defined mid-class (before later `Column(...)` assignments) — purely
  stylistic, has no effect on SQLAlchemy mapping since column collection is
  order-independent within the class body.
- Every other `CheckConstraint` string enum in the 75 model files was
  spot-checked against the schema/service code (kanban, deviation, capa,
  fai, make_vs_buy, should_cost, work_order, contracts pricing tiers, etc.);
  only the `contractType` case above showed an actual drift with a
  documented (comment) alternate spec.
- `app/models/bom_item_custom_value.py` is deliberately excluded from
  `app/models/__init__.py` (documented in the file's own docstring, wired in
  via `app.services.bom_service` instead) — not a bug, intentional and
  explained in-file.

Files read: 75 models + 31 schemas = 106 (full, line-by-line).
