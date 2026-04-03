"""Shared helpers for crowdsourcing registration scripts."""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from typing import Any, Optional

import httpx


DEFAULT_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)


@dataclass
class RegistrationEnv:
    email: str
    password: str
    name_first: str
    name_last: str
    phone: str


class CaptchaRequired(Exception):
    """Site requires CAPTCHA or bot challenge; human step needed."""

    def __init__(self, url: str, detail: str = "") -> None:
        self.url = url
        self.detail = detail
        msg = f"CAPTCHA or challenge required: {url}"
        if detail:
            msg = f"{msg} ({detail})"
        super().__init__(msg)


class EmailVerificationRequired(Exception):
    def __init__(self, url: str, detail: str = "") -> None:
        self.url = url
        self.detail = detail
        super().__init__(f"Email verification required: {url}")


class ManualStepRequired(Exception):
    """Post-signup or unsupported-by-http flows (profile, gigs, API keys)."""

    def __init__(self, url: str, instructions: str) -> None:
        self.url = url
        self.instructions = instructions
        super().__init__(instructions)


def load_registration_env() -> RegistrationEnv:
    keys = {
        "email": "REG_EMAIL",
        "password": "REG_PASSWORD",
        "name_first": "REG_NAME_FIRST",
        "name_last": "REG_NAME_LAST",
        "phone": "REG_PHONE",
    }
    missing = [k for k in keys.values() if not os.environ.get(k)]
    if missing:
        raise RuntimeError(
            "Missing env vars: " + ", ".join(missing) + " (set in .env or export)"
        )
    return RegistrationEnv(
        email=os.environ["REG_EMAIL"],
        password=os.environ["REG_PASSWORD"],
        name_first=os.environ["REG_NAME_FIRST"],
        name_last=os.environ["REG_NAME_LAST"],
        phone=os.environ["REG_PHONE"],
    )


def discord_webhook_url() -> Optional[str]:
    return (
        os.environ.get("DISCORD_WEBHOOK_REGISTRATION")
        or os.environ.get("DISCORD_WEBHOOK_CROWDSOURCING")
        or os.environ.get("DISCORD_WEBHOOK_UPWORK")
    )


async def notify_discord(message: str, *, embed: Optional[dict[str, Any]] = None) -> None:
    url = discord_webhook_url()
    if not url:
        return
    payload: dict[str, Any] = {"content": message[:2000]}
    if embed:
        payload["embeds"] = [embed]
    async with httpx.AsyncClient(timeout=30.0) as client:
        await client.post(url, json=payload)


def default_headers(*, referer: Optional[str] = None) -> dict[str, str]:
    h = {
        "User-Agent": os.environ.get("REG_HTTP_USER_AGENT", DEFAULT_UA),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,ja;q=0.8",
    }
    if referer:
        h["Referer"] = referer
    return h


_CAPTCHA_PATTERNS = (
    r"g-recaptcha",
    r"google\.com/recaptcha",
    r"hcaptcha\.com",
    r"h-captcha",
    r"cloudflareinsights",
    r"cf-turnstile",
    r"challenge-platform",
    r"AwsWafIntegration",
    r"captcha\.js",
    r"Human Verification",
    r"grecaptcha\.execute",
)


def html_suggests_captcha(html: str) -> bool:
    lower = html.lower()
    return any(re.search(p, lower) for p in _CAPTCHA_PATTERNS)


def html_suggests_email_verify(html: str) -> bool:
    lower = html.lower()
    return any(
        x in lower
        for x in (
            "verify your email",
            "confirm your email",
            "メールを確認",
            "認証メール",
            "メールアドレスの確認",
        )
    )


def response_suggests_blocked(title_or_snippet: str) -> bool:
    t = title_or_snippet.lower()
    return any(
        x in t
        for x in (
            "challenge",
            "attention required",
            "just a moment",
            "access denied",
            "blocked",
            "rate limit",
        )
    )
