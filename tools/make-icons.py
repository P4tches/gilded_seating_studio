#!/usr/bin/env python3
"""Generate the Gilded app icons (no external dependencies)."""
import math, struct, zlib, os

SIZE = 1024
OUT = os.path.join(os.path.dirname(__file__), "..", "icons")
os.makedirs(OUT, exist_ok=True)

# ---------- tiny PNG writer ----------
def png_bytes(rgba, w, h):
    raw = bytearray()
    stride = w * 4
    for y in range(h):
        raw.append(0)
        raw.extend(rgba[y * stride:(y + 1) * stride])
    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        c += struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff)
        return c
    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
            + chunk(b"IEND", b""))

def save(name, rgba, size=512):
    """Box-filter downscale from SIZE to `size`."""
    factor = SIZE // size
    out = bytearray(size * size * 4)
    for y in range(size):
        for x in range(size):
            r = g = b = a = 0
            for yy in range(factor):
                row = (y * factor + yy) * SIZE
                for xx in range(factor):
                    i = (row + x * factor + xx) * 4
                    r += rgba[i]; g += rgba[i+1]; b += rgba[i+2]; a += rgba[i+3]
            n = factor * factor
            o = (y * size + x) * 4
            out[o] = r // n; out[o+1] = g // n; out[o+2] = b // n; out[o+3] = a // n
    with open(os.path.join(OUT, name), "wb") as f:
        f.write(png_bytes(out, size, size))
    print("wrote", name, size)

def clamp(v, lo=0.0, hi=255.0):
    return lo if v < lo else hi if v > hi else v

def blend(dst, i, r, g, b, alpha):
    if alpha <= 0:
        return
    ia = 1.0 - alpha
    dst[i]   = int(dst[i] * ia + r * alpha)
    dst[i+1] = int(dst[i+1] * ia + g * alpha)
    dst[i+2] = int(dst[i+2] * ia + b * alpha)
    dst[i+3] = int(dst[i+3] * ia + 255 * alpha)

def mix(c1, c2, t):
    return tuple(c1[k] + (c2[k] - c1[k]) * t for k in range(3))

def rounded_sdf(x, y, cx, cy, hw, hh, rad):
    qx = abs(x - cx) - (hw - rad)
    qy = abs(y - cy) - (hh - rad)
    ax, ay = max(qx, 0.0), max(qy, 0.0)
    return math.hypot(ax, ay) + min(max(qx, qy), 0.0) - rad

def smooth(d):
    # 1px antialias band
    return clamp(0.5 - d, 0.0, 1.0)

def draw_round_rect(dst, cx, cy, hw, hh, rad, color, alpha=1.0):
    x0 = max(0, int(cx - hw - 2)); x1 = min(SIZE, int(cx + hw + 3))
    y0 = max(0, int(cy - hh - 2)); y1 = min(SIZE, int(cy + hh + 3))
    for y in range(y0, y1):
        for x in range(x0, x1):
            d = rounded_sdf(x, y, cx, cy, hw, hh, rad)
            a = smooth(d) * alpha
            if a > 0:
                blend(dst, (y * SIZE + x) * 4, *color, a)

def draw_circle(dst, cx, cy, r, color, alpha=1.0):
    x0 = max(0, int(cx - r - 2)); x1 = min(SIZE, int(cx + r + 3))
    y0 = max(0, int(cy - r - 2)); y1 = min(SIZE, int(cy + r + 3))
    for y in range(y0, y1):
        for x in range(x0, x1):
            d = math.hypot(x - cx, y - cy) - r
            a = smooth(d) * alpha
            if a > 0:
                blend(dst, (y * SIZE + x) * 4, *color, a)

def draw_capsule(dst, x1, y1, x2, y2, width, color_fn, alpha=1.0):
    rr = width * 0.5
    x0 = max(0, int(min(x1, x2) - rr - 2)); xm = min(SIZE, int(max(x1, x2) + rr + 3))
    y0 = max(0, int(min(y1, y2) - rr - 2)); ym = min(SIZE, int(max(y1, y2) + rr + 3))
    dx, dy = x2 - x1, y2 - y1
    ln = dx * dx + dy * dy
    for y in range(y0, ym):
        for x in range(x0, xm):
            t = 0.0 if ln == 0 else max(0.0, min(1.0, ((x - x1) * dx + (y - y1) * dy) / ln))
            d = math.hypot(x - (x1 + t * dx), y - (y1 + t * dy)) - rr
            a = smooth(d) * alpha
            if a > 0:
                blend(dst, (y * SIZE + x) * 4, *color_fn(x, y), a)

def draw_arc(dst, cx, cy, r, width, y_limit, color_fn, alpha=1.0):
    rr = width * 0.5
    x0 = max(0, int(cx - r - rr - 2)); x1 = min(SIZE, int(cx + r + rr + 3))
    y0 = max(0, int(cy - r - rr - 2)); y1 = min(SIZE, int(y_limit + rr + 3))
    for y in range(y0, y1):
        for x in range(x0, x1):
            if y > y_limit:
                continue
            d = abs(math.hypot(x - cx, y - cy) - r) - rr
            a = smooth(d) * alpha
            if a > 0:
                blend(dst, (y * SIZE + x) * 4, *color_fn(x, y), a)

GOLD_LIGHT = (244, 219, 160)
GOLD = (201, 161, 92)
GOLD_DARK = (133, 95, 43)

def gold(x, y):
    t = (x / SIZE * 0.55 + y / SIZE * 0.45)
    if t < 0.45:
        return mix(GOLD_LIGHT, GOLD, t / 0.45)
    return mix(GOLD, GOLD_DARK, min(1.0, (t - 0.45) / 0.55))

