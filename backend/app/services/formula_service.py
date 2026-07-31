"""Calculated/formula custom-attribute evaluator (Track D).

Evaluates `CustomAttributeDefinition.formula` (a small arithmetic expression
referencing other numeric attributes/fields, e.g. "qty * unit_cost") for a
given entity WITHOUT ever calling Python's `eval`/`exec`. The expression is
parsed with `ast.parse(..., mode="eval")` and walked by hand against a strict
node-type whitelist -- literal numbers, +-*/%//**, unary +/-, and bare name
lookups into a supplied numeric context. Anything else (function calls,
attribute/subscript access, string/byte literals, comparisons, boolean
operators, comprehensions, lambdas, walrus, imports, ...) is rejected before
any part of the expression is evaluated.
"""

import ast
import operator
from typing import Optional, Union

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enterprise_extensions import CustomAttributeDefinition
from app.models.part import Part

Number = Union[int, float]


class FormulaError(ValueError):
    """Raised for a malformed, disallowed, or unresolvable formula."""


_ALLOWED_BINOPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
    ast.FloorDiv: operator.floordiv,
}

_ALLOWED_UNARYOPS = {
    ast.UAdd: operator.pos,
    ast.USub: operator.neg,
}


def _is_plain_number(value: object) -> bool:
    # bool is a subclass of int in Python -- explicitly excluded so
    # `True`/`False` never sneak in as 1/0.
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _eval_node(node: ast.AST, context: dict[str, Number]) -> Number:
    if isinstance(node, ast.Expression):
        return _eval_node(node.body, context)

    if isinstance(node, ast.Constant):
        if not _is_plain_number(node.value):
            raise FormulaError(f"Unsupported constant in formula: {node.value!r}")
        return node.value

    if isinstance(node, ast.BinOp):
        op_type = type(node.op)
        if op_type not in _ALLOWED_BINOPS:
            raise FormulaError(f"Operator '{op_type.__name__}' is not allowed in formulas")
        left = _eval_node(node.left, context)
        right = _eval_node(node.right, context)
        try:
            return _ALLOWED_BINOPS[op_type](left, right)
        except ZeroDivisionError as e:
            raise FormulaError("Division by zero in formula") from e

    if isinstance(node, ast.UnaryOp):
        op_type = type(node.op)
        if op_type not in _ALLOWED_UNARYOPS:
            raise FormulaError(f"Unary operator '{op_type.__name__}' is not allowed in formulas")
        return _ALLOWED_UNARYOPS[op_type](_eval_node(node.operand, context))

    if isinstance(node, ast.Name):
        if node.id not in context:
            raise FormulaError(f"Unknown variable '{node.id}' referenced in formula")
        value = context[node.id]
        if not _is_plain_number(value):
            raise FormulaError(f"Variable '{node.id}' does not have a numeric value")
        return value

    # Everything else -- Call, Attribute, Subscript, BoolOp, Compare, IfExp,
    # Lambda, comprehensions, Str/Bytes/JoinedStr, Dict/List/Set/Tuple,
    # NamedExpr (walrus), Starred, etc. -- is deliberately rejected.
    raise FormulaError(
        f"Unsupported expression element '{type(node).__name__}' -- only arithmetic "
        "over numeric literals and named variables is allowed"
    )


def evaluate_formula(formula: str, context: Optional[dict[str, Number]] = None) -> Number:
    """Safely evaluate a restricted arithmetic expression string.

    `context` maps variable names referenced in the formula (e.g. "qty",
    "unit_cost") to their current numeric value. Raises `FormulaError` for
    empty/unparsable input, any disallowed construct, an unresolvable name,
    or division by zero.
    """
    if not formula or not formula.strip():
        raise FormulaError("Formula is empty")
    try:
        tree = ast.parse(formula, mode="eval")
    except SyntaxError as e:
        raise FormulaError(f"Invalid formula syntax: {e.msg}") from e
    return _eval_node(tree, context or {})


# ---- Entity-bound computation ----

# Numeric Part columns exposed to formulas for entity_type="part", plus a
# couple of friendlier aliases matching common formula vocabulary (e.g. the
# "qty * unit_cost" example) without requiring a schema/column rename.
_PART_NUMERIC_FIELDS = ("qty", "cost", "weight", "freight", "tax", "landedCost", "lead")
_PART_ALIASES = {"unit_cost": "cost", "landed_cost": "landedCost"}


async def _entity_numeric_context(
    db: AsyncSession, tenant_id: Optional[int], entity_type: str, entity_id: Optional[int]
) -> dict[str, Number]:
    context: dict[str, Number] = {}
    if entity_type == "part" and entity_id is not None:
        stmt = select(Part).where(Part.id == entity_id)
        if tenant_id is not None:
            stmt = stmt.where(Part.tenantId == tenant_id)
        part = (await db.execute(stmt)).scalar_one_or_none()
        if part is None:
            raise HTTPException(status_code=404, detail=f"Part with ID {entity_id} not found")
        for field in _PART_NUMERIC_FIELDS:
            value = getattr(part, field, None)
            if value is not None:
                try:
                    context[field] = float(value)
                except (TypeError, ValueError):
                    continue
        for alias, source in _PART_ALIASES.items():
            if source in context:
                context[alias] = context[source]
    return context


async def compute_custom_attribute(
    db: AsyncSession,
    tenant_id: Optional[int],
    attribute_definition_id: int,
    entity_type: str,
    entity_id: Optional[int] = None,
    extra_context: Optional[dict[str, Number]] = None,
) -> dict:
    """Compute the value of a computed/formula CustomAttributeDefinition for
    one entity. `extra_context` may supply/override numeric variables not
    resolvable from the entity's own row (e.g. ad-hoc values not persisted
    anywhere)."""
    stmt = select(CustomAttributeDefinition).where(CustomAttributeDefinition.id == attribute_definition_id)
    if tenant_id is not None:
        stmt = stmt.where(CustomAttributeDefinition.tenantId == tenant_id)
    definition = (await db.execute(stmt)).scalar_one_or_none()
    if definition is None:
        raise HTTPException(status_code=404, detail="Custom attribute definition not found")

    if not definition.is_computed or not definition.formula:
        raise HTTPException(
            status_code=400,
            detail="This custom attribute definition is not a computed/formula attribute",
        )

    if definition.entity_type and entity_type and definition.entity_type != entity_type:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Custom attribute definition {attribute_definition_id} is scoped to "
                f"entity_type='{definition.entity_type}', not '{entity_type}'"
            ),
        )

    context = await _entity_numeric_context(db, tenant_id, entity_type, entity_id)
    if extra_context:
        for key, value in extra_context.items():
            if not _is_plain_number(value):
                raise HTTPException(
                    status_code=400, detail=f"Context value for '{key}' is not numeric"
                )
            context[key] = value

    try:
        value = evaluate_formula(definition.formula, context)
    except FormulaError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    return {
        "attribute_definition_id": definition.id,
        "attribute_name": definition.attribute_name,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "formula": definition.formula,
        "value": value,
    }
