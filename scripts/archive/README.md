# Archived one-time refactor scripts

These scripts were **one-time JSX/style refactoring tools** run once during the
frontend migration. They are kept here **for history only**.

## Do NOT re-run these scripts

They hardcode a specific absolute path to the frontend source tree, have no
`argparse`, no dry-run mode, and no safety checks. Running them again would
blindly rewrite files against a path that no longer reflects the current tree
and could corrupt source.

## Contents

- `analyze_styles.py` / `analyze_exact_styles.py` — inspected inline style usage.
- `convert_styles.py` / `convert_styles_batch2.py` / `convert_enterprise_styles.py` — converted inline styles to the design system.
- `fix_remaining_toast.py` — one-off toast cleanup.
- `refactor_window_all.py` / `refactor_window_t.py` / `refactor_window_toast.py` — removed `window.*` globals (toast, translations, etc.).

If a similar transformation is needed in the future, write a fresh, parameterized
script rather than reusing these.
