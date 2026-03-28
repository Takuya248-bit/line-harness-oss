"""
バズ語りネタ自動収集パイプライン

Usage:
    python3 -m src.main                  # 全ソース収集
    python3 -m src.main --dry-run        # 収集+スコアリングのみ（保存・通知なし）
    python3 -m src.main --source reddit  # 特定ソースのみ
"""
from __future__ import annotations

import argparse
import csv
import sys
from datetime import datetime
from pathlib import Path

from src.config import load_config
from src.collectors.base import CollectedItem
from src.collectors.chiebukuro import ChiebukuroCollector
from src.collectors.reddit import RedditCollector
from src.collectors.hatena import HatenaCollector
from src.collectors.youtube_shorts import YoutubeShortsCollector
from src.collectors.twitter import TwitterCollector
from src.scorer import score_item, score_item_detail, classify_tier, is_excluded
from src.dedup import DedupDB
from src.obsidian_writer import write_topic_note
from src.line_notifier import send_notification


def run(config_path: str | None = None, dry_run: bool = False, source_filter: str | None = None, csv_path: str | None = None):
    cfg = load_config(config_path)
    sources_cfg = cfg.get("sources", {})
    scoring_cfg = cfg.get("scoring", {})
    obsidian_cfg = cfg.get("obsidian", {})
    notify_cfg = cfg.get("notification", {}).get("line", {})

    save_threshold = scoring_cfg.get("save_threshold", 50)
    notify_threshold = scoring_cfg.get("notify_threshold", 70)

    vault_path = Path(obsidian_cfg.get("vault_path", "~/Documents/Obsidian Vault")).expanduser()
    output_dir = vault_path / obsidian_cfg.get("output_dir", "knowledge/trending-topics")

    db_path = Path(__file__).parent.parent / "data" / "seen.db"
    db_path.parent.mkdir(parents=True, exist_ok=True)
    db = DedupDB(db_path)

    print(f"=== バズネタ収集 {datetime.now().strftime('%Y-%m-%d %H:%M')} ===\n")

    collectors = []
    if not source_filter or source_filter == "chiebukuro":
        if sources_cfg.get("chiebukuro", {}).get("enabled", True):
            collectors.append(ChiebukuroCollector(sources_cfg["chiebukuro"]))
    if not source_filter or source_filter == "reddit":
        if sources_cfg.get("reddit", {}).get("enabled", True):
            collectors.append(RedditCollector(sources_cfg["reddit"]))
    if not source_filter or source_filter == "hatena":
        if sources_cfg.get("hatena", {}).get("enabled", True):
            collectors.append(HatenaCollector(sources_cfg["hatena"]))
    if not source_filter or source_filter == "youtube":
        if sources_cfg.get("youtube_shorts", {}).get("enabled", True):
            collectors.append(YoutubeShortsCollector(sources_cfg["youtube_shorts"]))
    if not source_filter or source_filter == "twitter":
        if sources_cfg.get("twitter", {}).get("enabled", False):
            collectors.append(TwitterCollector(sources_cfg["twitter"]))

    all_items: list[CollectedItem] = []
    for collector in collectors:
        print(f"[{collector.source_name}]")
        try:
            items = collector.collect()
            all_items.extend(items)
        except Exception as e:
            print(f"  error: {e}")
        print()

    print(f"収集合計: {len(all_items)}件\n")

    new_items = []
    for item in all_items:
        if not db.is_seen(item.url):
            new_items.append(item)
    print(f"新規: {len(new_items)}件 (既知: {len(all_items) - len(new_items)}件)\n")

    excluded_count = 0
    scored: list[tuple[CollectedItem, int, dict]] = []
    for item in new_items:
        if is_excluded(item):
            excluded_count += 1
            continue
        s = score_item(item)
        detail = score_item_detail(item)
        scored.append((item, s, detail))

    scored.sort(key=lambda x: x[1], reverse=True)

    to_save = [(item, s, d) for item, s, d in scored if s >= save_threshold]
    to_notify = [(item, s, d) for item, s, d in scored if s >= notify_threshold]

    print(f"=== スコアリング結果 ===")
    print(f"除外: {excluded_count}件")
    print(f"保存対象(>={save_threshold}): {len(to_save)}件")
    print(f"通知対象(>={notify_threshold}): {len(to_notify)}件\n")

    for item, s, d in scored[:20]:
        flag = "***" if s >= notify_threshold else "  *" if s >= save_threshold else "   "
        print(f"  {flag} {s:3d}点 [{item.source:10}] [{d['tier']}] {item.title[:45]}")

    # CSV出力
    if csv_path:
        csv_out = Path(csv_path)
        with open(csv_out, "w", newline="", encoding="utf-8-sig") as f:
            w = csv.writer(f)
            w.writerow(["スコア", "Tier", "コメント誘発", "感情", "語り適性", "鮮度", "櫻子視点", "ソース", "タイトル", "URL", "カテゴリ", "エンゲージメント"])
            for item, s, d in scored:
                eng_parts = [f"{k}:{v}" for k, v in item.engagement.items()]
                w.writerow([s, d["tier"], d["comment_trigger"], d["emotion"], d["brevity"], d["freshness"], d["sakurako_angle"], item.source, item.title, item.url, item.category, " ".join(eng_parts)])
        print(f"\nCSV出力: {len(scored)}件 → {csv_out}")

    if dry_run:
        print("\n[dry-run] 保存・通知はスキップ")
        db.close()
        return

    saved_count = 0
    for item, s, d in to_save:
        try:
            write_topic_note(item, score=s, output_dir=output_dir)
            db.mark_seen(item.url, item.title, item.source)
            saved_count += 1
        except Exception as e:
            print(f"  save error: {e}")

    print(f"\nObsidian保存: {saved_count}件 → {output_dir}")

    notify_items = [(item, s) for item, s, d in to_notify]
    if notify_items and notify_cfg.get("enabled") and notify_cfg.get("token"):
        ok = send_notification(notify_items, token=notify_cfg["token"])
        print(f"LINE通知: {'送信成功' if ok else '送信失敗'} ({len(to_notify)}件)")
    elif notify_items:
        print(f"LINE通知: token未設定のためスキップ ({len(notify_items)}件)")

    cleaned = db.cleanup(max_age_days=30)
    if cleaned:
        print(f"DB cleanup: {cleaned}件削除")

    db.close()
    print("\n=== 完了 ===")


def main():
    parser = argparse.ArgumentParser(description="バズ語りネタ自動収集")
    parser.add_argument("--dry-run", action="store_true", help="収集+スコアのみ、保存・通知しない")
    parser.add_argument("--source", type=str, help="特定ソースのみ実行 (chiebukuro/reddit/hatena/youtube/twitter)")
    parser.add_argument("--config", type=str, help="config.yamlのパス")
    parser.add_argument("--csv", type=str, help="CSV出力先パス")
    args = parser.parse_args()

    run(config_path=args.config, dry_run=args.dry_run, source_filter=args.source, csv_path=args.csv)


if __name__ == "__main__":
    main()
