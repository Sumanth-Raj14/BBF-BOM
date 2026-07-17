import { describe, it, expect, vi, beforeEach } from 'vitest';
import { flattenForCSV, generateXLSX } from '../download.js';

beforeEach(() => {
  vi.clearAllMocks();
  window.INR_RATE = 83;
  window.__t = vi.fn((k) => k);
  window.openPrintWindow = vi.fn();
  window.toast = vi.fn();

  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const anchor = document.createElement('a');
  vi.spyOn(anchor, 'click').mockImplementation(() => {});
  vi.spyOn(document, 'createElement').mockReturnValue(anchor);
  vi.spyOn(document.body, 'appendChild').mockReturnValue(anchor);
  vi.spyOn(document.body, 'removeChild').mockReturnValue(anchor);
});

const sampleBOM = [
  {
    pn: 'ASSY-001', name: 'Main Assembly', rev: 'A', qty: 1, uom: 'EA',
    category: 'Assembly', vendor: 'Vendor A', cost: 150, lead: 14,
    origin: 'US', status: 'Released',
    children: [
      {
        pn: 'PCB-001', name: 'Circuit Board', rev: 'B', qty: 2, uom: 'EA',
        category: 'Electronics', vendor: 'Vendor B', cost: 45, lead: 21,
        origin: 'CN', status: 'Released',
        children: [
          {
            pn: 'IC-001', name: 'Microcontroller', rev: 'C', qty: 4, uom: 'EA',
            category: 'IC', vendor: 'Vendor C', cost: 12.5, lead: 42,
            origin: 'TW', status: 'Draft',
          },
        ],
      },
    ],
  },
];

const leafOnly = [
  {
    pn: 'RES-001', name: 'Resistor 10k', rev: 'A', qty: 100, uom: 'EA',
    category: 'Passive', vendor: 'Vendor X', cost: 0.05, lead: 7,
    origin: 'CN', status: 'Active',
  },
];

describe('flattenForCSV', () => {
  it('flattens a simple BOM tree with correct levels', () => {
    const flat = flattenForCSV(sampleBOM);
    expect(flat).toHaveLength(3);
    expect(flat[0].level).toBe(0);
    expect(flat[0].pn).toBe('ASSY-001');
    expect(flat[0].ext_cost).toBe('150.00');
    expect(flat[1].level).toBe(1);
    expect(flat[1].pn).toBe('PCB-001');
    expect(flat[1].ext_cost).toBe('90.00');
    expect(flat[2].level).toBe(2);
    expect(flat[2].pn).toBe('IC-001');
    expect(flat[2].ext_cost).toBe('50.00');
  });

  it('returns empty array for empty input', () => {
    expect(flattenForCSV([])).toEqual([]);
  });

  it('handles rows without children', () => {
    const flat = flattenForCSV(leafOnly);
    expect(flat).toHaveLength(1);
    expect(flat[0].pn).toBe('RES-001');
    expect(flat[0].level).toBe(0);
  });
});

describe('generateXLSX', () => {
  it('calls download with xlsx filename and mime type', () => {
    generateXLSX(sampleBOM, 'test.xlsx');

    const calls = document.body.appendChild.mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(1);
    const anchor = calls[0][0];
    expect(anchor.download).toBe('test.xlsx');
  });

  it('generated Blob contains XML with part data', () => {
    const origCreateObjectURL = URL.createObjectURL;
    URL.createObjectURL = vi.fn((blob) => {
      window.capturedBlob = blob;
      return 'blob:mock';
    });

    generateXLSX(sampleBOM, 'test.xlsx');

    expect(window.capturedBlob).not.toBeNull();
    expect(window.capturedBlob.type).toBe('application/vnd.ms-excel');

    URL.createObjectURL = origCreateObjectURL;
  });
});
