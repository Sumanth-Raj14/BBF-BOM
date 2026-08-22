import { describe, expect, it } from "vitest";
import { deriveRollup } from "../AppCtx.jsx";

// The BOM-editor KPI ribbon used to show frozen fixture constants for every
// BOM. These assert the replacement actually describes the rows it is given.
describe("deriveRollup", () => {
  it("reports nothing for an empty BOM", () => {
    const r = deriveRollup([]);
    expect(r.parts).toBe(0);
    expect(r.unique).toBe(0);
    expect(r.bomCost).toBe(0);
    expect(r.vendors).toBe(0);
    expect(r.countries).toBe(0);
    // No source for these anywhere -> never a number.
    expect(r.lead).toBe("—");
    expect(r.risk).toBe("—");
    expect(r.lastCost).toBeNull();
  });

  it("counts flat Parts-API rows and sums qty * cost", () => {
    const r = deriveRollup([
      { pn: "A", qty: 2, cost: 10, vendor: "Acme", origin: "IN", lead: 5 },
      { pn: "B", qty: 3, cost: 1.5, vendor: "Acme", origin: "DE", lead: 20 },
      { pn: "A", qty: 1, cost: 10, vendor: "", origin: "", lead: null },
    ]);
    expect(r.parts).toBe(3);
    expect(r.unique).toBe(2);
    expect(r.bomCost).toBeCloseTo(34.5);
    expect(r.vendors).toBe(1);
    expect(r.countries).toBe(2);
    expect(r.lead).toBe(20); // critical (longest) lead
  });

  it("costs leaves only, so an assembly rollup is not double-counted", () => {
    const r = deriveRollup([
      {
        pn: "ASSY",
        qty: 1,
        cost: 999, // an assembly's own cost is itself a rollup
        children: [
          { pn: "C1", qty: 2, cost: 5 },
          { pn: "C2", qty: 1, cost: 7 },
        ],
      },
    ]);
    expect(r.bomCost).toBe(17);
    expect(r.parts).toBe(3);
    expect(r.unique).toBe(3);
  });
});
