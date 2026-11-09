"""Reject temporal blending and broad translucent ghost contours in idle frames.

Snapshot each individually matted RGBA frame as immutable bytes immediately
after matting, before loop or timing edits. Each output frame must exactly match
the one original snapshot named by origins. Repeated source frames are allowed;
blending or editing a frame after its snapshot is not.
"""
from __future__ import annotations

import hashlib

ALPHA_MIN = 8
ALPHA_MAX = 247
OPAQUE_THRESHOLD = 128
MAX_ALPHA_BAND_PX = 3.0


def _alpha_band_max(frame):
    """Measure intermediate alpha both inside and outside the main silhouette."""
    import cv2
    import numpy as np

    alpha = np.asarray(frame.getchannel('A'), dtype=np.uint8)
    middle = (alpha >= ALPHA_MIN) & (alpha <= ALPHA_MAX)
    if not middle.any():
        return 0.0
    silhouette = np.uint8(alpha >= OPAQUE_THRESHOLD)
    inside = cv2.distanceTransform(silhouette, cv2.DIST_L2, cv2.DIST_MASK_PRECISE)
    outside = cv2.distanceTransform(1 - silhouette, cv2.DIST_L2, cv2.DIST_MASK_PRECISE)
    distances = np.where(silhouette, inside, outside)
    return float(distances[middle].max())


def validate_frames(frames, source_rgba_bytes, origins):
    """Return a JSON-serializable audit; reject changed pixels or ghost contours."""
    if not frames or len(frames) != len(origins):
        raise ValueError('Idle frames and source origins must have the same nonzero count')
    if not source_rgba_bytes or any(type(snapshot) is not bytes for snapshot in source_rgba_bytes):
        raise ValueError('Idle source snapshots must be immutable RGBA bytes')
    size = frames[0].size
    if len(size) != 2 or min(size) <= 0:
        raise ValueError('Idle frame geometry must be positive')
    expected_bytes = size[0] * size[1] * 4
    if any(len(snapshot) != expected_bytes for snapshot in source_rgba_bytes):
        raise ValueError('Idle source snapshots do not match the RGBA geometry')

    source_hashes = [hashlib.sha256(snapshot).hexdigest() for snapshot in source_rgba_bytes]
    frame_hashes, max_band = [], 0.0
    for index, (frame, origin) in enumerate(zip(frames, origins)):
        if type(origin) is not int or not 0 <= origin < len(source_rgba_bytes):
            raise ValueError(f'Idle frame {index} has an invalid source origin')
        if frame.mode != 'RGBA' or frame.size != size:
            raise ValueError(f'Idle frame {index} changed mode or geometry')
        pixels = frame.tobytes()
        if pixels != source_rgba_bytes[origin]:
            raise ValueError(
                f'Idle frame {index} differs from its single source frame {origin}; '
                'temporal blending or crossfading is forbidden')
        band = _alpha_band_max(frame)
        if band > MAX_ALPHA_BAND_PX:
            raise ValueError(
                f'Idle frame {index} has a broad translucent contour '
                f'({band:.3f}px > {MAX_ALPHA_BAND_PX:.1f}px); possible wing ghosting')
        max_band = max(max_band, band)
        frame_hashes.append(source_hashes[origin])

    return {
        'passed': True,
        'frameCount': len(frames),
        'sourceFrameCount': len(source_rgba_bytes),
        'singleSourceExact': True,
        'frameOrigins': list(origins),
        'sourceRgbaSha256': source_hashes,
        'frameRgbaSha256': frame_hashes,
        'maxAlphaBandPixels': round(max_band, 6),
        'maxAllowedAlphaBandPixels': MAX_ALPHA_BAND_PX,
        'alphaRange': [ALPHA_MIN, ALPHA_MAX],
        'opaqueThreshold': OPAQUE_THRESHOLD,
    }
