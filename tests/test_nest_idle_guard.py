"""Source frames pass; synthetic double wings and opaque RGB blends fail."""
import importlib.util
from pathlib import Path
import unittest

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('nest_idle_guard', ROOT / 'scripts/nest_idle_guard.py')
GUARD = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(GUARD)


def bird(offset=0):
    alpha = Image.new('L', (96, 80))
    draw = ImageDraw.Draw(alpha)
    draw.ellipse((24, 8, 72, 72), fill=255)
    draw.rectangle((8 + offset, 25, 32 + offset, 49), fill=255)
    draw.rectangle((64 - offset, 25, 88 - offset, 49), fill=255)
    alpha = alpha.filter(ImageFilter.GaussianBlur(.6))
    frame = Image.new('RGBA', alpha.size, (230, 190, 95, 255))
    frame.putalpha(alpha)
    return frame


class NestIdleGuardTests(unittest.TestCase):
    def test_individual_frames_and_an_exact_first_pose_hold_pass(self):
        first, folded = bird(), bird(8)
        report = GUARD.validate_frames(
            [first, folded, first.copy()], [first.tobytes(), folded.tobytes()], [0, 1, 0])
        self.assertTrue(report['passed'])
        self.assertTrue(report['singleSourceExact'])
        self.assertEqual(report['frameOrigins'], [0, 1, 0])
        self.assertEqual(report['frameRgbaSha256'][0], report['frameRgbaSha256'][-1])
        self.assertLessEqual(report['maxAlphaBandPixels'], 3)

    def test_alpha_crossfade_is_rejected_by_single_source_provenance(self):
        first, folded = bird(), bird(14)
        ghost = Image.blend(first, folded, .5)
        with self.assertRaisesRegex(ValueError, 'single source'):
            GUARD.validate_frames([ghost], [first.tobytes(), folded.tobytes()], [0])

    def test_alpha_band_catches_a_blended_frame_saved_as_a_source(self):
        first, folded = bird(), bird(14)
        for amount in [.25, .5, .75]:
            with self.subTest(amount=amount):
                ghost = Image.blend(first, folded, amount)
                with self.assertRaisesRegex(ValueError, 'broad translucent contour'):
                    GUARD.validate_frames([ghost], [ghost.tobytes()], [0])

    def test_opaque_rgb_ghosts_cannot_bypass_single_source_provenance(self):
        first = bird()
        left, right = first.copy(), first.copy()
        ImageDraw.Draw(left).ellipse((34, 24, 42, 34), fill=(0, 0, 0, 255))
        ImageDraw.Draw(right).ellipse((43, 24, 51, 34), fill=(0, 0, 0, 255))
        ghost = Image.blend(left, right, .5)
        self.assertEqual(ghost.getchannel('A').tobytes(), first.getchannel('A').tobytes())
        with self.assertRaisesRegex(ValueError, 'single source'):
            GUARD.validate_frames([ghost], [left.tobytes(), right.tobytes()], [0])

    def test_geometry_origins_and_snapshot_mutability_are_checked(self):
        frame = bird()
        bad_cases = [
            ([frame], [frame.tobytes()], []),
            ([frame], [frame.tobytes()], [1]),
            ([frame], [frame.tobytes()], [True]),
            ([frame], [bytearray(frame.tobytes())], [0]),
            ([frame], [b'incomplete'], [0]),
            ([frame.convert('RGB')], [frame.tobytes()], [0]),
        ]
        for frames, snapshots, origins in bad_cases:
            with self.subTest(origins=origins, mode=frames[0].mode):
                with self.assertRaises(ValueError):
                    GUARD.validate_frames(frames, snapshots, origins)

    def test_current_webp_has_only_a_narrow_feather_edge(self):
        # Inspect real decoded alpha in addition to synthetic blur examples.
        path = ROOT / 'assets/nest/idle/huangying-idle.webp'
        if not path.is_file():
            self.skipTest('Idle runtime media is not present in this checkout')
        with Image.open(path) as atlas:
            for index in [0, 37, 59, 80, 81]:
                x, y = index % 8 * 256, index // 8 * 232
                if y + 232 > atlas.height:
                    self.skipTest('Runtime atlas precedes the full-rate wing revision')
                frame = atlas.crop((x, y, x + 256, y + 232)).convert('RGBA')
                with self.subTest(frame=index):
                    report = GUARD.validate_frames([frame], [frame.tobytes()], [0])
                    self.assertLessEqual(report['maxAlphaBandPixels'], 3)


if __name__ == '__main__':
    unittest.main()
