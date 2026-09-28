"""
Render LOOTING command cards on assets/image/example/backgound.jpg
Kinds: stats | hot | help | leaderboard
Payload JSON via argv[2], output path argv[3].
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
BG = ROOT / "assets" / "image" / "example" / "backgound.jpg"
FONT_BOLD = ROOT / "assets" / "fonts" / "PlusJakartaSans-Bold.ttf"
FONT_XBOLD = ROOT / "assets" / "fonts" / "PlusJakartaSans-ExtraBold.ttf"
FONT_REG = ROOT / "assets" / "fonts" / "PlusJakartaSans-Regular.ttf"

W = H = 1000
PAD_X = 68
TITLE_Y = 228
TITLE_SIZE = 104
TITLE_LEADING = 106
STAT_Y = 520
STAT_VALUE_SIZE = 56
STAT_LABEL_SIZE = 24
DASH_TOP = 707
DASH_BOT = 886
CENTER_SIZE = 74
FOOTER_Y = 958
FOOTER_SIZE = 22
INK = (26, 26, 26)
WHITE = (255, 255, 255)

# Stats grid fills the lime panel (no Season banner)
GRID_TOP = 510
GRID_BOTTOM = 920
GRID_COLS = 3


def font(path: Path, size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    if path.exists():
        return ImageFont.truetype(str(path), size=size)
    return ImageFont.load_default()


def draw_title(draw: ImageDraw.ImageDraw, lines: list[str]) -> None:
    f = font(FONT_XBOLD if FONT_XBOLD.exists() else FONT_BOLD, TITLE_SIZE)
    y = TITLE_Y
    for line in lines[:2]:
        draw.text((PAD_X, y), line, font=f, fill=WHITE)
        y += TITLE_LEADING


def draw_stat_pair(
    draw: ImageDraw.ImageDraw,
    left: dict,
    right: dict,
    y: int = STAT_Y,
    value_size: int = STAT_VALUE_SIZE,
    label_size: int = STAT_LABEL_SIZE,
    label_gap: int = 72,
) -> None:
    fv = font(FONT_BOLD, value_size)
    fl = font(FONT_REG, label_size)

    draw.text((PAD_X, y), str(left.get("value", "—")), font=fv, fill=INK)
    draw.text((PAD_X, y + label_gap), str(left.get("label", "")), font=fl, fill=INK)

    rv = str(right.get("value", "—"))
    rl = str(right.get("label", ""))
    rb = draw.textbbox((0, 0), rv, font=fv)
    lb = draw.textbbox((0, 0), rl, font=fl)
    rx = W - PAD_X - (rb[2] - rb[0])
    lx = W - PAD_X - (lb[2] - lb[0])
    draw.text((rx, y), rv, font=fv, fill=INK)
    draw.text((lx, y + label_gap), rl, font=fl, fill=INK)


def draw_center(draw: ImageDraw.ImageDraw, text: str) -> None:
    f = font(FONT_XBOLD if FONT_XBOLD.exists() else FONT_BOLD, CENTER_SIZE)
    mid = (DASH_TOP + DASH_BOT) // 2 - 10
    draw.text((W // 2, mid), text, font=f, fill=INK, anchor="mm")


def draw_footer(draw: ImageDraw.ImageDraw, text: str = "www.lootingpad.com") -> None:
    f = font(FONT_REG, FOOTER_SIZE)
    bb = draw.textbbox((0, 0), text, font=f)
    tw = bb[2] - bb[0]
    draw.text(((W - tw) // 2, FOOTER_Y), text, font=f, fill=INK)


def draw_note(draw: ImageDraw.ImageDraw, text: str) -> None:
    """Info line above the website footer."""
    f = font(FONT_REG, 18)
    draw.text((W // 2, FOOTER_Y - 36), text, font=f, fill=INK, anchor="mm")


def cover_dashed_lines(img: Image.Image) -> None:
    """Hide background dashed lines so stats grid is readable."""
    green = (179, 224, 1)
    d = ImageDraw.Draw(img)
    # Cover both dash bands across the lime panel
    d.rectangle([48, DASH_TOP - 8, W - 48, DASH_TOP + 8], fill=green)
    d.rectangle([48, DASH_BOT - 8, W - 48, DASH_BOT + 8], fill=green)


def dashed_hline(
    draw: ImageDraw.ImageDraw,
    y: int,
    x0: int,
    x1: int,
    *,
    dash: int = 10,
    gap: int = 8,
    fill: tuple[int, int, int] = (40, 40, 40),
    width: int = 2,
) -> None:
    x = x0
    while x < x1:
        draw.line([(x, y), (min(x + dash, x1), y)], fill=fill, width=width)
        x += dash + gap


def dashed_vline(
    draw: ImageDraw.ImageDraw,
    x: int,
    y0: int,
    y1: int,
    *,
    dash: int = 10,
    gap: int = 8,
    fill: tuple[int, int, int] = (40, 40, 40),
    width: int = 2,
) -> None:
    y = y0
    while y < y1:
        draw.line([(x, y), (x, min(y + dash, y1))], fill=fill, width=width)
        y += dash + gap


def draw_metrics_grid(draw: ImageDraw.ImageDraw, metrics: list[dict]) -> None:
    """Uniform 3-column grid of value+label cells across the green panel."""
    items = [m for m in metrics if m][:15]
    if not items:
        return
    cols = GRID_COLS
    rows = (len(items) + cols - 1) // cols
    usable_w = W - PAD_X * 2
    col_w = usable_w / cols
    usable_h = GRID_BOTTOM - GRID_TOP
    row_h = usable_h / max(rows, 1)

    # Grid separators (dashed) — between columns & rows
    grid_ink = (45, 45, 45)
    x0, x1 = PAD_X, W - PAD_X
    y0, y1 = GRID_TOP + 8, GRID_BOTTOM - 8
    for c in range(1, cols):
        dashed_vline(draw, int(PAD_X + col_w * c), y0, y1, fill=grid_ink)
    for r in range(1, rows):
        dashed_hline(draw, int(GRID_TOP + row_h * r), x0, x1, fill=grid_ink)

    value_size = 44 if rows <= 3 else 36
    label_size = 20 if rows <= 3 else 17
    fv = font(FONT_BOLD, value_size)
    fl = font(FONT_REG, label_size)

    for i, m in enumerate(items):
        r, c = divmod(i, cols)
        cx = PAD_X + col_w * c + col_w / 2
        cy = GRID_TOP + row_h * r + row_h / 2
        val = str(m.get("value", "—"))
        lab = str(m.get("label", ""))
        draw.text((cx, cy - 14), val, font=fv, fill=INK, anchor="mm")
        draw.text((cx, cy + 22), lab, font=fl, fill=INK, anchor="mm")


def draw_hot_rows(draw: ImageDraw.ImageDraw, rows: list[dict]) -> None:
    """Top-3 hot tokens as clean ranked rows across the green panel."""
    items = [r for r in rows if r][:3]
    if not items:
        f = font(FONT_BOLD, 36)
        draw.text((W // 2, (GRID_TOP + GRID_BOTTOM) // 2), "No hot tokens yet", font=f, fill=INK, anchor="mm")
        return

    top = 520
    bottom = 900
    band = (bottom - top) / 3
    rank_f = font(FONT_XBOLD if FONT_XBOLD.exists() else FONT_BOLD, 42)
    sym_f = font(FONT_XBOLD if FONT_XBOLD.exists() else FONT_BOLD, 40)
    meta_f = font(FONT_REG, 22)

    # Dashed separators between token rows (not through text)
    for i in range(1, 3):
        y = int(top + band * i)
        x = PAD_X
        while x < W - PAD_X:
            draw.line([(x, y), (min(x + 10, W - PAD_X), y)], fill=(40, 40, 40), width=2)
            x += 18

    for i, row in enumerate(items):
        cy = top + band * i + band / 2
        rank = str(row.get("rank", i + 1))
        sym = str(row.get("symbol", "—"))
        vol = str(row.get("volume", "—"))
        change = str(row.get("change", ""))

        draw.text((PAD_X, cy), f"#{rank}", font=rank_f, fill=INK, anchor="lm")
        draw.text((PAD_X + 90, cy), sym, font=sym_f, fill=INK, anchor="lm")

        right = vol if not change else f"{vol}  {change}"
        draw.text((W - PAD_X, cy), right, font=meta_f, fill=INK, anchor="rm")


def draw_help_rows(draw: ImageDraw.ImageDraw, rows: list[dict]) -> None:
    """Command list with dashed separators — aligned with Hot card style."""
    items = [r for r in rows if r][:6]
    if not items:
        return

    top = 520
    bottom = 900
    band = (bottom - top) / max(len(items), 1)
    cmd_f = font(FONT_XBOLD if FONT_XBOLD.exists() else FONT_BOLD, 34)
    desc_f = font(FONT_REG, 20)

    for i in range(1, len(items)):
        y = int(top + band * i)
        x = PAD_X
        while x < W - PAD_X:
            draw.line([(x, y), (min(x + 10, W - PAD_X), y)], fill=(40, 40, 40), width=2)
            x += 18

    for i, row in enumerate(items):
        cy = top + band * i + band / 2
        cmd = str(row.get("command", ""))
        desc = str(row.get("description", ""))
        draw.text((PAD_X, cy), cmd, font=cmd_f, fill=INK, anchor="lm")
        draw.text((W - PAD_X, cy), desc, font=desc_f, fill=INK, anchor="rm")


def render(payload: dict, out_path: Path) -> Path:
    base = Image.open(BG).convert("RGB").resize((W, H), Image.Resampling.LANCZOS)
    draw = ImageDraw.Draw(base)

    title = payload.get("title") or ["LOOTING"]
    if isinstance(title, str):
        title = title.split("\n")
    draw_title(draw, [str(t) for t in title])

    metrics = payload.get("metrics")
    hot_rows = payload.get("hot_rows")
    help_rows = payload.get("help_rows")
    if isinstance(help_rows, list):
        cover_dashed_lines(base)
        draw = ImageDraw.Draw(base)
        draw_help_rows(draw, help_rows)
    elif isinstance(hot_rows, list):
        cover_dashed_lines(base)
        draw = ImageDraw.Draw(base)
        draw_hot_rows(draw, hot_rows)
    elif isinstance(metrics, list) and metrics:
        cover_dashed_lines(base)
        draw = ImageDraw.Draw(base)
        draw_metrics_grid(draw, metrics)
    else:
        left = payload.get("left") or {"value": "—", "label": ""}
        right = payload.get("right") or {"value": "—", "label": ""}
        draw_stat_pair(draw, left, right)

        left2 = payload.get("left2")
        right2 = payload.get("right2")
        if left2 and right2:
            draw_stat_pair(
                draw,
                left2,
                right2,
                y=STAT_Y + 100,
                value_size=36,
                label_size=20,
                label_gap=40,
            )

        center = str(payload.get("center") or "")
        if center:
            draw_center(draw, center)

    note = str(payload.get("note") or "").strip()
    if note:
        draw_note(draw, note)

    draw_footer(draw, str(payload.get("footer") or "www.lootingpad.com"))

    out_path.parent.mkdir(parents=True, exist_ok=True)
    if out_path.suffix.lower() in {".jpg", ".jpeg"}:
        base.save(out_path, format="JPEG", quality=88, optimize=False)
    else:
        base.save(out_path, format="PNG", optimize=False)
    return out_path


def main() -> None:
    kind = sys.argv[1] if len(sys.argv) > 1 else "stats"
    raw = sys.argv[2] if len(sys.argv) > 2 else "{}"
    dest = Path(sys.argv[3]) if len(sys.argv) > 3 else ROOT / "assets" / "generated" / f"{kind}.jpg"
    payload = json.loads(raw)
    payload.setdefault("kind", kind)
    path = render(payload, dest)
    print(path)


if __name__ == "__main__":
    main()
