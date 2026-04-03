from __future__ import annotations

import asyncio
import os
import shutil
from typing import Any, Optional

import httpx


class LightpandaClient:
    """Invoke Lightpanda CDP binary if available (optional dependency)."""

    def __init__(self, binary: Optional[str] = None) -> None:
        self._binary = binary or os.environ.get("LIGHTPANDA_BIN") or shutil.which(
            "lightpanda"
        )

    async def fetch_rendered_html(self, url: str, cookie: str = "") -> str:
        if not self._binary:
            async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as c:
                r = await c.get(url)
                return r.text
        env = os.environ.copy()
        if cookie:
            env["LIGHTPANDA_COOKIE"] = cookie
        proc = await asyncio.create_subprocess_exec(
            self._binary,
            "--dump-dom",
            url,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )
        out, _err = await proc.communicate()
        if proc.returncode != 0:
            return ""
        return out.decode("utf-8", errors="replace")


async def maybe_fetch_json_via_browser(url: str) -> Any | None:
    """
    Try to discover JSON embedded in HTML after optional Lightpanda render.
    Returns None if nothing parsed.
    """
    client = LightpandaClient()
    html = await client.fetch_rendered_html(url)
    if not html:
        return None
    for marker in ("__NEXT_DATA__", "window.__INITIAL_STATE__"):
        if marker in html:
            # Minimal stub: full extraction is site-specific
            pass
    return None
