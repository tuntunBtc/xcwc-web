"""Exercise failure boundaries of the media publication gate in disposable trees."""
from pathlib import Path
import hashlib
import html
import importlib.util
import json
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('media_pipeline', Path(__file__).resolve().parents[1] / 'scripts/media_pipeline.py')
pipeline = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pipeline)


class MediaGateTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.write('assets/bird.png', b'original-image')
        self.write('assets/optimized/bird.123.webp', b'optimized-image')
        self.record = {
            'sourceFile': 'assets/bird.png', 'sourceUrl': '/assets/bird.png',
            'sourceSha256': pipeline.digest(self.root / 'assets/bird.png'),
            'outputFile': 'assets/optimized/bird.123.webp', 'outputUrl': '/assets/optimized/bird.123.webp',
            'outputSha256': pipeline.digest(self.root / 'assets/optimized/bird.123.webp'),
        }
        self.config = {'schemaVersion': 1, 'dynamicGlobs': [], 'compatibilityFiles': {},
                       'budgetBytes': {'image': 300000, 'thumbnail': 80000, 'audio': 50000, 'video': 3000000},
                       'budgetExceptions': {}}
        self.save()
        self.write_json('assets/shop/media-optimization.json', {'products': [], 'banners': []})

    def write(self, name, content):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)

    def write_json(self, name, content):
        self.write(name, (json.dumps(content) + '\n').encode('utf-8'))

    def save(self):
        self.write_json('config/media-runtime.json', self.config)
        self.write_json('config/media-derivatives.json', {'schemaVersion': 1,
            'mapping': {self.record['sourceUrl']: self.record['outputUrl']}, 'records': [self.record], 'audit': []})

    def test_only_local_media_rewritten_and_resolver_survives_escaped_pass(self):
        plan = pipeline.MediaPlan(self.root)
        self.assertEqual(plan.rewrite('"/assets/bird.png"'), '"/assets/optimized/bird.123.webp"')
        self.assertEqual(plan.rewrite('"assets/bird.png"'), '"assets/optimized/bird.123.webp"')
        self.assertEqual(plan.rewrite('https://example.org/assets/bird.png'), 'https://example.org/assets/bird.png')
        self.assertEqual(plan.rewrite('/assets/bird.png.backup'), '/assets/bird.png.backup')
        self.assertEqual(plan.rewrite(plan.helper()), plan.helper())
        escaped = html.escape(plan.helper(), quote=True)
        self.assertEqual(plan.rewrite(escaped), escaped)

    def test_changed_source_cannot_reuse_old_derivative(self):
        self.write('assets/bird.png', b'replaced-image')
        with self.assertRaisesRegex(ValueError, 'source changed'):
            pipeline.MediaPlan(self.root)

    def test_content_fingerprint_keeps_old_published_url_and_changes_with_bytes(self):
        self.config['contentFingerprints']=True
        self.save()
        plan=pipeline.MediaPlan(self.root)
        target=plan.mapping['/assets/bird.png']
        self.assertRegex(target,r'\.[0-9a-f]{12}\.webp$')
        self.assertEqual(plan.mapping['/assets/optimized/bird.123.webp'],target)
        shell=plan.rewrite('<img src="/assets/bird.png">')
        plan.publish(shell)
        self.write('dist/index.html',shell.encode('utf-8'))
        self.write('dist/register.html',shell.encode('utf-8'))
        self.assertEqual((self.root/'dist'/target.lstrip('/')).read_bytes(),b'optimized-image')
        self.assertTrue((self.root/'dist/assets/optimized/bird.123.webp').is_file())
        self.assertFalse((self.root/'dist/assets/bird.png').exists())
        self.assertTrue(plan.check()['passed'])
        self.write('assets/optimized/bird.123.webp',b'new-reviewed-image')
        self.record['outputSha256']=pipeline.digest(self.root/'assets/optimized/bird.123.webp')
        self.save()
        self.assertNotEqual(pipeline.MediaPlan(self.root).mapping['/assets/bird.png'],target)

    def test_new_media_requires_inventory_review(self):
        self.write('assets/unreviewed.mp4', b'video')
        with self.assertRaisesRegex(ValueError, 'New media'):
            pipeline.MediaPlan(self.root)

    def test_account_only_image_fingerprint_is_published_and_checked(self):
        self.config['contentFingerprints'] = True
        self.save()
        self.write('src/account/registration.js', b'const avatar="/assets/bird.png";')
        plan = pipeline.MediaPlan(self.root)
        shell = '<main>No image on the H5 entry</main>'
        target = plan.mapping['/assets/bird.png'].lstrip('/')
        plan.publish(shell)
        self.write('dist/index.html', shell.encode('utf-8'))
        self.write('dist/register.html', shell.encode('utf-8'))
        self.assertEqual((self.root / 'dist' / target).read_bytes(), b'optimized-image')
        self.assertTrue(plan.check()['passed'])
        (self.root / 'dist' / target).unlink()
        with self.assertRaisesRegex(ValueError, 'Published media'):
            plan.check()

    def test_wrong_alias_cannot_silently_swap_artwork(self):
        self.record['outputUrl'] = '/assets/optimized/other.webp'
        self.save()
        with self.assertRaisesRegex(ValueError, 'output URL'):
            pipeline.MediaPlan(self.root)

    def test_path_traversal_and_outside_symlink_rejected(self):
        with self.assertRaises(ValueError):
            pipeline.safe_file(self.root, '../private.png')
        (self.root / 'assets/outside').symlink_to(self.root.parent, target_is_directory=True)
        with self.assertRaises(ValueError):
            pipeline.safe_file(self.root, 'assets/outside/private.png')

    def test_publish_excludes_originals_and_checks_corruption(self):
        plan = pipeline.MediaPlan(self.root)
        shell = plan.rewrite('<img src="/assets/bird.png">')
        self.write('dist/assets/old-original.png', b'obsolete')
        plan.publish(shell)
        self.write('dist/index.html', shell.encode('utf-8'))
        self.write('dist/register.html', shell.encode('utf-8'))
        self.assertFalse((self.root / 'dist/assets/old-original.png').exists())
        self.assertFalse((self.root / 'dist/assets/bird.png').exists())
        self.assertTrue((self.root / 'assets/bird.png').exists())
        self.assertTrue(plan.check()['passed'])
        self.write('dist/assets/optimized/bird.123.webp', b'corrupt')
        with self.assertRaisesRegex(ValueError, 'checksum'):
            plan.check()

    def test_budget_exception_is_bound_to_the_reviewed_content(self):
        plan = pipeline.MediaPlan(self.root)
        target = 'assets/optimized/bird.123.webp'
        plan.config['budgetBytes']['image'] = 1
        plan.config['budgetExceptions'][target] = {'reason': 'Reviewed test fixture',
            'maxBytes': 100, 'sha256': pipeline.digest(self.root / target)}
        self.assertEqual(len(plan.budgets({target})), 1)
        self.write(target, b'a different image')
        with self.assertRaisesRegex(ValueError, 'exception changed'):
            plan.budgets({target})


if __name__ == '__main__':
    unittest.main()