def render(full_bleed=False, content_scale=1.0, rounded=True):
    dst = bytearray(SIZE * SIZE * 4)
    # background: deep warm charcoal with a soft centre glow
    for y in range(SIZE):
        ny = y / SIZE
        for x in range(SIZE):
            nx = x / SIZE
            base = mix((36, 29, 22), (13, 11, 9), min(1.0, (nx * 0.4 + ny * 0.8)))
            glow = max(0.0, 1.0 - math.hypot(nx - 0.5, ny - 0.42) * 1.9)
            base = mix(base, (78, 58, 33), glow * 0.34)
            d = rounded_sdf(x, y, SIZE/2, SIZE/2, SIZE/2, SIZE/2, 0.22 * SIZE if rounded and not full_bleed else 0)
            a = 1.0 if full_bleed else smooth(d)
            i = (y * SIZE + x) * 4
            dst[i] = int(base[0]); dst[i+1] = int(base[1]); dst[i+2] = int(base[2]); dst[i+3] = int(a * 255)

    def P(v):  # design coordinate (512-space) to canvas
        return SIZE/2 + (v - 256) * (SIZE / 512) * content_scale

    def U(v):
        return v * (SIZE / 512) * content_scale

    cx = P(256)
    # subtle inner border
    draw_round_rect(dst, SIZE/2, SIZE/2, U(236), U(236), U(88), GOLD, 0.20)
    draw_round_rect(dst, SIZE/2, SIZE/2, U(228), U(228), U(82), (0, 0, 0), 0.0)

    r = U(138)
    arch_cy = P(250)
    top = arch_cy - r
    bottom = P(430)
    # main arch frame
    draw_capsule(dst, P(118), bottom, P(118), arch_cy, U(22), gold)
    draw_capsule(dst, P(394), bottom, P(394), arch_cy, U(22), gold)
    draw_arc(dst, cx, arch_cy, r, U(22), arch_cy, gold)
    # inner hairline
    draw_capsule(dst, P(136), bottom, P(136), arch_cy, U(4), lambda x, y: GOLD_LIGHT, 0.55)
    draw_capsule(dst, P(376), bottom, P(376), arch_cy, U(4), lambda x, y: GOLD_LIGHT, 0.55)
    draw_arc(dst, cx, arch_cy, r - U(18), U(4), arch_cy, lambda x, y: GOLD_LIGHT, 0.55)

    # card shadow + card
    draw_round_rect(dst, P(256) + U(2), P(320) + U(8), U(72), U(78), U(5), (0, 0, 0), 0.28)
    draw_round_rect(dst, P(256), P(318), U(72), U(78), U(5), (249, 243, 231), 1.0)
    # label flourish
    draw_capsule(dst, P(224), P(282), P(262), P(282), U(3.2), lambda x, y: (95, 74, 44))
    draw_capsule(dst, P(266), P(281), P(288), P(278), U(2.6), lambda x, y: (95, 74, 44))
    draw_capsule(dst, P(212), P(300), P(300), P(300), U(1.6), lambda x, y: (196, 176, 140))
    # guest lines
    lens = [64, 52, 58, 46, 60]
    for i, L in enumerate(lens):
        yy = P(320 + i * 15)
        draw_capsule(dst, P(256 - L/2), yy, P(256 + L/2), yy, U(2.0), lambda x, y: (128, 117, 100))
    # pin
    draw_circle(dst, P(256), P(248), U(15), GOLD_DARK, 0.55)
    draw_circle(dst, P(256), P(245), U(14), GOLD_LIGHT, 1.0)
    draw_circle(dst, P(256), P(245), U(8), GOLD, 1.0)
    draw_circle(dst, P(252), P(241), U(3), (255, 248, 228), 0.85)

    # crest dots
    for dx, rad, yy in [(0, 9, 78), (-24, 5.5, 86), (24, 5.5, 86)]:
        draw_circle(dst, P(256 + dx), P(yy), U(rad), gold(P(256 + dx), P(yy)))

    # bottom diamond
    for t in range(9):
        draw_capsule(dst, P(256), P(444 + t * 3), P(256), P(447 + t * 3), U(2.2), gold, 0.9)
    return dst

base = render(full_bleed=False, content_scale=1.0, rounded=True)
save("icon-512.png", base, 512)
save("icon-192.png", base, 192)
save("apple-touch-icon.png", render(full_bleed=True, content_scale=0.92, rounded=False), 180)

mask = render(full_bleed=True, content_scale=0.80, rounded=False)
save("maskable-512.png", mask, 512)
save("favicon-32.png", base, 32)
save("favicon-16.png", base, 16)

# simple SVG favicon with the same arch + card
svg = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect width="64" height="64" rx="14" fill="#171310"/>
<path d="M12 55V33a20 20 0 0 1 40 0v22" fill="none" stroke="#d8b873" stroke-width="3"/>
<path d="M16 55V33a16 16 0 0 1 32 0v22" fill="none" stroke="#f4dba0" stroke-width=".7" opacity=".6"/>
<rect x="24" y="27" width="16" height="21" rx="1.2" fill="#f7f0e1"/>
<path d="M27 32h8M27 35h10M27 38h8M27 41h10M27 44h7" stroke="#8c7a60" stroke-width="1.1" stroke-linecap="round"/>
<circle cx="32" cy="26" r="3.4" fill="#e6c98e" stroke="#8a6a34" stroke-width="1"/>
</svg>'''
with open(os.path.join(OUT, "favicon.svg"), "w") as f:
    f.write(svg)
print("wrote favicon.svg")
