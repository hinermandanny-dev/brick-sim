"""Ground-cover classes from the NJ 2020 orthophoto (ortho.jpg, 1 m local grid; see fetch_ortho.py).
The 2020 flight is leaf-off (early spring): woods read brown-grey and TEXTURED, lawns dull green or straw and SMOOTH,
pavement grey and smooth, roofs bright. Local texture (5 m luminance std) separates woods from lawns and lots.
classes: 0 unknown, 1 paved, 2 grass, 3 woods, 4 water, 5 sand, 6 bare dirt, 7 roof/bright concrete"""
import numpy as np
from PIL import Image
PALETTE = {0: (0, 0, 0), 1: (88, 88, 90), 2: (134, 161, 87), 3: (93, 104, 60), 4: (61, 106, 132), 5: (226, 211, 166), 6: (156, 138, 104), 7: (150, 148, 140)}
def box(a, r):  # mean over a (2r+1)^2 window, same shape
    c = np.cumsum(np.cumsum(np.pad(a, ((r + 1, r), (r + 1, r)), mode="edge"), 0), 1)
    k = 2 * r + 1
    return (c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]) / (k * k)
def classify(rgb):
    f = rgb.astype(np.float32); r, g, b = f[..., 0], f[..., 1], f[..., 2]
    mx = f.max(-1); mn = f.min(-1); sat = (mx - mn) / np.maximum(mx, 1); lum = .3 * r + .59 * g + .11 * b
    sd = np.sqrt(np.maximum(box(lum * lum, 4) - box(lum, 4) ** 2, 0))  # 9 m luminance texture
    smooth = sd < 10.5
    c = np.full(r.shape, 1, np.uint8)                                   # default: paved (grey)
    c[(sd >= 10.5) & (lum < 140)] = 3                                      # textured and not bright: leaf-off woods
    c[smooth & (lum < 75) & (sat >= .06)] = 3                          # deep shade under leaf-off canopy (not a lot)
    c[smooth & ((g - r >= 8) | ((r - b >= 13) & (sat >= .12)))] = 2     # smooth green or straw: lawn / field
    c[(lum > 200) & (sat < .12)] = 7                                    # bright roofs / concrete
    c[(lum > 165) & (r > g) & (g > b + 8) & (sat > .14) & (sat < .45) & smooth] = 5  # bright warm smooth: sand
    c[(r > g + 8) & (sat > .22) & (lum > 100) & (lum <= 165) & smooth] = 6           # tan: bare dirt / infields
    c[(b > r + 8) & (lum < 115) & (sd < 7)] = 4                         # dark, blue-leaning, smooth: water
    return c
def majority(c, r=3, n=8):  # mode filter: each pixel takes the most common class in its window (removes cars, shadows)
    best = np.zeros(c.shape, np.float32) - 1; out = np.zeros_like(c)
    for k in range(n):
        m = box((c == k).astype(np.float32), r); w = m > best; out[w] = k; best[w] = m[w]
    return out
def to_png(c, path):
    im = Image.fromarray(c, "P"); pal = []
    for k in range(256): pal += list(PALETTE.get(k, (0, 0, 0)))
    im.putpalette(pal); im.save(path, optimize=True, transparency=0)
if __name__ == "__main__":
    import sys
    a = np.asarray(Image.open(sys.argv[1]).convert("RGB")); c = majority(classify(a))
    pal = np.array([PALETTE[k] for k in range(8)], np.uint8); Image.fromarray(np.concatenate([a, pal[c]], 1)).save(sys.argv[2])
    print({k: round(float((c == k).mean()), 3) for k in range(8)})
