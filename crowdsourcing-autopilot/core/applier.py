from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any, Dict

from db.migrate import default_db_path
from db.models import Job
from db.queries import (
    get_job_by_id,
    latest_draft_for_job,
    insert_proposal_draft,
    mark_proposal_sent,
    update_job_score_and_status,
)
from core.gift import generate_gift
from core.proposer import generate_proposal

# 自動送信に対応しているプラットフォーム
_AUTO_SUBMIT_PLATFORMS = {"crowdworks", "lancers", "coconala"}

_EXTERNAL_URLS = {
    "remoteok": "https://remoteok.com/remote-jobs/{eid}",
    "himalayas": "https://himalayas.app/jobs/{eid}",
    "remotive": "https://remotive.com/remote-jobs/{eid}",
    "arbeitnow": "https://www.arbeitnow.com/job/{eid}",
    "upwork": "https://www.upwork.com/jobs/~{eid}",
}


def _job_from_row(row: Any) -> Job:
    return Job(
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
        id=row["id"],
    )


async def apply_to_job(job_id: int, auto_confirm: bool = False) -> Dict[str, Any]:
    """
    job_idを指定して応募を実行する。
    戻り値: {"ok": bool, "message": str, "proposal": str}
    """
    db_path = default_db_path()

    row = await get_job_by_id(db_path, job_id)
    if not row:
        return {"ok": False, "message": f"job_id {job_id} が見つかりません。", "proposal": ""}

    job = _job_from_row(row)

    # 提案文: DBのドラフトを使うか新規生成
    draft_row = await latest_draft_for_job(db_path, job_id)
    if draft_row:
        proposal_id, proposal_text = draft_row
    else:
        print("提案文を生成中...")
        proposal_text = await generate_proposal(job, db_path)
        proposal_id = await insert_proposal_draft(db_path, job_id, proposal_text)

    # 手土産コンテンツを生成
    print("手土産コンテンツを生成中...")
    try:
        gift = await generate_gift(job)
        gift_url = gift.get("url") or ""
    except Exception:
        gift_url = ""

    # 提案文を表示
    print("\n" + "=" * 60)
    print(f"案件: [{job.platform}] {job.title}")
    print(f"job_id: {job_id}")
    print("=" * 60)
    print(proposal_text)
    if gift_url:
        print(f"\n🎁 手土産資料: {gift_url}")
    print("=" * 60)

    # 外部サイトの場合はURLを表示して終了
    if job.platform not in _AUTO_SUBMIT_PLATFORMS:
        url_tpl = _EXTERNAL_URLS.get(job.platform, "")
        url = url_tpl.format(eid=job.external_id) if url_tpl else ""
        gift_line = f"\n🎁 手土産資料: {gift_url}" if gift_url else ""
        msg = f"このプラットフォームは自動送信非対応です。\n上記の提案文をコピーして手動で応募してください。\n{url}{gift_line}"
        print(f"\n{msg}")
        return {"ok": False, "message": msg, "proposal": proposal_text}

    # 自動送信対応プラットフォーム
    if not auto_confirm:
        answer = input("\nこの提案文で応募しますか？ [y/N]: ").strip().lower()
        if answer != "y":
            return {"ok": False, "message": "応募をキャンセルしました。", "proposal": proposal_text}

    # アダプター経由で送信
    from core.scanner import ADAPTER_FACTORIES
    factory = ADAPTER_FACTORIES.get(job.platform)
    if not factory:
        return {"ok": False, "message": f"アダプターが見つかりません: {job.platform}", "proposal": proposal_text}

    adapter = factory()
    try:
        ok = await adapter.submit_proposal(job, proposal_text)
    except Exception as exc:
        return {"ok": False, "message": f"送信エラー: {exc}", "proposal": proposal_text}

    if ok:
        await mark_proposal_sent(db_path, proposal_id)
        await update_job_score_and_status(db_path, job_id, job.score or 0, "applied")
        return {"ok": True, "message": "応募完了！", "proposal": proposal_text}
    else:
        return {"ok": False, "message": "送信に失敗しました（アダプターがFalseを返しました）。", "proposal": proposal_text}
