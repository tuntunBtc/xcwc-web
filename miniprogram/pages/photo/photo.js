'use strict';

// 打卡合照页：交互状态机对齐 H5 src/checkin-page.js / checkin-generate.js。
// 照片全程在本机：wx.chooseMedia 选图 → Canvas 2D 合成 → USER_DATA_PATH 保存，
// 不调用任何照片上传接口；叽分与去重由 utils/guest-store.js 结算。
const store = require('../../utils/store');
const album = require('../../utils/photo-album');
const model = require('../../utils/photo-model');
const safeArea = require('../../utils/safe-area');

const ASSET = '/assets/photo/';
const PHOTO_FIT = ['cover', 'contain'];
const PHOTO_FIT_NAMES = ['铺满画面', '完整显示'];
const LOCATION_DEFAULT = '山野之间';
const CANVAS_ERROR = '合照画布暂时不可用，请重新加载。当前编辑会保留。';
const ASSET_ERROR = '合照素材暂时无法加载。照片会保留，请重新加载后继续。';

// 调试期无公开小鸟目录；H5 由 /api/checkin-catalog 提供未领取款式，这里用
// 固定的「未领取」占位，明确不可选，不按编码前缀伪造实体。
const LOCKED_BIRDS = [
    { id: 'catalog:xiaohuangying', name: '小黄莺', adopted: false },
    { id: 'catalog:guihua', name: '桂花小鸟', adopted: false },
    { id: 'catalog:fengyin', name: '枫音雀', adopted: false },
];

function bottomInsetRpx() {
    try {
        const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
        const width = info.windowWidth || 375;
        const screenHeight = info.screenHeight || 0;
        const area = info.safeArea;
        if (!area || typeof area.bottom !== 'number' || !screenHeight) return 0;
        const inset = screenHeight - area.bottom;
        return inset > 0 ? Math.round((inset * 750) / width) : 0;
    } catch (error) {
        return 0;
    }
}

function dims(image) {
    return {
        w: image.width || image.naturalWidth || 1000,
        h: image.height || image.naturalHeight || 1010,
    };
}

