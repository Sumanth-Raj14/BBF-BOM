import re, os

root = r"C:\Users\tsuma\Downloads\bom tool v1\bom-tool\frontend\src"

# Mapping of simple CSS property:value pairs to existing utility classes
STYLE_MAP = {
    # Colors
    "color: var(--danger)": "fg-danger",
    "color: var(--ok)": "fg-ok",
    "color: var(--warn)": "fg-warn",
    "color: var(--info)": "fg-info",
    "color: var(--accent)": "fg-accent",
    "color: var(--fg)": "fg",
    "color: var(--fg-2)": "fg-2",
    "color: var(--fg-3)": "fg-3",
    "color: var(--fg-4)": "fg-4",
    "color: white": "fg-white",
    "color: #fff": "fg-white",
    "background: var(--bg)": "bg-canvas",
    "background: var(--bg-elev)": "bg-elev",
    "background: var(--bg-sunk)": "bg-sunk",
    "background: var(--accent-soft)": "bg-accent-soft",
    "background: var(--accent)": "bg-accent",
    "background: var(--warn)": "bg-warn",
    "background: transparent": "bg-transparent",
    "background: white": "bg-white",
    "background: #fff": "bg-white",
    # Font
    "font-family: var(--font-mono)": "font-mono",
    "font-weight: 500": "fw-500",
    "font-weight: 600": "fw-600",
    "font-weight: 700": "fw-700",
    # Font sizes
    "font-size: 10px": "fs-10",
    "font-size: 11px": "fs-11",
    "font-size: 12px": "fs-12",
    "font-size: 13px": "fs-13",
    "font-size: 14px": "fs-14",
    "font-size: 20px": "fs-20",
    "font-size: 22px": "fs-22",
    "font-size: 28px": "fs-28",
    # Layout
    "display: flex": "flex",
    "display: inline-flex": "inline-flex",
    "display: block": "d-block",
    "display: none": "d-none",
    "flex: 1": "flex-1",
    # Alignment
    "align-items: center": "items-center",
    "justify-content: center": "justify-center",
    "justify-content: space-between": "justify-between",
    "text-align: center": "text-center",
    "text-align: left": "text-left",
    "text-align: right": "text-right",
    # White-space
    "white-space: nowrap": "whitespace-nowrap",
    "text-overflow: ellipsis": "text-ellipsis",
    "overflow: hidden": "overflow-h",
    # Cursor
    "cursor: pointer": "c-pointer",
    # Border
    "border: none": "b-0",
    "border: 0": "b-0",
    "border-radius: var(--r-2)": "br-2",
    "border-radius: var(--r-3)": "br-3",
    "border-radius: 4px": "br-4",
    # Position
    "position: absolute": "pos-absolute",
    "position: relative": "pos-relative",
    # Margins
    "margin: 0": "m-0",
    "margin-top: 2px": "mt-2",
    "margin-top: 4px": "mt-4",
    "margin-top: 8px": "mt-8",
    "margin-bottom: 4px": "mb-4",
    "margin-bottom: 8px": "mb-8",
    "margin-left: 2px": "ml-2",
    "margin-left: 4px": "ml-4",
    "margin-left: 6px": "ml-6",
    "margin-left: 8px": "ml-8",
    "margin-right: 4px": "mr-4",
    "margin-right: 8px": "mr-8",
    "margin: 0 auto": "mx-auto",
    # Paddings
    "padding: 0": "p-0",
    "padding: 4px": "p-4",
    "padding: 8px": "p-8",
    "padding: 10px": "p-10",
    "padding: 14px": "p-14",
    "padding: 16px": "p-16",
    "padding-top: 2px": "pt-2",
    "padding-top: 4px": "pt-4",
    "padding-bottom: 2px": "pb-2",
    "padding-bottom: 4px": "pb-4",
    "padding-left: 4px": "pl-4",
    "padding-right: 4px": "pr-4",
}


def style_obj_to_class(style_text):
    """Try to convert a simple style object to a className."""
    style_text = style_text.strip().strip("{}").strip()
    # Handle single-property styles like {color: 'red'} or {color: "red"}
    # Match: key: 'value' or key: "value"
    m = re.match(r'(\w[\w-]*)\s*:\s*[\'"]([^\'"]+)[\'"]', style_text)
    if not m:
        return None
    key, val = m.group(1), m.group(2)
    lookup = f"{key}: {val}"
    if lookup in STYLE_MAP:
        return STYLE_MAP[lookup]
    if val.startswith("var("):
        var_key = val[4:-1]
        lookup_var = f"{key}: var({var_key})"
        if lookup_var in STYLE_MAP:
            return STYLE_MAP[lookup_var]
    return None
    key, val = m.group(1), m.group(2)
    # Handle var() references
    lookup = f"{key}: {val}"
    if lookup in STYLE_MAP:
        return STYLE_MAP[lookup]
    # Handle var() references more flexibly
    if val.startswith("var("):
        var_key = val[4:-1]
        lookup_var = f"{key}: var({var_key})"
        if lookup_var in STYLE_MAP:
            return STYLE_MAP[lookup_var]
    return None


# Process files
total_replaced = 0
css_additions = []

for dirpath, dirnames, filenames in os.walk(root):
    for fn in filenames:
        if not (fn.endswith(".jsx") or fn.endswith(".js")):
            continue
        if fn.endswith(".test.js") or fn.endswith(".test.jsx"):
            continue
        fpath = os.path.join(dirpath, fn)
        try:
            with open(fpath, "r", encoding="utf-8") as f:
                content = f.read()
        except:
            continue

        # Find all style={{...}} occurrences
        original = content
        replacements = 0

        # Pattern: style={{key: 'value'}} or style={{key: "value"}}
        for m in re.finditer(r"style=\{(\{[^}]*\})\}", content):
            full = m.group(0)
            inner = m.group(1)
            cls = style_obj_to_class(inner)
            if cls:
                new = f'className="{cls}"'
                content = content.replace(full, new, 1)
                replacements += 1

        # Also handle style={{key: value}} (without quotes - for var references)
        for m in re.finditer(r"style=\{(\{(?:[^{}]|(?:\{[^{}]*\}))+\})\}", content):
            full = m.group(0)
            inner = m.group(1)
            cls = style_obj_to_class(inner)
            if cls:
                new = f'className="{cls}"'
                content = content.replace(full, new, 1)
                replacements += 1

        if replacements > 0:
            with open(fpath, "w", encoding="utf-8") as f:
                f.write(content)
            total_replaced += replacements
            print(f"  {fn}: replaced {replacements} inline styles")

print(f"\nTotal: {total_replaced} inline styles converted to className references")
