import re

for fname in ["../frontend/secondary-screens.jsx", "../frontend/tweaks-panel.jsx"]:
    with open(fname, encoding="utf-8", errors="replace") as f:
        content = f.read()

    pattern = re.compile(r"(\w+)\.propTypes\s*=\s*\{([^}]*)\}\s*(=>)")

    for m in pattern.finditer(content):
        name = m.group(1)
        props_body = m.group(2)

        func_match = re.search(
            r"(const {}\s*=\s*\([^)]*\))\s*$".format(re.escape(name)),
            content[: m.start()],
            re.MULTILINE,
        )
        if not func_match:
            continue

        body_start = m.end() + 2  # after '=>'
        body_text = content[body_start:]

        brace_count = 0
        in_string = False
        string_char = None
        body_end = 0

        for i, ch in enumerate(body_text):
            if in_string:
                if ch == string_char and (i == 0 or body_text[i - 1] != "\\"):
                    in_string = False
            elif ch in ('"', "'"):
                in_string = True
                string_char = ch
            elif ch == "{":
                brace_count += 1
            elif ch == "}":
                brace_count -= 1
                if brace_count < 0:
                    body_end = i + 1
                    break

        if body_end > 0:
            func_line = func_match.group(1)
            body = content[body_start : body_start + body_end]
            after_body = content[body_start + body_end :]

            new_content = content[: func_match.start()]
            new_content += func_line + " " + body + "\n"
            new_content += name + ".propTypes = {\n"
            for line in props_body.strip().split("\n"):
                new_content += "  " + line.strip() + "\n"
            new_content += "};\n"
            new_content += after_body

            content = new_content
            print("Fixed", fname.split("/")[-1], ":", name)

    with open(fname, "w", encoding="utf-8") as f:
        f.write(content)

print("Done")
