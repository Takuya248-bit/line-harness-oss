"""
Register accounts on crowdsourcing platforms (httpx-first; Lightpanda CDP optional).

Run from repo package root, for example:
  cd crowdsourcing-autopilot && python scripts/register_all.py --platform dataannotation
"""

from __future__ import annotations

import asyncio
import re
import sys
from pathlib import Path
from typing import Any, Awaitable, Callable, List, Tuple
from urllib.parse import urljoin

import click
import httpx
from bs4 import BeautifulSoup
from dotenv import load_dotenv

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from scripts.register_utils import (  # noqa: E402
    CaptchaRequired,
    EmailVerificationRequired,
    ManualStepRequired,
    default_headers,
    html_suggests_captcha,
    html_suggests_email_verify,
    load_registration_env,
    notify_discord,
    response_suggests_blocked,
)
from scripts.lightpanda_cdp import LightpandaBrowser  # noqa: E402


async def _get_html(url: str) -> tuple[int, str, str]:
    async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
        r = await client.get(url, headers=default_headers())
        return r.status_code, str(r.url), r.text


def _csrf_from_html(html: str) -> str | None:
    m = re.search(
        r'<meta\s+name="csrf-token"\s+content="([^"]+)"',
        html,
        re.I,
    )
    return m.group(1) if m else None


async def register_dataannotation() -> dict[str, Any]:
    env = load_registration_env()
    url = "https://app.dataannotation.tech/users/sign_up"
    status, final_url, html = await _get_html(url)
    if status >= 400:
        raise RuntimeError(f"GET {url} -> HTTP {status} (final {final_url})")
    if response_suggests_blocked(html[:2000]):
        raise CaptchaRequired(final_url, "blocked or challenge page")
    if html_suggests_captcha(html):
        raise CaptchaRequired(
            final_url,
            "Google reCAPTCHA on signup; solve in browser then submit form",
        )
    soup = BeautifulSoup(html, "html.parser")
    form = soup.find("form", id="new_user")
    if not form or not form.get("action"):
        raise RuntimeError("Could not find signup form#new_user")
    action = str(form["action"])
    post_url = urljoin(url, action)
    token_input = form.find("input", {"name": "authenticity_token"})
    if not token_input or not token_input.get("value"):
        raise RuntimeError("authenticity_token missing")
    data = {
        "authenticity_token": str(token_input["value"]),
        "referral_code": "",
        "user[first_name]": env.name_first,
        "user[last_name]": env.name_last,
        "user[email]": env.email,
        "user[password]": env.password,
        "user[password_confirmation]": env.password,
        "user[phone]": env.phone,
    }
    async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
        r = await client.post(
            post_url,
            data=data,
            headers={**default_headers(referer=url), "Origin": "https://app.dataannotation.tech"},
        )
    body = r.text
    if r.status_code >= 400:
        raise RuntimeError(f"POST {post_url} -> HTTP {r.status_code}")
    if html_suggests_captcha(body):
        raise CaptchaRequired(final_url, "reCAPTCHA rejected or required on POST")
    if html_suggests_email_verify(body):
        raise EmailVerificationRequired(final_url)
    return {"final_url": str(r.url), "status_code": r.status_code, "note": "signup POST accepted"}


async def register_upwork() -> dict[str, Any]:
    env = load_registration_env()
    url = "https://www.upwork.com/nx/signup/"
    status, final_url, html = await _get_html(url)
    if "challenge" in html.lower()[:3000] or "Challenge - Upwork" in html:
        raise CaptchaRequired(final_url, "Upwork bot challenge / PerimeterX")
    if html_suggests_captcha(html):
        raise CaptchaRequired(final_url, "CAPTCHA or antibot on Upwork")
    raise ManualStepRequired(
        url,
        "Upwork signup is SPA-heavy; complete freelancer signup in browser, then set title to "
        '"Full-Stack Developer & Japanese Localization Specialist", skills: Japanese, Translation, '
        "Localization, TypeScript, React, AI/ML. Apply for API at https://www.upwork.com/developer . "
        f"Suggested email: {env.email}",
    )


