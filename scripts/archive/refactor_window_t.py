"""Refactor window.__t → imported __t from i18n module.

For each JSX/JS file in src/ that uses window.__t:
1. Calculate relative path to src/i18n.js
2. Add import { __t } from '{relpath}/i18n'
3. Replace window.__t(...) with __t(...) and window.__t?.(...) with __t(...)
"""

import re, os

src_root = r"C:\Users\tsuma\Downloads\bom tool v1\bom-tool\frontend\src"

# Regex to match both window.__t("key") and window.__t?.("key")
CALL_RE = re.compile(r"window\.__t\?\.\(|window\.__t\(")


def get_relpath(filepath):
    """Get relative path from file to src/ root for imports."""
    depth = filepath.replace(src_root, "").lstrip(os.sep).count(os.sep)
    if depth == 0:
        return "."
    return "/".join([".."] * depth)


total_files = 0
total_replacements = 0

for dirpath, dirnames, filenames in os.walk(src_root):
    for fn in filenames:
        if not (fn.endswith(".jsx") or fn.endswith(".js")):
            continue
        if "node_modules" in dirpath:
            continue
        if fn.endswith(".test.js") or fn.endswith(".test.jsx"):
            continue
        fpath = os.path.join(dirpath, fn)
        try:
            with open(fpath, "r", encoding="utf-8") as f:
                content = f.read()
        except:
            continue

        # Count and check for window.__t calls
        matches = list(CALL_RE.finditer(content))
        if not matches:
            continue

        # Skip files that already import __t
        if re.search(r"import\s*\{[^}]*__t[^}]*\}\s*from", content):
            print(f"  SKIP {fn}: already imports __t")
            continue

        # Skip i18n.js itself and main.jsx (they assign window.__t)
        if fn in ("i18n.js", "main.jsx"):
            continue

        relpath = get_relpath(fpath)
        replacements = len(matches)

        # Add import statement after last existing import
        # Find the last import line
        last_import = None
        for m in re.finditer(
            r"^import\s+.*?from\s+['\"].+?['\"]\s*;?\s*$", content, re.MULTILINE
        ):
            last_import = m

        import_stmt = f'import {{ __t }} from "{relpath}/i18n";'

        if last_import:
            insert_pos = last_import.end()
            # Check if there's a newline after the import
            content = content[:insert_pos] + "\n" + import_stmt + content[insert_pos:]
        else:
            # No existing imports, add at the top
            content = import_stmt + "\n" + content

        # Replace window.__t and window.__t?. with __t
        content = content.replace("window.__t?.(", "__t(")
        content = content.replace("window.__t(", "__t(")

        with open(fpath, "w", encoding="utf-8") as f:
            f.write(content)

        total_files += 1
        total_replacements += replacements
        print(f"  {fn}: {replacements} replacements, import from '{relpath}/i18n'")

print(
    f"\nTotal: {total_files} files modified, {total_replacements} window.__t calls refactored"
)
