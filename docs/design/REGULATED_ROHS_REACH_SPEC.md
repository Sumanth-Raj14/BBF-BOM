# Design Spec â€” RoHS 3 / REACH Substance Compliance for the BOM/PLM Tool

Target repo: `C:\Users\tsuma\Downloads\bom-tool-wt\regulated\{backend,frontend}`. Alembic head at authoring time = **`041_part11_esignatures`**. Local-first: everything below works fully offline; substance reference lists are seeded/imported from local files, never fetched from ECHA at runtime.

---

## 1. Scope & Goals

**Ship in this build**
- Two regulations end-to-end: **`ROHS3`** (10 substances, homogeneous-material basis) and **`REACH_SVHC`** (Candidate List, per-article 0.1% basis, O5A-correct).
- Structured composition replacing `Part.material` free-text (`part.py:94`): Part â†’ homogeneous material â†’ substance, plus a supplier **declaration/provenance** record (IPC-1752A Class C summary and Class D FMD).
- **RoHS exemptions** (Annex III/IV) with time/category/application validity, resolved **in end-product context** (not on the shared part).
- A **deterministic evaluator** (per-part, per-regulation) and a **multi-level BOM status rollup** over the existing closure table, plus a **REACH Art 33 obligation set** that unions (never dilutes) up the tree.
- Persisted, version-stamped `ComplianceEvaluation` cache with invalidation wired into `_invalidate_bom_caches` **and** structural closure-edit paths.
- **Global** regulatory reference data (RoHS-10 + SVHC snapshot + Annex III/IV exemptions), bundled and seeded once, versioned â€” shared across all tenants, never duplicated per tenant.
- A **cold-start backfill** in migration 043 plus a bulk composition importer so day-one baselines are triaged rather than a wall of gray.
- UI: Part drawer "Compliance" tab, BOM "Compliance" rollup view tab, real (de-mocked) data in the existing `ComplianceScreen`, declaration entry, e-signed declaration approval â€” all with i18n keys and locale-aware formatting.

**Explicitly deferred**
- **User CSV list import â†’ new `RegulationVersion`** machinery (`set-current` flip + lazy re-eval cascade). First ship is **bundled-seed only**; enum values and the `source`/`version_label`/`entry_count` columns are reserved so the follow-on is additive (see Â§10.10).
- `REACH_ANNEX_XVII` (per-use/per-product restriction set) and **SCIP notification file export** (dossier generation). Data model reserves the enum values; no evaluator/export UI this build.
- Conflict minerals / 3TG (existing `ComplianceScreen` column stays cosmetic, labeled "coming soon" â€” no faked data).
- Per-BOM-usage material overrides (Part-anchored composition only; the rare "material varies by assembly" case).
- IPC-1752A XML auto-parse ingestion (manual/CSV composition entry only this build; XML deferred).
- Automatic list-refresh from the internet (local-first, no runtime network).

---

## 2. Data Model

**Two tiers.** Regulatory *reference/master data* is **global** (system-owned, seeded once, shared by all tenants) and does **not** subclass `TenantAwareMixin`. Tenant-owned *composition, declarations, claims, evaluations* subclass **`TenantAwareMixin`** (`app/models/mixins.py:5-14`, injects `tenantId FKâ†’tenants.id ON DELETE CASCADE, index, NOT NULL`). This split is the P1 fix: a global regulatory fact (RoHS-10, ~253 SVHC, Annex III/IV) is stored once, seedable inside a migration with no tenant in context, and every tenant â€” including those created after 042 â€” sees it with zero drift.

All new models are **imported in `app/models/__init__.py`** so `register_tenant_listeners()` (`app/core/tenant_events.py:19-31`) sees the tenant-aware ones via `__subclasses__()`. Business keys on tenant-aware tables use `UniqueConstraint("tenantId", <keyâ€¦>, name="uq_<table>_tenant_<col>")` (precedent: `035_tenant_scoped_unique_keys.py`); global tables drop the `tenantId` prefix. Money = `Numeric(18,4)`; qty/mass = `Numeric(10,4)`; **ppm = `Numeric(12,4)`** (documented deviation â€” `Numeric(10,4)` maxes at 999,999.9999 and cannot hold 1,000,000 ppm = 100%).

**Nullable-key uniqueness (P2 fix).** Postgres and SQLite treat NULL as distinct, so any `UniqueConstraint` containing a nullable column does not enforce uniqueness. Every such key below is instead a **partial unique index** (`WHERE <col> IS NOT NULL` / `WHERE <col> IS NULL` / `WHERE is_current`) or uses a COALESCE sentinel. Both engines support partial indexes.

### 2.1 Columns added to existing `parts` (`app/models/part.py`)
| column | type | notes |
|---|---|---|
| `is_article` | `Boolean` | REACH article identity (leaf physical component). Assemblies/phantoms = False. **No blanket `default=True`** â€” set explicitly in the 043 backfill by `part_kind` so existing assemblies are not mis-flagged (P4). New rows default True only for leaf/purchased kinds. |
| `eee_category` | `SmallInteger, nullable` | RoHS category 1â€“11 of the **finished product**. Meaningful/required on top-level assemblies; leaf/shared parts leave it NULL and **inherit the end-product category during rollup** (P3). |
| `part_kind` | `String` (enum-checked) | `PURCHASED/MANUFACTURED/ASSEMBLY/RAW_MATERIAL/PHANTOM`. **Add only after verifying** no existing Part type/kind column already carries this (P13, Â§10). |

`Part.material` (free-text, `part.py:94`) is retained but demoted to a display hint; structured composition supersedes it. `Part.weight` (Float grams, `part.py:95`) is the fallback article/part mass when no material breakdown exists, and the reconciliation target for Â§2.3.

### 2.2 Reference / master data â€” **global** (migration 042)

