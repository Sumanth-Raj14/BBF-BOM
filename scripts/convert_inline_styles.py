"""Batch convert inline style={{}} objects to CSS utility classes.
Supports partial conversion -- convertible props become classes,
non-convertible props stay as inline style.

Usage: python scripts/convert_inline_styles.py <file.jsx> [file2.jsx ...]
"""

import re
import sys
import os


# ---- CSS Utility Class Mappings (aligned with styles.css v1.24.0) ----


def _make_num_map(prefix, values):
    m = {}
    for v in values:
        m[str(v)] = f"{prefix}-{v}"
        m[v] = f"{prefix}-{v}"
    return m


FONT_SIZE_MAP = _make_num_map(
    "fs", [9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 26, 28, 30, 32]
)
FONT_WEIGHT_MAP = _make_num_map("fw", [300, 400, 500, 600, 700])
GAP_MAP = _make_num_map("gap", [2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 40])
Z_INDEX_MAP = _make_num_map("z", [1, 10, 100, 1000, 9999])

LINE_HEIGHT_MAP = {}
for v in [(1, "lh-1"), (1.2, "lh-1-2"), (1.4, "lh-1-4")]:
    LINE_HEIGHT_MAP[str(v[0])] = v[1]
    LINE_HEIGHT_MAP[v[0]] = v[1]

OPACITY_MAP = {}
for v in [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]:
    cls = f"op-0{int(v * 10)}" if v < 1 else "op-10"
    OPACITY_MAP[str(v)] = cls
    OPACITY_MAP[v] = cls

BORDER_RADIUS_MAP = _make_num_map("br", [0, 2, 4, 6, 8, 12, 16, 20, 24])
BORDER_RADIUS_MAP["50%"] = "br-50p"
BORDER_RADIUS_MAP['"50%"'] = "br-50p"
BORDER_RADIUS_MAP["var(--r-2)"] = "rounded-r2"
BORDER_RADIUS_MAP["var(--r-3)"] = "rounded-r3"
BORDER_RADIUS_MAP['"var(--r-2)"'] = "rounded-r2"
BORDER_RADIUS_MAP['"var(--r-3)"'] = "rounded-r3"

CURSOR_MAP = {
    "pointer": "c-pointer",
    '"pointer"': "c-pointer",
    "default": "c-default",
    '"default"': "c-default",
    "not-allowed": "c-not-allowed",
    '"not-allowed"': "c-not-allowed",
}

DISPLAY_MAP = {
    "flex": "flex",
    '"flex"': "flex",
    "none": "d-none",
    '"none"': "d-none",
    "block": "d-block",
    '"block"': "d-block",
    "inline-flex": "inline-flex",
    '"inline-flex"': "inline-flex",
    "inline-block": "d-iblock",
    '"inline-block"': "d-iblock",
    "grid": "d-grid",
    '"grid"': "d-grid",
    "contents": "d-contents",
    '"contents"': "d-contents",
    "table-cell": "d-tcell",
    '"table-cell"': "d-tcell",
}

TEXT_ALIGN_MAP = {
    "center": "text-center",
    '"center"': "text-center",
    "right": "text-right",
    '"right"': "text-right",
    "left": "text-left",
    '"left"': "text-left",
}

TEXT_TRANSFORM_MAP = {
    "uppercase": "uppercase",
    '"uppercase"': "uppercase",
    "capitalize": "capitalize",
    '"capitalize"': "capitalize",
    "lowercase": "lowercase",
    '"lowercase"': "lowercase",
}

WHITE_SPACE_MAP = {
    "nowrap": "ws-nowrap",
    '"nowrap"': "ws-nowrap",
    "pre-line": "ws-pre-line",
    '"pre-line"': "ws-pre-line",
}

POSITION_MAP = {
    "relative": "pos-relative",
    '"relative"': "pos-relative",
    "absolute": "pos-absolute",
    '"absolute"': "pos-absolute",
    "fixed": "pos-fixed",
    '"fixed"': "pos-fixed",
    "sticky": "pos-sticky",
    '"sticky"': "pos-sticky",
}

