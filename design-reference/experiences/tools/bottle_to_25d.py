"""
Photo -> 2.5D bottle (prototype pipeline, 18 Oct 2026).

Takes a product photograph and produces what the experience prototypes need to
treat the bottle as an object rather than a picture:

  1. a CUT-OUT: the bottle alone, with its glass made partly see-through where
     the wall showed through it (a small matting step), stood upright and
     cropped — RGBA PNG;
  2. a HEIGHT MAP: how far each pixel stands out of the photo — flat faces with
     rounded edges for a glass body, a rounded profile for a cap — greyscale
     PNG, from which the browser computes normals and relights the glass.

PROTOTYPE ONLY. The outline here is guided by hand (`OUTLINES`, corner points
in the photo). In production the outline comes from a background-removal
model run when a house uploads the photo (an ONNX model on the upload job),
and the same steps 2-4 follow unchanged.

Usage:  python bottle_to_25d.py --check     # draws the outlines over the photos
        python bottle_to_25d.py             # writes the cut-outs and height maps
"""
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[3]
PHOTOS = ROOT / 'apps/web/scripts/mock-photos'
OUT = PHOTOS / 'derived'          # git-ignored, like the photos themselves

# Corner points in the 1000x1250 photographs. `body` and `cap` are polygons;
# `up` is the direction from the body to the cap, so the bottle can be stood up.
OUTLINES = {
    'layl-al-qahira': {
        'body': [(190, 578), (598, 357), (868, 862), (455, 1080)],
        # The cap's base sits ON the shoulder (the body's top edge), with no gap.
        'cap': [(311, 515), (462, 433), (359, 216), (207, 298)],
        'up': (-0.471, -0.882),
    },
    'ward-al-taif': {
        'body': [(462, 600), (606, 600), (606, 962), (600, 968), (468, 968), (462, 962)],
        'cap': [(505, 598), (505, 512), (513, 512), (513, 464), (557, 464), (557, 512), (566, 512), (566, 598)],
        'up': (0.0, -1.0),
    },
    'nakhil': {
        'body': [(260, 868), (472, 664), (650, 800), (650, 845), (458, 1033), (437, 1031), (265, 918)],
        'cap': [(552, 728), (588, 665), (627, 655), (657, 673), (660, 711), (636, 760), (606, 769)],
        # Along the body's side edges: the photo is shot obliquely, so the shoulder
        # is not square to them, and it is the sides that must stand vertical.
        'up': (0.716, -0.698),
        # Frosted and opaque: nothing shows through it, so no glass matting.
        'opaque': True,
    },
}


def polygon_mask(size, points, scale=4):
    """An anti-aliased polygon mask: drawn at 4x, then reduced."""
    w, h = size
    big = Image.new('L', (w * scale, h * scale), 0)
    ImageDraw.Draw(big).polygon([(x * scale, y * scale) for x, y in points], fill=255)
    return np.asarray(big.resize((w, h), Image.LANCZOS), dtype=np.float32) / 255.0


def check():
    for name, outline in OUTLINES.items():
        image = Image.open(PHOTOS / f'{name}.jpg').convert('RGB')
        draw = ImageDraw.Draw(image)
        for part, colour in (('body', (255, 0, 80)), ('cap', (0, 160, 255))):
            pts = outline[part]
            draw.line(pts + [pts[0]], fill=colour, width=2)
        image.save(OUT / f'{name}-outline-check.png')
        print('wrote', OUT / f'{name}-outline-check.png')


def background_estimate(rgb, mask, sigma=28.0):
    """What was behind the bottle: the surroundings, blurred inwards
    (normalised convolution of the pixels OUTSIDE the outline)."""
    outside = (mask < 0.02).astype(np.float32)
    num = np.stack([ndimage.gaussian_filter(rgb[..., c] * outside, sigma) for c in range(3)], -1)
    den = ndimage.gaussian_filter(outside, sigma)[..., None]
    return num / np.maximum(den, 1e-4)


