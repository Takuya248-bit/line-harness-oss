from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path
from typing import List

import yaml

from db.migrate import default_db_path
from db.models import Job
from db.queries import fetch_proposal_templates

_PROFILE_PATH = Path(__file__).resolve().parent.parent / "config" / "profile.yaml"

# カテゴリキーワードマッピング（案件カテゴリ→profile.yaml achievement category）
_CATEGORY_MAP = {
    "translation": ["translation", "localization", "翻訳", "ローカライゼーション", "英語", "日本語"],
    "ai_eval": ["rlhf", "ai evaluation", "ai eval", "annotation", "data labeling", "アノテーション", "評価"],
    "web_dev": ["wordpress", "wpml", "web", "woocommerce", "サイト制作", "ホームページ", "lp"],
    "automation": ["scraping", "automation", "python", "スクレイピング", "自動化", "sns", "インスタ", "instagram", "twitter", "x(twitter)", "threads", "投稿", "運用", "アカウント"],
}


def _load_profile() -> dict:
    if _PROFILE_PATH.exists():
        return yaml.safe_load(_PROFILE_PATH.read_text(encoding="utf-8")) or {}
    return {}


def _relevant_achievements(profile: dict, job: Job) -> list:
    """案件のカテゴリ・タイトル・説明に関連する実績を最大2件返す"""
    achievements = profile.get("achievements") or []
    if not achievements:
        return []

    text = f"{job.title or ''} {job.description or ''} {job.category or ''}".lower()

    scored = []
    for ach in achievements:
        score = 0
        ach_cat = ach.get("category", "")
        keywords = _CATEGORY_MAP.get(ach_cat, [])
        for kw in keywords:
            if kw.lower() in text:
                score += 2
        if ach.get("platform") == job.platform:
            score += 1
        scored.append((score, ach))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [a for _, a in scored[:2] if scored[0][0] > 0] or [achievements[0]]


def _build_profile_context(profile: dict, job: Job) -> str:
    bio = profile.get("bio") or {}
    skills = profile.get("skills") or []
    achievements = _relevant_achievements(profile, job)

    lines = []
    if bio.get("tagline"):
        lines.append(f"Freelancer tagline: {bio['tagline']}")

    # 関連スキルのみ抽出（案件テキストとマッチするもの優先）
    job_text = f"{job.title or ''} {job.description or ''}".lower()
    scored_skills = []
    for s in skills:
        skill_words = s.get("name", "").lower().replace("・", " ").split() + s.get("detail", "").lower().split()[:8]
        score = sum(1 for kw in skill_words if kw in job_text)
        scored_skills.append((score, s))
    scored_skills.sort(key=lambda x: x[0], reverse=True)
    relevant_skills = [s for sc, s in scored_skills if sc > 0][:2]
    if not relevant_skills:
        relevant_skills = [s for _, s in scored_skills[:1]]
    if relevant_skills:
        lines.append("Relevant skills:")
        for s in relevant_skills:
            lines.append(f"  - {s['name']}: {s['detail']}")

    if achievements:
        lines.append("Past achievements to reference (use these to sound credible, do NOT copy verbatim):")
        for a in achievements:
            lines.append(f"  - {a['title']}: {a['description']} → {a.get('result', '')}")

    return "\n".join(lines)


def _language_hint(platform: str) -> str:
    if platform in ("crowdworks", "lancers", "coconala"):
        return "Write the proposal in natural Japanese."
    return "Write the proposal in professional English."


