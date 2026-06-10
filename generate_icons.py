from PIL import Image, ImageDraw

SIZES = {
    "icons/icon-180.png": 180,   # apple-touch-icon
    "icons/icon-192.png": 192,   # android/manifest
    "icons/icon-512.png": 512,   # manifest splash
    "favicon.png": 64,
}

RED = (238, 28, 36, 255)
WHITE = (255, 255, 255, 255)
BLACK = (30, 30, 30, 255)


def draw_pokeball(size):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    margin = int(size * 0.04)
    box = (margin, margin, size - margin, size - margin)

    # background circle
    draw.ellipse(box, fill=WHITE, outline=BLACK, width=max(2, size // 40))

    # top red half (clip via pieslice)
    draw.pieslice(box, start=180, end=360, fill=RED, outline=BLACK, width=max(2, size // 40))

    # center band
    band_h = max(2, size // 14)
    draw.rectangle((margin, size // 2 - band_h // 2, size - margin, size // 2 + band_h // 2), fill=BLACK)

    # center button
    r = size * 0.16
    cx, cy = size / 2, size / 2
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=WHITE, outline=BLACK, width=max(2, size // 40))
    r2 = size * 0.08
    draw.ellipse((cx - r2, cy - r2, cx + r2, cy + r2), fill=WHITE, outline=BLACK, width=max(2, size // 60))

    return img


for path, size in SIZES.items():
    img = draw_pokeball(size)
    img.save(path)
    print(f"wrote {path} ({size}x{size})")
