import pytest

pytestmark = pytest.mark.e2e


@pytest.mark.asyncio
async def test_login_flow(page, base_url):
    page.goto(f"{base_url}/login")
    assert page.url.endswith("/login")

    page.fill('input[name="email"]', "admin@blackbox.com")
    page.fill('input[name="password"]', "admin123")
    page.click('button[type="submit"]')

    page.wait_for_url("**/dashboard", timeout=10000)
    assert "dashboard" in page.url

    page.screenshot(path="screenshots/01_login_dashboard.png")


@pytest.mark.asyncio
async def test_bom_editor(page, base_url, login_page):
    page.goto(f"{base_url}/bom")
    page.wait_for_load_state("networkidle")

    assert "bom" in page.url.lower()

    tree_items = page.locator('[data-testid="bom-tree-item"], .bom-tree-item, [class*="tree-node"]')
    if tree_items.count() > 0:
        tree_items.first.click()
        page.wait_for_timeout(500)

    page.screenshot(path="screenshots/02_bom_editor.png")


@pytest.mark.asyncio
async def test_procurement_screen(page, base_url, login_page):
    page.goto(f"{base_url}/procurement")
    page.wait_for_load_state("networkidle")

    assert "procurement" in page.url.lower() or "po" in page.url.lower()

    po_rows = page.locator('tr, [data-testid="po-row"]')
    if po_rows.count() > 0:
        po_rows.first.click()
        page.wait_for_timeout(500)

    page.screenshot(path="screenshots/03_procurement.png")


@pytest.mark.asyncio
async def test_vendor_management(page, base_url, login_page):
    page.goto(f"{base_url}/vendors")
    page.wait_for_load_state("networkidle")

    create_btn = page.locator(
        'button:has-text("Create"), button:has-text("Add"), [data-testid="create-vendor"]'
    )
    if create_btn.count() > 0:
        create_btn.first.click()
        page.wait_for_timeout(500)

    page.screenshot(path="screenshots/04_vendors.png")


@pytest.mark.asyncio
async def test_analytics_dashboard(page, base_url, login_page):
    page.goto(f"{base_url}/analytics")
    page.wait_for_load_state("networkidle")

    assert "analytics" in page.url.lower()

    kpi_elements = page.locator(
        '[data-testid*="kpi"], [class*="kpi"], [class*="metric"], [class*="stat"]'
    )
    assert kpi_elements.count() > 0, "No KPI elements found on analytics page"

    page.screenshot(path="screenshots/05_analytics.png")


@pytest.mark.asyncio
async def test_global_search(page, base_url, login_page):
    page.keyboard.press("Meta+k")
    page.wait_for_timeout(500)

    search_input = page.locator(
        '[data-testid="global-search"], input[type="search"], [placeholder*="Search"], [placeholder*="search"]'
    )
    if search_input.count() > 0:
        search_input.first.fill("capacitor")
        page.wait_for_timeout(1000)

    page.screenshot(path="screenshots/06_global_search.png")
