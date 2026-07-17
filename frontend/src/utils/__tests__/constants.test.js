import { describe, it, expect } from 'vitest';
import { TWEAK_DEFAULTS, ACCENT_PRESETS } from '../constants.js';

describe('constants', () => {
  it('should have valid tweak defaults', () => {
    // Dark mode was removed (light-only until a real AA dark theme ships), so
    // there is no longer a `theme` default. Accent is the AA-compliant orange.
    expect(TWEAK_DEFAULTS.theme).toBeUndefined();
    expect(TWEAK_DEFAULTS.density).toBe('normal');
    expect(TWEAK_DEFAULTS.accent).toBe('#e85d1f');
  });

  it('should have 4 accent presets', () => {
    expect(ACCENT_PRESETS).toHaveLength(4);
    // #b8480f is the canonical --accent-strong/--accent-text AA tone — the
    // stray near-duplicate "#ba4816" was part of the four-contradictory-accent
    // bug this initiative closed out.
    expect(ACCENT_PRESETS).toContain('#b8480f');
  });
});
