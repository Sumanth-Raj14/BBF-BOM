# UI Refinement Direction â€” BOM/PLM Web App

*Prep artifact for the UI brainstorm. Read-only audit synthesis. Describes CURRENT state and a proposed TARGET; final aesthetic/brand calls are deferred to the "Open questions" section.*

## Executive summary

The app has real bones â€” a genuine token layer, reusable overlay primitives, a dense 16-column BOM grid, and information-rich analytics screens â€” but it is an **unmanaged** design system: strong foundations undermined by duplication, contradiction, and several headline features that are wired but dead. It reads as "capable internal tool," not "Linear/GitHub-grade product." The gap is closable, but it is a foundation problem first, not a screen-by-screen paint job.

**Weighted UI maturity: ~43 / 100** (weighting foundations heaviest, since every screen inherits them).

| Dimension | Score | Weight | Weighted |
|---|---|---|---|
| Design tokens & theming | 42 | 25% | 10.5 |
| Component system & consistency | 44 | 25% | 11.0 |
| Screen layout, density & hierarchy | 56 | 20% | 11.2 |
| Accessibility | 34 | 15% | 5.1 |
| Navigation, IA & responsiveness | 34 | 15% | 5.1 |
| **Overall** | | | **~43** |

**The 4â€“5 biggest levers (highest impact-to-effort):**

1. **Kill the second stylesheet and pick one accent.** `public/bbf.css` loads after `styles.css` (index.html:28-29) and overrides tokens with ~40 `!important` declarations, creating a specificity war that breaks density and buttons. Accent is defined **four contradictory ways** (styles.css:92 olive `#B5BC38`; constants.js:4 `#ba4816`; index.html:19 `#e85d1f`; bbf.css:84-87 forces olive on buttons). Collapsing to one stylesheet and one accent is the single highest-leverage move.
2. **Introduce a real type scale and stop the token contradictions.** There is **no typography scale** â€” ~204 hardcoded `font-size:_px` and 1019 raw `px` values in styles.css. A `--fs-*` / `--lh-*` / `--ls-*` scale plus token enforcement is prerequisite to any "premium" typographic rhythm.
3. **Build a canonical primitives layer.** Buttons/inputs/cards/badges/tables exist only as class-strings on raw elements (269 `className="btn"` across 49 files), so variants cannot be enforced; there are 764 inline `style={{}}` across 60 files, two conflicting `EmptyState` components, and 4+ loading/skeleton implementations (one animating a non-existent `@keyframes pulse`).
4. **Make the BOM grid keyboard-operable and fix brand contrast.** The central data surface responds only to `onClick`/`onDoubleClick` (bom-editor.jsx:189) â€” unusable by keyboard/SR users. The olive accent fails WCAG AA (~2.07:1) on primary buttons, accent text, and the focus ring.
5. **Fix navigation & responsiveness.** 39 icon-only destinations with heavy icon reuse, an invisible 10-group taxonomy, ~20 features buried in the avatar dropdown, and a hard `display:none` on the entire rail below 900px (styles.css:2748-2751) with **no** hamburger/drawer replacement.

Two headline features are **dead code**: the accessibility mode (`applyAccessibilityTheme`, power-features.jsx:1908 â€” no `[data-a11y]` CSS, never called) and Dark mode (exposed in Tweaks/TopBar, writes `data-theme`, but styles.css:112 says "Dark mode removed" and no base token override exists).

## Current design system

**Tokens & theming (honest state):**
- A real token layer exists in `frontend/styles.css :root` (lines 6-110): semantic BBF colors, bg/border/text tokens, a strict 7-step spacing scale (`--sp-1..8`, with `--sp-7` missing), status colors, control-height tokens (`--h-compact/default/large`), a 3-step shadow scale, and a legacy-alias block mapping `--bg/--fg/--line/--accent` onto BBF tokens.
- **Missing:** any type scale, letter-spacing scale, or transition scale (only a single `--transition-fast: 0.1s ease`, styles.css:105).
- **Broken:** density (`dense == normal == 30px`, styles.css:108/114-117; comfortable 42px is overridden by `bbf.css` `!important` row heights). Radius tokens are ad-hoc named (`--r-input/--r-2/--r-btn/--r-3/--r-panel/--r-modal`) with duplicate values, and bbf.css introduces a conflicting `--r-1..--r-4` set.
- Fonts are Google-CDN-hosted (index.html:23-25); `--font-mono` points to JetBrains Mono which is **never loaded** (silent fallback for PNs/KPIs/tables); Geist/Geist Mono are downloaded but unused.

