from __future__ import annotations

import asyncio

import click


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


@cli.command("bot")
def bot_cmd() -> None:
    from discord.bot import ApprovalBot

    ApprovalBot.run()


def main() -> None:
    cli()


if __name__ == "__main__":
    main()
