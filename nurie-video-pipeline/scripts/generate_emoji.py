#!/usr/bin/env python3
"""5段階の表情絵文字をPillowで生成"""
import os
import math
from PIL import Image, ImageDraw

OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'assets', 'emoji')
os.makedirs(OUT_DIR, exist_ok=True)

SIZE = 128
R = SIZE // 2 - 4

def draw_face(name, mouth_func, eye_style='normal', blush=False, sweat=False, tear=False):
    img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    cx, cy = SIZE // 2, SIZE // 2

    # 顔の円（黄色グラデーション風）
    draw.ellipse([cx-R, cy-R, cx+R, cy+R], fill=(255, 210, 60))
    # 少し立体感（上部を明るく）
    draw.ellipse([cx-R+8, cy-R+4, cx+R-8, cy-R+R], fill=(255, 225, 80))

    # 目
    eye_l_x, eye_r_x = cx - 22, cx + 22
    eye_y = cy - 12

    if eye_style == 'normal':
        # 白目
        draw.ellipse([eye_l_x-12, eye_y-14, eye_l_x+12, eye_y+14], fill=(255,255,255))
        draw.ellipse([eye_r_x-12, eye_y-14, eye_r_x+12, eye_y+14], fill=(255,255,255))
        # 黒目
        draw.ellipse([eye_l_x-6, eye_y-8, eye_l_x+6, eye_y+8], fill=(40,40,40))
        draw.ellipse([eye_r_x-6, eye_y-8, eye_r_x+6, eye_y+8], fill=(40,40,40))
        # ハイライト
        draw.ellipse([eye_l_x-2, eye_y-6, eye_l_x+4, eye_y-1], fill=(255,255,255))
        draw.ellipse([eye_r_x-2, eye_y-6, eye_r_x+4, eye_y-1], fill=(255,255,255))
    elif eye_style == 'happy':
        # ^^ 閉じ目
        for ex in [eye_l_x, eye_r_x]:
            draw.arc([ex-12, eye_y-8, ex+12, eye_y+12], 200, 340, fill=(40,40,40), width=4)
    elif eye_style == 'sad':
        # 白目（上向き）
        draw.ellipse([eye_l_x-12, eye_y-10, eye_l_x+12, eye_y+18], fill=(255,255,255))
        draw.ellipse([eye_r_x-12, eye_y-10, eye_r_x+12, eye_y+18], fill=(255,255,255))
        # 黒目（下寄り）
        draw.ellipse([eye_l_x-5, eye_y+2, eye_l_x+5, eye_y+14], fill=(40,40,40))
        draw.ellipse([eye_r_x-5, eye_y+2, eye_r_x+5, eye_y+14], fill=(40,40,40))
        # 眉（ハの字）
        draw.line([(eye_l_x-14, eye_y-20), (eye_l_x+10, eye_y-26)], fill=(80,60,30), width=4)
        draw.line([(eye_r_x+14, eye_y-20), (eye_r_x-10, eye_y-26)], fill=(80,60,30), width=4)
    elif eye_style == 'worried':
        # 白目（大きめ）
        draw.ellipse([eye_l_x-14, eye_y-16, eye_l_x+14, eye_y+16], fill=(255,255,255))
        draw.ellipse([eye_r_x-14, eye_y-16, eye_r_x+14, eye_y+16], fill=(255,255,255))
        # 小さい黒目
        draw.ellipse([eye_l_x-4, eye_y-4, eye_l_x+4, eye_y+4], fill=(40,40,40))
        draw.ellipse([eye_r_x-4, eye_y-4, eye_r_x+4, eye_y+4], fill=(40,40,40))
    elif eye_style == 'cry':
        # 閉じ目（下向き弧）
        for ex in [eye_l_x, eye_r_x]:
            draw.arc([ex-12, eye_y-4, ex+12, eye_y+16], 20, 160, fill=(40,40,40), width=4)
        # 眉（ハの字強め）
        draw.line([(eye_l_x-16, eye_y-18), (eye_l_x+12, eye_y-28)], fill=(80,60,30), width=4)
        draw.line([(eye_r_x+16, eye_y-18), (eye_r_x-12, eye_y-28)], fill=(80,60,30), width=4)

    # 口
    mouth_func(draw, cx, cy + 20)

    # ほっぺ
    if blush:
        draw.ellipse([cx-42, cy+8, cx-22, cy+22], fill=(255, 150, 100, 120))
        draw.ellipse([cx+22, cy+8, cx+42, cy+22], fill=(255, 150, 100, 120))

    # 汗
    if sweat:
        draw.ellipse([cx+30, cy-30, cx+38, cy-18], fill=(100, 180, 255, 200))

    # 涙
    if tear:
        draw.polygon([(eye_l_x, eye_y+16), (eye_l_x-6, eye_y+36), (eye_l_x+6, eye_y+36)],
                     fill=(100, 180, 255, 200))

    img.save(os.path.join(OUT_DIR, f'{name}.png'), 'PNG')
    print(f'  {name}.png')


# 口パターン
def mouth_big_smile(draw, x, y):
    draw.arc([x-20, y-6, x+20, y+18], 0, 180, fill=(40,40,40), width=3)
    draw.pieslice([x-18, y-2, x+18, y+16], 0, 180, fill=(180, 60, 40))

def mouth_smile(draw, x, y):
    draw.arc([x-16, y-4, x+16, y+14], 10, 170, fill=(40,40,40), width=3)

def mouth_neutral(draw, x, y):
    draw.line([(x-14, y+4), (x+14, y+4)], fill=(40,40,40), width=3)

def mouth_frown(draw, x, y):
    draw.arc([x-14, y+4, x+14, y+22], 190, 350, fill=(40,40,40), width=3)

def mouth_cry(draw, x, y):
    draw.arc([x-18, y+6, x+18, y+28], 190, 350, fill=(40,40,40), width=3)
    draw.pieslice([x-16, y+8, x+16, y+26], 190, 350, fill=(180, 60, 40))


print("Generating emoji faces...")
# 1位〜5位: 大笑い
draw_face('rank_top', mouth_big_smile, eye_style='happy', blush=True)
# 6位〜15位: にこにこ
draw_face('rank_good', mouth_smile, eye_style='normal', blush=True)
# 16位〜30位: 普通
draw_face('rank_neutral', mouth_neutral, eye_style='normal', sweat=True)
# 31位〜40位: 困り顔
draw_face('rank_bad', mouth_frown, eye_style='worried', sweat=True)
# 41位〜47位: 泣き顔
draw_face('rank_worst', mouth_cry, eye_style='cry', tear=True)

print("Done!")
