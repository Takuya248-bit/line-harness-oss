from __future__ import annotations

import asyncio
from pathlib import Path

import click
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")


@click.group()
def cli() -> None:
    """Crowdsourcing Autopilot CLI."""


@cli.command("scan")
def scan_cmd() -> None:
    from core.scanner import run_scan

    asyncio.run(run_scan())


@cli.command("report")
def report_cmd() -> None:
    from core.reporter import run_report

    asyncio.run(run_report())


@cli.command("apply")
@click.argument("job_id", type=int)
@click.option("--yes", "-y", is_flag=True, help="確認プロンプトをスキップして即応募")
def apply_cmd(job_id: int, yes: bool) -> None:
    """指定したjob_idの案件に応募する。"""
    from core.applier import apply_to_job

    result = asyncio.run(apply_to_job(job_id, auto_confirm=yes))
    if result["ok"]:
        click.echo(f"\n✓ {result['message']}")
    else:
        click.echo(f"\n✗ {result['message']}")


@cli.command("bot")
def bot_cmd() -> None:
    from discord.bot import ApprovalBot

    ApprovalBot.run()


def main() -> None:
    cli()


if __name__ == "__main__":
    main()
