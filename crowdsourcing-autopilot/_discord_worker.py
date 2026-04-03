#!/usr/bin/env python3
"""Discord approval worker (started via `python main.py bot`)."""
from __future__ import annotations

import asyncio
import importlib
import os
import re
import sys
from pathlib import Path

import aiosqlite

ROOT = Path(__file__).resolve().parent


def _load_pypi_discord():
    keep = [p for p in sys.path if p]
    cwd = str(Path.cwd().resolve())
    filtered: list[str] = []
    for p in keep:
        try:
            if Path(p).resolve() == ROOT.resolve():
                continue
        except OSError:
            continue
        if p == "" and cwd == str(ROOT.resolve()):
            continue
        filtered.append(p)
    sys.modules.pop("discord", None)
    sys.path[:] = filtered
    try:
        return importlib.import_module("discord")
    finally:
        sys.path.insert(0, str(ROOT))


def _build_adapters():
    from adapters.appen import AppenAdapter
    from adapters.coconala import CoconalaAdapter
    from adapters.crowdworks import CrowdWorksAdapter
    from adapters.dataannotation import DataAnnotationAdapter
    from adapters.fiverr import FiverrAdapter
    from adapters.freelancer_com import FreelancerComAdapter
    from adapters.lancers import LancersAdapter
    from adapters.remotasks import RemotasksAdapter
    from adapters.scale_ai import ScaleAIAdapter
    from adapters.upwork import UpworkAdapter

    return {
        "upwork": UpworkAdapter(),
        "crowdworks": CrowdWorksAdapter(),
        "lancers": LancersAdapter(),
        "freelancer": FreelancerComAdapter(),
        "fiverr": FiverrAdapter(),
        "coconala": CoconalaAdapter(),
        "scale_ai": ScaleAIAdapter(),
        "dataannotation": DataAnnotationAdapter(),
        "remotasks": RemotasksAdapter(),
        "appen": AppenAdapter(),
    }


def main() -> None:
    token = os.environ.get("DISCORD_BOT_TOKEN", "")
    if not token:
        print("DISCORD_BOT_TOKEN is required", file=sys.stderr)
        raise SystemExit(1)

    dpy = _load_pypi_discord()
    from db.migrate import default_db_path
    from db.models import Job
    from db.queries import insert_proposal_draft, mark_proposal_sent, record_skip
    from core.tracker import update_status

    db_path = default_db_path()
    ADAPTERS = _build_adapters()
    intents = dpy.Intents.default()
    intents.message_content = True
    client = dpy.Client(intents=intents)

    class JobApprovalView(dpy.ui.View):
        def __init__(self, job_id: int) -> None:
            super().__init__(timeout=None)
            self.job_id = job_id

        @dpy.ui.button(label="送信", style=dpy.ButtonStyle.success)
        async def send_proposal(self, interaction: dpy.Interaction, button: dpy.ui.Button):  # type: ignore[override]
            await interaction.response.defer(ephemeral=True)
            row = await _fetch_job(db_path, self.job_id)
            if not row:
                await interaction.followup.send("Job not found.", ephemeral=True)
                return
            draft = await _fetch_latest_draft(db_path, self.job_id)
            if not draft:
                await interaction.followup.send("No draft proposal in DB.", ephemeral=True)
                return
            adapter = ADAPTERS.get(row["platform"])
            if not adapter:
                await interaction.followup.send("Unknown platform.", ephemeral=True)
                return
            job = Job(
                id=row["id"],
                platform=row["platform"],
                external_id=row["external_id"],
                title=row["title"],
                description=row["description"],
                budget_min=row["budget_min"],
                budget_max=row["budget_max"],
                budget_type=row["budget_type"],
                category=row["category"],
                score=row["score"],
                status=row["status"],
            )
            ok = await adapter.submit_proposal(job, draft[1])
            if not ok:
                await interaction.followup.send("submit_proposal returned false.", ephemeral=True)
                return
            await mark_proposal_sent(db_path, draft[0])
            await update_status(db_path, self.job_id, "applied")
            await interaction.followup.send("Marked sent / applied.", ephemeral=True)

        @dpy.ui.button(label="編集", style=dpy.ButtonStyle.primary)
        async def edit_proposal(self, interaction: dpy.Interaction, button: dpy.ui.Button):  # type: ignore[override]
            await interaction.response.send_message(
                "Creating a thread — send the revised proposal text within 10 minutes.",
                ephemeral=True,
            )
            thread = await interaction.message.create_thread(
                name=f"job-{self.job_id}-edit",
            )
            await thread.send(
                f"{interaction.user.mention} paste the full revised proposal here."
            )

            stop = asyncio.Event()

            async def reminder() -> None:
                await asyncio.sleep(300)
                if not stop.is_set():
                    await thread.send("Reminder: waiting for your revised text (10 min window).")

            rem = asyncio.create_task(reminder())
            try:

                def check(m: dpy.Message) -> bool:
                    return (
                        m.channel.id == thread.id
                        and m.author.id == interaction.user.id
                        and not m.author.bot
                    )

                msg = await client.wait_for("message", timeout=600.0, check=check)
            except asyncio.TimeoutError:
                await thread.send("No reply in 10 minutes; skipping.")
                await record_skip(db_path, self.job_id, "edit_timeout")
            else:
                await insert_proposal_draft(db_path, self.job_id, msg.content)
                await thread.send("Draft saved. Use the Send button when ready.")
            finally:
                stop.set()
                rem.cancel()

        @dpy.ui.button(label="スキップ", style=dpy.ButtonStyle.danger)
        async def skip_job(self, interaction: dpy.Interaction, button: dpy.ui.Button):  # type: ignore[override]
            await interaction.response.defer(ephemeral=True)
            await record_skip(db_path, self.job_id, "user_skip")
            await interaction.followup.send("Recorded skip.", ephemeral=True)

    @client.event
    async def on_ready() -> None:
        assert client.user
        print(f"Logged in as {client.user} ({client.user.id})")

    @client.event
    async def on_message(message: dpy.Message) -> None:
        if message.author == client.user:
            return
        if not message.embeds:
            return
        foot = message.embeds[0].footer.text or ""
        m = re.search(r"job_id:(\d+)", foot)
        if not m:
            return
        job_id = int(m.group(1))
        await message.channel.send(f"Job `{job_id}` controls:", view=JobApprovalView(job_id))

    client.run(token)


async def _fetch_job(db_path: Path, job_id: int):
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute("SELECT * FROM jobs WHERE id = ?", (job_id,))
        return await cur.fetchone()


async def _fetch_latest_draft(
    db_path: Path, job_id: int
) -> tuple[int, str] | None:
    async with aiosqlite.connect(db_path) as db:
        cur = await db.execute(
            """
            SELECT id, text FROM proposals
            WHERE job_id = ? AND status = 'draft'
            ORDER BY id DESC LIMIT 1
            """,
            (job_id,),
        )
        row = await cur.fetchone()
        if not row:
            return None
        return int(row[0]), str(row[1])


if __name__ == "__main__":
    main()
