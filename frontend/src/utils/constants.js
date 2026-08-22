export const TWEAK_DEFAULTS = {
  "density": "normal",
  "accent": "#e85d1f"
};

// #b8480f is the canonical --accent-strong/--accent-text AA tone (styles.css)
// — was the stray near-duplicate "#ba4816" (four-contradictory-accents bug).
export const ACCENT_PRESETS = ["#e85d1f", "#b8480f", "#0288d1", "#2e7d32"];

// fixfe: three fabricated-data fixtures used to live here and have been deleted.
//
//   INITIAL_NOTIFICATIONS — six invented activity entries ("M. Park requested
//     approval on ATL-MFR-CTL Rev D · 54 min", "K. Singh approved PO-2026-0481",
//     …). They were the localStorage default for AppCtx's notification state and
//     rendered verbatim in the TopBar bell, so every fresh install saw six
//     events that never happened, complete with an unread badge. The bell now
//     reads GET /api/v1/notifications (api.notifications.list) and shows the
//     real list — or an empty "all caught up" state, which is honest.
//
//   INITIAL_COMMENTS / INITIAL_APPROVALS — invented reviewer names, comment
//     text and approval statuses. Already unreferenced (AppCtx starts these
//     empty and hydrates them from the real API), so this only removes the
//     temptation to wire them back up.
//
// Nothing replaces them: fabricated data has no honest version.
