"""
Render /pnl call card on assets/pnlcall-bg.jpg (1920×1080).
Payload JSON via argv[1], output path argv[2].
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
BG = ROOT / "assets" / "pnlcall-bg.jpg"
FONT_BOLD = ROOT / "assets" / "fonts" / "PlusJakartaSans-Bold.ttf"
FONT_XBOLD = ROOT / "assets" / "fonts" / "PlusJakartaSans-ExtraBold.ttf"
FONT_REG = ROOT / "assets" / "fonts" / "PlusJakartaSans-Regular.ttf"

W, H = 1920, 1080
INK = (20, 20, 20)
MUTED = (55, 55, 55)
LINE = (35, 35, 35)

PAD_L = 200
PAD_R = 120
TOP = 300
BOTTOM = 1000


def font(path: Path, size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    if path.exists():
        return ImageFont.truetype(str(path), size=size)
    return ImageFont.load_default()


def f_xbold(size: int):
    return font(FONT_XBOLD if FONT_XBOLD.exists() else FONT_BOLD, size)


def f_bold(size: int):
    return font(FONT_BOLD, size)


def f_reg(size: int):
    return font(FONT_REG, size)


def dashed_h(
    draw: ImageDraw.ImageDraw,
    y: int,
    x0: int,
    x1: int,
    *,
    dash: int = 14,
    gap: int = 10,
    width: int = 2,
) -> None:
    x = x0
    while x < x1:
        draw.line([(x, y), (min(x + dash, x1), y)], fill=LINE, width=width)
        x += dash + gap


def dashed_v(
    draw: ImageDraw.ImageDraw,
    x: int,
    y0: int,
    y1: int,
    *,
    dash: int = 10,
    gap: int = 8,
    width: int = 2,
) -> None:
    y = y0
    while y < y1:
        draw.line([(x, y), (x, min(y + dash, y1))], fill=LINE, width=width)
        y += dash + gap


def short_addr(addr: str, left: int = 8, right: int = 6) -> str:
    if not addr or len(addr) < left + right + 2:
        return addr or "—"
    return f"{addr[:left]}…{addr[-right:]}"


def fit_text(
    draw: ImageDraw.ImageDraw,
    text: str,
    *,
    max_w: float,
    start_size: int,
    min_size: int = 28,
    bold: bool = True,
) -> ImageFont.ImageFont:
    size = start_size
    while size >= min_size:
        f = f_xbold(size) if bold else f_bold(size)
        bb = draw.textbbox((0, 0), text, font=f)
        if bb[2] - bb[0] <= max_w:
            return f
        size -= 2
    return f_xbold(min_size) if bold else f_bold(min_size)


def draw_col(
    draw: ImageDraw.ImageDraw,
    cx: float,
    y_label: int,
    label: str,
    value: str,
    col_w: float,
) -> None:
    fl = f_reg(24)
    draw.text((cx, y_label), label.upper(), font=fl, fill=MUTED, anchor="mm")

    fv = fit_text(draw, value, max_w=col_w - 40, start_size=52, min_size=26)
    draw.text((cx, y_label + 62), value, font=fv, fill=INK, anchor="mm")


def render(payload: dict, out_path: Path) -> Path:
    base = Image.open(BG).convert("RGB")
    if base.size != (W, H):
        base = base.resize((W, H), Image.Resampling.LANCZOS)
    draw = ImageDraw.Draw(base)

    symbol = str(payload.get("symbol") or "TOKEN")
    name = str(payload.get("name") or "")
    address = str(payload.get("address") or "")
    caller = str(payload.get("caller") or "—")
    called = str(payload.get("called") or "")
    entry = str(payload.get("entry") or "—")
    mid = str(payload.get("mid") or "—")
    mid_label = str(payload.get("mid_label") or "Group")
    ath = str(payload.get("ath") or "—")
    pnl = str(payload.get("pnl") or "—")
    hero = str(payload.get("hero") or pnl)

    x0, x1 = PAD_L, W - PAD_R
    usable = x1 - x0
    left_w = usable * 0.52
    right_w = usable * 0.42

    # ── Left column ──
    draw.text((x0, TOP), "PNL CALL", font=f_bold(24), fill=MUTED, anchor="lt")

    y = TOP + 44
    sym_f = fit_text(draw, symbol, max_w=left_w, start_size=84, min_size=48)
    draw.text((x0, y), symbol, font=sym_f, fill=INK, anchor="lt")

    y += 96
    meta = " · ".join(p for p in (name, short_addr(address) if address else "") if p)
    if meta:
        draw.text((x0, y), meta, font=f_reg(26), fill=MUTED, anchor="lt")
        y += 44

    # ── Right column: caller on top, multiplier under (higher + right-aligned) ──
    call_line = f"{caller}  ·  {called}" if called else caller
    call_f = fit_text(draw, call_line, max_w=right_w, start_size=32, min_size=22, bold=True)
    # Sit level with $SYMBOL row
    call_y = TOP + 48
    draw.text((x1, call_y), call_line, font=call_f, fill=INK, anchor="rt")

    hero_f = fit_text(draw, hero, max_w=right_w, start_size=128, min_size=64)
    draw.text((x1, call_y + 52), hero, font=hero_f, fill=INK, anchor="rt")

    # ── Metrics band (taller for breathing room) ──
    band_top = max(y + 56, TOP + 280)
    dashed_h(draw, band_top, x0, x1)

    col_w = usable / 3
    band_h = 200
    label_y = band_top + 58
    centers = [x0 + col_w * 0.5, x0 + col_w * 1.5, x0 + col_w * 2.5]

    draw_col(draw, centers[0], label_y, "Entry MC", entry, col_w)
    draw_col(draw, centers[1], label_y, mid_label, mid, col_w)
    draw_col(draw, centers[2], label_y, "ATH since call", ath, col_w)

    band_bot = band_top + band_h
    for i in range(1, 3):
        dashed_v(draw, int(x0 + col_w * i), band_top + 18, band_bot - 14)
    dashed_h(draw, band_bot, x0, x1)

    # Bottom area left empty for now

    out_path.parent.mkdir(parents=True, exist_ok=True)
    if out_path.suffix.lower() in {".jpg", ".jpeg"}:
        base.save(out_path, format="JPEG", quality=92, optimize=False)
    else:
        base.save(out_path, format="PNG", optimize=False)
    return out_path


def main() -> None:
    raw = sys.argv[1] if len(sys.argv) > 1 else "{}"
    dest = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "assets" / "generated" / "pnl.jpg"
    path = render(json.loads(raw), dest)
    print(path)


if __name__ == "__main__":
    main()
