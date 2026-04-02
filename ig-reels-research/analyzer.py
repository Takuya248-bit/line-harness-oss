"""画像類似度分析 - 参考動画との比較"""
import cv2
import numpy as np
from pathlib import Path
from PIL import Image

try:
    import imagehash
    HAS_IMAGEHASH = True
except ImportError:
    HAS_IMAGEHASH = False

from config import REFERENCE_TYPE_A_DIR, REFERENCE_TYPE_B_DIR


def compute_histogram_similarity(img1_path: str, img2_path: str) -> float:
    """ヒストグラム比較による類似度（0-1）"""
    img1 = cv2.imread(img1_path)
    img2 = cv2.imread(img2_path)
    if img1 is None or img2 is None:
        return 0.0

    img2 = cv2.resize(img2, (img1.shape[1], img1.shape[0]))

    hist1 = cv2.calcHist([img1], [0, 1, 2], None, [8, 8, 8], [0, 256, 0, 256, 0, 256])
    hist2 = cv2.calcHist([img2], [0, 1, 2], None, [8, 8, 8], [0, 256, 0, 256, 0, 256])

    cv2.normalize(hist1, hist1)
    cv2.normalize(hist2, hist2)

    return float(cv2.compareHist(hist1, hist2, cv2.HISTCMP_CORREL))


def compute_phash_similarity(img1_path: str, img2_path: str) -> float:
    """パーセプチュアルハッシュによる類似度（0-1）"""
    if not HAS_IMAGEHASH:
        return compute_histogram_similarity(img1_path, img2_path)

    try:
        hash1 = imagehash.phash(Image.open(img1_path))
        hash2 = imagehash.phash(Image.open(img2_path))
        max_diff = 64  # 64ビットハッシュ
        diff = hash1 - hash2
        return 1.0 - (diff / max_diff)
    except Exception:
        return 0.0


def compute_structural_similarity(img1_path: str, img2_path: str) -> float:
    """構造的類似度（色配置・構図の類似性）"""
    img1 = cv2.imread(img1_path, cv2.IMREAD_GRAYSCALE)
    img2 = cv2.imread(img2_path, cv2.IMREAD_GRAYSCALE)
    if img1 is None or img2 is None:
        return 0.0

    size = (200, 200)
    img1 = cv2.resize(img1, size)
    img2 = cv2.resize(img2, size)

    # テンプレートマッチング
    result = cv2.matchTemplate(img1, img2, cv2.TM_CCOEFF_NORMED)
    return float(np.max(result))


def compute_similarity(img1_path: str, img2_path: str) -> float:
    """複合類似度スコア（0-1）"""
    hist_sim = compute_histogram_similarity(img1_path, img2_path)
    phash_sim = compute_phash_similarity(img1_path, img2_path)
    struct_sim = compute_structural_similarity(img1_path, img2_path)

    # 重み付け平均
    return hist_sim * 0.3 + phash_sim * 0.4 + struct_sim * 0.3


def score_against_references(screenshot_paths: list[str], type_: str) -> float:
    """スクショ群を参考画像群と比較し、最高類似度を返す"""
    ref_dir = REFERENCE_TYPE_A_DIR if type_ == "a" else REFERENCE_TYPE_B_DIR

    ref_images = list(ref_dir.glob("*.png")) + list(ref_dir.glob("*.jpg")) + list(ref_dir.glob("*.jpeg"))
    if not ref_images:
        return 0.0

    max_score = 0.0
    for ss_path in screenshot_paths:
        if not ss_path or not Path(ss_path).exists():
            continue
        for ref_path in ref_images:
            score = compute_similarity(ss_path, str(ref_path))
            max_score = max(max_score, score)

    return round(max_score, 4)