**`Substance`** â€” `substances`
| field | type |
|---|---|
| `id` PK | Integer |
| `cas_number` | String, index |
| `ec_number` | String, nullable |
| `name` | String |
| `substance_group_id` | FKâ†’`substance_groups.id`, nullable |
| uq | `uq_substances_cas (cas_number)` |

**`SubstanceGroup`** â€” `substance_groups` (PBB, PBDE, the four-phthalate family, "lead compounds"; scope frozen to these per Â§10.8 â€” no open-ended "metal-compound SVHC families")
`id, code (String), name` Â· uq `(code)`. Matching resolves group membership, not exact CAS only.

**`RegulationVersion`** â€” `regulation_versions`
| field | type | notes |
|---|---|---|
| `id` | | |
| `regulation_code` | String | `ROHS3/REACH_SVHC/REACH_ANNEX_XVII/SCIP` |
| `version_label` | String | e.g. `SVHC-2026.1` |
| `effective_date` | Date | |
| `source` | String | `BUNDLED` / `IMPORT:<filename>` (import path reserved, deferred Â§10.10) |
| `entry_count` | Integer | audit; never hard-coded in logic |
| `is_current` | Boolean | **partial unique index `WHERE is_current` on `(regulation_code)`** â†’ at most one current per code |
| uq | | `(regulation_code, version_label)` |

**`RestrictedSubstanceEntry`** â€” `restricted_substance_entries`
| field | type | notes |
|---|---|---|
| `id` | | |
| `regulation_version_id` | FKâ†’regulation_versions | |
| `substance_id` | FKâ†’substances, nullable | exactly one of substance/group required |
| `substance_group_id` | FKâ†’substance_groups, nullable | |
| `threshold_ppm` | `Numeric(12,4)` | RoHS 1000 (0.1%), Cd 100 (0.01%), SVHC 1000 |
| `threshold_basis` | String | **`HOMOGENEOUS_MATERIAL`** (RoHS) / **`ARTICLE`** (REACH/SCIP) / `MIXTURE` / `PRODUCT` |
| `applicability` | Text/JSON | Annex XVII per-use conditions (unused this build) |
| CHECK | | exactly one of `substance_id`, `substance_group_id` is non-null |
| uq | | **two partial unique indexes**: `(regulation_version_id, substance_id) WHERE substance_id IS NOT NULL` and `(regulation_version_id, substance_group_id) WHERE substance_group_id IS NOT NULL` |

**`RohsExemption`** â€” `rohs_exemptions`
`id, code (e.g. "6(c)"), annex (ANNEX_III/ANNEX_IV), substance_id/substance_group_id (nullable), application_scope Text, applicable_eee_categories (JSON int[]), valid_until Date (fallback), category_validity (JSON {category:valid_until} nullable), status (ACTIVE/EXPIRED/RENEWAL_PENDING)` Â· uq `(code)`.
Per-category differentiated expiry (P16): `category_validity` overrides the scalar `valid_until` per EEE category; a child table `rohs_exemption_validities(exemption_id, eee_category, valid_until)` is the normalized alternative if the map proves unwieldy.

### 2.3 Composition + provenance â€” **tenant-owned** (migration 043)

**`PartMaterial`** (homogeneous material â€” the RoHS denominator) â€” `part_materials`
| field | type | notes |
|---|---|---|
| `id, tenantId` | | |
| `part_id` | FKâ†’`parts.id` | |
| `name, material_class` | String | |
| `mass_g` | `Numeric(10,4), nullable` | grams within the part |
| `mass_fraction` | `Numeric(10,4), nullable` | share of part mass |
| CHECK | | at least one of `mass_g` / `mass_fraction` present |
| uq | | `(tenantId, part_id, name)` |

**`PartMaterialSubstance`** (leaf composition) â€” `part_material_substances`
| field | type | notes |
|---|---|---|
| `id, tenantId` | | |
| `part_material_id` | FKâ†’part_materials | |
| `substance_id` | FKâ†’substances | |
| `concentration_ppm` | `Numeric(12,4)` | **within the homogeneous material** |
| `mass_g` | `Numeric(10,4), nullable` | |
| `source_declaration_id` | FKâ†’substance_declarations, nullable | provenance |
| uq | | `(tenantId, part_material_id, substance_id)` |

**Composition invariants (P8):**
1. Substances within one `PartMaterial` sum â‰ˆ 100% (tolerance band; flag "unaccounted mass").
2. **Article-mass reconciliation:** `Î£ PartMaterial.mass_g` over a part â‰ˆ `Part.weight` within tolerance; violation flags the article denominator as unverified and forces REACH self-status to `UNKNOWN` rather than silently mis-computing F2.
3. **Fraction resolution:** when a material supplies only `mass_fraction`, its `mass_g` is resolved as `mass_fraction Ã— Part.weight`; if `Part.weight` is absent, the article denominator is unverified â†’ `UNKNOWN`.

**`SubstanceDeclaration`** (IPC-1752A) â€” `substance_declarations`
| field | type | notes |
|---|---|---|
| `id, tenantId` | | |
| `part_id` | FKâ†’parts | |
| `supplier_id` | FKâ†’**suppliers**, nullable | **verify table name `suppliers` vs `vendors` before wiring** (P13, Â§10) |
| `standard` | String | `IPC_1752A/IPC_1754/IEC_62474/MANUFACTURER_STATEMENT/PDF_UNSTRUCTURED` |
| `disclosure_class` | String | `CLASS_Aâ€¦CLASS_F` (C=summary, D=FMD) |
| `data_fidelity` | String | `COMPUTED_FROM_FMD/ASSERTED_FROM_SUMMARY/NO_DATA` |
| `declared_regulations` | JSON | codes the doc speaks to |
| `signing_authority, signed_date, valid_from, valid_until` | String/Date | |
| `revision_of_part` | String | |
| `assessed_regulation_version_id` | FKâ†’regulation_versions, nullable | staleness anchor |
| `document_uri` | String | **local file store path** (Â§5, Â§10.6), not cloud |
| `content_hash` | String | **SHA-256 computed server-side on ingest** (P10) |
| `status` | String | `RECEIVED/VALIDATED/REJECTED/EXPIRED/SUPERSEDED` |
| `approved_by, approved_at` | FK/DateTime, nullable | set on e-signed approval |
| uq | | `(tenantId, part_id, content_hash)` |

