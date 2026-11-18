'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const modulePath = require.resolve('../miniprogram/utils/nest-brand-art');

function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xcwc-art-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const source = path.join(root, 'sample');
    fs.writeFileSync(source, 'fixture', 'utf8');
    const ids = ['1', '2', '3', '4'].map(digit => digit.repeat(32));
    const assets = ids.map(id => ({ id, mime: 'image/png', width: 16, height: 24, size_bytes: 7, url: '/api/content/assets/' + id }));
    const look = { id: 'look', characterId: 'bird', slots: {normal: ids[0], happy: ids[1], angry: ids[2]} };
    const doc = { character: {id: 'bird', defaultAppearanceId: 'look'}, appearances: [look], releaseId: 'A', assets };
    let index;
    const platform = {
        env: {USER_DATA_PATH: root},
        getStorageSync: () => index, setStorageSync: (_, data) => { index = data; },
        getFileSystemManager: () => ({
            accessSync: fs.accessSync, mkdirSync: (dir, recursive) => fs.mkdirSync(dir, {recursive: !!recursive}),
            readdirSync: fs.readdirSync, rmdirSync: dir => fs.rmSync(dir, {recursive:true}),
            statSync: fs.statSync, copyFile({srcPath, destPath, success}) { fs.copyFileSync(srcPath, destPath); success(); },
        }),
        request: ({success}) => success({statusCode:200, data:doc}),
        downloadFile: ({success}) => success({statusCode:200, tempFilePath: source}),
        getImageInfo: ({success}) => success({width:16, height:24}),
    };
    const pet = {petId:'pet', characterId:'bird'};
    function client() {
        delete require.cache[modulePath];
        return require(modulePath).createBrandArt(platform,'https://test.example', () => {});
    }
    return { platform, pet, client, doc, look, ids, root };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('三态完整即可启用，选配状态复用正常图，断网冷启动恢复相同角色', async t => {
    const {platform, pet, client} = fixture(t);
    const a = client();
    assert.equal(a.select(pet,1),null); await settle();
    const bundle = a.select(pet,1);
    assert.equal(bundle.paths.hungry, bundle.paths.normal);
    platform.request = ({fail}) => fail();
    const cold = client();
    assert.deepEqual(cold.select(pet,1),bundle);
    assert.equal(cold.select({...pet,characterId:'other'},1),null);
});

test('切鸟忽略迟到回调，未完整的动画时间线及缺帧继续显示成功版', async t => {
    const {platform, pet, client, doc, look, ids} = fixture(t);
    const a = client();
    let resolve;
    const request = platform.request;
    platform.request = ({success}) => {resolve = () => success({statusCode:200,data:doc});};
    a.select(pet,1); a.select(null,1); resolve(); await settle();
    platform.request = request;
    assert.equal(a.select(pet,2),null); await settle();
    const first = a.select(pet,2);
    doc.releaseId = 'B';
    look.animation = {assetId:ids[3],frames:2,columns:2,rows:1,fps:4,durationMs:600,frameTimesMs:[0,600]};
    a.select(pet,3); await settle();
    assert.deepEqual(a.select(pet,3), first);
    look.animation.frameTimesMs = [0,270];
    a.select(pet,4); await settle();
    const clip = a.select(pet,4).animation;
    assert.deepEqual([clip.width,clip.height,clip.durationMs,clip.frameTimesMs],[8,24,600,[0,270]]);
});

test('新版就绪后，旧版文件保留到画面实际换版', async t => {
    const {pet, client, doc} = fixture(t);
    const a = client();
    a.select(pet,1); await settle();
    const first = a.select(pet,1);
    a.display(first);
    doc.releaseId = 'B';
    a.select(pet,2); await settle();
    const second = a.select(pet,2);
    assert.equal(second.releaseId,'B');
    assert.ok(fs.existsSync(first.paths.normal));
    a.display(second);
    assert.equal(fs.existsSync(first.paths.normal),false);
    assert.ok(fs.existsSync(second.paths.normal));
    a.display(null);
});

test('带原声的版本缺少可下载音轨时整套保留上一版', async t => {
    const {platform, pet, client, doc, look, ids} = fixture(t);
    const a = client();
    a.select(pet,1); await settle();
    const old = a.select(pet,1);
    const soundId = 'f'.repeat(32);
    doc.assets.push({id:soundId,mime:'audio/mp4',size_bytes:7,url:'/api/content/assets/'+soundId});
    look.animation = {assetId:ids[3],audioAssetId:soundId,frames:2,columns:2,rows:1,fps:3,frameTimesMs:[0,300],durationMs:650};
    doc.releaseId = 'sound';
    const download = platform.downloadFile;
    platform.downloadFile = opt => opt.url.endsWith(soundId) ? opt.success({statusCode:503}) : download(opt);
    a.select(pet,2); await settle();
    assert.deepEqual(a.select(pet,2),old);
    platform.downloadFile = download;
    a.select(pet,3); await settle();
    assert.match(a.select(pet,3).animation.audioPath,/\.m4a$/);
});
