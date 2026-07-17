import re, os
from collections import Counter

root = r"C:\Users\tsuma\Downloads\bom tool v1\bom-tool\frontend\src"
pattern = re.compile(r"style=\{([^}]+)\}")
value_pattern = re.compile(r'[\'"]([^\'"]+)[\'"]')

all_values = Counter()

for dirpath, dirnames, filenames in os.walk(root):
    for fn in filenames:
        if fn.endswith(".jsx") or fn.endswith(".js"):
            fpath = os.path.join(dirpath, fn)
            try:
                with open(fpath, "r", encoding="utf-8") as f:
                    content = f.read()
                for m in pattern.findall(content):
                    values = value_pattern.findall(m)
                    all_values.update(values)
            except:
                pass

print("=== Most common inline style values ===")
for val, count in all_values.most_common(60):
    if count >= 3:
        print(f"{count:4d}  |{val}|")
print()
print(f"Unique values: {len(all_values)}")
print(f"Total occurrences: {sum(all_values.values())}")
