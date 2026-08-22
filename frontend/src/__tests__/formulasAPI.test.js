import { describe, it, expect } from "vitest";
import { formulasAPI } from "../../api.js";

// partContext must build exactly the variable set the server would build for
// itself in formula_service._entity_numeric_context: the seven numeric Part
// columns that are present, plus the two aliases. Nulls are omitted (not
// coerced to 0) so a formula referencing them gets the server's
// "Unknown variable" 400 instead of a silently wrong number.
describe("formulasAPI.partContext", () => {
  it("maps present numeric fields and adds the aliases", () => {
    const ctx = formulasAPI.partContext({
      id: 1,
      pn: "X",
      name: "widget",
      qty: 4,
      cost: 2.5,
      weight: null,
      freight: 1,
      tax: 0,
      landedCost: 3.5,
      lead: 42,
    });
    expect(ctx).toEqual({
      qty: 4,
      cost: 2.5,
      freight: 1,
      tax: 0,
      landedCost: 3.5,
      lead: 42,
      unit_cost: 2.5,
      landed_cost: 3.5,
    });
  });

  it("omits null/undefined/non-numeric fields and their aliases", () => {
    const ctx = formulasAPI.partContext({ id: 2, qty: 1, cost: null, tax: "n/a" });
    expect(ctx).toEqual({ qty: 1 });
  });

  it("returns an empty context for a missing part", () => {
    expect(formulasAPI.partContext(null)).toEqual({});
  });
});
