"""Auth helpers: password hashing (PBKDF2) and JWT (HS256) — zero new dependencies."""
import base64
import hashlib
import hmac
import json
import os
import time
from typing import Any


# ── Password ──────────────────────────────────────────────────────────────────

_ITERS = 260_000
_HASH  = "sha256"


def hash_password(plain: str) -> str:
    salt = os.urandom(16)
    dk   = hashlib.pbkdf2_hmac(_HASH, plain.encode(), salt, _ITERS)
    return base64.b64encode(salt + dk).decode()


def verify_password(plain: str, stored: str) -> bool:
    try:
        raw  = base64.b64decode(stored)
        salt = raw[:16]
        dk   = raw[16:]
        return hmac.compare_digest(
            dk,
            hashlib.pbkdf2_hmac(_HASH, plain.encode(), salt, _ITERS),
        )
    except Exception:
        return False


# ── JWT (HS256, no external deps) ─────────────────────────────────────────────

def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64url_decode(s: str) -> bytes:
    pad = 4 - len(s) % 4
    return base64.urlsafe_b64decode(s + "=" * (pad % 4))


def _secret() -> bytes:
    from app.config import settings
    return settings.SECRET_KEY.encode()


def create_token(payload: dict[str, Any], expires_in: int = 86_400 * 30) -> str:
    p      = {**payload, "exp": int(time.time()) + expires_in, "iat": int(time.time())}
    header = _b64url(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    body   = _b64url(json.dumps(p, ensure_ascii=False).encode())
    sig    = _b64url(
        hmac.new(_secret(), f"{header}.{body}".encode(), hashlib.sha256).digest()
    )
    return f"{header}.{body}.{sig}"


def decode_token(token: str) -> dict[str, Any]:
    """Decode and verify a JWT. Raises ValueError on any failure."""
    try:
        header, body, sig = token.split(".")
        expected = _b64url(
            hmac.new(_secret(), f"{header}.{body}".encode(), hashlib.sha256).digest()
        )
        if not hmac.compare_digest(sig, expected):
            raise ValueError("bad signature")
        payload: dict = json.loads(_b64url_decode(body))
        if payload.get("exp", 0) < time.time():
            raise ValueError("token expired")
        return payload
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError(f"invalid token: {exc}") from exc
