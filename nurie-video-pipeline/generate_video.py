#!/usr/bin/env python3
"""
塗り絵ランキング動画 自動生成パイプライン v3
CSV → 日本地図塗り絵アニメーション → MP4

v3改善点:
- アニメーション付きトランジション（フェードイン、スライド）
- 数値カウントアップエフェクト
- 新県ハイライトグロー
- FPS 24対応
- イントロ/アウトロのフェードトランジション
- TOP3メダル演出強化
- バーチャートのスライドインアニメーション
"""

import argparse
import os
import tempfile
import shutil
import math

import numpy as np
import pandas as pd
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from japanmap import picture as japan_picture, pref_names as _pref_names
from moviepy import ImageSequenceClip, AudioFileClip

# ============================================================
# 都道府県コードマッピング
# ============================================================
PREF_NAME_TO_CODE = {}
for _code in range(1, 48):
    _full = _pref_names[_code]
    PREF_NAME_TO_CODE[_full] = _code
    _short = _full.replace('県', '').replace('府', '').replace('都', '').replace('道', '')
    if _short and _short != _full:
        PREF_NAME_TO_CODE[_short] = _code
PREF_NAME_TO_CODE['北海道'] = 1


# ============================================================
# カラーパレット
# ============================================================
BG_COLOR = (15, 15, 30)
BG_DARK = (10, 10, 22)
PANEL_COLOR = (25, 25, 50, 220)
TEXT_WHITE = (255, 255, 255)
TEXT_GRAY = (140, 140, 160)
TEXT_DIM = (80, 80, 100)
GOLD = (255, 215, 0)
ACCENT_RED = (255, 80, 80)
ACCENT_BLUE = (80, 160, 255)
UNPAINTED = (40, 40, 60)


def get_rank_color(rank, total=47):
    """順位に応じた色（1位=深紅, 中間=オレンジ/黄, 47位=緑）"""
    ratio = (rank - 1) / max(total - 1, 1)
    if ratio < 0.33:
        t = ratio / 0.33
        r = 220
        g = int(60 + 130 * t)
        b = int(40 + 10 * t)
    elif ratio < 0.66:
        t = (ratio - 0.33) / 0.33
        r = int(220 - 30 * t)
        g = int(190 + 50 * t)
        b = int(50 + 20 * t)
    else:
        t = (ratio - 0.66) / 0.34
        r = int(190 - 140 * t)
        g = int(240 - 20 * t)
        b = int(70 + 60 * t)
    return (r, g, b)


