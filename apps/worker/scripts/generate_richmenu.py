#!/usr/bin/env python3
"""Generate rich menu image for Sakurako's LINE official account."""

from PIL import Image, ImageDraw, ImageFont
import math

# Canvas size
W, H = 2500, 1686
COLS, ROWS = 3, 2
CELL_W = W // COLS  # ~833
CELL_H = H // ROWS  # 843

# Colors
BG_TOP = (15, 23, 42)       # Dark navy top
BG_BOTTOM = (30, 41, 59)    # Slightly lighter navy bottom
CARD_COLORS = [
    (59, 130, 246),   # Blue - consul
    (16, 185, 129),   # Emerald - note
    (245, 158, 11),   # Amber - achievements
    (168, 85, 247),   # Purple - script template
    (236, 72, 153),   # Pink - audition
    (34, 197, 94),    # Green - free diagnosis
]
WHITE = (255, 255, 255)
SHADOW = (0, 0, 0, 60)

# Fonts
FONT_LABEL = ImageFont.truetype('/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc', 80)
FONT_LABEL_SM = ImageFont.truetype('/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc', 68)
FONT_SUB = ImageFont.truetype('/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc', 42)

# Button definitions
buttons = [
    {"label": "コンサル", "sub": "Consulting", "color": CARD_COLORS[0], "icon": "chat"},
    {"label": "note", "sub": "Blog & Articles", "color": CARD_COLORS[1], "icon": "note"},
    {"label": "実績", "sub": "Achievements", "color": CARD_COLORS[2], "icon": "star"},
    {"label": "台本テンプレ", "sub": "Script Template", "color": CARD_COLORS[3], "icon": "clip"},
    {"label": "オーディション", "sub": "Audition Info", "color": CARD_COLORS[4], "icon": "mic"},
    {"label": "無料診断", "sub": "Free Assessment", "color": CARD_COLORS[5], "icon": "check"},
]


def draw_gradient_bg(img):
    """Draw vertical gradient background."""
    draw = ImageDraw.Draw(img)
    for y in range(H):
        ratio = y / H
        r = int(BG_TOP[0] + (BG_BOTTOM[0] - BG_TOP[0]) * ratio)
        g = int(BG_TOP[1] + (BG_BOTTOM[1] - BG_TOP[1]) * ratio)
        b = int(BG_TOP[2] + (BG_BOTTOM[2] - BG_TOP[2]) * ratio)
        draw.line([(0, y), (W, y)], fill=(r, g, b))


def draw_rounded_rect(draw, xy, radius, fill, outline=None):
    """Draw a rounded rectangle."""
    x1, y1, x2, y2 = xy
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline)


def draw_icon(draw, icon_type, cx, cy, size, color):
    """Draw simple geometric icons."""
    s = size
    if icon_type == "chat":
        # Speech bubble
        pts = [
            (cx - s, cy - s * 0.7),
            (cx + s, cy - s * 0.7),
            (cx + s, cy + s * 0.3),
            (cx + s * 0.2, cy + s * 0.3),
            (cx - s * 0.3, cy + s * 0.8),
            (cx - s * 0.1, cy + s * 0.3),
            (cx - s, cy + s * 0.3),
        ]
        draw.rounded_rectangle(
            [cx - s, cy - s * 0.7, cx + s, cy + s * 0.3],
            radius=s * 0.3, fill=color
        )
        # Tail
        draw.polygon([
            (cx - s * 0.3, cy + s * 0.2),
            (cx - s * 0.4, cy + s * 0.8),
            (cx + s * 0.1, cy + s * 0.3),
        ], fill=color)
        # Dots inside bubble
        dot_r = s * 0.12
        for dx in [-s * 0.4, 0, s * 0.4]:
            draw.ellipse([cx + dx - dot_r, cy - s * 0.2 - dot_r,
                          cx + dx + dot_r, cy - s * 0.2 + dot_r], fill=WHITE)

    elif icon_type == "note":
        # Notebook/document
        pw, ph = s * 0.7, s * 0.9
        draw.rounded_rectangle(
            [cx - pw, cy - ph, cx + pw, cy + ph],
            radius=s * 0.15, fill=color
        )
        # Lines on the page
        for i in range(4):
            ly = cy - ph * 0.5 + i * (ph * 0.35)
            lw = pw * 0.6 if i == 3 else pw * 0.8
            draw.rounded_rectangle(
                [cx - pw * 0.6, ly, cx - pw * 0.6 + lw * 1.2, ly + s * 0.08],
                radius=s * 0.04, fill=WHITE
            )

    elif icon_type == "star":
        # 5-pointed star
        points = []
        for i in range(10):
            angle = math.radians(i * 36 - 90)
            r = s if i % 2 == 0 else s * 0.45
            points.append((cx + r * math.cos(angle), cy + r * math.sin(angle)))
        draw.polygon(points, fill=color)

    elif icon_type == "clip":
        # Clipboard
        pw, ph = s * 0.7, s * 0.95
        draw.rounded_rectangle(
            [cx - pw, cy - ph + s * 0.15, cx + pw, cy + ph],
            radius=s * 0.15, fill=color
        )
        # Clip at top
        clip_w = s * 0.35
        draw.rounded_rectangle(
            [cx - clip_w, cy - ph - s * 0.05, cx + clip_w, cy - ph + s * 0.35],
            radius=s * 0.1, fill=color
        )
        draw.rounded_rectangle(
            [cx - clip_w * 0.6, cy - ph - s * 0.05, cx + clip_w * 0.6, cy - ph + s * 0.2],
            radius=s * 0.08, fill=WHITE
        )
        # Checklist lines
        for i in range(3):
            ly = cy - ph * 0.3 + i * (ph * 0.35)
            # Small checkbox
            cb = s * 0.12
            draw.rectangle([cx - pw * 0.5, ly - cb, cx - pw * 0.5 + cb * 2, ly + cb], fill=WHITE)
            # Line
            draw.rounded_rectangle(
                [cx - pw * 0.15, ly - s * 0.04, cx + pw * 0.55, ly + s * 0.04],
                radius=s * 0.02, fill=WHITE
            )

    elif icon_type == "mic":
        # Microphone
        # Mic head
        draw.rounded_rectangle(
            [cx - s * 0.3, cy - s, cx + s * 0.3, cy + s * 0.1],
            radius=s * 0.3, fill=color
        )
        # Stand arc
        draw.arc(
            [cx - s * 0.55, cy - s * 0.3, cx + s * 0.55, cy + s * 0.55],
            start=0, end=180, fill=color, width=int(s * 0.12)
        )
        # Stand pole
        draw.rounded_rectangle(
            [cx - s * 0.06, cy + s * 0.45, cx + s * 0.06, cy + s * 0.85],
            radius=s * 0.03, fill=color
        )
        # Base
        draw.rounded_rectangle(
            [cx - s * 0.3, cy + s * 0.78, cx + s * 0.3, cy + s * 0.9],
            radius=s * 0.06, fill=color
        )

    elif icon_type == "check":
        # Magnifying glass with checkmark
        # Circle
        draw.ellipse(
            [cx - s * 0.6, cy - s * 0.9, cx + s * 0.5, cy + s * 0.2],
            outline=color, width=int(s * 0.15)
        )
        # Handle
        draw.line(
            [(cx + s * 0.35, cy + s * 0.1), (cx + s * 0.8, cy + s * 0.7)],
            fill=color, width=int(s * 0.15)
        )
        # Checkmark inside
        draw.line([
            (cx - s * 0.25, cy - s * 0.35),
            (cx - s * 0.05, cy - s * 0.15),
        ], fill=color, width=int(s * 0.12))
        draw.line([
            (cx - s * 0.05, cy - s * 0.15),
            (cx + s * 0.25, cy - s * 0.6),
        ], fill=color, width=int(s * 0.12))