OVERFLOW_MAP = {
    "hidden": "overflow-h",
    '"hidden"': "overflow-h",
    "visible": "overflow-vis",
    '"visible"': "overflow-vis",
    "auto": "overflow-x-a",
    '"auto"': "overflow-x-a",
}

OVERFLOW_X_MAP = {
    "auto": "ox-auto",
    '"auto"': "ox-auto",
    "hidden": "ox-hidden",
    '"hidden"': "ox-hidden",
    "scroll": "ox-scroll",
    '"scroll"': "ox-scroll",
}

OVERFLOW_Y_MAP = {
    "auto": "oy-auto",
    '"auto"': "oy-auto",
    "hidden": "oy-hidden",
    '"hidden"': "oy-hidden",
    "scroll": "oy-scroll",
    '"scroll"': "oy-scroll",
}

JUSTIFY_CONTENT_MAP = {
    "space-between": "justify-between",
    '"space-between"': "justify-between",
    "center": "justify-center",
    '"center"': "justify-center",
    "flex-end": "justify-end",
    '"flex-end"': "justify-end",
    "flex-start": "justify-start",
    '"flex-start"': "justify-start",
}

ALIGN_ITEMS_MAP = {
    "center": "items-center",
    '"center"': "items-center",
    "baseline": "items-baseline",
    '"baseline"': "items-baseline",
    "flex-start": "items-start",
    '"flex-start"': "items-start",
    "flex-end": "items-end",
    '"flex-end"': "items-end",
    "stretch": "items-stretch",
    '"stretch"': "items-stretch",
}

ALIGN_SELF_MAP = {
    "center": "self-center",
    '"center"': "self-center",
    "flex-start": "self-start",
    '"flex-start"': "self-start",
    "flex-end": "self-end",
    '"flex-end"': "self-end",
    "stretch": "self-stretch",
    '"stretch"': "self-stretch",
}

FLEX_DIRECTION_MAP = {
    "column": "flex-col",
    '"column"': "flex-col",
    "row": "flex-row",
    '"row"': "flex-row",
    "column-reverse": "flex-col-reverse",
    '"column-reverse"': "flex-col-reverse",
    "row-reverse": "flex-row-reverse",
    '"row-reverse"': "flex-row-reverse",
}

TEXT_DECORATION_MAP = {
    "none": "text-decoration-none",
    '"none"': "text-decoration-none",
    "underline": "underline",
    '"underline"': "underline",
    "line-through": "line-through",
    '"line-through"': "line-through",
}

LETTER_SPACING_MAP = {
    "0.01": "letter-sp-1",
    '"0.01em"': "letter-sp-1",
    "0.02": "letter-sp-2",
    '"0.02em"': "letter-sp-2",
    "0.04": "letter-sp-4",
    '"0.04em"': "letter-sp-4",
    "0.06": "letter-sp-6",
    '"0.06em"': "letter-sp-6",
    "0.08": "letter-sp-8",
    '"0.08em"': "letter-sp-8",
}

FONT_FAMILY_MAP = {
    "var(--font-mono)": "font-mono",
    '"var(--font-mono)"': "font-mono",
    "var(--font-sans)": "font-sans",
    '"var(--font-sans)"': "font-sans",
}

FLEX_GROW_MAP = {
    0: "flex-grow-0",
    1: "flex-grow-1",
    "0": "flex-grow-0",
    "1": "flex-grow-1",
}
FLEX_SHRINK_MAP = {
    0: "flex-shrink-0",
    1: "flex-shrink-1",
    "0": "flex-shrink-0",
    "1": "flex-shrink-1",
}
FLEX_MAP = {1: "flex-1", "1": "flex-1", 0: "flex-0", "0": "flex-0"}

