"""AD / LDAP authentication client (PANJIT group SSO gateway).

Wraps the two endpoints exposed by https://apigw.panjit.com.tw:
  POST /ldap/api/v1/auth          -> verify username/password for a domain
  GET  /ldap/api/v1/users/{user}  -> fetch profile (department/title/email)
"""
from __future__ import annotations

from dataclasses import dataclass

import httpx
from loguru import logger

from app.config import settings

# Selectable companies -> LDAP domain code. PANJIT is the gateway default.
AD_DOMAINS: list[dict[str, str]] = [
    {"code": "PANJIT", "name": "台灣 PANJIT"},
    {"code": "PYNMAX", "name": "環茂"},
    {"code": "WXPJ", "name": "無錫強茂"},
    {"code": "PJWS", "name": "強茂深圳"},
    {"code": "GDPJ", "name": "蘇州群鑫"},
    {"code": "PJXZ", "name": "強茂徐州"},
    {"code": "PJSD", "name": "山東強茂"},
]

_VALID_DOMAINS = {d["code"] for d in AD_DOMAINS}
DEFAULT_DOMAIN = "PANJIT"

_TIMEOUT = httpx.Timeout(30.0)


class ADError(Exception):
    """AD gateway is unreachable or returned an unexpected response."""


@dataclass
class ADUser:
    username: str
    display_name: str
    department: str = ""
    title: str = ""
    email: str = ""
    domain: str = DEFAULT_DOMAIN


def is_configured() -> bool:
    return bool(settings.AD_URL)


def normalize_domain(domain: str | None) -> str:
    """Empty -> default; unknown codes are rejected before hitting the gateway."""
    if not domain:
        return DEFAULT_DOMAIN
    code = domain.strip().upper()
    if code not in _VALID_DOMAINS:
        raise ValueError(f"Unknown domain: {domain}")
    return code


def authenticate(username: str, password: str, domain: str) -> bool:
    """Verify credentials against the AD gateway. Returns True on success.

    The gateway's own JWT is ignored; this system issues its own token after
    a local user upsert so the rest of the app keeps a single auth scheme.
    """
    url = f"{settings.AD_URL.rstrip('/')}/ldap/api/v1/auth"
    payload = {"username": username, "password": password, "domain": domain}
    try:
        resp = httpx.post(url, json=payload, timeout=_TIMEOUT, verify=settings.AD_VERIFY_SSL)
    except httpx.HTTPError as exc:
        logger.error(f"AD auth request failed: {exc}")
        raise ADError("AD service unreachable") from exc

    if resp.status_code == 400:
        raise ValueError("Invalid domain")
    if resp.status_code in (401, 403):
        return False
    if resp.status_code >= 500:
        logger.error(f"AD auth gateway error {resp.status_code}: {resp.text}")
        raise ADError("AD service error")

    try:
        data = resp.json()
    except ValueError as exc:
        raise ADError("AD service returned a non-JSON response") from exc
    return bool(data.get("success"))


def fetch_user(username: str, domain: str) -> ADUser:
    """Fetch the user profile via the X-API-Key protected endpoint.

    Falls back to a minimal record if the lookup fails so a successful auth is
    never blocked by a profile-read hiccup.
    """
    fallback = ADUser(username=username, display_name=username, domain=domain)
    url = f"{settings.AD_URL.rstrip('/')}/ldap/api/v1/users/{username}"
    try:
        resp = httpx.get(
            url,
            params={"domain": domain},
            headers={"X-API-Key": settings.AD_API},
            timeout=_TIMEOUT,
            verify=settings.AD_VERIFY_SSL,
        )
        resp.raise_for_status()
        data = resp.json()
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning(f"AD user lookup failed for {username}@{domain}: {exc}")
        return fallback

    # Profile is nested under "user"; email is returned as "mail".
    info = data.get("user") or {}
    return ADUser(
        username=info.get("username") or username,
        display_name=info.get("displayName") or username,
        department=info.get("department") or "",
        title=info.get("title") or "",
        email=info.get("mail") or "",
        domain=info.get("domain") or domain,
    )
