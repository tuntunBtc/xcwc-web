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


def usage_jobs():
    config = json.loads((ROOT / "config/media-runtime.json").read_text(encoding="utf-8"))
    relative = config.get("usageDerivativeJobs")
    if not relative:
        return []
    manifest = json.loads((ROOT / relative).read_text(encoding="utf-8"))
    if manifest.get("schemaVersion") != 1:
        raise ValueError("Unsupported purpose-specific media jobs")
    return manifest["jobs"]


def usage_job_hash(job):
    return sha256(json.dumps(job, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8"))


def usage_image(job):
    # These explicit aliases are only for small UI uses. Full source URLs keep
    # their existing mapping and must never inherit this crop or resize.
    source = ROOT / job["sourceFile"]
    if job["encoding"] not in {"lossless-webp", "lossy-webp"}:
        raise ValueError("Unsupported purpose-specific media encoding")
    with Image.open(source) as opened:
        if list(opened.size) != job["sourceSize"] or getattr(opened, "n_frames", 1) != 1:
            raise ValueError("Purpose-specific media source geometry changed: " + str(source))
        image = opened.convert("RGBA")
        box = job["cropBox"]
        if not (0 <= box[0] < box[2] <= image.width and 0 <= box[1] < box[3] <= image.height):
            raise ValueError("Purpose-specific media crop is out of bounds")
        image = image.crop(box)
        if image.size != tuple(job["outputSize"]):
            image = image.resize(tuple(job["outputSize"]), Image.Resampling.LANCZOS)
    return image


def validate_usage_record(job, record):
    source, output = ROOT / job["sourceFile"], ROOT / record["outputFile"]
    if (record.get("id") != job["id"] or record.get("sourceFile") != job["sourceFile"]
            or record.get("usageUrl") != job["usageUrl"]
            or record.get("cropBox") != job["cropBox"]
            or [record.get("width"), record.get("height")] != job["outputSize"]
            or record.get("jobSha256") != usage_job_hash(job)
            or not source.is_file() or not output.is_file()
            or sha256(source.read_bytes()) != record.get("sourceSha256")
            or sha256(output.read_bytes()) != record.get("outputSha256")):
        return False
    expected = usage_image(job)
    with Image.open(output) as opened:
        actual = opened.convert("RGBA")
        if list(actual.size) != job["outputSize"]:
            return False
        if job["encoding"] == "lossless-webp":
            return expected.tobytes() == actual.tobytes()
        return (record.get("encoding") == "lossy-webp"
                and record.get("quality") == job["quality"]
                and record.get("alphaUnchanged") is True
                and alpha_equal(expected, actual)
                and visual_psnr(expected, actual) >= POLICY["minimumPsnrDb"])


def generate_usage_derivatives(previous=(), force=False):
    reusable = {record["id"]: record for record in previous}
    records = []
    for job in usage_jobs():
        cached = reusable.get(job["id"])
        if not force and cached and validate_usage_record(job, cached):
            records.append(cached)
            continue
        source = ROOT / job["sourceFile"]
        source_hash = sha256(source.read_bytes())
        image = usage_image(job)
        output = BytesIO()
        lossless = job["encoding"] == "lossless-webp"
        options = {"lossless": True} if lossless else {"quality": job["quality"], "alpha_quality": 100}
        if not lossless and (not isinstance(job["quality"], int) or not 90 <= job["quality"] <= 100):
            raise ValueError("Reviewed purpose-specific quality must be an integer from 90 to 100")
        image.save(output, format="WEBP", method=6, exact=True, **options,
                   **({"icc_profile": image.info["icc_profile"]} if image.info.get("icc_profile") else {}))
        data = output.getvalue()
        output_hash = sha256(data)
        output_file = job["outputBaseFile"] + "." + output_hash[:12] + ".webp"
        target = ROOT / output_file
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        if sha256(source.read_bytes()) != source_hash:
            raise RuntimeError("Source changed during purpose-specific generation: " + str(source))
        record = {"id": job["id"], "jobSha256": usage_job_hash(job),
                  "sourceFile": job["sourceFile"], "sourceSha256": source_hash,
                  "sourceBytes": source.stat().st_size, "sourceWidth": job["sourceSize"][0],
                  "sourceHeight": job["sourceSize"][1], "cropBox": job["cropBox"],
                  "width": image.width, "height": image.height, "resample": "lanczos",
                  "usageUrl": job["usageUrl"], "outputFile": output_file,
                  "outputUrl": "/" + output_file, "outputSha256": output_hash,
                  "outputBytes": len(data), "encoding": job["encoding"], "method": 6,
                  "transformedPixelsExact": lossless, "purpose": job["purpose"]}
        if not lossless:
            with Image.open(BytesIO(data)) as decoded:
                actual = decoded.convert("RGBA")
            record.update(quality=job["quality"], alphaUnchanged=alpha_equal(image, actual),
                          psnrDb=round(visual_psnr(image, actual), 4))
        if not validate_usage_record(job, record):
            raise RuntimeError("Purpose-specific media changed transformed pixels: " + job["id"])
        records.append(record)
        print(f"{job['usageUrl']}: {source.stat().st_size:,} -> {len(data):,} B, {image.width}x{image.height}, {job['encoding']}", flush=True)
    return records


def check_usage_derivatives(manifest):
    jobs = usage_jobs()
    records = {record["id"]: record for record in manifest.get("usageDerivatives", [])}
    if set(records) != {job["id"] for job in jobs}:
        raise RuntimeError("Purpose-specific media inventory changed; rerun media:optimize")
    for job in jobs:
        if not validate_usage_record(job, records[job["id"]]):
            raise RuntimeError("Purpose-specific media validation failed: " + job["id"])
    print(f"PASS: {len(jobs)} purpose-specific derivatives meet declared geometry, exact alpha and lossless/>=40 dB visual checks")


def usage_only(check_only=False, force=False):
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    if check_only:
        return check_usage_derivatives(manifest)
    manifest["usageDerivatives"] = generate_usage_derivatives(manifest.get("usageDerivatives", []), force)
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def optimize(force=False):
    # Specialized video matting shares the established optimization entry point.
    import runpy
    runpy.run_path(str(ROOT / 'scripts/prepare-nest-idle.py'))['prepare']()
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
                "usageDerivatives": generate_usage_derivatives(previous.get("usageDerivatives", []), force),
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
    check_usage_derivatives(manifest)
    print(f"PASS: {len(recorded)} source files audited; {len(manifest['records'])} derivatives retain geometry, exact alpha and >=40 dB visible PSNR")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Validate inventory, hashes, geometry and visible differences without writing")
    parser.add_argument("--force", action="store_true", help="Regenerate from source originals instead of reusing verified derivatives")
    parser.add_argument("--usage-only", action="store_true", help="Generate/check explicit UI crops and thumbnails without reprocessing full-resolution media")
    args = parser.parse_args()
    if args.usage_only:
        usage_only(args.check, args.force)
    elif args.check:
        check()
    else:
        optimize(args.force)
