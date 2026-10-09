"""Every work-order mutation must clear the cached detail payload.

`get_work_order` caches its result under `work_order:{id}` for 300 seconds.
Nothing used to invalidate it, so the sequence a shop-floor user actually
performs — start an operation, then look at the work order — returned the
pre-mutation snapshot for up to five minutes. The operation they had just
started still showed as not started, so they started it again.

This pins the invalidation at the source level rather than through Redis,
because the test suite runs with no Redis: `cache_invalidate` returns early
when `get_redis()` is None, so a behavioural assertion would pass whether or
not the call exists.
"""

import ast
import pathlib

SERVICE = (
    pathlib.Path(__file__).resolve().parents[1] / "services" / "work_order_service.py"
)

# Everything that changes a work order or its children. `get_work_order` is
# the reader and is deliberately absent.
MUTATIONS = {
    "perform_work_order_action",
    "add_work_order_operation",
    "start_operation",
    "complete_operation",
    "add_work_order_material",
    "issue_material_to_work_order",
}


def _functions_calling_invalidate() -> set[str]:
    tree = ast.parse(SERVICE.read_text(encoding="utf8"))
    found = set()
    for node in ast.walk(tree):
        if not isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef)):
            continue
        for sub in ast.walk(node):
            if isinstance(sub, ast.Call):
                fn = sub.func
                name = getattr(fn, "id", None) or getattr(fn, "attr", None)
                if name == "cache_invalidate":
                    found.add(node.name)
    return found


def test_every_mutation_invalidates_the_cached_detail():
    calling = _functions_calling_invalidate()
    missing = MUTATIONS - calling
    assert not missing, (
        "These work-order mutations do not call cache_invalidate, so "
        f"get_work_order will serve a stale payload for up to 300s: {sorted(missing)}"
    )


def test_the_reader_does_not_invalidate():
    """Guard the guard: if cache_invalidate were called from get_work_order the
    cache would be pointless, and the test above would still pass."""
    assert "get_work_order" not in _functions_calling_invalidate()


def test_invalidation_targets_the_same_key_the_reader_writes():
    """A mutation clearing a different key than the reader caches under would
    look correct and fix nothing."""
    src = SERVICE.read_text(encoding="utf8")
    assert 'cache_key = f"work_order:{wo_id}"' in src, "reader's cache key changed shape"
    assert src.count('cache_invalidate(f"work_order:{wo_id}")') == len(MUTATIONS), (
        "a mutation invalidates a key that is not the one get_work_order caches under"
    )
