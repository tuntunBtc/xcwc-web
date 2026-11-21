'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '../miniprogram/pages/nest-ar');
const source = fs.readFileSync(path.join(root, 'nest-ar.js'), 'utf8');
const componentSource = fs.readFileSync(path.join(root, 'view/index.js'), 'utf8');

function xrMethods(wx = {}) {
    let component;
    vm.runInNewContext(componentSource, { Component: definition => { component = definition; }, wx, console: { warn() {} } });
    return component.methods;
}

function harness({ deny = false, systemDenied = false, placementError, captureError } = {}) {
    const requests = [];
    const moves = [];
    const zooms = [];
    const toasts = [];
    const invalidations = [];
    let plane = false;
    const nodes = new Map([
        ['flock', { visible: false }],
        ['birds', { scale: { setValue: (...args) => zooms.push(args) } }],
        ['plane-marker', { visible: true }],
    ]);
    const xr = {
        ar: {
            placeHere: id => {
                if (placementError) throw placementError;
                assert.equal(id, 'flock');
                return plane;
            },
            resetPlane: () => { plane = false; },
        },
        getNodeById: id => nodes.get(id),
    };
    const wx = {
        getMenuButtonBoundingClientRect: () => ({ top: 48 }),
        getWindowInfo: () => ({ pixelRatio: 3, windowWidth: 390, windowHeight: 844 }),
        getXrFrameSystem: () => ({}),
        getAppAuthorizeSetting: () => ({ cameraAuthorized: systemDenied ? 'denied' : 'authorized' }),
        showToast: toast => toasts.push(toast),
        openSetting: handlers => { wx.settings = handlers; },
        authorize: handlers => {
            (deny ? handlers.fail : handlers.success)();
            handlers.complete();
        },
    };
    let page;
    vm.runInNewContext(source, {
        Page: definition => { page = definition; },
        require: name => {
            assert.equal(name, './ar-models');
            return {
                loadArModel: async key => {
                    requests.push(key);
                    return 'wxfile://usr/' + key + '.glb';
                },
                invalidateArModel: (...args) => invalidations.push(args),
            };
        },
        wx, setTimeout, clearTimeout, console: { warn() {} },
    });
    page.setData = patch => Object.assign(page.data, patch);
    page.selectComponent = () => ({
        ...xrMethods(),
        scene: xr,
        meshesReady: true,
        birds: new Map([['plush', { transform: { position: { setValue: (...args) => moves.push(args) } } }]]),
        dragPosition: (position, dx, dy) => ({ x: position.x + dx * 0.002, z: position.z + dy * 0.002 }),
        capture: async () => {
            if (captureError) throw captureError;
            return true;
        },
    });
    let loading;
    const mount = page.mount.bind(page);
    page.mount = () => { loading = mount(); };
    page.onLoad();
    return { page, requests, moves, zooms, nodes, toasts, invalidations, wx, waitForModels: () => loading, detectPlane: () => { plane = true; } };
}

