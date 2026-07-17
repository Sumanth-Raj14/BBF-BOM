#!/usr/bin/env python3
"""
Refactor window.* globals to ES module imports across all JSX/JS files.

Mapping of window.* properties to their import sources (from globals.js):
- Most refs resolve to 'globals' (the central re-export hub)
- Some go directly to their source module
"""

import os
import re
import sys

SRC_DIR = os.path.join(os.path.dirname(__file__), "frontend", "src")

# Properties that will be replaced via import from globals.js
# Each entry: (window_prop, import_name) — both are usually the same
MAPPING = {
    # API layer
    "api": "api",
    "apiRequest": "apiRequest",
    "escapeHtml": "escapeHtml",
    "openPrintWindow": "openPrintWindow",
    "setOnUnauthorized": "setOnUnauthorized",
    # Individual API modules (rarely used directly)
    "poOrdersAPI": "poOrdersAPI",
    "analyticsAPI": "analyticsAPI",
    "cadAPI": "cadAPI",
    "scrapingAPI": "scrapingAPI",
    "webhooksAPI": "webhooksAPI",
    "bulkImportAPI": "bulkImportAPI",
    "erpConnectorsAPI": "erpConnectorsAPI",
    "supplierPortalAPI": "supplierPortalAPI",
    "monitoringAPI": "monitoringAPI",
    "aiAPI": "aiAPI",
    "approvalAutomationAPI": "approvalAutomationAPI",
    "orderTrackingAPI": "orderTrackingAPI",
    "workOrdersAPI": "workOrdersAPI",
    "ecoAPI": "ecoAPI",
    "inventoryAPI": "inventoryAPI",
    "qualityAPI": "qualityAPI",
    "userDataSyncAPI": "userDataSyncAPI",
    "calendarEventsAPI": "calendarEventsAPI",
    "tenantsAPI": "tenantsAPI",
    # Core UI
    "Icon": "Icon",
    "Modal": "Modal",
    "Popover": "Popover",
    "DropdownButton": "DropdownButton",
    "useAppStore": "useAppStore",
    "AppCtx": "AppCtx",
    "ToastHost": "ToastHost",
    # Enterprise utils
    "ErrorBoundary": "ErrorBoundary",
    "Skeleton": "Skeleton",
    "SkeletonTable": "SkeletonTable",
    "SkeletonCards": "SkeletonCards",
    "EmptyState": "EmptyState",
    "LoadingState": "LoadingState",
    "ErrorState": "ErrorState",
    "sanitize": "sanitize",
    "csrf": "csrf",
    "rateLimiter": "rateLimiter",
    "perf": "perf",
    "a11y": "a11y",
    "normalize": "normalize",
    "fetchWithRetry": "fetchWithRetry",
    "register": "register",
    "unregister": "unregister",
    "getShortcuts": "getShortcuts",
    "setEnabled": "setEnabled",
    "keyboardShortcuts": "keyboardShortcuts",
    # BOM editor
    "INR": "INR",
    "fmt": "fmt",
    "BomEditor": "BomEditor",
    "Sparkline": "Sparkline",
    "LeadHeat": "LeadHeat",
    "STATUS_CLASS": "STATUS_CLASS",
    "USD_TO_INR": "USD_TO_INR",
    "setConversionRate": "setConversionRate",
    # Collaboration
    "CollabProvider": "CollabProvider",
    "useCollab": "useCollab",
    "CollaborationBar": "CollaborationBar",
    "CursorOverlay": "CursorOverlay",
    "PresenceAvatar": "PresenceAvatar",
    "CollabContext": "CollabContext",
    "Presence": "Presence",
    # Dashboard
    "DashboardScreen": "DashboardScreen",
    "WORKSPACE_BUDGET": "WORKSPACE_BUDGET",
    # Detail drawer
    "Drawer": "Drawer",
    # Auth
    "ROLES": "ROLES",
    "TenantContext": "TenantContext",
    "AuthScreen": "AuthScreen",
    "OnboardingWizard": "OnboardingWizard",
    "MobileScanView": "MobileScanView",
    "TenantSettingsModal": "TenantSettingsModal",
    # Enterprise final
    "setTheme": "setTheme",
    "toggleTheme": "toggleTheme",
    "prefetch": "prefetch",
    "memo": "memo",
    "securityAudit": "securityAudit",
    "validate": "validate",
    "notify": "notify",
    "exportData": "exportData",
    "bulkOps": "bulkOps",
    "searchEngine": "searchEngine",
    "VirtualList": "VirtualList",
    "LazyLoad": "LazyLoad",
    "ContextMenu": "ContextMenu",
    "Tooltip": "Tooltip",
    # Power features
    "UNDO": "UNDO",
    "recordUndo": "recordUndo",
    "runUndo": "runUndo",
    "applyAccessibilityTheme": "applyAccessibilityTheme",
    "CommandPalette": "CommandPalette",
    "WorkOrdersScreen": "WorkOrdersScreen",
    "NCRScreen": "NCRScreen",
    "LandedCostModal": "LandedCostModal",
    "MarginModal": "MarginModal",
    "ShareLinkModal": "ShareLinkModal",
    "WebhooksModal": "WebhooksModal",
    "ScheduledReportsModal": "ScheduledReportsModal",
    "EmailParseModal": "EmailParseModal",
    # Final polish
    "useURLState": "useURLState",
    "getSavedSearches": "getSavedSearches",
    "saveSavedSearch": "saveSavedSearch",
    "SAVED_SEARCHES_KEY": "SAVED_SEARCHES_KEY",
    "ApprovalsScreen": "ApprovalsScreen",
    "RoadmapModal": "RoadmapModal",
    "BulkVendorImportModal": "BulkVendorImportModal",
    "NotifPrefsModal": "NotifPrefsModal",
    "NetworkBadge": "NetworkBadge",
    # Prod additions
    "optimistic": "optimistic",
    "ErrorScreen": "ErrorScreen",
    "SkeletonRows": "SkeletonRows",
    "InventoryScreen": "InventoryScreen",
    "PricingModal": "PricingModal",
    "ProductTour": "ProductTour",
    # Data
    "BOM_DATA": "BOM_DATA",
    "PROJECTS": "PROJECTS",
    # Cloud sync
    "cloudSync": "cloudSync",
    # Download utils
    "downloadCSV": "downloadCSV",
    "downloadJSON": "downloadJSON",
    "generateXLSX": "generateXLSX",
    "downloadBlob": "downloadBlob",
    "printBOM": "printBOM",
    # Shared
    "BomShell": "BomShell",
    "LoadingScreen": "LoadingScreen",
    "LoadingSkeleton": "LoadingSkeleton",
    # i18n
    "__t": "__t",
}

