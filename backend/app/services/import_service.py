"""CSV/XLSX import parsing + row validation for the bulk-import commit flow.

Ladder rung 2/5: this reuses the existing BulkImportJob/BulkImportRow models
(no schema change) and openpyxl (already a dependency, see requirements.txt).

Entity registry: only "parts" is implemented. Add a new entity by adding one
entry to ENTITY_SPECS with the target model + its field spec — the endpoint
code (mapping/validate/commit) is entity-agnostic and does not need to change.
Vendors is the documented next entry; not shipped in this pass.
"""

import csv
import io

import openpyxl

from app.models.part import Part

# ponytail: flat in-memory limits, not a per-tenant config. Bump the
# constants (or make them settings) if a real customer needs a bigger file.
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB
MAX_ROWS = 20_000

SUPPORTED_ENTITIES = {"parts"}

PART_FIELDS = {
    "pn",
    "name",
    "description",
    "rev",
    "qty",
    "uom",
    "category",
    "subCategory",
    "mpn",
    "htsCode",
    "unspscCode",
    "eccn",
    "vendor",
    "manufacturer",
    "cost",
    "lead",
    "origin",
    "status",
    "assembly",
    "barcode",
    "material",
    "weight",
    "dimensions",
    "imageUrl",
    "freight",
    "tax",
    "landedCost",
    "cadUrl",
}

ENTITY_SPECS = {
    "parts": {
        "model": Part,
        "natural_key": "pn",
        "fields": PART_FIELDS,
        "required": {"pn", "name"},
        "numeric": {"qty", "cost", "lead", "weight", "freight", "tax", "landedCost"},
        "int_fields": {"lead"},
        "bool_fields": {"assembly"},
        "enum": {
            "status": {
                "Draft",
                "Review",
                "Released",
                "Deprecated",
                "Obsolete",
                "Archived",
            },
            "category": {
                "Electrical",
                "Mechanical",
                "Software",
                "Assembly",
                "Raw Material",
                "Hardware",
                "Consumable",
                "Subcontract",
                "Packaging",
                "Tooling",
                "Other",
            },
        },
    },
    # vendors: extension point. Add {"model": Vendor, "natural_key": ...,
    # "fields": {...}} here once a Vendor import is requested; nothing else
    # below needs to change.
}


class ImportValidationError(ValueError):
    """Raised for structural problems (bad file, bad entity, unknown field)."""


def _parse_csv(content: bytes) -> list[dict]:
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    return [dict(row) for row in reader]


def _parse_xlsx(content: bytes) -> list[dict]:
    wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    ws = wb.worksheets[0]
    rows_iter = ws.iter_rows(values_only=True)
    header = next(rows_iter, None)
    if header is None:
        return []
    headers = [str(h).strip() if h is not None else f"col{i}" for i, h in enumerate(header)]
    rows = []
    for raw_row in rows_iter:
        if raw_row is None or all(v is None for v in raw_row):
            continue  # skip fully blank rows (openpyxl often over-reports the sheet's dimensions)
        row = {
            headers[i]: ("" if v is None else v) for i, v in enumerate(raw_row) if i < len(headers)
        }
        rows.append(row)
        if len(rows) > MAX_ROWS:
            raise ImportValidationError(f"Too many rows: limit is {MAX_ROWS}")
    return rows


def parse_file(filename: str, content: bytes) -> list[dict]:
    """Parse an uploaded CSV or XLSX file into a list of {column: value} dicts.

    Raises ImportValidationError for anything the caller should turn into a 400.
    """
    if len(content) > MAX_FILE_SIZE_BYTES:
        raise ImportValidationError(
            f"File too large: limit is {MAX_FILE_SIZE_BYTES // (1024 * 1024)}MB"
        )

    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext == "csv":
        rows = _parse_csv(content)
    elif ext in ("xlsx", "xlsm"):
        rows = _parse_xlsx(content)
    else:
        raise ImportValidationError("Unsupported file type: only .csv and .xlsx are accepted")

    if len(rows) > MAX_ROWS:
        raise ImportValidationError(f"Too many rows: limit is {MAX_ROWS}")
    return rows


def map_row(row_data: dict, mapping: dict[str, str]) -> dict:
    """Apply {file_column: entity_field} mapping to one raw row."""
    mapped = {}
    for file_col, target_field in mapping.items():
        if file_col in row_data:
            mapped[target_field] = row_data[file_col]
    return mapped


def validate_mapping_targets(entity: str, mapping: dict[str, str]) -> None:
    """Raise ImportValidationError if the mapping targets an unknown field."""
    spec = ENTITY_SPECS[entity]
    unknown = sorted({t for t in mapping.values() if t not in spec["fields"]})
    if unknown:
        raise ImportValidationError(
            f"Unknown field(s) for entity '{entity}': {', '.join(unknown)}"
        )


def validate_row(entity: str, mapped: dict) -> tuple[dict | None, list[str]]:
    """Validate+cast one mapped row against the entity spec.

    Returns (cleaned_dict, []) on success, or (None, [error messages]) on failure.
    Never touches the database — safe to call from both /mapping and /commit.
    """
    spec = ENTITY_SPECS[entity]
    errors: list[str] = []
    cleaned: dict = {}

    for field in spec["required"]:
        val = mapped.get(field)
        if val is None or (isinstance(val, str) and val.strip() == ""):
            errors.append(f"{field}: required field is missing")

    for field, val in mapped.items():
        if field not in spec["fields"]:
            continue  # unknown targets are already rejected at mapping time
        if val is None or (isinstance(val, str) and val.strip() == ""):
            cleaned[field] = None
            continue

        if field in spec["numeric"]:
            try:
                num = float(val)
            except (TypeError, ValueError):
                errors.append(f"{field}: '{val}' is not a number")
                continue
            cleaned[field] = int(num) if field in spec["int_fields"] else num
        elif field in spec["bool_fields"]:
            cleaned[field] = str(val).strip().lower() in ("1", "true", "yes", "y")
        elif field in spec.get("enum", {}):
            str_val = str(val).strip()
            if str_val not in spec["enum"][field]:
                errors.append(
                    f"{field}: '{val}' is not one of {sorted(spec['enum'][field])}"
                )
                continue
            cleaned[field] = str_val
        else:
            cleaned[field] = str(val).strip()

    if errors:
        return None, errors
    return cleaned, []
