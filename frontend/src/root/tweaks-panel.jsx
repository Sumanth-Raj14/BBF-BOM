import PropTypes from "prop-types";
import { Z, ANIM } from "../utils/design-tokens.js";

import { __t } from "../i18n";
// tweaks-panel.jsx
// Reusable Tweaks shell + form-control helpers.
//
// Owns the host protocol (listens for __activate_edit_mode / __deactivate_edit_mode,
// posts __edit_mode_available / __edit_mode_set_keys / __edit_mode_dismissed) so
// individual prototypes don't re-roll it. Ships a consistent set of controls so you
// don't hand-draw <input type="range">, segmented radios, steppers, etc.
//
// Usage (in an HTML file that loads React + Babel):
//
//   const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
//     "primaryColor": "#D97757",
//     "palette": ["#D97757", "#29261b", "#f6f4ef"],
//     "fontSize": 16,
//     "density": "regular",
//     "dark": false
//   }/*EDITMODE-END*/;
//
//   function App() {
//     const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
//     return (
//       <div style={{ fontSize: t.fontSize, color: t.primaryColor }}>
//         Hello
//         <TweaksPanel>
//           <TweakSection label="Typography" />
//           <TweakSlider label="Font size" value={t.fontSize} min={10} max={32} unit="px"
//                        onChange={(v) => setTweak('fontSize', v)} />
//           <TweakRadio  label="Density" value={t.density}
//                        options={['compact', 'regular', 'comfy']}
//                        onChange={(v) => setTweak('density', v)} />
//           <TweakSection label="Theme" />
//           <TweakColor  label="Primary" value={t.primaryColor}
//                        options={['#D97757', '#2A6FDB', '#1F8A5B', '#7A5AE0']}
//                        onChange={(v) => setTweak('primaryColor', v)} />
//           <TweakColor  label="Palette" value={t.palette}
//                        options={[['#D97757', '#29261b', '#f6f4ef'],
//                                  ['#475569', '#0f172a', '#f1f5f9']]}
//                        onChange={(v) => setTweak('palette', v)} />
//           <TweakToggle label="Dark mode" value={t.dark}
//                        onChange={(v) => setTweak('dark', v)} />
//         </TweaksPanel>
//       </div>
//     );
//   }
//
// ─────────────────────────────────────────────────────────────────────────────

