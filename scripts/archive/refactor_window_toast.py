"""Refactor window.toast → imported toast from utils/toast module.

For each JSX/JS file that uses window.toast:
1. Calculate relative path to src/utils/toast.js
2. Add import { toast } from '{relpath}/utils/toast'
3. Replace window.toast(...) with toast(...)
4. Replace window.toast.dismiss(...) with toast.dismiss(...)
5. Remove typeof window.toast guards where the only body is a toast call
"""

import re, os

src_root = r"C:\Users\tsuma\Downloads\bom tool v1\bom-tool\frontend\src"

# Files that define window.toast (skip the assignment, only replace usages)
DEFINER_FILES = {"overlays.jsx", "enterprise-utils.jsx"}


def get_relpath(filepath):
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

        if "window.toast" not in content:
            continue

        # Skip files that already import toast
        if re.search(r"import\s*\{[^}]*toast[^}]*\}\s*from", content):
            print(f"  SKIP {fn}: already imports toast")
            continue

        # Check if there are actual window.toast calls (not just definitions)
        call_count = len(re.findall(r"window\.toast\s*\(", content))
        dismiss_count = len(re.findall(r"window\.toast\.dismiss\s*\(", content))
        if call_count == 0 and dismiss_count == 0:
            # Only typeof checks or assignments - skip for definer files
            if fn in DEFINER_FILES:
                continue  # handled separately below
            continue

        relpath = get_relpath(fpath)
        replacements = call_count + dismiss_count

        if fn not in DEFINER_FILES:
            # Remove typeof window.toast guards
            # Pattern: if (typeof window.toast === 'function') window.toast(...)
            content = re.sub(
                r"if\s*\(\s*typeof\s+window\.toast\s*===\s*['\"]function['\"]\s*\)\s*",
                "",
                content,
            )

            # Add import statement
            import_stmt = f'import {{ toast }} from "{relpath}/utils/toast";'
            last_import = None
            for m in re.finditer(
                r"^import\s+.*?from\s+['\"].+?['\"]\s*;?\s*$", content, re.MULTILINE
            ):
                last_import = m

            if last_import:
                insert_pos = last_import.end()
                content = (
                    content[:insert_pos] + "\n" + import_stmt + content[insert_pos:]
                )
            else:
                content = import_stmt + "\n" + content

        # Replace window.toast.dismiss with toast.dismiss
        content = content.replace("window.toast.dismiss(", "toast.dismiss(")
        # Replace window.toast( with toast(
        content = content.replace("window.toast(", "toast(")

        with open(fpath, "w", encoding="utf-8") as f:
            f.write(content)

        total_files += 1
        total_replacements += replacements
        print(
            f"  {fn}: {replacements} replacements, import from '{relpath}/utils/toast'"
        )

print(
    f"\nTotal: {total_files} files modified, {total_replacements} window.toast calls refactored"
)