**Components:**
- Genuinely reused: `overlays.jsx` Modal/Popover/DropdownButton (focus-trap + PropTypes). Canonical CSS blocks: `.btn`, `.bom-table`, `.status`, `.chip`, `.card`, `.kpi`, `.field/.input/.select`.
- Fragmented: two `EmptyState` components with conflicting prop contracts (enterprise-utils.jsx:169 vs orphaned components/EmptyState.jsx:3); three empty-state CSS classes; 4+ loading/skeleton/spinner implementations; three separately-appended, duplicating utility-class blocks in styles.css (~3238, 3424, 4021) with synonym duplicates (`.cursor-pointer`/`.c-pointer`, `.absolute`/`.pos-absolute`). A full parallel "tweaks" design system (`.twk-*`) ships hardcoded non-brand colors. Three files re-implement the modal shell instead of using the shared Modal.

**Accessibility:**
- Scaffolding present: skip link (App.jsx:388), focus-visible, `prefers-reduced-motion` (styles.css:3134), `.sr-only`, modal focus-trap (overlays.jsx:55), most icon buttons have aria-labels.
- Shallow/broken: BOM grid not keyboard-navigable/editable; shared Modal lacks `role="dialog"`/`aria-modal`/`aria-labelledby` across ~30 dialogs; toasts not announced (`a11y.announce()` defined but never called); active nav lacks `aria-current`; accent/muted-text tokens fail AA; a11y-mode and dark-mode are dead.

**Navigation & IA:**
- URL-based routing (App.jsx:438-570), keyboard shortcuts, aria-labels. But a single 48px icon-only rail carries 39 destinations across 10 invisible groups (labels only on hover); ~20 features reachable only via the avatar dropdown; a single hard 900px breakpoint removes all primary nav with no fallback.

## Proposed target design system

*Directional targets; specific numeric values below are proposals to confirm in the brainstorm, not final.*

**Single source of truth:** Delete `public/bbf.css`; fold any wanted brand rules into `styles.css` as normal (non-`!important`) declarations so `:root` tokens are authoritative. Add a stylelint `no-duplicate-selectors` rule and collapse the three utility blocks into one de-duplicated section.

**Type scale (tokens):** `--fs-50:11 / --fs-100:12 / --fs-200:13 / --fs-300:14(base) / --fs-400:16 / --fs-500:18 / --fs-600:22 / --fs-700:28` px, plus `--lh-tight/normal` and `--ls-*` letter-spacing. Refactor the ~204 hardcoded font-sizes onto them; lint-forbid raw px font-sizes.

**Spacing:** Keep `--sp-1..8`, add the missing `--sp-7`, mandate spacing tokens everywhere (no one-off paddings â€” Dashboard 8/16, Parts 12/18, card-h 10/14, drawer-body 16 all normalize to the scale).

**Radius:** One numeric scale `--radius-xs/sm/md/lg` + `--radius-pill`; drop the duplicate `--r-*` names and retire bbf.css `--r-1..4`; replace hardcoded `3px`/`99px` radii.

**Elevation:** Keep the existing 3-step shadow scale.

**Motion:** Replace the single `--transition-fast` with `--dur-fast/base/slow` + `--ease-standard`, mirrored to `design-tokens.js` ANIM so CSS and JS timings stay in sync. Honor `prefers-reduced-motion` (already present).

**Color/theme:** Define **one** accent policy and align all sources: `:root --accent` fallback, `TWEAK_DEFAULTS.accent` (constants.js:4), `ACCENT_PRESETS[0]` (constants.js:7), the `theme-color` meta (index.html:19), and remove the bbf.css olive button override. Introduce an `--accent-text` token for on-white text/fills that reaches AA. (The `#ba4816` vs `#e85d1f` vs olive `#B5BC38` decision is an **open question** â€” see below.) Either implement a full `:root[data-theme="dark"]` token override block (every bg/fg/border/shadow re-mapped to AA) **or** remove the Dark option (App.jsx:580) and the `data-theme` write (AppCtx.jsx:211).

**Density model:** Make it real â€” `dense ~26px / normal 30px / comfortable 40px`, each setting distinct `--row-h`/`--row-pad-y`, applied to every table, wired to the Tweaks panel, with no hardcoded `!important` row heights.

**Fonts:** Self-host the chosen families via `@font-face` with `font-display:swap`; point `--font-mono` at an actually-loaded mono; drop unused render-blocking font requests.

