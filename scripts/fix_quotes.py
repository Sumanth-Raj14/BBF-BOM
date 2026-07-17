"""Fix unterminated string literals in convert_inline_styles.py"""

import sys

with open("scripts/convert_inline_styles.py", "r") as f:
    content = f.read()

lines = content.split("\n")
count = 0
for i, line in enumerate(lines):
    stripped = line.lstrip()
    if ': "' not in stripped:
        continue
    idx = stripped.index(': "')
    after_colon = stripped[idx + 3 :]  # everything after ': "'
    # after_colon = "va-bottom',  — starts with value string

    if not after_colon:
        continue

    # The value string opens with '"'. Find the closing "'" that should be '"'
    # Handle trailing comma
    has_trailing_comma = after_colon.rstrip().endswith(",")

    # Walk the value string
    in_value = False
    quote_char = None
    value_content = []
    chars = list(after_colon)

    for j, ch in enumerate(chars):
        if not in_value:
            if ch == '"':
                in_value = True
                value_content.append(ch)
            else:
                value_content.append(ch)
        else:
            if ch == "\\":
                value_content.append(ch)
                continue
            elif ch == "'":
                # This should be '"' - it's the closing quote
                # But we need to make sure it's really the closing quote
                # Check if this is the last non-comma character or before comma
                rest = after_colon[j + 1 :].strip()
                if rest == "" or rest == "," or (has_trailing_comma and rest == ""):
                    value_content.append('"')
                    count += 1
                    # Copy the rest
                    value_content.extend(list(rest))
                    break
                else:
                    value_content.append(ch)
            else:
                value_content.append(ch)

    if count > (0 if i == 0 else 0):
        new_stripped = stripped[: idx + 3] + "".join(value_content)
        indent = len(line) - len(stripped)
        lines[i] = " " * indent + new_stripped

content = "\n".join(lines)

with open("scripts/convert_inline_styles.py", "w") as f:
    f.write(content)

print(f"Fixed {count} lines")
try:
    compile(content, "convert_inline_styles.py", "exec")
    print("Compilation OK")
except SyntaxError as e:
    print(f"Still has error: {e}")
    sys.exit(1)