const __TWEAKS_STYLE = `
  .twk-panel{position:fixed;right:16px;bottom:16px;z-index:${Z.TOAST};width:280px;
    max-height:calc(100vh - 32px);display:flex;flex-direction:column;
    transform:scale(var(--dc-inv-zoom,1));transform-origin:bottom right;
    background:color-mix(in oklch, var(--bg-surface) 92%, transparent);color:var(--text-primary);
    -webkit-backdrop-filter:blur(24px) saturate(160%);backdrop-filter:blur(24px) saturate(160%);
    border:1px solid var(--border-subtle);border-radius:var(--radius-xl);
    box-shadow:var(--shadow-xl);
    font:var(--fs-100)/var(--lh-normal) var(--font-sans);overflow:hidden}
  .twk-hd{display:flex;align-items:center;justify-content:space-between;
    padding:var(--sp-3) var(--sp-2) var(--sp-3) var(--sp-4);cursor:move;user-select:none;
    border-bottom:1px solid var(--border-subtle)}
  .twk-hd b{font-size:var(--fs-100);font-weight:var(--fw-semibold);letter-spacing:.01em}
  .twk-x{appearance:none;border:0;background:transparent;color:var(--text-muted);
    width:22px;height:22px;border-radius:var(--radius-sm);cursor:pointer;font-size:13px;line-height:1;
    display:inline-flex;align-items:center;justify-content:center}
  .twk-x:hover{background:var(--bg-hover);color:var(--text-primary)}
  .twk-x:focus-visible{outline:2px solid var(--focus);outline-offset:1px}
  .twk-body{padding:2px var(--sp-4) var(--sp-4);display:flex;flex-direction:column;gap:var(--sp-2);
    overflow-y:auto;overflow-x:hidden;min-height:0;
    scrollbar-width:thin;scrollbar-color:var(--border-strong) transparent}
  .twk-body::-webkit-scrollbar{width:8px}
  .twk-body::-webkit-scrollbar-track{background:transparent;margin:2px}
  .twk-body::-webkit-scrollbar-thumb{background:var(--border-strong);border-radius:4px;
    border:2px solid transparent;background-clip:content-box}
  .twk-body::-webkit-scrollbar-thumb:hover{background:var(--text-muted);
    border:2px solid transparent;background-clip:content-box}
  .twk-row{display:flex;flex-direction:column;gap:5px}
  .twk-row-h{flex-direction:row;align-items:center;justify-content:space-between;gap:var(--sp-3)}
  .twk-lbl{display:flex;justify-content:space-between;align-items:baseline;
    color:var(--text-secondary)}
  .twk-lbl>span:first-child{font-weight:var(--fw-medium)}
  .twk-val{color:var(--text-muted);font-variant-numeric:tabular-nums}

  .twk-sect{font-size:var(--fs-50);font-weight:var(--fw-semibold);letter-spacing:.06em;text-transform:uppercase;
    color:var(--text-muted);padding:var(--sp-3) 0 0}
  .twk-sect:first-child{padding-top:0}

  .twk-field{appearance:none;box-sizing:border-box;width:100%;min-width:0;height:var(--h-compact);padding:0 var(--sp-2);
    border:1px solid var(--border-strong);border-radius:var(--radius-md);
    background:var(--bg-surface);color:inherit;font:inherit}
  .twk-field:focus{border-color:var(--focus)}
  .twk-field:focus-visible{outline:1px solid var(--border-focus);outline-offset:-1px}
  select.twk-field{padding-right:22px;
    background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path fill='%236A6A6A' d='M0 0h10L5 6z'/><\/svg>");
    background-repeat:no-repeat;background-position:right 8px center}

  .twk-slider{appearance:none;-webkit-appearance:none;width:100%;height:4px;margin:6px 0;
    border-radius:var(--radius-pill);background:var(--border-subtle);outline:none}
  .twk-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;
    width:14px;height:14px;border-radius:50%;background:var(--bg-surface);
    border:1px solid var(--border-strong);box-shadow:var(--shadow-sm);cursor:pointer}
  .twk-slider::-moz-range-thumb{width:14px;height:14px;border-radius:50%;
    background:var(--bg-surface);border:1px solid var(--border-strong);box-shadow:var(--shadow-sm);cursor:pointer}
  .twk-slider:focus-visible{outline:2px solid var(--focus);outline-offset:2px}

  .twk-seg{position:relative;display:flex;padding:2px;border-radius:var(--radius-md);
    background:var(--bg-subtle);user-select:none}
  .twk-seg-thumb{position:absolute;top:2px;bottom:2px;border-radius:var(--radius-sm);
    background:var(--bg-surface);box-shadow:var(--shadow-sm);
    transition:left ${ANIM.PANEL_SLIDE} cubic-bezier(.3,.7,.4,1),width ${ANIM.PANEL_SLIDE}}
  .twk-seg.dragging .twk-seg-thumb{transition:none}
  .twk-seg button{appearance:none;position:relative;z-index:1;flex:1;border:0;
    background:transparent;color:inherit;font:inherit;font-weight:var(--fw-medium);min-height:22px;
    border-radius:var(--radius-sm);cursor:pointer;padding:4px 6px;line-height:1.2;
    overflow-wrap:anywhere}
  .twk-seg button:focus-visible{outline:2px solid var(--focus);outline-offset:-2px}

  .twk-toggle{position:relative;width:32px;height:18px;border:0;border-radius:var(--radius-pill);
    background:var(--border-strong);transition:background ${ANIM.BTN_BACKGROUND};cursor:pointer;padding:0}
  .twk-toggle[data-on="1"]{background:var(--accent-strong)}
  .twk-toggle i{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;
    background:var(--bg-surface);box-shadow:var(--shadow-sm);transition:transform ${ANIM.BTN_TRANSFORM}}
  .twk-toggle[data-on="1"] i{transform:translateX(14px)}
  .twk-toggle:focus-visible{outline:2px solid var(--focus);outline-offset:2px}

  .twk-num{display:flex;align-items:center;box-sizing:border-box;min-width:0;height:var(--h-compact);padding:0 0 0 var(--sp-2);
    border:1px solid var(--border-strong);border-radius:var(--radius-md);background:var(--bg-surface)}
  .twk-num-lbl{font-weight:var(--fw-medium);color:var(--text-secondary);cursor:ew-resize;
    user-select:none;padding-right:var(--sp-2)}
  .twk-num input{flex:1;min-width:0;height:100%;border:0;background:transparent;
    font:inherit;font-variant-numeric:tabular-nums;text-align:right;padding:0 var(--sp-2) 0 0;
    outline:none;color:inherit;-moz-appearance:textfield}
  .twk-num input::-webkit-inner-spin-button,.twk-num input::-webkit-outer-spin-button{
    -webkit-appearance:none;margin:0}
  .twk-num input:focus-visible{outline:2px solid var(--focus);outline-offset:-2px;border-radius:var(--radius-xs)}
  .twk-num-unit{padding-right:var(--sp-2);color:var(--text-muted)}

  .twk-btn{appearance:none;height:var(--h-compact);padding:0 var(--sp-3);border:0;border-radius:var(--radius-md);
    background:var(--accent-strong);color:var(--accent-fg);font:inherit;font-weight:var(--fw-medium);cursor:pointer}
  .twk-btn:hover{background:var(--accent-strong-hover)}
  .twk-btn:focus-visible{outline:2px solid var(--focus);outline-offset:2px}
  .twk-btn.secondary{background:var(--bg-subtle);color:var(--text-primary)}
  .twk-btn.secondary:hover{background:var(--border-subtle)}

  .twk-swatch{appearance:none;-webkit-appearance:none;width:56px;height:22px;
    border:1px solid var(--border-strong);border-radius:var(--radius-sm);padding:0;cursor:pointer;
    background:transparent;flex-shrink:0}
  .twk-swatch::-webkit-color-swatch-wrapper{padding:0}
  .twk-swatch::-webkit-color-swatch{border:0;border-radius:3px}
  .twk-swatch::-moz-color-swatch{border:0;border-radius:3px}
  .twk-swatch:focus-visible{outline:2px solid var(--focus);outline-offset:2px}

  .twk-chips{display:flex;gap:var(--sp-2)}
  .twk-chip{position:relative;appearance:none;flex:1;min-width:0;height:46px;
    padding:0;border:0;border-radius:var(--radius-sm);overflow:hidden;cursor:pointer;
    box-shadow:0 0 0 1px var(--border-subtle),var(--shadow-xs);
    transition:transform ${ANIM.BTN_FEEDBACK} cubic-bezier(.3,.7,.4,1),box-shadow ${ANIM.BTN_FEEDBACK}}
  .twk-chip:hover{transform:translateY(-1px);
    box-shadow:0 0 0 1px var(--border-strong),var(--shadow-md)}
  .twk-chip[data-on="1"]{box-shadow:0 0 0 2px var(--text-primary),var(--shadow-sm)}
  .twk-chip:focus-visible{outline:2px solid var(--focus);outline-offset:2px}
  .twk-chip>span{position:absolute;top:0;bottom:0;right:0;width:34%;
    display:flex;flex-direction:column;box-shadow:-1px 0 0 var(--border-subtle)}
  .twk-chip>span>i{flex:1;box-shadow:0 -1px 0 var(--border-subtle)}
  .twk-chip>span>i:first-child{box-shadow:none}
  .twk-chip svg{position:absolute;top:6px;left:6px;width:13px;height:13px;
    filter:drop-shadow(0 1px 1px rgba(0,0,0,.3))}
`;

