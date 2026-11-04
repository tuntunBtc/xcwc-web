"""Build source-pixel foot masks without changing character artwork.

Run normally to regenerate src/nest/foot-hit-areas.json; --check is read-only.
Each mask is a row-major bitset, least-significant bit first within each byte.
Only alpha >= 64 pixels inside a manually reviewed foot ellipse can be set.
The belly pose additionally requires the reviewed orange-foot RGB predicate,
because its feet overlap the opaque cream belly rather than transparent air.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import math
from pathlib import Path
import sys

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "src/nest/foot-hit-areas.json"
ALPHA_THRESHOLD = 64
CANVAS = (640, 580)

# Pixel ellipses (center_x, center_y, radius_x, radius_y), reviewed on the
# complete 640 x 580 source canvas. Conservative foot regions exclude belly,
# wings and surrounding symbols. The renderer maps thirsty to happy artwork.
DEFAULT_FEET = {
    "happy": [(207, 525, 52, 21), (411, 525, 53, 22)],
    "hungry": [],  # Approved v2 prone pose has no visible feet.
    "unwell": [],  # Prone pose: no visible feet.
    "puzzled": [(211, 527, 46, 19), (367, 534, 43, 15)],
    "angry": [(198, 528, 55, 22), (443, 527, 54, 23)],
    "crying": [(249, 529, 47, 20), (430, 528, 45, 19)],
    "belly": [(146, 389, 51, 48), (338, 433, 51, 47)],
}
# Reviewed on belly-v1.webp: the toe/pad samples have R-G 77..89 and G-B
# 104..120, while adjacent opaque cream samples have R-G 26/39 and G-B 28/46.
# Both color differences are required, within the two reviewed foot ellipses.
BELLY_RGB_PREDICATE = {"minRed": 120, "minRedMinusGreen": 45, "minGreenMinusBlue": 45}
BELLY_POSITIVE_POINTS = [(116, 375), (154, 361), (176, 389), (141, 415),
                         (307, 416), (347, 407), (369, 436), (331, 459)]
BELLY_OPAQUE_NEGATIVE_POINTS = [(180, 360), (320, 400)]
# angry-v2 has three low toes per foot, with the cream belly just above them.
# These ellipses contain orange foot pixels only; body pixels remain outside.
ANGRY_TOE_POINTS = [(164, 519), (196, 534), (232, 534),
                    (409, 534), (448, 532), (480, 519)]
ANGRY_BODY_NEGATIVE_POINTS = [(218, 500), (320, 520)]
COMMON_OUTFIT_FEET = [(218, 500, 50, 18), (410, 500, 50, 18)]
OUTFIT_FEET = {
    name: COMMON_OUTFIT_FEET
    for name in ("osmanthus", "peach", "bamboo", "sakura", "scholar", "moon", "jade")
}
# The staff ends next to the pilgrim's left foot; keep this ellipse narrower.
OUTFIT_FEET["pilgrim"] = [(239, 503, 31, 16), (410, 503, 49, 16)]


def source_jobs():
    for name, ellipses in DEFAULT_FEET.items():
        filename = {"hungry": "hungry-v2", "angry": "angry-v2", "belly": "belly-v1"}.get(name, name)
        yield name, f"assets/nest/felt/emotions/{filename}.webp", ellipses
    for name, ellipses in OUTFIT_FEET.items():
        yield f"huangying_{name}", f"assets/wardrobe/huangying/{name}-640.webp", ellipses


def inside_ellipse(px: int, py: int, ellipse) -> bool:
    cx, cy, rx, ry = ellipse
    # Membership is evaluated at the source pixel's center, not its top-left.
    return ((px + 0.5 - cx) / rx) ** 2 + ((py + 0.5 - cy) / ry) ** 2 <= 1


def matches_rgb(pixel, predicate) -> bool:
    if predicate is None:
        return True
    red, green, blue = pixel[:3]
    return (red >= predicate["minRed"]
            and red - green >= predicate["minRedMinusGreen"]
            and green - blue >= predicate["minGreenMinusBlue"])


def pack_mask(alpha: Image.Image, ellipse, rgba: Image.Image, predicate=None) -> dict:
    cx, cy, rx, ry = ellipse
    x = max(0, math.floor(cx - rx))
    y = max(0, math.floor(cy - ry))
    right = min(alpha.width, math.ceil(cx + rx))
    bottom = min(alpha.height, math.ceil(cy + ry))
    width, height = right - x, bottom - y
    if width <= 0 or height <= 0:
        raise ValueError(f"Empty foot ellipse: {ellipse}")
    bits = bytearray((width * height + 7) // 8)
    pixels, colors = alpha.load(), rgba.load()
    for py in range(y, bottom):
        for px in range(x, right):
            if (pixels[px, py] >= ALPHA_THRESHOLD and inside_ellipse(px, py, ellipse)
                    and matches_rgb(colors[px, py], predicate)):
                index = (py - y) * width + (px - x)
                bits[index >> 3] |= 1 << (index & 7)
    return {"x": x, "y": y, "width": width, "height": height,
            "bits": base64.b64encode(bits).decode("ascii")}


def mask_hit(mask: dict, px: int, py: int) -> bool:
    dx, dy = px - mask["x"], py - mask["y"]
    if not (0 <= dx < mask["width"] and 0 <= dy < mask["height"]):
        return False
    index = dy * mask["width"] + dx
    bits = base64.b64decode(mask["bits"], validate=True)
    return bool(bits[index >> 3] & (1 << (index & 7)))


def area_hit(area: dict, px: int, py: int) -> bool:
    return any(mask_hit(mask, px, py) for mask in area["masks"])


def validate_area(name: str, area: dict, alpha: Image.Image, rgba: Image.Image, ellipses) -> dict:
    """Exhaustively verify bit packing and record concrete positive/negative points."""
    pixels, colors = alpha.load(), rgba.load()
    predicate = area.get("rgbPredicate")
    centers, transparent_gaps = [], []
    if len(area["masks"]) != len(ellipses):
        raise ValueError(f"{name}: foot mask count does not match reviewed ellipses")
    for mask, ellipse in zip(area["masks"], ellipses):
        cx, cy, _, _ = ellipse
        if not mask_hit(mask, cx, cy):
            raise ValueError(f"{name}: reviewed foot center does not hit: {(cx, cy)}")
        centers.append([cx, cy])
        gap = None
        for py in range(mask["y"], mask["y"] + mask["height"]):
            for px in range(mask["x"], mask["x"] + mask["width"]):
                expected = (pixels[px, py] >= ALPHA_THRESHOLD and inside_ellipse(px, py, ellipse)
                            and matches_rgb(colors[px, py], predicate))
                if mask_hit(mask, px, py) != expected:
                    raise ValueError(f"{name}: incorrect mask bit at {(px, py)}")
                if gap is None and inside_ellipse(px, py, ellipse) and pixels[px, py] < ALPHA_THRESHOLD:
                    gap = [px, py]
        if gap is None and name != "belly":
            raise ValueError(f"{name}: expected a transparent foot-edge/gap test point")
        if gap is not None and area_hit(area, *gap):
            raise ValueError(f"{name}: transparent foot gap incorrectly hits: {gap}")
        if gap is not None:
            transparent_gaps.append(gap)
    if name == "belly":
        for point in BELLY_POSITIVE_POINTS:
            if not area_hit(area, *point):
                raise ValueError(f"belly: reviewed toe/pad does not hit: {point}")
        for point, ellipse in zip(BELLY_OPAQUE_NEGATIVE_POINTS, ellipses):
            if pixels[point] < ALPHA_THRESHOLD or not inside_ellipse(*point, ellipse):
                raise ValueError(f"belly: negative point must be opaque and inside its foot ellipse: {point}")
            if area_hit(area, *point):
                raise ValueError(f"belly: adjacent opaque cream belly incorrectly hits: {point}")
    if name == "angry":
        for point in ANGRY_TOE_POINTS:
            if not area_hit(area, *point):
                raise ValueError(f"angry: reviewed toe does not hit: {point}")
        for point in ANGRY_BODY_NEGATIVE_POINTS:
            if pixels[point] < ALPHA_THRESHOLD or area_hit(area, *point):
                raise ValueError(f"angry: opaque cream belly must not hit: {point}")
    for point in [(320, 400), (0, 0), (320, 579), (-1, 0), (640, 580)]:
        if area_hit(area, *point):
            raise ValueError(f"{name}: body/background/out-of-canvas point incorrectly hits: {point}")
    if not ellipses and area["masks"]:
        raise ValueError(f"{name}: prone pose must not have a foot mask")
    result = {"id": name, "footCentersHit": centers,
              "transparentGapsRejected": transparent_gaps, "bodyRejected": [320, 400]}
    if name == "belly":
        result.update({"toesAndPadsHit": BELLY_POSITIVE_POINTS,
                       "opaqueCreamBellyRejected": BELLY_OPAQUE_NEGATIVE_POINTS})
    if name == "angry":
        result.update({"toesHit": ANGRY_TOE_POINTS,
                       "opaqueCreamBellyRejected": ANGRY_BODY_NEGATIVE_POINTS})
    return result


def generate() -> tuple[dict, list[dict]]:
    areas, checks = {}, []
    for name, source_file, ellipses in source_jobs():
        source = ROOT / source_file
        source_bytes = source.read_bytes()
        with Image.open(source) as image:
            if image.size != CANVAS:
                raise ValueError(f"{source_file}: expected {CANVAS}, found {image.size}")
            rgba = image.convert("RGBA")
            alpha = rgba.getchannel("A")
        predicate = BELLY_RGB_PREDICATE if name == "belly" else None
        area = {
            "width": CANVAS[0], "height": CANVAS[1], "sourceFile": source_file,
            "sourceSha256": hashlib.sha256(source_bytes).hexdigest(),
            "masks": [pack_mask(alpha, ellipse, rgba, predicate) for ellipse in ellipses],
        }
        if predicate is not None:
            area["rgbPredicate"] = predicate
        checks.append(validate_area(name, area, alpha, rgba, ellipses))
        areas[name] = area
    return {"schemaVersion": 1, "alphaThreshold": ALPHA_THRESHOLD, "areas": areas}, checks


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Verify JSON and current source hashes without writing files")
    args = parser.parse_args()
    result, checks = generate()
    serialized = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if not OUTPUT.is_file():
            raise ValueError(f"Missing generated foot masks: {OUTPUT}; run this script without --check")
        if OUTPUT.read_text(encoding="utf-8") != serialized:
            raise ValueError("Foot masks or source hashes are outdated; regenerate with scripts/prepare-nest-touch-areas.py")
    else:
        with OUTPUT.open("w", encoding="utf-8", newline="\n") as output:
            output.write(serialized)
    print(json.dumps({"passed": True, "checkOnly": args.check,
                      "output": str(OUTPUT), "bytes": len(serialized.encode("utf-8")),
                      "areas": len(result["areas"]),
                      "masks": sum(len(area["masks"]) for area in result["areas"].values()),
                      "checks": checks}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError) as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
