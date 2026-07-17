interface ApiPart {
  id: number | string;
  pn: string;
  name: string;
  rev?: string;
  qty?: number;
  uom?: string;
  category?: string;
  subCategory?: string;
  vendor?: string;
  manufacturer?: string;
  cost?: number;
  lead?: number | null;
  origin?: string;
  status?: string;
  assembly?: boolean;
  material?: string;
  weight?: number | null;
  dimensions?: string;
  imageUrl?: string | null;
  customFields?: Record<string, unknown>;
  tags?: string | string[];
  compliance?: string | string[];
  freight?: number;
  tax?: number;
  landedCost?: number;
  countryHistory?: unknown[];
  vendorPrices?: unknown[];
  cadUrl?: string | null;
  barcode?: string | null;
}

interface BomTreeNode {
  id: string;
  pn: string;
  name: string;
  rev: string;
  qty: number;
  uom: string;
  category: string;
  subCategory: string;
  vendor: string;
  manufacturer: string;
  cost: number;
  lead: number | null;
  origin: string;
  status: string;
  assembly: boolean;
  material: string;
  weight: number | null;
  dimensions: string;
  imageUrl: string | null;
  customFields: Record<string, unknown>;
  tags: string[];
  compliance: string[];
  freight: number;
  tax: number;
  landedCost: number;
  countryHistory: unknown[];
  vendorPrices: unknown[];
  cadUrl: string | null;
  barcode: string | null;
}

export function convertApiPartsToTree(apiParts: ApiPart[]): BomTreeNode[] {
  if (!apiParts || !Array.isArray(apiParts)) return [];
  return apiParts.map(p => ({
    id: "api-" + p.id,
    pn: p.pn,
    name: p.name,
    rev: p.rev || "—",
    qty: p.qty || 1,
    uom: p.uom || "EA",
    category: p.category || "",
    subCategory: p.subCategory || "",
    vendor: p.vendor || "",
    manufacturer: p.manufacturer || "",
    cost: p.cost || 0,
    lead: p.lead ?? null,
    origin: p.origin || "",
    status: p.status || "Draft",
    assembly: p.assembly || false,
    material: p.material || "",
    weight: p.weight ?? null,
    dimensions: p.dimensions || "",
    imageUrl: p.imageUrl ?? null,
    customFields: p.customFields || {},
    tags: p.tags ? (typeof p.tags === "string" ? p.tags.split(",") : p.tags) : [],
    compliance: p.compliance ? (typeof p.compliance === "string" ? p.compliance.split(",") : p.compliance) : [],
    freight: p.freight || 0,
    tax: p.tax || 0,
    landedCost: p.landedCost || 0,
    countryHistory: p.countryHistory || [],
    vendorPrices: p.vendorPrices || [],
    cadUrl: p.cadUrl ?? null,
    barcode: p.barcode ?? null,
  }));
}