WIDTH_MAP = {
    "100%": "w-100p",
    '"100%"': "w-100p",
    "50%": "w-50p",
    '"50%"': "w-50p",
    "25%": "w-25p",
    '"25%"': "w-25p",
    "75%": "w-75p",
    '"75%"': "w-75p",
    "auto": "w-auto",
    '"auto"': "w-auto",
}
HEIGHT_MAP = {
    "100%": "h-100p",
    '"100%"': "h-100p",
    "100vh": "h-100vh",
    '"100vh"': "h-100vh",
    "auto": "h-auto",
    '"auto"': "h-auto",
}
for v in [
    1,
    2,
    4,
    8,
    11,
    14,
    16,
    18,
    20,
    22,
    24,
    26,
    28,
    32,
    36,
    40,
    48,
    50,
    60,
    64,
    80,
    96,
    100,
    120,
    150,
    160,
    180,
    200,
    220,
    240,
    256,
    280,
    300,
    320,
    360,
    400,
    480,
    500,
    600,
]:
    WIDTH_MAP[v] = f"w-{v}"
    WIDTH_MAP[str(v)] = f"w-{v}"
    HEIGHT_MAP[v] = f"h-{v}"
    HEIGHT_MAP[str(v)] = f"h-{v}"

TABLE_LAYOUT_MAP = {
    "auto": "table-auto",
    '"auto"': "table-auto",
    "fixed": "table-fixed",
    '"fixed"': "table-fixed",
}

VERTICAL_ALIGN_MAP = {
    "middle": "va-middle",
    '"middle"': "va-middle",
    "top": "va-top",
    '"top"': "va-top",
    "bottom": "va-bottom",
    '"bottom"': "va-bottom",
    "baseline": "va-baseline",
    '"baseline"': "va-baseline",
}

USER_SELECT_MAP = {
    "none": "user-select-none",
    '"none"': "user-select-none",
    "auto": "user-select-auto",
    '"auto"': "user-select-auto",
    "all": "user-select-all",
    '"all"': "user-select-all",
}

POINTER_EVENTS_MAP = {
    "none": "pointer-events-none",
    '"none"': "pointer-events-none",
    "auto": "pointer-events-auto",
    '"auto"': "pointer-events-auto",
}

BORDER_MAP = {
    0: "b-0",
    "0": "b-0",
    "none": "b-0",
    '"none"': "b-0",
    '"1px solid var(--line)"': "border-line",
    '"1px solid var(--border)"': "b-1",
    '"2px solid var(--line)"': "b-2",
    '"2px solid var(--border)"': "b-2",
    '"3px solid var(--line)"': "b-3",
}

BORDER_BOTTOM_MAP = {
    '"1px solid var(--line)"': "border-bottom",
    '"1px solid var(--danger)"': "bb-danger",
}

BORDER_TOP_MAP = {
    '"1px solid var(--line)"': "border-top",
}

BORDER_LEFT_MAP = {
    '"1px solid var(--line)"': "bl-1",
    '"1px solid var(--border)"': "bl-1",
}

BORDER_RIGHT_MAP = {
    '"1px solid var(--line)"': "bri-1",
}

BORDER_COLOR_MAP = {
    '"var(--accent)"': "border-color-accent",
    '"var(--danger)"': "border-color-danger",
}

BG_MAP = {
    "var(--bg-elev)": "bg-elev",
    '"var(--bg-elev)"': "bg-elev",
    "var(--bg-sunk)": "bg-sunk",
    '"var(--bg-sunk)"': "bg-sunk",
    "var(--bg)": "bg-canvas",
    '"var(--bg)"': "bg-canvas",
    "var(--accent)": "bg-accent",
    '"var(--accent)"': "bg-accent",
    "var(--danger)": "bg-danger",
    '"var(--danger)"': "bg-danger",
    "var(--ok)": "bg-ok",
    '"var(--ok)"': "bg-ok",
    "var(--warn)": "bg-warn",
    '"var(--warn)"': "bg-warn",
    "transparent": "bg-transparent",
    '"transparent"': "bg-transparent",
    "none": "bg-none",
    '"none"': "bg-none",
}