async def register_crowdworks() -> dict[str, Any]:
    env = load_registration_env()
    url = "https://crowdworks.jp/sign_up"
    status, final_url, html = await _get_html(url)
    if status == 404 or "404" in html or "ページが見つかりません" in html:
        raise ManualStepRequired(
            "https://crowdworks.jp/login",
            "Configured sign_up URL returned 404; open CrowdWorks in a browser, register from the "
            "official flow, then set profile: Webエンジニア / 翻訳者. "
            f"Use email {env.email}",
        )
    if html_suggests_captcha(html):
        raise CaptchaRequired(final_url)
    token = _csrf_from_html(html)
    if not token:
        raise ManualStepRequired(
            final_url,
            "Could not parse CSRF; complete CrowdWorks registration in browser (SPA?).",
        )
    raise ManualStepRequired(
        final_url,
        "Static signup form not found via httpx; use browser. Profile: Webエンジニア、翻訳者. "
        f"Email: {env.email}",
    )


async def register_lancers() -> dict[str, Any]:
    env = load_registration_env()
    url = "https://www.lancers.jp/user/register"
    status, final_url, html = await _get_html(url)
    if "Human Verification" in html or "awsWaf" in html.lower():
        raise CaptchaRequired(
            final_url,
            "AWS WAF Captcha on Lancers; use browser (or Lightpanda to load page, then solve manually)",
        )
    if html_suggests_captcha(html):
        raise CaptchaRequired(final_url)
    if status == 404:
        raise ManualStepRequired(url, f"Lancers register URL failed; try manual signup. Email: {env.email}")
    raise ManualStepRequired(
        final_url,
        "Complete Lancers registration in browser. Profile: Webエンジニア / 翻訳者. "
        f"Email: {env.email}",
    )


async def register_fiverr() -> dict[str, Any]:
    env = load_registration_env()
    url = "https://www.fiverr.com/join"
    status, final_url, html = await _get_html(url)
    if response_suggests_blocked(html[:4000]) or html_suggests_captcha(html):
        raise CaptchaRequired(final_url, "Fiverr antibot or CAPTCHA")
    gigs = [
        "Japanese Translation - English to Japanese",
        "Japanese Localization for Apps & Websites",
        "Japanese Content Writing & SEO",
        "Japanese Proofreading & Quality Check",
        "AI Output Japanese Quality Review",
    ]
    raise ManualStepRequired(
        final_url,
        "Finish Fiverr account in browser, then publish 5 gigs: "
        + "; ".join(gigs)
        + f". Email: {env.email}",
    )


async def register_coconala() -> dict[str, Any]:
    env = load_registration_env()
    url = "https://coconala.com/signup"
    status, final_url, html = await _get_html(url)
    if status >= 400 or "404" in html[:2000]:
        raise ManualStepRequired(
            "https://coconala.com/",
            "signup URL returned error; open coconala.com and register via official UI. "
            "Then list: 日本語翻訳サービス; 英文校正・翻訳サービス. "
            f"Email: {env.email}",
        )
    if html_suggests_captcha(html):
        raise CaptchaRequired(final_url)
    raise ManualStepRequired(
        final_url,
        "Complete ココナラ registration in browser; then create services (翻訳 / 英文校正). "
        f"Email: {env.email}",
    )


async def register_remotasks() -> dict[str, Any]:
    url = "https://remotasks.com/signup"
    status, final_url, html = await _get_html(url)
    if html_suggests_captcha(html) or response_suggests_blocked(html[:3000]):
        raise CaptchaRequired(final_url, "Remotasks challenge / CAPTCHA")
    raise ManualStepRequired(
        final_url,
        "RLHF flow: complete Remotasks signup, identity, and training in browser (manual tests/review).",
    )


