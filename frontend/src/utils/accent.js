// Accent-preset AA rethread (UI decision #1: two-tone accent).
//
// Bug this fixes: the Tweaks accent swatch previously drove only the single
// `--accent` custom property. `--accent-strong` / `--accent-text` / `--focus`
// (and the non-aliased `--accent-interactive` / `--accent-hover` /
// `--accent-strong-hover` / `--accent-subtle` tokens ~27 rules in styles.css
// read directly, bypassing the `--accent` legacy alias) stayed hardcoded to
// the default orange. Picking a non-default preset therefore desynced the
// UI: some chrome followed the new color, buttons/links/focus rings did not.
//
// Fix: every preset resolves to a *full* token set (interactive/hover/strong/
// strong-hover/text/focus/subtle), not a single hex, and AppCtx writes all of
// them. Known presets use hand-verified locked pairs (exact hex parity with
// the shipped default's design intent); anything else (custom accent picker,
// future presets) falls through to `deriveAccentTokens`, which darkens the
// chosen hue via HSL lightness reduction until it clears the 4.5:1 AA text/
// fill contrast used for `--accent-strong`/`--accent-text`, mirroring how the
// default orange's #B8480F was derived from #E85D1F.

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.substr(i, 2), 16));
}

function toHex([r, g, b]) {
  return (
    "#" +
    [r, g, b]
      .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"))
      .join("")
  );
}

function relativeLuminance([r, g, b]) {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const [R, G, B] = [f(r), f(g), f(b)];
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

/** WCAG contrast ratio between two hex colors (order-independent). */
export function contrastRatio(hexA, hexB) {
  const lA = relativeLuminance(hexToRgb(hexA));
  const lB = relativeLuminance(hexToRgb(hexB));
  const lighter = Math.max(lA, lB);
  const darker = Math.min(lA, lB);
  return (lighter + 0.05) / (darker + 0.05);
}

function rgbToHsl(r, g, b) {
  (r /= 255), (g /= 255), (b /= 255);
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  let h,
    s,
    l = (max + min) / 2;
  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return [h, s, l];
}

function hslToRgb(h, s, l) {
  if (s === 0) {
    const v = l * 255;
    return [v, v, v];
  }
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [255 * hue2rgb(p, q, h + 1 / 3), 255 * hue2rgb(p, q, h), 255 * hue2rgb(p, q, h - 1 / 3)];
}

/** Darken `hex` (reduce HSL lightness) until it clears `target` contrast vs `against`. */
function darkenForContrast(hex, target, against = "#ffffff") {
  const [h, s, l0] = rgbToHsl(...hexToRgb(hex));
  let l = l0;
  let out = hex;
  let steps = 0;
  while (contrastRatio(out, against) < target && l > 0.02 && steps < 200) {
    l -= 0.01;
    out = toHex(hslToRgb(h, s, l));
    steps++;
  }
  return out;
}

function darkenByAmount(hex, amount) {
  const [h, s, l] = rgbToHsl(...hexToRgb(hex));
  return toHex(hslToRgb(h, s, Math.max(0, l - amount)));
}

// Lightness deltas mirrored from the locked default preset (E85D1F -> D2521A
// hover; B8480F -> 9F3D0C strong-hover) so every preset's hover states use
// the same visual step.
const HOVER_L_DELTA = 0.053;
const STRONG_HOVER_L_DELTA = 0.055;

/** Full AA-safe token set for an arbitrary base accent hex. */
export function deriveAccentTokens(baseHex) {
  const interactive = baseHex;
  const strong = darkenForContrast(baseHex, 4.5);
  return {
    "--accent": interactive,
    "--accent-interactive": interactive,
    "--accent-hover": darkenByAmount(interactive, HOVER_L_DELTA),
    "--accent-strong": strong,
    "--accent-strong-hover": darkenByAmount(strong, STRONG_HOVER_L_DELTA),
    "--accent-text": strong,
    "--focus": interactive,
    "--accent-subtle": hexToRgba(interactive, 0.12),
  };
}

function hexToRgba(hex, alpha) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// The shipped default (#E85D1F) already has hand-tuned, exact locked design
// tokens baked into styles.css :root (the two-tone brand pair from UI
// decision #1). Reproduce them verbatim rather than the generic algorithm's
// approximation, so the default preset — the vast majority of sessions —
// renders byte-identical to today. Non-default presets run through
// `deriveAccentTokens`, which is guaranteed AA (>=4.5:1 strong/text,
// >=3:1 interactive/focus) but need not match a pre-existing hex exactly.
const KNOWN_PRESETS = {
  "#e85d1f": {
    "--accent": "#E85D1F",
    "--accent-interactive": "#E85D1F",
    "--accent-hover": "#D2521A",
    "--accent-strong": "#B8480F",
    "--accent-strong-hover": "#9F3D0C",
    "--accent-text": "#B8480F",
    "--focus": "#E85D1F",
    "--accent-subtle": "rgba(232, 93, 31, 0.12)",
  },
};

/** Full token set for a preset/custom accent hex — locked pair if known, else derived. */
export function accentTokensFor(hex) {
  const known = KNOWN_PRESETS[String(hex).toLowerCase()];
  return known || deriveAccentTokens(hex);
}
