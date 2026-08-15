# uom-rollup writeup

## What changed

`backend/app/services/bom_service.py`
- Imported `uom_service`.
- `get_quantity_rollup`: per part number, the first line seen becomes that
  part's anchor unit. A later line in the same literal unit adds directly
  (zero DB cost — the existing single-unit-BOM path, unchanged). A later
  line in a different unit is converted into the anchor via
  `uom_service.try_convert`. If that conversion fails (cross-dimension or an
  unrecognised free-text unit on either side), the line is **not** folded
  into the total — it's recorded in a new `uom_warnings` list
  (`part_number`, `line_unit`, `expected_unit`, `message`) and left out.
  Added `"unit"` (the anchor) to each rollup row and `"uom_warnings"` to the
  response.
- `get_cost_rollup`: a snapshot cost (`unit_cost_snapshot`) is priced per the
  line's own unit, so `cost_uom = item.unit` → identical-unit fast path, no
  behavior change. A part-cost fallback (`part.cost`, no snapshot) is priced
  per `part.uom`, which can legitimately differ from the line's unit — now
  routed through `uom_service.extended_cost(qty, item.unit, unit_cost,
  cost_uom)`, which converts when possible and falls back to the old naive
  `qty * cost` with a warning when it can't. Same truthy `unit_cost_snapshot
  or part.cost` fallback rule as before (0/None snapshot still falls through
  to part.cost) — only the *unit* handling for the part.cost branch changed.
  Added `"uom_warnings"` to the response.

`backend/app/services/uom_service.py`
- Docstring-only fix on `rollup_quantities`: it said bom_service was
  "out of scope, owned elsewhere" — no longer true, updated to explain
  bom_service uses `try_convert`/`extended_cost` per-line instead (per-part
  totals, not `rollup_quantities`'s per-dimension pooled total).

`backend/app/tests/test_bom_uom_rollup.py` (new, 7 tests):
1. `test_mixed_m_and_cm_lines_roll_up_to_correct_total` — 2 M + 150 CM same
   part -> 3.5 (unit "M"), `uom_warnings == []`.
2. `test_cross_dimension_mismatch_never_silently_summed` — M + KG same part:
   KG line excluded from total, one warning recorded, never guessed 1:1.
3. `test_unknown_free_text_uom_mismatch_is_reported_not_guessed` — M +
   unregistered "reels": same refusal behavior.
4. `test_single_unit_bom_quantity_rollup_unchanged` — all-EA BOM, same
   numbers as `test_bom_core_correctness`'s R2 test, `uom_warnings == []`.
5. `test_cost_rollup_converts_part_cost_per_different_uom` — part costed
   per M (4/M), line in 250 CM, no snapshot -> 2.5 * 4 = 10.0 (not 1000).
6. `test_cost_rollup_unresolvable_uom_falls_back_with_warning` — part
   costed per KG, line in EA, no snapshot -> naive fallback 50.0 + warning.
7. `test_cost_rollup_snapshot_used_as_is_no_conversion` — snapshot present
   (part.uom differs) -> snapshot used verbatim, part.cost ignored, no
   warning.

## Design decision (point 3 of the job)

Failure mode chosen: **skip + recorded warning**, not an exception. A
roll-up aggregates many lines; one bad uom on one line must not 500 the
whole BOM view. The bad quantity/cost is excluded from the total (never
guessed as 1:1) and surfaced in `uom_warnings` in the same response, so a
caller/UI can flag it without the total itself being wrong. Documented in
the code comments at both call sites in `bom_service.py`.

## Proof (all run from `backend/`, scratch sqlite dbs, deleted after)

```
TEST_DATABASE_URL=sqlite+aiosqlite:///./scratch_uomrollup1.db python -m pytest \
  app/tests/test_bom_uom_rollup.py app/tests/test_bom_mass_rollup.py \
  app/tests/test_bom_core_correctness.py app/tests/test_bom_closure.py \
  app/tests/test_bom_instance_crud.py app/tests/test_bom_item_media_visibility.py \
  app/tests/test_uom_service.py -q
-> 55 passed

TEST_DATABASE_URL=sqlite+aiosqlite:///./scratch_uomrollup2.db python -m pytest \
  app/tests -k "bom or uom or planning" -q
-> 145 passed
```

Both scratch dbs deleted after the run. No live `bom_db` touched. No git
commands run.

## Files touched

- `backend/app/services/bom_service.py` (edited)
- `backend/app/services/uom_service.py` (docstring-only edit)
- `backend/app/tests/test_bom_uom_rollup.py` (new)
