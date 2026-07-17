import hashlib
import io
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.part import Part
from app.models.user import User

router = APIRouter()


class BarcodeGenerateRequest(BaseModel):
    partId: int
    format: Optional[str] = "code128"


class BarcodeLookupResponse(BaseModel):
    partId: int
    pn: str
    name: str
    barcode: str
    status: str
    vendor: Optional[str] = None
    cost: Optional[float] = None


def generate_barcode_string(pn: str, part_id: int) -> str:
    raw = f"{pn}-{part_id}-BLACKBOX"
    hash_val = hashlib.md5(raw.encode()).hexdigest()[:12].upper()
    return f"4988600{hash_val[:4]}{hash_val[4:8]}{hash_val[8:12]}"


def _render_barcode_image(code: str, fmt: str) -> bytes:
    buf = io.BytesIO()
    if fmt == "qr":
        import qrcode

        img = qrcode.make(code)
        img.save(buf, format="PNG")
    else:
        try:
            import barcode
            from barcode.writer import SVGWriter

            code_class = barcode.get_barcode_class(fmt)
            bc = code_class(code, writer=SVGWriter())
            bc.write(buf)
            return buf.getvalue()
        except Exception as exc:
            import logging

            logging.debug("Barcode SVG generation failed, using PIL fallback: %s", exc)
            from PIL import Image, ImageDraw

            img = Image.new("RGB", (400, 120), "white")
            draw = ImageDraw.Draw(img)
            draw.text((20, 10), code, fill="black")
            draw.rectangle([10, 80, 390, 85], fill="black")
            for i, ch in enumerate(code):
                x = 20 + i * 18
                if int(ch, 16) % 2:
                    draw.rectangle([x, 40, x + 12, 75], fill="black")
            img.save(buf, format="PNG")
    return buf.getvalue()


@router.get("/generate/{part_id}")
async def generate_part_barcode(
    part_id: int,
    fmt: str = Query(default="code128", alias="format"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Part).where(Part.id == part_id))
    part = result.scalar_one_or_none()
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")

    barcode_str = generate_barcode_string(part.pn, part.id)
    return {
        "partId": part.id,
        "pn": part.pn,
        "name": part.name,
        "barcode": barcode_str,
        "format": fmt,
        "imageUrl": f"/api/v1/barcodes/image/{part_id}?fmt={fmt}",
    }


@router.get("/image/{part_id}")
async def get_barcode_image(
    part_id: int,
    fmt: str = Query(default="code128", alias="format"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Part).where(Part.id == part_id))
    part = result.scalar_one_or_none()
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")

    barcode_str = generate_barcode_string(part.pn, part.id)
    media_type = "image/svg+xml" if fmt != "qr" else "image/png"
    img_bytes = _render_barcode_image(barcode_str, fmt)
    return Response(content=img_bytes, media_type=media_type)


@router.get("/qr/{part_id}")
async def get_qr_code(
    part_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Part).where(Part.id == part_id))
    part = result.scalar_one_or_none()
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")

    import qrcode

    qr = qrcode.QRCode(version=1, box_size=10, border=5)
    qr.add_data(f"PN:{part.pn}|ID:{part.id}|Name:{part.name}")
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return Response(content=buf.getvalue(), media_type="image/png")