**`ExemptionClaim`** â€” `exemption_claims`
`id, tenantId, part_id FK, part_material_id FK (nullable), exemption_id FKâ†’rohs_exemptions, substance_id FK (nullable), substance_group_id FK (nullable), justification Text, source_declaration_id FK (nullable)`.
Group-aware matching (P16): a claim may reference a substance **or** a group; claim resolution matches the offending substance against the claim's substance **or** its group membership. uq: partial indexes on `(tenantId, part_id, exemption_id, substance_id) WHERE substance_id IS NOT NULL` and `(tenantId, part_id, exemption_id, substance_group_id) WHERE substance_group_id IS NOT NULL`.

### 2.4 Evaluation / rollup persistence â€” **tenant-owned** (migration 044)

**`ComplianceEvaluation`** â€” `compliance_evaluations`
| field | type | notes |
|---|---|---|
| `id, tenantId` | | |
| `part_id` | FKâ†’parts | |
| `regulation_version_id` | FKâ†’regulation_versions | version-stamped for reproducibility |
| `bom_id` | FKâ†’boms, nullable | null = context-free SELF; set for a ROLLUP within a specific BOM |
| `bom_rev` | String, nullable | as-of BOM revision |
| `status` | String | see Â§4 lattice |
| `basis` | String | `SELF` / `ROLLUP` |
| `exceedance` | Boolean | raw RoHS/REACH threshold breach recorded at SELF **before** any exemption resolution (P3) |
| `data_fidelity` | String | `COMPUTED_FROM_FMD/ASSERTED_FROM_SUMMARY/NO_DATA` |
| `driving_child_part_id` | FKâ†’parts, nullable | worst child (drill-down) |
| `driving_substance_id` | FKâ†’substances, nullable | offending substance |
| `applied_exemption_id` | FKâ†’rohs_exemptions, nullable | set only on ROLLUP rows (exemptions resolve in end-product context) |
| `evaluated_at` | DateTime | |
| `is_stale` | Boolean | marked by structural edits / version bump pending lazy recompute (Â§4.5) |
| uq | | **partial indexes**: SELF rows `(tenantId, part_id, regulation_version_id) WHERE basis='SELF' AND bom_id IS NULL`; ROLLUP rows `(tenantId, part_id, regulation_version_id, bom_id) WHERE basis='ROLLUP'` |

**`ReachObligation`** (Art 33 / SCIP obligation carried upward) â€” `reach_obligations`
`id, tenantId, part_id FK (carrier â€” parent accumulating), article_part_id FK (offending leaf article), substance_id FK, regulation_version_id FK, bom_id FK (nullable, context), concentration_ppm Numeric(12,4), scip_ref String nullable` Â· uq `(tenantId, part_id, article_part_id, substance_id, regulation_version_id, COALESCE(bom_id,0))`.

### 2.5 Relationships to `Part` / `BOMItem`
- All composition, declaration, exemption-claim and evaluation rows anchor to **`Part`** (item master), following the association-table style at `part.py:26-52`. `BOMItem` (`bom_items_master`, `bom.py:55-81`) stays a pure structure/quantity carrier â€” no substance columns.
- Rollup consumes `BOMItem.quantity` (`Numeric(10,4)`, `bom.py:61`) and the self-referential `parent_item_id` (`bom.py:66-68`) only via the closure table; a reused Part appears as multiple `bom_items_master` rows but has **one** SELF evaluation, deduped on `part_id`. **Exemption applicability is NOT baked into that deduped SELF row** â€” it is resolved per-BOM at ROLLUP so the same shared part can be exempt in a cat-8 device and non-compliant in a cat-1 device (P3).
- The existing lightweight `Compliance` named-flag model (`app/models/compliance.py`) and `part_compliance` join are left intact (coarse cert flags); the new substance system is additive and supersedes the green chips in `SpecsTab`.

---

## 3. Migrations (chain after head `041`)

Hand-written `revision`/`down_revision` string constants, `op.create_table`/`op.create_index`, module docstrings â€” matching the 001â†’041 linear style.

- **`042_substance_reference_data`** (`Revises: 041_part11_esignatures`): create the **global** tables `substance_groups`, `substances`, `regulation_versions`, `restricted_substance_entries`, `rohs_exemptions` (no `tenantId`, no RLS). Ships a **data step** that seeds the bundled default RoHS-10 entries (Pb/Hg/Cr(VI)/PBB/PBDE/DEHP/BBP/DBP/DIBP @ 1000 ppm; **Cd @ 100 ppm**), the PBB/PBDE/4-phthalate/"lead compounds" groups, the current SVHC Candidate-List snapshot, and the current Annex III/IV exemption set â€” reading from `app/data/reference/*.json` (see Â§7), never a network call. Because these rows are global, the seed runs with **no tenant in context** and stays correct for tenants created later (P1). The seed is written idempotently (upsert on the natural keys) so re-running is safe.
- **`043_part_composition_declarations`** (`Revises: 042`): `ALTER parts` add `is_article`, `eee_category`, `part_kind`; create tenant-owned `part_materials`, `part_material_substances`, `substance_declarations`, `exemption_claims`. **Cold-start backfill data step (P4):** set `is_article=False` for `ASSEMBLY`/`PHANTOM` (True for leaf/purchased), seed `eee_category` on top-level assemblies where derivable, and leave composition empty â€” the resulting all-`UNKNOWN` baseline is intentional and triaged by the bulk importer + dashboard banner (Â§4.5, Â§6, Â§10.4), not shipped as an unexplained wall of gray.
- **`044_compliance_evaluations`** (`Revises: 043`): create tenant-owned `compliance_evaluations`, `reach_obligations`.

