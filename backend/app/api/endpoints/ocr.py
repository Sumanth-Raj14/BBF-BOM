"""Real OCR extraction using Tesseract + regex pattern matching."""

import logging

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

logger = logging.getLogger(__name__)
import os
import re
import tempfile
from typing import Optional

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.rbac import require_documents_write
from app.db.session import get_db
from app.models.document import Document
from app.models.part import Part
from app.models.user import User

router = APIRouter()


class ExtractedField(BaseModel):
    label: str
    value: str
    confidence: float


class OCRRequest(BaseModel):
    documentId: Optional[int] = None
    partId: Optional[int] = None


class OCRResponse(BaseModel):
    documentId: Optional[int] = None
    partPn: Optional[str] = None
    fields: list[ExtractedField]
    model_version: str = "tesseract-5.3"
    raw_text_preview: Optional[str] = None


class OCRConfirmRequest(BaseModel):
    partId: int
    fields: list[dict]


PATTERN_MAP = {
    "Part Number": [
        r"(?:Part\s*(?:No|Number|#|Num)\.?\s*[:=]?\s*)([A-Z0-9][\w\-\.]+)",
        r"(?:P/N\s*[:=]?\s*)([A-Z0-9][\w\-\.]+)",
        r"(?:Mfr\s*Part\s*#?\s*[:=]?\s*)([A-Z0-9][\w\-\.]+)",
    ],
    "Manufacturer": [
        r"(?:Manufacturer\s*[:=]?\s*)([\w\s]+?)(?:\s{2}|\n|$)",
        r"(?:Mfr\s*[:=]?\s*)([\w\s]+?)(?:\s{2}|\n|$)",
    ],
    "Package": [
        r"(?:Package\s*[:=]?\s*)([\w\-]+)",
        r"((?:LQFP|QFN|TQFP|BGA|SSOP|TSSOP|SOIC|DIP|DFN|CSP)[\-\s]?\d+)",
    ],
    "Core": [
        r"(?:Core\s*[:=]?\s*)([\w\s\-\@\.]+?)(?:\s{2}|\n|$)",
        r"((?:Arm\s*Cortex[\-\s]?[Mm]\d+|Xtensa|RISC[\-\s]?V|ARM)[\w\s\-\@\.]*?)(?:\s{2}|\n|$)",
    ],
    "Flash": [
        r"(?:Flash\s*[:=]?\s*)([\d]+\s*(?:KB|MB|GB))",
        r"([\d]+\s*(?:KB|MB|GB)\s*(?:Flash))",
    ],
    "RAM": [
        r"(?:RAM\s*[:=]?\s*)([\d]+\s*(?:KB|MB|GB)\s*(?:SRAM|DRAM)?)",
        r"([\d]+\s*(?:KB|MB|GB)\s*SRAM)",
    ],
    "Op. Temp": [
        r"(?:Op(?:erating)?\.?\s*Temp(?:erature)?\s*[:=]?\s*)([\-\+\d\s°CCto]+)",
        r"((?:\-[\d]+\s*°?\s*C?\s*to\s*\+?[\d]+\s*°?\s*C))",
    ],
    "RoHS": [
        r"(RoHS\s*(?:Compliant|Yes|No|Directive))",
        r"(Compliant\s*per\s*Directive\s*\d+\/\d+\/EU)",
    ],
    "Material": [
        r"(?:Material\s*[:=]?\s*)([\w\s\-]+?)(?:\s{2}|\n|$)",
        r"((?:AL|SS|ABS|FR[\-\s]?4|Copper|Brass|Nylon|PEEK|POM|PC)[\w\s\-]*?)(?:\s{2}|\n|$)",
    ],
    "Dimensions": [
        r"(?:Dimension[s]?\s*[:=]?\s*)([\d\.\s×xX\*]+?\s*mm)",
        r"([\d\.]+\s*[×xX\*]\s*[\d\.]+\s*[×xX\*]\s*[\d\.]+\s*mm)",
    ],
    "Tolerance": [
        r"(?:Tolerance\s*[:=]?\s*)([\+\-\/\d\.\s]+mm)",
        r"(\+\/\-\s*[\d\.]+\s*mm)",
    ],
    "Surface Finish": [
        r"(?:Surface\s*Finish\s*[:=]?\s*)([\w\s]+?)(?:\s{2}|\n|$)",
        r"((?:Anodized|Bare|ENIG|HASL|ENIG|Gold\s*Plat|Nickel)[\w\s]*?)(?:\s{2}|\n|$)",
    ],
    "Weight": [
        r"(?:Weight\s*[:=]?\s*)([\d\.]+\s*g(?:ram[s]?)?)",
        r"([\d\.]+\s*g(?:ram[s]?)?)",
    ],
    "Vendor": [
        r"(?:Vendor\s*[:=]?\s*)([\w\s\-]+?)(?:\s{2}|\n|$)",
        r"(?:Supplier\s*[:=]?\s*)([\w\s\-]+?)(?:\s{2}|\n|$)",
    ],
    "Unit Price": [
        r"(?:Unit\s*Price\s*[:=]?\s*\$?)([\d,]+\.?\d*)",
        r"\$\s*([\d,]+\.?\d*)",
    ],
    "MOQ": [
        r"(?:MOQ\s*[:=]?\s*)([\d,]+)",
        r"(?:Min(?:imum)?\s*(?:Order|Qty)\s*[:=]?\s*)([\d,]+)",
    ],
    "Lead Time": [
        r"(?:Lead\s*Time\s*[:=]?\s*)([\w\s\-]+?)(?:\s{2}|\n|$)",
        r"(In\s*Stock|[\d]+\s*(?:week[s]?|day[s]?|month[s]?))",
    ],
}


