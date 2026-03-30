"""SE配置の学習モジュール。

ユーザーの調整操作を記録し、パターンからルールを自動導出する。
- delete操作が多いカテゴリ → max_repeats を下げる / skip する
- volume操作が多いカテゴリ → volume_adjust を反映
- add操作が多いカテゴリ → 配置優先度を上げる
"""
from __future__ import annotations

import json
import os
import time
from collections import Counter
from typing import Optional


class LearningStore:
    """調整操作の永続記録と学習ルール導出。"""

    def __init__(self, data_dir: str):
        self.data_dir = data_dir
        os.makedirs(data_dir, exist_ok=True)
        self._adjustments_path = os.path.join(data_dir, "adjustments.json")
        self._rules_path = os.path.join(data_dir, "learned_rules.json")

    # --- 記録 ---

    def record_adjustment(
        self,
        user_id: str,
        operations: list[dict],
        timeline: list[dict],
        events: list[dict],
    ) -> None:
        """調整操作を記録する。"""
        records = self._load_adjustments()
        for op in operations:
            event_type = self._match_event_type(
                op, timeline, events
            )
            records.append({
                "ts": time.time(),
                "user_id": user_id,
                "action": op["action"],
                "event_type": event_type,
                "detail": op,
            })
        self._save_adjustments(records)
        self._derive_rules(records)

    def _match_event_type(
        self, op: dict, timeline: list[dict], events: list[dict]
    ) -> Optional[str]:
        """操作対象のタイムスタンプからイベント種別を特定する。"""
        target_ts = op.get("timestamp", op.get("from_timestamp"))
        if target_ts is None:
            return None
        for ev in events:
            if ev["start"] <= target_ts <= ev["end"]:
                return ev.get("event")
        # タイムラインのSEファイル名からカテゴリ推定
        for entry in timeline:
            if abs(entry["timestamp"] - target_ts) <= 1.0:
                sfx_path = entry.get("sfx", "")
                parts = sfx_path.replace("\\", "/").split("/")
                if len(parts) >= 2:
                    return parts[-2]  # カテゴリフォルダ名
        return None

    # --- ルール導出 ---

    def _derive_rules(self, records: list[dict]) -> dict:
        """蓄積した操作からルールを導出して保存する。"""
        delete_counts: Counter = Counter()
        add_counts: Counter = Counter()
        volume_changes: dict[str, list[int]] = {}

        for rec in records:
            et = rec.get("event_type")
            if not et:
                continue
            action = rec["action"]
            if action == "delete":
                delete_counts[et] += 1
            elif action == "add":
                add_counts[et] += 1
            elif action == "volume":
                vol = rec["detail"].get("volume_db")
                if vol is not None:
                    volume_changes.setdefault(et, []).append(vol)

        rules: dict[str, dict] = {}

        # delete が3回以上 → リピート制限
        for et, count in delete_counts.items():
            rules.setdefault(et, {})
            if count >= 5:
                rules[et]["max_repeats"] = 0  # リピート禁止
            elif count >= 3:
                rules[et]["max_repeats"] = 1  # 1回まで

        # volume 変更のトレンド → 平均を適用
        for et, vols in volume_changes.items():
            rules.setdefault(et, {})
            avg_vol = round(sum(vols) / len(vols))
            rules[et]["volume_adjust"] = avg_vol

        # add が多い → 優先配置
        for et, count in add_counts.items():
            if count >= 3:
                rules.setdefault(et, {})
                rules[et]["boost"] = True

        self._save_rules(rules)
        return rules

    # --- ルール読み込み ---

    def load_rules(self) -> dict:
        """学習済みルールを読み込む。"""
        if not os.path.exists(self._rules_path):
            return {}
        with open(self._rules_path) as f:
            return json.load(f)

    # --- 永続化ヘルパー ---

    def _load_adjustments(self) -> list[dict]:
        if not os.path.exists(self._adjustments_path):
            return []
        with open(self._adjustments_path) as f:
            return json.load(f)

    def _save_adjustments(self, records: list[dict]) -> None:
        with open(self._adjustments_path, "w") as f:
            json.dump(records, f, ensure_ascii=False)

    def _save_rules(self, rules: dict) -> None:
        with open(self._rules_path, "w") as f:
            json.dump(rules, f, ensure_ascii=False, indent=2)

    # --- 統計表示 ---

    def get_stats(self) -> str:
        """学習状況のサマリーを返す。"""
        records = self._load_adjustments()
        rules = self.load_rules()
        if not records:
            return "学習データなし（調整を繰り返すと自動で学習します）"

        lines = [f"調整記録: {len(records)}件"]
        action_counts = Counter(r["action"] for r in records)
        lines.append(f"  削除: {action_counts.get('delete', 0)} / 追加: {action_counts.get('add', 0)} / 音量: {action_counts.get('volume', 0)} / 移動: {action_counts.get('move', 0)}")

        if rules:
            lines.append("学習ルール:")
            for et, rule in rules.items():
                parts = []
                if "max_repeats" in rule:
                    parts.append(f"リピート上限={rule['max_repeats']}")
                if "volume_adjust" in rule:
                    parts.append(f"音量={rule['volume_adjust']:+d}dB")
                if rule.get("boost"):
                    parts.append("優先配置")
                lines.append(f"  {et}: {', '.join(parts)}")

        return "\n".join(lines)
