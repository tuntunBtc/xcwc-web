"""Prepare the user-supplied video as a pausable transparent sprite atlas.

Invoked by media:optimize. Only a changed source needs OpenCV/numpy/ffmpeg;
normal builds validate the saved hashes using the standard library.
"""
from pathlib import Path
import base64
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/小窝页面动画.mp4'
OUTPUT = ROOT / 'assets/nest/idle/huangying-idle.webp'
AVIF = OUTPUT.with_suffix('.avif')
AUDIO = OUTPUT.with_suffix('.m4a')
MANIFEST = ROOT / 'src/nest/idle-animation.json'
QUALITY = ROOT / 'src/nest/idle-quality.json'
GUARD = ROOT / 'scripts/nest_idle_guard.py'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def prepare():
    signature = digest(Path(__file__))
    if MANIFEST.exists() and OUTPUT.exists():
        saved = json.loads(MANIFEST.read_text(encoding='utf-8'))
        if (saved.get('generatorSha256') == signature
                and saved.get('sourceSha256') == digest(SOURCE)
                and saved.get('atlasSha256') == digest(OUTPUT)
                and AVIF.exists() and saved.get('avifSha256') == digest(AVIF)
                and AUDIO.exists() and saved.get('audioSha256') == digest(AUDIO)):
            if (saved.get('guardSha256') == digest(GUARD) and QUALITY.exists()
                    and saved.get('qualitySha256') == digest(QUALITY)):
                print('Nest idle: reusing verified transparent atlas', flush=True)
                return
    import cv2
    import numpy as np
    from PIL import Image
    from nest_idle_guard import validate_frames

    cv2.setRNGSeed(0)
    capture = cv2.VideoCapture(str(SOURCE))
    frames, source_snapshots = [], []
    # Retain the source's 24 fps during quick wing motion; no blended frames.
    times = [index * 100 for index in range(37)]
    times += [round(index * 1000 / 24) for index in range(89, 133)]
    for index, time_ms in enumerate(times):
        capture.set(cv2.CAP_PROP_POS_MSEC, time_ms)
        ok, bgr = capture.read()
        if not ok:
            raise ValueError('Incomplete idle source video')
        bgr = cv2.resize(bgr, (512, 512))
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        chroma = rgb[:, :, 1].astype(float) - rgb[:, :, 2]
        labels = np.full((512, 512), cv2.GC_PR_BGD, np.uint8)
        labels[chroma > 17] = cv2.GC_PR_FGD
        labels[chroma > 32] = cv2.GC_FGD
        labels[:1] = 0
        labels[-28:] = 0
        labels[:, :1] = 0
        labels[:, -1:] = 0
        cv2.grabCut(bgr, labels, None, np.zeros((1, 65)), np.zeros((1, 65)),
                    3, cv2.GC_INIT_WITH_MASK)
        silhouette = np.uint8((labels == 1) | (labels == 3)) * 255
        _, components, stats, _ = cv2.connectedComponentsWithStats(silhouette, 8)
        silhouette = np.uint8(components == 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])) * 255
        # Keep enclosed eyes and highlights opaque; remove only the exterior.
        exterior = silhouette.copy()
        cv2.floodFill(exterior, None, (0, 0), 255)
        silhouette |= cv2.bitwise_not(exterior)
        alpha = cv2.GaussianBlur(silhouette, (3, 3), .6)
        rgba = Image.fromarray(np.dstack([rgb, alpha])).resize((312, 312), Image.Resampling.LANCZOS)
        frame = Image.new('RGBA', (320, 290))
        frame.alpha_composite(rgba, (4, -2))
        frame = frame.resize((256, 232), Image.Resampling.LANCZOS)
        frames.append(frame)
        source_snapshots.append(frame.tobytes())
        if index % 12 == 0:
            print(f'Nest idle: matted {index + 1}/{len(times)} frames', flush=True)
    capture.release()
    # Return from a clear folded-wing pose, then hold the first pose briefly.
    # Alpha crossfading two wing positions creates visible double contours.
    frames.append(frames[0].copy())
    times.append(5550)
    quality = validate_frames(frames, source_snapshots, list(range(len(source_snapshots))) + [0])
    atlas_rows = (len(frames) + 7) // 8
    atlas = Image.new('RGBA', (2048, 232 * atlas_rows))
    masks = []
    for index, frame in enumerate(frames):
        atlas.paste(frame, (index % 8 * 256, index // 8 * 232))
        pixels = np.array(frame).astype(int)
        yy, xx = np.indices((232, 256))
        # Reviewed toe envelopes, intersected with actual opaque brown pixels.
        feet = (((xx / .8 - 110) / 43) ** 2 + ((yy / .8 - 267) / 14) ** 2 <= 1)
        feet |= (((xx / .8 - 213) / 43) ** 2 + ((yy / .8 - 267) / 14) ** 2 <= 1)
        feet &= (pixels[:, :, 3] >= 128) & (pixels[:, :, 0] - pixels[:, :, 1] > 18)
        feet &= (pixels[:, :, 1] - pixels[:, :, 2] > 22) & (pixels[:, :, 1] < 205)
        rows, cols = np.where(feet)
        if not len(rows):
            raise ValueError(f'No visible toes in frame {index}')
        x, y, right, bottom = int(cols.min()), int(rows.min()), int(cols.max()) + 1, int(rows.max()) + 1
        bits = np.packbits(feet[y:bottom, x:right].ravel(), bitorder='little').tobytes()
        masks.append({'width': 256, 'height': 232, 'masks': [{
            'x': x, 'y': y, 'width': right - x, 'height': bottom - y,
            'bits': base64.b64encode(bits).decode('ascii')}]})
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(OUTPUT, format='WEBP', quality=80, method=4, alpha_quality=100)
    with Image.open(OUTPUT) as decoded:
        if decoded.convert('RGBA').getchannel('A').tobytes() != atlas.getchannel('A').tobytes():
            raise ValueError('Runtime WebP changed the reviewed single-frame alpha')
    atlas.save(AVIF, format='AVIF', quality=65, speed=6, max_threads=2)
    import subprocess
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-i', str(SOURCE),
                    '-map', '0:a:0', '-vn', '-c:a', 'copy', '-movflags', '+faststart',
                    '-y', str(AUDIO)], check=True)
    quality.update({'atlasSha256': digest(OUTPUT), 'sourceSha256': digest(SOURCE),
                    'generatorSha256': signature, 'guardSha256': digest(GUARD),
                    'runtimeAlphaExact': True})
    QUALITY.write_text(json.dumps(quality, indent=2) + '\n', encoding='utf-8')
    data = {'schemaVersion': 1, 'sourceFile': SOURCE.relative_to(ROOT).as_posix(),
            'sourceSha256': digest(SOURCE), 'sourceBytes': SOURCE.stat().st_size,
            'generatorSha256': signature, 'atlasFile': OUTPUT.relative_to(ROOT).as_posix(),
            'guardSha256': digest(GUARD), 'qualityFile': QUALITY.relative_to(ROOT).as_posix(),
            'qualitySha256': digest(QUALITY),
            'atlasSha256': digest(OUTPUT), 'atlasBytes': OUTPUT.stat().st_size,
            'avifFile': AVIF.relative_to(ROOT).as_posix(),
            'avifSha256': digest(AVIF), 'avifBytes': AVIF.stat().st_size,
            'audioFile': AUDIO.relative_to(ROOT).as_posix(),
            'audioSha256': digest(AUDIO), 'audioBytes': AUDIO.stat().st_size,
            'width': 256, 'height': 232, 'columns': 8, 'frameCount': len(frames),
            'frameTimesMs': times, 'durationMs': 6080,
            'decodedBytes': 2048 * 232 * atlas_rows * 4, 'footAreas': masks}
    MANIFEST.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    report = ROOT / 'output/nest-idle-20261105'
    report.mkdir(parents=True, exist_ok=True)
    for index in [0, 10, 30, 40, 59]:
        frames[index].save(report / f'transparent-frame-{index}.png')
    atlas.save(report / 'matte-atlas.png')
    print(f'Nest idle: {AVIF.stat().st_size:,} B AVIF, {len(frames)} transparent frames; original AAC retained', flush=True)


if __name__ == '__main__':
    prepare()
