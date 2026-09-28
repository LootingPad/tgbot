"""Overlay 'Season …' text left of the trophy on leaderboard banner."""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "assets" / "leaderbaord.png"
OUT_DIR = ROOT / "assets" / "generated"
FONT_PATH = ROOT / "assets" / "fonts" / "PlusJakartaSans-Bold.ttf"
MAX_WIDTH = 1280  # Telegram-friendly; faster encode + upload


def pick_font(size: int) -> ImageFont.ImageFont:
    if FONT_PATH.exists():
        return ImageFont.truetype(str(FONT_PATH), size=size)
    for path in (
        r"C:\Windows\Fonts\seguisb.ttf",
        r"C:\Windows\Fonts\arialbd.ttf",
    ):
        if Path(path).exists():
            return ImageFont.truetype(path, size=size)
    return ImageFont.load_default()


def season_label(raw: str) -> str:
    s = (raw or "").strip()
    if not s or s.lower() in {"none", "null", "—"}:
        return "Season —"
    digits = "".join(ch for ch in s if ch.isdigit())
    if digits:
        return f"Season {digits}"
    return f"Season {s}"


def render(season_id: str, out_path: Path) -> Path:
    base = Image.open(SRC).convert("RGBA")
    w, h = base.size
    if w > MAX_WIDTH:
        nh = int(h * (MAX_WIDTH / w))
        base = base.resize((MAX_WIDTH, nh), Image.Resampling.BILINEAR)
        w, h = base.size

    draw = ImageDraw.Draw(base)

    # --- "Leaderboard" badge (top-left of glass) ---
    badge_font = pick_font(max(22, h // 28))
    badge = "Leaderboard"
    bx = int(w * 0.20)
    by = int(h * 0.275)
    bb = draw.textbbox((bx, by), badge, font=badge_font)
    pad_x, pad_y = 18, 10
    pill = [
        bb[0] - pad_x,
        bb[1] - pad_y,
        bb[2] + pad_x,
        bb[3] + pad_y,
    ]
    draw.rounded_rectangle(
        pill,
        radius=16,
        fill=(12, 12, 12, 210),
        outline=(204, 255, 0, 200),
        width=2,
    )
    draw.text((bx, by), badge, font=badge_font, fill=(255, 255, 255, 255))

    # --- Season label ---
    text = season_label(season_id)
    font = pick_font(max(72, h // 9))
    x = int(w * 0.24)
    y = int(h * 0.40)

    for dx, dy in ((2, 2), (3, 3)):
        draw.text((x + dx, y + dy), text, font=font, fill=(0, 0, 0, 160))
    draw.text((x, y), text, font=font, fill=(255, 255, 255, 255))

    out = base.convert("RGB")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    if out_path.suffix.lower() in {".jpg", ".jpeg"}:
        out.save(out_path, format="JPEG", quality=85, optimize=False)
    else:
        out.save(out_path, format="PNG", optimize=False)
    return out_path


def main() -> None:
    season = sys.argv[1] if len(sys.argv) > 1 else "1"
    dest = Path(sys.argv[2]) if len(sys.argv) > 2 else OUT_DIR / "leaderboard.jpg"
    path = render(season, dest)
    print(path)


if __name__ == "__main__":
    main()
