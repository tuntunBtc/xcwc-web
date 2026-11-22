'use strict';

const { loadArModel, invalidateArModel } = require('./ar-models');
const BIRD_VIDEO_URL = 'https://assets.xinchengip.com/mini/ar-video/e94942f757195749252d542e26ca590a98f2b09847fe6bda824cbf0e356cbc12.mp4';

const BIRDS = [
    { key: 'original', label: '首轮', x: -0.13, z: 0.12 },
    { key: 'color', label: '配色', x: 0.13, z: 0.12 },
    { key: 'profile', label: '侧面精修', x: -0.13, z: -0.12 },
    { key: 'plush', label: '全身短绒', x: 0.13, z: -0.12 },
];
const clamp = value => Math.min(0.55, Math.max(-0.55, value));
const distance = touches => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);

function systemCameraDenied() {
    try {
        return wx.getAppAuthorizeSetting?.()?.cameraAuthorized === 'denied';
    } catch {
        return false;
    }
}

Page({
    data: {
        top: 24, menuHeight: 32, renderWidth: 1, renderHeight: 1, models: [], birds: BIRDS, selected: 'original',
        mode: 'models', videoUrl: '', preparing: false, active: false, loaded: false, tracking: false, planeReady: false, placed: false,
        stage: 'intro', hint: '',
    },

    onLoad() {
        this.visible = true;
        this.scale = 1;
        this.videoPosition = { x: 0, z: 0 };
        let menu = {};
        let info = {};
        try { menu = wx.getMenuButtonBoundingClientRect?.() || {}; } catch { /* Use defaults. */ }
        try { info = wx.getWindowInfo?.() || {}; } catch { /* Use defaults. */ }
        info = { windowWidth: 1, windowHeight: 1, ...info };
        this.viewport = info;
        const ratio = Math.min(info.pixelRatio || 1, 1.5);
        this.setData({
            top: menu.top || info.statusBarHeight || 24,
            menuHeight: menu.height || 32,
            renderWidth: Math.round(info.windowWidth * ratio),
            renderHeight: Math.round(info.windowHeight * ratio),
        });
        this.positions = new Map(BIRDS.map(bird => [bird.key, { x: bird.x, z: bird.z }]));
    },

    onShow() {
        this.visible = true;
        if (this.data.videoUrl && this.data.placed) this.selectComponent('#bird-xr')?.resumeVideo();
        this.overlayDeadline = 0;
        if (this.captureNotice) {
            const { action, error } = this.captureNotice;
            this.captureNotice = null;
            this.showCaptureResult(action, error);
        }
        if (this.systemSettingsPending && !systemCameraDenied()) {
            this.systemSettingsPending = false;
            this.resume = true;
        }
        if (this.resume) {
            this.resume = false;
            this.start();
        } else {
            this.watchStartup();
        }
    },

    onHide() {
        this.visible = false;
        if (this.data.videoUrl) this.selectComponent('#bird-xr')?.pauseVideo();
        this.drag = null;
        clearTimeout(this.startupTimer);
        if (this.data.active && (this.capturing || Date.now() <= this.overlayDeadline)) return;
        this.resume = this.resume || this.data.active || this.data.preparing;
        this.stop();
    },

    onUnload() {
        this.unloaded = true;
        this.selectComponent('#bird-xr')?.pauseVideo();
        this.preparation = null;
        this.visible = false;
        clearTimeout(this.startupTimer);
    },

    stop(nextState = {}, callback) {
        this.selectComponent('#bird-xr')?.pauseVideo();
        this.preparation = null;
        clearTimeout(this.startupTimer);
        this.drag = null;
        this.setData({
            preparing: false, active: false, loaded: false, tracking: false, planeReady: false, placed: false,
            ...nextState,
        }, callback);
    },

    start() {
        if (!this.visible || this.requesting || this.data.preparing || this.data.active) return;
        if (typeof wx.getXrFrameSystem !== 'function') {
            this.setData({ stage: 'error', hint: '这台设备暂不支持 AR，请更新微信后重试。' });
            return;
        }
        if (systemCameraDenied()) {
            this.showSystemCameraSettings();
            return;
        }
        this.requesting = true;
        wx.authorize({
            scope: 'scope.camera',
            success: () => this.mount(),
            fail: () => {
                if (!this.visible) return;
                if (systemCameraDenied()) this.showSystemCameraSettings();
                else this.setData({ stage: 'permission', hint: '请允许此小程序使用相机。' });
            },
            complete: () => {
                this.requesting = false;
                if (this.visible && this.resume) { this.resume = false; this.start(); }
            },
        });
    },

    chooseArMode(event) {
        if (this.data.active || this.data.preparing || this.requesting) return;
        const mode = event.currentTarget.dataset.mode === 'video' ? 'video' : 'models';
        if (mode !== this.data.mode) {
            this.scale = 1;
            this.videoPosition = { x: 0, z: 0 };
            this.positions = new Map(BIRDS.map(bird => [bird.key, { x: bird.x, z: bird.z }]));
        }
        this.setData({ mode, videoUrl: mode === 'video' ? BIRD_VIDEO_URL : '', stage: 'intro', hint: '' });
    },

    async mount() {
        if (!this.visible || this.data.preparing) return;
        const preparation = {};
        this.preparation = preparation;
        this.setData({ preparing: true });
        try {
            const birds = this.data.videoUrl ? [] : BIRDS;
            const sources = await Promise.all(birds.map(bird => loadArModel(bird.key)));
            if (this.preparation !== preparation) return;
            if (!this.visible) {
                this.resume = true;
                return;
            }
            const models = birds.map((bird, index) => {
                const { x, z } = this.positions.get(bird.key);
                return { key: bird.key, src: sources[index], x, z };
            });
            this.setData({ models, active: true, stage: 'scan', hint: '' });
            this.watchStartup();
        } catch (error) {
            console.warn('Nest AR model download failed', error?.errMsg || error?.message);
            if (this.preparation === preparation && this.visible) {
                this.setData({ stage: 'error', hint: '模型暂时没下载成功，请检查网络后重试。' });
            }
        } finally {
            if (this.preparation === preparation) {
                this.preparation = null;
                this.setData({ preparing: false });
            }
        }
    },

    openCameraSettings() {
        wx.openSetting({
            success: result => {
                if (!result.authSetting?.['scope.camera']) return;
                if (this.visible) this.start();
                else this.resume = true;
            },
            fail: () => this.setData({ hint: '无法打开权限设置，请在微信设置中允许相机。' }),
        });
    },

    showSystemCameraSettings() {
        this.setData({ stage: 'system-permission', hint: '请在手机系统设置中允许微信使用相机。' });
    },

    openSystemCameraSettings() {
        if (typeof wx.openAppAuthorizeSetting !== 'function') {
            this.showSystemCameraSettings();
            return;
        }
        this.systemSettingsPending = true;
        wx.openAppAuthorizeSetting({
            fail: () => {
                this.systemSettingsPending = false;
                this.showSystemCameraSettings();
            },
        });
    },

    onTracking() { this.markReady('tracking'); },
    onModelsLoaded() { this.markReady('loaded'); },
    onPlane(event) {
        if (this.data.active && !this.data.placed) {
            this.setData({ planeReady: event.detail.ready, ...(!event.detail.ready ? { hint: '' } : {}) });
        }
    },

    markReady(key) {
        if (!this.data.active) return;
        this.setData({ [key]: true });
        if (this.data.tracking && this.data.loaded) clearTimeout(this.startupTimer);
    },

    watchStartup() {
        clearTimeout(this.startupTimer);
        if (this.visible && this.data.active && (!this.data.tracking || !this.data.loaded)) {
            this.startupTimer = setTimeout(() => this.fail(), 16000);
        }
    },

    fail(event) {
        if (!this.data.active) return;
        const { kind, key, src } = event?.detail || {};
        if (kind === 'model') invalidateArModel(key, src);
        if (!this.visible) { this.resume = true; this.stop(); return; }
        this.stop();
        if (systemCameraDenied()) {
            this.showSystemCameraSettings();
            return;
        }
        const hint = kind === 'tracking'
            ? '平面追踪中断了。请对准光线充足的桌面后重试。'
            : kind === 'model'
                ? '模型无法读取，重试时会重新下载。'
                : kind === 'video' ? 'AR 视频没能加载，请检查网络后重试。' : 'AR 相机或模型没能加载，请重试。';
        this.setData({ stage: 'error', hint });
    },

    place() {
        if (this.data.placed || !this.data.tracking || !this.data.loaded || !this.data.planeReady) return;
        const scene = this.selectComponent('#bird-xr');
        try {
            if (!scene?.place()) {
                this.setData({ hint: '请把定位标记对准空旷的桌面，再试一次。' });
                return;
            }
        } catch (error) {
            console.warn('Nest AR placement failed', error?.message);
            this.setData({ hint: '这次没能摆放，请缓慢移动手机后再试一次。' });
            return;
        }
        this.setData({ placed: true, hint: '' });
        scene.zoom(this.scale);
        if (this.data.videoUrl) scene.moveVideo(this.videoPosition.x, this.videoPosition.z);
    },

    reposition() {
        if (!this.data.placed || this.capturing) return;
        const models = this.data.models.map(model => ({ ...model, ...this.positions.get(model.key) }));
        this.stop({ stage: 'reposition', hint: '正在重新识别平面…' }, () => {
            if (!this.visible) {
                this.resume = true;
                return;
            }
            this.setData({ models, active: true, stage: 'scan', hint: '' }, () => this.watchStartup());
        });
    },

    selectBird(event) {
        this.drag = null;
        this.setData({ selected: event.currentTarget.dataset.key });
    },

    dragStart(event) {
        if (!this.data.placed) return;
        this.drag = null;
        if (event.touches.length === 2) {
            const span = distance(event.touches);
            if (span > 0) this.drag = { span, scale: this.scale };
            return;
        }
        if (event.touches.length !== 1) return;
        const video = Boolean(this.data.videoUrl);
        const key = this.data.selected;
        const position = video ? this.videoPosition : this.positions.get(key);
        if (!position) return;
        const touch = event.touches[0];
        this.drag = { key, video, position, x: touch.clientX, y: touch.clientY };
    },

    dragMove(event) {
        if (!this.drag) return;
        const scene = this.selectComponent('#bird-xr');
        if (this.drag.span && event.touches.length === 2) {
            const scale = Math.max(0.45, Math.min(1.8, this.drag.scale * distance(event.touches) / this.drag.span));
            if (scene?.zoom(scale)) this.scale = scale;
            return;
        }
        if (this.drag.span || event.touches.length !== 1) {
            this.drag = null;
            return;
        }
        const touch = event.touches[0];
        const { key, video, position, x, y } = this.drag;
        const next = scene?.dragPosition(position, touch.clientX - x, touch.clientY - y, this.viewport);
        if (!next || !Number.isFinite(next.x) || !Number.isFinite(next.z)) return;
        const moved = { x: clamp(next.x), z: clamp(next.z) };
        if (video ? scene?.moveVideo(moved.x, moved.z) : scene?.move(key, moved.x, moved.z)) {
            if (video) this.videoPosition = moved;
            else this.positions.set(key, moved);
            this.drag = { key, video, position: moved, x: touch.clientX, y: touch.clientY };
        }
    },

    dragEnd() { this.drag = null; },

    photoActions() {
        if (!this.data.placed || this.capturing) return;
        this.holdForOverlay();
        wx.showActionSheet({
            itemList: ['保存到相册', '分享截图'],
            success: ({ tapIndex }) => { this.overlayDeadline = 0; return this.capture(tapIndex === 0 ? 'album' : 'share'); },
            fail: () => { this.overlayDeadline = 0; },
        });
    },

    async capture(action = 'share') {
        if (!this.data.placed || this.capturing) return;
        this.capturing = true;
        this.holdForOverlay();
        let error;
        try {
            const scene = this.selectComponent('#bird-xr');
            const success = action === 'album' ? await scene?.savePhoto() : await scene?.capture();
            if (!success) throw new Error('当前场景无法拍照');
        } catch (failure) {
            error = failure || new Error('当前场景无法拍照');
            console.warn('Nest AR capture failed', error.errMsg || error.message);
        } finally {
            this.capturing = false;
        }
        if (this.unloaded) return;
        if (action === 'album' || error) {
            this.overlayDeadline = 0;
            if (!this.visible && this.data.active) {
                this.resume = true;
                this.stop();
            }
            this.showCaptureResult(action, error);
        }
    },

    showCaptureResult(action, error) {
        if (!this.visible) {
            this.captureNotice = { action, error };
            return;
        }
        const message = String(error?.errMsg || error?.message || '').toLowerCase();
        if (message.includes('cancel')) return;
        const album = action === 'album';
        if (album && (Number(error?.errno) === 112 || /privacy.*(?:not declared|not configured|api banned)|scope is not declared/.test(message))) {
            wx.showToast({ title: '小程序暂未开通相册保存权限', icon: 'none' });
            return;
        }
        if (album && /(?:auth|permission|system).*(?:deny|denied|not authorized)|not authorized/.test(message)) {
            this.offerAlbumSettings(message);
            return;
        }
        const privacy = album && message.includes('privacy');
        const title = privacy ? '请按微信提示完成隐私授权'
            : !error ? '已保存到手机相册'
                : album ? '照片未保存，请重试' : '当前设备暂无法截图';
        wx.showToast({ title, icon: 'none' });
    },

    offerAlbumSettings(message) {
        let system = message.includes('system');
        try { system ||= wx.getAppAuthorizeSetting?.()?.albumAuthorized === 'denied'; } catch { /* Use the error message. */ }
        const open = system ? wx.openAppAuthorizeSetting : wx.openSetting;
        const content = system ? '请在手机系统设置中允许微信访问相册。' : '请在小程序设置中允许保存到相册。';
        this.holdForOverlay();
        wx.showModal({
            title: '需要相册权限',
            content,
            showCancel: typeof open === 'function',
            confirmText: typeof open === 'function' ? '去设置' : '知道了',
            success: result => {
                this.overlayDeadline = 0;
                if (!result.confirm || typeof open !== 'function') return;
                this.resume = this.data.active || this.data.preparing;
                this.stop();
                open.call(wx, { fail: () => {
                    wx.showToast({ title: '无法打开设置', icon: 'none' });
                    if (this.visible && this.resume) { this.resume = false; this.start(); }
                } });
            },
            fail: () => { this.overlayDeadline = 0; },
        });
    },

    holdForOverlay() {
        if (this.data.active) this.overlayDeadline = Date.now() + 3000;
    },

    goBack() {
        wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/index/index' }) });
    },

    onShareAppMessage() {
        this.holdForOverlay();
        return { title: '把桂花鸟放到你的桌上', path: '/pages/nest-ar/nest-ar' };
    },
});
