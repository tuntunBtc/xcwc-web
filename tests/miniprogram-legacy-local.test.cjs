'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
// Last local-authoritative snapshot before store.js was switched to the cloud store.
const revision = 'cc17b48b1a7744170ad2ef8430cd596ac68010a8';
const suites = ['adoption-profile', 'local-data', 'step-supply-bridge'];

test('旧本机版领养、相册与补给回归（独立本机数据模型）', t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xcwh-local-regression-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const archive = path.join(dir, 'local-source.tar');
    execFileSync('git', ['archive', '--output', archive, revision, 'miniprogram/*.js',
        'miniprogram/*.json', 'miniprogram/*.wxml', 'miniprogram/*.wxss'], { cwd: root });
    execFileSync('tar', ['-xf', archive, '-C', dir]);
    fs.mkdirSync(path.join(dir, 'tests'));
    const files = suites.map(name => {
        const file = path.join(dir, 'tests', name + '.test.cjs');
        fs.copyFileSync(path.join(__dirname, 'fixtures/local-miniprogram', name + '.cases'), file);
        return file;
    });
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const result = execFileSync(process.execPath, ['--test', ...files], { cwd: dir, env, encoding: 'utf8' });
    t.diagnostic(result.split('\n').filter(line => /(?:tests|pass|fail) \d+/.test(line)).join(', '));
});