**RLS gating â€” exact 040/041 pattern, tenant-owned tables only.** RLS applies solely to the tenant-owned tables in **043** (`part_materials`, `part_material_substances`, `substance_declarations`, `exemption_claims`) and **044** (`compliance_evaluations`, `reach_obligations`). The **global** 042 tables get **no RLS**. Each RLS migration imports `from app.core.config import settings` at module top. In `upgrade()`, per new tenant-aware table apply the policy **only when** `bind.dialect.name == "postgresql" and settings.ENABLE_RLS` (mirror `041...py:101`); SQLite / other dialects / Postgres-without-flag = **no-op**. Policy body copies 041 verbatim:
```
ENABLE ROW LEVEL SECURITY;  FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "<table>"
  USING ("tenantId" = current_setting('app.current_tenant', true)::int)
```
Because 040's one-time `information_schema` scan cannot see tables created later, **each of these tables needs its own explicit per-table RLS block** (041's `e_signatures` block is the template). `downgrade()` is gated on **dialect only, not the flag** (`040...py:139`, `041...py:121`) and drops the policies + tables.

---

## 4. Rollup Semantics

### 4.1 Status lattice (per regulation)
```
NON_COMPLIANT  â‰»  UNKNOWN  â‰»  COMPLIANT_WITH_EXEMPTION  â‰»  COMPLIANT
NOT_APPLICABLE = identity (skipped; parent is N/A only if part + all descendants are N/A)
```
`worst(a,b)` returns the higher element. `UNKNOWN` outranks `COMPLIANT_WITH_EXEMPTION` (unassessed risk dominates a known-and-managed exemption). `NON_COMPLIANT` is absorbing. **Status is per regulation** â€” a part can be `COMPLIANT` for RoHS and `UNKNOWN` for REACH; never collapse to one global flag.

### 4.2 Self-status (F-evaluators, `basis=SELF`)

**NOT_APPLICABLE derivation (P5) â€” the evaluators actually emit it:**
- **RoHS N/A** when the part is out of EEE scope (non-EEE part / raw bulk material / phantom); such parts are skipped in the RoHS lattice and feed the "all-descendants-N/A" parent rule.
- **REACH N/A** when `is_article=False` (bulk substance/mixture, not an article).

**RoHS (F1, per homogeneous material):** for each `PartMaterial` hm and each RoHS `RestrictedSubstanceEntry`, `conc = concentration_ppm of substance within hm` (denominator = **hm**, never the part or assembly). If `conc > threshold_ppm` â†’ set `exceedance=True`, record `driving_substance_id`. **At SELF the raw status is `NON_COMPLIANT`** (context-free); the exemption downgrade is deferred to ROLLUP (Â§4.3) because RoHS exemptions depend on the finished-product EEE category. No composition / expired declaration â†’ `UNKNOWN`.

**REACH (F2, per article):** the article denominator is **the part's own reconciled mass** (`is_article=True`; Â§2.3 invariant 2/3). For each SVHC entry, `conc = mass(SVHC within article) / mass(article)`; `conc > 0.1%` â†’ `NON_COMPLIANT` for the article **and** emits a `ReachObligation(article_part_id=self, substance)`. No per-part SVHC exemptions exist. Unverified denominator â†’ `UNKNOWN`.

**Data fidelity:** Class D FMD â†’ `COMPUTED_FROM_FMD` (recomputable against any list version). Class C summary â†’ `ASSERTED_FROM_SUMMARY`; when the current SVHC `regulation_version` adds a substance the summary never spoke to, that part's REACH self-status is re-flagged **`UNKNOWN`** (summary greens go stale; FMD greens auto-recompute).

