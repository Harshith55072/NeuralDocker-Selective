"""
Authentication for the AI service (audit finding S3).

Before this, the AI service had no authentication at all and was published through a
public ngrok tunnel: anyone holding the tunnel URL could load/unload models, burn GPU
time on inference, and start/delete/move recordings.

Every request now needs `Authorization: Bearer <JWT>` signed with the cluster's shared
JWT_SECRET (the same secret the Spring backend signs with - see project.md "JWT trust
model"). Two kinds of caller hold such a token:

  * the browser on this machine (the normal user login token), and
  * a backend (this machine's, or a cluster host's) which mints a short-lived
    token per outgoing call.

This module is dependency-free on purpose (stdlib HMAC only): the AI image has a slow,
fragile llama-cpp build and we don't want a requirements change to invalidate that layer.
Only HS256/HS384/HS512 are accepted; "none" and anything else is rejected.
"""

import base64
import binascii
import hashlib
import hmac
import json
import os
import time
from typing import List, Optional

# Old values that used to ship in the public repo. Never accept them.
_LEGACY_PUBLIC_JWT_DEFAULT = "404E635266556A586E3272357538782F413F4428472B4B6250645367566B5970"

_MIN_KEY_BYTES = 32
_EXP_LEEWAY_SECONDS = 60   # tolerate small clock differences between machines

_HS_ALGS = {
    "HS256": hashlib.sha256,
    "HS384": hashlib.sha384,
    "HS512": hashlib.sha512,
}


def _load_key() -> bytes:
    raw = os.getenv("JWT_SECRET", "").strip()
    fix = ("Run run.bat (Windows) or ./setup.sh (Linux/macOS) to generate one into .env, "
           "or set JWT_SECRET to a base64 string of at least 32 bytes "
           "(openssl rand -base64 48). Machines in the same cluster must share it.")
    if not raw:
        raise RuntimeError("JWT_SECRET is not set; refusing to start the AI service unauthenticated. " + fix)
    if raw == _LEGACY_PUBLIC_JWT_DEFAULT:
        raise RuntimeError("JWT_SECRET is the publicly known default from the GitHub repo. " + fix)
    try:
        # The backend decodes the secret with standard base64 and tolerates missing padding.
        key = base64.b64decode(raw + "=" * (-len(raw) % 4), validate=True)
    except (binascii.Error, ValueError):
        raise RuntimeError("JWT_SECRET is not valid base64. " + fix)
    if len(key) < _MIN_KEY_BYTES:
        raise RuntimeError(f"JWT_SECRET is too short ({len(key)} bytes decoded, need {_MIN_KEY_BYTES}+). " + fix)
    return key


# Fail fast at import time: a container that starts without a usable secret would
# otherwise be either open to everyone or locked out with no explanation.
_KEY = _load_key()


def _b64url_decode(segment: str) -> bytes:
    return base64.urlsafe_b64decode(segment + "=" * (-len(segment) % 4))


def verify_bearer_token(authorization_header: Optional[str]) -> bool:
    """True only for a well-formed, correctly signed, unexpired HS256/384/512 JWT."""
    if not authorization_header or not authorization_header.startswith("Bearer "):
        return False
    parts = authorization_header[7:].strip().split(".")
    if len(parts) != 3:
        return False
    try:
        header = json.loads(_b64url_decode(parts[0]))
        digest = _HS_ALGS.get(header.get("alg"))
        if digest is None:
            return False
        signed = (parts[0] + "." + parts[1]).encode("ascii")
        expected = hmac.new(_KEY, signed, digest).digest()
        if not hmac.compare_digest(expected, _b64url_decode(parts[2])):
            return False
        claims = json.loads(_b64url_decode(parts[1]))
        exp = claims.get("exp")
        if isinstance(exp, bool) or not isinstance(exp, (int, float)):
            return False   # every token this system issues has an expiry
        return exp + _EXP_LEEWAY_SECONDS > time.time()
    except Exception:
        return False


def allowed_origins() -> List[str]:
    """Browser origins allowed to call this service (the local frontend by default)."""
    default = ("http://localhost:3000,http://127.0.0.1:3000,"
               "http://localhost:5173,http://127.0.0.1:5173")
    return [o.strip() for o in os.getenv("CORS_ORIGINS", default).split(",") if o.strip()]
