import gzip

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

_MIN_COMPRESS_SIZE = 1024


async def _collect_body(response):
    body = getattr(response, "body", None)
    if body is not None:
        return body
    chunks = []
    async for chunk in response.body_iterator:
        chunks.append(chunk)
    return b"".join(chunks)


class CompressionMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        accept_encoding = request.headers.get("accept-encoding", "")
        supports_gzip = "gzip" in accept_encoding

        response = await call_next(request)

        if not supports_gzip:
            return response

        content_type = response.headers.get("content-type", "")
        if "json" not in content_type and "text" not in content_type:
            return response

        body = await _collect_body(response)

        new_headers = dict(response.headers)
        new_headers.pop("content-length", None)

        if len(body) >= _MIN_COMPRESS_SIZE:
            compressed = gzip.compress(body)
            if len(compressed) < len(body):
                new_headers["Content-Encoding"] = "gzip"
                new_headers["Content-Length"] = str(len(compressed))
                return Response(
                    content=compressed,
                    status_code=response.status_code,
                    headers=new_headers,
                    media_type=response.media_type,
                )

        new_headers["Content-Length"] = str(len(body))
        return Response(
            content=body,
            status_code=response.status_code,
            headers=new_headers,
            media_type=response.media_type,
        )
