"""CLI entrypoint for crowdsourcing-autopilot (subcommands are stubs in T1)."""

from __future__ import annotations

import typer

app = typer.Typer(no_args_is_help=True, help="Crowdsourcing autopilot CLI")


@app.command()
def scan() -> None:
    """Fetch and persist open jobs from configured platforms."""
    typer.echo("scan: not implemented (T1 skeleton)")


@app.command()
def propose() -> None:
    """Draft or send proposals for tracked jobs."""
    typer.echo("propose: not implemented (T1 skeleton)")


@app.command()
def deliver() -> None:
    """Track and submit deliverables for active contracts."""
    typer.echo("deliver: not implemented (T1 skeleton)")


@app.command()
def report() -> None:
    """Summarize pipeline status (jobs, proposals, contracts)."""
    typer.echo("report: not implemented (T1 skeleton)")


def main() -> None:
    app()


if __name__ == "__main__":
    main()