**Component standards:** A single `src/components/ui/` primitives layer every screen must consume â€” `Button` (primary|secondary|ghost|danger|subtle Ã— sm|md|lg, icon-only, loading; add a real `.btn.danger` token), `Input/Select/Textarea/Field`, `Card`+`CardHeader`, one `DataTable` (backed by `.bom-table`, props: dense/stickyHeader/numeric columns), one `Badge/Status/Chip` (kind Ã— shape props, unifying the 7+ pill variants), one `State` family (`EmptyState`/`LoadingState`/`Skeleton`/`ErrorState`), and one `ScreenHeader`. Targets: <100 inline styles app-wide, zero duplicate selectors, 100% of buttons/tables/badges routed through primitives; enforce via a props catalog/Storybook + an ESLint `no-restricted-syntax` rule.

**Layout frame:** One `ScreenHeader` (single title scale/weight/case/prefix + action cluster) for every screen. A centered content frame (~1360â€“1440px) for card/tile/reading screens; full-bleed only for BOM/Parts grids. Replace fixed `repeat(N,1fr)` tile/KPI grids with responsive `auto-fit minmax`. Freeze PN+Name columns in the BOM grid; add column show/hide + resize. Clamp the detail drawer 380â€“480px with collapsible spec sections.

**A11y baseline (WCAG 2.2 AA), verified with axe-core in CI + manual keyboard/SR passes:**
- All text â‰¥4.5:1 (â‰¥3:1 for â‰¥18.66px bold/24px); focus rings and UI boundaries â‰¥3:1 (dedicated `--focus` token); darken `--text-muted` (#888888 â†’ ~#6a6a6a) and restrict `--fg-4` to non-text.
- BOM grid implements the ARIA grid pattern (roving tabindex; Arrow/Home/End; Space select; Enter/F2 edit; Escape cancel).
- Shared Modal exposes `role="dialog"` + `aria-modal` + `aria-labelledby/-describedby`, marks background inert, restores focus on close.
- One polite live region (assertive for errors); route toasts + async results through `a11y.announce()`.
- `aria-current` on active nav; labelled nav groups; accessible names on all icon buttons and grid checkboxes; menu-button pattern for dropdowns.
- Definition of done: axe reports zero critical/serious violations on every route and modal; a full keyboard-only BOM walkthrough (navigate â†’ select â†’ expand â†’ edit â†’ open detail â†’ save) succeeds.

## Per-screen refinement backlog

| Screen | Top issues | Priority | Effort |
|---|---|---|---|
| **Global shell (TopBar + NavRail + responsive)** | Entire rail `display:none` below 900px with no hamburger/drawer (styles.css:2748-2751); 39 icon-only items, heavy icon reuse, invisible 10-group taxonomy; ~20 features only in avatar menu; cramped 40px topbar; no `aria-current`/list semantics | **P0** | L |
| **BOM editor / grid** | Not keyboard-navigable or editable (onClick/onDoubleClick only, bom-editor.jsx:189); 16 fixed cols, no frozen PN/Name, no column management; unnamed checkboxes; dead density control | **P0** | L |
| **App-wide tokens/CSS (cross-screen)** | Dual stylesheets fighting via `!important`; four accent definitions; no type scale; broken density; ad-hoc radius; unloaded mono font | **P0** | L |
| **Shared Modal / dialogs (~30)** | No `role="dialog"`/`aria-modal`/`aria-labelledby`; background not inert; three ad-hoc modal shells bypass the shared Modal | **P0** | Sâ€“M |
| **Dashboard** | 14px span title (inconsistent header); fixed `repeat(3,1fr)` tiles go sparse on wide screens; entirely inline-styled + color-mix; budget hero over-dominant | **P1** | M |
| **Parts (library)** | 20px h1 diverges from canonical header; grid is the default and wastes 110px on placeholder checkerboard thumbnails; low info-density per card | **P1** | Sâ€“M |
| **Procurement** | Malformed Total-Value KPI (`className="kpi l v fg-accent"` collapses structure, ProcurementScreen.jsx:231); literal `Â·` escape renders on screen (:374); duplicate `className` drops `p-0` (:369) | **P1** | S |
| **Work queue / board** | Bespoke inline-styled table divorced from design system (WorkQueueScreen.jsx:120,188); custom StatusChip; native `<select>` instead of DropdownButton; lone inline `maxWidth:1000` width cap; no sticky header/zebra | **P1** | M |
| **Detail drawer** | Over-long single-scroll Specs tab (detail-drawer.jsx:185-608) in a fixed 420px column competing with the horizontally-scrolling grid; inline table widths | **P1** | M |
| **Analytics** | 58 inline styles; `charts-grid` 2fr/1fr stretches edge-to-edge on ultrawide; no content cap | **P2** | M |
| **Enterprise screens** | ~14 tables on a separate `table.w-100p fs-12` pattern with no shared thead styling | **P2** | L |
| **Integrations / PDM-CAD / Auth-onboarding** | High inline-style density (42/31/30 occurrences); raw inline `<table>` in Integrations | **P2** | M |
| **Tweaks panel** | Parallel `.twk-*` design system with hardcoded non-brand colors leaking a second visual language; exposes non-functional Dark theme | **P2** | M |

## Recommended approach

**Sequence this work AFTER the P0 core-correctness fixes.** UI polish must decorate correct, honestly-persisted data â€” refining screens that show wrong or non-persisted values wastes effort and hides real defects. This initiative should run as its own **brainstorm â†’ spec â†’ plan** cycle.

**Phase 0 â€” Decisions (this brainstorm):** Resolve the open questions below (accent, font, dark-mode, density defaults, IA taxonomy) so foundation work has a target.

**Phase 1 â€” Foundation-first (highest leverage, do before touching any screen):**
1. Delete `public/bbf.css`; fold intentional brand rules into `styles.css`; remove all `!important`.
2. Land the token scales: type (`--fs-*`/`--lh-*`/`--ls-*`), radius (numeric), motion (`--dur-*`/`--ease-*`), and the confirmed single accent (+ `--accent-text`, `--focus`).
3. Self-host fonts; fix `--font-mono`.
4. Make density real; fix dark-mode (implement or remove).
5. Build `src/components/ui/` primitives (Button/Input/Field/Card/DataTable/Badge/State/ScreenHeader) + props catalog; add lint rules (no raw px font-size, no new static inline styles, no duplicate selectors).

**Phase 2 â€” Screen-by-screen sweep** (backlog order above): refactor each screen onto ScreenHeader + primitives + the content frame, retire inline styles, and close its per-screen findings. BOM grid keyboard/ARIA work and the shell/nav responsiveness overhaul are the two largest and should be scoped as dedicated tracks.

**Phase 3 â€” A11y verification:** axe-core in CI on every route/modal + manual keyboard/SR walkthroughs; fix to zero critical/serious.

Each phase gates the next: primitives can't be refactored onto screens until tokens are authoritative, and screens shouldn't be swept before primitives exist.

## Open questions for the stakeholder

1. **Accent color â€” the central brand decision.** Three live values conflict: BBF olive `#B5BC38` (styles.css:92, but fails AA at ~2.07:1 on white with white text), the runtime `#ba4816` (constants.js:4 `TWEAK_DEFAULTS`), and the reference/"gold" `#e85d1f` (index.html:19 theme-color; the standalone Geist build). Which is the canonical brand accent? Note that olive cannot pass WCAG AA for text/buttons/focus without a separate darker `--accent-text` variant â€” is a two-tone accent (decorative olive + AA-compliant text/interaction accent) acceptable, or do we adopt orange outright?
2. **Typeface.** The reference build used **Geist / Geist Mono** (downloaded but unused today); the app currently uses **Montserrat + JetBrains Mono** (mono unloaded). Which family defines "premium" here â€” restore Geist, keep Montserrat, or Montserrat + a real self-hosted mono? (This drives the whole type ramp.)
3. **Dark mode â€” commit or cut?** Styles.css:112 says "removed," yet it's still exposed in Tweaks/TopBar and half-wired. Do we invest in a full AA dark token set, or remove the toggles cleanly?
4. **Accessibility mode (high-contrast / colorblind).** Currently dead code (`applyAccessibilityTheme`). Ship it fully or remove the API + storage key?
5. **Density defaults.** Confirm the 3-step model (dense ~26 / normal 30 / comfortable 40) and which is the default per surface (e.g. denser default for the Parts library and BOM grid?).
6. **IA & primary nav pattern.** Adopt a labeled collapsible rail (Linear/Jira) expandable to ~240px with visible section headers? Which ~8â€“12 destinations are promoted to top-level vs. demoted to command-palette / nested sections, and where do the ~20 avatar-menu features live (a Tools/Automation group vs. their owning screens)?
7. **Content-width philosophy.** Confirm a centered ~1360â€“1440px frame for card/reading screens with full-bleed reserved for the BOM/Parts data grids â€” or does the dense-tool audience prefer edge-to-edge everywhere?
8. **Tweaks panel positioning.** Isolate it as documented dev-only chrome, or refactor its `.twk-*` controls onto app tokens so there is one visual language?
9. **Reference benchmarks.** Which of Linear / GitHub / Notion / Jira / Fusion Manage / OpenBOM is the closest north star for density and chrome, so trade-offs (information density vs. whitespace/calm) resolve consistently?