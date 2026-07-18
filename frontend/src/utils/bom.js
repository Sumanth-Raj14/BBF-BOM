// `bomItems` (optional) is the canonical bom_items_master list for the
// active BOM \u2014 the response of api.bomEnterprise.items.list(bomId), each
// shaped { id, part_id, quantity, reference_designator, find_number, ... }
// (see backend app/services/bom_service.py::_serialize_bom_item). Without
// this, every Parts-API-backed row would come back with no bomItemId, so
// the BOM editor's structural persistence (qty/refDes/find-number edits,
// delete, reorder) would have nothing to scope its writes to and would
// silently fall back to local-only mutation. We match one bom_items_master
// line per part (first match wins \u2014 a part used more than once in the same
// BOM can't be disambiguated from a flat Parts list; that's a pre-existing
// limitation of sourcing BOM rows from the Parts API rather than the BOM
// itself).
function indexBomItemsByPartId(bomItems) {
  const map = new Map();
  if (Array.isArray(bomItems)) {
    for (const item of bomItems) {
      if (item && item.part_id != null && !map.has(item.part_id)) {
        map.set(item.part_id, item);
      }
    }
  }
  return map;
}

export function convertApiPartsToTree(apiParts, bomItems) {
  if (!apiParts || !Array.isArray(apiParts)) return [];
  const itemsByPartId = indexBomItemsByPartId(bomItems);
  return apiParts.map(p => {
    const item = itemsByPartId.get(p.id);
    return {
      id: "api-" + p.id,
      pn: p.pn,
      name: p.name,
      rev: p.rev || "\u2014",
      qty: (item && item.quantity != null ? item.quantity : p.qty) || 1,
      uom: (item && item.unit) || p.uom || "EA",
      category: p.category || "",
      subCategory: p.subCategory || "",
      vendor: p.vendor || "",
      manufacturer: p.manufacturer || "",
      cost: p.cost || 0,
      lead: p.lead || null,
      origin: p.origin || "",
      status: p.status || "Draft",
      assembly: p.assembly || false,
      material: p.material || "",
      weight: p.weight || null,
      dimensions: p.dimensions || "",
      imageUrl: p.imageUrl || null,
      customFields: p.customFields || {},
      tags: p.tags ? (typeof p.tags === "string" ? p.tags.split(",") : p.tags) : [],
      compliance: p.compliance ? (typeof p.compliance === "string" ? p.compliance.split(",") : p.compliance) : [],
      freight: p.freight || 0,
      tax: p.tax || 0,
      landedCost: p.landedCost || 0,
      countryHistory: p.countryHistory || [],
      vendorPrices: p.vendorPrices || [],
      cadUrl: p.cadUrl || null,
      barcode: p.barcode || null,
      // Canonical bom_items_master linkage \u2014 see comment above.
      bomItemId: item ? item.id : null,
      refDes: item ? item.reference_designator : undefined,
      findNumber: item ? item.find_number : undefined,
      partId: p.id,
    };
  });
}

