with open("frontend/parts-screen.jsx", "r", encoding="utf-8") as f:
    content = f.read()

# Search for backslash-u sequences
for i, ch in enumerate(content):
    if ch == "\\" and i + 1 < len(content) and content[i + 1] == "u":
        line_num = content[:i].count("\n") + 1
        start = max(0, i - 50)
        end = min(len(content), i + 20)
        ctx = content[start:end].replace("\n", " ")
        print(f"Line {line_num}, col {i}: ... {repr(ctx[:100])} ...")
print("Done")
