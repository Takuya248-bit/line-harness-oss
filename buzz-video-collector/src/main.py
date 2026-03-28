"""
バズ動画ネタ自動収集パイプライン

Usage:
    python3 -m src                          # 全ソース収集
    python3 -m src --dry-run                # 収集+判定のみ（保存・通知なし）
    python3 -m src --source ig_reels        # IGリールのみ
    python3 -m src --csv results.csv        # CSV出力
    python3 -m src --no-visual              # スクショ判定スキップ
"""
from __future__ import annotations
import argparse
from datetime import datetime
from pathlib import Path
from src.config import load_config
from src.collectors.base import VideoItem
from src.collectors.ig_reels import IGReelsCollector, IGReelsScreenshotter
from src.collectors.yt_shorts import YTShortsCollector
from src.analyzer.gemini import GeminiAnalyzer
from src.dedup import DedupDB
from src.output.obsidian import write_video_note
from src.output.line_notify import send_notification
from src.output.csv_export import export_csv, ScoredVideo


def run(config_path=None, dry_run=False, source_filter=None, csv_path=None, no_visual=False):
    cfg = load_config(config_path)
    sources_cfg = cfg.get("sources", {})
    scoring_cfg = cfg.get("scoring", {})
    obsidian_cfg = cfg.get("obsidian", {})
    notify_cfg = cfg.get("notification", {}).get("line", {})
    analyzer_cfg = cfg.get("analyzer", {})
    save_threshold = scoring_cfg.get("save_threshold", 50)
    notify_threshold = scoring_cfg.get("notify_threshold", 70)
    vault_path = Path(obsidian_cfg.get("vault_path", "~/Documents/Obsidian Vault")).expanduser()
    output_dir = vault_path / obsidian_cfg.get("output_dir", "knowledge/buzz-videos")
    db_path = Path(__file__).parent.parent / "data" / "seen.db"
    db_path.parent.mkdir(parents=True, exist_ok=True)
    db = DedupDB(db_path)

    print(f"=== バズ動画ネタ収集 {datetime.now().strftime('%Y-%m-%d %H:%M')} ===\n")

    # --- 収集 ---
    all_items: list[VideoItem] = []
    if (not source_filter or source_filter == "ig_reels") and sources_cfg.get("ig_reels", {}).get("enabled", True):
        print("[IG Reels]")
        try:
            collector = IGReelsCollector(sources_cfg["ig_reels"])
            all_items.extend(collector.collect())
        except Exception as e:
            print(f"  error: {e}")
        print()
    if (not source_filter or source_filter == "yt_shorts") and sources_cfg.get("yt_shorts", {}).get("enabled", True):
        print("[YT Shorts]")
        try:
            collector = YTShortsCollector(sources_cfg["yt_shorts"])
            all_items.extend(collector.collect())
        except Exception as e:
            print(f"  error: {e}")
        print()

    print(f"収集合計: {len(all_items)}件\n")

    # --- 重複排除 ---
    new_items = [item for item in all_items if not db.is_seen(item.url)]
    print(f"新規: {len(new_items)}件 (既知: {len(all_items) - len(new_items)}件)\n")
    if not new_items:
        print("新規ネタなし。終了。")
        db.close()
        return

    # --- Gemini テキスト判定 ---
    api_key = analyzer_cfg.get("api_key", "")
    if not api_key:
        print("GEMINI_API_KEY未設定。スコアリングをスキップ。")
        db.close()
        return
    model = analyzer_cfg.get("model", "gemini-2.5-flash-preview-05-20")
    batch_size = analyzer_cfg.get("batch_size", 5)
    analyzer = GeminiAnalyzer(api_key=api_key, model=model)

    print("=== Gemini テキスト判定 ===")
    text_judgments = []
    for i in range(0, len(new_items), batch_size):
        batch = new_items[i:i + batch_size]
        captions = [item.caption for item in batch]
        results = analyzer.judge_texts_with_retry(captions)
        text_judgments.extend(results)
        print(f"  {min(i + batch_size, len(new_items))}/{len(new_items)} 判定完了")

    # --- スクショ判定（オプション） ---
    visual_judgments = {}
    ig_items = [item for item in new_items if item.source == "ig_reels"]
    if not no_visual and ig_items:
        print("\n=== スクショ撮影+フォーマット判定 ===")
        screenshotter = IGReelsScreenshotter()
        ig_urls = [item.url for item in ig_items]
        ss_map = screenshotter.capture(ig_urls)
        for url, ss_path in ss_map.items():
            vj = analyzer.judge_visual(ss_path)
            if vj:
                visual_judgments[url] = vj
        print(f"  {len(visual_judgments)}/{len(ig_items)}件のフォーマット判定完了")

    # --- スコアリング結果 ---
    scored: list[ScoredVideo] = []
    for item, tj in zip(new_items, text_judgments):
        if tj is None:
            continue
        vj = visual_judgments.get(item.url)
        scored.append(ScoredVideo(item=item, text=tj, visual=vj))
    scored.sort(key=lambda sv: sv.text.total_score, reverse=True)
    to_save = [sv for sv in scored if sv.text.total_score >= save_threshold]
    to_notify = [sv for sv in scored if sv.text.total_score >= notify_threshold]

    print(f"\n=== スコアリング結果 ===")
    print(f"判定成功: {len(scored)}件")
    print(f"保存対象(>={save_threshold}): {len(to_save)}件")
    print(f"通知対象(>={notify_threshold}): {len(to_notify)}件\n")
    for sv in scored[:20]:
        flag = "***" if sv.text.total_score >= notify_threshold else "  *" if sv.text.total_score >= save_threshold else "   "
        fmt = f" [{sv.visual.format}]" if sv.visual else ""
        print(f"  {flag} {sv.text.total_score:3d}点 [{sv.item.source:10}] [tier{sv.text.tier}]{fmt} {sv.text.summary[:40]}")

    if csv_path:
        export_csv(scored, csv_path)
        print(f"\nCSV出力: {len(scored)}件 → {csv_path}")
    if dry_run:
        print("\n[dry-run] 保存・通知はスキップ")
        db.close()
        return

    # --- Obsidian保存 ---
    saved_count = 0
    month_dir = output_dir / datetime.now().strftime("%Y-%m")
    for sv in to_save:
        try:
            write_video_note(sv.item, sv.text, sv.visual, output_dir=month_dir)
            db.mark_seen(sv.item.url, sv.text.summary, sv.item.source)
            saved_count += 1
        except Exception as e:
            print(f"  save error: {e}")
    print(f"\nObsidian保存: {saved_count}件 → {month_dir}")

    # --- LINE通知 ---
    if to_notify and notify_cfg.get("enabled") and notify_cfg.get("token"):
        ok = send_notification(to_notify, token=notify_cfg["token"])
        print(f"LINE通知: {'送信成功' if ok else '送信失敗'} ({len(to_notify)}件)")
    elif to_notify:
        print(f"LINE通知: token未設定のためスキップ ({len(to_notify)}件)")

    cleaned = db.cleanup(max_age_days=60)
    if cleaned:
        print(f"DB cleanup: {cleaned}件削除")
    db.close()
    print("\n=== 完了 ===")


def main():
    parser = argparse.ArgumentParser(description="バズ動画ネタ自動収集")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--source", type=str, help="ig_reels or yt_shorts")
    parser.add_argument("--config", type=str)
    parser.add_argument("--csv", type=str)
    parser.add_argument("--no-visual", action="store_true", help="スクショ判定をスキップ")
    args = parser.parse_args()
    run(config_path=args.config, dry_run=args.dry_run, source_filter=args.source,
        csv_path=args.csv, no_visual=args.no_visual)