Page({
    data: {
        topInset: 176,
        toastBottom: 240,
        canvasHeightRpx: 560,
        points: 0,
        birds: [],
        selectedCount: 0,
        selectedSummary: '选一位小伙伴，一起出发吧',
        noBirds: true,
        dataError: '',
        assetError: '',
        albumError: '',
        styles: [],
        uploaded: false,
        uploadThumb: '',
        location: LOCATION_DEFAULT,
        editorOpen: false,
        previewTitle: '看看合照效果',
        previewBadge: '示例',
        photoFitIndex: 0,
        photoFitName: PHOTO_FIT_NAMES[0],
        photoFitOptions: PHOTO_FIT_NAMES,
        showPhotoPositionX: false,
        showPhotoPositionY: false,
        photoX: 50,
        photoY: 50,
        activeIndex: 0,
        activeNames: [],
        activeName: '',
        size: 34,
        sizeValue: '34',
        selectionVisible: false,
        selectionBox: { left: 0, top: 0, width: 0, height: 0 },
        generateText: '生成并收藏',
        generateDisabled: true,
        downloadDisabled: true,
        draftNote: '切换页面会保留当前编辑内容；关闭小程序后不保留。',
        albumTotal: 0,
        albumCapacityText: '已用 0 / 30 张',
        albumEntries: [],
        albumExpanded: false,
        albumManaging: false,
        viewAllVisible: false,
        viewAllText: '',
        manageVisible: false,
        manageText: '管理合照',
        albumFullVisible: false,
        albumFoot: '还没有合照，和小鸟一起收藏第一张回忆吧',
        deleteConfirm: false,
        deleteTitle: '删除这张合照？',
        deleteStatus: '',
        viewer: null,
        toast: '',
    },

    onLoad() {
        this.toastTimer = null;
        this.frameTimer = null;
        this.audio = null;
        this.canvasVersion = 0;
        this.unloaded = false;
        this.resetCanvas();
        this.photoPath = '';
        this.uploaded = false;
        this.birds = [];
        this.selected = [];
        this.poses = {};
        this.active = null;
        this.style = 0;
        this.photoFit = 'cover';
        this.photoX = 50;
        this.photoY = 50;
        this.ready = false;
        this.busy = false;
        this.choosingPhoto = false;
        this.readingPhoto = false;
        this.dirty = true;
        this.albumAvailable = false;
        this.albumLoading = false;
        this.albumTotal = 0;
        this.entries = [];
        this.pendingSubmission = null;
        this.deleteEntry = null;
        this.deleteBusy = false;

        const inset = bottomInsetRpx();
        this.setData({
            topInset: safeArea.readTopInsetRpx(),
            toastBottom: 149 + inset + 48,
            canvasHeightRpx: 560,
            styles: model.STYLES.map(function (item, index) {
                return { name: item.name, thumb: ASSET + 'style-' + index + '.webp', selected: index === 0 };
            }),
        });
        this.loadBirds();
        this.loadAlbum();
        this.restoreDraft();
        this.syncGenerate();
    },

    onReady() {
        if (this.data.editorOpen) {
            this.prepareCanvasImages();
        }
    },

    onShow() {
        this.refreshPoints();
        this.loadBirds();
        this.syncGenerate();
    },

    onResize() {
        if (!this.canvas) return;
        this.clearGesture();
        const version = this.canvasVersion;
        wx.createSelectorQuery().in(this).select('#preview').fields({ size: true }).exec((res) => {
            const item = res && res[0];
            if (version === this.canvasVersion && item && item.width && item.height) {
                this.canvasSize = { width: item.width, height: item.height };
            }
        });
    },

    onHide() {
        this.clearGesture();
        this.saveDraft();
        this.clearTimers();
        if (this.audio) {
            try { this.audio.stop(); } catch (error) { /* ignore */ }
        }
    },

    onUnload() {
        this.saveDraft();
        this.unloaded = true;
        this.clearTimers();
        this.resetCanvas();
        if (this.audio) {
            try { this.audio.destroy(); } catch (error) { /* ignore */ }
            this.audio = null;
        }
    },

    clearTimers() {
        if (this.toastTimer) { clearTimeout(this.toastTimer); this.toastTimer = null; }
        if (this.frameTimer) { clearTimeout(this.frameTimer); this.frameTimer = null; }
    },

    noop() {},

    // ---------- 顶部与提示 ----------
    onBack() {
        wx.navigateBack({
            fail: function () { wx.switchTab({ url: '/pages/index/index' }); },
        });
    },

    onPoints() {
        this.showToast('本机叽分：' + this.pointsNow() + '，仅保存在当前手机');
    },

    pointsNow() {
        const result = store.snapshot();
        const snapshot = result.data && result.data.snapshot;
        return snapshot ? snapshot.points : this.data.points;
    },

    refreshPoints() {
        this.setData({ points: this.pointsNow() });
    },

    showToast(text) {
        if (this.toastTimer) clearTimeout(this.toastTimer);
        this.setData({ toast: text });
        const page = this;
        this.toastTimer = setTimeout(function () {
            page.setData({ toast: '' });
            page.toastTimer = null;
        }, 2800);
    },

    // ---------- 小鸟名单 ----------
    loadBirds() {
        const result = store.snapshot();
        const snap = result.data ? result.data.snapshot : null;
        if (!snap) {
            this.setData({ dataError: '小鸟资料暂时无法读取，请重试。已收藏的合照仍可在下方查看。', noBirds: true });
            this.ready = false;
            return;
        }
        const birds = [];
        if (snap.hasBird) {
            birds.push({ id: snap.birdCode || 'local-bird', name: snap.nickname || '小黄莺', adopted: true });
        }
        for (let i = 0; i < LOCKED_BIRDS.length; i += 1) birds.push(LOCKED_BIRDS[i]);
        this.birds = birds;
        const owned = birds.filter(function (bird) { return bird.adopted; });
        const previous = this.selected.filter(function (id) {
            return owned.some(function (bird) { return bird.id === id; });
        });
        this.selected = previous.length ? previous : (owned.length ? [owned[0].id] : []);
        this.poses = model.reconcilePoses(this.selected, this.poses);
        this.active = this.selected.indexOf(this.active) >= 0 ? this.active : (this.selected[0] || null);
        this.ready = true;
        this.setData({
            birds: this.birdCards(),
            selectedCount: this.selected.length,
            selectedSummary: this.selectionSummary(),
            noBirds: !snap.hasBird,
            points: snap.points,
            dataError: '',
        });
    },

    birdCards() {
        const selected = this.selected;
        return this.birds.map(function (bird) {
            return { id: bird.id, name: bird.name, adopted: bird.adopted, selected: selected.indexOf(bird.id) >= 0 };
        });
    },

    birdName(id) {
        for (let i = 0; i < this.birds.length; i += 1) {
            if (this.birds[i].id === id) return this.birds[i].name;
        }
        return '';
    },

    selectionSummary() {
        if (!this.selected.length) return '选一位小伙伴，一起出发吧';
        const names = [];
        for (let i = 0; i < this.selected.length; i += 1) names.push(this.birdName(this.selected[i]));
        return '已选 ' + names.join('、');
    },

    onRetryData() {
        this.loadBirds();
        this.syncGenerate();
    },

    onBirdTap(event) {
        if (this.busy) return;
        const id = event.currentTarget.dataset.id;
        const result = model.chooseBird(this.selected, id, this.birds);
        if (result.error) { this.showToast(result.error); return; }
        this.selected = result.selected;
        this.poses = model.reconcilePoses(this.selected, this.poses);
        this.active = this.selected.indexOf(this.active) >= 0 ? this.active : (this.selected[this.selected.length - 1] || null);
        if (result.selected.indexOf(id) >= 0) this.active = id;
        this.setData({
            birds: this.birdCards(),
            selectedCount: this.selected.length,
            selectedSummary: this.selectionSummary(),
        });
        this.scheduleUpdate();
    },

    // ---------- 选图 ----------
    onChoosePhoto() {
        if (this.busy || this.choosingPhoto || this.readingPhoto) return;
        this.choosingPhoto = true;
        const page = this;
        wx.chooseMedia({
            count: 1,
            mediaType: ['image'],
            sourceType: ['album', 'camera'],
            sizeType: ['original'],
            success: function (res) { page.readPhoto(res.tempFiles && res.tempFiles[0]); },
            fail: function (error) {
                const message = String((error && error.errMsg) || '');
                if (!page.unloaded && message.indexOf('cancel') < 0) page.showToast('没有打开照片，请再试一次');
            },
            complete: function () { page.choosingPhoto = false; },
        });
    },

    async readPhoto(file) {
        if (this.unloaded || this.busy || this.readingPhoto || !file || !file.tempFilePath) return;
        const name = String(file.tempFilePath).toLowerCase();
        if (!/\.(jpe?g|png|webp|heic|heif)$/.test(name)) {
            this.showToast('请选择手机拍摄的照片或 JPG、PNG、WEBP 图片');
            return;
        }
        if (file.size && Number(file.size) > 15 * 1024 * 1024) {
            this.showToast('照片超过 15 MB，换一张小一点的吧');
            return;
        }
        this.readingPhoto = true;
        this.clearGesture();
        this.syncGenerate();
        this.showToast('正在读取照片…');
        const version = this.canvasVersion;
        try {
            // 先挂载画布再解码。已经打开时复用当前画布，让旧照片和构图在换图期间继续显示。
            if (!this.data.editorOpen) {
                await new Promise((resolve) => this.setData({ editorOpen: true }, resolve));
            }
            if (version !== this.canvasVersion) return;
            if (this.canvasPreparation) await this.canvasPreparation;
            if (version !== this.canvasVersion) return;
            const ready = await this.initCanvas();
            if (version !== this.canvasVersion) return;
            if (!ready) {
                this.setData({ assetError: CANVAS_ERROR });
                this.showToast(CANVAS_ERROR);
                return;
            }
            const photo = await this.loadCanvasImage(this.canvas, file.tempFilePath, true);
            if (version !== this.canvasVersion) return;

            this.photo = photo;
            this.photoPath = file.tempFilePath;
            this.uploaded = true;
            this.photoX = 50;
            this.photoY = 50;
            this.dirty = true;
            this.pendingSubmission = null;
            this.setData({ uploaded: true, uploadThumb: file.tempFilePath });
            const prepared = await this.prepareCanvasImages();
            if (version === this.canvasVersion) {
                this.showToast(prepared ? '照片就位！可以拖动每只小鸟调整位置' : ASSET_ERROR);
            }
        } catch (error) {
            if (version !== this.canvasVersion) return;
            this.showToast('照片没能打开，可能文件损坏或格式暂不支持，请换一张照片重试');
            if (this.canvas && !this.canvasReady) await this.prepareCanvasImages();
        } finally {
            if (version === this.canvasVersion) {
                this.readingPhoto = false;
                this.syncPhotoControls();
                this.syncGenerate();
            }
        }
    },

    // ---------- Canvas ----------
    resetCanvas() {
        // 编辑器开合会销毁并重建 <canvas>：旧节点 createImage() 出的图片不能跨节点复用。
        this.canvasVersion += 1;
        this.canvas = null;
        this.ctx = null;
        this.canvasPromise = null;
        this.canvasPreparation = null;
        this.canvasSize = null;
        this.photo = null;
        this.birdImage = null;
        this.exampleImage = null;
        this.canvasReady = false;
        this.canvasLoading = false;
        this.clearGesture();
    },

    async initCanvas() {
        if (this.canvas) return true;
        if (this.canvasPromise) return this.canvasPromise;
        const version = this.canvasVersion;
        const pending = new Promise((resolve) => {
            wx.createSelectorQuery().in(this).select('#preview').fields({ node: true, size: true })
                .exec((res) => resolve(res && res[0]));
        }).then((item) => {
            if (version !== this.canvasVersion || !item || !item.node || !item.width || !item.height) return false;
            const canvas = item.node;
            canvas.width = model.CANVAS_W;
            canvas.height = model.CANVAS_H;
            const ctx = canvas.getContext('2d');
            if (!ctx) return false;
            this.canvas = canvas;
            this.ctx = ctx;
            this.canvasSize = { width: item.width, height: item.height };
            return true;
        }).catch(() => false);
        this.canvasPromise = pending;
        try {
            return await pending;
        } finally {
            if (this.canvasPromise === pending) this.canvasPromise = null;
        }
    },

    loadCanvasImage(canvas, path, direct) {
        return new Promise(function (resolve, reject) {
            const image = canvas.createImage();
            image.onload = function () { resolve(image); };
            image.onerror = function () { reject(new Error('图片无法解码')); };
            if (!direct && path.charAt(0) === '/') {
                // 包内资源先经 getImageInfo 换成本地路径，兼容 Canvas 2D 的 Image.src。
                wx.getImageInfo({
                    src: path,
                    success: function (res) { image.src = res.path; },
                    fail: function () { image.src = path; },
                });
            } else {
                image.src = path;
            }
        });
    },

    prepareCanvasImages() {
        if (this.unloaded || !this.data.editorOpen) return;
        if (this.canvasPreparation) return this.canvasPreparation;
        const version = this.canvasVersion;
        this.canvasLoading = true;
        this.canvasReady = false;
        this.syncGenerate();
        const pending = this.initCanvas().then(async (ready) => {
            if (version !== this.canvasVersion) return false;
            if (!ready) {
                this.setData({ assetError: CANVAS_ERROR });
                return false;
            }
            const canvas = this.canvas;
            const bird = this.birdImage || await this.loadCanvasImage(canvas, ASSET + 'bird.webp');
            const backdrop = this.uploaded
                ? this.photo || await this.loadCanvasImage(canvas, this.photoPath, true)
                : this.exampleImage || await this.loadCanvasImage(canvas, ASSET + 'example.webp');
            if (version !== this.canvasVersion) return false;
            this.birdImage = bird;
            if (this.uploaded) this.photo = backdrop;
            else this.exampleImage = backdrop;
            this.canvasReady = true;
            this.setData({ assetError: '' });
            return true;
        }).catch(() => {
            if (version === this.canvasVersion) this.setData({ assetError: ASSET_ERROR });
            return false;
        }).finally(() => {
            if (version !== this.canvasVersion) return;
            this.canvasPreparation = null;
            this.canvasLoading = false;
            if (this.canvasReady) {
                this.update(false);
            } else {
                this.render();
                this.syncSelection();
                this.syncGenerate();
                this.saveDraft();
            }
        });
        this.canvasPreparation = pending;
        return pending;
    },

    onRetryAssets() {
        if (!this.busy && !this.readingPhoto) return this.prepareCanvasImages();
    },

    birdRatio() {
        if (!this.birdImage) return 1;
        const box = dims(this.birdImage);
        return box.h / box.w;
    },

    render() {
        const ctx = this.ctx;
        if (!ctx) return;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#fffdf4';
        ctx.fillRect(0, 0, model.CANVAS_W, model.CANVAS_H);
        const image = this.uploaded ? this.photo : this.exampleImage;
        if (image) {
            const box = dims(image);
            const frame = model.photoPlacement(box.w, box.h, this.photoFit, this.photoX, this.photoY);
            ctx.save();
            ctx.beginPath();
            ctx.rect(model.FRAME.x, model.FRAME.y, model.FRAME.w, model.FRAME.h);
            ctx.clip();
            ctx.drawImage(image, frame.x, frame.y, frame.width, frame.height);
            if (this.style !== 0) {
                try {
                    const pixels = ctx.getImageData(model.FRAME.x, model.FRAME.y, model.FRAME.w, model.FRAME.h);
                    model.applyFilter(pixels.data, this.style);
                    ctx.putImageData(pixels, model.FRAME.x, model.FRAME.y);
                } catch (error) { /* 低版本不支持像素读回时退回无滤镜 */ }
            }
            ctx.restore();
            if (this.birdImage) {
                const ratio = this.birdRatio();
                for (let i = 0; i < this.selected.length; i += 1) {
                    const pose = this.poses[this.selected[i]];
                    if (!pose) continue;
                    const rect = model.rectFor(pose, ratio);
                    ctx.save();
                    try {
                        ctx.shadowColor = 'rgba(38,49,30,.22)';
                        ctx.shadowBlur = 14;
                        ctx.shadowOffsetY = 7;
                    } catch (error) { /* ignore */ }
                    ctx.drawImage(this.birdImage, rect.x, rect.y, rect.w, rect.h);
                    ctx.restore();
                }
            }
        }
        const label = String(this.data.location || '').trim() || '在路上';
        ctx.fillStyle = '#556744';
        ctx.font = '30px "Noto Serif SC", serif';
        ctx.textAlign = 'left';
        ctx.fillText('⌖ ' + label, 55, 915);
        ctx.fillStyle = '#b19d78';
        ctx.font = '16px Georgia';
        ctx.textAlign = 'right';
        ctx.fillText('A LITTLE MOMENT WITH YOU', 944, 915);
        ctx.textAlign = 'left';
        ctx.fillStyle = '#9b9e88';
        ctx.font = '15px Georgia';
        ctx.fillText('BIRD & BEYOND', 55, 962);
        ctx.textAlign = 'right';
        ctx.fillText('OUR TRAVEL DIARY', 944, 962);
        ctx.textAlign = 'left';
    },

    update(markDirty) {
        if (this.frameTimer) { clearTimeout(this.frameTimer); this.frameTimer = null; }
        if (markDirty !== false) {
            this.dirty = true;
            this.pendingSubmission = null;
        }
        const ratio = this.birdRatio();
        for (let i = 0; i < this.selected.length; i += 1) {
            const pose = this.poses[this.selected[i]];
            if (pose) model.constrain(pose, ratio);
        }
        this.render();
        this.syncSelection();
        this.syncPhotoControls();
        this.setData({
            previewBadge: this.uploaded ? (this.dirty ? '编辑中' : '已收藏') : '示例',
            previewTitle: this.uploaded ? '调整我们的合照' : '看看合照效果',
        });
        this.syncGenerate();
        this.saveDraft();
    },

    scheduleUpdate() {
        this.dirty = true;
        this.pendingSubmission = null;
        this.syncGenerate();
        if (this.frameTimer) return;
        const page = this;
        this.frameTimer = setTimeout(function () { page.frameTimer = null; page.update(); }, 16);
    },

    flushUpdate() {
        if (this.frameTimer) this.update();
    },

    syncSelection() {
        const active = this.active;
        const pose = active ? this.poses[active] : null;
        const hasImage = !!(this.uploaded ? this.photo : this.exampleImage);
        const patch = {
            selectionVisible: !!(active && pose && hasImage && this.data.editorOpen),
            activeName: active ? this.birdName(active) : '',
            activeIndex: Math.max(0, this.selected.indexOf(active)),
            activeNames: this.selected.map((id) => this.birdName(id)),
            size: pose ? Math.round(pose.size) : 34,
            sizeValue: String(pose ? Math.round(pose.size) : 34),
        };
        if (pose) {
            const rect = model.rectFor(pose, this.birdRatio());
            patch.selectionBox = {
                left: rect.x / 10,
                top: rect.y / 10.1,
                width: rect.w / 10,
                height: rect.h / 10.1,
            };
        }
        this.setData(patch);
    },

    syncPhotoControls() {
        const image = this.uploaded ? this.photo : this.exampleImage;
        const box = image ? dims(image) : null;
        const frame = box ? model.photoPlacement(box.w, box.h, this.photoFit, this.photoX, this.photoY) : null;
        this.setData({
            photoFitIndex: this.photoFit === 'contain' ? 1 : 0,
            photoFitName: PHOTO_FIT_NAMES[this.photoFit === 'contain' ? 1 : 0],
            photoX: this.photoX,
            photoY: this.photoY,
            showPhotoPositionX: !!(this.uploaded && this.photoFit === 'cover' && frame && frame.horizontal),
            showPhotoPositionY: !!(this.uploaded && this.photoFit === 'cover' && frame && frame.vertical),
        });
    },

    syncGenerate() {
        const hasBird = this.birds.some(function (bird) { return bird.adopted; });
        const state = model.generateState({
            ready: this.ready,
            canvasReady: this.canvasReady,
            canvasLoading: this.canvasLoading,
            hasBird: hasBird,
            selectedCount: this.selected.length,
            uploaded: this.uploaded,
            dirty: this.dirty,
            albumAvailable: this.albumAvailable,
            albumLoading: this.albumLoading,
            albumTotal: this.albumTotal,
            busy: this.busy,
            readingPhoto: this.readingPhoto,
        });
        this.setData({
            generateText: state.text,
            generateDisabled: state.disabled,
            downloadDisabled: !(this.ready && this.canvasReady && this.uploaded && !this.busy && !this.readingPhoto),
            points: this.pointsNow(),
        });
    },

    // ---------- 控件 ----------
    toggleEditor() {
        if (this.busy || this.readingPhoto) return;
        const open = !this.data.editorOpen;
        this.resetCanvas();
        const version = this.canvasVersion;
        if (open) {
            this.setData({ editorOpen: true }, () => {
                if (version === this.canvasVersion) this.prepareCanvasImages();
            });
        } else {
            this.setData({ editorOpen: false });
            this.syncGenerate();
        }
    },

    onStyleTap(event) {
        if (this.busy) return;
        const index = Number(event.currentTarget.dataset.index);
        if (index < 0 || index >= model.STYLES.length) return;
        this.style = index;
        const styles = this.data.styles.map(function (item, i) {
            return { name: item.name, thumb: item.thumb, selected: i === index };
        });
        this.setData({ styles: styles });
        this.scheduleUpdate();
    },

    onLocationInput(event) {
        this.setData({ location: event.detail.value });
        this.scheduleUpdate();
    },

    onPhotoFitChange(event) {
        const index = Number(event.detail.value) === 1 ? 1 : 0;
        this.photoFit = PHOTO_FIT[index];
        this.update();
    },

    onPhotoXChange(event) {
        this.photoX = Number(event.detail.value);
        this.scheduleUpdate();
    },

    onPhotoYChange(event) {
        this.photoY = Number(event.detail.value);
        this.scheduleUpdate();
    },

    onActiveBirdChange(event) {
        const index = Number(event.detail.value);
        if (index >= 0 && index < this.selected.length) {
            this.active = this.selected[index];
            this.syncSelection();
            this.saveDraft();
        }
    },

    setSize(value) {
        if (!this.active || this.busy) return;
        const pose = this.poses[this.active];
        if (!pose) return;
        pose.size = Math.max(12, Math.min(55, Number(value)));
        model.constrain(pose, this.birdRatio());
        this.scheduleUpdate();
    },

    onSizeChange(event) { this.setSize(event.detail.value); },
    onSmaller() { this.setSize((this.poses[this.active] || { size: 34 }).size - 3); },
    onLarger() { this.setSize((this.poses[this.active] || { size: 34 }).size + 3); },

    onResetBird() {
        if (this.busy || !this.active) return;
        this.poses = model.resetPose(this.selected, this.poses, this.active);
        this.update();
    },

    // ---------- 触摸：拖动 / 双指缩放 ----------
    point(touch) {
        // CanvasTouch 的 x/y 相对画布本身，不受页面滚动影响；显示尺寸与导出像素分开。
        if (!this.canvasSize || !Number.isFinite(touch.x) || !Number.isFinite(touch.y)) return null;
        return {
            x: touch.x * model.CANVAS_W / this.canvasSize.width,
            y: touch.y * model.CANVAS_H / this.canvasSize.height,
        };
    },

    clearGesture() {
        this.pointers = {};
        this.gesture = null;
    },

    hit(point) {
        const ratio = this.birdRatio();
        for (let i = this.selected.length - 1; i >= 0; i -= 1) {
            const id = this.selected[i];
            const pose = this.poses[id];
            if (!pose) continue;
            const rect = model.rectFor(pose, ratio);
            if (point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h) return id;
        }
        return null;
    },

    startGesture() {
        const keys = Object.keys(this.pointers);
        const points = keys.map((key) => this.pointers[key]);
        if (!this.active || !points.length) { this.gesture = null; return; }
        const pose = this.poses[this.active];
        if (!pose) { this.gesture = null; return; }
        const copy = { cx: pose.cx, cy: pose.cy, size: pose.size };
        if (points.length >= 2) {
            this.gesture = {
                type: 'pinch',
                pose: copy,
                distance: Math.max(1, Math.sqrt(Math.pow(points[0].x - points[1].x, 2) + Math.pow(points[0].y - points[1].y, 2))),
                mid: { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 },
            };
        } else {
            this.gesture = { type: this.hit(points[0]) === this.active ? 'drag' : 'pending', pose: copy, start: points[0] };
        }
    },

    onTouchStart(event) {
        if (this.busy || this.readingPhoto || !this.canvasReady) return;
        const touches = event.touches || [];
        if (!touches.length) return;
        const first = this.point(touches[0]);
        if (!first) return;
        const hitId = Object.keys(this.pointers).length ? null : this.hit(first);
        this.clearGesture();
        for (let i = 0; i < touches.length && i < 2; i += 1) {
            const point = this.point(touches[i]);
            if (point) this.pointers[touches[i].identifier] = point;
        }
        if (hitId) this.active = hitId;
        this.syncSelection();
        this.startGesture();
    },

    onTouchMove(event) {
        const touches = event.touches || [];
        if (this.busy || this.readingPhoto || !this.canvasReady || !Object.keys(this.pointers).length) return;
        for (let i = 0; i < touches.length && i < 2; i += 1) {
            const key = touches[i].identifier;
            const point = this.point(touches[i]);
            if (point && Object.prototype.hasOwnProperty.call(this.pointers, key)) this.pointers[key] = point;
        }
        const gesture = this.gesture;
        if (!gesture || !this.active || gesture.type === 'pending') return;
        const keys = Object.keys(this.pointers);
        const points = keys.map((key) => this.pointers[key]);
        if (!points.length) return;
        const pose = this.poses[this.active];
        if (!pose) return;
        const ratio = this.birdRatio();
        if (gesture.type === 'pinch' && points.length >= 2) {
            const distance = Math.max(1, Math.sqrt(Math.pow(points[0].x - points[1].x, 2) + Math.pow(points[0].y - points[1].y, 2)));
            pose.size = gesture.pose.size * distance / gesture.distance;
            model.constrain(pose, ratio);
            const scale = pose.size / gesture.pose.size;
            pose.cx = (points[0].x + points[1].x) / 2 + (gesture.pose.cx - gesture.mid.x) * scale;
            pose.cy = (points[0].y + points[1].y) / 2 + (gesture.pose.cy - gesture.mid.y) * scale;
        } else {
            pose.cx = gesture.pose.cx + points[0].x - gesture.start.x;
            pose.cy = gesture.pose.cy + points[0].y - gesture.start.y;
            model.constrain(pose, ratio);
        }
        this.scheduleUpdate();
    },

    onTouchEnd(event) {
        this.flushUpdate();
        const changed = event.changedTouches || [];
        for (let i = 0; i < changed.length; i += 1) delete this.pointers[changed[i].identifier];
        this.startGesture();
    },

    onTouchCancel() {
        this.flushUpdate();
        this.clearGesture();
    },

    // ---------- 导出与收藏 ----------
    exportCanvas() {
        this.flushUpdate();
        return new Promise((resolve, reject) => {
            if (!this.canvas) return reject(new Error('合照画布未就绪'));
            wx.canvasToTempFilePath({
                canvas: this.canvas,
                x: 0, y: 0, width: model.CANVAS_W, height: model.CANVAS_H,
                destWidth: model.CANVAS_W, destHeight: model.CANVAS_H,
                fileType: 'jpg', quality: 0.9,
                success: function (res) { resolve(res.tempFilePath); },
                fail: function () { reject(new Error('合照生成失败')); },
            });
        });
    },

    playShutter() {
        try {
            if (!this.audio) {
                this.audio = wx.createInnerAudioContext();
                this.audio.src = ASSET + 'shutter.mp3';
            }
            this.audio.stop();
            this.audio.play();
        } catch (error) { /* 音频不可用时主流程继续 */ }
    },

    async onDownload() {
        if (this.data.downloadDisabled || this.busy || this.readingPhoto) return;
        this.busy = true;
        this.clearGesture();
        this.syncGenerate();
        try {
            const path = await this.exportCanvas();
            if (this.unloaded) return;
            this.openViewer(path, {
                label: String(this.data.location || '').trim() || '在路上',
                createdAt: 0,
                note: '预览合照 · 尚未收藏到打卡相册',
            });
        } catch (error) {
            if (!this.unloaded) this.showToast(error.message || '合照生成失败');
        } finally {
            this.busy = false;
            if (!this.unloaded) this.syncGenerate();
        }
    },

    async onGenerate() {
        if (this.data.generateDisabled || this.busy || this.readingPhoto) return;
        this.busy = true;
        this.clearGesture();
        this.syncGenerate();
        this.playShutter();
        try {
            if (!this.pendingSubmission) {
                const imagePath = await this.exportCanvas();
                if (this.unloaded) return;
                const digest = await album.digestOf(this.photoPath);
                const outputHash = await album.digestOf(imagePath);
                if (this.unloaded) return;
                this.pendingSubmission = {
                    id: album.requestId(),
                    imagePath: imagePath,
                    originalPath: this.photoPath,
                    digest: digest,
                    outputHash: outputHash,
                    birdIds: this.selected.slice(),
                    styleId: model.STYLES[this.style].id,
                    label: String(this.data.location || '').trim() || '在路上',
                    createdAt: Date.now(),
                };
                this.saveDraft();
            }
            const submission = this.pendingSubmission;
            const result = await album.create({
                id: submission.id,
                imagePath: submission.imagePath,
                originalPath: submission.originalPath,
                digest: submission.digest,
                outputHash: submission.outputHash,
                birdIds: submission.birdIds,
                styleId: submission.styleId,
                label: submission.label,
                createdAt: submission.createdAt,
            }, store);
            if (this.unloaded) return;
            if (result.error) {
                if (result.error === 'ALBUM_FULL') {
                    this.albumTotal = model.ALBUM_LIMIT;
                    this.renderGallery();
                    this.showToast('相册已满，请到下方管理合照；当前编辑会保留。');
                } else {
                    this.showToast(result.message || '收藏未完成，请原样重试');
                }
                return;
            }
            this.pendingSubmission = null;
            this.dirty = false;
            this.loadAlbum();
            this.refreshPoints();
            this.openViewer(result.item.image, {
                label: result.item.label,
                createdAt: result.item.createdAt,
                note: result.reward === 1 ? '已收藏到打卡相册 · +1 叽分' : '已收藏到打卡相册',
            });
            this.showToast(result.reward === 1
                ? '合照已收藏，叽分 +1 ✨'
                : '合照已收藏；本次未发叽分（原图重复或今日奖励已满）。');
            this.update(false);
        } catch (error) {
            if (!this.unloaded) this.showToast('合照还没收藏成功，请原样重试，不会重复发分');
        } finally {
            this.busy = false;
            if (!this.unloaded) {
                this.syncGenerate();
                this.saveDraft();
            }
        }
    },

    // ---------- 合照查看器 ----------
    openViewer(path, details) {
        const canShare = typeof wx.showShareImageMenu === 'function';
        const label = (details && details.label) || '';
        const time = details && details.createdAt ? model.formatDateTime(details.createdAt) : '';
        this.setData({
            viewer: {
                image: path,
                meta: [label, time].filter(Boolean).join(' · '),
                note: (details && details.note) || '',
                buttonText: '保存到手机相册',
                hint: canShare
                    ? '在系统菜单中选择「存储图像」，也可以长按合照保存。'
                    : '点击保存后会写入系统相册，也可以长按合照保存。',
                otherOpen: false,
            },
        });
    },

    onCloseViewer() {
        this.setData({ viewer: null });
    },

    onOtherWays() {
        if (!this.data.viewer) return;
        this.setData({ 'viewer.otherOpen': !this.data.viewer.otherOpen });
    },

    onSavePhoto() {
        const path = this.data.viewer && this.data.viewer.image;
        if (!path) return;
        if (typeof wx.showShareImageMenu === 'function') {
            const page = this;
            wx.showShareImageMenu({
                path: path,
                fail: function () {
                    page.setData({ 'viewer.hint': '系统菜单暂时无法打开，请长按上方合照，选择「存储图像」或「保存图片」。' });
                },
            });
            return;
        }
        this.saveToAlbum(path);
    },

    saveToAlbum(path) {
        const page = this;
        wx.saveImageToPhotosAlbum({
            filePath: path,
            success: function () { page.showToast('已保存到手机相册'); },
            fail: function (error) {
                const message = String((error && error.errMsg) || '');
                if (message.indexOf('auth deny') >= 0 || message.indexOf('authorize') >= 0) {
                    wx.showModal({
                        title: '需要相册权限',
                        content: '请在设置中允许保存图片到相册，也可以长按合照保存。',
                        confirmText: '去设置',
                        success: function (res) { if (res.confirm) wx.openSetting(); },
                    });
                } else {
                    page.showToast('保存未完成，可以长按合照保存或稍后重试');
                }
            },
        });
    },

    onPreviewImage() {
        const path = this.data.viewer && this.data.viewer.image;
        if (!path) return;
        wx.previewImage({ urls: [path], current: path });
    },

    // ---------- 本机相册 ----------
    loadAlbum() {
        this.albumLoading = true;
        this.syncGenerate();
        try {
            const recovery = album.recoverPending(store);
            const result = album.history();
            if (result.error) throw new Error('本机相册读取失败');
            this.entries = result.items;
            this.albumTotal = result.total;
            this.albumAvailable = true;
            this.setData({ albumError: recovery.error ? recovery.message : '' });
        } catch (error) {
            this.albumAvailable = false;
            this.setData({ albumError: '打卡相册暂时无法读取。可先查看大图保存合照，再重试。' });
        } finally {
            this.albumLoading = false;
            this.renderGallery();
            this.syncGenerate();
        }
    },

    renderGallery() {
        const total = this.albumTotal;
        const shown = this.data.albumExpanded ? this.entries : this.entries.slice(0, 4);
        const cards = shown.map(function (entry) {
            return {
                id: entry.id,
                label: entry.label,
                image: entry.image,
                dateText: model.formatDate(entry.createdAt),
                badge: entry.reward === 1 ? '+1 叽分' : '已收藏',
            };
        });
        this.setData({
            albumEntries: cards,
            albumTotal: total,
            albumCapacityText: '已用 ' + total + ' / 30 张',
            viewAllVisible: total > 4,
            viewAllText: !this.data.albumExpanded
                ? '查看全部 ' + total + ' 张'
                : (this.entries.length > shown.length ? '加载更多' : '收起'),
            manageVisible: total > 0,
            manageText: this.data.albumManaging ? '完成管理' : '管理合照',
            albumFullVisible: total >= model.ALBUM_LIMIT,
            albumFoot: this.entries.length
                ? '仅保存在当前手机 · 重要合照请保存到相册'
                : '还没有合照，和小鸟一起收藏第一张回忆吧',
        });
    },

    onViewAll() {
        const expanded = this.data.albumExpanded;
        if (!expanded) {
            this.setData({ albumExpanded: true }, () => this.renderGallery());
        } else if (this.entries.length > this.data.albumEntries.length) {
            this.renderGallery();
        } else {
            this.setData({ albumExpanded: false, albumManaging: false }, () => this.renderGallery());
        }
    },

    onManageAlbum() {
        const managing = !this.data.albumManaging;
        this.setData({ albumManaging: managing, albumExpanded: managing || this.data.albumExpanded }, () => this.renderGallery());
    },

    onManageFull() {
        this.setData({ albumManaging: true, albumExpanded: true }, () => this.renderGallery());
        this.showToast('请在下方合照卡片上选择「删除合照」腾出空间');
    },

    onRetryAlbum() {
        this.loadAlbum();
    },

    onMemoryTap(event) {
        const id = event.currentTarget.dataset.id;
        const item = album.detail(id);
        if (!item) { this.showToast('这张合照暂时无法读取'); return; }
        this.openViewer(item.image, {
            label: item.label,
            createdAt: item.createdAt,
            note: item.reward === 1 ? '已收藏到打卡相册 · +1 叽分' : '已收藏到打卡相册',
        });
    },

    onDeleteTap(event) {
        if (this.deleteBusy) return;
        const id = event.currentTarget.dataset.id;
        const item = album.detail(id);
        if (!item) return;
        this.deleteEntry = item;
        this.setData({ deleteConfirm: true, deleteTitle: '删除“' + item.label + '”这张合照？', deleteStatus: '' });
    },

    onCancelDelete() {
        if (this.deleteBusy) return;
        this.deleteEntry = null;
        this.setData({ deleteConfirm: false });
    },

    onConfirmDelete() {
        if (!this.deleteEntry || this.deleteBusy) return;
        this.deleteBusy = true;
        this.setData({ deleteStatus: '正在删除…' });
        const id = this.deleteEntry.id;
        const result = album.remove(id);
        if (result.error) {
            this.setData({ deleteStatus: (result.message || '删除失败') + '，可以重试。' });
        } else {
            this.entries = this.entries.filter(function (entry) { return entry.id !== id; });
            this.albumTotal = Math.max(0, this.albumTotal - 1);
            if (!this.albumTotal) this.setData({ albumManaging: false, albumExpanded: false });
            this.deleteEntry = null;
            this.setData({ deleteConfirm: false, deleteStatus: '' });
            this.renderGallery();
            this.loadAlbum();
            this.showToast('这张合照已删除，小鸟和叽分保持不变');
        }
        this.deleteBusy = false;
        this.syncGenerate();
    },

    // ---------- 编辑草稿（仅内存，路由往返恢复） ----------
    saveDraft() {
        album.saveDraft({
            photoPath: this.photoPath,
            uploaded: this.uploaded,
            selected: this.selected.slice(),
            active: this.active,
            poses: this.poses,
            style: this.style,
            location: this.data.location,
            photoFit: this.photoFit,
            photoX: this.photoX,
            photoY: this.photoY,
            dirty: this.dirty,
            editorOpen: this.data.editorOpen,
            pendingSubmission: this.pendingSubmission,
        });
    },

    restoreDraft() {
        const draft = album.readDraft();
        if (!draft) return;
        const owned = this.birds.filter(function (bird) { return bird.adopted; });
        this.selected = (draft.selected || []).filter(function (id) {
            return owned.some(function (bird) { return bird.id === id; });
        });
        this.poses = model.reconcilePoses(this.selected, draft.poses || {});
        this.active = this.selected.indexOf(draft.active) >= 0 ? draft.active : (this.selected[0] || null);
        this.style = Math.max(0, Math.min(model.STYLES.length - 1, Number(draft.style) || 0));
        this.photoFit = draft.photoFit === 'contain' ? 'contain' : 'cover';
        this.photoX = Number.isFinite(Number(draft.photoX)) ? Number(draft.photoX) : 50;
        this.photoY = Number.isFinite(Number(draft.photoY)) ? Number(draft.photoY) : 50;
        this.dirty = !!draft.dirty;
        this.pendingSubmission = draft.pendingSubmission || null;
        if (draft.uploaded && draft.photoPath) {
            this.uploaded = true;
            this.photoPath = draft.photoPath;
        }
        const styles = this.data.styles.map(function (item, index) {
            return { name: item.name, thumb: item.thumb, selected: index === this.style };
        }, this);
        this.setData({
            styles: styles,
            location: typeof draft.location === 'string' ? draft.location : LOCATION_DEFAULT,
            uploaded: this.uploaded,
            uploadThumb: this.uploaded ? this.photoPath : '',
            editorOpen: !!draft.editorOpen || this.uploaded,
            draftNote: '已恢复上次编辑。切换页面可继续保留，关闭小程序后不保留。',
            birds: this.birdCards(),
            selectedCount: this.selected.length,
            selectedSummary: this.selectionSummary(),
        });
    },
});