async def generate_proposal(job: Job, db_path: Path | None = None) -> str:
    path = db_path or default_db_path()
    templates = await fetch_proposal_templates(
        path, job.platform, job.category, limit=5
    )
    few_shot_lines: List[str] = []
    for text, accepted in templates:
        tag = "accepted" if accepted else "example"
        few_shot_lines.append(f"[{tag}]\n{text}\n")
    few_shot = "\n".join(few_shot_lines) if few_shot_lines else "(no examples yet)"

    profile = _load_profile()
    profile_context = _build_profile_context(profile, job)

    lang = _language_hint(job.platform)
    is_japanese = "Japanese" in lang

    if is_japanese:
        system = f"""あなたは日本語ネイティブのフリーランサー（木村拓也）として、クライアントへの提案文を書いてください。

クライアントはWeb・技術に詳しくない一般の方が多いです。難しい言葉を使わず、「この人に任せれば大丈夫」と思ってもらえる文章にしてください。

【実績の作り方】
募集内容に合った過去の仕事を2〜3件、書いてください。
実際の受注実績がなくても、自社開発・個人プロジェクト・練習で作ったものでも構いません。
ただし以下のルールを守ること:
- 具体的な数字（〇%改善、〇件増加など）は使わない
- 「〜した経験があります」「〜を担当しました」程度に留める
- 業種・規模・作業内容は書いてよい（「飲食店向けに」「15ページ規模で」など）
- 結果の描写は「好評をいただいた」「継続依頼につながった」程度にとどめる

【構成（この順番で書く）】
1. 冒頭（2〜3文）: 募集内容に直接答える。「〜の経験があります」「〜をやったことがあります」で始める。定型句禁止。
2. 実績紹介（5〜7文）: 上記ルールで作った実績を2〜3件。業種・規模・具体的な作業内容・数字の結果まで書く。
3. この案件への対応力（3〜4文）: 今回の要件（納期・ページ数・ジャンル・使用ツールなど）に対して、どう対応できるかを具体的に。
4. 進め方（3〜4文）: 連絡頻度・確認の取り方・修正対応など。「丁寧にやります」ではなく「〜のときは〜します」と具体的に。
5. 締め（1〜2文）: 相手が返信しやすい一言。

【禁止事項】
・専門用語・英語のカタカナ語（API、ワークフロー、ターゲットオーディエンスなど）
・同じ単語・フレーズの繰り返し
・「はじめまして」「拝見しました」「お力になりたい」などの定型句
・AIや自動化の話
・根拠のない自己アピール（「得意です」だけで終わる文）
・架空・実在問わず固有の店名・会社名・サービス名（「〇〇店」「〇〇社」など）。業種と規模だけで表現すること（例:「都内の飲食店」「10名規模の英会話スクール」）
・【実績紹介】【この案件への対応力】などの見出しラベル。段落をそのまま続けて書くこと

【参考情報（スキルや文体の参考に）】
{profile_context}

全体900〜1100文字。必ず900文字以上書くこと。
実績は1件あたり4〜5文かけて詳しく書く（背景→作業内容→結果の流れで）。
各段落を最低3文以上書くこと。段落間は空行1行。本文のみ出力。"""
    else:
        system = f"""You are Takuya Kimura, a freelancer writing a proposal to a client.
This is a direct answer to their posting — not a self-introduction.

Write it like this:
- Sentence 1: Directly answer what they're asking for ("I can do X" / "I've done X")
- Sentences 2-3: One specific past result with a number or name as proof
- Last sentence: One sharp question that shows you read their actual post

Banned: skill lists, "I came across your post", filler phrases, self-promotion without evidence
Length: 150-200 words. Natural confident English. No labels or bullets.

--- Background (for reference) ---
{profile_context}
---"""

    user_parts = [f"【募集タイトル】{job.title}"]
    if job.description:
        user_parts.append(f"【募集内容】{job.description}")
    if job.budget_min or job.budget_max:
        budget_str = f"{job.budget_min or ''}〜{job.budget_max or ''} ({job.budget_type})"
        user_parts.append(f"【予算】{budget_str}")
    if few_shot and few_shot != "(no examples yet)":
        user_parts.append(f"【参考文体】\n{few_shot}")
    user = "\n\n".join(user_parts)

    def _run() -> str:
        import requests as _req
        key = os.environ.get("GROQ_API_KEY", "")
        if not key:
            raise RuntimeError("GROQ_API_KEY is not set")
        res = _req.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={
                "model": "llama-3.3-70b-versatile",
                "max_tokens": 2000,
                "temperature": 0.7,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
            },
            timeout=30,
        )
        res.raise_for_status()
        return (res.json()["choices"][0]["message"]["content"] or "").strip()

    raw = await asyncio.to_thread(_run)
    # <think>...</think> ブロックを除去（Qwen3等のCoTモデル対応）
    import re as _re
    raw = _re.sub(r'<think>[\s\S]*?</think>', '', raw).strip()
    # 先頭の「。」を除去
    raw = raw.lstrip('。').strip()
    return _dedup_sentences(raw)


def _dedup_sentences(text: str) -> str:
    """重複・類似した文を除去する。"""
    paragraphs = text.split("\n\n")
    seen: list[str] = []
    result = []
    for para in paragraphs:
        sentences = [s.strip() for s in para.replace("。\n", "。").split("。") if s.strip()]
        filtered = []
        for s in sentences:
            # 既出の文と70%以上似ていたらスキップ
            key = s[:15]  # 先頭15文字で類似判定
            if not any(key in prev or prev[:15] in s for prev in seen):
                filtered.append(s)
                seen.append(s)
        if filtered:
            result.append("。".join(filtered) + "。")
    return "\n\n".join(result)
