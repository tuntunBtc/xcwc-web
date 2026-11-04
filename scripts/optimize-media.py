#!/usr/bin/env python3
"""Create reproducible, geometry-preserving runtime WebP derivatives.

Requires Pillow only when generating derivatives. Existing source files are never
overwritten. Shop artwork has its own crop-aware generator and is excluded here.
"""
from __future__ import annotations

import argparse
import hashlib
from io import BytesIO
import json
import math
from pathlib import Path
import sys

try:
    from PIL import Image, ImageChops, ImageStat
except ImportError:
    sys.exit("Generating media requires Pillow: python3 -m pip install Pillow")

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "config/media-derivatives.json"
GENERATOR_VERSION = 1
POLICY = {
    "version": GENERATOR_VERSION,
    "format": "webp",
    "qualities": [90, 92, 94, 96, 98],
    "method": 4,
    "minimumPsnrDb": 40.0,
    "minimumSavingsFraction": 0.10,
    "minimumSourceBytes": 30000,
    "dimensions": "unchanged",
    "alpha": "exact",
    "existingLossyWebp": "retain",
}
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"}
MEDIA_EXTENSIONS = IMAGE_EXTENSIONS | {".svg", ".mp3", ".aac", ".m4a", ".ogg", ".wav", ".mp4", ".webm", ".mov"}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sources():
    for directory, public_prefix in ((ROOT / "assets", "/assets/"),
                                     (ROOT / "src/checkin-assets", "/assets/checkin/")):
        if not directory.exists():
            continue
        for path in sorted(directory.rglob("*")):
            if not path.is_file() or path.suffix.lower() not in MEDIA_EXTENSIONS:
                continue
            relative = path.relative_to(directory)
            if directory.name == "assets" and relative.parts[0] in {"shop", "optimized"}:
                continue
            yield path, public_prefix + relative.as_posix()


def visual_psnr(original: Image.Image, derivative: Image.Image) -> float:
    """Compare visible RGB on both light and dark backgrounds, not hidden RGB."""
    values = []
    for color in ("#fff7e4", "#121212"):
        background = Image.new("RGBA", original.size, color)
        before = Image.alpha_composite(background, original).convert("RGB")
        after = Image.alpha_composite(background, derivative).convert("RGB")
        rms = ImageStat.Stat(ImageChops.difference(before, after)).rms
        mse = sum(channel * channel for channel in rms) / 3
        values.append(100.0 if mse == 0 else 10 * math.log10(255 * 255 / mse))
    return min(values)


def alpha_equal(original: Image.Image, derivative: Image.Image) -> bool:
    return ImageChops.difference(original.getchannel("A"), derivative.getchannel("A")).getbbox() is None


def encode(image: Image.Image):
    # Ascending quality selects the smallest acceptable candidate. No resize,
    # crop, palette change or layer edits occur, keeping Canvas/click geometry.
    for quality in POLICY["qualities"]:
        output = BytesIO()
        options = {"icc_profile": image.info["icc_profile"]} if image.info.get("icc_profile") else {}
        image.save(output, format="WEBP", quality=quality, method=POLICY["method"],
                   alpha_quality=100, exact=True, **options)
        data = output.getvalue()
        with Image.open(BytesIO(data)) as decoded:
            derivative = decoded.convert("RGBA")
        if derivative.size != image.size or not alpha_equal(image, derivative):
            raise ValueError("WebP changed dimensions or alpha")
        psnr = visual_psnr(image, derivative)
        if psnr >= POLICY["minimumPsnrDb"]:
            return data, quality, round(psnr, 4)
    return None


def validate_record(record):
    source = ROOT / record["sourceFile"]
    output = ROOT / record["outputFile"]
    if not source.is_file() or not output.is_file():
        return False
    if sha256(source.read_bytes()) != record["sourceSha256"] or sha256(output.read_bytes()) != record["outputSha256"]:
        return False
    with Image.open(source) as image, Image.open(output) as derivative:
        original = image.convert("RGBA")
        decoded = derivative.convert("RGBA")
        return (image.info.get("icc_profile") == derivative.info.get("icc_profile")
                and original.size == decoded.size == (record["width"], record["height"])
                and alpha_equal(original, decoded)
                and visual_psnr(original, decoded) >= POLICY["minimumPsnrDb"])


