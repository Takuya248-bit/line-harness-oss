from __future__ import annotations

import asyncio
import subprocess
import sys
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
_AUTO_SUBMIT_PLATFORMS: set = set()  # 現在全PF手動（クリップボード+ブラウザオープン方式）

_EXTERNAL_URLS = {
    "remoteok": "https://remoteok.com/remote-jobs/{eid}",
    "himalayas": "https://himalayas.app/jobs/{eid}",
    "remotive": "https://remotive.com/remote-jobs/{eid}",
    "arbeitnow": "https://www.arbeitnow.com/job/{eid}",
    "upwork": "https://www.upwork.com/jobs/~{eid}",
}


async def _fetch_full_description(job: Any) -> str:
    """案件詳細ページから本文を取得する。"""
    import httpx
    from bs4 import BeautifulSoup
    import os

    urls = {
        "lancers": f"https://www.lancers.jp/work/detail/{job.external_id}",
        "crowdworks": f"https://crowdworks.jp/public/jobs/{job.external_id}",
        "coconala": f"https://coconala.com/requests/{job.external_id}",
    }
    url = urls.get(job.platform)
    if not url:
        return ""

    cookies = {
        "lancers": os.environ.get("LANCERS_SESSION", ""),
        "crowdworks": os.environ.get("CROWDWORKS_SESSION", ""),
        "coconala": os.environ.get("COCONALA_COOKIE", ""),
    }
    cookie = cookies.get(job.platform, "")
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "ja,en-US;q=0.9",
    }
    if cookie:
        headers["Cookie"] = cookie

    async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
        r = await client.get(url, headers=headers)
        if r.status_code >= 400:
            return ""

    soup = BeautifulSoup(r.text, "html.parser")

    # lancers: 案件詳細本文セレクター候補
    for sel in [
        ".p-work-detail__description",
        ".c-wysiwyg",
        "[class*='description']",
        ".p-job-detail__body",
    ]:
        el = soup.select_one(sel)
        if el:
            return el.get_text(separator="\n", strip=True)[:2000]

    return ""


def _manual_apply_page_url(job: Any) -> str:
    all_urls = {**_EXTERNAL_URLS, **{
        "crowdworks": "https://crowdworks.jp/public/jobs/{eid}",
        "lancers": "https://www.lancers.jp/work/propose_start/{eid}",
        "coconala": "https://coconala.com/requests/{eid}",
    }}
    url_tpl = all_urls.get(job.platform, "")
    return url_tpl.format(eid=job.external_id) if url_tpl else ""


def _open_for_manual_apply(job: Any, proposal_text: str, gift_url: str) -> bool:
    """提案文をクリップボードにコピーし、ブラウザで応募ページを開く。macOS専用。"""
    url = _manual_apply_page_url(job)

    clip_text = proposal_text
    if gift_url:
        clip_text += f"\n\n🎁 手土産資料: {gift_url}"

    clipboard_ok = False
    try:
        subprocess.run(["pbcopy"], input=clip_text.encode(), check=True)
        print("提案文をクリップボードにコピーしました。")
        clipboard_ok = True
    except Exception:
        pass

    browser_ok = False
    if url:
        try:
            subprocess.run(["open", url], check=True)
            print(f"ブラウザで応募ページを開きました: {url}")
            browser_ok = True
        except Exception:
            pass

    return clipboard_ok or browser_ok


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

    # 案件詳細を補完（descriptionが短い場合は詳細ページをfetch）
    if len(job.description or "") < 100:
        try:
            full_desc = await _fetch_full_description(job)
            if full_desc:
                job = job.model_copy(update={"description": full_desc})
                print(f"案件詳細を取得しました（{len(full_desc)}文字）")
        except Exception as exc:
            print(f"詳細取得スキップ: {exc}")

    draft_row = await latest_draft_for_job(db_path, job_id)
    if draft_row:
        proposal_id, proposal_text = draft_row
        print("保存済みドラフトを使用します。")
    else:
        print("提案文を生成中...")
        proposal_text = await generate_proposal(job, db_path)
        proposal_id = await insert_proposal_draft(db_path, job_id, proposal_text)

    gift_url = ""  # 手土産は一旦無効化

    # 提案文を表示
    print("\n" + "=" * 60)
    print(f"案件: [{job.platform}] {job.title}")
    print(f"job_id: {job_id}")
    print("=" * 60)
    print(proposal_text)
    if gift_url:
        print(f"\n🎁 手土産資料: {gift_url}")
    print("=" * 60)

    apply_url = _manual_apply_page_url(job)
    manual_ok = _open_for_manual_apply(job, proposal_text, gift_url)
    if manual_ok:
        msg = "クリップボードにコピー済み。Cmd+V で貼り付けて送信してください。"
    else:
        msg = f"提案文（上記）をコピーして手動で応募してください。\n{apply_url if apply_url else ''}"
    return {"ok": True, "message": msg, "proposal": proposal_text}

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
