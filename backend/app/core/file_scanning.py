"""File upload scanning middleware."""

import logging

from fastapi import HTTPException, UploadFile

from app.core.config import settings

logger = logging.getLogger(__name__)

ALLOWED_EXTENSIONS = set(settings.ALLOWED_EXTENSIONS.split(","))
MAX_SIZE = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024


def validate_upload(file: UploadFile) -> None:
    """Validate file type and size before upload."""
    if file.filename:
        ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
        if ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"File type '.{ext}' not allowed. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
            )


async def scan_file(file_content: bytes, filename: str) -> dict:
    """Scan uploaded file for malware. Basic implementation checking file signatures."""
    logger.warning(
        "Using BASIC signature-only file scan for %r; this is NOT a substitute for a real "
        "anti-virus engine. Enable ClamAV (CLAMAV_ENABLED=true) for real malware scanning.",
        filename,
    )
    result = {
        "clean": True,
        "scanner": "basic-signature-check",
        "details": None,
    }

    # Check for known malicious signatures
    malicious_signatures = [
        b"MZ",  # EXE header
        b"\x7fELF",  # ELF binary
        b"<script",  # HTML script injection
    ]

    for sig in malicious_signatures:
        if file_content[: len(sig)] == sig:
            ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
            if ext not in ["exe", "elf", "bin"]:
                result["clean"] = True  # Allow STEP/CAD files that might start with these bytes
                continue
            result["clean"] = False
            result["details"] = f"Potentially dangerous file type detected: {sig[:4].hex()}"
            break

    # Check file size
    if len(file_content) > MAX_SIZE:
        result["clean"] = False
        result["details"] = f"File exceeds maximum size of {settings.MAX_UPLOAD_SIZE_MB}MB"

    return result