# Properties that should NOT be replaced (native browser APIs or framework globals)
SKIP_PROPS = {
    "addEventListener",
    "removeEventListener",
    "dispatchEvent",
    "innerWidth",
    "innerHeight",
    "outerWidth",
    "outerHeight",
    "location",
    "document",
    "fetch",
    "setTimeout",
    "setInterval",
    "clearTimeout",
    "clearInterval",
    "console",
    "Math",
    "JSON",
    "String",
    "Number",
    "Boolean",
    "Array",
    "Object",
    "Date",
    "RegExp",
    "Error",
    "Promise",
    "Map",
    "Set",
    "Symbol",
    "parseInt",
    "parseFloat",
    "isNaN",
    "isFinite",
    "decodeURI",
    "encodeURI",
    "decodeURIComponent",
    "encodeURIComponent",
    "undefined",
    "null",
    "NaN",
    "localStorage",
    "sessionStorage",
    "history",
    "navigator",
    "screen",
    "crypto",
    "performance",
    "matchMedia",
    "scrollTo",
    "open",
    "print",
    "parent",
    "self",
    "top",
    "frames",
    "closed",
    "defaultStatus",
    "defaultstatus",
    "name",
    "status",
    "opener",
    "XMLSerializer",
    "PropTypes",
    "React",
    "ReactDOM",  # These come from setup.js / main.jsx
    "__changeLang",  # Defined in main.jsx
    "screenDataBridge",  # Different concern
}

# Properties that should NOT be auto-replaced (dynamic runtime assignments)
# These are used as object references but assigned at runtime
RUNTIME_ONLY = {
    "__nav",
    "__open_approve_b",
    "__setBomSearch",
    "__screenData",
    "__BBOX_CONFIG",
    "__formatCurrency",
    "openModal",
    "ConfirmModal",
    "CostRollupView",
    "SourcingView",
    "window",  # window.window
}

# Combined set: properties we don't touch
NO_TOUCH = SKIP_PROPS | RUNTIME_ONLY

# Files to completely skip
SKIP_FILES = {
    "main.jsx",  # Entry point — sets up globals
    "globals.js",  # Central re-export hub
    "setup.js",  # Framework globals setup
}


def find_depth(filepath):
    """Calculate relative path depth from src/ to globals.js."""
    rel = os.path.relpath(filepath, SRC_DIR)
    depth = len(rel.split(os.sep)) - 1  # number of subdirectories
    if depth <= 1:
        return "../globals"
    else:
        return "../" * depth + "globals"


def already_imports_globals(content):
    """Check if file already has an import from globals."""
    return bool(
        re.search(r"import\s*\{[^}]*\}\s*from\s+['\"]\.\./globals['\"]", content)
    ) or bool(
        re.search(r"import\s*\{[^}]*\}\s*from\s+['\"]\.\./\.\./globals['\"]", content)
    )


def already_imports_toast(content):
    return 'from "../utils/toast"' in content or 'from "../../utils/toast"' in content


def already_imports_i18n(content):
    return (
        'from "../i18n"' in content
        or 'from "../../i18n"' in content
        or "'../i18n'" in content
        or '"../i18n"' in content
    )