def optimize(force=False):
    previous = {}
    if MANIFEST.is_file():
        previous = json.loads(MANIFEST.read_text(encoding="utf-8"))
    reusable = ({record["sourceUrl"]: record for record in previous.get("records", [])}
                if previous.get("policy") == POLICY else {})
    retained = ({record["sourceUrl"]: record for record in previous.get("audit", [])}
                if previous.get("policy") == POLICY else {})
    records, audit = [], []
    generated = reused = reused_retained = 0
    for path, source_url in sources():
        data = path.read_bytes()
        base = {"sourceFile": path.relative_to(ROOT).as_posix(), "sourceUrl": source_url,
                "sourceSha256": sha256(data), "sourceBytes": len(data)}
        reviewed = retained.get(source_url)
        if not force and reviewed and reviewed["sourceSha256"] == base["sourceSha256"]:
            audit.append(reviewed)
            reused_retained += 1
            continue
        suffix = path.suffix.lower()
        if suffix == ".svg":
            import xml.etree.ElementTree as ET
            if ET.fromstring(data).tag.rsplit('}', 1)[-1] != 'svg':
                raise ValueError('Invalid SVG media: ' + str(path))
            audit.append({**base, "status": "retained", "reason": "retain-vector-no-rasterization"})
            continue
        if suffix not in IMAGE_EXTENSIONS:
            audit.append({**base, "status": "retained", "reason": "existing-small-audio" if suffix == ".mp3" and len(data) < 50000 else "review-video-or-audio-separately"})
            continue
        with Image.open(path) as opened:
            width, height = opened.size
            frames = getattr(opened, "n_frames", 1)
            base.update({"width": width, "height": height, "frames": frames})
            if opened.getexif().get(274, 1) != 1:
                audit.append({**base, "status": "retained", "reason": "orientation-metadata-needs-geometry-review"})
                continue
            if frames != 1:
                audit.append({**base, "status": "retained", "reason": "animated-image-needs-playback-review"})
                continue
            if suffix == ".webp" and b"VP8L" not in data[:40]:
                audit.append({**base, "status": "retained", "reason": "already-lossy-webp-no-repeated-compression"})
                continue
            if len(data) < POLICY["minimumSourceBytes"]:
                audit.append({**base, "status": "retained", "reason": "already-small"})
                continue
            cached = reusable.get(source_url)
            if not force and cached and cached["sourceSha256"] == base["sourceSha256"] and validate_record(cached):
                records.append(cached)
                reused += 1
                continue
            image = opened.convert("RGBA")
        candidate = encode(image)
        if candidate is None:
            audit.append({**base, "status": "retained", "reason": "visual-threshold-not-met"})
            continue
        output, quality, psnr = candidate
        if len(output) >= len(data) * (1 - POLICY["minimumSavingsFraction"]):
            audit.append({**base, "status": "retained", "reason": "insufficient-size-benefit"})
            continue
        output_hash = sha256(output)
        relative = source_url.removeprefix("/assets/")
        output_relative = Path("assets/optimized") / Path(relative).with_suffix("")
        output_relative = output_relative.parent / (output_relative.name + "." + output_hash[:12] + ".webp")
        output_path = ROOT / output_relative
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(output)
        # Detect a source changed by another chat while this file was encoding.
        if sha256(path.read_bytes()) != base["sourceSha256"]:
            raise RuntimeError("Source changed during generation; rerun: " + str(path))
        records.append({**base, "outputFile": output_relative.as_posix(),
                        "outputUrl": "/" + output_relative.as_posix(),
                        "outputSha256": output_hash, "outputBytes": len(output),
                        "quality": quality, "alphaUnchanged": True, "psnrDb": psnr})
        generated += 1
        print(f"{source_url}: {len(data):,} -> {len(output):,} B (q{quality}, {psnr:.2f} dB)", flush=True)
    records.sort(key=lambda record: record["sourceUrl"])
    audit.sort(key=lambda record: record["sourceUrl"])
    source_bytes = sum(record["sourceBytes"] for record in records)
    output_bytes = sum(record["outputBytes"] for record in records)
    manifest = {"schemaVersion": 1, "generator": "scripts/optimize-media.py", "policy": POLICY,
                "mapping": {record["sourceUrl"]: record["outputUrl"] for record in records},
                "records": records, "audit": audit,
                "stats": {"auditedMediaFiles": len(records) + len(audit),
                          "optimizedFiles": len(records), "retainedFiles": len(audit),
                          "sourceBytes": source_bytes, "outputBytes": output_bytes,
                          "savedBytes": source_bytes - output_bytes,
                          "savedPercent": round(100 * (1 - output_bytes / source_bytes), 2) if source_bytes else 0}}
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"generated": generated, "reused": reused, "reusedRetained": reused_retained, **manifest["stats"]}, ensure_ascii=False), flush=True)


def check():
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    if manifest.get("schemaVersion") != 1 or manifest.get("policy") != POLICY:
        raise RuntimeError("Media policy changed; regenerate derivatives")
    current = {url: path for path, url in sources()}
    recorded = {record["sourceUrl"] for record in manifest["records"] + manifest["audit"]}
    if set(current) != recorded:
        raise RuntimeError("Media inventory changed; rerun optimize-media.py")
    for record in manifest["records"]:
        if not validate_record(record):
            raise RuntimeError("Derivative/source validation failed: " + record["sourceFile"])
        if manifest["mapping"].get(record["sourceUrl"]) != record["outputUrl"]:
            raise RuntimeError("Mapping mismatch: " + record["sourceUrl"])
    for record in manifest["audit"]:
        if sha256(current[record["sourceUrl"]].read_bytes()) != record["sourceSha256"]:
            raise RuntimeError("Retained media changed; rerun: " + record["sourceUrl"])
    print(f"PASS: {len(recorded)} source files audited; {len(manifest['records'])} derivatives retain geometry, exact alpha and >=40 dB visible PSNR")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Validate inventory, hashes, geometry and visible differences without writing")
    parser.add_argument("--force", action="store_true", help="Regenerate from source originals instead of reusing verified derivatives")
    args = parser.parse_args()
    check() if args.check else optimize(args.force)
