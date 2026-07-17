"""ClamAV integration for file upload scanning."""

import asyncio
import logging
import os
import subprocess

logger = logging.getLogger(__name__)

CLAMAV_ENABLED = os.environ.get("CLAMAV_ENABLED", "false").lower() == "true"
CLAMAV_SOCKET = os.environ.get("CLAMAV_SOCKET", "/var/run/clamav/clamd.ctl")
CLAMAV_HOST = os.environ.get("CLAMAV_HOST", "127.0.0.1")
CLAMAV_PORT = int(os.environ.get("CLAMAV_PORT", "3310"))


async def scan_with_clamav(file_content: bytes, filename: str) -> dict:
    """Scan file with ClamAV. Returns clean status and details."""
    result = {
        "clean": True,
        "scanner": "clamav",
        "virusName": None,
        "details": None,
    }

    if not CLAMAV_ENABLED:
        logger.warning(
            "ClamAV scanning is DISABLED (CLAMAV_ENABLED != true); uploaded files are "
            "NOT scanned for malware. Do not treat uploads as trusted."
        )
        result["scanner"] = "clamav-disabled"
        result["details"] = "ClamAV scanning is disabled (set CLAMAV_ENABLED=true)"
        return result

    try:
        # subprocess.run blocks; run it in a worker thread so the event loop
        # is not stalled for the duration of the scan.
        proc = await asyncio.to_thread(
            subprocess.run,
            ["clamdscan", "--no-summary", "-"],
            input=file_content,
            capture_output=True,
            timeout=30,
        )

        output = proc.stdout.decode(errors="ignore")
        if "FOUND" in output:
            result["clean"] = False
            lines = [line.strip() for line in output.strip().split("\n") if "FOUND" in line]
            result["virusName"] = lines[0] if lines else "Unknown virus"
            result["details"] = f"Malware detected: {result['virusName']}"
        elif proc.returncode == 0:
            result["details"] = "File is clean"
        else:
            stderr = proc.stderr.decode(errors="ignore")
            result["scanner"] = "clamav-error"
            result["details"] = f"ClamAV error: {stderr[:200]}"
    except FileNotFoundError:
        result["scanner"] = "clamav-not-installed"
        result["details"] = "ClamAV is not installed on this system"
    except subprocess.TimeoutExpired:
        result["scanner"] = "clamav-timeout"
        result["details"] = "ClamAV scan timed out"
    except Exception as e:
        result["scanner"] = "clamav-error"
        result["details"] = f"Scan error: {str(e)[:200]}"

    return result


async def combined_scan(file_content: bytes, filename: str) -> dict:
    """Run both ClamAV and basic signature scan."""
    from app.core.file_scanning import scan_file as basic_scan

    basic_result = await basic_scan(file_content, filename)
    clamav_result = await scan_with_clamav(file_content, filename)

    return {
        "clean": basic_result["clean"] and clamav_result["clean"],
        "scanners": {
            "basic": basic_result,
            "clamav": clamav_result,
        },
        "overallClean": basic_result["clean"] and clamav_result["clean"],
    }
