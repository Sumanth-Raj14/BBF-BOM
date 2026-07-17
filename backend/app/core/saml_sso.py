"""SAML 2.0 SSO support for enterprise identity providers.

Supports Okta, Azure AD, OneLogin, and generic SAML 2.0 IdPs.
Falls back to OAuth2 when SAML is not configured.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Request

from app.core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth/saml", tags=["saml-sso"])

SAML_ENABLED = False
try:
    from onelogin.saml2.auth import OneLogin_Saml2_Auth
    from onelogin.saml2.settings import OneLogin_Saml2_Settings

    SAML_ENABLED = True
except ImportError:
    logger.info("python3-saml not installed. SAML SSO disabled.")


def _get_saml_settings():
    return {
        "strict": True,
        "debug": False,
        "sp": {
            "entityId": f"{settings.SSO_REDIRECT_URI}/saml/metadata",
            "assertionConsumerService": {
                "url": f"{settings.SSO_REDIRECT_URI}/saml/acs",
                "binding": "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST",
            },
            "singleLogoutService": {
                "url": f"{settings.SSO_REDIRECT_URI}/saml/logout",
                "binding": "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect",
            },
            "NameIDFormat": "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
        },
        "idp": {
            "entityId": settings.SAML_IDP_ENTITY_ID or "",
            "singleSignOnService": {
                "url": settings.SAML_IDP_SSO_URL or "",
                "binding": "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect",
            },
            "singleLogoutService": {
                "url": settings.SAML_IDP_SLO_URL or "",
                "binding": "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect",
            },
            "x509cert": settings.SAML_IDP_CERT or "",
        },
    }


async def _prepare_saml_request(request: Request) -> dict:
    post_data = {}
    if request.method == "POST":
        try:
            post_data = dict(await request.form())
        except Exception as exc:
            import logging

            logging.debug("SAML POST form parse failed: %s", exc)
            post_data = {}
    return {
        "http_method": request.method,
        "server_port": request.url.port or 443,
        "https": request.url.scheme == "https",
        "script_name": request.url.path,
        "get_data": dict(request.query_params),
        "post_data": post_data,
    }


async def init_saml_auth(request: Request) -> Optional[object]:
    if not SAML_ENABLED or not settings.SAML_IDP_SSO_URL:
        return None
    req = await _prepare_saml_request(request)
    auth = OneLogin_Saml2_Auth(req, _get_saml_settings())
    return auth
