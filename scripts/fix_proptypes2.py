"""Fix all broken PropTypes that were inserted before function bodies.
Pattern: funcName(...) \n Name.propTypes = {...} { body }
Should become: funcName(...) { body } \n Name.propTypes = {...};
"""

import re, glob


def fix_file(fpath):
    with open(fpath, encoding="utf-8", errors="replace") as f:
        content = f.read()

    changed = False

    # Keep fixing until no more broken patterns found
    while True:
        found = False

        # Pattern 1: propTypes closing } directly before { of function body
        p1 = re.compile(r"(\w+)\.propTypes\s*=\s*\{([^}]*)\}(\s*)\{")
        m = p1.search(content)
        if m:
            name = m.group(1)
            props = m.group(2)
            body_start = m.end() - 1

            br = 1
            instring = False
            sch = None
            body_end = body_start + 1
            for i in range(body_start + 1, len(content)):
                c = content[i]
                if instring:
                    if c == sch and content[i - 1] != "\\":
                        instring = False
                elif c in ('"', "'"):
                    instring = True
                    sch = c
                elif c == "{":
                    br += 1
                elif c == "}":
                    br -= 1
                    if br == 0:
                        body_end = i + 1
                        break

            pre = content[: m.start()]
            fm = re.search(
                r"(?:function\s+|const\s+)"
                + re.escape(name)
                + r"\s*(?:=\s*)?\([^)]*\)\s*$",
                pre,
                re.MULTILINE,
            )
            if not fm:
                fm = re.search(
                    r"window\."
                    + re.escape(name)
                    + r"\s*=\s*(?:function\s*)?\([^)]*\)\s*$",
                    pre,
                    re.MULTILINE,
                )

            if fm:
                new = pre[: fm.start()]
                new += (
                    fm.group(0).rstrip()
                    + " "
                    + content[body_start:body_end].lstrip()
                    + "\n"
                )
                new += name + ".propTypes = {\n"
                for line in props.strip().split("\n"):
                    if line.strip():
                        new += "  " + line.strip() + "\n"
                new += "};\n"
                new += content[body_end:]
                content = new
                found = True
                changed = True

        if found:
            continue

        # Pattern 2: propTypes closing } before => arrow function
        p2 = re.compile(r"(\w+)\.propTypes\s*=\s*\{([^}]*)\}(\s*)=>")
        m = p2.search(content)
        if m:
            name = m.group(1)
            props = m.group(2)
            arrow_end = m.end()

            pre = content[: m.start()]
            fm = re.search(
                r"(?:function\s+|const\s+)"
                + re.escape(name)
                + r"\s*(?:=\s*)?\([^)]*\)\s*$",
                pre,
                re.MULTILINE,
            )
            if fm:
                body_text = content[arrow_end:]
                body_end = 0
                for i, ch in enumerate(body_text):
                    if ch in (" ", "\n", "\r", "\t"):
                        continue
                    if ch == "{":
                        br = 1
                        for j in range(i + 1, len(body_text)):
                            c = body_text[j]
                            if c == "{":
                                br += 1
                            elif c == "}":
                                br -= 1
                                if br == 0:
                                    body_end = arrow_end + j + 1
                                    break
                        break
                    elif ch == "(":
                        pr = 1
                        for j in range(i + 1, len(body_text)):
                            c = body_text[j]
                            if c == "(":
                                pr += 1
                            elif c == ")":
                                pr -= 1
                                if pr == 0:
                                    body_end = arrow_end + j + 1
                                    break
                        break
                    break

                if body_end > arrow_end:
                    new = pre[: fm.start()]
                    new += (
                        fm.group(0).rstrip()
                        + " "
                        + content[arrow_end:body_end].lstrip()
                        + "\n"
                    )
                    new += name + ".propTypes = {\n"
                    for line in props.strip().split("\n"):
                        if line.strip():
                            new += "  " + line.strip() + "\n"
                    new += "};\n"
                    new += content[body_end:]
                    content = new
                    found = True
                    changed = True

        if not found:
            break

    # Pattern 2: propTypes closing } before => arrow function
    # Matches: Name.propTypes = {...} => ( or Name.propTypes = {...} => {
    p2 = re.compile(r"(\w+)\.propTypes\s*=\s*\{([^}]*)\}(\s*)=>")

    for m in p2.finditer(content):
        name = m.group(1)
        props = m.group(2)
        arrow_end = m.end()  # after =>

        pre = content[: m.start()]
        fm = re.search(
            r"(?:function\s+|const\s+)"
            + re.escape(name)
            + r"\s*(?:=\s*)?\([^)]*\)\s*$",
            pre,
            re.MULTILINE,
        )
        if not fm:
            continue

        # Find arrow body - can be { ... } or ( ... )
        body_text = content[arrow_end:]
        body_end = 0
        for i, ch in enumerate(body_text):
            if ch in (" ", "\n", "\r", "\t"):
                continue
            if ch == "{":
                br = 1
                for j in range(i + 1, len(body_text)):
                    c = body_text[j]
                    if c == "{":
                        br += 1
                    elif c == "}":
                        br -= 1
                        if br == 0:
                            body_end = arrow_end + j + 1
                            break
                break
            elif ch == "(":
                pr = 1
                for j in range(i + 1, len(body_text)):
                    c = body_text[j]
                    if c == "(":
                        pr += 1
                    elif c == ")":
                        pr -= 1
                        if pr == 0:
                            body_end = arrow_end + j + 1
                            break
                break
            break

        if body_end <= arrow_end:
            continue

        new = pre[: fm.start()]
        new += fm.group(0).rstrip() + " " + content[arrow_end:body_end].lstrip() + "\n"
        new += name + ".propTypes = {\n"
        for line in props.strip().split("\n"):
            if line.strip():
                new += "  " + line.strip() + "\n"
        new += "};\n"
        new += content[body_end:]
        content = new
        changed = True

    if changed:
        with open(fpath, "w", encoding="utf-8") as f:
            f.write(content)
        return True
    return False


fixed = 0
for fpath in sorted(glob.glob("../frontend/*.jsx")):
    fname = fpath.split("/")[-1].split("\\")[-1]
    if fix_file(fpath):
        print(f"{fname}: fixed")
        fixed += 1

print(f"\nFixed {fixed} files")
