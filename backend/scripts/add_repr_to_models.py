"""Scan all model files and add __repr__ to classes missing it.

Usage: python scripts/add_repr_to_models.py
"""

import ast
import os

MODELS_DIR = os.path.join(os.path.dirname(__file__), "..", "app", "models")


def get_model_classes(filepath):
    """Parse a Python file and return all SQLAlchemy model class definitions."""
    with open(filepath) as f:
        content = f.read()
    tree = ast.parse(content)
    classes = []
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef):
            # Only process classes that inherit from Base or TenantAwareMixin
            base_names = []
            for base in node.bases:
                if isinstance(base, ast.Name):
                    base_names.append(base.id)
                elif isinstance(base, ast.Attribute):
                    base_names.append(base.attr)
            if "Base" in base_names or "TenantAwareMixin" in base_names:
                has_repr = any(
                    isinstance(item, ast.FunctionDef) and item.name == "__repr__"
                    for item in node.body
                )
                classes.append((node.name, node.lineno, node.end_lineno, has_repr))
    return classes, content


def add_repr_to_file(filepath, class_name, class_end_lineno):
    """Add __repr__ to a class that's missing it."""
    with open(filepath) as f:
        lines = f.readlines()

    # Find the last line of the class (de-indent to find class end)
    # The class_end_lineno from AST is usually the last line of the last method
    # We need to find the actual end of the class
    insert_line = class_end_lineno
    # Walk backwards from the suggested end to find the last meaningful line
    while insert_line < len(lines) and lines[insert_line - 1].strip() == "":
        insert_line += 1

    indent = "    "
    repr_code = f'\n{indent}def __repr__(self):\n{indent}    return f"<{class_name} {{self.id}}>"\n'

    lines.insert(insert_line, repr_code)
    with open(filepath, "w") as f:
        f.writelines(lines)
    return True


def main():
    fixed = 0
    for filename in sorted(os.listdir(MODELS_DIR)):
        if not filename.endswith(".py") or filename == "__init__.py":
            continue
        filepath = os.path.join(MODELS_DIR, filename)
        classes, content = get_model_classes(filepath)
        for class_name, lineno, end_lineno, has_repr in classes:
            if not has_repr:
                print(f"  {filename}:{lineno} {class_name} -- adding __repr__")
                add_repr_to_file(filepath, class_name, end_lineno)
                fixed += 1

    print(f"\nDone. Added __repr__ to {fixed} classes.")


if __name__ == "__main__":
    main()
