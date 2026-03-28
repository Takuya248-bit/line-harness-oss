#!/usr/bin/env python3
"""47都道府県の代表画像をPexels APIから取得"""
import os
import json
import time
import urllib.request

API_KEY = os.environ.get('PEXELS_API_KEY', '')
if not API_KEY:
    key_path = os.path.join(os.path.dirname(__file__), '..', '.pexels_key')
    alt_path = os.path.expanduser('~/douga/.pexels_key')
    for p in [key_path, alt_path]:
        if os.path.exists(p):
            API_KEY = open(p).read().strip()
            break

OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'assets', 'pref_images')
os.makedirs(OUT_DIR, exist_ok=True)

QUERIES = {
    1: ("Okinawa beach ocean", "沖縄県"),
    2: ("Hokkaido sushi seafood", "北海道"),
    3: ("Kyoto temple autumn", "京都府"),
    4: ("Tokyo ramen night", "東京都"),
    5: ("Osaka street food", "大阪府"),
    6: ("Kanazawa fish market", "石川県"),
    7: ("Fukuoka ramen yatai", "福岡県"),
    8: ("Kobe harbor night", "兵庫県"),
    9: ("farm ice cream cow", "千葉県"),
    10: ("Nagano mountain snow", "長野県"),
    11: ("Hiroshima momiji", "広島県"),
    12: ("Nara deer temple", "奈良県"),
    13: ("Nagasaki champon noodle", "長崎県"),
    14: ("hamburger steak japan", "静岡県"),
    15: ("Enoshima train sea", "神奈川県"),
    16: ("hoto noodle japan", "山梨県"),
    17: ("Ise shrine japan", "三重県"),
    18: ("Beppu onsen steam", "大分県"),
    19: ("Nagoya morning toast egg", "愛知県"),
    20: ("chicken nanban japan", "宮崎県"),
    21: ("udon noodle japan", "香川県"),
    22: ("horse meat sashimi japan", "熊本県"),
    23: ("Takayama beef sushi", "岐阜県"),
    24: ("soba sake japan", "新潟県"),
    25: ("Sakurajima volcano", "鹿児島県"),
    26: ("peach fruit japan", "岡山県"),
    27: ("Kusatsu onsen japan", "群馬県"),
    28: ("gyutan beef tongue japan", "宮城県"),
    29: ("Tottori sand dunes", "鳥取県"),
    30: ("tuna sashimi japan", "青森県"),
    31: ("Nachi waterfall japan", "和歌山県"),
    32: ("Izumo shrine japan", "島根県"),
    33: ("Tsunoshima bridge sea", "山口県"),
    34: ("Kitakata ramen japan", "福島県"),
    35: ("Toyama sushi japan", "富山県"),
    36: ("gyoza dumplings japan", "栃木県"),
    37: ("Lake Biwa japan", "滋賀県"),
    38: ("cherry fruit farm", "山形県"),
    39: ("kiritanpo nabe japan", "秋田県"),
    40: ("katsuo tataki straw fire", "高知県"),
    41: ("Dogo onsen japan", "愛媛県"),
    42: ("wanko soba japan", "岩手県"),
    43: ("dinosaur museum japan", "福井県"),
    44: ("Hitachi seaside park blue", "茨城県"),
    45: ("Kawagoe sweet potato", "埼玉県"),
    46: ("squid sashimi transparent", "佐賀県"),
    47: ("Awa Odori dance", "徳島県"),
}

def fetch_image(query, rank, pref_name):
    out_path = os.path.join(OUT_DIR, f'{rank:02d}_{pref_name}.jpg')
    if os.path.exists(out_path):
        print(f'  SKIP (exists): {out_path}')
        return True

    url = f'https://api.pexels.com/v1/search?query={urllib.parse.quote(query)}&per_page=1&orientation=landscape'
    req = urllib.request.Request(url, headers={'Authorization': API_KEY})

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())

        if not data.get('photos'):
            print(f'  NO RESULTS: {query}')
            return False

        img_url = data['photos'][0]['src']['medium']
        urllib.request.urlretrieve(img_url, out_path)
        print(f'  OK: {out_path}')
        return True
    except Exception as e:
        print(f'  ERROR: {e}')
        return False

import urllib.parse

print(f'Fetching {len(QUERIES)} images...')
success = 0
for rank, (query, pref) in QUERIES.items():
    print(f'[{rank}/47] {pref} - "{query}"')
    if fetch_image(query, rank, pref):
        success += 1
    time.sleep(0.3)  # rate limit

print(f'\nDone: {success}/{len(QUERIES)} images')
