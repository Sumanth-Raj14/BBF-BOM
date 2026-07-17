import re

src = r"C:\Users\tsuma\Downloads\bom tool v1\bom-tool\frontend\src\root\enterprise-screens.jsx"

with open(src, "r", encoding="utf-8") as f:
    content = f.read()

S_MAP = {
    "S.card": "ent-card",
    "S.header": "ent-header",
    "S.title": "ent-title",
    "S.subtitle": "ent-subtitle",
    "S.grid": "ent-grid",
    "S.input": "ent-input",
    "S.select": "ent-select",
    "S.table": "ent-table",
    "S.th": "ent-th",
    "S.td": "ent-td",
    "S.kpi": "ent-kpi",
    "S.kpiVal": "ent-kpi-val",
    "S.kpiLabel": "ent-kpi-label",
    "S.empty": "ent-empty",
    "S.modal": "ent-modal",
    "S.modalBox": "ent-modal-box",
    "S.btnOutline()": "ent-btn-outline",
}

count = 0

for s_ref, cls in S_MAP.items():
    pat = f"style={{{s_ref}}}"
    n = content.count(pat)
    if n:
        content = content.replace(pat, f'className="{cls}"')
        count += n

import re as r

for m in r.finditer(r"style=\{S\.btn\(\)\}", content):
    content = content.replace(m.group(0), 'className="ent-btn"', 1)
    count += 1

for m in r.finditer(r"style=\{S\.btn\((\w+)\)\}", content):
    var = m.group(1)
    if var == "accent":
        content = content.replace(m.group(0), 'className="ent-btn"', 1)
    else:
        content = content.replace(
            m.group(0), f'className="ent-btn" style={{"--btn-bg": {var}}}', 1
        )
    count += 1

for m in r.finditer(r"""style=\{S\.badge\(['"]([^'"]+)['"]\)\}""", content):
    col = m.group(1)
    bg_val = col + "20"
    fg_val = col
    content = content.replace(
        m.group(0),
        'className="ent-badge" style={{"--badge-bg": "'
        + bg_val
        + '", "--badge-fg": "'
        + fg_val
        + '"}}',
        1,
    )
    count += 1

for m in r.finditer(r"style=\{S\.tab\(([^)]+)\)\}", content):
    cond = m.group(1).strip()
    if cond in ("accent", "color"):
        continue
    content = content.replace(
        m.group(0), f'className={{"ent-tab" + ({cond} ? " ent-tab-active" : "")}}', 1
    )
    count += 1

with open(src, "w", encoding="utf-8") as f:
    f.write(content)

print(f"Total: {count} replacements in enterprise-screens.jsx")
