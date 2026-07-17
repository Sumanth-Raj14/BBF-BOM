import re
from datetime import UTC, datetime

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.deps import get_current_user

router = APIRouter(dependencies=[Depends(get_current_user)])


class ScrapeRequest(BaseModel):
    url: str
    mode: str = "auto"


def _extract_meta(html: str, patterns: dict) -> dict:
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(html, "html.parser")
    data = {}

    for key, selectors in patterns.items():
        for sel in selectors:
            el = soup.select_one(sel)
            if el:
                text = el.get_text(strip=True)
                if text:
                    data[key] = text
                    break

    title_tag = soup.find("title")
    if title_tag and "title" not in data:
        data["title"] = title_tag.get_text(strip=True)

    for meta in soup.find_all("meta"):
        name = (meta.get("name") or meta.get("property") or "").lower()
        content = meta.get("content", "")
        if "description" in name and content:
            data["meta_description"] = content[:500]
            break

    return data


DIGIKEY_PATTERNS = {
    "pn": [
        "span#product-details__mfr-part-number",
        ".product-details__mfr-part-number",
    ],
    "mpn": ["span#product-details__mfr-part-number"],
    "manufacturer": [".product-details__company-name", "span.manufacturer-name"],
    "description": [".product-details__header-description", "h1.product-title"],
    "price": [".product-pricing__unit-price", ".pricing__total-price"],
    "stock": [".product-details__avail", "#product-details__stock-info"],
}

MOUSER_PATTERNS = {
    "pn": [".pdpPricingSKU__skuNum", "#product-nomenclature"],
    "manufacturer": [".pdpPricingSKU__mfrName"],
    "description": ["h1.product-desc", ".pdpDescription__body"],
    "price": [".pdpPricing__unitPrice", ".price-break-1"],
    "stock": [".pdpShipping__avail", ".pdpAvail"],
}

GENERIC_PATTERNS = {
    "title": ["h1", "title", ".product-title"],
    "description": ["meta[name=description]", ".description", "p"],
    "price": [".price", "[itemprop=price]", ".cost"],
    "pn": ["[itemprop=sku]", ".part-number", ".sku"],
}


@router.post("/scrape")
async def scrape_component(req: ScrapeRequest):
    url = req.url.strip()
    if not url.startswith(("http://", "https://")):
        url = "https://" + url

    try:
        async with httpx.AsyncClient(
            timeout=15,
            follow_redirects=True,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"},
        ) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            html = resp.text
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"Upstream returned {e.response.status_code}")
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch URL: {str(e)}")

    url_lower = url.lower()
    if "digikey" in url_lower:
        source = "digikey"
        patterns = DIGIKEY_PATTERNS
    elif "mouser" in url_lower:
        source = "mouser"
        patterns = MOUSER_PATTERNS
    else:
        source = "generic"
        patterns = GENERIC_PATTERNS

    extracted = _extract_meta(html, patterns)

    price_raw = extracted.get("price", "")
    price_val = None
    if price_raw:
        match = re.search(r"[\d,]+\.?\d*", price_raw.replace(",", ""))
        if match:
            price_val = float(match.group())

    return {
        "source": source,
        "sourceUrl": url,
        "pn": extracted.get("pn", extracted.get("title", "Unknown")),
        "mpn": extracted.get("mpn", extracted.get("pn", "N/A")),
        "manufacturer": extracted.get("manufacturer", "Unknown"),
        "description": extracted.get("description", extracted.get("meta_description", "")),
        "priceBreaks": [{"qty": 1, "price": price_val}] if price_val else [],
        "stock": extracted.get("stock"),
        "scrapedAt": datetime.now(UTC).isoformat(),
        "rawExtracted": extracted,
    }


@router.get("/history")
async def scrape_history():
    return {"history": [], "message": "Scraping history not yet persisted"}
