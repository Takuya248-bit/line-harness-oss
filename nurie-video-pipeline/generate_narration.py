#!/usr/bin/env python3
"""
ナレーション自動生成
gTTS（Google Text-to-Speech）を使用 — 無料、インストール不要
生成した音声を動画のタイミングに合わせて結合
"""

import os
import argparse
import tempfile

import pandas as pd
from gtts import gTTS
from pydub import AudioSegment


def generate_pref_narration(rank, pref_name, value, unit, output_path):
    """1県分のナレーション音声を生成"""
    # 読み上げテキスト
    text = f"第{rank}位、{pref_name}、{value}{unit}"
    tts = gTTS(text=text, lang='ja', slow=False)

    # 一時ファイルに保存してからpydubで読み込み
    tmp = output_path + '.tmp.mp3'
    tts.save(tmp)

    # mp3 → wav変換 + 速度調整
    audio = AudioSegment.from_mp3(tmp)
    os.remove(tmp)

    # wavで保存
    audio.export(output_path, format='wav')
    return audio.duration_seconds


def generate_all_narrations(csv_path, output_dir, reverse=False):
    """全県のナレーションを生成"""
    df = pd.read_csv(csv_path)
    total = len(df)

    os.makedirs(output_dir, exist_ok=True)

    ranks = list(range(total, 0, -1)) if reverse else list(range(1, total + 1))

    durations = {}
    for i, rank in enumerate(ranks):
        row = df[df['rank'] == rank].iloc[0]
        out_path = os.path.join(output_dir, f'narration_{rank:03d}.wav')

        print(f'\rナレーション生成: {i+1}/{total} - {row["pref_name"]}', end='', flush=True)
        dur = generate_pref_narration(rank, row['pref_name'], row['value'], row['unit'], out_path)
        durations[rank] = dur

    print()
    return durations


def combine_narrations_with_timing(output_dir, durations, sec_per_pref=3.5,
                                    intro_sec=5.0, output_path='assets/narration.wav',
                                    reverse=False):
    """タイミングに合わせてナレーションを結合（マイルストーン・演出セクション対応）"""
    total = len(durations)
    ranks = list(range(total, 0, -1)) if reverse else list(range(1, total + 1))

    # マイルストーン定義（動画側と同期）
    milestones = {
        45: 3, 40: 3, 35: 3, 30: 4, 25: 3,
        20: 4, 15: 3, 10: 4, 5: 4,
    }
    drumroll_rank = 3
    drumroll_sec = 4
    top3_review_sec = 6
    outro_sec = 7.0
    endcard_sec = 5.0

    # 各県の開始時刻を計算（マイルストーン挿入を考慮）
    current_time = intro_sec
    rank_start_times = {}
    for rank in ranks:
        # マイルストーン挿入
        if rank in milestones:
            current_time += milestones[rank]
        # ドラムロール挿入
        if rank == drumroll_rank:
            current_time += drumroll_sec
        rank_start_times[rank] = current_time
        current_time += sec_per_pref

    # 総尺（TOP3振り返り + アウトロ + エンドカード含む）
    total_duration_ms = int((current_time + top3_review_sec + outro_sec + endcard_sec) * 1000)

    # 無音ベース
    combined = AudioSegment.silent(duration=total_duration_ms)

    # 各ナレーションを配置
    for rank in ranks:
        wav_path = os.path.join(output_dir, f'narration_{rank:03d}.wav')
        if not os.path.exists(wav_path):
            continue

        narration = AudioSegment.from_wav(wav_path)

        # 配置タイミング（ms）— 各県の表示開始から0.5秒後
        offset_ms = int((rank_start_times[rank] + 0.5) * 1000)

        # ナレーションが表示時間を超えないようにトリミング
        max_dur_ms = int((sec_per_pref - 0.8) * 1000)
        if len(narration) > max_dur_ms:
            narration = narration[:max_dur_ms]

        # オーバーレイ
        combined = combined.overlay(narration, position=offset_ms)

    # 保存
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    combined.export(output_path, format='wav')
    print(f"ナレーション結合完了: {output_path} ({total_duration_ms/1000:.1f}秒)")
    return output_path


def main():
    parser = argparse.ArgumentParser(description='ナレーション生成')
    parser.add_argument('--csv', required=True, help='ランキングCSV')
    parser.add_argument('--output', default='assets/narration.wav', help='出力パス')
    parser.add_argument('--sec-per-pref', type=float, default=3.5)
    parser.add_argument('--intro-sec', type=float, default=5.0)
    parser.add_argument('--reverse', action='store_true')
    args = parser.parse_args()

    narration_dir = tempfile.mkdtemp(prefix='narration_')

    try:
        print("個別ナレーション生成中...")
        durations = generate_all_narrations(args.csv, narration_dir, args.reverse)

        print("ナレーション結合中...")
        combine_narrations_with_timing(
            narration_dir, durations,
            sec_per_pref=args.sec_per_pref,
            intro_sec=args.intro_sec,
            output_path=args.output,
            reverse=args.reverse
        )
    finally:
        import shutil
        shutil.rmtree(narration_dir, ignore_errors=True)


if __name__ == '__main__':
    main()
