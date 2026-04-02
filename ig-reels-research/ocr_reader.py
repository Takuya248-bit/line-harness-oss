"""OCRでいいね数・コメント数を読み取る"""
import re
import cv2
import numpy as np

try:
    import pytesseract
    HAS_TESSERACT = True
except ImportError:
    HAS_TESSERACT = False


def preprocess_for_ocr(image_path: str) -> np.ndarray:
    """OCR用に画像を前処理（下部のUI領域を切り出し）"""
    img = cv2.imread(image_path)
    if img is None:
        return None

    h, w = img.shape[:2]
    # Instagramリールの下部30%にいいね・コメントUIがある
    roi = img[int(h * 0.7):h, 0:w]

    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
    # 白文字の読み取り用にネガポジ反転
    _, binary = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY)

    return binary


def extract_numbers(text: str) -> list[str]:
    """テキストから数値表現を抽出（1.2万、5,432 など）"""
    patterns = [
        r'[\d,]+\.?\d*[万K]?',
    ]
    results = []
    for pattern in patterns:
        matches = re.findall(pattern, text)
        results.extend([m.strip() for m in matches if m.strip()])
    return results


def read_engagement(image_path: str) -> dict:
    """スクショからいいね数・コメント数を読み取る"""
    result = {"likes": None, "comments": None}

    if not HAS_TESSERACT:
        return result

    processed = preprocess_for_ocr(image_path)
    if processed is None:
        return result

    try:
        text = pytesseract.image_to_string(processed, lang="eng+jpn",
                                           config="--psm 6")
        numbers = extract_numbers(text)

        # Instagramリールの場合、通常「いいね」が最初、「コメント」が次
        if len(numbers) >= 1:
            result["likes"] = numbers[0]
        if len(numbers) >= 2:
            result["comments"] = numbers[1]
    except Exception as e:
        print(f"  OCR error: {e}")

    return result


def read_engagement_from_sidebar(image_path: str) -> dict:
    """右サイドバーのアイコン横の数値を読み取る（リール縦画面UI）"""
    result = {"likes": None, "comments": None}

    if not HAS_TESSERACT:
        return result

    img = cv2.imread(image_path)
    if img is None:
        return result

    h, w = img.shape[:2]
    # 右サイドバー領域（右端20%、縦中央40-80%）
    roi = img[int(h * 0.4):int(h * 0.8), int(w * 0.8):w]

    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
    _, binary = cv2.threshold(gray, 180, 255, cv2.THRESH_BINARY)

    try:
        text = pytesseract.image_to_string(binary, lang="eng",
                                           config="--psm 6")
        numbers = extract_numbers(text)
        if len(numbers) >= 1:
            result["likes"] = numbers[0]
        if len(numbers) >= 2:
            result["comments"] = numbers[1]
    except Exception:
        pass

    return result
