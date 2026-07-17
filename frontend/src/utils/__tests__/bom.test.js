import { describe, it, expect } from 'vitest';
import { convertApiPartsToTree } from '../bom.js';

const sampleApiResponse = [
  {
    id: 101,
    pn: 'BOLT-M6-12',
    name: 'Hex Bolt M6 x 12mm',
    rev: 'A',
    qty: 50,
    uom: 'EA',
    category: 'Fasteners',
    subCategory: 'Bolts',
    vendor: 'FastenerCo',
    manufacturer: 'FastenerCo Ltd',
    cost: 0.15,
    lead: 5,
    origin: 'IN',
    status: 'Released',
    assembly: false,
    material: 'Stainless Steel 304',
    weight: 0.012,
    dimensions: 'M6x12',
    tags: ['hardware', 'fastener'],
    compliance: ['RoHS'],
    freight: 0.02,
    tax: 0.01,
    landedCost: 0.18,
  },
  {
    id: 102,
    pn: 'WASHER-M6',
    name: 'Flat Washer M6',
    rev: null,
    qty: null,
    uom: null,
    category: 'Fasteners',
    vendor: null,
    cost: null,
    lead: null,
    status: null,
    tags: 'hardware,washer',
    compliance: 'RoHS',
  },
  {
    id: 103,
    pn: 'CABLE-USB-C',
    name: 'USB-C Cable 1m',
    imageUrl: null,
    cadUrl: null,
    barcode: null,
    weight: null,
    customFields: null,
    countryHistory: null,
    vendorPrices: null,
  },
];

describe('convertApiPartsToTree', () => {
  it('returns empty array for null/undefined/non-array input', () => {
    expect(convertApiPartsToTree(null)).toEqual([]);
    expect(convertApiPartsToTree(undefined)).toEqual([]);
    expect(convertApiPartsToTree({})).toEqual([]);
    expect(convertApiPartsToTree('string')).toEqual([]);
  });

  it('correctly processes a full API part response', () => {
    const tree = convertApiPartsToTree(sampleApiResponse);
    expect(tree).toHaveLength(3);

    const bolt = tree[0];
    expect(bolt.id).toBe('api-101');
    expect(bolt.pn).toBe('BOLT-M6-12');
    expect(bolt.name).toBe('Hex Bolt M6 x 12mm');
    expect(bolt.rev).toBe('A');
    expect(bolt.qty).toBe(50);
    expect(bolt.uom).toBe('EA');
    expect(bolt.cost).toBe(0.15);
    expect(bolt.lead).toBe(5);
    expect(bolt.assembly).toBe(false);
    expect(bolt.material).toBe('Stainless Steel 304');
    expect(bolt.tags).toEqual(['hardware', 'fastener']);
    expect(bolt.compliance).toEqual(['RoHS']);
    expect(bolt.freight).toBe(0.02);
    expect(bolt.tax).toBe(0.01);
    expect(bolt.landedCost).toBe(0.18);
  });

  it('fills defaults for missing or null fields', () => {
    const tree = convertApiPartsToTree(sampleApiResponse);

    const washer = tree[1];
    expect(washer.id).toBe('api-102');
    expect(washer.rev).toBe('—');
    expect(washer.qty).toBe(1);
    expect(washer.uom).toBe('EA');
    expect(washer.vendor).toBe('');
    expect(washer.cost).toBe(0);
    expect(washer.lead).toBe(null);
    expect(washer.origin).toBe('');
    expect(washer.status).toBe('Draft');
    expect(washer.assembly).toBe(false);
    expect(washer.material).toBe('');
    expect(washer.weight).toBeNull();
    expect(washer.dimensions).toBe('');
    expect(washer.imageUrl).toBeNull();
    expect(washer.customFields).toEqual({});
    expect(washer.tags).toEqual(['hardware', 'washer']);
    expect(washer.compliance).toEqual(['RoHS']);

    const cable = tree[2];
    expect(cable.imageUrl).toBeNull();
    expect(cable.cadUrl).toBeNull();
    expect(cable.barcode).toBeNull();
    expect(cable.weight).toBeNull();
    expect(cable.customFields).toEqual({});
    expect(cable.countryHistory).toEqual([]);
    expect(cable.vendorPrices).toEqual([]);
  });

  it('output has correct tree node structure', () => {
    const tree = convertApiPartsToTree(sampleApiResponse);
    const keys = [
      'id', 'pn', 'name', 'rev', 'qty', 'uom', 'category',
      'subCategory', 'vendor', 'manufacturer', 'cost', 'lead',
      'origin', 'status', 'assembly', 'material', 'weight',
      'dimensions', 'imageUrl', 'customFields', 'tags', 'compliance',
      'freight', 'tax', 'landedCost', 'countryHistory', 'vendorPrices',
      'cadUrl', 'barcode',
    ];
    for (const node of tree) {
      for (const key of keys) {
        expect(node).toHaveProperty(key);
      }
    }
  });
});