test('AR 等相机、模型与平面就绪后放置四鸟，拖动只改变选中模型', async () => {
    const { page, requests, moves, zooms, nodes, waitForModels, detectPlane } = harness();
    try {
        page.start();
        assert.equal(page.data.preparing, true);
        await waitForModels();
        assert.equal(page.data.active, true);
        assert.deepEqual(requests, ['original', 'color', 'profile', 'plush']);
        assert.equal(page.data.models.map(model => [model.x, model.z]).flat().join(','), '-0.13,0.12,0.13,0.12,-0.13,-0.12,0.13,-0.12');
        page.onTracking();
        page.place();
        assert.equal(page.data.placed, false);
        page.onModelsLoaded();
        page.onPlane({ detail: { ready: true } });
        page.place();
        assert.match(page.data.hint, /定位标记/);
        page.onPlane({ detail: { ready: true } });
        assert.match(page.data.hint, /定位标记/);
        detectPlane();
        page.onPlane({ detail: { ready: true } });
        assert.equal(page.data.planeReady, true);
        page.place();
        assert.equal(page.data.placed, true);
        assert.equal(nodes.get('flock').visible, true);
        assert.equal(nodes.get('plane-marker').visible, false);
        page.selectBird({ currentTarget: { dataset: { key: 'plush' } } });
        page.dragStart({ touches: [{ clientX: 40, clientY: 50 }] });
        page.dragMove({ touches: [{ clientX: 400, clientY: 50 }] });
        assert.deepEqual(moves, [[0.55, 0.1, -0.12]]);
        page.dragEnd();
        page.dragMove({ touches: [{ clientX: 420, clientY: 80 }] });
        assert.equal(moves.length, 1);
        page.dragStart({ touches: [{ clientX: 30, clientY: 30 }, { clientX: 130, clientY: 30 }] });
        page.dragMove({ touches: [{ clientX: 30, clientY: 30 }, { clientX: 260, clientY: 30 }] });
        assert.deepEqual(zooms, [[1, 1, 1], [1.8, 1.8, 1.8]]);
        assert.equal(moves.length, 1);
        page.reposition();
        assert.equal(page.data.placed, false);
        assert.equal(nodes.get('flock').visible, false);
        assert.equal(nodes.get('plane-marker').visible, true);
        page.onHide();
        assert.equal(page.data.active, false);
    } finally {
        page.onUnload();
    }
});

test('XR 放置抛错时显示可重试提示，后续平面事件保留提示', async () => {
    const { page, waitForModels } = harness({ placementError: new Error('XR unavailable') });
    try {
        page.start();
        await waitForModels();
        page.onTracking();
        page.onModelsLoaded();
        page.onPlane({ detail: { ready: true } });
        page.place();
        page.onPlane({ detail: { ready: true } });
        assert.equal(page.data.placed, false);
        assert.equal(page.data.planeReady, true);
        assert.match(page.data.hint, /再试一次/);
    } finally {
        page.onUnload();
    }
});

test('XR 在四个网格挂载和设置有限坐标后才允许放置', async () => {
    const xr = { XRGLTF: 'xr-gltf', Transform: 'transform', GLTF: 'gltf' };
    let component;
    vm.runInNewContext(componentSource, {
        Component: definition => { component = definition; },
        wx: { getXrFrameSystem: () => xr },
    });
    const models = [{ key: 'original', x: -0.13, z: 0.12 }, { key: 'color', x: 0.13, z: 0.12 },
        { key: 'profile', x: -0.13, z: -0.12 }, { key: 'plush', x: 0.13, z: -0.12 }];
    const children = [];
    const events = [];
    const flock = { visible: false };
    const scene = {
        assets: { loadAsset: async ({ assetId }) => ({ value: assetId }) },
        getElementById: id => id === 'birds' && { addChild: element => children.push(element) },
        createElement: type => {
            assert.equal(type, xr.XRGLTF);
            const transform = { position: { setValue: (...args) => { transform.coordinates = args; } } };
            const gltf = { meshes: [], setData: data => { gltf.model = data.model; } };
            return { transform, gltf, getComponent: name => name === xr.Transform ? transform : gltf };
        },
        getNodeById: id => id === 'flock' && flock,
        ar: { placeHere: id => id === 'flock' },
    };
    const instance = { ...component.methods, data: { models }, triggerEvent: name => events.push(name) };
    await instance.onReady({ detail: { value: scene } });
    assert.equal(children.length, 4);
    assert.deepEqual(children.map(child => child.transform.coordinates), models.map(({ x, z }) => [x, 0.1, z]));
    assert.deepEqual(children.map(child => child.gltf.model), models.map(({ key }) => key));
    instance.onTick();
    assert.deepEqual(events, []);
    assert.equal(instance.place(), false);
    children.forEach(child => child.gltf.meshes.push({}));
    instance.onTick();
    instance.onTick();
    assert.deepEqual(events, ['modelsloaded']);
    assert.equal(instance.place(), true);
    assert.equal(flock.visible, true);
});

