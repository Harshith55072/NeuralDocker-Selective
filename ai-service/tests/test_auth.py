"""Tests for ai-service/auth.py (audit finding S3).

Run from the ai-service directory:   python -m unittest discover -s tests -v
No third-party packages needed.
"""
import base64
import hashlib
import hmac
import json
import os
import sys
import time
import unittest

# A throwaway test key (48 random-looking bytes) - NOT a real secret.
TEST_SECRET_B64 = base64.b64encode(bytes(range(1, 49))).decode()
os.environ["JWT_SECRET"] = TEST_SECRET_B64
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import auth  # noqa: E402  (must be imported after JWT_SECRET is set)

KEY = base64.b64decode(TEST_SECRET_B64)


def b64u(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def make_token(key=KEY, alg="HS384", claims=None, sign=True, header=None):
    digests = {"HS256": hashlib.sha256, "HS384": hashlib.sha384, "HS512": hashlib.sha512}
    head = b64u(json.dumps(header if header is not None else {"alg": alg}).encode())
    body = {"sub": "someone@example.com", "iat": int(time.time()), "exp": int(time.time()) + 300}
    if claims is not None:
        body = claims
    pay = b64u(json.dumps(body).encode())
    if sign:
        sig = b64u(hmac.new(key, f"{head}.{pay}".encode(), digests.get(alg, hashlib.sha256)).digest())
    else:
        sig = ""
    return f"{head}.{pay}.{sig}"


def bearer(tok):
    return "Bearer " + tok


class VerifyBearerToken(unittest.TestCase):
    def test_valid_tokens_all_hs_algs(self):
        for alg in ("HS256", "HS384", "HS512"):
            self.assertTrue(auth.verify_bearer_token(bearer(make_token(alg=alg))), alg)

    def test_missing_or_malformed_header(self):
        for h in (None, "", "Bearer", "Bearer ", "Basic abc", "bearer " + make_token(), make_token()):
            self.assertFalse(auth.verify_bearer_token(h), repr(h))

    def test_wrong_key_rejected(self):
        other = bytes(range(100, 148))
        self.assertFalse(auth.verify_bearer_token(bearer(make_token(key=other))))

    def test_old_public_default_key_rejected(self):
        legacy = base64.b64decode("404E635266556A586E3272357538782F413F4428472B4B6250645367566B5970")
        self.assertFalse(auth.verify_bearer_token(bearer(make_token(key=legacy))))

    def test_tampered_payload_rejected(self):
        h, p, s = make_token().split(".")
        evil = b64u(json.dumps({"sub": "admin", "exp": int(time.time()) + 9999}).encode())
        self.assertFalse(auth.verify_bearer_token(bearer(f"{h}.{evil}.{s}")))

    def test_alg_none_rejected(self):
        self.assertFalse(auth.verify_bearer_token(bearer(make_token(header={"alg": "none"}, sign=False))))
        self.assertFalse(auth.verify_bearer_token(bearer(make_token(header={"alg": "None"}, sign=False))))

    def test_unsupported_alg_rejected(self):
        self.assertFalse(auth.verify_bearer_token(bearer(make_token(header={"alg": "RS256"}))))
        self.assertFalse(auth.verify_bearer_token(bearer(make_token(header={}))))

    def test_expired_rejected_but_small_skew_tolerated(self):
        now = int(time.time())
        self.assertFalse(auth.verify_bearer_token(bearer(make_token(claims={"exp": now - 3600}))))
        self.assertTrue(auth.verify_bearer_token(bearer(make_token(claims={"exp": now - 10}))))

    def test_missing_or_bogus_exp_rejected(self):
        now = int(time.time())
        self.assertFalse(auth.verify_bearer_token(bearer(make_token(claims={"sub": "x"}))))
        self.assertFalse(auth.verify_bearer_token(bearer(make_token(claims={"exp": True}))))
        self.assertFalse(auth.verify_bearer_token(bearer(make_token(claims={"exp": str(now + 500)}))))

    def test_garbage_does_not_raise(self):
        for h in ("Bearer a.b.c", "Bearer ....", "Bearer \u00e9.\u00e9.\u00e9", "Bearer " + "A" * 5000):
            self.assertFalse(auth.verify_bearer_token(h))


class KeyLoading(unittest.TestCase):
    def _load_with(self, value):
        old = os.environ.get("JWT_SECRET")
        try:
            if value is None:
                os.environ.pop("JWT_SECRET", None)
            else:
                os.environ["JWT_SECRET"] = value
            return auth._load_key()
        finally:
            os.environ["JWT_SECRET"] = old

    def test_refuses_missing_blank_public_short_and_invalid(self):
        for bad in (None, "", "   ",
                    "404E635266556A586E3272357538782F413F4428472B4B6250645367566B5970",
                    base64.b64encode(b"short").decode(),
                    "!!!not base64!!!"):
            with self.assertRaises(RuntimeError, msg=repr(bad)):
                self._load_with(bad)

    def test_accepts_good_key(self):
        self.assertEqual(self._load_with(TEST_SECRET_B64), KEY)


class Origins(unittest.TestCase):
    def test_default_origins_are_local_only(self):
        os.environ.pop("CORS_ORIGINS", None)
        origins = auth.allowed_origins()
        self.assertIn("http://localhost:3000", origins)
        self.assertNotIn("*", origins)


if __name__ == "__main__":
    unittest.main()
