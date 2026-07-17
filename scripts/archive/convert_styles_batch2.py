import re, os

root = r"C:\Users\tsuma\Downloads\bom tool v1\bom-tool\frontend\src"

# Extended STYLE_MAP with more CSS property:value pairs
STYLE_MAP = {
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
    "background: none": "bg-none",
    "font-family: var(--font-mono)": "font-mono",
    "font-weight: 500": "fw-500",
    "font-weight: 600": "fw-600",
    "font-weight: 700": "fw-700",
    "font-size: 9px": "fs-9",
    "font-size: 10px": "fs-10",
    "font-size: 11px": "fs-11",
    "font-size: 12px": "fs-12",
    "font-size: 13px": "fs-13",
    "font-size: 14px": "fs-14",
    "font-size: 15px": "fs-15",
    "font-size: 16px": "fs-16",
    "font-size: 18px": "fs-18",
    "font-size: 20px": "fs-20",
    "font-size: 22px": "fs-22",
    "font-size: 24px": "fs-24",
    "font-size: 28px": "fs-28",
    "display: flex": "flex",
    "display: inline-flex": "inline-flex",
    "display: block": "d-block",
    "display: none": "d-none",
    "display: grid": "d-grid",
    "flex: 1": "flex-1",
    "flex: 0": "flex-0",
    "align-items: center": "items-center",
    "justify-content: center": "justify-center",
    "justify-content: space-between": "justify-between",
    "text-align: center": "text-center",
    "text-align: left": "text-left",
    "text-align: right": "text-right",
    "white-space: nowrap": "whitespace-nowrap",
    "text-overflow: ellipsis": "text-ellipsis",
    "overflow: hidden": "overflow-h",
    "cursor: pointer": "c-pointer",
    "border: none": "b-0",
    "border: 0": "b-0",
    "border-radius: var(--r-2)": "br-2",
    "border-radius: var(--r-3)": "br-3",
    "border-radius: 4px": "br-4",
    "border-radius: 6px": "br-6",
    "border-radius: 8px": "br-8",
    "border-radius: 12px": "br-12",
    "border-radius: 50%": "br-50p",
    "position: absolute": "pos-absolute",
    "position: relative": "pos-relative",
    "position: fixed": "pos-fixed",
    "position: sticky": "pos-sticky",
    "margin: 0": "m-0",
    "margin-top: 2px": "mt-2",
    "margin-top: 4px": "mt-4",
    "margin-top: 8px": "mt-8",
    "margin-bottom: 4px": "mb-4",
    "margin-bottom: 8px": "mb-8",
    "margin-bottom: 12px": "mb-12",
    "margin-bottom: 14px": "mb-14",
    "margin-bottom: 16px": "mb-16",
    "margin-left: 2px": "ml-2",
    "margin-left: 4px": "ml-4",
    "margin-left: 6px": "ml-6",
    "margin-left: 8px": "ml-8",
    "margin-right: 4px": "mr-4",
    "margin-right: 8px": "mr-8",
    "margin: 0 auto": "mx-auto",
    "padding: 0": "p-0",
    "padding: 2px": "p-2",
    "padding: 4px": "p-4",
    "padding: 6px": "p-6",
    "padding: 8px": "p-8",
    "padding: 10px": "p-10",
    "padding: 12px": "p-12",
    "padding: 14px": "p-14",
    "padding: 16px": "p-16",
    "padding: 20px": "p-20",
    "padding: 24px": "p-24",
    "padding: 40px": "p-40",
    "padding-top: 2px": "pt-2",
    "padding-top: 4px": "pt-4",
    "padding-bottom: 2px": "pb-2",
    "padding-bottom: 4px": "pb-4",
    "padding-left: 4px": "pl-4",
    "padding-right: 4px": "pr-4",
    "width: 100%": "w-100p",
    "width: 100%": "w-full",
    "height: 100%": "h-100p",
    "height: 100%": "h-full",
    "height: 100vh": "h-100vh",
    "flex-wrap: wrap": "flex-wrap",
    "flex-direction: column": "flex-col",
    "gap: 2px": "gap-2",
    "gap: 4px": "gap-4",
    "gap: 6px": "gap-6",
    "gap: 8px": "gap-8",
    "gap: 12px": "gap-12",
    "gap: 16px": "gap-16",
    "gap: 24px": "gap-24",
    "opacity: 1": "op-100",
    "opacity: 0.5": "op-50",
    "opacity: 0": "op-0",
    "text-decoration: none": "text-decoration-none",
    "vertical-align: middle": "v-align-middle",
    "list-style: none": "list-none",
}


def style_obj_to_classes(style_text):
    """Convert a style object to a list of class names. Returns None if not all props are convertible."""
    style_text = style_text.strip().strip("{}").strip()
    classes = []
    # Match prop: 'val' or prop: "val" or prop: val (for vars)
    # Handle multi-property: prop1: 'val1', prop2: "val2", prop3: var(--x)
    pairs = re.findall(
        r"(\w[\w-]*)\s*:\s*(?:'([^']*)'|\"([^\"]*)\"|([^\s,}]+))", style_text
    )
    if not pairs:
        return None
    for key, v1, v2, v3 in pairs:
        val = v1 or v2 or v3
        lookup = f"{key}: {val}"
        if lookup in STYLE_MAP:
            classes.append(STYLE_MAP[lookup])
        elif val.startswith("var("):
            lookup_var = f"{key}: var({val[4:-1]})"
            if lookup_var in STYLE_MAP:
                classes.append(STYLE_MAP[lookup_var])
            else:
                return None  # can't convert this prop
        else:
            return None  # can't convert this prop
    return classes


total_replaced = 0

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

        replacements = 0
        # Find style={{...}} with possibly nested braces (e.g., style={{key: cond ? 'a' : 'b', key2: 'c'}})
        # Use a simple non-greedy approach for styles without nested braces first
        for m in re.finditer(r"style=\{(\{[^{}]*\})\}", content):
            full = m.group(0)
            inner = m.group(1)
            classes = style_obj_to_classes(inner)
            if classes:
                new = 'className="' + " ".join(classes) + '"'
                content = content.replace(full, new, 1)
                replacements += 1

        if replacements > 0:
            with open(fpath, "w", encoding="utf-8") as f:
                f.write(content)
            total_replaced += replacements
            print(f"  {fn}: replaced {replacements} inline styles")

print(
    f"\nTotal batch 2: {total_replaced} inline styles converted to className references"
)