test('拒绝相机权限时不挂载 AR 场景或读取模型', () => {
    const { page, requests } = harness({ deny: true });
    page.start();
    assert.equal(page.data.stage, 'permission');
    assert.equal(page.data.active, false);
    assert.equal(requests.length, 0);
});

test('XR 截图等原生 Promise 返回，失败时由页面提示', async () => {
    const methods = xrMethods();
    const calls = [];
    const scene = { share: { supported: false, captureToFriends: async options => calls.push({ ...options }) } };
    assert.equal(await methods.capture.call({ scene }), false);
    assert.equal(calls.length, 0);
    scene.share.supported = true;
    assert.equal(await methods.capture.call({ scene }), true);
    assert.deepEqual(calls, [{ fileType: 'jpg', quality: 0.9 }]);
    scene.share.captureToFriends = async () => { throw new Error('native failure'); };
    await assert.rejects(methods.capture.call({ scene }), /native failure/);
    const { page, toasts } = harness({ captureError: new Error('native failure') });
    page.setData({ placed: true });
    await page.capture();
    assert.equal(toasts[0].title, '当前设备暂无法截图');
});

test('追踪已经就绪后报错，仍切换到可重试界面', async () => {
    const { page, waitForModels } = harness();
    try {
        page.start();
        await waitForModels();
        page.onTracking();
        page.onModelsLoaded();
        xrMethods().onPlaneState.call({
            triggerEvent(name, detail) {
                assert.equal(name, 'arfailure');
                page.fail({ detail });
            },
        }, { detail: { value: { state: 3, errorMessage: 'lost' } } });
        assert.equal(page.data.active, false);
        assert.equal(page.data.stage, 'error');
        assert.match(page.data.hint, /平面追踪中断/);
    } finally {
        page.onUnload();
    }
});

test('系统相机被拒绝时显示系统设置入口，小程序设置回调可以先于 onShow', async () => {
    const denied = harness({ systemDenied: true });
    denied.page.start();
    assert.equal(denied.page.data.stage, 'system-permission');
    assert.equal(denied.requests.length, 0);
    const { page, wx, waitForModels } = harness();
    try {
        page.onHide();
        page.openCameraSettings();
        wx.settings.success({ authSetting: { 'scope.camera': true } });
        assert.equal(page.data.active, false);
        page.onShow();
        await waitForModels();
        assert.equal(page.data.active, true);
    } finally {
        page.onUnload();
    }
});

test('分享暂时隐藏页面时保留场景，解析失败时只废弃对应文件', async () => {
    const { page, waitForModels, invalidations } = harness();
    try {
        page.start();
        await waitForModels();
        page.onTracking();
        page.onModelsLoaded();
        page.setData({ placed: true });
        page.onShareAppMessage();
        page.onHide();
        assert.equal(page.data.active, true);
        assert.equal(page.data.placed, true);
        page.onShow();
        page.fail({ detail: { kind: 'model', key: 'plush', src: 'wxfile://usr/plush.glb' } });
        assert.deepEqual(invalidations, [['plush', 'wxfile://usr/plush.glb']]);
        assert.match(page.data.hint, /重新下载/);
    } finally {
        page.onUnload();
    }
});

test('AR 屏幕向右拖动随视角反转本地 X 方向', () => {
    class Vector3 {
        setValue(x, y, z) { return Object.assign(this, { x, y, z }); }
        applyMatrix4() { return this; }
    }
    const { dragPosition } = xrMethods({ getXrFrameSystem: () => ({ Vector3, Camera: 'camera' }) });
    let facing = 1;
    const scene = {
        getNodeById: () => ({ worldMatrix: {} }),
        getElementById: () => ({ getComponent: () => ({
            convertWorldPositionToClip: (world, clip) => clip.setValue(facing * world.x, world.z, 0),
        }) }),
    };
    const viewport = { windowWidth: 400, windowHeight: 800 };
    assert.ok(dragPosition.call({ scene }, { x: 0, z: 0 }, 20, 0, viewport).x > 0);
    facing = -1;
    assert.ok(dragPosition.call({ scene }, { x: 0, z: 0 }, 20, 0, viewport).x < 0);
});
