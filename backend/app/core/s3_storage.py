"""S3/MinIO file storage service for document management."""

import hashlib
import logging
import os
from typing import Optional

from app.core.config import settings

logger = logging.getLogger(__name__)


class S3Storage:
    """S3-compatible storage client using aiobotocore for async operations."""

    def __init__(self):
        self.endpoint = settings.S3_ENDPOINT
        self.access_key = settings.S3_ACCESS_KEY
        self.secret_key = settings.S3_SECRET_KEY
        self.bucket = settings.S3_BUCKET
        self.region = settings.S3_REGION
        self._session = None

    async def _get_session(self):
        if self._session is None:
            try:
                from aiobotocore.session import get_session

                self._session = get_session()
            except ImportError:
                return None
        return self._session

    async def _client(self):
        """Create a new S3 client for each operation. Not cached — aiobotocore
        clients are context managers that get closed after use."""
        session = await self._get_session()
        if session is None:
            return None
        return session.create_client(
            "s3",
            endpoint_url=self.endpoint,
            aws_access_key_id=self.access_key,
            aws_secret_access_key=self.secret_key,
            region_name=self.region,
        )

    async def upload_file(
        self,
        file_content: bytes,
        key: str,
        content_type: str = "application/octet-stream",
    ) -> dict:
        try:
            async with await self._client() as c:
                await c.put_object(
                    Bucket=self.bucket,
                    Key=key,
                    Body=file_content,
                    ContentType=content_type,
                )
            return {
                "success": True,
                "storage": "s3",
                "bucket": self.bucket,
                "key": key,
                "url": f"{self.endpoint}/{self.bucket}/{key}",
            }
        except Exception as e:
            return self._fallback_upload(file_content, key, str(e))

    async def download_file(self, key: str) -> Optional[bytes]:
        try:
            async with await self._client() as c:
                response = await c.get_object(Bucket=self.bucket, Key=key)
                async with response["Body"] as stream:
                    return await stream.read()
        except Exception as exc:
            logger.debug("S3 download failed, using fallback: %s", exc)
            return self._fallback_download(key)

    async def delete_file(self, key: str) -> bool:
        try:
            async with await self._client() as c:
                await c.delete_object(Bucket=self.bucket, Key=key)
            return True
        except Exception as exc:
            logger.debug("S3 delete failed, using fallback: %s", exc)
            return self._fallback_delete(key)

    async def list_files(self, prefix: str = "") -> list:
        try:
            async with await self._client() as c:
                response = await c.list_objects_v2(Bucket=self.bucket, Prefix=prefix)
                return [
                    {"key": obj["Key"], "size": obj["Size"]} for obj in response.get("Contents", [])
                ]
        except Exception as exc:
            logger.debug("S3 list failed: %s", exc)
            return []

    async def ensure_bucket(self):
        try:
            async with await self._client() as c:
                try:
                    await c.head_bucket(Bucket=self.bucket)
                except Exception:
                    await c.create_bucket(
                        Bucket=self.bucket,
                        CreateBucketConfiguration={"LocationConstraint": self.region},
                    )
        except Exception:
            logger.warning("Failed to ensure S3 bucket exists: %s", self.bucket)

    @staticmethod
    def _local_path(key: str) -> str:
        """Map an S3 key to a local fallback path derived solely from a hash of
        the key, so no client-controlled component can escape the fallback dir."""
        local_dir = os.path.join(settings.UPLOAD_DIR, "s3_fallback")
        return os.path.join(local_dir, hashlib.sha256(key.encode()).hexdigest())

    def _fallback_upload(self, file_content: bytes, key: str, error: str = None) -> dict:
        local_dir = os.path.join(settings.UPLOAD_DIR, "s3_fallback")
        os.makedirs(local_dir, exist_ok=True)
        local_path = self._local_path(key)
        with open(local_path, "wb") as f:
            f.write(file_content)
        return {
            "success": True,
            "storage": "local_fallback",
            "key": key,
            "localPath": local_path,
            "warning": f"S3 unavailable ({error}), saved locally"
            if error
            else "S3 unavailable, saved locally",
        }

    def _fallback_download(self, key: str) -> Optional[bytes]:
        local_path = self._local_path(key)
        if os.path.exists(local_path):
            with open(local_path, "rb") as f:
                return f.read()
        return None

    def _fallback_delete(self, key: str) -> bool:
        local_path = self._local_path(key)
        if os.path.exists(local_path):
            os.unlink(local_path)
            return True
        return False


s3_storage = S3Storage()
