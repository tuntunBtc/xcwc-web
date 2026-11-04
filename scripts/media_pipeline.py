"""Validated media aliases and an explicit, reproducible runtime publication list.

Build/check use only Python's standard library; Pillow is needed only to optimize.
"""
from pathlib import Path, PurePosixPath
import hashlib
import html
import json
import re
import shutil

MEDIA_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.svg',
                    '.mp3', '.m4a', '.aac', '.ogg', '.wav', '.mp4', '.webm'}
ASSET_PATTERN = re.compile(r'\bassets/[A-Za-z0-9_./-]+')


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def safe_file(root, relative):
    parts = PurePosixPath(relative)
    if parts.is_absolute() or '..' in parts.parts or '\\' in relative:
        raise ValueError('Invalid media path: ' + relative)
    path = root / relative
    if not path.resolve().is_relative_to(root.resolve()):
        raise ValueError('Media path escapes the project: ' + relative)
    return path


class MediaPlan:
    def __init__(self, root):
        self.root = Path(root)
        self.config = json.loads((self.root / 'config/media-runtime.json').read_text(encoding='utf-8'))
        self.derivatives = json.loads((self.root / 'config/media-derivatives.json').read_text(encoding='utf-8'))
        if self.config.get('schemaVersion') != 1 or self.derivatives.get('schemaVersion') != 1:
            raise ValueError('Unsupported media configuration version')
        self.mapping = dict(self.derivatives['mapping'])
        records = self.derivatives['records']
        all_sources = [*records, *self.derivatives.get('audit', [])]
        for key in ['sourceUrl', 'sourceFile']:
            if len({item[key] for item in all_sources}) != len(all_sources):
                raise ValueError('Duplicate media source: ' + key)
        if len({item['outputFile'] for item in records}) != len(records):
            raise ValueError('Duplicate media derivative file')
        if set(self.mapping) != {item['sourceUrl'] for item in records}:
            raise ValueError('Every media alias must have a verified derivative record')
        for source, target in self.mapping.items():
            if not source.startswith('/assets/') or not target.startswith('/assets/optimized/'):
                raise ValueError('Media aliases must stay in the controlled static directory')
            safe_file(self.root, source.lstrip('/'))
            safe_file(self.root, target.lstrip('/'))
        for item in all_sources:
            source = safe_file(self.root, item['sourceFile'])
            if item['sourceFile'].startswith('assets/'):
                expected_url = '/' + item['sourceFile']
            elif item['sourceFile'].startswith('src/checkin-assets/'):
                expected_url = '/assets/checkin/' + item['sourceFile'].removeprefix('src/checkin-assets/')
            else:
                raise ValueError('Unsupported media source location: ' + item['sourceFile'])
            if item['sourceUrl'] != expected_url:
                raise ValueError('Media source URL does not match its file: ' + item['sourceFile'])
            if not source.is_file() or digest(source) != item['sourceSha256']:
                raise ValueError('Media source changed; run npm run media:optimize: ' + str(source))
            if 'outputFile' not in item:
                continue
            target = safe_file(self.root, item['outputFile'])
            if item['outputUrl'] != '/' + item['outputFile']:
                raise ValueError('Media output URL does not match its file: ' + item['outputFile'])
            if not target.is_file() or digest(target) != item['outputSha256']:
                raise ValueError('Missing or changed media derivative: ' + str(target))
            if self.mapping.get(item['sourceUrl']) != item['outputUrl']:
                raise ValueError('Inconsistent derivative alias: ' + item['sourceUrl'])
        audited = {item['sourceFile'] for item in [*records, *self.derivatives.get('audit', [])]}
        for directory in ['assets', 'src/checkin-assets']:
            for path in (self.root / directory).rglob('*'):
                relative = path.relative_to(self.root).as_posix()
                if relative.startswith(('assets/shop/', 'assets/optimized/')):
                    continue
                if path.is_file() and path.suffix.lower() in MEDIA_EXTENSIONS | {'.mov'} and relative not in audited:
                    raise ValueError('New media needs an optimization review; run npm run media:optimize: ' + relative)
        self.validate_usage_derivatives(all_sources)
        self.validate_shop()
        self.fingerprint_sources = {}
        if self.config.get('contentFingerprints'):
            aliases = dict(self.mapping)
            candidates = {item.get('outputFile', item['sourceUrl'].lstrip('/')) for item in all_sources}
            candidates.update(item['outputFile'] for item in self.derivatives.get('usageDerivatives', []))
            shop = json.loads((self.root/'assets/shop/media-optimization.json').read_text(encoding='utf-8'))
            for item in [*shop['products'], *shop.get('banners', [])]:
                for key in ['cover','detail','image','optimized']:
                    record = item.get(key, {})
                    if record.get('url'):
                        candidates.add(record['url'].lstrip('/'))
            for relative in sorted(candidates):
                source = self.source(relative)
                if not source.is_file() or source.suffix.lower() not in MEDIA_EXTENSIONS:
                    continue
                sha = digest(source)
                if re.search(r'\.'+sha[:12]+r'\.[a-z0-9]+$',relative):
                    continue
                public = '/' + relative
                target = str(PurePosixPath(relative).with_name(PurePosixPath(relative).stem+'.'+sha[:12]+source.suffix))
                self.fingerprint_sources[target] = source
                aliases[public] = '/' + target
            self.mapping = {source: aliases.get(target,target) for source,target in aliases.items()}

    def validate_usage_derivatives(self, sources):
        """Validate explicit UI aliases without resizing any shared source URL.

        Pillow is intentionally absent from the build gate: the optimizer checks
        transformed RGBA pixels and records source/job/output hashes here.
        """
        relative = self.config.get('usageDerivativeJobs')
        jobs = []
        if relative:
            config = json.loads(safe_file(self.root, relative).read_text(encoding='utf-8'))
            if config.get('schemaVersion') != 1:
                raise ValueError('Unsupported purpose-specific media jobs')
            jobs = config['jobs']
        records = self.derivatives.get('usageDerivatives', [])
        for key in ['id', 'usageUrl', 'outputFile']:
            if len({item[key] for item in records}) != len(records):
                raise ValueError('Duplicate purpose-specific media: ' + key)
        if len({item['id'] for item in jobs}) != len(jobs) or {item['id'] for item in jobs} != {item['id'] for item in records}:
            raise ValueError('Purpose-specific media inventory changed; run media:optimize')
        by_id = {item['id']: item for item in jobs}
        source_urls = {item['sourceUrl'] for item in sources}
        audited_files = {item['sourceFile'] for item in sources}
        for item in records:
            job = by_id[item['id']]
            job_hash = hashlib.sha256(json.dumps(job, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')).hexdigest()
            if item.get('jobSha256') != job_hash:
                raise ValueError('Purpose-specific media crop/size changed; run media:optimize: ' + item['id'])
            if item['sourceFile'] != job['sourceFile'] or item['sourceFile'] not in audited_files:
                raise ValueError('Purpose-specific media needs an audited full-resolution source')
            source = safe_file(self.root, item['sourceFile'])
            if digest(source) != item['sourceSha256'] or source.stat().st_size != item['sourceBytes']:
                raise ValueError('Purpose-specific media source changed; run media:optimize: ' + item['id'])
            alias = item['usageUrl']
            if alias != job['usageUrl'] or not alias.startswith('/assets/') or alias in source_urls or alias in self.mapping:
                raise ValueError('Purpose-specific alias must not replace a shared media source URL')
            safe_file(self.root, alias.lstrip('/'))
            expected_file = job['outputBaseFile'] + '.' + item['outputSha256'][:12] + '.webp'
            if (item['outputFile'] != expected_file or not expected_file.startswith('assets/optimized/')
                    or item['outputUrl'] != '/' + item['outputFile']
                    or [item['width'], item['height']] != job['outputSize']
                    or item['cropBox'] != job['cropBox'] or item.get('transformedPixelsExact') is not True):
                raise ValueError('Purpose-specific media geometry/output mismatch: ' + item['id'])
            target = safe_file(self.root, item['outputFile'])
            if not target.is_file() or digest(target) != item['outputSha256'] or target.stat().st_size != item['outputBytes']:
                raise ValueError('Missing or changed purpose-specific derivative: ' + item['id'])
            self.mapping[alias] = item['outputUrl']

    def validate_shop(self):
        """Reuse the shop's crop-aware source/output records instead of re-encoding."""
        manifest = json.loads((self.root / 'assets/shop/media-optimization.json').read_text(encoding='utf-8'))
        for item in [*manifest['products'], *manifest.get('banners', [])]:
            for key in ['source', 'cover', 'detail', 'image', 'optimized']:
                record = item.get(key)
                if not isinstance(record, dict) or 'url' not in record or 'sha256' not in record:
                    continue
                path = safe_file(self.root, record['url'].lstrip('/'))
                if not path.is_file() or digest(path) != record['sha256']:
                    raise ValueError('Shop media changed; regenerate its crop-aware manifest: ' + str(path))

    def rewrite(self, text):
        # Full filenames only; never rewrite a longer name that shares a prefix.
        # A second pass over the escaped shell must keep the dynamic resolver's source keys intact.
        segments = re.split(r'(<script data-xcwc-media-map>.*?</script>|&lt;script data-xcwc-media-map&gt;.*?&lt;/script&gt;|/\*XCWC_MEDIA_MAP_BEGIN\*/.*?/\*XCWC_MEDIA_MAP_END\*/)', text, flags=re.S)
        for index in range(0, len(segments), 2):
            for source, target in sorted(self.mapping.items(), key=lambda pair: -len(pair[0])):
                pattern = r'(?P<prefix>__XCWC_ASSET_ORIGIN__/|(?<![A-Za-z0-9_./:-])/?)' + re.escape(source.lstrip('/')) + r'(?![A-Za-z0-9_.-])'
                segments[index] = re.sub(pattern, lambda match: match['prefix'] + target.lstrip('/'), segments[index])
        return ''.join(segments)

    def source(self, relative):
        if relative in getattr(self, 'fingerprint_sources', {}):
            return self.fingerprint_sources[relative]
        path = safe_file(self.root, relative)
        if not path.exists() and relative.startswith('assets/checkin/'):
            return safe_file(self.root, 'src/checkin-assets/' + relative.removeprefix('assets/checkin/'))
        return path

    def helper(self):
        # Dynamic emotion names use this resolver; static paths are rewritten at build time.
        sizes = {}
        for item in [*self.derivatives['records'], *self.derivatives.get('audit', []), *self.derivatives.get('usageDerivatives', [])]:
            if item.get('width') and item.get('height'):
                sizes[item['outputUrl'] if 'outputUrl' in item else item['sourceUrl']] = [item['width'], item['height']]
        shop = json.loads((self.root/'assets/shop/media-optimization.json').read_text(encoding='utf-8'))
        for item in [*shop['products'], *shop.get('banners', [])]:
            for key in ['cover', 'detail', 'image']:
                record = item.get(key, {})
                if record.get('width') and record.get('height'):
                    sizes[record['url']] = [record['width'], record['height']]
        for path,size in list(sizes.items()):
            sizes[self.mapping.get(path,path)] = size
        return '<script data-xcwc-media-map>/*XCWC_MEDIA_MAP_BEGIN*/const xcwcMediaSizes=' + json.dumps(sizes, separators=(',', ':')) + ';const xcwcMediaMapping=' + json.dumps(self.mapping, separators=(',', ':')) + ''';
function xcwcMediaSize(value){try{return xcwcMediaSizes[new URL(value,'__XCWC_ASSET_ORIGIN__').pathname]||null}catch{return null}}
function xcwcMediaUrl(value){
 const origin='__XCWC_ASSET_ORIGIN__';
 try{const url=new URL(value,origin);if(url.origin!==origin)return value;
 const target=xcwcMediaMapping[url.pathname];return target?origin+target+url.search+url.hash:value;
 }catch{return value}
}
/*XCWC_MEDIA_MAP_END*/</script>'''

    def required(self, shell):
        # The legacy account entry is published separately from the H5 shell.
        # Include its rewritten URLs so fingerprints used only there are shipped.
        for relative in ['src/account/register.html', 'src/account/registration.js',
                         'src/account/registration.css', 'src/account/points.js']:
            source = safe_file(self.root, relative)
            if source.is_file():
                shell += '\n' + self.rewrite(source.read_text(encoding='utf-8'))
        runtime = self.root/'dist/runtime-manifest.json'
        if runtime.is_file():
            entries=json.loads(runtime.read_text(encoding='utf-8'))['files']
            for relative,record in entries.items():
                file=safe_file(self.root/'dist',relative)
                if not file.is_file() or digest(file)!=record['sha256']:
                    raise ValueError('Runtime chunk checksum mismatch: '+relative)
                if file.suffix in {'.js','.css'}:
                    shell+='\n'+file.read_text(encoding='utf-8')
        decoded = html.unescape(shell)
        decoded = re.sub(r'<script data-xcwc-media-map>.*?</script>', '', decoded, flags=re.S)
        decoded = re.sub(r'/\*XCWC_MEDIA_MAP_BEGIN\*/.*?/\*XCWC_MEDIA_MAP_END\*/', '', decoded, flags=re.S)
        required = set()
        for relative in ASSET_PATTERN.findall(decoded):
            if PurePosixPath(relative).suffix.lower() == '.mov':
                raise ValueError('Convert source MOV video to a reviewed web format before publication: ' + relative)
            if PurePosixPath(relative).suffix.lower() not in MEDIA_EXTENSIONS:
                continue  # Dynamic directory prefixes are covered by the explicit bundles below.
            public = '/' + relative
            required.add(self.mapping.get(public, public).lstrip('/'))
        for pattern in self.config['dynamicGlobs']:
            safe_file(self.root, pattern)
            matches = list(self.root.glob(pattern))
            if not matches:
                raise ValueError('Dynamic media bundle has no files: ' + pattern)
            for path in matches:
                relative = path.relative_to(self.root).as_posix()
                required.add(self.mapping.get('/' + relative, '/' + relative).lstrip('/'))
        optional = self.config.get('optionalCompatibilityFiles', [])
        for relative in self.config['compatibilityFiles']:
            if relative in optional and not safe_file(self.root, relative).is_file():
                continue
            required.add(relative)
        # Keep previous published URL bytes for old pages/API consumers. Only
        # current fingerprint URLs get immutable caching; no original is recoded.
        for relative in list(required):
            if relative in self.fingerprint_sources:
                source=self.fingerprint_sources[relative]
                if source.is_relative_to(self.root/'assets'):
                    required.add(source.relative_to(self.root).as_posix())
                elif source.is_relative_to(self.root/'src/checkin-assets'):
                    required.add('assets/checkin/'+source.name)
        for relative in required:
            if not self.source(relative).is_file():
                raise ValueError('Missing runtime media: ' + relative)
        return required

    def budgets(self, required):
        warnings = []
        for relative in sorted(required):
            path = self.source(relative)
            suffix = path.suffix.lower()
            if suffix not in MEDIA_EXTENSIONS:
                continue
            role = ('audio' if suffix in {'.mp3', '.m4a', '.aac', '.ogg', '.wav'} else
                    'video' if suffix in {'.mp4', '.webm'} else
                    'thumbnail' if '/cover-' in relative or '-192.' in relative or '-320.' in relative else 'image')
            limit = self.config['budgetBytes'][role]
            if path.stat().st_size > limit:
                exceptions = self.config.get('budgetExceptions', {})
                original = next((source.lstrip('/') for source, target in self.mapping.items() if target == '/' + relative), relative)
                reason = exceptions.get(relative) or exceptions.get(original)
                if not isinstance(reason, dict) or not reason.get('reason'):
                    raise ValueError(f'Unreviewed {role} budget overrun ({path.stat().st_size}>{limit}): {relative}')
                if path.stat().st_size > reason['maxBytes'] or digest(path) != reason['sha256']:
                    raise ValueError('Budget exception changed and needs review: ' + relative)
                warnings.append({'path': relative, 'bytes': path.stat().st_size, 'targetBytes': limit, 'reason': reason['reason']})
        return warnings

    def publish(self, shell):
        required = self.required(shell)
        warnings = self.budgets(required)
        dist = self.root / 'dist'
        destination = dist / 'assets'
        destination.mkdir(parents=True, exist_ok=True)
        for relative in sorted(required):
            target = safe_file(dist, relative)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(self.source(relative), target)
        # Only generated dist/assets is pruned. Source files and uploaded/local photos are untouched.
        for path in destination.rglob('*'):
            if path.is_file() and path.relative_to(dist).as_posix() not in required:
                path.unlink()
        for path in sorted(destination.rglob('*'), reverse=True):
            if path.is_dir() and not any(path.iterdir()):
                path.rmdir()
        files = {relative: {'bytes': (dist / relative).stat().st_size, 'sha256': digest(dist / relative)}
                 for relative in sorted(required)}
        manifest = {'schemaVersion': 1, 'files': files, 'totalBytes': sum(item['bytes'] for item in files.values()),
                    'budgetExceptions': warnings}
        (dist / 'media-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        return manifest

    def check(self):
        dist = self.root / 'dist'
        required = self.required((dist / 'index.html').read_text(encoding='utf-8'))
        warnings = self.budgets(required)
        manifest = json.loads((dist / 'media-manifest.json').read_text(encoding='utf-8'))
        actual = {p.relative_to(dist).as_posix() for p in (dist / 'assets').rglob('*') if p.is_file()}
        if actual != required or set(manifest['files']) != required:
            raise ValueError('Published media differs from the runtime allowlist; rebuild first')
        for relative, record in manifest['files'].items():
            path = safe_file(dist, relative)
            if not path.is_file() or digest(path) != record['sha256']:
                raise ValueError('Published media checksum mismatch: ' + relative)
        for path in dist.rglob('*'):
            if path.name in {'.DS_Store', 'Thumbs.db'} or path.name.startswith('._'):
                raise ValueError('System metadata must not be deployed: ' + str(path))
        catalogue = self.root.parent / 'xcwc-api/src/main/resources/shop/catalog.json'
        if catalogue.is_file():
            def image_urls(value):
                if isinstance(value, dict):
                    for key, child in value.items():
                        if key in {'coverImageUrl', 'detailImageUrl', 'imageUrl'} and isinstance(child, str):
                            yield child
                        else:
                            yield from image_urls(child)
                elif isinstance(value, list):
                    for child in value:
                        yield from image_urls(child)
            for url in image_urls(json.loads(catalogue.read_text(encoding='utf-8'))):
                if not url.startswith('/assets/') or not safe_file(dist, url.lstrip('/')).is_file():
                    raise ValueError('Shop catalogue references unpublished media: ' + url)
        for filename in ['index.html', 'register.html']:
            if (dist / filename).read_bytes() != (dist / 'index.html').read_bytes():
                raise ValueError('The canonical NFC entry must retain the same app shell')
        return {'passed': True, 'runtimeFiles': len(required), 'runtimeBytes': manifest['totalBytes'],
                'derivatives': len(self.mapping), 'budgetExceptions': warnings}


if __name__ == '__main__':
    root = Path(__file__).resolve().parents[1]
    result = MediaPlan(root).check()
    output = root / 'output/media-optimization'
    output.mkdir(parents=True, exist_ok=True)
    (output / 'asset-check.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False))