# ============================================================
# 安全な rounded_rectangle（古いPillow対応）
# ============================================================
def safe_rounded_rect(draw, xy, radius, fill=None, outline=None):
    """rounded_rectangleのradiusが大きすぎてエラーになる場合のガード"""
    x0, y0, x1, y1 = xy[0], xy[1], xy[2], xy[3]
    w = x1 - x0
    h = y1 - y0
    if w <= 0 or h <= 0:
        return
    # Pillow内部: x0+r+1 <= x1-r-1 が必要 → r <= (w-2)//2
    max_r = min((w - 2) // 2, (h - 2) // 2)
    r = min(radius, max_r)
    if r < 1:
        draw.rectangle([x0, y0, x1, y1], fill=fill, outline=outline)
    else:
        draw.rounded_rectangle([x0, y0, x1, y1], radius=r, fill=fill, outline=outline)


# ============================================================
# イージング関数
# ============================================================
def ease_out_cubic(t):
    """減速カーブ（アニメーション用）"""
    return 1 - (1 - t) ** 3

def ease_out_back(t):
    """バウンス気味の減速（テキスト登場用）"""
    c1 = 1.70158
    c3 = c1 + 1
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2

def ease_in_out_quad(t):
    if t < 0.5:
        return 2 * t * t
    return 1 - (-2 * t + 2) ** 2 / 2

def lerp_color(c1, c2, t):
    """2色間の線形補間"""
    t = max(0.0, min(1.0, t))
    return tuple(int(a + (b - a) * t) for a, b in zip(c1, c2))


# ============================================================
# フォント管理
# ============================================================
class FontSet:
    def __init__(self):
        candidates_bold = [
            '/System/Library/Fonts/ヒラギノ角ゴシック W8.ttc',
            '/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc',
            '/System/Library/Fonts/ヒラギノ角ゴシック W5.ttc',
        ]
        candidates_regular = [
            '/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc',
            '/System/Library/Fonts/ヒラギノ角ゴシック W4.ttc',
        ]
        self.bold_path = next((f for f in candidates_bold if os.path.exists(f)), None)
        self.regular_path = next((f for f in candidates_regular if os.path.exists(f)), None)
        if not self.bold_path:
            self.bold_path = self.regular_path

    def bold(self, size):
        return ImageFont.truetype(self.bold_path, size) if self.bold_path else ImageFont.load_default()

    def regular(self, size):
        return ImageFont.truetype(self.regular_path, size) if self.regular_path else ImageFont.load_default()


# ============================================================
# 背景キャッシュ（高速化用）
# ============================================================
_bg_cache = {}

def get_gradient_bg(W, H):
    """グラデーション背景（キャッシュ付き）"""
    key = (W, H)
    if key in _bg_cache:
        return _bg_cache[key].copy()

    img = Image.new('RGB', (W, H))
    draw = ImageDraw.Draw(img)
    for y in range(H):
        ratio = y / H
        r = int(BG_COLOR[0] * (1 - ratio * 0.3))
        g = int(BG_COLOR[1] * (1 - ratio * 0.3))
        b = int(BG_COLOR[2] + (40 - BG_COLOR[2]) * ratio * 0.3)
        draw.line([(0, y), (W, y)], fill=(r, g, b))
    _bg_cache[key] = img.copy()
    return img


# ============================================================
# 描画ヘルパー
# ============================================================
def draw_progress_bar(draw, x, y, w, h, progress, fonts):
    """プログレスバー"""
    safe_rounded_rect(draw, [x, y, x + w, y + h], radius=h // 2, fill=(40, 40, 60))
    pw = max(h, int(w * progress))
    if progress < 0.5:
        color = (255, int(100 + 200 * progress), 50)
    else:
        color = (int(255 - 200 * (progress - 0.5)), 255, 50)
    safe_rounded_rect(draw, [x, y, x + pw, y + h], radius=h // 2, fill=color)
    pct = f'{int(progress * 100)}%'
    font = fonts.bold(int(h * 0.7))
    draw.text((x + w + 15, y - 2), pct, fill=TEXT_WHITE, font=font)


def draw_bar_chart(draw, x, y, w, h, df, current_rank, total, fonts, max_bars=8, anim_t=1.0):
    """右下のミニ横棒グラフ（アニメーション対応）"""
    start = max(1, current_rank - max_bars // 2)
    end = min(total, start + max_bars - 1)
    if end - start + 1 < max_bars:
        start = max(1, end - max_bars + 1)

    subset = df[(df['rank'] >= start) & (df['rank'] <= end)].sort_values('rank')
    if subset.empty:
        return

    max_val = df['value'].max()
    bar_h = min(28, (h - 10) // max_bars)
    gap = 4

    for i, (_, row) in enumerate(subset.iterrows()):
        by = y + i * (bar_h + gap)
        is_current = (row['rank'] == current_rank)

        # スライドインアニメーション（各バーにディレイ）
        bar_delay = i * 0.06
        bar_t = max(0.0, min(1.0, (anim_t - bar_delay) / max(0.3, 1.0 - bar_delay)))
        bar_t = ease_out_cubic(bar_t)

        label = f"{row['rank']:>2}  {row['pref_name']}"
        font = fonts.bold(int(bar_h * 0.65)) if is_current else fonts.regular(int(bar_h * 0.6))
        label_color = TEXT_WHITE if is_current else TEXT_DIM

        # ラベルフェードイン
        alpha = int(255 * bar_t)
        label_c = tuple(int(c * bar_t) for c in label_color)
        draw.text((x, by + 2), label, fill=label_c, font=font)

        # バー
        bar_x = x + 120
        bar_w = int((w - 180) * row['value'] / max_val * bar_t)
        bar_color = get_rank_color(row['rank'], total)

        if is_current and bar_t > 0.5 and bar_w > 6:
            glow_alpha = int(60 * bar_t)
            safe_rounded_rect(draw, 
                [bar_x - 3, by - 2, bar_x + bar_w + 3, by + bar_h + 2],
                radius=5, fill=(*bar_color[:3], glow_alpha)
            )

        bar_y0 = by + 2
        bar_y1 = max(bar_y0 + 1, by + bar_h - 2)
        bw = bar_x + bar_w - bar_x  # = bar_w
        bh = bar_y1 - bar_y0
        if bw > 8 and bh > 8:
            safe_rounded_rect(draw, 
                [bar_x, bar_y0, bar_x + bar_w, bar_y1],
                radius=3, fill=bar_color
            )
        elif bw > 0 and bh > 0:
            draw.rectangle(
                [bar_x, bar_y0, bar_x + max(1, bar_w), bar_y1],
                fill=bar_color
            )

        # 値
        if bar_t > 0.3:
            val_text = f'{row["value"]}'
            val_font = fonts.bold(int(bar_h * 0.55))
            val_c = tuple(int(c * min(1.0, (bar_t - 0.3) / 0.7)) for c in label_color)
            draw.text((bar_x + bar_w + 8, by + 3), val_text, fill=val_c, font=val_font)


def generate_japan_map(df, current_rank, total, reverse=False, highlight_code=None, highlight_glow=0.0):
    """japanmapで塗り絵地図画像を生成（ハイライト効果付き）"""
    color_map = {}

    for _, row in df.iterrows():
        code = PREF_NAME_TO_CODE.get(row['pref_code'])
        if not code:
            continue

        if reverse:
            painted = row['rank'] >= current_rank
        else:
            painted = row['rank'] <= current_rank

        if painted:
            color_map[code] = get_rank_color(row['rank'], total)
        else:
            color_map[code] = UNPAINTED

    img = japan_picture(color_map)
    pil_img = Image.fromarray(img).convert('RGBA')

    # 新しく塗られた県のグロー効果
    if highlight_code and highlight_glow > 0:
        # ハイライト用のマスクを作成
        highlight_map = {}
        for code in range(1, 48):
            if code == highlight_code:
                highlight_map[code] = (255, 255, 255)
            else:
                highlight_map[code] = (0, 0, 0)
        mask_img = Image.fromarray(japan_picture(highlight_map)).convert('L')

        # グローをぼかして重ねる
        glow_color = color_map.get(highlight_code, (255, 255, 255))
        glow = Image.new('RGBA', pil_img.size, (*glow_color[:3], 0))
        glow_mask = mask_img.filter(ImageFilter.GaussianBlur(radius=12))
        glow_alpha = glow_mask.point(lambda p: int(p * highlight_glow * 0.7))
        glow.putalpha(glow_alpha)
        pil_img = Image.alpha_composite(pil_img, glow)

    return pil_img


# ============================================================
# アニメーション付きフレーム生成
# ============================================================
def generate_animated_frames(df, current_rank, prev_rank, title, fonts, frame_dir,
                              W=1920, H=1080, reverse=False, fps=24, sec_per_pref=5.0,
                              painted_ranks=None):
    """1県分のアニメーション付きフレーム群を生成

    アニメーションフェーズ:
    - 0.0〜0.2: 地図の新県ハイライト＋情報パネルフェードイン
    - 0.2〜0.4: 数値カウントアップ＋バーチャートスライドイン
    - 0.4〜1.0: 完成状態ホールド（読む時間を確保）
    """
    if painted_ranks is None:
        painted_ranks = []
    total = len(df)
    current_row = df[df['rank'] == current_rank].iloc[0]
    rank_color = get_rank_color(current_rank, total)

    # この県のコード
    current_code = PREF_NAME_TO_CODE.get(current_row['pref_code'])

    total_frames = max(1, int(sec_per_pref * fps))
    paths = []

    # 地図を事前生成（ハイライトなし版＝最終状態）
    map_base = generate_japan_map(df, current_rank, total, reverse)

    for fi in range(total_frames):
        t = fi / max(total_frames - 1, 1)  # 0.0 ~ 1.0

        img = get_gradient_bg(W, H)
        draw = ImageDraw.Draw(img, 'RGBA')

        # ---- 上部: タイトルバー ----
        safe_rounded_rect(draw, [0, 0, W, 70], radius=0, fill=(20, 20, 42, 230))
        title_font = fonts.bold(28)
        draw.text((30, 18), title, fill=TEXT_WHITE, font=title_font)

        # (プログレスバー削除済み)

        # ---- 左側: 地図 ----
        # 序盤はグロー効果付き
        glow_t = 0.0
        if t < 0.4:
            glow_t = math.sin(t / 0.4 * math.pi) * 1.0  # 0→1→0のパルス
        elif t < 0.6:
            glow_t = math.sin((t - 0.4) / 0.2 * math.pi) * 0.3  # 弱いパルス

        if glow_t > 0.01 and current_code:
            map_img = generate_japan_map(df, current_rank, total, reverse,
                                         highlight_code=current_code, highlight_glow=glow_t)
        else:
            map_img = map_base.copy()

        map_target_h = H - 160
        map_ratio = map_target_h / map_img.height
        map_w = int(map_img.width * map_ratio)
        map_h = int(map_img.height * map_ratio)
        map_img = map_img.resize((map_w, map_h), Image.LANCZOS)

        map_x = 30
        map_y = 90
        img.paste(map_img, (map_x, map_y), map_img)

        # ---- 地図上の絵文字画像（塗り済み全県に表示） ----
        emoji_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'assets', 'emoji')

        # 過去の県 + 現在の県を全部表示
        all_emoji_ranks = list(painted_ranks) + [current_rank]
        for e_rank in all_emoji_ranks:
            e_row = df[df['rank'] == e_rank].iloc[0]
            e_code = PREF_NAME_TO_CODE.get(e_row['pref_code'])
            if not e_code:
                continue

            is_current = (e_rank == current_rank)

            # 現在の県はアニメーション付き、過去の県は即表示
            if is_current:
                if t <= 0.15:
                    continue
                face_t = ease_out_back(min((t - 0.15) / 0.3, 1.0))
            else:
                face_t = 1.0

            # 順位で絵文字を選択
            if e_rank <= 5:
                emoji_name = 'rank_top'
            elif e_rank <= 15:
                emoji_name = 'rank_good'
            elif e_rank <= 30:
                emoji_name = 'rank_neutral'
            elif e_rank <= 40:
                emoji_name = 'rank_bad'
            else:
                emoji_name = 'rank_worst'

            emoji_path = os.path.join(emoji_dir, f'{emoji_name}.png')

            try:
                _cmap = {e_code: (254, 1, 1)}
                _raw = japan_picture(_cmap)
                _pil = Image.fromarray(_raw)
                _arr = np.array(_pil)
                _mask = (_arr[:,:,0] == 254) & (_arr[:,:,1] == 1) & (_arr[:,:,2] == 1)
                _ys, _xs = np.where(_mask)
                if len(_ys) > 0 and os.path.exists(emoji_path):
                    cy_raw = int(np.mean(_ys))
                    cx_raw = int(np.mean(_xs))
                    fx = int(cx_raw * map_ratio) + map_x
                    fy = int(cy_raw * map_ratio) + map_y
                    emoji_size = max(16, int(40 * face_t))
                    emoji_img = Image.open(emoji_path).convert('RGBA')
                    emoji_img = emoji_img.resize((emoji_size, emoji_size), Image.LANCZOS)
                    if is_current and face_t < 1.0:
                        alpha = emoji_img.getchannel('A')
                        alpha = alpha.point(lambda p: int(p * min(face_t * 1.5, 1.0)))
                        emoji_img.putalpha(alpha)
                    paste_x = fx - emoji_size // 2
                    paste_y = fy - emoji_size // 2
                    img.paste(emoji_img, (paste_x, paste_y), emoji_img)
            except Exception:
                pass

        # ---- 右側: 情報パネル ----
        panel_x = map_w + 60
        panel_w = W - panel_x - 30
        panel_y = 85

        # パネル背景（フェードイン）
        panel_alpha = int(200 * ease_out_cubic(min(t * 4, 1.0)))
        safe_rounded_rect(draw, 
            [panel_x, panel_y, panel_x + panel_w, panel_y + 420],
            radius=20, fill=(25, 25, 55, panel_alpha)
        )

        # テキストアニメーション進行度
        text_t = ease_out_cubic(max(0, min(1, (t - 0.05) * 5)))  # 0.05〜0.25で0→1
        val_t = ease_out_cubic(max(0, min(1, (t - 0.15) * 4)))   # 0.15〜0.40で0→1
        chart_t = max(0, min(1, (t - 0.2) * 3))                  # 0.2〜0.53で0→1

        # 順位（スライドイン＋フェード）
        rank_font = fonts.bold(90)
        rank_text = f'{current_rank}位'
        rank_slide = int(30 * (1 - ease_out_back(min(text_t * 1.2, 1.0))))
        rank_alpha = int(255 * min(text_t * 2, 1.0))
        rank_c = tuple(int(c * min(text_t * 2, 1.0)) for c in rank_color)
        draw.text((panel_x + panel_w // 2, panel_y + 30 + rank_slide), rank_text,
                  fill=rank_c, font=rank_font, anchor='mt')

        # TOP3メダル演出
        if current_rank <= 3 and text_t > 0.3:
            medal_colors = {1: (255, 50, 50), 2: (255, 140, 50), 3: (255, 200, 50)}
            medal_text = {1: 'BEST', 2: '2nd', 3: '3rd'}
            medal_c = medal_colors[current_rank]
            badge_font = fonts.bold(18)
            bx = panel_x + panel_w // 2

            # メダルのスケールアニメーション
            medal_t = ease_out_back(min((text_t - 0.3) / 0.4, 1.0))
            badge_hw = int(48 * medal_t)
            badge_hh = int(13 * medal_t)
            if badge_hw > 5:
                safe_rounded_rect(draw, 
                    [bx - badge_hw, panel_y + 8, bx + badge_hw, panel_y + 8 + badge_hh * 2],
                    radius=10, fill=medal_c
                )
                if medal_t > 0.5:
                    draw.text((bx, panel_y + 10), medal_text[current_rank],
                              fill=(255, 255, 255), font=badge_font, anchor='mt')

        # 県名（フェードイン＋スライド）
        pref_font = fonts.bold(72)
        pref_slide = int(20 * (1 - ease_out_back(min(text_t * 1.5, 1.0))))
        pref_alpha = min(text_t * 2.5, 1.0)
        pref_c = tuple(int(255 * pref_alpha) for _ in range(3))
        draw.text((panel_x + panel_w // 2, panel_y + 145 + pref_slide),
                  current_row['pref_name'], fill=pref_c, font=pref_font, anchor='mt')

        # 区切り線（伸びるアニメーション）
        line_y = panel_y + 230
        line_w = int((panel_w - 60) * ease_out_cubic(min(val_t * 1.5, 1.0)))
        line_cx = panel_x + panel_w // 2
        if line_w > 0:
            draw.line([(line_cx - line_w // 2, line_y), (line_cx + line_w // 2, line_y)],
                      fill=(60, 60, 100), width=2)

        # ---- 発表済みランキングリスト ----
        list_y = panel_y + 245
        list_font = fonts.bold(22)
        list_font_sm = fonts.regular(20)
        max_visible = 6  # 最大表示件数
        if painted_ranks and val_t > 0.3:
            list_t = ease_out_cubic(min((val_t - 0.3) / 0.5, 1.0))
            # 直近のものを下に、古いものを上に（最新が一番下）
            visible = painted_ranks[-max_visible:]
            for li, p_rank in enumerate(visible):
                p_row = df[df['rank'] == p_rank].iloc[0]
                p_color = get_rank_color(p_rank, total)
                ly = list_y + li * 28
                # フェードイン（新しいものほど早く表示）
                item_alpha = min(list_t * 1.5, 1.0)
                p_c = tuple(int(c * item_alpha * 0.6) for c in p_color)
                name_c = tuple(int(180 * item_alpha) for _ in range(3))
                draw.text((panel_x + 20, ly), f'{p_rank}位', fill=p_c, font=list_font_sm)
                draw.text((panel_x + 80, ly), p_row['pref_name'], fill=name_c, font=list_font_sm)

        # ---- 右下: 良いところ / 注意点テキスト + 画像 ----
        tips_y = panel_y + 440
        tips_h = H - tips_y - 40
        tips_alpha = int(200 * ease_out_cubic(min(chart_t * 2, 1.0)))
        safe_rounded_rect(draw,
            [panel_x, tips_y, panel_x + panel_w, tips_y + tips_h],
            radius=15, fill=(20, 20, 45, tips_alpha)
        )

        good_text = str(current_row.get('good_point', ''))
        caution_text = str(current_row.get('caution_point', ''))

        # 画像読み込み
        pref_img = None
        pref_img_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'assets', 'pref_images')
        pref_img_path = os.path.join(pref_img_dir, f'{current_rank:02d}_{current_row["pref_name"]}.jpg')
        if os.path.exists(pref_img_path):
            try:
                pref_img = Image.open(pref_img_path).convert('RGBA')
            except Exception:
                pref_img = None

        if chart_t > 0.1 and good_text and good_text != 'nan':
            # GOOD（緑）大きめフォント
            good_t = ease_out_cubic(min((chart_t - 0.1) / 0.4, 1.0))
            good_label_font = fonts.bold(28)
            good_text_font = fonts.regular(26)
            gy = tips_y + 12
            g_alpha = good_t

            gl_c = (80, 220, 120)
            gl_c_a = tuple(int(c * g_alpha) for c in gl_c)
            draw.text((panel_x + 15, gy), 'GOOD', fill=gl_c_a, font=good_label_font)
            g_slide = int(15 * (1 - good_t))
            gt_c = tuple(int(255 * g_alpha) for _ in range(3))
            draw.text((panel_x + 15, gy + 34 + g_slide), good_text, fill=gt_c, font=good_text_font)

        if chart_t > 0.3 and caution_text and caution_text != 'nan':
            # NG（赤）大きめフォント
            caut_t = ease_out_cubic(min((chart_t - 0.3) / 0.4, 1.0))
            caut_label_font = fonts.bold(28)
            caut_text_font = fonts.bold(26)
            cy = tips_y + 80
            c_alpha = caut_t

            cl_c = (255, 100, 80)
            cl_c_a = tuple(int(c * c_alpha) for c in cl_c)
            draw.text((panel_x + 15, cy), 'NG', fill=cl_c_a, font=caut_label_font)
            c_slide = int(20 * (1 - caut_t))
            ct_c = tuple(int(c * c_alpha) for c in (255, 220, 180))
            draw.text((panel_x + 15, cy + 34 + c_slide), caution_text, fill=ct_c, font=caut_text_font)

        # NG下に正方形画像（v9と同じ位置・サイズ）
        if pref_img and chart_t > 0.4:
            img_t = ease_out_cubic(min((chart_t - 0.4) / 0.4, 1.0))
            photo_y = tips_y + 150
            photo_size = min((panel_w - 30) // 2, tips_h - 165)
            if photo_size > 30:
                pw, ph = pref_img.size
                crop_size = min(pw, ph)
                left = (pw - crop_size) // 2
                top = (ph - crop_size) // 2
                thumb = pref_img.crop((left, top, left + crop_size, top + crop_size))
                thumb = thumb.resize((photo_size, photo_size), Image.LANCZOS)
                alpha_mask = Image.new('L', (photo_size, photo_size), int(230 * img_t))
                thumb.putalpha(alpha_mask)
                img.paste(thumb, (panel_x + 15, photo_y), thumb)

        # ---- 下部: ソース表記 ----
        src_font = fonts.regular(14)
        draw.text((30, H - 25), '※公的機関の公開情報をもとに作成', fill=TEXT_DIM, font=src_font)

        # 保存
        frame_path = os.path.join(frame_dir, f'frame_{current_rank:03d}_{fi:03d}.png')
        img.save(frame_path, 'PNG')
        paths.append(frame_path)

    return paths


# ============================================================
# マイルストーン画面（TOP30! TOP20! TOP10! TOP5!）
# ============================================================
def generate_milestone_frames(milestone_text, sub_text, df, painted_ranks, fonts, frame_dir,
                               W=1920, H=1080, duration_sec=4, fps=24):
    """マイルストーン: 中央にドーンとテキスト表示"""
    paths = []
    total = len(df)
    total_frames = int(duration_sec * fps)

    # 塗り済み地図を背景に
    map_base = generate_japan_map(df, painted_ranks[-1] if painted_ranks else total, total, reverse=True)

    for fi in range(total_frames):
        t = fi / max(total_frames - 1, 1)
        img = get_gradient_bg(W, H)
        draw = ImageDraw.Draw(img, 'RGBA')

        # 背景に薄く地図
        map_h_target = H - 100
        map_ratio = map_h_target / map_base.height
        map_w = int(map_base.width * map_ratio)
        map_h = int(map_base.height * map_ratio)
        map_img = map_base.resize((map_w, map_h), Image.LANCZOS)
        # 半透明で重ねる
        alpha = map_img.getchannel('A')
        alpha = alpha.point(lambda p: int(p * 0.3))
        map_img.putalpha(alpha)
        mx = (W - map_w) // 2
        img.paste(map_img, (mx, 50), map_img)

        # メインテキスト（ズームイン＋フェード）
        if t < 0.3:
            text_t = ease_out_back(t / 0.3)
        elif t > 0.8:
            text_t = ease_out_cubic((1.0 - t) / 0.2)
        else:
            text_t = 1.0

        # パルスエフェクト
        pulse = 1.0 + 0.03 * math.sin(t * math.pi * 6)
        font_size = int(120 * text_t * pulse)
        if font_size > 10:
            main_font = fonts.bold(font_size)
            mc = tuple(int(255 * text_t) for _ in range(3))
            draw.text((W // 2, H // 2 - 30), milestone_text,
                      fill=mc, font=main_font, anchor='mm')

        # サブテキスト
        if t > 0.2:
            sub_t = ease_out_cubic(min((t - 0.2) / 0.3, 1.0))
            if t > 0.8:
                sub_t *= ease_out_cubic((1.0 - t) / 0.2)
            sub_font = fonts.regular(32)
            sc = tuple(int(c * sub_t) for c in TEXT_GRAY)
            draw.text((W // 2, H // 2 + 60), sub_text,
                      fill=sc, font=sub_font, anchor='mm')

        # 装飾ライン
        line_t = ease_out_cubic(min(t * 4, 1.0))
        if t > 0.8:
            line_t *= ease_out_cubic((1.0 - t) / 0.2)
        lw = int(350 * line_t)
        if lw > 5:
            lc = tuple(int(c * line_t) for c in ACCENT_BLUE)
            draw.line([(W // 2 - lw, H // 2 - 90), (W // 2 + lw, H // 2 - 90)],
                      fill=lc, width=3)
            draw.line([(W // 2 - lw, H // 2 + 100), (W // 2 + lw, H // 2 + 100)],
                      fill=lc, width=3)

        frame_path = os.path.join(frame_dir, f'frame_milestone_{milestone_text}_{fi:03d}.png')
        img.save(frame_path, 'PNG')
        paths.append(frame_path)

    return paths


# ============================================================
# イントロ（フェードトランジション付き）
# ============================================================
def generate_intro_frames(title, subtitle, disclaimers, fonts, frame_dir,
                          W=1920, H=1080, duration_sec=5, fps=24):
    """イントロ: 注意書きフェードイン → タイトルフェードイン"""
    paths = []
    total_frames = int(duration_sec * fps)

    # フェーズ配分: 注意書き3秒 + タイトル2秒
    disc_frames = int(3.0 * fps)
    title_frames = total_frames - disc_frames

    for fi in range(total_frames):
        img = get_gradient_bg(W, H)
        draw = ImageDraw.Draw(img, 'RGBA')

        if fi < disc_frames:
            # 注意書きフェーズ
            phase_t = fi / disc_frames
            # フェードイン (0-0.3) → ホールド (0.3-0.7) → フェードアウト (0.7-1.0)
            if phase_t < 0.3:
                alpha = ease_out_cubic(phase_t / 0.3)
            elif phase_t > 0.7:
                alpha = ease_out_cubic((1.0 - phase_t) / 0.3)
            else:
                alpha = 1.0

            disc_font = fonts.regular(26)
            disc_y = H // 2 - len(disclaimers) * 22
            for i, line in enumerate(disclaimers):
                # 各行に少しディレイ
                line_delay = i * 0.05
                line_alpha = max(0, min(1, (alpha - line_delay) / max(0.1, 1 - line_delay)))
                c = tuple(int(v * line_alpha) for v in TEXT_GRAY)
                draw.text((W // 2, disc_y + i * 50), line,
                          fill=c, font=disc_font, anchor='mm')
        else:
            # タイトルフェーズ
            phase_t = (fi - disc_frames) / max(title_frames - 1, 1)
            # フェードイン
            alpha = ease_out_cubic(min(phase_t * 3, 1.0))

            # タイトル
            t_font = fonts.bold(56)
            slide_y = int(20 * (1 - ease_out_back(min(alpha * 1.2, 1.0))))
            t_c = tuple(int(255 * alpha) for _ in range(3))
            draw.text((W // 2, H // 2 - 40 + slide_y), title,
                      fill=t_c, font=t_font, anchor='mm')

            # サブタイトル（少し遅れて）
            sub_alpha = ease_out_cubic(max(0, min(1, (phase_t - 0.15) * 4)))
            st_font = fonts.regular(28)
            st_c = tuple(int(c * sub_alpha) for c in TEXT_GRAY)
            draw.text((W // 2, H // 2 + 40), subtitle, fill=st_c, font=st_font, anchor='mm')

            # 装飾ライン（伸びるアニメーション）
            line_t = ease_out_cubic(max(0, min(1, (phase_t - 0.1) * 5)))
            lw = int(300 * line_t)
            if lw > 5:
                line_alpha_val = int(255 * min(alpha, 1.0))
                line_c = tuple(int(c * min(alpha, 1.0)) for c in ACCENT_BLUE)
                draw.line([(W // 2 - lw, H // 2 - 80), (W // 2 + lw, H // 2 - 80)],
                          fill=line_c, width=3)
                draw.line([(W // 2 - lw, H // 2 + 80), (W // 2 + lw, H // 2 + 80)],
                          fill=line_c, width=3)

        frame_path = os.path.join(frame_dir, f'frame_intro_{fi:03d}.png')
        img.save(frame_path, 'PNG')
        paths.append(frame_path)

    return paths


# ============================================================
# ドラムロール（TOP3発表前の溜め演出）
# ============================================================
def generate_drumroll_frames(df, painted_ranks, fonts, frame_dir,
                              W=1920, H=1080, duration_sec=4, fps=24):
    """ドラムロール: TOP3発表前の溜め演出"""
    paths = []
    total = len(df)
    total_frames = int(duration_sec * fps)

    # 塗り済み地図を背景に
    map_base = generate_japan_map(df, painted_ranks[-1] if painted_ranks else total, total, reverse=True)

    for fi in range(total_frames):
        t = fi / max(total_frames - 1, 1)
        img = get_gradient_bg(W, H)
        draw = ImageDraw.Draw(img, 'RGBA')

        # 背景に薄く地図
        map_h_target = H - 100
        map_ratio = map_h_target / map_base.height
        map_w = int(map_base.width * map_ratio)
        map_h = int(map_base.height * map_ratio)
        map_img = map_base.resize((map_w, map_h), Image.LANCZOS)
        alpha_ch = map_img.getchannel('A')
        alpha_ch = alpha_ch.point(lambda p: int(p * 0.3))
        map_img.putalpha(alpha_ch)
        mx = (W - map_w) // 2
        img.paste(map_img, (mx, 50), map_img)

        # パルスエフェクト（ドラムロール感）
        pulse = 1.0 + 0.06 * math.sin(t * math.pi * 12)
        if t < 0.3:
            text_t = ease_out_back(t / 0.3)
        elif t > 0.85:
            text_t = ease_out_cubic((1.0 - t) / 0.15)
        else:
            text_t = 1.0

        font_size = int(100 * text_t * pulse)
        if font_size > 10:
            main_font = fonts.bold(font_size)
            mc = tuple(int(255 * text_t) for _ in range(3))
            draw.text((W // 2, H // 2 - 20), 'いよいよ TOP 3 発表!',
                      fill=mc, font=main_font, anchor='mm')

        # サブテキスト
        if t > 0.25:
            sub_t = ease_out_cubic(min((t - 0.25) / 0.3, 1.0))
            if t > 0.85:
                sub_t *= ease_out_cubic((1.0 - t) / 0.15)
            sub_font = fonts.regular(32)
            sc = tuple(int(c * sub_t) for c in TEXT_GRAY)
            draw.text((W // 2, H // 2 + 70), '果たして1位は…?',
                      fill=sc, font=sub_font, anchor='mm')

        # 装飾ライン（伸縮アニメーション）
        line_t = ease_out_cubic(min(t * 4, 1.0))
        if t > 0.85:
            line_t *= ease_out_cubic((1.0 - t) / 0.15)
        lw = int(400 * line_t)
        if lw > 5:
            lc = tuple(int(c * line_t) for c in GOLD)
            draw.line([(W // 2 - lw, H // 2 - 80), (W // 2 + lw, H // 2 - 80)],
                      fill=lc, width=3)
            draw.line([(W // 2 - lw, H // 2 + 115), (W // 2 + lw, H // 2 + 115)],
                      fill=lc, width=3)

        safe_name = 'drumroll'
        frame_path = os.path.join(frame_dir, f'frame_{safe_name}_{fi:03d}.png')
        img.save(frame_path, 'PNG')
        paths.append(frame_path)

    return paths


# ============================================================
# TOP3振り返り（メダル付き）
# ============================================================
def generate_top3_review_frames(df, fonts, frame_dir,
                                 W=1920, H=1080, duration_sec=6, fps=24):
    """TOP3振り返り: メダル付きで3県を並べて表示"""
    paths = []
    total = len(df)
    total_frames = int(duration_sec * fps)

    # 全県塗り済みの地図を背景に
    color_map = {}
    for _, row in df.iterrows():
        code = PREF_NAME_TO_CODE.get(row['pref_code'])
        if code:
            color_map[code] = get_rank_color(row['rank'], total)
    full_map = Image.fromarray(japan_picture(color_map)).convert('RGBA')
    map_h_target = H - 100
    map_ratio = map_h_target / full_map.height
    map_w = int(full_map.width * map_ratio)
    map_h = int(full_map.height * map_ratio)
    full_map = full_map.resize((map_w, map_h), Image.LANCZOS)
    mx = (W - map_w) // 2

    # TOP3データ取得（rank 1, 2, 3）
    top3 = df[df['rank'].isin([1, 2, 3])].sort_values('rank')
    medal_colors = {1: GOLD, 2: (192, 192, 192), 3: (205, 127, 50)}
    medal_labels = {1: '1st', 2: '2nd', 3: '3rd'}
    # 表示順: 3位→2位→1位（フェードイン遅延で1位が最後）
    display_order = [3, 2, 1]
    delays = {3: 0.0, 2: 0.15, 1: 0.3}

    for fi in range(total_frames):
        t = fi / max(total_frames - 1, 1)
        img = get_gradient_bg(W, H)
        draw = ImageDraw.Draw(img, 'RGBA')

        # 背景に薄く完成地図
        map_alpha_val = ease_out_cubic(min(t * 3, 1.0))
        if map_alpha_val > 0.01:
            map_copy = full_map.copy()
            if map_alpha_val < 1.0:
                alpha_ch = map_copy.getchannel('A')
                alpha_ch = alpha_ch.point(lambda p: int(p * map_alpha_val * 0.25))
                map_copy.putalpha(alpha_ch)
            else:
                alpha_ch = map_copy.getchannel('A')
                alpha_ch = alpha_ch.point(lambda p: int(p * 0.25))
                map_copy.putalpha(alpha_ch)
            img.paste(map_copy, (mx, 50), map_copy)

        # タイトル
        title_t = ease_out_cubic(min(t * 4, 1.0))
        title_font = fonts.bold(60)
        tc = tuple(int(c * title_t) for c in GOLD)
        draw.text((W // 2, 60), 'TOP 3', fill=tc, font=title_font, anchor='mt')

        # 装飾ライン
        line_t = ease_out_cubic(min(t * 5, 1.0))
        lw = int(300 * line_t)
        if lw > 5:
            lc = tuple(int(c * line_t) for c in GOLD)
            draw.line([(W // 2 - lw, 130), (W // 2 + lw, 130)], fill=lc, width=2)

        # 各順位カード（横並び）
        card_w = 380
        card_h = 300
        card_y = H // 2 - card_h // 2 + 20
        positions = {1: W // 2, 2: W // 2 - 420, 3: W // 2 + 420}

        for rank in display_order:
            delay = delays[rank]
            card_t = ease_out_back(max(0, min(1, (t - delay) / max(0.3, 1 - delay))))
            if card_t <= 0.01:
                continue

            row_data = top3[top3['rank'] == rank]
            if row_data.empty:
                continue
            row = row_data.iloc[0]

            cx = positions[rank]
            medal_c = medal_colors[rank]
            panel_alpha = int(200 * card_t)
            slide_y = int(30 * (1 - card_t))

            # カードパネル
            safe_rounded_rect(draw,
                [cx - card_w // 2, card_y + slide_y,
                 cx + card_w // 2, card_y + card_h + slide_y],
                radius=16, fill=(30, 30, 60, panel_alpha)
            )

            # メダル円
            circle_r = 40
            circle_c = (cx, card_y + 60 + slide_y)
            draw.ellipse(
                [circle_c[0] - circle_r, circle_c[1] - circle_r,
                 circle_c[0] + circle_r, circle_c[1] + circle_r],
                fill=tuple(int(c * card_t) for c in medal_c)
            )
            medal_font = fonts.bold(36)
            mc_text = tuple(int(c * card_t) for c in (30, 30, 30))
            draw.text(circle_c, medal_labels[rank], fill=mc_text, font=medal_font, anchor='mm')

            # 順位
            rank_font = fonts.bold(28)
            rc = tuple(int(c * card_t) for c in medal_c)
            draw.text((cx, card_y + 120 + slide_y), f'{rank}位',
                      fill=rc, font=rank_font, anchor='mm')

            # 県名
            pref_font = fonts.bold(36)
            pc = tuple(int(255 * card_t) for _ in range(3))
            draw.text((cx, card_y + 170 + slide_y), str(row['pref_name']),
                      fill=pc, font=pref_font, anchor='mm')

            # 数値
            val_font = fonts.regular(26)
            vc = tuple(int(c * card_t) for c in TEXT_GRAY)
            draw.text((cx, card_y + 220 + slide_y), str(row['value']),
                      fill=vc, font=val_font, anchor='mm')

        frame_path = os.path.join(frame_dir, f'frame_top3review_{fi:03d}.png')
        img.save(frame_path, 'PNG')
        paths.append(frame_path)

    return paths


# ============================================================
# エンドカード（チャンネル登録促進）
# ============================================================
def generate_endcard_frames(fonts, frame_dir,
                             W=1920, H=1080, duration_sec=5, fps=24):
    """エンドカード: チャンネル登録促進"""
    paths = []
    total_frames = int(duration_sec * fps)

    for fi in range(total_frames):
        t = fi / max(total_frames - 1, 1)

        # 黒背景からフェードイン
        fade_t = ease_out_cubic(min(t * 3, 1.0))
        bg_r = int(BG_COLOR[0] * fade_t * 0.5)
        bg_g = int(BG_COLOR[1] * fade_t * 0.5)
        bg_b = int(BG_COLOR[2] * fade_t * 0.5)
        img = Image.new('RGB', (W, H), (bg_r, bg_g, bg_b))
        draw = ImageDraw.Draw(img, 'RGBA')

        if fade_t > 0.01:
            # メインテキスト
            main_t = ease_out_back(min(fade_t * 1.5, 1.0))
            main_font = fonts.bold(56)
            mc = tuple(int(255 * main_t) for _ in range(3))
            draw.text((W // 2, H // 2 - 60), 'ご視聴ありがとうございました',
                      fill=mc, font=main_font, anchor='mm')

            # サブテキスト（少し遅れて）
            sub_t = ease_out_cubic(max(0, min(1, (fade_t - 0.2) * 3)))
            if sub_t > 0.01:
                sub_font = fonts.regular(34)
                sc = tuple(int(c * sub_t) for c in ACCENT_BLUE)
                draw.text((W // 2, H // 2 + 30), '高評価・チャンネル登録お願いします',
                          fill=sc, font=sub_font, anchor='mm')

            # 装飾ライン（伸びるアニメーション）
            line_t = ease_out_cubic(min(fade_t * 4, 1.0))
            lw = int(450 * line_t)
            if lw > 5:
                lc = tuple(int(c * line_t) for c in ACCENT_BLUE)
                draw.line([(W // 2 - lw, H // 2 - 100), (W // 2 + lw, H // 2 - 100)],
                          fill=lc, width=2)
                draw.line([(W // 2 - lw, H // 2 + 80), (W // 2 + lw, H // 2 + 80)],
                          fill=lc, width=2)

        frame_path = os.path.join(frame_dir, f'frame_endcard_{fi:03d}.png')
        img.save(frame_path, 'PNG')
        paths.append(frame_path)

    return paths


# ============================================================
# アウトロ（フェードイン付き）
# ============================================================
def generate_outro_frames(title, df, fonts, frame_dir, W=1920, H=1080, duration_sec=7, fps=24):
    """アウトロ: 完成マップ + TOP5/WORST5（フェードイン）"""
    paths = []
    total = len(df)
    total_frames = int(duration_sec * fps)

    # 全県塗り済みの地図を生成
    color_map = {}
    for _, row in df.iterrows():
        code = PREF_NAME_TO_CODE.get(row['pref_code'])
        if code:
            color_map[code] = get_rank_color(row['rank'], total)
    full_map = Image.fromarray(japan_picture(color_map)).convert('RGBA')

    map_target_h = H - 200
    map_ratio = map_target_h / full_map.height
    map_w = int(full_map.width * map_ratio)
    map_h = int(full_map.height * map_ratio)
    full_map = full_map.resize((map_w, map_h), Image.LANCZOS)
    mx = (W - map_w) // 2

    worst5 = df.nsmallest(5, 'rank')
    best5 = df.nlargest(5, 'rank')

    for fi in range(total_frames):
        t = fi / max(total_frames - 1, 1)

        img = get_gradient_bg(W, H)
        draw = ImageDraw.Draw(img, 'RGBA')

        # タイトル
        title_t = ease_out_cubic(min(t * 4, 1.0))
        t_font = fonts.bold(36)
        t_c = tuple(int(255 * title_t) for _ in range(3))
        draw.text((W // 2, 30), title, fill=t_c, font=t_font, anchor='mt')

        # 完成マップ（フェードイン）
        map_alpha = ease_out_cubic(min(t * 3, 1.0))
        if map_alpha > 0.01:
            map_overlay = full_map.copy()
            # アルファ調整
            if map_alpha < 1.0:
                alpha_channel = map_overlay.split()[3]
                alpha_channel = alpha_channel.point(lambda p: int(p * map_alpha))
                map_overlay.putalpha(alpha_channel)
            img.paste(map_overlay, (mx, 80), map_overlay)

        # ランキングパネル
        panel_t = max(0, min(1, (t - 0.3) * 3))

        label_font = fonts.bold(20)
        item_font = fonts.regular(18)

        if panel_t > 0:
            panel_alpha = int(200 * ease_out_cubic(panel_t))

            # ワースト5（左からスライドイン）
            w5_slide = int(50 * (1 - ease_out_cubic(panel_t)))
            safe_rounded_rect(draw, 
                [20 - w5_slide, H - 200, 350 - w5_slide, H - 20],
                radius=12, fill=(40, 20, 20, panel_alpha)
            )
            w5_c = tuple(int(c * ease_out_cubic(panel_t)) for c in ACCENT_RED)
            draw.text((35 - w5_slide, H - 190), 'WORST 5', fill=w5_c, font=label_font)
            for i, (_, row) in enumerate(worst5.iterrows()):
                item_delay = 0.1 * i
                item_t = max(0, min(1, (panel_t - item_delay) / max(0.3, 1 - item_delay)))
                item_c = tuple(int(255 * item_t) for _ in range(3))
                draw.text((35 - w5_slide, H - 160 + i * 28),
                          f'{row["rank"]}位 {row["pref_name"]} ({row["value"]})',
                          fill=item_c, font=item_font)

            # ベスト5（右からスライドイン）
            b5_slide = int(50 * (1 - ease_out_cubic(panel_t)))
            safe_rounded_rect(draw, 
                [W - 350 + b5_slide, H - 200, W - 20 + b5_slide, H - 20],
                radius=12, fill=(20, 40, 20, panel_alpha)
            )
            b5_c = (int(80 * ease_out_cubic(panel_t)),
                    int(255 * ease_out_cubic(panel_t)),
                    int(80 * ease_out_cubic(panel_t)))
            draw.text((W - 335 + b5_slide, H - 190), 'BEST 5', fill=b5_c, font=label_font)
            for i, (_, row) in enumerate(best5.sort_values('rank', ascending=False).iterrows()):
                item_delay = 0.1 * i
                item_t = max(0, min(1, (panel_t - item_delay) / max(0.3, 1 - item_delay)))
                item_c = tuple(int(255 * item_t) for _ in range(3))
                draw.text((W - 335 + b5_slide, H - 160 + i * 28),
                          f'{row["rank"]}位 {row["pref_name"]} ({row["value"]})',
                          fill=item_c, font=item_font)

        # 凡例
        if t > 0.5:
            leg_t = min((t - 0.5) * 4, 1.0)
            legend_font = fonts.regular(16)
            lc1 = tuple(int(c * leg_t) for c in (255, 100, 100))
            lc2 = tuple(int(c * leg_t) for c in (100, 255, 100))
            draw.text((W // 2 - 100, H - 40), '赤:ワースト', fill=lc1, font=legend_font)
            draw.text((W // 2 + 30, H - 40), '緑:ベスト', fill=lc2, font=legend_font)

        frame_path = os.path.join(frame_dir, f'frame_outro_{fi:03d}.png')
        img.save(frame_path, 'PNG')
        paths.append(frame_path)

    return paths


# ============================================================
# メイン
# ============================================================
def main():
    parser = argparse.ArgumentParser(description='塗り絵ランキング動画生成 v3')
    parser.add_argument('--csv', required=True, help='ランキングCSV')
    parser.add_argument('--title', required=True, help='動画タイトル')
    parser.add_argument('--subtitle', default='旅行者のリアルな声を集計', help='サブタイトル')
    parser.add_argument('--output', default='output/ranking.mp4', help='出力パス')
    parser.add_argument('--sec-per-pref', type=float, default=7.0, help='1県あたりの秒数')
    parser.add_argument('--bgm', default=None, help='BGMファイル')
    parser.add_argument('--width', type=int, default=1920)
    parser.add_argument('--height', type=int, default=1080)
    parser.add_argument('--reverse', action='store_true', help='47位→1位')
    parser.add_argument('--fps', type=int, default=24, help='FPS')
    parser.add_argument('--no-intro', action='store_true', help='イントロをスキップ')
    parser.add_argument('--no-outro', action='store_true', help='アウトロをスキップ')
    args = parser.parse_args()

    df = pd.read_csv(args.csv)
    total = len(df)
    print(f"データ: {total}件")

    fonts = FontSet()
    print(f"フォント(bold): {fonts.bold_path}")

    frame_dir = tempfile.mkdtemp(prefix='nurie_v3_')
    print(f"作業ディレクトリ: {frame_dir}")

    # CSVの実際のrank値を使用
    all_ranks = sorted(df['rank'].tolist())
    ranks = list(reversed(all_ranks)) if args.reverse else all_ranks

    try:
        frame_paths = []

        # イントロ
        if not args.no_intro:
            print("イントロ生成中...")
            disclaimers = [
                'あなたの県は何位？',
                '',
                '旅行者のリアルな声をもとに',
                '行く前に知っておきたいポイントをまとめました。',
                '',
                '最後まで見ると意外な結果が…',
            ]
            frame_paths.extend(
                generate_intro_frames(args.title, args.subtitle, disclaimers,
                                      fonts, frame_dir, args.width, args.height, fps=args.fps)
            )

        # マイルストーン定義
        milestones = {
            45: ('TOP 45!', '残り45県'),
            40: ('TOP 40!', '序盤戦クリア'),
            35: ('TOP 35!', 'まだまだ続く…'),
            30: ('TOP 30!', 'ここから上位30県'),
            25: ('TOP 25!', '折り返し地点'),
            20: ('TOP 20!', '旅好きが認めるエリアへ'),
            15: ('TOP 15!', '上位グループ突入'),
            10: ('TOP 10!', 'いよいよベスト10'),
            5:  ('TOP 5!', '頂点が近づく…'),
        }

        # 各県（アニメーション付き）
        prev_rank = None
        painted_ranks = []
        for i, rank in enumerate(ranks):
            # マイルストーン挿入
            if rank in milestones:
                ms_text, ms_sub = milestones[rank]
                # TOP30,20,10,5は4秒、それ以外は3秒
                ms_dur = 4 if rank in (30, 20, 10, 5) else 3
                print(f'\n  ★ マイルストーン: {ms_text}')
                frame_paths.extend(
                    generate_milestone_frames(ms_text, ms_sub, df, painted_ranks, fonts, frame_dir,
                                              args.width, args.height, duration_sec=ms_dur, fps=args.fps)
                )

            # ドラムロール（TOP3発表直前）
            if rank == 3:
                print('\n  ★ ドラムロール!')
                frame_paths.extend(
                    generate_drumroll_frames(df, painted_ranks, fonts, frame_dir,
                                             args.width, args.height, duration_sec=4, fps=args.fps)
                )

            # 全県一律の秒数
            print(f'\rフレーム生成: {i+1}/{total} ({rank}位, {args.sec_per_pref:.0f}秒)', end='', flush=True)
            pref_frames = generate_animated_frames(
                df, rank, prev_rank, args.title, fonts, frame_dir,
                args.width, args.height, args.reverse,
                fps=args.fps, sec_per_pref=args.sec_per_pref,
                painted_ranks=painted_ranks
            )
            frame_paths.extend(pref_frames)
            painted_ranks.append(rank)
            prev_rank = rank
        print()

        # TOP3振り返り
        print("TOP3振り返り生成中...")
        frame_paths.extend(
            generate_top3_review_frames(df, fonts, frame_dir,
                                         args.width, args.height, fps=args.fps)
        )

        # アウトロ
        if not args.no_outro:
            print("アウトロ生成中...")
            frame_paths.extend(
                generate_outro_frames(args.title, df, fonts, frame_dir,
                                      args.width, args.height, fps=args.fps)
            )

        # エンドカード
        print("エンドカード生成中...")
        frame_paths.extend(
            generate_endcard_frames(fonts, frame_dir,
                                     args.width, args.height, fps=args.fps)
        )

        # 動画合成
        total_sec = len(frame_paths) / args.fps
        print(f"動画合成中... ({len(frame_paths)}フレーム, {total_sec:.0f}秒, {total_sec/60:.1f}分)")
        os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)

        clip = ImageSequenceClip(frame_paths, fps=args.fps)

        if args.bgm and os.path.exists(args.bgm):
            print(f"BGM: {args.bgm}")
            audio = AudioFileClip(args.bgm)
            # 音声と動画の長い方に合わせる
            if audio.duration > clip.duration:
                audio = audio.subclipped(0, clip.duration)
            elif clip.duration > audio.duration:
                # 動画を音声の長さにトリム（音切れ防止）
                clip = clip.subclipped(0, audio.duration)
            clip = clip.with_audio(audio)

        clip.write_videofile(
            args.output,
            codec='libx264',
            audio_codec='aac',
            fps=args.fps,
            preset='medium',
            logger='bar'
        )

        print(f"\n完成: {args.output}")
        print(f"長さ: {clip.duration:.1f}秒 ({clip.duration/60:.1f}分)")

    finally:
        shutil.rmtree(frame_dir, ignore_errors=True)


if __name__ == '__main__':
    main()
