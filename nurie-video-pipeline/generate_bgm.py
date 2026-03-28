#!/usr/bin/env python3
"""
シンプルなBGMを自動生成（外部素材不要）
不穏系アンビエント — ランキング動画向き
"""

import numpy as np
import wave
import struct
import os

def generate_bgm(output_path, duration_sec=200, sample_rate=44100):
    """不穏なアンビエントBGMを生成"""

    total_samples = int(duration_sec * sample_rate)
    audio = np.zeros(total_samples, dtype=np.float64)

    # ベースドローン（低音の持続音）
    # Dm系の不穏なコード
    base_freqs = [73.42, 110.0, 146.83]  # D2, A2, D3
    for freq in base_freqs:
        t = np.linspace(0, duration_sec, total_samples, endpoint=False)
        # ゆっくりとしたビブラート
        vibrato = np.sin(2 * np.pi * 0.15 * t) * 1.5
        wave_data = np.sin(2 * np.pi * (freq + vibrato) * t) * 0.08
        audio += wave_data

    # パッド（ゆっくり変化する和音）
    pad_chords = [
        [146.83, 174.61, 220.0],   # Dm
        [130.81, 164.81, 196.0],   # Cm
        [116.54, 146.83, 174.61],  # Bb
        [110.0, 138.59, 165.0],    # Am(b5)風
    ]

    chord_duration = 8.0  # 秒
    for i, chord in enumerate(pad_chords * (int(duration_sec / (chord_duration * len(pad_chords))) + 1)):
        start = int(i * chord_duration * sample_rate)
        end = min(start + int(chord_duration * sample_rate), total_samples)
        if start >= total_samples:
            break

        length = end - start
        t = np.linspace(0, chord_duration, length, endpoint=False)

        # フェードイン/アウト
        fade_len = min(int(1.5 * sample_rate), length // 2)
        envelope = np.ones(length)
        envelope[:fade_len] = np.linspace(0, 1, fade_len)
        envelope[-fade_len:] = np.linspace(1, 0, fade_len)

        for freq in chord:
            wave_data = np.sin(2 * np.pi * freq * t) * 0.04 * envelope
            # 少しデチューンして厚みを出す
            wave_data += np.sin(2 * np.pi * (freq * 1.003) * t) * 0.025 * envelope
            audio[start:end] += wave_data

    # 高音のアルペジオ（キラキラ感 + 緊張感）
    arp_notes = [440, 523.25, 587.33, 659.25, 587.33, 523.25]  # A4, C5, D5, E5...
    note_duration = 0.5
    for i in range(int(duration_sec / note_duration)):
        note_freq = arp_notes[i % len(arp_notes)]
        start = int(i * note_duration * sample_rate)
        length = int(note_duration * sample_rate)
        end = min(start + length, total_samples)
        if start >= total_samples:
            break

        actual_len = end - start
        t = np.linspace(0, note_duration, actual_len, endpoint=False)

        # 減衰エンベロープ
        decay = np.exp(-t * 4)

        wave_data = np.sin(2 * np.pi * note_freq * t) * 0.015 * decay
        audio[start:end] += wave_data

    # パーカッシブな低音パルス（4秒ごと）
    pulse_interval = 4.0
    for i in range(int(duration_sec / pulse_interval)):
        start = int(i * pulse_interval * sample_rate)
        length = int(0.8 * sample_rate)
        end = min(start + length, total_samples)
        if start >= total_samples:
            break

        actual_len = end - start
        t = np.linspace(0, 0.8, actual_len, endpoint=False)
        decay = np.exp(-t * 5)
        pulse = np.sin(2 * np.pi * 55 * t) * 0.06 * decay
        audio[start:end] += pulse

    # ノーマライズ
    max_val = np.max(np.abs(audio))
    if max_val > 0:
        audio = audio / max_val * 0.7

    # 全体のフェードイン/アウト
    fade_in = int(3.0 * sample_rate)
    fade_out = int(5.0 * sample_rate)
    audio[:fade_in] *= np.linspace(0, 1, fade_in)
    audio[-fade_out:] *= np.linspace(1, 0, fade_out)

    # 16bit PCMに変換
    audio_int = np.int16(audio * 32767)

    # WAVで保存
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    with wave.open(output_path, 'w') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(audio_int.tobytes())

    print(f"BGM生成完了: {output_path} ({duration_sec}秒)")


if __name__ == '__main__':
    generate_bgm('assets/bgm.wav', duration_sec=200)
