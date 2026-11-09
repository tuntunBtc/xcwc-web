"""A failed build or directory activation must preserve the prior complete site."""
from pathlib import Path
import hashlib
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('build_directory', ROOT / 'scripts/build_directory.py')
transaction = importlib.util.module_from_spec(spec)
spec.loader.exec_module(transaction)


def files_under(directory):
    return {path.relative_to(directory).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in directory.rglob('*') if path.is_file()}


class BuildDirectoryTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.parent = Path(self.temp.name)
        self.dist = self.parent / 'dist'
        (self.dist / 'runtime').mkdir(parents=True)
        (self.dist / 'index.html').write_text('<script src="runtime/old.js"></script>', encoding='utf-8')
        (self.dist / 'runtime/old.js').write_text('old complete site', encoding='utf-8')
        self.before = files_under(self.dist)

    def assert_preserved(self):
        self.assertEqual(files_under(self.dist), self.before)
        self.assertEqual(list(self.parent.glob('.dist-build-*')), [])

    def test_generation_exception_never_changes_the_live_tree(self):
        with self.assertRaisesRegex(ValueError, 'fixture validation failed'):
            with transaction.build_directory(self.dist) as stage:
                (stage / 'index.html').write_text('unvalidated', encoding='utf-8')
                raise ValueError('fixture validation failed')
        self.assert_preserved()

    def test_success_replaces_only_after_the_candidate_is_complete(self):
        with transaction.build_directory(self.dist) as stage:
            (stage / 'index.html').write_text('complete new site', encoding='utf-8')
            (stage / 'register.html').write_text('complete new site', encoding='utf-8')
            self.assertEqual(files_under(self.dist), self.before)
            expected = files_under(stage)
        self.assertEqual(files_under(self.dist), expected)
        self.assertEqual(list(self.parent.glob('.dist-build-*')), [])

    def test_failed_activation_restores_every_previous_file(self):
        replace = os.replace
        def fail_candidate(source, target):
            if Path(source).name == 'candidate':
                raise OSError('fixture activation failure')
            return replace(source, target)
        with mock.patch.object(transaction.os, 'replace', side_effect=fail_candidate):
            with self.assertRaisesRegex(OSError, 'fixture activation failure'):
                with transaction.build_directory(self.dist) as stage:
                    (stage / 'index.html').write_text('new site', encoding='utf-8')
        self.assert_preserved()

    def test_interrupt_just_after_moving_the_old_directory_restores_it(self):
        replace = os.replace
        def interrupt_after_previous_move(source, target):
            result = replace(source, target)
            if Path(target).name == 'previous':
                raise KeyboardInterrupt('fixture interrupt after previous move')
            return result
        with mock.patch.object(transaction.os, 'replace', side_effect=interrupt_after_previous_move):
            with self.assertRaises(KeyboardInterrupt):
                with transaction.build_directory(self.dist) as stage:
                    (stage / 'index.html').write_text('new site', encoding='utf-8')
        self.assert_preserved()

    def test_interrupt_just_after_activating_the_candidate_restores_the_old_site(self):
        replace = os.replace
        def interrupt_after_candidate_move(source, target):
            result = replace(source, target)
            if Path(source).name == 'candidate':
                raise KeyboardInterrupt('fixture interrupt after candidate move')
            return result
        with mock.patch.object(transaction.os, 'replace', side_effect=interrupt_after_candidate_move):
            with self.assertRaises(KeyboardInterrupt):
                with transaction.build_directory(self.dist) as stage:
                    (stage / 'index.html').write_text('new site', encoding='utf-8')
        self.assert_preserved()

    def test_failed_recovery_retains_the_only_previous_copy_and_names_it(self):
        replace = os.replace
        def fail_candidate_and_recovery(source, target):
            if Path(source).name in {'candidate', 'previous'}:
                raise OSError('fixture rename denied')
            return replace(source, target)
        with mock.patch.object(transaction.os, 'replace', side_effect=fail_candidate_and_recovery):
            with self.assertRaisesRegex(RuntimeError, 'previous output retained at') as error:
                with transaction.build_directory(self.dist) as stage:
                    (stage / 'index.html').write_text('new site', encoding='utf-8')
        retained = list(self.parent.glob('.dist-build-*/previous'))
        self.assertEqual(len(retained), 1)
        self.assertIn(str(retained[0]), str(error.exception))
        self.assertEqual(files_under(retained[0]), self.before)

    def test_a_first_build_failure_leaves_no_half_published_directory(self):
        shutil.rmtree(self.dist)
        with self.assertRaisesRegex(ValueError, 'first build failed'):
            with transaction.build_directory(self.dist) as stage:
                (stage / 'index.html').write_text('incomplete', encoding='utf-8')
                raise ValueError('first build failed')
        self.assertFalse(self.dist.exists())
        self.assertEqual(list(self.parent.glob('.dist-build-*')), [])

    def test_symbolic_output_is_rejected_without_editing_its_target(self):
        real = self.parent / 'other-site'
        self.dist.rename(real)
        self.dist.symlink_to(real, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, 'real directory'):
            with transaction.build_directory(self.dist):
                self.fail('unsafe destination was accepted')
        self.assertEqual(files_under(real), self.before)


