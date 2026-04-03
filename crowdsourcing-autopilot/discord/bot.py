from __future__ import annotations

import subprocess
import sys
from pathlib import Path


class ApprovalBot:
    """
    Runs the interactive Discord bot in a subprocess so `discord.py` can be
    imported as `discord` without clashing with this package directory name.
    """

    @staticmethod
    def run() -> None:
        root = Path(__file__).resolve().parent.parent
        worker = root / "_discord_worker.py"
        raise SystemExit(subprocess.call([sys.executable, str(worker)]))