def get_existing_imports(content):
    """Get set of identifiers already imported in the file."""
    imports = set()
    # Match: import { X, Y, Z } from '...'
    for m in re.finditer(r"import\s+\{([^}]+)\}\s+from\s+['\"][^'\"]+['\"]", content):
        for name in m.group(1).split(","):
            name = name.strip()
            # Handle aliases: X as Y
            if " as " in name:
                name = name.split(" as ")[1].strip()
            imports.add(name)
    # Match: import X from '...'
    for m in re.finditer(r"import\s+(\w+)\s+from\s+['\"][^'\"]+['\"]", content):
        imports.add(m.group(1).strip())
    return imports


def replace_window_refs(content, prop, name):
    """Replace window.X with X in content, handling JSX and JS contexts."""
    # Pattern: window.PROP (not followed by alphanumeric/underscore)
    # Be careful not to match window.PROP inside strings or comments
    # We use word boundary lookahead
    pattern = r"window\." + re.escape(prop) + r"(?![\w$])"

    # Special handling for window.Icon.X in JSX — needs to become Icon.X
    # This is already handled by the simple replacement since window.Icon.X
    # will match window.Icon (as a prefix) — BUT this could be problematic
    # because window.Icon.Bom would first match window.Icon and then leave .Bom
    # Actually re.sub replaces non-overlapping matches, so:
    # "window.Icon.Bom" would match "window.Icon" and replace to "Icon.Bom" ✓

    content = re.sub(pattern, name, content)
    return content


def process_file(filepath):
    """Process a single file to replace window.* refs with imports."""
    if os.path.basename(filepath) in SKIP_FILES:
        print(f"  SKIP (excluded): {os.path.relpath(filepath, SRC_DIR)}")
        return 0

    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    original = content

    # Find all window.X references in the file
    refs = set()
    for m in re.finditer(r"window\.(\w+)", content):
        prop = m.group(1)
        if prop not in NO_TOUCH and prop in MAPPING:
            refs.add(prop)

    if not refs:
        return 0

    rel_path = os.path.relpath(filepath, SRC_DIR)
    existing = get_existing_imports(content)

    # Determine what imports we need to add
    imports_needed = {}
    for prop in refs:
        name = MAPPING[prop]
        if name not in existing:
            imports_needed[name] = prop

    if not imports_needed:
        # All needed imports already exist — just replace
        for prop in refs:
            content = replace_window_refs(content, prop, MAPPING[prop])
        if content != original:
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(content)
            print(
                f"  REPLACED (existing imports): {rel_path} ({', '.join(sorted(refs))})"
            )
            return len(refs)
        return 0

    # Add import from globals if needed
    globals_path = find_depth(filepath)

    # Check if we can import everything from globals
    globals_imports = []
    for name, prop in sorted(imports_needed.items()):
        globals_imports.append(name)

    if globals_imports:
        import_line = (
            f"import {{ {', '.join(globals_imports)} }} from '{globals_path}';"
        )

        # Find a good insertion point: after the last import statement
        lines = content.split("\n")
        last_import_idx = -1
        for i, line in enumerate(lines):
            if line.strip().startswith("import "):
                last_import_idx = i

        if last_import_idx >= 0:
            # Insert after the last import
            lines.insert(last_import_idx + 1, import_line)
        else:
            # Insert at the top of the file
            # Check for shebang or directives
            insert_at = 0
            for i, line in enumerate(lines):
                if line.startswith("#!") or line.strip() == "":
                    insert_at = i + 1
                else:
                    break
            lines.insert(insert_at, import_line)

        content = "\n".join(lines)

    # Replace all window.X references
    for prop in refs:
        content = replace_window_refs(content, prop, MAPPING[prop])

    if content != original:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"  MODIFIED: {rel_path} ({', '.join(sorted(refs))})")
        return len(refs)

    return 0


def main():
    total_replaced = 0
    total_files = 0
    files_modified = []

    for root, dirs, files in os.walk(SRC_DIR):
        # Skip node_modules, dist, and __pycache__
        dirs[:] = [
            d
            for d in dirs
            if d not in ("node_modules", "dist", "__pycache__", ".pytest_cache")
        ]

        for f in files:
            if not (
                f.endswith(".jsx")
                or f.endswith(".js")
                or f.endswith(".tsx")
                or f.endswith(".ts")
            ):
                continue
            if (
                f.endswith(".test.js")
                or f.endswith(".test.jsx")
                or f.endswith(".test.ts")
            ):
                continue

            filepath = os.path.join(root, f)
            count = process_file(filepath)
            if count > 0:
                total_replaced += count
                total_files += 1
                files_modified.append(os.path.relpath(filepath, SRC_DIR))

    print(f"\n{'=' * 60}")
    print(f"Total: {total_replaced} window.* refs replaced across {total_files} files")
    print(f"{'=' * 60}")

    if files_modified:
        print("\nModified files:")
        for f in sorted(files_modified):
            print(f"  - {f}")


if __name__ == "__main__":
    main()