class BuildPipelinePreservationTest(unittest.TestCase):
    """Run the actual command with late faults in one disposable source copy."""
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix='xcwc-build-transaction-test-')
        cls.root = Path(cls.temp.name) / 'xcwc-web'
        cls.root.mkdir()
        for folder in ['src', 'scripts', 'assets', 'config', 'vendor']:
            shutil.copytree(ROOT / folder, cls.root / folder, ignore=shutil.ignore_patterns('__pycache__'))
        shutil.copy2(ROOT / 'package.json', cls.root / 'package.json')
        catalogue = ROOT.parent / 'xcwc-api/src/main/resources/shop/catalog.json'
        cls.catalogue = cls.root.parent / 'xcwc-api/src/main/resources/shop/catalog.json'
        if catalogue.is_file():
            cls.catalogue.parent.mkdir(parents=True)
            shutil.copy2(catalogue, cls.catalogue)
        result = cls.run_build()
        if result.returncode:
            raise AssertionError('Disposable baseline build failed:\n' + result.stdout)
        cls.baseline = files_under(cls.root / 'dist')

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    @classmethod
    def run_build(cls, code=None):
        command = [sys.executable, 'scripts/build-room.py'] if code is None else [sys.executable, '-c', code]
        return subprocess.run(command, cwd=cls.root, text=True, encoding='utf-8',
                              stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=90)

    def assert_failed_and_preserved(self, result, message):
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertIn(message, result.stdout)
        self.assertEqual(files_under(self.root / 'dist'), self.baseline)
        self.assertEqual(list(self.root.glob('.dist-build-*')), [])

    def test_missing_media_after_runtime_emission_preserves_the_old_site(self):
        template = self.root / 'src/nest/template.html'
        original = template.read_bytes()
        try:
            with template.open('a', encoding='utf-8') as output:
                output.write('<img src="assets/ui/audit-only-missing.webp">')
            result = self.run_build()
        finally:
            template.write_bytes(original)
        self.assert_failed_and_preserved(result, 'Missing runtime media: assets/ui/audit-only-missing.webp')

    def test_a_late_compatibility_copy_failure_preserves_the_old_site(self):
        source = self.root / 'src/photo-save.js'
        held = source.with_suffix('.held')
        source.rename(held)
        try:
            result = self.run_build()
        finally:
            held.rename(source)
        self.assert_failed_and_preserved(result, 'photo-save.js')

    def test_failure_while_copying_public_media_preserves_the_old_site(self):
        result = self.run_build("""
import pathlib, runpy, shutil, sys
sys.path.insert(0, str(pathlib.Path('scripts').resolve()))
copy = shutil.copy2
def fail_media(source, target, *args, **kwargs):
    if pathlib.Path(target).suffix == '.webp' and 'assets' in pathlib.Path(target).parts:
        raise OSError('fixture media publication failed')
    return copy(source, target, *args, **kwargs)
shutil.copy2 = fail_media
runpy.run_path('scripts/build-room.py', run_name='__main__')
""")
        self.assert_failed_and_preserved(result, 'fixture media publication failed')

    def test_final_catalogue_check_failure_preserves_the_old_site(self):
        original = self.catalogue.read_bytes() if self.catalogue.exists() else None
        self.catalogue.parent.mkdir(parents=True, exist_ok=True)
        try:
            self.catalogue.write_text(json.dumps({'audit': {'imageUrl': '/assets/audit-final-missing.webp'}}), encoding='utf-8')
            result = self.run_build()
        finally:
            if original is None:
                self.catalogue.unlink()
            else:
                self.catalogue.write_bytes(original)
        self.assert_failed_and_preserved(result, 'Shop catalogue references unpublished media: /assets/audit-final-missing.webp')

    def test_success_is_complete_and_reproducible(self):
        result = self.run_build()
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertEqual(files_under(self.root / 'dist'), self.baseline)
        self.assertGreater(len(self.baseline), 200)
        self.assertEqual((self.root / 'dist/index.html').read_bytes(), (self.root / 'dist/register.html').read_bytes())
        self.assertEqual(list(self.root.glob('.dist-build-*')), [])
        check = subprocess.run([sys.executable, 'scripts/media_pipeline.py'], cwd=self.root,
                               text=True, encoding='utf-8', stdout=subprocess.PIPE,
                               stderr=subprocess.STDOUT, timeout=30)
        self.assertEqual(check.returncode, 0, check.stdout)


if __name__ == '__main__':
    unittest.main()