async def register_outlier() -> dict[str, Any]:
    url = "https://outlier.ai/"
    status, final_url, html = await _get_html(url)
    if html_suggests_captcha(html) or response_suggests_blocked(html[:3000]):
        raise CaptchaRequired(final_url)
    raise ManualStepRequired(
        final_url,
        "Outlier (Scale AI): use site signup / apply flow in browser; screening is manual.",
    )


async def register_appen() -> dict[str, Any]:
    url = "https://annotate.appen.com/"
    status, final_url, html = await _get_html(url)
    if html_suggests_captcha(html) or response_suggests_blocked(html[:3000]):
        raise CaptchaRequired(final_url)
    raise ManualStepRequired(
        final_url,
        "Appen: complete registration and qualifications in browser (manual assessments).",
    )


async def demo_lightpanda_navigate(url: str = "https://example.com") -> dict[str, Any]:
    """Smoke-test Lightpanda CDP: start binary, navigate, read title."""
    browser = LightpandaBrowser()
    await browser.start()
    try:
        await browser.connect()
        await browser.navigate(url)
        await asyncio.sleep(1.5)
        title = await browser.evaluate("document.title")
        return {"url": url, "title": title}
    finally:
        await browser.close()


PlatformFn = Callable[[], Awaitable[dict[str, Any]]]

PLATFORMS: List[Tuple[str, PlatformFn]] = [
    ("dataannotation", register_dataannotation),
    ("upwork", register_upwork),
    ("crowdworks", register_crowdworks),
    ("lancers", register_lancers),
    ("fiverr", register_fiverr),
    ("coconala", register_coconala),
    ("remotasks", register_remotasks),
    ("outlier", register_outlier),
    ("appen", register_appen),
]


async def run_platforms(platform: str) -> None:
    load_dotenv(dotenv_path=_ROOT / ".env")
    # Validate env early for clear errors
    try:
        load_registration_env()
    except RuntimeError as e:
        if platform != "lightpanda-demo":
            raise RuntimeError(str(e)) from e

    results: List[Tuple[str, str, str]] = []

    if platform == "lightpanda-demo":
        try:
            out = await demo_lightpanda_navigate()
            print(f"lightpanda-demo: OK - {out}")
            await notify_discord(f"Lightpanda CDP smoke OK: {out}")
        except Exception as e:  # noqa: BLE001
            print(f"lightpanda-demo: ERROR - {e}")
            await notify_discord(f"Lightpanda CDP smoke failed: {e}")
        return

    for name, func in PLATFORMS:
        if platform != "all" and platform != name:
            continue
        try:
            result = await func()
            results.append((name, "OK", str(result)))
            await notify_discord(f"{name} registration step finished OK: {result}")
        except CaptchaRequired as e:
            results.append((name, "CAPTCHA", str(e)))
            await notify_discord(f"{name} CAPTCHA or challenge: {e.url} — manual completion needed. {e.detail}")
        except EmailVerificationRequired as e:
            results.append((name, "EMAIL_VERIFY", str(e)))
            await notify_discord(f"{name} email verification: {e.url}")
        except ManualStepRequired as e:
            results.append((name, "MANUAL", e.instructions))
            await notify_discord(f"{name} manual step: {e.url} — {e.instructions[:500]}")
        except Exception as e:  # noqa: BLE001
            results.append((name, "ERROR", str(e)))
            await notify_discord(f"{name} registration error: {e}")

    for name, status, detail in results:
        print(f"{name}: {status} - {detail}")


@click.command()
@click.option(
    "--platform",
    default="all",
    help="Platform key or 'all', or 'lightpanda-demo' to test CDP only",
)
def main(platform: str) -> None:
    """Sequential registration attempts (httpx L1; use lightpanda_cdp for L2 helpers)."""
    try:
        asyncio.run(run_platforms(platform))
    except RuntimeError as e:
        raise SystemExit(f"Configuration error: {e}") from e


if __name__ == "__main__":
    main()