COLOR_MAP = {
    "var(--fg)": "fg",
    '"var(--fg)"': "fg",
    "var(--fg-2)": "fg-2",
    '"var(--fg-2)"': "fg-2",
    "var(--fg-3)": "fg-3",
    '"var(--fg-3)"': "fg-3",
    "var(--fg-4)": "fg-4",
    '"var(--fg-4)"': "fg-4",
    "var(--accent)": "fg-accent",
    '"var(--accent)"': "fg-accent",
    "var(--danger)": "fg-danger",
    '"var(--danger)"': "fg-danger",
    "var(--ok)": "fg-ok",
    '"var(--ok)"': "fg-ok",
    "var(--warn)": "fg-warn",
    '"var(--warn)"': "fg-warn",
    "inherit": "color-inherit",
    '"inherit"': "color-inherit",
}

BORDER_WIDTH_MAP = {0: "border-0", "0": "border-0"}

# CSS variable color matching patterns
COLOR_VAR_RE = re.compile(r'"(var|color-mix)\([^)]+\)')
BG_VAR_RE = re.compile(r'"var\(--bg-([a-z]+)\)"')

SPACING_PROPS = {
    "paddingLeft": "pl",
    "paddingRight": "pr",
    "paddingTop": "pt",
    "paddingBottom": "pb",
    "marginLeft": "ml",
    "marginRight": "mr",
    "marginTop": "mt",
    "marginBottom": "mb",
}

VALID_SPACING = {0, 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 40, 48}


def parse_style_value(val):
    val = val.strip()
    if val.startswith('"') and val.endswith('"'):
        return val[1:-1], "string"
    if val.startswith("'") and val.endswith("'"):
        return val[1:-1], "string"
    try:
        return float(val), "number"
    except ValueError:
        pass
    if val == "true":
        return True, "boolean"
    if val == "false":
        return False, "boolean"
    return val, "expression"