def build(name, outline):
    image = Image.open(PHOTOS / f'{name}.jpg').convert('RGB')
    rgb = np.asarray(image, dtype=np.float32) / 255.0
    body = polygon_mask(image.size, outline['body'])
    cap = polygon_mask(image.size, outline['cap'])
    mask = np.clip(body + cap, 0, 1)

    # --- glass: where the wall showed through, let it show through again.
    bg = background_estimate(rgb, mask)
    diff = np.linalg.norm(rgb - bg, axis=-1)
    glass_alpha = np.clip(0.28 + diff / 0.22, 0.28, 1.0)
    glass_alpha = ndimage.gaussian_filter(glass_alpha, 1.2)
    alpha = mask if outline.get('opaque') else mask * np.where(cap > 0.5, 1.0, glass_alpha)
    # Un-mix the wall from the see-through pixels (the matting equation),
    # so clear glass keeps its own tint rather than the wall's colour.
    a = np.maximum(alpha, 0.05)[..., None]
    fg = np.clip((rgb - (1 - a) * bg) / a, 0, 1)
    fg = np.where(mask[..., None] > 0, fg, rgb)

    # --- height: flat faces with rounded edges; a rounded cap.
    solid = mask > 0.5
    d_body = ndimage.distance_transform_edt(body > 0.5)
    bevel = 26.0
    h_body = np.power(np.clip(d_body / bevel, 0, 1), 0.55)
    # A cap is a cylinder: round ACROSS its axis, straight along it.
    ux, uy = outline['up']
    ys, xs = np.mgrid[0:rgb.shape[0], 0:rgb.shape[1]].astype(np.float32)
    across = xs * (-uy) + ys * ux                       # position perpendicular to `up`
    inside = cap > 0.5
    lo, hi = across[inside].min(), across[inside].max()
    t = np.clip((across - lo) / max(hi - lo, 1) * 2 - 1, -1, 1)
    h_cap = np.sqrt(np.clip(1 - t * t, 0, 1)) * 0.85
    height = np.where(inside, h_cap, h_body) * solid
    height = ndimage.gaussian_filter(height, 1.6)

    # --- stand it up: rotate so `up` points to the top of the image.
    ux, uy = outline['up']
    angle = math.degrees(math.atan2(ux, -uy))      # 0 when already upright
    rgba = np.dstack([fg, alpha])
    cut = Image.fromarray((rgba * 255).astype(np.uint8)).rotate(angle, Image.BICUBIC, expand=True)
    hmap = Image.fromarray((np.clip(height, 0, 1) * 255).astype(np.uint8)).rotate(angle, Image.BICUBIC, expand=True)

    box = cut.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    pad = 24
    box = (max(box[0] - pad, 0), max(box[1] - pad, 0), min(box[2] + pad, cut.width), min(box[3] + pad, cut.height))

    # --- where the cut-out sat in the photograph, so the browser can lay the
    # object exactly over the bottle in the picture before lifting it out.
    # This is PIL's own inverse mapping for rotate(expand=True): output centre
    # to input centre, rotated by -angle.
    a = -math.radians(angle)
    dx, dy = (box[0] + box[2]) / 2 - cut.width / 2, (box[1] + box[3]) / 2 - cut.height / 2
    px = math.cos(a) * dx + math.sin(a) * dy + image.width / 2
    py = -math.sin(a) * dx + math.cos(a) * dy + image.height / 2
    placement = {'centre': [round(px / image.width, 4), round(py / image.height, 4)],
                 'height': round((box[3] - box[1]) / image.height, 4), 'angle': round(-angle, 2)}

    cut, hmap = cut.crop(box), hmap.crop(box)
    cut.save(OUT / f'{name}-cutout.png', optimize=True)
    hmap.filter(ImageFilter.GaussianBlur(0.6)).save(OUT / f'{name}-height.png', optimize=True)
    print(f'{name}: rotated {angle:.1f} deg, cut-out {cut.size}, placement {placement}')
    return placement


if __name__ == '__main__':
    OUT.mkdir(exist_ok=True)
    if '--check' in sys.argv:
        check()
    else:
        placements = {n: build(n, o) for n, o in OUTLINES.items()}
        (OUT / 'placements.json').write_text(json.dumps(placements, indent=2))
