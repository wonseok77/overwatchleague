import logging
import re
from typing import Dict, List, Optional

from PIL import Image, ImageEnhance
import pytesseract

logger = logging.getLogger(__name__)

STAT_KEYS = ["kills", "deaths", "assists", "damage_dealt", "healing_done"]


def extract_stats_from_image(image_path: str) -> Dict[str, Optional[int]]:
    """
    오버워치 스코어보드 스크린샷에서 스탯 추출.
    반환: {"kills": int|None, "deaths": int|None, "assists": int|None,
           "damage_dealt": int|None, "healing_done": int|None}
    """
    try:
        img = Image.open(image_path)
        img = img.convert("L")
        img = ImageEnhance.Contrast(img).enhance(2.0)
        img = ImageEnhance.Sharpness(img).enhance(2.0)

        text = pytesseract.image_to_string(img, config="--psm 6")

        numbers = _parse_numbers(text)
        return _map_stats(numbers)
    except Exception:
        logger.exception("OCR extraction failed for %s", image_path)
        return {}


def _parse_numbers(text: str) -> List[int]:
    return [int(n) for n in re.findall(r"\d+", text)]


def _map_stats(numbers: List[int]) -> Dict[str, Optional[int]]:
    result: Dict[str, Optional[int]] = {}
    for i, key in enumerate(STAT_KEYS):
        result[key] = numbers[i] if i < len(numbers) else None
    return result
