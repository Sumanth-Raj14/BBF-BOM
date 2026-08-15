# FE config / e2e / tests / styles.css audit

Files read (full): frontend/e2e/auth.setup.js, storage-state.js, real-flows.spec.js,
smoke.spec.js, write-flows.spec.js; frontend/tests/a11y.spec.js, accessibility.spec.js,
debug.spec.js, enterprise-screens.spec.js, pwa.spec.js, smoke.spec.js;
frontend/scripts/check_braces.js; frontend/package.json, vite.config.ts,
playwright.config.js, vitest.config.ts, index.html, nginx.conf, styles.css (4920 lines,
full pass with targeted grep verification of every `color:`/`border-color:` usage of
--bbf-olive and --accent tokens).

## Finding 1 (medium) — `.bbf-nav-header` sets real text to the documented
non-text-safe olive, failing AA
`frontend/styles.css:4756`
```
.bbf-nav-header {
  ...
  color: var(--bbf-olive);
  padding: 8px 12px 4px;
}
```
The file's own `:root` banner (styles.css:33-38) says: "--bbf-olive is the
brand mark hue: 2.06:1 against white, so it can never carry text ... keep
--bbf-olive itself for decorative marks/borders/bars" and defines
`--bbf-olive-text` (#686E21, 5.47:1/4.80:1) specifically as the AA-safe
substitute. `.bbf-nav-header` is the nav-rail group label (real readable
text, e.g. "PARTS", "PROCUREMENT"), not a decorative mark, and it uses
`var(--bbf-olive)` directly — 2.06:1 on white, well under the 4.5:1 (and even
3:1 large-text) AA threshold. Same defect, lower severity because the glyphs
are decorative punctuation rather than semantic labels, at:
- styles.css:571, 596, 1991, 4428, 4679 (`::before { content: "/// "; color: var(--bbf-olive) }` brand-mark glyphs)
- styles.css:614, 4686 (`.bbf-chevron` decorative glyph text)
- styles.css:4734 (`.bbf-empty-icon`, opacity 0.5 icon glyph)

Fix: change `.bbf-nav-header` (and ideally the decorative ones for
consistency with the stated rule) to `var(--bbf-olive-text)`.

## Finding 2 (low) — nginx cache-control contradicts the HTML's own
no-cache meta tags for the SPA shell
`frontend/nginx.conf:12-15` vs `frontend/index.html:15-17`
```
location / {
    try_files $uri $uri/ /index.html;
    add_header Cache-Control "public, max-age=3600";
}
```
```
<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate"/>
```
`location /` serves `index.html` itself (via `try_files ... /index.html`
fallback and direct requests to `/`), and nginx's real HTTP
`Cache-Control` header wins over the `<meta http-equiv>` tag in every
browser. So the index shell — which references hashed asset filenames that
change on every deploy — can be cached by the browser/any intermediate
proxy for up to an hour, serving stale asset references after a release.
Low severity: harness scope is nginx.conf/index.html only, and browsers do
give real headers priority, so the meta tag is effectively dead here.

## Non-findings / notes
- e2e/tests use of `test.use({ storageState: STORAGE_STATE })` is
  legitimate: auth.setup.js writes an empty-but-valid `{cookies:[],
  origins:[]}` state when the backend is unreachable, so dependent specs
  load and fail/skip cleanly rather than crashing on a missing file. Not a
  fake-auth bypass — comments in every spec explicitly note the old
  `localStorage.__bbox_auth` bypass was removed.
- vite.config.ts dev/preview proxies for `/api/` are present and consistent
  with nginx.conf's `/api/` proxy_pass — no proxy gap found in this scope.
- playwright.config.js correctly excludes `storageState` from the
  project-wide `use` block so anonymous-auth tests in real-flows.spec.js are
  not defeated by a global session — this is deliberate per its comment.
- frontend/scripts/check_braces.js reads a hardcoded relative path
  `secondary-screens.jsx` that does not exist in this repo layout (no file
  found under frontend/ named that) and is not referenced by any npm script
  in package.json — dead one-off debug script, no caller, low severity/dead
  code, not wired into CI or `npm run` anything.
- package.json `test:ui` script (`vitest --ui || playwright test --ui`) is
  unusual (silently falls through to a different test runner's UI if vitest
  UI errors) but not a correctness bug given it's a manual dev convenience
  script.
