"""Auto-generate PropTypes for React components based on destructured params.
Heuristic: infers types from default values and naming conventions.
"""

import re
import os
import glob
import sys

TYPE_GUESS = {
    r"^\d+$": "PropTypes.number",
    r"^\.\d+$": "PropTypes.number",
    r"^true$|^false$": "PropTypes.bool",
    r"^\[.*\]$": "PropTypes.array",
    r"^\{.*\}$": "PropTypes.object",
    r"^\(.*\)\s*=>": "PropTypes.func",
    r"^['\"].*['\"]$": "PropTypes.string",
}

NAME_HINTS = {
    "on[A-Z]": "PropTypes.func",
    "is[A-Z]": "PropTypes.bool",
    "has[A-Z]": "PropTypes.bool",
    "show[A-Z]": "PropTypes.bool",
    "open": "PropTypes.bool",
    "data": "PropTypes.array",
    "items": "PropTypes.array",
    "rows": "PropTypes.array",
    "children": "PropTypes.node",
    "style": "PropTypes.object",
    "className": "PropTypes.string",
    "title": "PropTypes.string",
    "label": "PropTypes.string",
    "placeholder": "PropTypes.string",
    "icon": "PropTypes.node",
    "action": "PropTypes.func",
    "onAction": "PropTypes.func",
    "onClick": "PropTypes.func",
    "onClose": "PropTypes.func",
    "onChange": "PropTypes.func",
    "onSelect": "PropTypes.func",
    "onSubmit": "PropTypes.func",
    "item": "PropTypes.object",
    "row": "PropTypes.object",
}


def guess_type(name, default):
    if default:
        for pattern, ptype in TYPE_GUESS.items():
            if re.match(pattern, default):
                return ptype
    for pattern, ptype in NAME_HINTS.items():
        if re.match(pattern, name):
            return ptype
    return "PropTypes.any"


FUNC_RE = re.compile(
    r"(?:export\s+)?(?:function|const)\s+(\w+)\s*(?:=\s*)?"
    r"\(\s*\{([^}]*)\}\s*(?:=\s*\{[^}]*\})?\s*(?:,\s*[^)]*)?\)"
)

WINDOW_FUNC_RE = re.compile(
    r"window\.(\w+)\s*=\s*(?:function\s*)?\(\s*\{([^}]*)\}\s*"
    r"(?:=\s*\{[^}]*\})?\s*(?:,\s*[^)]*)?\)"
)


def gen_proptypes(component_name, params_str):
    props = []
    for p in params_str.split(","):
        p = p.strip()
        if not p:
            continue
        # Handle default values: name = default
        if "=" in p:
            name, default = p.split("=", 1)
            name = name.strip()
            default = default.strip()
        else:
            name = p
            default = ""
        if name in ("...rest", "..."):
            continue
        if name.startswith("..."):
            continue
        ptype = guess_type(name, default)
        props.append(f"  {name}: {ptype},")

    if not props:
        return ""

    return f"\n{component_name}.propTypes = {{\n" + "\n".join(props) + f"\n}}"


processed_files = []
for fpath in glob.glob("../frontend/*.jsx"):
    try:
        with open(fpath, encoding="utf-8", errors="replace") as f:
            content = f.read()
    except:
        continue

    fname = os.path.basename(fpath)
    if "PropTypes" not in content:
        # Add PropTypes import at top
        content = 'import PropTypes from "prop-types";\n' + content

    # Find component functions with destructured params
    additions = []
    for m in FUNC_RE.finditer(content):
        name = m.group(1)
        params = m.group(2)
        block = gen_proptypes(name, params)
        if block:
            # Check if propTypes already exist
            if f"{name}.propTypes" not in content:
                additions.append((name, block, m.end()))

    # Find window.* component functions
    for m in WINDOW_FUNC_RE.finditer(content):
        name = m.group(1)
        params = m.group(2)
        block = gen_proptypes(name, params)
        if block:
            if f"{name}.propTypes" not in content:
                # Place after window assignment
                full_match = m.group(0)
                idx = content.index(full_match) + len(full_match)
                additions.append((name, block, idx))

    if additions:
        # Sort by position (reverse so we insert from end to keep indices valid)
        additions.sort(key=lambda x: x[2], reverse=True)
        for name, block, pos in additions:
            content = content[:pos] + block + content[pos:]
        processed_files.append(f"{fname}: {len(additions)} components")

    with open(fpath, "w", encoding="utf-8") as f:
        f.write(content)

if processed_files:
    print("Added PropTypes to:")
    for pf in processed_files:
        print(f"  {pf}")
else:
    print("No new PropTypes added")
