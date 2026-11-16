'use strict';

const store = require('../../utils/store');
const entry = require('../../utils/entry');
const safeArea = require('../../utils/safe-area');
const config = require('../../utils/config');
const cloudUI = require('../../utils/cloud-ui');

const TRAITS = ['温柔治愈', '热爱旅行', '好奇探索'];
const SUGGESTIONS = ['湖小叽', '西湖团团', '小桂', '啾啾', '慢慢'];

const ERROR_TEXT = {
    INVALID_CODE: '实体编码不可用，请从标签链接重新进入',
    INVALID_NICKNAME: '昵称需为 1–6 个字符',
    STORAGE_UNAVAILABLE: '本机数据暂时无法读写，请重试',
    BIRD_ALREADY_PRESENT: '当前设备已有一只小鸟，暂不支持领养第二只。',
};

function chars(value) {
    return Array.from(String(value || ''));
}

function label(value, fallback) {
    return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function readBottomInsetPx() {
    try {
        const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
        const inset = info.safeArea ? info.screenHeight - info.safeArea.bottom : 0;
        return Number.isFinite(inset) ? Math.max(0, inset) : 0;
    } catch (error) {
        return 0;
    }
}

Page(cloudUI.page({
    data: {
        topInset: 176,
        bottomInset: 0,
        showBackLink: false,
        birdCode: '',
        ready: false,
        alreadyMine: false,
        alreadyHaveBird: false,
        submitting: false,
        birdName: '等待识别',
        cityText: '—',
        styleText: '—',
        skinText: '—',
        traits: TRAITS,
        nicknameInput: '',
        validation: '',
        heading: '给小鸟取个名字吧～',
        buttonText: '读取资料后可领取',
        buttonDisabled: true,
        notice: '',
        noticeKind: 'info',
        retryVisible: false,
        actionNote: '',
    },

    onLoad(options) {
        this.entryOptions = options || {};
        // 站内跳入时返回上一页；直接打开时仅在领养资料出错后提供回小窝入口。
        this.setData({
            showBackLink: getCurrentPages().length > 1,
        });
        this.updateInsets();
        this.load();
    },

    onResize() {
        this.updateInsets();
    },

    onUnload() {
        this.unloaded = true;
        this.cancelLookup();
        clearTimeout(this.adoptTimer);
    },

    updateInsets() {
        this.setData({ topInset: safeArea.readTopInsetRpx(), bottomInset: readBottomInsetPx() });
    },

    cancelLookup() {
        this.lookupVersion = (this.lookupVersion || 0) + 1;
        if (this.lookupTask && typeof this.lookupTask.abort === 'function') this.lookupTask.abort();
        this.lookupTask = null;
    },

    showLookupError(notice, retryVisible) {
        this.setData({ notice: notice, noticeKind: 'error', retryVisible: retryVisible, buttonText: '读取资料后可领取' });
    },

    showBird(code, bird) {
        const result = store.snapshot();
        const snapshot = result.data && result.data.snapshot;
        if (!snapshot) {
            this.showLookupError(ERROR_TEXT.STORAGE_UNAVAILABLE, true);
            return;
        }
        const mine = snapshot.pets.find(p => p.birdId === bird.id);
        const alreadyMine = !!mine;
        const alreadyHaveBird = false;
        const nickname = alreadyMine ? mine.nickname : this.data.nicknameInput || bird.name;
        this.bird = bird;
        this.randomIndex = 0;
        this.setData({
            ready: !alreadyHaveBird,
            alreadyMine: alreadyMine,
            alreadyHaveBird: alreadyHaveBird,
            birdName: bird.name,
            cityText: bird.city,
            styleText: bird.style,
            skinText: bird.skin,
            nicknameInput: chars(nickname).slice(0, 6).join(''),
            heading: alreadyMine ? '它已经住进你的小窝啦' : (alreadyHaveBird ? '你的小窝已有一位伙伴' : '给小鸟取个名字吧～'),
            buttonText: alreadyMine ? '回小窝，看看它' : '孵化并领养',
            buttonDisabled: false,
            notice: alreadyHaveBird ? ERROR_TEXT.BIRD_ALREADY_PRESENT : '',
            noticeKind: 'info',
            retryVisible: false,
            actionNote: '插画为示意 · 确认领养后保存到微信账号，可换手机恢复。',
        });
    },

    load() {
        this.cancelLookup();
        const version = this.lookupVersion;
        const code = entry.readBirdCode(this.entryOptions);
        const nicknameInput = this.data.birdCode === code ? this.data.nicknameInput : '';
        this.bird = null;
        this.setData({
            birdCode: code, ready: false, alreadyMine: false, alreadyHaveBird: false,
            birdName: '等待识别', cityText: '—', styleText: '—', skinText: '—',
            nicknameInput: nicknameInput, validation: '', heading: '给小鸟取个名字吧～',
            buttonText: '正在读取资料…', buttonDisabled: true,
            notice: '', retryVisible: false, actionNote: '',
        });
        if (!code) {
            this.showLookupError('请碰一碰实体小鸟，并打开系统弹出的领取链接。', false);
            return;
        }
        if (!entry.isManufacturingCode(code)) {
            this.showLookupError(ERROR_TEXT.INVALID_CODE, false);
            return;
        }
        const testBird = config.DEBUG_DEMO_BIRD;
        if (config.DEVICE_SANDBOX_TEST === true && this.entryOptions.testBird === '1'
            && code === config.DEBUG_DEMO_BIRD_CODE && testBird && testBird.id) {
            this.showBird(code, testBird);
            return;
        }
        const base = (config.API_BASE || '').replace(/\/+$/, '');
        if (!base) {
            this.showLookupError('实体资料服务暂未配置。', false);
            return;
        }
        this.setData({ notice: '正在读取小鸟资料…', noticeKind: 'info' });
        const fail = () => {
            if (this.lookupVersion !== version) return;
            this.lookupTask = null;
            this.showLookupError('小鸟资料读取失败，请检查网络后重试。', true);
        };
        try {
            this.lookupTask = wx.request({
                url: base + '/api/birds/by-code/' + encodeURIComponent(code),
                method: 'GET',
                timeout: 10000,
                success: (response) => {
                    if (this.lookupVersion !== version) return;
                    this.lookupTask = null;
                    const bird = response.data;
                    if (response.statusCode === 404) {
                        this.showLookupError('没有查到这只实体小鸟，请核对标签链接。', false);
                    } else if (response.statusCode === 410 || (response.statusCode === 200 && bird && bird.active === false)) {
                        this.showLookupError('这只实体小鸟已停用，请联系工作人员。', false);
                    } else if (response.statusCode === 400) {
                        this.showLookupError(ERROR_TEXT.INVALID_CODE, false);
                    } else if (response.statusCode !== 200) {
                        fail();
                    } else if (!bird || bird.birdCode !== code || bird.active !== true || typeof bird.id !== 'string' || !bird.id) {
                        this.showLookupError('收到的实体资料与链接不一致，请重试。', true);
                    } else {
                        this.showBird(code, {
                            id: bird.id,
                            name: label(bird.name, label(bird.typeName, '小鸟')),
                            city: label(bird.cityName, '—'),
                            cityCode: label(bird.cityCode, ''),
                            style: label(bird.typeName, '—'),
                            skin: label(bird.skinName, '—'),
                        });
                    }
                },
                fail: fail,
            });
        } catch (error) {
            fail();
        }
    },

    handleRetry() {
        if (this.data.retryVisible) this.load();
    },

    handleBack() {
        if (this.data.submitting) return;
        this.leavePage(getCurrentPages().length > 1);
    },

    leavePage(backToPrevious) {
        if (this.unloaded || this.navigationPending) return;
        this.navigationPending = true;
        const fail = () => {
            if (this.unloaded) return;
            this.navigationPending = false;
            if (this.data.submitting) {
                this.setData({ submitting: false });
                this.showBird(this.data.birdCode, this.bird);
            }
            wx.showToast({ title: backToPrevious ? '暂时无法返回，请重试' : '小窝暂时打不开，请重试', icon: 'none' });
        };
        if (backToPrevious) {
            wx.navigateBack({ delta: 1, fail: fail });
        } else {
            wx.reLaunch({ url: '/pages/index/index', fail: fail });
        }
    },

    handleInput(event) {
        if (!this.data.ready || this.data.alreadyMine || this.data.submitting) return;
        const nickname = chars(event.detail.value).slice(0, 6).join('');
        this.setData({ nicknameInput: nickname, validation: '' });
        return nickname;
    },

    handleRandom() {
        if (!this.data.ready || this.data.alreadyMine || this.data.submitting) {
            return;
        }
        const list = SUGGESTIONS;
        const index = this.randomIndex || 0;
        this.randomIndex = index + 1;
        this.setData({ nicknameInput: list[index % list.length], validation: '' });
    },

    async handleAdopt() {
        if (this.navigationPending || this.data.buttonDisabled || this.data.submitting) return;
        if (this.data.alreadyMine || this.data.alreadyHaveBird) {
            const mine = store.snapshot().data.snapshot.pets.find(p => p.birdId === this.bird.id);
            if (mine) await store.selectPet(mine.petId);
            this.leavePage(false);
            return;
        }
        if (!this.data.ready || !this.bird) return;
        const nickname = String(this.data.nicknameInput || '').trim();
        const parts = chars(nickname);
        if (parts.length < 1 || parts.length > 6) {
            this.setData({ validation: '请输入 1–6 个字，也可以使用随机取名。' });
            return;
        }
        this.setData({ submitting: true, buttonDisabled: true, buttonText: '正在领取…' });
        const result = await cloudUI.run(this, () => store.adopt(this.bird.id, nickname));
        if (!result) { if (!this.unloaded) this.setData({ submitting: false, buttonDisabled: false }); return; }
        if (result.error) {
            this.setData({ submitting: false, buttonDisabled: false, buttonText: '孵化并领养' });
            if (result.error === 'BIRD_ALREADY_PRESENT') this.showBird(this.data.birdCode, this.bird);
            wx.showToast({ title: cloudUI.message(result.error), icon: 'none' });
            return;
        }
        wx.showToast({ title: '已保存到云端', icon: 'success' });
        this.adoptTimer = setTimeout(() => this.leavePage(false), 600);
    },
}));
