"""会話ログ & 未理解指示の記録モジュール。

全メッセージを記録し、特に理解できなかった指示を分類・蓄積する。
蓄積データからプロンプト改善や新コマンド追加の判断材料にする。
"""
from __future__ import annotations

import json
import os
import time
from collections import Counter
from typing import Optional


class ConversationLog:
    def __init__(self, data_dir: str):
        self.data_dir = data_dir
        os.makedirs(data_dir, exist_ok=True)
        self._log_path = os.path.join(data_dir, "messages.jsonl")
        self._misunderstood_path = os.path.join(data_dir, "misunderstood.jsonl")

    def log_message(
        self,
        user_id: str,
        user_text: str,
        bot_response: str,
        understood: bool = True,
        context: Optional[dict] = None,
    ) -> None:
        """会話を記録する。"""
        record = {
            "ts": time.time(),
            "user_id": user_id,
            "user_text": user_text,
            "bot_response": bot_response,
            "understood": understood,
        }
        if context:
            record["context"] = context
        self._append_jsonl(self._log_path, record)

        if not understood:
            self._append_jsonl(self._misunderstood_path, record)

    def get_misunderstood(self, limit: int = 20) -> list[dict]:
        """未理解の指示一覧を返す（新しい順）。"""
        records = self._read_jsonl(self._misunderstood_path)
        return records[-limit:][::-1]

    def get_misunderstood_summary(self) -> str:
        """未理解指示のサマリーを返す。"""
        records = self._read_jsonl(self._misunderstood_path)
        if not records:
            return "未理解の指示はまだありません"

        lines = [f"理解できなかった指示: {len(records)}件"]

        recent = records[-10:][::-1]
        lines.append("\n最近の未理解指示:")
        for r in recent:
            t = time.strftime("%m/%d %H:%M", time.localtime(r["ts"]))
            lines.append(f"  [{t}] {r['user_text']}")

        return "\n".join(lines)

    def get_recent_log(self, user_id: str, limit: int = 10) -> str:
        """指定ユーザーの直近の会話ログを返す。"""
        records = self._read_jsonl(self._log_path)
        user_records = [r for r in records if r["user_id"] == user_id]
        recent = user_records[-limit:][::-1]
        if not recent:
            return "会話履歴なし"

        lines = []
        for r in recent:
            t = time.strftime("%m/%d %H:%M", time.localtime(r["ts"]))
            mark = "" if r.get("understood", True) else " [未理解]"
            lines.append(f"[{t}]{mark}\nYou: {r['user_text']}\nBot: {r['bot_response']}")
        return "\n---\n".join(lines)

    def _append_jsonl(self, path: str, record: dict) -> None:
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")

    def get_improvement_report(self) -> str:
        """詰まりポイントを分析し、改善レポートを生成する。"""
        misunderstood = self._read_jsonl(self._misunderstood_path)
        all_msgs = self._read_jsonl(self._log_path)
        if not all_msgs:
            return "まだデータなし"

        total = len(all_msgs)
        errors = [r for r in misunderstood if r.get("context", {}).get("type") in ("video_error", "audio_without_mode")]
        failed_adjustments = [r for r in misunderstood if r.get("context", {}).get("type") not in ("video_error", "audio_without_mode", None)]
        text_misunderstood = [r for r in misunderstood if not r.get("context", {}).get("type")]

        lines = [f"=== 改善レポート ==="]
        lines.append(f"総やり取り: {total}件")
        lines.append(f"詰まり合計: {len(misunderstood)}件 ({len(misunderstood)/max(total,1)*100:.0f}%)")

        if errors:
            lines.append(f"\n[処理エラー] {len(errors)}件")
            error_types = Counter()
            for r in errors[-5:]:
                err = r.get("context", {}).get("error", "不明")[:60]
                error_types[err] += 1
            for err, cnt in error_types.most_common(3):
                lines.append(f"  {cnt}回: {err}")

        if text_misunderstood:
            lines.append(f"\n[理解できなかった指示] {len(text_misunderstood)}件")
            for r in text_misunderstood[-5:]:
                lines.append(f"  「{r['user_text'][:40]}」")

        if failed_adjustments:
            lines.append(f"\n[調整失敗] {len(failed_adjustments)}件")
            for r in failed_adjustments[-5:]:
                lines.append(f"  「{r['user_text'][:40]}」")

        return "\n".join(lines)

    def _read_jsonl(self, path: str) -> list[dict]:
        if not os.path.exists(path):
            return []
        records = []
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    records.append(json.loads(line))
        return records