### 4.3 BOM rollup (`basis=ROLLUP`) â€” reuses the closure table, folds STATUS not mass, resolves exemptions in context
Implemented as a new `bom_service` method modeled on `get_cost_rollup` (`bom_service.py:838-886`) but folding the lattice instead of summing cost:
```
parent_status(P, reg) = worst( context_status(P, reg),
                                WORST over descendants D of context_status(D, reg) )
```
- **Exemption resolution happens here, in end-product context (P3).** The finished product's `eee_category` (required on the top assembly, **inherited down the branch**) is the context. For any descendant with a RoHS `exceedance`, downgrade `NON_COMPLIANT â†’ COMPLIANT_WITH_EXEMPTION` iff a matching `ExemptionClaim` exists (substance **or group** membership âˆ§ inherited `eee_category âˆˆ exemption.applicable_eee_categories` âˆ§ application scope âˆ§ `today â‰¤` per-category expiry from `category_validity` else `valid_until`). A leaf's own `eee_category=NULL` no longer silently fails the category test â€” the inherited product category is used. The resolved status is written on the per-BOM ROLLUP row, so the same part legitimately differs across BOMs.
- **`RENEWAL_PENDING` stays covered (P15):** an exemption whose date has lapsed but whose `status=RENEWAL_PENDING` resolves to `COMPLIANT_WITH_EXEMPTION` flagged "pending" (a timely renewal keeps the exemption valid pending Commission decision), configurable per Â§10.5.
- Walk levels via `_compute_levels_and_effective_qty(items)` (`bom_service.py:749-787`) or read descendants directly from **`BomClosure`** (`bom_closures`, `bom_closure.py`), scoping **every** query by **both `tenantId` AND `bom_id`** (`bom_closure.py:10-17`). Closure is a per-BOM DAG-free structure â†’ **cycle-safe by construction**; **dedupe self-status on `part_id`** so a reused child is evaluated once.
- **Batch load / no N+1 (P11):** load all items, parts, composition, and matching restricted entries in a **single pass** (mirror `get_cost_rollup`'s single load), and replicate its **`float` cast of `Decimal`** values for arithmetic safety. Exemption claims for the branch are loaded once and matched in memory.
- Absorbing rules: any `NON_COMPLIANT` descendant â‡’ parent `NON_COMPLIANT`; else any `UNKNOWN` descendant â‡’ parent `UNKNOWN` (**absence of data â‰  compliance â€” the key guard**); else any `COMPLIANT_WITH_EXEMPTION` â‡’ parent `COMPLIANT_WITH_EXEMPTION` (exemption provenance bubbles up for the cert). N/A is skipped unless the part and all descendants are N/A.
- Record `driving_child_part_id` / `driving_substance_id` for red-assembly â†’ offending-leaf drill-down.

### 4.4 REACH per-article 0.1% vs additive nuance
The rollup **never sums an SVHC's mass across components and divides by total product mass** (O5A "once an article always an article", ECJ C-106/14). The canonical failure case: a 100 g product with a 0.5 g screw that is 0.2% SVHC â€” the screw's article status is `NON_COMPLIANT` and its Art 33/SCIP obligation propagates, even though 0.001 g / 100 g = 0.001% would read "clear." Therefore REACH rolls up **two independent things**: (1) status via the lattice, and (2) a **`ReachObligation` set that unions upward** â€” a status-compliant parent may still carry N distinct (article, substance) disclosures. The `_compute_levels_and_effective_qty` mass product is used **only** for informational total-mass reporting and where-used impact, and is explicitly **not** a compliance denominator (documented in the method).

### 4.5 Caching & invalidation
Add key `bom:substance_rollup:{bom_id}` to `_invalidate_bom_caches` (`bom_service.py:123-127`). Persisted `ComplianceEvaluation` rows are invalidated (marked `is_stale`, re-evaluated lazily) on:
- child composition change;
- new/validated declaration;
- `regulation_version` bump (`is_current` change) â€” **blast radius bounded (P11):** only FMD-based (`COMPUTED_FROM_FMD`) evaluations are recomputed, on-demand/lazily, never a blocking catalog-wide batch;
- **declaration `valid_until` crossing `today` (P6)** â€” a lapsing declaration must not leave a stale `COMPLIANT`; folded into the same time-based sweep as exemption expiry;
- exemption `valid_until` (or per-category expiry) crossing `today`;
- **structural closure edits (P7):** the `_closure_add` / reparent / remove paths must **purge or mark-stale the `basis=ROLLUP` evaluations for all affected ancestors**, because reparent/add/delete changes rollups with no composition change; the cache-key eviction alone leaves persisted ROLLUP rows stale.

Evaluations are stamped with `regulation_version_id` + `evaluated_at` for reproducibility and staleness detection. Impact query "which assemblies break if substance X becomes restricted" reuses **`get_where_used_via_closure`** (`bom_service.py:663-743`).

---

## 5. API

New router (e.g. `app/api/substance_compliance.py`) mounted cleanly under `/compliance`, plus additions to the frontend `api.compliance` object.

**Doubled-prefix correction (P9).** The existing `api.compliance` client hits `/compliance/compliance/â€¦` (api.js:1004-1006). You **cannot** keep the double for old calls and clean paths for new calls on one client object. **Fix the client base once** so `api.compliance.*` resolves to `/compliance/<resource>`; this necessarily touches the existing endpoints/server mounts that relied on the double â€” audit and re-point them in the same change. All new and reused routes are `/compliance/<resource>` after the fix.

| Method / path | Purpose |
|---|---|
| `GET/POST /compliance/substances` | substance master CRUD (global) |
| `GET/POST /compliance/regulation-versions` Â· `POST â€¦/{id}/set-current` | version management (import path deferred, Â§10.10) |
| `GET/POST /compliance/restricted-entries` | restriction rules |
| `GET/POST /compliance/exemptions` | Annex III/IV exemption reference |
| `POST /compliance/reference/seed` | idempotent load of bundled default snapshot (also invoked at tenant creation â€” no-op for global data already present) |
| `GET/POST/PUT/DELETE /compliance/parts/{part_id}/materials` and `/part-materials/{id}/substances` | composition CRUD |
| `GET/POST/PUT/DELETE /compliance/declarations` (list by `part_id`) | declaration CRUD (JSON) |
| **`POST /compliance/declarations/{id}/document`** (multipart) | **declaration document upload (P10)** â†’ local file store; **server computes SHA-256** into `content_hash`, sets `document_uri` |
| **`POST /compliance/declarations/{id}/approve`** | **e-signed** VALIDATED transition (see below) |
| `POST /compliance/parts/bulk-composition-import` (multipart CSV) | **cold-start bulk composition importer (P4)** |
| `GET/POST/DELETE /compliance/parts/{part_id}/exemption-claims` | claims |
| `GET /compliance/parts/{part_id}/status` | per-part per-regulation `ComplianceEvaluation` |
| `GET /compliance/boms/{bom_id}/rollup` | per-item worst-case status + fidelity + driving refs |
| `GET /compliance/boms/{bom_id}/obligations` | unioned Art 33 / SCIP obligation set |
| `POST /compliance/boms/{bom_id}/evaluate` | recompute + cache |
| `GET /compliance/substances/{id}/impact` | where-used via closure |
| `GET /compliance/dashboard` | KPI counts |

*(User CSV list-import â†’ new-`RegulationVersion` is deferred; the `set-current` flip is retained only for switching between bundled/seeded versions â€” Â§10.10.)*

**E-sign / audit (part11) â€” applies to declaration approval only.** The `POST â€¦/declarations/{id}/approve` endpoint reuses `part11_service.sign_action(db, current_user, password, action="substance_declaration.approve", entity_type="substance_declaration", entity_id=<id>, meaning=<attestation>, content=<declaration snapshot>)` (`part11_service.py:45-98`) **verbatim**, following the `eco_service.perform_eco_action` consumer pattern (`eco_service.py:186-302`): re-authenticate **before** any mutation, enforce approver role via `user_has_any_role`, forbid self-approval, write one `ESignature` + one `AuditLog`, then flip `statusâ†’VALIDATED` and set `approved_by/approved_at` in a **single atomic commit**. Composition/exemption CRUD, document upload, and bulk import are **not** e-signed but **do write an `AuditLog`** row (provenance). No new e-sign infrastructure.

---

## 6. Frontend

Design system from `src/components/ui/` (`window.UI` bridge): `ScreenHeader, ContentFrame, Tabs/TabPanel, DataTable (dense), StatusPill/Badge (tones neutral|accent|success|warning|danger|info), Card, Button, EmptyState, Spinner/Skeleton, Modal, toast`.

**Status tone map â€” a new parallel, status-keyed map (P12)** (not an extension of the existing `valid/expiring/expired/missing` map):
```
COMPLIANCE_TONE = {
  COMPLIANT:               "success",
  COMPLIANT_WITH_EXEMPTION:"warning",
  UNKNOWN:                 "info",     // distinct + attention-getting, ranks ABOVE exemption
  NON_COMPLIANT:           "danger",
  NOT_APPLICABLE:          "neutral"
}
```
`UNKNOWN` must **not** read as benign gray â€” it outranks exemption in the lattice ("absence of data â‰  compliance"). Render it with the `info` tone plus a distinct treatment (outlined/striped pill) and place it above `COMPLIANT_WITH_EXEMPTION` in every legend so its severity ordering is visually honest.

- **Part "Compliance" tab** â€” `src/root/detail-drawer.jsx` (`window.Drawer`). (a) push `{ value:"compliance", label: __t("detailDrawer.compliance") }` into the `items` array (drawer tabs, ~lines 123-144); (b) add a parallel `<TabPanel id={DRAWER_TABS_ID} value="compliance" active={tab==="compliance"}>`; (c) implement local `function ComplianceTab({row})` in the existing tab-fn convention (`Card` + `dl.kv-grid` + `section-title` + `StatusPill`), driven by `api.compliance.parts.status(row.pn||row.id)`, showing per-regulation status, `data_fidelity`, per-substance concentrations, exemptions relied on, declaration provenance. Supersedes the hardcoded green chips in `SpecsTab` (lines 406-419).
- **BOM compliance rollup view** (recommended over a grid column) â€” add a `compliance` tab button to the tab strip in `src/screens/BomEditorScreen.jsx` (`window.BomShell`, tabs at lines 285-326) and render `bomTab==="compliance" && <window.ComplianceRollupView data={data}/>`. Create `src/components/ComplianceRollupView.jsx` cloned from **`src/components/CostRollupView.jsx`** (imports `DataTable, EmptyState` from `./ui`; `useEffect` â†’ `api.compliance` call with `.catch(console.warn)`; `loading` `role="status"`; `<DataTable dense zebra>`; ends `window.ComplianceRollupView = ComplianceRollupView`), calling `api.compliance.boms.rollup(top.project_id||top.bomId||1)`, worst-case per assembly row + a REACH obligation count column with drill-down to `driving_child`.
  - *If a grid column is also wanted:* in `src/root/bom-editor.jsx` add one `<col className="col-compliance"/>`, one `<th>` after Status (~line 735), one `<td>` (~line 910) rendering a `StatusPill`, and **bump every `colSpan={16}` â†’ `17`**; compute assembly rollup mirroring `rollupExt(row)` (line 773).
- **Compliance dashboard** â€” extend the existing **`src/components/advanced/ComplianceScreen.jsx`** (already routed `/compliance`, already in the **Quality** nav group). **Fix the honesty gap:** remove the hardcoded `rohs:"valid"/reach:"valid"` (lines 42-50) and the 3 mock fallback rows (52-80); drive KPIs and the parts `DataTable` from `api.compliance.dashboard()` / `api.compliance.parts.status`. Add a per-regulation column set (RoHS status, REACH status, fidelity, cert expiry), honest empty/loading/error states, and a **cold-start banner (P4)** explaining an all-`UNKNOWN` baseline and linking to the bulk composition importer. Leave the 3TG/conflict-minerals column cosmetic, labeled "coming soon."
- **Declaration entry** â€” a `Modal` opened from the drawer Compliance tab: standard, disclosure class, validity dates, **document upload â†’ `POST /compliance/declarations/{id}/document`** (local store; hash computed server-side), then optional **approve** action that prompts for password and calls the e-signed endpoint (truthful optimistic/rollback toasts per `BomEditor.addItem` convention, lines 302-351).
- **API client** â€” add to `api.compliance` in `frontend/api.js` (same `apiRequest` style, corrected base per P9): `substances`, `regulationVersions`, `restrictedEntries`, `exemptions`, `reference.seed`, `parts.{materials,substances,status,exemptionClaims,bulkCompositionImport}`, `declarations.{list,create,get,update,delete,uploadDocument,approve}`, `boms.{rollup,obligations,evaluate}`, `substances.impact`.
- **i18n (P14)** â€” every new surface gets translation keys, not just the drawer tab label: RollupView column headers, dashboard KPI labels, modal field labels, status labels (`COMPLIANT/UNKNOWN/â€¦`), and toasts. Concentrations (ppm/%), masses, and dates use locale-aware number/date formatting.
- **Nav slot** â€” keep in **Quality â†’ `compliance`** (`src/components/NavRail.jsx:44`, already routed in `App.jsx:469-472`). No new route needed. (If greater prominence is later wanted, promote `compliance` into `PRIMARY` â€” requires the three lockstep edits: NavRail + `<Route>` + `LazyScreens` `createLazyScreen`.)

---

## 7. Reference Data (local-first, global, versioned)

- **Bundled default dataset** shipped in-repo under `backend/app/data/reference/`: `rohs3.json` (10 substances + thresholds, Cd @ 100 ppm), `svhc_candidate_list.json` (current snapshot), `rohs_exemptions.json` (Annex III/IV + `valid_until` + per-category `category_validity`), `substance_groups.json` (PBB, PBDE, 4-phthalate family, "lead compounds"). Migration 042's idempotent data step loads these as **global** rows into `regulation_versions` (`source="BUNDLED"`) + child tables. **No network access.** Because the rows are global, a tenant created after 042 already sees them; `POST /compliance/reference/seed` at tenant creation is a safe no-op for data already present (P1).
- **User CSV import â†’ new `RegulationVersion` is deferred** to a follow-on (P17, Â§10.10): bundled-seed only this build. The columns (`source`, `version_label`, `entry_count`) and the `set-current` flip are reserved so the follow-on is purely additive.
- **Versioning discipline:** the SVHC list grows ~2Ã—/yr (247â†’253 over 2025â†’early-2026) â€” the count is **stored per version, never hard-coded in logic**. Evaluations reference `regulation_version_id` so historical results stay reproducible and staleness is detectable. Summary-based (Class C) statuses are auto-re-flagged `UNKNOWN` when a newer current version adds substances; FMD-based statuses recompute automatically (bounded, on-demand â€” Â§4.5).

---

## 8. Test Plan

Per-file fresh-DB SQLite pattern (each test file creates its own engine/tables). Because RLS is a **no-op on SQLite**, tenant isolation is tested at two layers separately.

- **Threshold correctness:** Pb at 999/1000/1001 ppm within an HM (pass/edge/fail); **Cd at 99/100/101 ppm** (the 0.01% exception); SVHC at 0.1% per article.
- **RoHS denominator:** the 5 kg part with a 1 mg lead-rich plating layer that is >0.1% *within itself* must FAIL (dilution across the part is irrelevant).
- **REACH O5A non-dilution:** 100 g product + 0.5 g screw @ 0.2% SVHC â†’ screw `NON_COMPLIANT` + one `ReachObligation` propagated; assert product-level 0.001% is **never** computed.
- **Article-mass reconciliation (P8):** Î£ material `mass_g` â‰  `Part.weight` beyond tolerance â†’ REACH self-status forced `UNKNOWN`; `mass_fraction`-only material resolves against `Part.weight`; missing `Part.weight` â†’ `UNKNOWN`.
- **Obligation union:** parent whose every article is individually â‰¤ threshold but which carries N distinct descendant obligations â†’ status may be `COMPLIANT` while `boms/{id}/obligations` returns N rows.
- **Context-dependent exemption (P3):** one shared part with a valid cat-8 exemption claim; assert it rolls up `COMPLIANT_WITH_EXEMPTION` under a cat-8 top assembly and `NON_COMPLIANT` under a cat-1 top assembly; leaf `eee_category=NULL` inherits the top's category (does not silently fail the category test).
- **Exemption expiry & renewal:** exceedance + valid claim â†’ `COMPLIANT_WITH_EXEMPTION`; advance clock past per-category expiry â†’ `NON_COMPLIANT`; `RENEWAL_PENDING` past date â†’ stays `COMPLIANT_WITH_EXEMPTION` (pending) (P15); category-mismatch claim does not apply; **group-based claim matches a congener** (P16).
- **NOT_APPLICABLE derivation (P5):** non-EEE / raw-bulk part â†’ RoHS N/A; `is_article=False` â†’ REACH N/A; parent is N/A only when part + all descendants N/A.
- **Unknown propagation:** a leaf with no declaration â†’ `UNKNOWN`; assert every ancestor rolls up `UNKNOWN` even amid otherwise-compliant siblings; assert `UNKNOWN` outranks `COMPLIANT_WITH_EXEMPTION`.
- **Rollup / lattice:** worst-child selection at each level; `driving_child_part_id`/`driving_substance_id` populated; DAG dedupe (reused child evaluated once); cycle-safety via closure; single-pass batch load (no N+1) (P11).
- **Data fidelity staleness:** Class C green â†’ new SVHC version â†’ re-flagged `UNKNOWN`; Class D FMD â†’ recomputed automatically; version bump touches **only** FMD evaluations, lazily (P11).
- **Nullable-key uniqueness (P2):** insert two SELF `ComplianceEvaluation` rows (bom_id NULL) for the same part/version â†’ second rejected by the partial unique index; same for `RestrictedSubstanceEntry` (substance vs group) and `RohsExemption`; second `is_current` version per code rejected.
- **Cold-start backfill (P4):** after 043, existing assemblies/phantoms have `is_article=False`; bulk composition import populates materials and flips affected baselines off `UNKNOWN`.
- **Invalidation:** declaration composition/version/exemption-expiry **and declaration `valid_until` expiry (P6)** each invalidate `bom:substance_rollup:{bom_id}` and produce a fresh `ComplianceEvaluation`; **structural closure edit (add/reparent/remove) marks ancestor ROLLUP rows stale (P7)** even with no composition change.
- **Document ingest (P10):** upload sets `content_hash` = server-computed SHA-256 of the stored bytes; tampered/duplicate content detected via `uq(tenantId, part_id, content_hash)`.
- **Tenant isolation (SQLite):** two tenants' composition/declarations invisible across the `do_orm_execute` filter; cross-tenant update/delete raises `PermissionError` (`tenant_events.py:72-95`); superuser (`get_tenant_id()==None`) path with explicit `tenant_id` on INSERT; **global reference data visible to both tenants** without a tenant filter.
- **RLS gating:** assert 043/044 `upgrade()` is a **no-op on SQLite** and under Postgres-without-`ENABLE_RLS`; assert `CREATE POLICY tenant_isolation` present per new **tenant-owned** table when `postgresql AND ENABLE_RLS`; assert **042 global tables get no policy**; assert `downgrade()` drops policies on Postgres regardless of flag.

---

## 9. Build Sequence & Rough Effort

Backend-first; migrations chain strictly after the current head; **rebase 042â†’044 onto whatever head exists at merge time** if another migration lands first (WS3 frontend work is in progress per memory â€” no migration conflict expected, but re-point `down_revision` if it does).

1. **042 + global reference models + idempotent seeder + bundled JSON** (~2 d). No RLS (global tables).
2. **043 + composition/declaration models + cold-start backfill + bulk importer + basic CRUD services** (~3â€“4 d). Per-table RLS blocks; `is_article`/`eee_category` backfill.
3. **Evaluator service (F1/F2, N/A derivation, mass reconciliation) + 044 + `ComplianceEvaluation`/`ReachObligation`** (~3â€“4 d) â€” the regulatory core; heaviest test coverage.
4. **Rollup service over closure (in-context exemption resolution, single-pass batch load) + cache-key wiring + structural-edit stale-marking in `_invalidate_bom_caches`/`_closure_*`** (~3 d).
5. **API router (corrected client base, doc-upload endpoint) + e-signed approval (part11 reuse) + audit** (~2 d).
6. **Frontend, sequential merge with in-flight frontend work** (~4â€“5 d): de-mock `ComplianceScreen` + cold-start banner, Drawer Compliance tab, `ComplianceRollupView` + BOM tab, declaration Modal + document upload, `api.compliance` client additions + base fix, i18n keys. Because the frontend uses the `window.*` SHIM + `LazyScreens` registration, land these as additive files/edits and **merge sequentially** with other frontend branches to avoid `main.jsx`/`globals`/`NavRail` collisions; the `api.js` base-prefix fix (P9) is a coordination point â€” sequence it so no other branch depends on the old doubled path.

Total rough order: **~3 weeks** for ROHS3 + REACH_SVHC end-to-end (deferrals in Â§1 excluded).

---

## 10. Open Product Decisions (with recommended defaults)

1. **FMD depth required?** â€” *Recommend:* accept both fidelities; **require Class D (FMD)** for `MANUFACTURED`/`ASSEMBLY` parts you certify, allow **Class C (summary)** for purchased parts but re-flag their status `UNKNOWN` on SVHC list growth. Track `data_fidelity` on every evaluation.
2. **SCIP export + Annex XVII this build?** â€” *Recommend:* **defer** both; reserve enum values, ship `ROHS3` + `REACH_SVHC` status and the Art 33 obligation list only.
3. **Auto-recompute on list bump?** â€” *Recommend:* mark affected **FMD-only** evaluations stale + surface a banner, recompute **lazily/on-demand**, never a blocking catalog-wide batch (bounds the version-bump blast radius, P11).
4. **Cold-start baseline (P4):** existing parts have no composition â†’ day-one all-`UNKNOWN`. *Recommend:* backfill `is_article`/`eee_category` in 043, ship the bulk composition importer, and surface a dashboard banner explaining the baseline â€” triage explicitly rather than shipping an unexplained wall of gray.
5. **E-sign required for declaration approval? / RENEWAL_PENDING handling?** â€” *Recommend:* **yes**, reuse `part11_service.sign_action`, as a **per-tenant setting** (some orgs won't want 21 CFR Part 11 friction on supplier docs). Treat `RENEWAL_PENDING` as `COMPLIANT_WITH_EXEMPTION` flagged "pending" (a timely renewal keeps the exemption valid pending Commission decision), also per-tenant configurable (P15).
6. **Where do declaration documents live, and does the attachment service exist? (P10)** â€” *Recommend:* **local/on-prem file store** via the existing attachment mechanism, with SHA-256 computed **server-side** on ingest (`document_uri` = local path). **Verify the concrete local file-store service before build**; if none exists, add a minimal on-prem blob store. Cloud object storage optional, never required.
7. **Conflict minerals / 3TG column** â€” *Recommend:* **out of scope**; leave the existing `ComplianceScreen` column cosmetic and label it "coming soon" rather than faking data.
8. **Grouped-substance matching depth** â€” *Recommend:* ship `substance_groups` seeded with **PBB, PBDE, the four-phthalate family, and "lead compounds"** (frozen scope â€” no open-ended "metal-compound SVHC families"); match on exact CAS **and** group membership, on both the restriction-entry side and the **exemption-claim side** (P16).
9. **Existing lightweight `Compliance` flag system** â€” *Recommend:* **keep it** for coarse named cert flags; the new substance system is additive and drives the real per-substance detail (do not migrate/merge the two this build).
10. **User CSV list-import â†’ new `RegulationVersion` this build? (P1/P17)** â€” *Recommend:* **defer** to a follow-on; bundled-seed only. Reserve `source`/`version_label`/`entry_count`/`set-current`. When added, decide import scope: **global** (system-wide list update, matches the global reference tier) is the recommended default; per-tenant custom lists would require a nullable-tenant variant on `regulation_versions` and are not worth the complexity for a first ship.
11. **`supplier_id` vs `vendors`, and `part_kind` vs an existing Part type column (P13)** â€” *Recommend:* **verify the real table name (`suppliers` vs `vendors`) and confirm whether `parts` already carries a type/kind column before adding `part_kind`.** Default: FK to `suppliers`; add `part_kind` only if no existing column suffices, otherwise reuse it and derive `is_article` from it in the 043 backfill.