// ── useTweaks ───────────────────────────────────────────────────────────────
// Single source of truth for tweak values. setTweak persists via the host
// (__edit_mode_set_keys → host rewrites the EDITMODE block on disk).
function useTweaks(defaults) {
  const [values, setValues] = React.useState(defaults);
  // Accepts either setTweak('key', value) or setTweak({ key: value, ... }) so a
  // useState-style call doesn't write a "[object Object]" key into the persisted
  // JSON block.
  const setTweak = React.useCallback((keyOrEdits, val) => {
    const edits =
      typeof keyOrEdits === "object" && keyOrEdits !== null
        ? keyOrEdits
        : { [keyOrEdits]: val };
    setValues((prev) => ({ ...prev, ...edits }));
    window.parent.postMessage({ type: "__edit_mode_set_keys", edits }, "*");
    // Same-window signal so in-page listeners (deck-stage rail thumbnails)
    // can react — the parent message only reaches the host, not peers.
    window.dispatchEvent(new CustomEvent("tweakchange", { detail: edits }));
  }, []);
  return [values, setTweak];
}

// ── TweaksPanel ─────────────────────────────────────────────────────────────
// Floating shell. Registers the protocol listener BEFORE announcing
// availability — if the announce ran first, the host's activate could land
// before our handler exists and the toolbar toggle would silently no-op.
// The close button posts __edit_mode_dismissed so the host's toolbar toggle
// flips off in lockstep; the host echoes __deactivate_edit_mode back which
// is what actually hides the panel.
function TweaksPanel({ title, children }) {
  title = title || __t("tweaks.title") || "Tweaks";
  const [open, setOpen] = React.useState(false);
  const dragRef = React.useRef(null);
  const offsetRef = React.useRef({ x: 16, y: 16 });
  const PAD = 16;

  const clampToViewport = React.useCallback(() => {
    const panel = dragRef.current;
    if (!panel) return;
    const w = panel.offsetWidth,
      h = panel.offsetHeight;
    const maxRight = Math.max(PAD, window.innerWidth - w - PAD);
    const maxBottom = Math.max(PAD, window.innerHeight - h - PAD);
    offsetRef.current = {
      x: Math.min(maxRight, Math.max(PAD, offsetRef.current.x)),
      y: Math.min(maxBottom, Math.max(PAD, offsetRef.current.y)),
    };
    panel.style.right = offsetRef.current.x + "px";
    panel.style.bottom = offsetRef.current.y + "px";
  }, []);

  React.useEffect(() => {
    if (!open) return;
    clampToViewport();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", clampToViewport);
      return () => window.removeEventListener("resize", clampToViewport);
    }
    const ro = new ResizeObserver(clampToViewport);
    ro.observe(document.documentElement);
    return () => ro.disconnect();
  }, [open, clampToViewport]);

  React.useEffect(() => {
    const onMsg = (e) => {
      const t = e?.data?.type;
      if (t === "__activate_edit_mode") setOpen(true);
      else if (t === "__deactivate_edit_mode") setOpen(false);
    };
    window.addEventListener("message", onMsg);
    window.parent.postMessage({ type: "__edit_mode_available" }, "*");
    return () => window.removeEventListener("message", onMsg);
  }, []);

  const dismiss = () => {
    setOpen(false);
    window.parent.postMessage({ type: "__edit_mode_dismissed" }, "*");
  };

  const onDragStart = (e) => {
    const panel = dragRef.current;
    if (!panel) return;
    const r = panel.getBoundingClientRect();
    const sx = e.clientX,
      sy = e.clientY;
    const startRight = window.innerWidth - r.right;
    const startBottom = window.innerHeight - r.bottom;
    const move = (ev) => {
      offsetRef.current = {
        x: startRight - (ev.clientX - sx),
        y: startBottom - (ev.clientY - sy),
      };
      clampToViewport();
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  if (!open) return null;
  return (
    <>
      <style>{__TWEAKS_STYLE}</style>
      <div
        ref={dragRef}
        className="twk-panel"
        data-omelette-chrome=""
        style={{ right: offsetRef.current.x, bottom: offsetRef.current.y }}
      >
        <div className="twk-hd" onMouseDown={onDragStart}>
          <b>{title}</b>
          <button
            className="twk-x"
            aria-label={__t("tweaks.close") || "Close tweaks"}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={dismiss}
          >
            ✕
          </button>
        </div>
        <div className="twk-body">{children}</div>
      </div>
    </>
  );
}
TweaksPanel.propTypes = {
  title: PropTypes.string,
  children: PropTypes.node,
};

// ── Layout helpers ──────────────────────────────────────────────────────────

function TweakSection({ label, children }) {
  return (
    <>
      <div className="twk-sect">{label}</div>
      {children}
    </>
  );
}
TweakSection.propTypes = {
  label: PropTypes.string,
  children: PropTypes.node,
};

function TweakRow({ label, value, children, inline = false }) {
  return (
    <div className={inline ? "twk-row twk-row-h" : "twk-row"}>
      <div className="twk-lbl">
        <span>{label}</span>
        {value != null && <span className="twk-val">{value}</span>}
      </div>
      {children}
    </div>
  );
}
TweakRow.propTypes = {
  label: PropTypes.string,
  value: PropTypes.any,
  children: PropTypes.node,
  inline: PropTypes.bool,
};

// ── Controls ────────────────────────────────────────────────────────────────

function TweakSlider({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  unit = "",
  onChange,
}) {
  return (
    <TweakRow label={label} value={`${value}${unit}`}>
      <input
        id={"twk-slider-" + label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}
        name={label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}
        type="range"
        className="twk-slider"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </TweakRow>
  );
}
TweakSlider.propTypes = {
  label: PropTypes.string,
  value: PropTypes.any,
  min: PropTypes.number,
  max: PropTypes.number,
  step: PropTypes.number,
  unit: PropTypes.string,
  onChange: PropTypes.func,
};

function TweakToggle({ label, value, onChange }) {
  return (
    <div className="twk-row twk-row-h">
      <div className="twk-lbl">
        <span>{label}</span>
      </div>
      <button
        type="button"
        className="twk-toggle"
        data-on={value ? "1" : "0"}
        role="switch"
        aria-checked={!!value}
        onClick={() => onChange(!value)}
      >
        <i />
      </button>
    </div>
  );
}
TweakToggle.propTypes = {
  label: PropTypes.string,
  value: PropTypes.any,
  onChange: PropTypes.func,
};

function TweakRadio({ label, value, options, onChange }) {
  const trackRef = React.useRef(null);
  const [dragging, setDragging] = React.useState(false);
  // The active value is read by pointer-move handlers attached for the lifetime
  // of a drag — ref it so a stale closure doesn't fire onChange for every move.
  const valueRef = React.useRef(value);
  valueRef.current = value;

  // Segments wrap mid-word once per-segment width runs out. The track is
  // ~248px (280 panel − 28 body pad − 4 seg pad), each button loses 12px
  // to its own padding, and 11.5px system-ui averages ~6.3px/char — so 2
  // options fit ~16 chars each, 3 fit ~10. Past that (or >3 options), fall
  // back to a dropdown rather than wrap.
  const labelLen = (o) => String(typeof o === "object" ? o.label : o).length;
  const maxLen = options.reduce((m, o) => Math.max(m, labelLen(o)), 0);
  const fitsAsSegments = maxLen <= ({ 2: 16, 3: 10 }[options.length] ?? 0);
  if (!fitsAsSegments) {
    // <select> emits strings — map back to the original option value so the
    // fallback stays type-preserving (numbers, booleans) like the segment path.
    const resolve = (s) => {
      const m = options.find(
        (o) => String(typeof o === "object" ? o.value : o) === s,
      );
      return m === undefined ? s : typeof m === "object" ? m.value : m;
    };
    return (
      <TweakSelect
        label={label}
        value={value}
        options={options}
        onChange={(s) => onChange(resolve(s))}
      />
    );
  }
  const opts = options.map((o) =>
    typeof o === "object" ? o : { value: o, label: o },
  );
  const idx = Math.max(
    0,
    opts.findIndex((o) => o.value === value),
  );
  const n = opts.length;

  const segAt = (clientX) => {
    const r = trackRef.current.getBoundingClientRect();
    const inner = r.width - 4;
    const i = Math.floor(((clientX - r.left - 2) / inner) * n);
    return opts[Math.max(0, Math.min(n - 1, i))].value;
  };

  const onPointerDown = (e) => {
    setDragging(true);
    const v0 = segAt(e.clientX);
    if (v0 !== valueRef.current) onChange(v0);
    const move = (ev) => {
      if (!trackRef.current) return;
      const v = segAt(ev.clientX);
      if (v !== valueRef.current) onChange(v);
    };
    const up = () => {
      setDragging(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <TweakRow label={label}>
      <div
        ref={trackRef}
        role="radiogroup"
        onPointerDown={onPointerDown}
        className={dragging ? "twk-seg dragging" : "twk-seg"}
      >
        <div
          className="twk-seg-thumb"
          style={{
            left: `calc(2px + ${idx} * (100% - 4px) / ${n})`,
            width: `calc((100% - 4px) / ${n})`,
          }}
        />
        {opts.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === value}
          >
            {o.label}
          </button>
        ))}
      </div>
    </TweakRow>
  );
}
TweakRadio.propTypes = {
  label: PropTypes.string,
  value: PropTypes.any,
  options: PropTypes.any,
  onChange: PropTypes.func,
};

