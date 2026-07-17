import re, os

root = r"C:\Users\tsuma\Downloads\bom tool v1\bom-tool\frontend\src"
pattern = re.compile(r"style=\{([^}]+)\}")

count_by_file = {}
exact_patterns = {}

for dirpath, dirnames, filenames in os.walk(root):
    for fn in filenames:
        if fn.endswith(".jsx") or fn.endswith(".js"):
            fpath = os.path.join(dirpath, fn)
            try:
                with open(fpath, "r", encoding="utf-8") as f:
                    content = f.read()
                matches = pattern.findall(content)
                if matches:
                    count_by_file[fn] = len(matches)
                    exact_patterns[fn] = matches
            except:
                pass

# Print top 5 files with their inline style patterns
for fn in sorted(count_by_file, key=count_by_file.get, reverse=True)[:5]:
    print(f"\n{'=' * 60}")
    print(f"{fn} ({count_by_file[fn]} inline styles)")
    print(f"{'=' * 60}")
    for i, s in enumerate(exact_patterns[fn][:30], 1):
        print(f"  {i:2d}. style={{{s}}}")
    if len(exact_patterns[fn]) > 30:
        print(f"  ... and {len(exact_patterns[fn]) - 30} more")
