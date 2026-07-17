"""Response compression middleware tests — unit tests only."""

import gzip
from unittest.mock import MagicMock

import pytest

from app.core.compress import CompressionMiddleware


@pytest.mark.asyncio
async def test_compression_skipped_without_gzip_header():
    request = MagicMock()
    request.headers = {"accept-encoding": "deflate"}
    request.method = "GET"

    response = MagicMock()
    response.headers = {"content-type": "application/json"}
    response.body = b"x" * 2000

    async def call_next(req):
        return response

    middleware = CompressionMiddleware(lambda: None)
    result = await middleware.dispatch(request, call_next)
    assert result is response


@pytest.mark.asyncio
async def test_compression_skipped_for_small_responses():
    request = MagicMock()
    request.headers = {"accept-encoding": "gzip"}
    request.method = "GET"

    response = MagicMock()
    response.headers = {"content-type": "application/json"}
    response.body = b"small"

    async def call_next(req):
        return response

    middleware = CompressionMiddleware(lambda: None)
    result = await middleware.dispatch(request, call_next)
    assert result.body == b"small"


@pytest.mark.asyncio
async def test_compression_skipped_for_non_text_content():
    request = MagicMock()
    request.headers = {"accept-encoding": "gzip"}
    request.method = "GET"

    response = MagicMock()
    response.headers = {"content-type": "image/png"}
    response.body = b"x" * 2000

    async def call_next(req):
        return response

    middleware = CompressionMiddleware(lambda: None)
    result = await middleware.dispatch(request, call_next)
    assert result == response


@pytest.mark.asyncio
async def test_compression_applied_for_large_json():
    request = MagicMock()
    request.headers = {"accept-encoding": "gzip"}
    request.method = "GET"

    body = b'{"data": "' + b"x" * 2000 + b'"}'
    response = MagicMock()
    response.headers = {"content-type": "application/json"}
    response.body = body
    response.status_code = 200
    response.media_type = "application/json"

    async def call_next(req):
        return response

    middleware = CompressionMiddleware(lambda: None)
    result = await middleware.dispatch(request, call_next)
    assert result.headers["Content-Encoding"] == "gzip"
    decompressed = gzip.decompress(result.body)
    assert decompressed == body
