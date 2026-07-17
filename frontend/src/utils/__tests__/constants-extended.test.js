import { describe, it, expect } from 'vitest';
import { Z, TIME, ANIM, SIZE } from '../design-tokens.js';

describe('design-tokens exports are proper', () => {
  it('Z (z-index) tokens are non-empty integers', () => {
    expect(Object.keys(Z).length).toBeGreaterThan(0);
    for (const [key, val] of Object.entries(Z)) {
      expect(typeof val, `Z.${key}`).toBe('number');
      expect(Number.isInteger(val), `Z.${key} should be integer`).toBe(true);
    }
  });

  it('TIME tokens are non-empty positive numbers', () => {
    expect(Object.keys(TIME).length).toBeGreaterThan(0);
    for (const [key, val] of Object.entries(TIME)) {
      expect(typeof val, `TIME.${key}`).toBe('number');
      expect(val, `TIME.${key}`).toBeGreaterThanOrEqual(0);
    }
  });

  it('ANIM tokens are non-empty strings with units', () => {
    expect(Object.keys(ANIM).length).toBeGreaterThan(0);
    for (const [key, val] of Object.entries(ANIM)) {
      expect(typeof val, `ANIM.${key}`).toBe('string');
      expect(val.length, `ANIM.${key} should not be empty`).toBeGreaterThan(0);
    }
  });

  it('SIZE tokens are non-empty positive numbers', () => {
    expect(Object.keys(SIZE).length).toBeGreaterThan(0);
    for (const [key, val] of Object.entries(SIZE)) {
      expect(typeof val, `SIZE.${key}`).toBe('number');
      expect(val, `SIZE.${key}`).toBeGreaterThan(0);
    }
  });
});
