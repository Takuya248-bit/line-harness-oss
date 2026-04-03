"""Minimal Chrome DevTools Protocol client for Lightpanda (`lightpanda serve`)."""

from __future__ import annotations

import asyncio
import json
import os
import shutil
import subprocess
from typing import Any, Optional

import httpx
import websockets


class LightpandaBrowser:
    def __init__(self, port: int = 9222, *, binary: Optional[str] = None) -> None:
        self.port = port
        self.binary = binary or os.environ.get("LIGHTPANDA_BIN") or shutil.which("lightpanda")
        self.process: Optional[subprocess.Popen[bytes]] = None
        self.ws: Any = None
        self._msg_id = 0

    def _next_id(self) -> int:
        self._msg_id += 1
        return self._msg_id

    async def start(self) -> None:
        if not self.binary:
            raise RuntimeError(
                "lightpanda binary not found; set LIGHTPANDA_BIN or install lightpanda on PATH"
            )
        self.process = subprocess.Popen(
            [self.binary, "serve", "--host", "127.0.0.1", "--port", str(self.port)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        await asyncio.sleep(1.0)
        if self.process.poll() is not None:
            raise RuntimeError("Lightpanda process exited immediately; check binary and flags")

    async def connect(self) -> None:
        async with httpx.AsyncClient(timeout=10.0) as c:
            r = await c.get(f"http://127.0.0.1:{self.port}/json/version")
            r.raise_for_status()
            ws_url = r.json()["webSocketDebuggerUrl"]
        self.ws = await websockets.connect(ws_url, max_size=None)

    async def _send(self, method: str, params: Optional[dict[str, Any]] = None) -> Any:
        if not self.ws:
            raise RuntimeError("WebSocket not connected; call connect() first")
        req_id = self._next_id()
        msg = {"id": req_id, "method": method, "params": params or {}}
        await self.ws.send(json.dumps(msg))
        while True:
            raw = await self.ws.recv()
            data = json.loads(raw)
            if data.get("id") != req_id:
                continue
            if "error" in data:
                raise RuntimeError(str(data["error"]))
            return data.get("result")

    async def navigate(self, url: str) -> None:
        await self._send("Page.navigate", {"url": url})

    async def evaluate(
        self,
        expression: str,
        *,
        await_promise: bool = False,
    ) -> Any:
        result = await self._send(
            "Runtime.evaluate",
            {
                "expression": expression,
                "awaitPromise": await_promise,
                "returnByValue": True,
            },
        )
        if not result:
            return None
        if result.get("exceptionDetails"):
            raise RuntimeError(str(result["exceptionDetails"]))
        return (result.get("result") or {}).get("value")

    async def get_html(self) -> str:
        val = await self.evaluate("document.documentElement.outerHTML")
        if val is None:
            return ""
        return str(val)

    async def type_text(self, selector: str, text: str) -> None:
        sel = json.dumps(selector)
        txt = json.dumps(text)
        expr = f"""
        (function() {{
          const el = document.querySelector({sel});
          if (!el) throw new Error('selector not found: ' + {sel});
          el.focus();
          el.value = {txt};
          el.dispatchEvent(new Event('input', {{ bubbles: true }}));
          el.dispatchEvent(new Event('change', {{ bubbles: true }}));
          return true;
        }})()
        """
        await self.evaluate(expr)

    async def click(self, selector: str) -> None:
        sel = json.dumps(selector)
        expr = f"""
        (function() {{
          const el = document.querySelector({sel});
          if (!el) throw new Error('selector not found: ' + {sel});
          el.click();
          return true;
        }})()
        """
        await self.evaluate(expr)

    async def close(self) -> None:
        if self.ws:
            await self.ws.close()
            self.ws = None
        if self.process:
            self.process.terminate()
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
            self.process = None