def try_convert_single_style(prop, val_str):
    val, vtype = parse_style_value(val_str)

    mappers = {
        "fontSize": (FONT_SIZE_MAP, val),
        "fontWeight": (FONT_WEIGHT_MAP, val),
        "gap": (GAP_MAP, val),
        "lineHeight": (LINE_HEIGHT_MAP, val),
        "opacity": (OPACITY_MAP, val),
        "borderRadius": (BORDER_RADIUS_MAP, val),
        "zIndex": (Z_INDEX_MAP, val),
        "cursor": (CURSOR_MAP, val_str),
        "display": (DISPLAY_MAP, val_str),
        "textAlign": (TEXT_ALIGN_MAP, val_str),
        "textTransform": (TEXT_TRANSFORM_MAP, val_str),
        "whiteSpace": (WHITE_SPACE_MAP, val_str),
        "position": (POSITION_MAP, val_str),
        "overflow": (OVERFLOW_MAP, val_str),
        "overflowX": (OVERFLOW_X_MAP, val_str),
        "overflowY": (OVERFLOW_Y_MAP, val_str),
        "justifyContent": (JUSTIFY_CONTENT_MAP, val_str),
        "alignItems": (ALIGN_ITEMS_MAP, val_str),
        "alignSelf": (ALIGN_SELF_MAP, val_str),
        "flexDirection": (FLEX_DIRECTION_MAP, val_str),
        "textDecoration": (TEXT_DECORATION_MAP, val_str),
        "letterSpacing": (LETTER_SPACING_MAP, val_str),
        "fontFamily": (FONT_FAMILY_MAP, val_str),
        "flexGrow": (FLEX_GROW_MAP, val),
        "flexShrink": (FLEX_SHRINK_MAP, val),
        "flex": (FLEX_MAP, val),
        "tableLayout": (TABLE_LAYOUT_MAP, val_str),
        "verticalAlign": (VERTICAL_ALIGN_MAP, val_str),
        "userSelect": (USER_SELECT_MAP, val_str),
        "pointerEvents": (POINTER_EVENTS_MAP, val_str),
        "width": (WIDTH_MAP, val),
        "height": (HEIGHT_MAP, val),
        "border": (BORDER_MAP, val),
        "borderBottom": (BORDER_BOTTOM_MAP, val_str),
        "borderTop": (BORDER_TOP_MAP, val_str),
        "borderLeft": (BORDER_LEFT_MAP, val_str),
        "borderRight": (BORDER_RIGHT_MAP, val_str),
        "borderColor": (BORDER_COLOR_MAP, val_str),
    }

    if prop in mappers:
        mapper, lookup_val = mappers[prop]
        if lookup_val in mapper:
            return mapper[lookup_val]
        if vtype == "string":
            quoted = f'"{val}"'
            if quoted in mapper:
                return mapper[quoted]
        return None

    # Background
    if prop == "background":
        if val_str in BG_MAP:
            return BG_MAP[val_str]
        m = BG_VAR_RE.match(val_str)
        if m:
            shade = m.group(1)
            if shade in ("elev", "sunk", "canvas", "2", "3"):
                return f"bg-{shade}"
        return None

    # Color
    if prop == "color":
        if val_str in COLOR_MAP:
            return COLOR_MAP[val_str]
        m = COLOR_VAR_RE.match(val_str)
        if m:
            full = m.group(0)
            for key, cls in COLOR_MAP.items():
                if isinstance(key, str) and key in full:
                    return cls
        return None

    # Min/max width
    if prop == "minWidth":
        if val_str in ('"0"', "0") or val == 0:
            return "min-w-0"
        return None
    if prop == "maxWidth":
        if val_str in ('"100%"', "100%", '"none"', "none"):
            return "max-w-none" if val_str in ('"none"', "none") else "w-full"
        for v in [100, 200, 300, 400, 500, 600]:
            if val_str in (f'"{v}px"', f'"{v}"', str(v)) or val == v:
                return f"max-w-{v}"
        return None
    if prop == "minHeight":
        if val_str in ('"0"', "0") or val == 0:
            return "min-h-0"
        return None
    if prop == "maxHeight":
        if val_str in ('"0"', "0") or val == 0:
            return "max-h-0"
        return None

    # Directional spacing
    if prop in SPACING_PROPS:
        prefix = SPACING_PROPS[prop]
        try:
            iv = int(val)
            if iv in VALID_SPACING:
                return f"{prefix}-{iv}"
        except (ValueError, TypeError):
            pass
        return None

    # Border width, style
    if prop == "borderWidth":
        if val in BORDER_WIDTH_MAP:
            return BORDER_WIDTH_MAP[val]
        return None
    if prop == "borderStyle":
        if val_str in ('"solid"', "solid"):
            return "border-solid"
        return None

    return None


BORDER_WIDTH_MAP = {0: "border-0", "0": "border-0"}


def parse_style_object(inner):
    """Parse a style={{...}} inner content into list of (key, raw_value) tuples."""
    props = []
    depth = 0
    current = ""
    in_string = False
    string_char = None

    for ch in inner:
        if in_string:
            current += ch
            if ch == string_char:
                in_string = False
        elif ch in ('"', "'"):
            in_string = True
            string_char = ch
            current += ch
        elif ch == "{":
            depth += 1
            current += ch
        elif ch == "}":
            depth -= 1
            current += ch
        elif ch == "," and depth == 0:
            if ":" in current:
                k, _, v = current.partition(":")
                props.append((k.strip(), v.strip()))
            current = ""
        else:
            current += ch
    if current and ":" in current:
        k, _, v = current.partition(":")
        props.append((k.strip(), v.strip()))

    return props


STYLE_RE = re.compile(r"style=\{\{[^}]*\}\}")


def _has_expression(inner):
    """Check if style inner has JS expression references (dynamic variables)."""
    depth = 0
    for ch in inner:
        if ch == "{":
            depth += 1
            if depth > 1:
                return True
        elif ch == "}":
            depth -= 1
    return False