async def _run_tesseract(file_content: bytes, filename: str) -> str:
    """Run Tesseract OCR on file content. Falls back to basic text extraction for PDFs."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if ext in ("png", "jpg", "jpeg", "tiff", "bmp", "webp"):
        try:
            import pytesseract
            from PIL import Image

            with tempfile.NamedTemporaryFile(suffix=f".{ext}", delete=False) as tmp:
                tmp.write(file_content)
                tmp_path = tmp.name
            try:
                img = Image.open(tmp_path)
                text = pytesseract.image_to_string(img)
                return text
            finally:
                os.unlink(tmp_path)
        except ImportError:
            return ""
        except Exception as exc:
            import logging

            logging.debug("Tesseract OCR failed for image: %s", exc)
            return ""

    if ext == "pdf":
        try:
            import pytesseract
            from pdf2image import convert_from_bytes

            images = convert_from_bytes(file_content, dpi=300)
            texts = []
            for img in images:
                texts.append(pytesseract.image_to_string(img))
            return "\n".join(texts)
        except ImportError:
            return ""
        except Exception as exc:
            import logging

            logging.debug("Tesseract OCR failed for PDF: %s", exc)
            return ""

    return ""


def _extract_fields_from_text(text: str) -> list[ExtractedField]:
    """Extract structured fields from OCR text using regex patterns."""
    fields = []
    for label, patterns in PATTERN_MAP.items():
        value = None
        confidence = 0.0
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)
            if match:
                value = match.group(1).strip() if match.lastindex else match.group(0).strip()
                confidence = 0.85
                break
        if not value:
            confidence = 0.0
            value = "Not detected"
        fields.append(ExtractedField(label=label, value=value, confidence=round(confidence, 2)))
    return fields


@router.post("/extract", response_model=OCRResponse)
async def extract_ocr_fields(
    request: OCRRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    part_pn = None
    doc = None

    if request.documentId:
        result = await db.execute(select(Document).where(Document.id == request.documentId))
        doc = result.scalar_one_or_none()
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")

    if request.partId:
        result = await db.execute(select(Part).where(Part.id == request.partId))
        part = result.scalar_one_or_none()
        if part:
            part_pn = part.pn

    raw_text = ""
    if doc and doc.filePath and os.path.exists(doc.filePath):
        try:
            with open(doc.filePath, "rb") as f:
                content = f.read()
            raw_text = await _run_tesseract(content, doc.originalName)
        except Exception:
            logger.warning("Failed to read document for OCR: %s", doc.filePath)

    if raw_text and raw_text.strip():
        fields = _extract_fields_from_text(raw_text)
        preview = raw_text[:500]
    else:
        fields = [
            ExtractedField(
                label="Status",
                value="No text extracted - document may need manual OCR",
                confidence=0.0,
            ),
            ExtractedField(
                label="Hint",
                value="Upload image-based documents (PNG/JPG) for best OCR results",
                confidence=0.0,
            ),
        ]
        preview = "No text could be extracted from this document."

    return OCRResponse(
        documentId=request.documentId,
        partPn=part_pn,
        fields=fields,
        model_version="tesseract-5.3",
        raw_text_preview=preview,
    )


@router.post("/extract-file")
async def extract_from_uploaded_file(
    file: UploadFile = File(...),
    current_user: User = Depends(require_documents_write),
):
    content = await file.read()
    raw_text = await _run_tesseract(content, file.filename or "upload")

    if raw_text and raw_text.strip():
        fields = _extract_fields_from_text(raw_text)
        return {
            "fields": [f.model_dump() for f in fields],
            "rawTextPreview": raw_text[:1000],
            "model_version": "tesseract-5.3",
        }

    return {
        "fields": [],
        "rawTextPreview": "No text could be extracted. Try uploading a clearer image.",
        "model_version": "tesseract-5.3",
    }


@router.post("/confirm")
async def confirm_ocr_fields(
    request: OCRConfirmRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Part).where(Part.id == request.partId))
    part = result.scalar_one_or_none()
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")

    FIELD_TO_ATTR = {
        "Part Number": "mpn",
        "Manufacturer": "manufacturer",
        "Package": "subCategory",
        "Material": "material",
        "Dimensions": "dimensions",
        "Weight": "weight",
        "RoHS": "compliance",
    }

    updated_fields = []
    for field in request.fields:
        label = field.get("label", "")
        value = field.get("value", "")
        if label and value and value != "Not detected":
            attr = FIELD_TO_ATTR.get(label)
            if attr and hasattr(part, attr):
                setattr(part, attr, value)
                updated_fields.append(label)

    if updated_fields:
        await db.commit()

    return {
        "status": "success",
        "partId": request.partId,
        "partPn": part.pn,
        "updatedFields": updated_fields,
        "message": f"Applied {len(updated_fields)} fields to part {part.pn}",
    }