function TweakSelect({ label, value, options, onChange }) {
  return (
    <TweakRow label={label}>
      <select
        id={"twk-select-" + label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}
        name={label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}
        className="twk-field"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => {
          const v = typeof o === "object" ? o.value : o;
          const l = typeof o === "object" ? o.label : o;
          return (
            <option key={v} value={v}>
              {l}
            </option>
          );
        })}
      </select>
    </TweakRow>
  );
}
TweakSelect.propTypes = {
  label: PropTypes.string,
  value: PropTypes.any,
  options: PropTypes.any,
  onChange: PropTypes.func,
};

function TweakText({ label, value, placeholder, onChange }) {
  return (
    <TweakRow label={label}>
      <input
        id={"twk-text-" + label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}
        name={label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}
        className="twk-field"
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </TweakRow>
  );
}
TweakText.propTypes = {
  label: PropTypes.string,
  value: PropTypes.any,
  placeholder: PropTypes.string,
  onChange: PropTypes.func,
};

function TweakNumber({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  onChange,
}) {
  const clamp = (n) => {
    if (min != null && n < min) return min;
    if (max != null && n > max) return max;
    return n;
  };
  const startRef = React.useRef({ x: 0, val: 0 });
  const onScrubStart = (e) => {
    e.preventDefault();
    startRef.current = { x: e.clientX, val: value };
    const decimals = (String(step).split(".")[1] || "").length;
    const move = (ev) => {
      const dx = ev.clientX - startRef.current.x;
      const raw = startRef.current.val + dx * step;
      const snapped = Math.round(raw / step) * step;
      onChange(clamp(Number(snapped.toFixed(decimals))));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  return (
    <div className="twk-num">
      <span className="twk-num-lbl" onPointerDown={onScrubStart}>
        {label}
      </span>
      <input
        id={"twk-num-" + label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}
        name={label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(clamp(Number(e.target.value)))}
      />
      {unit && <span className="twk-num-unit">{unit}</span>}
    </div>
  );
}
TweakNumber.propTypes = {
  label: PropTypes.string,
  value: PropTypes.any,
  min: PropTypes.any,
  max: PropTypes.any,
  step: PropTypes.number,
  unit: PropTypes.string,
  onChange: PropTypes.func,
};

// Relative-luminance contrast pick — checkmarks drawn over a swatch need to
// read on both #111 and #fafafa without per-option configuration. Hex input
// only (#rgb / #rrggbb); named or rgb()/hsl() colors fall through to "light".
function __twkIsLight(hex) {
  const h = String(hex).replace("#", "");
  const x = h.length === 3 ? h.replace(/./g, (c) => c + c) : h.padEnd(6, "0");
  const n = parseInt(x.slice(0, 6), 16);
  if (Number.isNaN(n)) return true;
  const r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  return r * 299 + g * 587 + b * 114 > 148000;
}

const __TwkCheck = ({ light }) => (
  <svg viewBox="0 0 14 14" aria-hidden="true">
    <path
      d="M3 7.2 5.8 10 11 4.2"
      fill="none"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      stroke={light ? "rgba(0,0,0,.78)" : "#fff"}
    />
  </svg>
);
__TwkCheck.propTypes = { light: PropTypes.any };

// TweakColor — curated color/palette picker. Each option is either a single
// hex string or an array of 1-5 hex strings; the card adapts — a lone color
// renders solid, a palette renders colors[0] as the hero (left ~2/3) with the
// rest stacked in a sharp column on the right. onChange emits the
// option in the shape it was passed (string stays string, array stays array).
// Without options it falls back to the native color input for back-compat.
function TweakColor({ label, value, options, onChange }) {
  if (!options || !options.length) {
    return (
      <div className="twk-row twk-row-h">
        <div className="twk-lbl">
          <span>{label}</span>
        </div>
        <input
          id={"twk-color-" + label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}
          name={label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}
          type="color"
          className="twk-swatch"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    );
  }
  // Native <input type=color> emits lowercase hex per the HTML spec, so
  // compare case-insensitively. String() guards JSON.stringify(undefined),
  // which returns the primitive undefined (no .toLowerCase).
  const key = (o) => String(JSON.stringify(o)).toLowerCase();
  const cur = key(value);
  return (
    <TweakRow label={label}>
      <div className="twk-chips" role="radiogroup">
        {options.map((o, i) => {
          const colors = Array.isArray(o) ? o : [o];
          const [hero, ...rest] = colors;
          const sup = rest.slice(0, 4);
          const on = key(o) === cur;
          return (
            <button
              key={colors.join(",")}
              type="button"
              className="twk-chip"
              role="radio"
              aria-checked={on}
              data-on={on ? "1" : "0"}
              aria-label={colors.join(", ")}
              title={colors.join(" · ")}
              style={{ background: hero }}
              onClick={() => onChange(o)}
            >
              {sup.length > 0 && (
                <span>
                  {sup.map((c, j) => (
                    <i key={j} style={{ background: c }} />
                  ))}
                </span>
              )}
              {on && <__TwkCheck light={__twkIsLight(hero)} />}
            </button>
          );
        })}
      </div>
    </TweakRow>
  );
}
TweakColor.propTypes = {
  label: PropTypes.string,
  value: PropTypes.any,
  options: PropTypes.any,
  onChange: PropTypes.func,
};

function TweakButton({ label, onClick, secondary = false }) {
  return (
    <button
      type="button"
      className={secondary ? "twk-btn secondary" : "twk-btn"}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
TweakButton.propTypes = {
  label: PropTypes.string,
  onClick: PropTypes.func,
  secondary: PropTypes.bool,
};

Object.assign(window, {
  useTweaks,
  TweaksPanel,
  TweakSection,
  TweakRow,
  TweakSlider,
  TweakToggle,
  TweakRadio,
  TweakSelect,
  TweakText,
  TweakNumber,
  TweakColor,
  TweakButton,
});
