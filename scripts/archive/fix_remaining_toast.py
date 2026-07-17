"""Fix remaining window.toast?. and window.toast && patterns not caught by primary script."""

import os, re

src_root = r"C:\Users\tsuma\Downloads\bom tool v1\bom-tool\frontend\src"

files_to_fix = [
    r"root\bom-editor.jsx",
    r"root\collaboration.jsx",
    r"root\integration-screens.jsx",
    r"root\mobile-scanner.jsx",
    r"root\pdm-cad.jsx",
    r"root\tenant-admin.jsx",
    r"components\modals\RollbackModal.jsx",
]

total = 0
for relpath in files_to_fix:
    fpath = os.path.join(src_root, relpath)
    with open(fpath, "r", encoding="utf-8") as f:
        content = f.read()

    orig = content
    # window.toast?.( → toast(
    content = content.replace("window.toast?.(", "toast(")
    # window.toast && toast( → toast(  (guard is redundant)
    content = re.sub(r"window\.toast\s*&&\s*toast\(", "toast(", content)

    if content != orig:
        with open(fpath, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"  {relpath}: fixed remaining window.toast refs")
        total += 1

print(f"\nFixed {total} files")
