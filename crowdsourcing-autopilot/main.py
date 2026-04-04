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


@cli.group("profile")
def profile_group() -> None:
    """実績・プロフィール管理。"""


@profile_group.command("show")
def profile_show() -> None:
    """現在のプロフィールと実績を表示する。"""
    from pathlib import Path
    import yaml
    p = Path(__file__).parent / "config" / "profile.yaml"
    if not p.exists():
        click.echo("profile.yaml が見つかりません。")
        return
    data = yaml.safe_load(p.read_text(encoding="utf-8")) or {}
    bio = data.get("bio", {})
    click.echo(f"\n=== プロフィール ===")
    click.echo(f"名前: {bio.get('name', '')}")
    click.echo(f"場所: {bio.get('location', '')}")
    click.echo(f"一言: {bio.get('tagline', '')}")
    click.echo(f"\n=== スキル ===")
    for s in (data.get("skills") or []):
        click.echo(f"  - {s['name']}: {s['detail']}")
    click.echo(f"\n=== 実績 ({len(data.get('achievements') or [])}件) ===")
    for i, a in enumerate((data.get("achievements") or []), 1):
        click.echo(f"  [{i}] {a['title']} ({a.get('platform','')}) {a.get('budget','')} → {a.get('result','')}")


@profile_group.command("add-achievement")
@click.option("--title", prompt="案件タイトル")
@click.option("--platform", prompt="プラットフォーム (crowdworks/lancers/coconala/etc)")
@click.option("--category", prompt="カテゴリ (translation/ai_eval/web_dev/automation/other)")
@click.option("--description", prompt="内容（何をやったか）")
@click.option("--result", prompt="結果・成果")
@click.option("--budget", prompt="報酬（例: ¥30,000）", default="")
def profile_add_achievement(title, platform, category, description, result, budget) -> None:
    """実績を1件追加する。"""
    from pathlib import Path
    import yaml
    p = Path(__file__).parent / "config" / "profile.yaml"
    data = yaml.safe_load(p.read_text(encoding="utf-8")) or {} if p.exists() else {}
    achievements = data.get("achievements") or []
    achievements.insert(0, {
        "title": title,
        "platform": platform,
        "category": category,
        "description": description,
        "result": result,
        "budget": budget,
    })
    data["achievements"] = achievements
    p.write_text(yaml.dump(data, allow_unicode=True, sort_keys=False), encoding="utf-8")
    click.echo(f"実績を追加しました: {title}")


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
