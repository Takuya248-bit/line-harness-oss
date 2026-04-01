#!/usr/bin/env python3
"""
塗り絵ランキング動画 自動生成パイプライン v5
CSV → 日本地図塗り絵アニメーション → MP4

v5改善点:
- 短アニメーション方式（1県 = 複数フレーム、全要素同時フェードイン）
- 4.5秒/県、最初の0.15秒でフェードイン完了
- presetをultrafastに変更し高速エンコード
- 地図キャッシュで重複生成を回避
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
from moviepy import ImageSequenceClip, AudioFileClip, concatenate_audioclips

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
    x0, y0, x1, y1 = xy[0], xy[1], xy[2], xy[3]
    w = x1 - x0
    h = y1 - y0
    if w <= 0 or h <= 0:
        return
    max_r = min((w - 2) // 2, (h - 2) // 2)
    r = min(radius, max_r)
    if r < 1:
        draw.rectangle([x0, y0, x1, y1], fill=fill, outline=outline)
    else:
        draw.rounded_rectangle([x0, y0, x1, y1], radius=r, fill=fill, outline=outline)


# ============================================================
# イージング関数（静止画でも一部で参照）
# ============================================================
def ease_out_cubic(t):
    return 1 - (1 - t) ** 3

def ease_out_back(t):
    c1 = 1.70158
    c3 = c1 + 1
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2

def lerp_color(c1, c2, t):
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
# キャッシュ（高速化用）
# ============================================================
_bg_cache = {}
_map_cache = {}  # (current_rank, reverse) -> PIL Image

def get_gradient_bg(W, H):
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
def draw_bar_chart(draw, x, y, w, h, df, current_rank, total, fonts, max_bars=8):
    """右下のミニ横棒グラフ（完成状態）"""
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

        label = f"{row['rank']:>2}  {row['pref_name']}"
        font = fonts.bold(int(bar_h * 0.65)) if is_current else fonts.regular(int(bar_h * 0.6))
        label_color = TEXT_WHITE if is_current else TEXT_DIM
        draw.text((x, by + 2), label, fill=label_color, font=font)

        bar_x = x + 120
        bar_w = int((w - 180) * row['value'] / max_val)
        bar_color = get_rank_color(row['rank'], total)

        if is_current and bar_w > 6:
            safe_rounded_rect(draw,
                [bar_x - 3, by - 2, bar_x + bar_w + 3, by + bar_h + 2],
                radius=5, fill=(*bar_color[:3], 60)
            )

        bar_y0 = by + 2
        bar_y1 = max(bar_y0 + 1, by + bar_h - 2)
        bw = bar_w
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

        val_text = f'{row["value"]}'
        val_font = fonts.bold(int(bar_h * 0.55))
        draw.text((bar_x + bar_w + 8, by + 3), val_text, fill=label_color, font=val_font)


def generate_japan_map(df, current_rank, total, reverse=False):
    """japanmapで塗り絵地図画像を生成（キャッシュあり）"""
    cache_key = (current_rank, reverse)
    if cache_key in _map_cache:
        return _map_cache[cache_key].copy()

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

    img = Image.fromarray(japan_picture(color_map)).convert('RGBA')
    _map_cache[cache_key] = img.copy()
    return img


# ============================================================
# アニメーションフレーム生成（1県 = 複数フレーム）
# ============================================================
def generate_animated_frames(df, current_rank, title, fonts, frame_dir,
                              W=1920, H=1080, reverse=False, fps=24, sec_per_pref=4.5,
                              painted_ranks=None):
    """1県分のアニメーションフレーム群を生成して保存。フレームパスのリストを返す。

    アニメーション:
    - 0.0〜0.15: 全要素フェードイン（opacity 0→1）+ 右からの微スライド（20px）
    - 0.15〜1.0: 完成状態ホールド
    """
    if painted_ranks is None:
        painted_ranks = []
    total = len(df)
    current_row = df[df['rank'] == current_rank].iloc[0]
    rank_color = get_rank_color(current_rank, total)
    current_code = PREF_NAME_TO_CODE.get(current_row['pref_code'])
    total_frames = int(sec_per_pref * fps)

    # 地図（キャッシュ済みの場合は再生成しない）
    map_img_full = generate_japan_map(df, current_rank, total, reverse)
    map_target_h = H - 160
    map_ratio = map_target_h / map_img_full.height
    map_w = int(map_img_full.width * map_ratio)
    map_h = int(map_img_full.height * map_ratio)
    map_img_resized = map_img_full.resize((map_w, map_h), Image.LANCZOS)
    map_x = 30
    map_y = 90

    # 絵文字座標を事前計算
    emoji_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'assets', 'emoji')
    emoji_data = []  # [(emoji_img, paste_x, paste_y, is_current)]
    all_emoji_ranks = list(painted_ranks) + [current_rank]
    for e_rank in all_emoji_ranks:
        e_row = df[df['rank'] == e_rank].iloc[0]
        e_code = PREF_NAME_TO_CODE.get(e_row['pref_code'])
        if not e_code:
            continue
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
                emoji_size = 40
                e_img = Image.open(emoji_path).convert('RGBA')
                e_img = e_img.resize((emoji_size, emoji_size), Image.LANCZOS)
                emoji_data.append((e_img, fx - emoji_size // 2, fy - emoji_size // 2,
                                   e_rank == current_rank))
        except Exception:
            pass

    # 都道府県画像
    pref_img = None
    pref_img_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'assets', 'pref_images')
    pref_img_path = os.path.join(pref_img_dir, f'{current_rank:02d}_{current_row["pref_name"]}.jpg')
    if os.path.exists(pref_img_path):
        try:
            pref_img = Image.open(pref_img_path).convert('RGBA')
        except Exception:
            pref_img = None

    panel_x = map_w + 60
    panel_w = W - panel_x - 30
    panel_y = 85
    good_text = str(current_row.get('good_point', ''))
    caution_text = str(current_row.get('caution_point', ''))

    paths = []
    for fi in range(total_frames):
        t = fi / max(total_frames - 1, 1)
        anim_t = min(t / 0.15, 1.0)
        alpha = ease_out_cubic(anim_t)
        slide_x = int(20 * (1 - alpha))

        def ac(color_rgb):
            """RGB色にalphaを乗算して返す"""
            return tuple(int(c * alpha) for c in color_rgb)

        def ac_rgba(color_rgba):
            """RGBA色のA成分にalphaを乗算して返す"""
            r, g, b, a = color_rgba
            return (r, g, b, int(a * alpha))

        img = get_gradient_bg(W, H)
        draw = ImageDraw.Draw(img, 'RGBA')

        # 背景: 常に100%
        # タイトルバー: alpha乗算
        safe_rounded_rect(draw, [0, 0, W, 70], radius=0, fill=ac_rgba((20, 20, 42, 230)))
        title_font = fonts.bold(28)
        draw.text((30, 18), title, fill=ac(TEXT_WHITE), font=title_font)

        # 地図: 全体は常に表示（paste alpha乗算なし）、新しい県だけグロー演出
        img.paste(map_img_resized, (map_x, map_y), map_img_resized)

        # 新県グロー演出（current_rank の県を alpha 連動で明るく）
        if current_code and alpha < 1.0:
            try:
                _gmap = {current_code: (255, 255, 255)}
                _graw = japan_picture(_gmap)
                _gpil = Image.fromarray(_graw).convert('RGBA')
                _garr = np.array(_gpil)
                _gmask = (_garr[:,:,0] == 255) & (_garr[:,:,1] == 255) & (_garr[:,:,2] == 255)
                _gys, _gxs = np.where(_gmask)
                if len(_gys) > 0:
                    glow_img = Image.new('RGBA', (map_w, map_h), (0, 0, 0, 0))
                    _gh, _gw = _gpil.height, _gpil.width
                    glow_scaled = _gpil.resize((map_w, map_h), Image.LANCZOS)
                    glow_arr = np.array(glow_scaled)
                    glow_mask = (glow_arr[:,:,0] > 200) & (glow_arr[:,:,1] > 200) & (glow_arr[:,:,2] > 200)
                    glow_overlay = Image.new('RGBA', (map_w, map_h), (0, 0, 0, 0))
                    glow_draw = ImageDraw.Draw(glow_overlay)
                    ys2, xs2 = np.where(glow_mask)
                    if len(ys2) > 0:
                        x0g, y0g, x1g, y1g = xs2.min(), ys2.min(), xs2.max(), ys2.max()
                        glow_val = int(60 * (1 - alpha))
                        glow_draw.rectangle([x0g, y0g, x1g, y1g], fill=(255, 255, 200, glow_val))
                    img.paste(glow_overlay, (map_x, map_y), glow_overlay)
            except Exception:
                pass

        # 絵文字: alpha乗算
        for (e_img, ex, ey, is_cur) in emoji_data:
            if is_cur:
                # 現在県: alpha乗算
                e_copy = e_img.copy()
                r2, g2, b2, a2 = e_copy.split()
                a2 = a2.point(lambda p: int(p * alpha))
                e_copy = Image.merge('RGBA', (r2, g2, b2, a2))
                img.paste(e_copy, (ex, ey), e_copy)
            else:
                img.paste(e_img, (ex, ey), e_img)

        # 情報パネル背景: alpha乗算
        safe_rounded_rect(draw,
            [panel_x + slide_x, panel_y, panel_x + slide_x + panel_w, panel_y + 420],
            radius=20, fill=ac_rgba((25, 25, 55, 200))
        )

        # 順位テキスト: alpha + slide_x
        rank_font = fonts.bold(90)
        rank_text = f'{current_rank}位'
        draw.text((panel_x + slide_x + panel_w // 2, panel_y + 30), rank_text,
                  fill=ac(rank_color), font=rank_font, anchor='mt')

        # TOP3メダル演出
        if current_rank <= 3:
            medal_colors = {1: (255, 50, 50), 2: (255, 140, 50), 3: (255, 200, 50)}
            medal_text = {1: 'BEST', 2: '2nd', 3: '3rd'}
            medal_c = medal_colors[current_rank]
            badge_font = fonts.bold(18)
            bx = panel_x + slide_x + panel_w // 2
            safe_rounded_rect(draw,
                [bx - 48, panel_y + 8, bx + 48, panel_y + 34],
                radius=10, fill=ac_rgba((*medal_c, 255))
            )
            draw.text((bx, panel_y + 10), medal_text[current_rank],
                      fill=ac((255, 255, 255)), font=badge_font, anchor='mt')

        # 県名: alpha + slide_x
        pref_font = fonts.bold(72)
        draw.text((panel_x + slide_x + panel_w // 2, panel_y + 145),
                  current_row['pref_name'], fill=ac(TEXT_WHITE), font=pref_font, anchor='mt')

        # 区切り線: alpha
        line_y = panel_y + 230
        line_cx = panel_x + slide_x + panel_w // 2
        line_w_half = (panel_w - 60) // 2
        draw.line([(line_cx - line_w_half, line_y), (line_cx + line_w_half, line_y)],
                  fill=ac((60, 60, 100)), width=2)

        # ランキングリスト: alpha
        list_y = panel_y + 245
        list_font_sm = fonts.regular(20)
        max_visible = 6
        if painted_ranks:
            visible = painted_ranks[-max_visible:]
            for li, p_rank in enumerate(visible):
                p_row = df[df['rank'] == p_rank].iloc[0]
                p_color = get_rank_color(p_rank, total)
                ly = list_y + li * 28
                p_c = tuple(int(c * 0.6 * alpha) for c in p_color)
                draw.text((panel_x + slide_x + 20, ly), f'{p_rank}位', fill=p_c, font=list_font_sm)
                draw.text((panel_x + slide_x + 80, ly), p_row['pref_name'],
                          fill=ac((180, 180, 180)), font=list_font_sm)

        # 右下パネル: alpha
        tips_y = panel_y + 440
        tips_h = H - tips_y - 40
        safe_rounded_rect(draw,
            [panel_x + slide_x, tips_y, panel_x + slide_x + panel_w, tips_y + tips_h],
            radius=15, fill=ac_rgba((20, 20, 45, 200))
        )

        good_label_font = fonts.bold(28)
        good_text_font = fonts.regular(26)
        if good_text and good_text != 'nan':
            gy = tips_y + 12
            draw.text((panel_x + slide_x + 15, gy), 'GOOD',
                      fill=ac((80, 220, 120)), font=good_label_font)
            draw.text((panel_x + slide_x + 15, gy + 34), good_text,
                      fill=ac(TEXT_WHITE), font=good_text_font)

        caut_label_font = fonts.bold(28)
        caut_text_font = fonts.bold(26)
        if caution_text and caution_text != 'nan':
            cy_pos = tips_y + 80
            draw.text((panel_x + slide_x + 15, cy_pos), 'NG',
                      fill=ac((255, 100, 80)), font=caut_label_font)
            draw.text((panel_x + slide_x + 15, cy_pos + 34), caution_text,
                      fill=ac((255, 220, 180)), font=caut_text_font)

        # 画像: alpha乗算
        if pref_img:
            photo_y = tips_y + 150
            photo_size = min((panel_w - 30) // 2, tips_h - 165)
            if photo_size > 30:
                pw, ph = pref_img.size
                crop_size = min(pw, ph)
                left = (pw - crop_size) // 2
                top = (ph - crop_size) // 2
                thumb = pref_img.crop((left, top, left + crop_size, top + crop_size))
                thumb = thumb.resize((photo_size, photo_size), Image.LANCZOS)
                r2, g2, b2, a2 = thumb.split()
                a2 = a2.point(lambda p: int(p * alpha))
                thumb = Image.merge('RGBA', (r2, g2, b2, a2))
                img.paste(thumb, (panel_x + slide_x + 15, photo_y), thumb)

        # ソース表記: alpha
        src_font = fonts.regular(14)
        draw.text((30, H - 25), '※公的機関の公開情報をもとに作成', fill=ac(TEXT_DIM), font=src_font)

        frame_path = os.path.join(frame_dir, f'anim_{current_rank:03d}_{fi:04d}.png')
        img.save(frame_path, 'PNG')
        paths.append(frame_path)

    return paths


# ============================================================
# イントロ（静止画1枚）
# ============================================================
def generate_intro_image(title, disclaimers, fonts, frame_dir, W=1920, H=1080):
    img = get_gradient_bg(W, H)
    draw = ImageDraw.Draw(img, 'RGBA')

    disc_font = fonts.regular(26)
    disc_y = H // 2 - len(disclaimers) * 22
    for i, line in enumerate(disclaimers):
        draw.text((W // 2, disc_y + i * 50), line, fill=TEXT_GRAY, font=disc_font, anchor='mm')

    t_font = fonts.bold(56)
    draw.text((W // 2, H // 2 - 40), title, fill=TEXT_WHITE, font=t_font, anchor='mm')

    lw = 300
    draw.line([(W // 2 - lw, H // 2 - 80), (W // 2 + lw, H // 2 - 80)], fill=ACCENT_BLUE, width=3)
    draw.line([(W // 2 - lw, H // 2 + 80), (W // 2 + lw, H // 2 + 80)], fill=ACCENT_BLUE, width=3)

    path = os.path.join(frame_dir, 'static_intro.png')
    img.save(path, 'PNG')
    return path


# ============================================================
# TOP3振り返り（静止画1枚）
# ============================================================
def generate_top3_review_image(df, fonts, frame_dir, W=1920, H=1080):
    total = len(df)
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

    top3 = df[df['rank'].isin([1, 2, 3])].sort_values('rank')
    medal_colors = {1: GOLD, 2: (192, 192, 192), 3: (205, 127, 50)}
    medal_labels = {1: '1st', 2: '2nd', 3: '3rd'}
    display_order = [3, 2, 1]

    img = get_gradient_bg(W, H)
    draw = ImageDraw.Draw(img, 'RGBA')

    # 背景に薄く完成地図
    map_copy = full_map.copy()
    alpha_ch = map_copy.getchannel('A')
    alpha_ch = alpha_ch.point(lambda p: int(p * 0.25))
    map_copy.putalpha(alpha_ch)
    img.paste(map_copy, (mx, 50), map_copy)

    title_font = fonts.bold(60)
    draw.text((W // 2, 60), 'TOP 3', fill=GOLD, font=title_font, anchor='mt')
    lw = 300
    draw.line([(W // 2 - lw, 130), (W // 2 + lw, 130)], fill=GOLD, width=2)

    card_w = 380
    card_h = 300
    card_y = H // 2 - card_h // 2 + 20
    positions = {1: W // 2, 2: W // 2 - 420, 3: W // 2 + 420}

    for rank in display_order:
        row_data = top3[top3['rank'] == rank]
        if row_data.empty:
            continue
        row = row_data.iloc[0]
        cx = positions[rank]
        medal_c = medal_colors[rank]

        safe_rounded_rect(draw,
            [cx - card_w // 2, card_y, cx + card_w // 2, card_y + card_h],
            radius=16, fill=(30, 30, 60, 200)
        )

        circle_r = 40
        circle_c = (cx, card_y + 60)
        draw.ellipse(
            [circle_c[0] - circle_r, circle_c[1] - circle_r,
             circle_c[0] + circle_r, circle_c[1] + circle_r],
            fill=medal_c
        )
        medal_font = fonts.bold(36)
        draw.text(circle_c, medal_labels[rank], fill=(30, 30, 30), font=medal_font, anchor='mm')

        rank_font = fonts.bold(28)
        draw.text((cx, card_y + 120), f'{rank}位', fill=medal_c, font=rank_font, anchor='mm')

        pref_font = fonts.bold(36)
        draw.text((cx, card_y + 170), str(row['pref_name']), fill=TEXT_WHITE, font=pref_font, anchor='mm')

        val_font = fonts.regular(26)
        draw.text((cx, card_y + 220), str(row['value']), fill=TEXT_GRAY, font=val_font, anchor='mm')

    path = os.path.join(frame_dir, 'static_top3review.png')
    img.save(path, 'PNG')
    return path


# ============================================================
# アウトロ（静止画1枚）
# ============================================================
def generate_outro_image(title, df, fonts, frame_dir, W=1920, H=1080):
    total = len(df)
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

    img = get_gradient_bg(W, H)
    draw = ImageDraw.Draw(img, 'RGBA')

    t_font = fonts.bold(36)
    draw.text((W // 2, 30), title, fill=TEXT_WHITE, font=t_font, anchor='mt')
    img.paste(full_map, (mx, 80), full_map)

    label_font = fonts.bold(20)
    item_font = fonts.regular(18)

    safe_rounded_rect(draw, [20, H - 200, 350, H - 20], radius=12, fill=(40, 20, 20, 200))
    draw.text((35, H - 190), 'WORST 5', fill=ACCENT_RED, font=label_font)
    for i, (_, row) in enumerate(worst5.iterrows()):
        draw.text((35, H - 160 + i * 28),
                  f'{row["rank"]}位 {row["pref_name"]} ({row["value"]})',
                  fill=TEXT_WHITE, font=item_font)

    safe_rounded_rect(draw, [W - 350, H - 200, W - 20, H - 20], radius=12, fill=(20, 40, 20, 200))
    draw.text((W - 335, H - 190), 'BEST 5', fill=(80, 255, 80), font=label_font)
    for i, (_, row) in enumerate(best5.sort_values('rank', ascending=False).iterrows()):
        draw.text((W - 335, H - 160 + i * 28),
                  f'{row["rank"]}位 {row["pref_name"]} ({row["value"]})',
                  fill=TEXT_WHITE, font=item_font)

    legend_font = fonts.regular(16)
    draw.text((W // 2 - 100, H - 40), '赤:ワースト', fill=(255, 100, 100), font=legend_font)
    draw.text((W // 2 + 30, H - 40), '緑:ベスト', fill=(100, 255, 100), font=legend_font)

    path = os.path.join(frame_dir, 'static_outro.png')
    img.save(path, 'PNG')
    return path


# ============================================================
# エンドカード（静止画1枚）
# ============================================================
def generate_endcard_image(fonts, frame_dir, W=1920, H=1080):
    img = Image.new('RGB', (W, H), (int(BG_COLOR[0] * 0.5), int(BG_COLOR[1] * 0.5), int(BG_COLOR[2] * 0.5)))
    draw = ImageDraw.Draw(img, 'RGBA')

    main_font = fonts.bold(56)
    draw.text((W // 2, H // 2 - 60), 'ご視聴ありがとうございました',
              fill=TEXT_WHITE, font=main_font, anchor='mm')

    sub_font = fonts.regular(34)
    draw.text((W // 2, H // 2 + 30), '高評価・チャンネル登録お願いします',
              fill=ACCENT_BLUE, font=sub_font, anchor='mm')

    lw = 450
    draw.line([(W // 2 - lw, H // 2 - 100), (W // 2 + lw, H // 2 - 100)], fill=ACCENT_BLUE, width=2)
    draw.line([(W // 2 - lw, H // 2 + 80), (W // 2 + lw, H // 2 + 80)], fill=ACCENT_BLUE, width=2)

    path = os.path.join(frame_dir, 'static_endcard.png')
    img.save(path, 'PNG')
    return path


# ============================================================
# メイン
# ============================================================
def main():
    parser = argparse.ArgumentParser(description='塗り絵ランキング動画生成 v5 (短アニメーション方式)')
    parser.add_argument('--csv', required=True, help='ランキングCSV')
    parser.add_argument('--title', default='旅ガチ勢による行ってよかった都道府県ランキング', help='動画タイトル')
    parser.add_argument('--output', default='output/ranking.mp4', help='出力パス')
    parser.add_argument('--sec-per-pref', type=float, default=4.5, help='1県あたりの秒数')
    parser.add_argument('--bgm', default=None, help='BGMファイル')
    parser.add_argument('--width', type=int, default=1920)
    parser.add_argument('--height', type=int, default=1080)
    parser.add_argument('--reverse', action='store_true', help='47位→1位')
    parser.add_argument('--fps', type=int, default=24, help='FPS')
    args = parser.parse_args()

    df = pd.read_csv(args.csv)
    total = len(df)
    print(f"データ: {total}件")

    fonts = FontSet()
    print(f"フォント(bold): {fonts.bold_path}")

    frame_dir = tempfile.mkdtemp(prefix='nurie_v5_')
    print(f"作業ディレクトリ: {frame_dir}")

    fps = args.fps
    all_ranks = sorted(df['rank'].tolist())
    ranks = list(reversed(all_ranks)) if args.reverse else all_ranks

    try:
        frame_paths = []

        # イントロ（5秒 = 120フレーム）
        print("イントロ生成中...")
        disclaimers = [
            'あなたの県は何位？',
            '',
            '旅行者のリアルな声をもとに',
            '行く前に知っておきたいポイントをまとめました。',
            '',
            '最後まで見ると意外な結果が…',
        ]
        intro_img = generate_intro_image(args.title, disclaimers, fonts, frame_dir, args.width, args.height)
        for _ in range(int(5 * fps)):
            frame_paths.append(intro_img)

        # 各県（アニメーション: sec_per_pref秒分のフレーム）
        painted_ranks = []
        for i, rank in enumerate(ranks):
            print(f'\rアニメーション生成: {i+1}/{total} ({rank}位)', end='', flush=True)
            pref_frames = generate_animated_frames(
                df, rank, args.title, fonts, frame_dir,
                args.width, args.height, args.reverse,
                fps=fps, sec_per_pref=args.sec_per_pref,
                painted_ranks=painted_ranks
            )
            frame_paths.extend(pref_frames)
            painted_ranks.append(rank)
        print()

        # TOP3振り返り（6秒）
        print("TOP3振り返り生成中...")
        top3_img = generate_top3_review_image(df, fonts, frame_dir, args.width, args.height)
        for _ in range(int(6 * fps)):
            frame_paths.append(top3_img)

        # アウトロ（7秒）
        print("アウトロ生成中...")
        outro_img = generate_outro_image(args.title, df, fonts, frame_dir, args.width, args.height)
        for _ in range(int(7 * fps)):
            frame_paths.append(outro_img)

        # エンドカード（5秒）
        print("エンドカード生成中...")
        endcard_img = generate_endcard_image(fonts, frame_dir, args.width, args.height)
        for _ in range(int(5 * fps)):
            frame_paths.append(endcard_img)

        total_frames = len(frame_paths)
        total_sec = total_frames / fps
        print(f"合計フレーム: {total_frames} ({total_sec:.1f}秒 / {total_sec/60:.1f}分)")

        # ImageSequenceClipで結合
        print("動画合成中...")
        clip = ImageSequenceClip(frame_paths, fps=fps)

        # BGMループ
        if args.bgm and os.path.exists(args.bgm):
            print(f"BGM: {args.bgm}")
            audio = AudioFileClip(args.bgm)
            if audio.duration < clip.duration:
                loops = int(clip.duration / audio.duration) + 1
                audio = concatenate_audioclips([audio] * loops).subclipped(0, clip.duration)
            else:
                audio = audio.subclipped(0, clip.duration)
            clip = clip.with_audio(audio)

        os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
        clip.write_videofile(
            args.output,
            codec='libx264',
            audio_codec='aac',
            fps=fps,
            preset='ultrafast',
            logger='bar'
        )

        print(f"\n完成: {args.output}")
        print(f"長さ: {clip.duration:.1f}秒 ({clip.duration/60:.1f}分)")

    finally:
        shutil.rmtree(frame_dir, ignore_errors=True)


if __name__ == '__main__':
    main()
