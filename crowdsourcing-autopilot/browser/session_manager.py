import asyncio
import os
from pathlib import Path


async def get_cookies(platform: str) -> str:
    script = Path(__file__).parent.parent / "scripts" / "get-session.mjs"
    if not script.exists():
        return os.environ.get(f"{platform.upper()}_SESSION", "")
    proc = await asyncio.create_subprocess_exec(
        "node", str(script), platform,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=str(script.parent.parent),
    )
    stdout, stderr = await proc.communicate()
    if stderr:
        print(stderr.decode(), end="")
    return stdout.decode().strip()
