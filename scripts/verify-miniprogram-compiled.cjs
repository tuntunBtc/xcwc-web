'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { collectRuntimeFiles } = require('./miniprogram-runtime-files.cjs');

const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const normalize = file => file.replace(/\\/g, '/').replace(/^\.?\/+/, '');
const mediaType = /\.(?:webp|png|jpe?g|gif|svg|bin|m4a|mp3|wav|ogg|aac|mp4)$/i;
const LIMIT = 2 * 1024 * 1024;

async function verify(projectPath) {
    const sdk = process.env.XCWC_OFFLINE_CI || path.dirname(require.resolve('miniprogram-ci/package.json'));
    const ci = require(sdk);
    const { pack } = require(path.join(sdk, 'dist/ci/utils/pack'));
    const { DefaultProjectAttr } = require(path.join(sdk, 'dist/config/config'));
    const readConfig = name => JSON.parse(fs.readFileSync(path.join(projectPath, name), 'utf8'));
    const app = readConfig('app.json');
    const runtime = collectRuntimeFiles(projectPath, app);
    if (runtime.outside.length) throw new Error('运行模块引用超出候选目录：' + runtime.outside.join('，'));
    const projectConfig = readConfig('project.config.json');
    const roots = (app.subpackages || app.subPackages || []).map(item => normalize(item.root));
    const ignore = projectConfig.packOptions?.ignore || [];
    const expected = new Map();

    function scan(relative = '') {
        for (const entry of fs.readdirSync(path.join(projectPath, relative), { withFileTypes: true })) {
            const name = relative ? relative + '/' + entry.name : entry.name;
            if (ignore.some(rule => rule.type === 'file' && normalize(rule.value) === name ||
                rule.type === 'folder' && (name === normalize(rule.value) || name.startsWith(normalize(rule.value) + '/')))) continue;
            if (entry.isDirectory()) scan(name);
            if (entry.isFile() && mediaType.test(name)) {
                expected.set(name, sha256(fs.readFileSync(path.join(projectPath, name))));
            }
        }
    }
    scan();

    const manifestPath = path.join(projectPath, 'utils/release-images-manifest.js');
    if (fs.existsSync(manifestPath)) {
        const manifest = require(manifestPath);
        for (const entry of Object.values(manifest.files)) {
            if (expected.get(entry.source) !== entry.sha256) throw new Error(`二进制素材与清单不一致：${entry.source}`);
        }
    }

    // 离线编译只使用游客项目元数据。绝不读取真实私钥或调用上传接口。
    const project = new ci.Project({ appid: 'touristappid', type: 'miniProgram', projectPath, privateKey: 'offline-analysis-only' });
    project.attr = async () => DefaultProjectAttr;
    const files = await ci.getCompiledResult({ project, version: '0.0.0', setting: { useProjectConfig: true } });
    const compiled = new Map(Object.entries(files).map(([key, value]) => [normalize(key), Buffer.from(value)]));
    const byRoot = new Map([['main', {}], ...roots.map(root => [root, {}])]);
    const longestFirst = roots.slice().sort((a, b) => b.length - a.length);
    for (const [key, value] of compiled) {
        const root = longestFirst.find(name => key.startsWith(name + '/')) || 'main';
        byRoot.get(root)[key] = value;
    }
    const packages = [...byRoot].map(([root, value]) => {
        const { validSize, buffer } = pack(value);
        return { root, files: Object.keys(value).length, validSize, archiveBytes: buffer.length };
    });
    const missing = [];
    const changed = [];
    for (const [name, hash] of expected) {
        if (!compiled.has(name)) missing.push(name);
        else if (sha256(compiled.get(name)) !== hash) changed.push(name);
    }
    return {
        packages,
        expectedRuntimeFiles: runtime.files.size,
        missingRuntimeFiles: [...runtime.files].filter(name => !compiled.has(normalize(name))),
        expectedMedia: expected.size,
        verifiedMedia: expected.size - missing.length - changed.length,
        missing,
        changed,
        invalidPackages: packages.filter(pkg => !pkg.files || pkg.validSize > LIMIT).map(pkg => pkg.root),
    };
}

const project = process.argv[2];
if (!project) {
    console.error('用法：node scripts/verify-miniprogram-compiled.cjs <候选项目目录>');
    process.exit(1);
}
verify(path.resolve(project)).then(report => {
    const failed = report.missingRuntimeFiles.length || report.missing.length || report.changed.length || report.invalidPackages.length;
    process.stdout.write('OFFLINE_RELEASE_AUDIT ' + JSON.stringify(report) + '\n', () => process.exit(failed ? 1 : 0));
}).catch(error => {
    process.stderr.write(String(error.message) + '\n', () => process.exit(1));
});
