"""
Génère les icônes PWA (PNG) nécessaires pour iOS et Android.
Usage : python generate_icons.py
"""
from PIL import Image, ImageDraw, ImageFont
import os

OUTPUT_DIR = os.path.dirname(__file__)

BG_COLOR   = (7, 9, 15)       # #07090f
GREEN      = (0, 230, 118)    # #00e676
TEXT_COLOR = (232, 240, 255)  # #e8f0ff

SIZES = {
    "icon-192.png":          192,
    "icon-512.png":          512,
    "icon-maskable-192.png": 192,
    "icon-maskable-512.png": 512,
    "icon-180.png":          180,   # Apple Touch Icon
    "icon-167.png":          167,   # iPad Pro
    "icon-152.png":          152,   # iPad
    "icon-120.png":          120,   # iPhone retina
}

def draw_icon(size: int, maskable: bool = False) -> Image.Image:
    img  = Image.new("RGBA", (size, size), BG_COLOR + (255,))
    draw = ImageDraw.Draw(img)

    padding = size * 0.1 if maskable else 0

    # Fond vert arrondi (cercle central)
    r = int((size - padding * 2) * 0.38)
    cx, cy = size // 2, size // 2
    draw.ellipse(
        [cx - r, cy - r - size * 0.05, cx + r, cy + r - size * 0.05],
        fill=GREEN
    )

    # Lettre "C" stylisée
    font_size = int(size * 0.30)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", font_size)
    except Exception:
        font = ImageFont.load_default()

    text = "C"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw   = bbox[2] - bbox[0]
    th   = bbox[3] - bbox[1]
    draw.text(
        (cx - tw // 2, cy - th // 2 - size * 0.05),
        text, fill=BG_COLOR, font=font
    )

    # Sous-texte "kcal"
    sub_size = int(size * 0.09)
    try:
        sub_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", sub_size)
    except Exception:
        sub_font = ImageFont.load_default()
    sub_text = "kcal"
    sub_bbox = draw.textbbox((0, 0), sub_text, font=sub_font)
    sw = sub_bbox[2] - sub_bbox[0]
    draw.text(
        (cx - sw // 2, cy + r * 0.5),
        sub_text, fill=(*GREEN, 200), font=sub_font
    )

    return img


if __name__ == "__main__":
    for filename, size in SIZES.items():
        maskable = "maskable" in filename
        img = draw_icon(size, maskable)
        path = os.path.join(OUTPUT_DIR, filename)
        img.save(path, "PNG")
        print(f"✅ {filename} ({size}×{size})")
    print("\nIcones générées dans", OUTPUT_DIR)