def main():
    img = Image.new('RGB', (W, H))
    draw_gradient_bg(img)
    draw = ImageDraw.Draw(img)

    # Draw grid lines (subtle)
    line_color = (255, 255, 255, 30)
    # We need RGBA for transparency, so work on overlay
    overlay = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    odraw = ImageDraw.Draw(overlay)

    # Vertical lines
    for c in range(1, COLS):
        x = c * CELL_W
        odraw.line([(x, 0), (x, H)], fill=(255, 255, 255, 25), width=2)
    # Horizontal line
    odraw.line([(0, CELL_H), (W, CELL_H)], fill=(255, 255, 255, 25), width=2)

    # Draw each button
    for idx, btn in enumerate(buttons):
        row = idx // COLS
        col = idx % COLS
        cx = col * CELL_W + CELL_W // 2
        cy = row * CELL_H + CELL_H // 2

        # Card background (subtle rounded rect)
        pad = 30
        card_x1 = col * CELL_W + pad
        card_y1 = row * CELL_H + pad
        card_x2 = (col + 1) * CELL_W - pad
        card_y2 = (row + 1) * CELL_H - pad

        # Semi-transparent card
        odraw.rounded_rectangle(
            [card_x1, card_y1, card_x2, card_y2],
            radius=24,
            fill=(255, 255, 255, 18)
        )

        # Icon circle background
        icon_cy = cy - 100
        icon_r = 110
        odraw.ellipse(
            [cx - icon_r, icon_cy - icon_r, cx + icon_r, icon_cy + icon_r],
            fill=(*btn["color"], 50)
        )

        # Draw icon (larger)
        draw_icon(odraw, btn["icon"], cx, icon_cy, 75, (*btn["color"], 255))

        # Label
        font = FONT_LABEL if len(btn["label"]) <= 4 else FONT_LABEL_SM
        bbox = odraw.textbbox((0, 0), btn["label"], font=font)
        tw = bbox[2] - bbox[0]
        label_y = cy + 60
        odraw.text((cx - tw // 2, label_y), btn["label"], fill=(255, 255, 255, 255), font=font)

        # Sub label
        bbox_s = odraw.textbbox((0, 0), btn["sub"], font=FONT_SUB)
        tw_s = bbox_s[2] - bbox_s[0]
        odraw.text((cx - tw_s // 2, label_y + 95), btn["sub"], fill=(255, 255, 255, 140), font=FONT_SUB)

        # Bottom accent line
        line_w = 80
        line_y = card_y2 - 50
        odraw.rounded_rectangle(
            [cx - line_w, line_y, cx + line_w, line_y + 4],
            radius=2,
            fill=(*btn["color"], 180)
        )

    # Composite overlay
    img = img.convert('RGBA')
    img = Image.alpha_composite(img, overlay)
    img = img.convert('RGB')

    output_path = '/Users/kimuratakuya/line-harness/apps/worker/scripts/richmenu_sakurako.png'
    img.save(output_path, 'PNG')
    print(f'Image saved to {output_path}')
    print(f'Size: {img.size}')


if __name__ == '__main__':
    main()
