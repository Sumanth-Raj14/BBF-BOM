import { describe, it, expect } from 'vitest';
import { TWEAK_DEFAULTS, ACCENT_PRESETS } from '../constants.js';

describe('constants', () => {
  it('should have valid tweak defaults', () => {
    expect(TWEAK_DEFAULTS.theme).toBe('light');
    expect(TWEAK_DEFAULTS.density).toBe('normal');
    expect(TWEAK_DEFAULTS.accent).toBe('#ba4816');
  });

  it('should have 4 accent presets', () => {
    expect(ACCENT_PRESETS).toHaveLength(4);
    expect(ACCENT_PRESETS).toContain('#ba4816');
  });
});
