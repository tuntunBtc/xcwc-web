'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const modulePath = require.resolve('../miniprogram/pages/nest-ar/ar-models');
const exportsUnderTest = {};
vm.runInNewContext('Object.hasOwn = undefined;\n' + fs.readFileSync(modulePath, 'utf8'), { exports: exportsUnderTest });
const { loadArModel, invalidateArModel } = exportsUnderTest;
const size = 469376;
const expectedUrl = 'https://assets.xinchengip.com/ar/models/color-f8da55cc019a6df2.glb';
const data = new ArrayBuffer(size);
const header = new DataView(data);
header.setUint32(0, 0x46546c67, true);
header.setUint32(4, 2, true);
header.setUint32(8, size, true);
const document = {
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }],
    bufferViews: [{ buffer: 0, byteLength: 36 }],
    buffers: [{ byteLength: 999999 }],
};
const documentSize = Math.ceil(JSON.stringify(document).length / 4) * 4;
document.buffers[0].byteLength = size - 28 - documentSize;
header.setUint32(12, documentSize, true);
header.setUint32(16, 0x4e4f534a, true);
new Uint8Array(data, 20, documentSize).set(Buffer.from(JSON.stringify(document).padEnd(documentSize, ' ')));
header.setUint32(20 + documentSize, document.buffers[0].byteLength, true);
header.setUint32(24 + documentSize, 0x004e4942, true);
new Float32Array(data, 28 + documentSize, 9).set([0, 0, 0, 1, 0, 0, 0, 1, 0]);

function harness() {
    const files = new Map();
    const requests = [];
    let result = { statusCode: 200, data };
    const fileSystem = {
        statSync(path) {
            if (!files.has(path)) throw new Error('missing file');
            return { size: files.get(path).byteLength };
        },
        readFileSync(path, encoding, offset, length) {
            assert.equal(encoding, undefined);
            return files.get(path).slice(offset, offset + length);
        },
        unlinkSync(path) {
            if (!files.delete(path)) throw new Error('missing file');
        },
        renameSync(from, to) {
            files.set(to, files.get(from));
            files.delete(from);
        },
        readdirSync() { return [...files.keys()].map(path => path.split('/').pop()); },
    };
    const platform = {
        env: { USER_DATA_PATH: 'wxfile://usr' },
        getFileSystemManager: () => fileSystem,
        downloadFile(options) {
            requests.push(options);
            files.set(options.filePath, result.data);
            options.success({ statusCode: result.statusCode });
        },
    };
    return { files, requests, platform, setResult: value => { result = value; } };
}

test('AR 模型首次通过素材域下载，同版本复用本地 GLB', async () => {
    const { files, requests, platform } = harness();
    const first = loadArModel('color', platform);
    const concurrent = loadArModel('color', platform);
    assert.equal(first, concurrent);
    const path = await first;
    assert.equal(await loadArModel('color', platform), path);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, expectedUrl);
    assert.match(path, /color-f8da55cc019a6df2\.glb$/);
    assert.deepEqual([...files.keys()], [path]);
});

test('AR 下载失败或非法 GLB 不污染缓存，重试后可下载', async () => {
    const { files, requests, platform, setResult } = harness();
    setResult({ statusCode: 404, data });
    await assert.rejects(loadArModel('color', platform), /下载不完整/);
    setResult({ statusCode: 200, data: new ArrayBuffer(size) });
    await assert.rejects(loadArModel('color', platform), /下载不完整/);
    assert.equal(files.size, 0);
    setResult({ statusCode: 200, data });
    await loadArModel('color', platform);
    assert.equal(requests.length, 3);
});

test('XR 读不出的文件可按精确缓存路径清除，下一次重新下载', async () => {
    const { files, requests, platform } = harness();
    const oldVersion = 'wxfile://usr/xcwh-ar-color-1111111111111111.glb';
    const otherBird = 'wxfile://usr/xcwh-ar-plush-1111111111111111.glb';
    files.set(oldVersion, data);
    files.set(otherBird, data);
    const path = await loadArModel('color', platform);
    assert.equal(files.has(oldVersion), false);
    invalidateArModel('color', otherBird, platform);
    assert.equal(files.has(otherBird), true);
    invalidateArModel('color', path, platform);
    assert.equal(files.has(path), false);
    await loadArModel('color', platform);
    assert.equal(requests.length, 2);
});