def convert_file(filepath):
    with open(filepath, "r", encoding="utf-8", errors="replace") as f:
        content = f.read()

    lines = content.split("\n")
    results = []
    total_styles = 0
    partial_converted = 0
    full_converted = 0
    skipped = 0

    for line in lines:
        if "style={{" not in line:
            results.append(line)
            continue

        total_styles += 1
        modified_line = line

        while "style={{" in modified_line:
            m = STYLE_RE.search(modified_line)
            if not m:
                break

            style_attr = m.group(0)
            inner = style_attr[8:-2]

            if _has_expression(inner):
                skipped += 1
                break

            props = parse_style_object(inner)
            if not props:
                skipped += 1
                break

            classes = []
            remaining_props = []

            for key, val in props:
                cls = try_convert_single_style(key, val)
                if cls:
                    classes.append(cls)
                else:
                    remaining_props.append((key, val))

            if not classes:
                skipped += 1
                break

            class_str = " ".join(classes)
            replacement = style_attr

            if not remaining_props:
                # FULL conversion: replace style with className
                cm_str = re.search(r'className="([^"]*)"', modified_line)
                cm_expr = re.search(r"className=\{([^}]+)\}", modified_line)

                if cm_str:
                    old_class = cm_str.group(1)
                    new_class = f"{old_class} {class_str}".strip()
                    modified_line = modified_line.replace(style_attr, "", 1)
                    modified_line = modified_line.replace(
                        f'className="{cm_str.group(1)}"', f'className="{new_class}"', 1
                    )
                elif cm_expr:
                    expr = cm_expr.group(1)
                    new_expr = f'({expr} + " {class_str}").trim()'
                    modified_line = modified_line.replace(style_attr, "", 1)
                    modified_line = modified_line.replace(
                        f"className={{{expr}}}", f"className={{{new_expr}}}", 1
                    )
                else:
                    modified_line = modified_line.replace(
                        style_attr, f'className="{class_str}"', 1
                    )
                full_converted += 1
            else:
                # PARTIAL conversion: keep remaining as inline style
                remaining_inner = ", ".join(f"{k}: {v}" for k, v in remaining_props)
                new_style = (
                    f"style={{{{{remaining_inner}}}}}" if remaining_inner else ""
                )

                cm_str = re.search(r'className="([^"]*)"', modified_line)
                cm_expr = re.search(r"className=\{([^}]+)\}", modified_line)

                if cm_str:
                    old_class = cm_str.group(1)
                    new_class = f"{old_class} {class_str}".strip()
                    modified_line = modified_line.replace(style_attr, new_style, 1)
                    modified_line = modified_line.replace(
                        f'className="{cm_str.group(1)}"', f'className="{new_class}"', 1
                    )
                elif cm_expr:
                    expr = cm_expr.group(1)
                    new_expr = f'({expr} + " {class_str}").trim()'
                    modified_line = modified_line.replace(style_attr, new_style, 1)
                    modified_line = modified_line.replace(
                        f"className={{{expr}}}", f"className={{{new_expr}}}", 1
                    )
                else:
                    modified_line = modified_line.replace(
                        style_attr, f'className="{class_str}" {new_style}', 1
                    )
                partial_converted += 1

            modified_line = modified_line.replace("  ", " ").replace(" >", ">")

        results.append(modified_line)

    output = "\n".join(results)

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(output)

    print(
        f"{os.path.basename(filepath)}: {total_styles} styles, "
        f"{full_converted} full + {partial_converted} partial converted, "
        f"{skipped} skipped"
    )
    return total_styles, full_converted + partial_converted


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(
            "Usage: python scripts/convert_inline_styles.py <file.jsx> [file2.jsx ...]"
        )
        sys.exit(1)

    total_s = 0
    total_c = 0
    for fpath in sys.argv[1:]:
        if not os.path.exists(fpath):
            print(f"File not found: {fpath}")
            continue
        s, c = convert_file(fpath)
        total_s += s
        total_c += c

    print(f"\nTotal: {total_s} styles, {total_c} converted (full+partial)")
