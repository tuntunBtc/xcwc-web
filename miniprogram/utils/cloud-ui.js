'use strict';
const store = require('./store');
const MESSAGES = {
    LOGIN_REQUIRED: '请先微信登录，恢复云端宠物', NO_ENDPOINT: '云端服务尚未配置，请联系工作人员',
    WX_IDENTITY_MIGRATION_REQUIRED: '账号资料正在升级，请联系工作人员',
    PET_NOT_FOUND: '这只小鸟的存档不可用，已重新读取名单', BIRD_INACTIVE: '实体已停用，可查看历史状态',
    PET_VERSION_CONFLICT: '宠物状态已在另一设备更新，请查看最新状态后重新操作',
    IDEMPOTENCY_CONFLICT: '操作编号与内容不一致，请联系工作人员',
    SUPPLY_DAY_CHANGED: '已进入新的一天，请查看最新状态后重新领取',
    NO_FOOD: '食物不足，去补给看看', NO_WATER: '水不足，去补给看看', INVENTORY_FULL: '库存已达到容量上限，未消耗领取资格',
    INVALID_NAME: '昵称需为 1–6 个字符', INVALID_NICKNAME: '昵称需为 1–6 个字符',
    INVALID_INPUT: '提交内容有误，请重新操作', INVALID_ACTION: '操作不可用，请更新小程序',
    INVALID_REQUEST_ID: '操作编号不可用，请更新小程序', INVALID_VERSION: '状态版本有误，请刷新',
    RESULT_PENDING: '结果尚未确认，请点“确认上次操作”，勿重复提交',
    OFFLINE: '离线，仅展示上次状态', NETWORK_ERROR: '网络不可用，仅展示上次状态',
    REFRESH_REQUIRED: '请先刷新云端状态，再操作', CONTEXT_CHANGED: '账号或小鸟已切换，请重新操作',
    BUSY: '正在保存，请稍候', RATE_LIMITED: '操作较频繁，请稍后再试',
    INVALID_RESPONSE: '服务响应暂时无法核对，请重试', RANDOM_UNAVAILABLE: '当前微信版本无法安全生成操作编号，请更新微信',
    STORAGE_UNAVAILABLE: '本机缓存无法保存，已暂停资产操作，请检查存储空间后重启',
    LOGIN_FAILED: '微信登录未完成，请重试', LOGOUT_LOCAL_ONLY: '已退出本机登录，网络恢复后旧会话将自然到期',
    WX_PHONE_UNCONFIGURED: '手机号登录尚未开放，可使用微信登录',
    WX_PHONE_UPSTREAM: '手机号验证暂不可用，请稍后重新授权',
    WX_PHONE_CODE_INVALID: '手机号授权已失效，请重新点击授权',
    WX_PHONE_DENIED: '未授权手机号，可继续使用微信登录',
    WX_PHONE_UNSUPPORTED: '暂时无法获取手机号，请更新微信或使用微信登录',
};
function message(code) { return MESSAGES[code] || '服务暂时不可用，请稍后重试'; }
function update(page) {
    if (!page.cloudVisible) return;
    const s = store.status();
    const text = !s.online ? message('OFFLINE') : s.pending ? message('RESULT_PENDING') : s.loading ? '正在恢复云端存档…' :
        s.error ? message(s.error) : !s.signedIn ? message('LOGIN_REQUIRED') : !s.synced ? '仅展示上次状态，请刷新' : '已同步云端';
    page.setData({ cloudStatus: s, cloudNotice: text });
    if (typeof page.refresh === 'function') page.refresh();
    else if (typeof page.loadProfile === 'function') page.loadProfile();
    else if (typeof page.render === 'function') page.render();
    else if (typeof page.loadBirds === 'function') page.loadBirds();
    else if (page.bird && typeof page.showBird === 'function') page.showBird(page.data.birdCode, page.bird);
}
async function run(page, fn) {
    if (page.cloudActionBusy) return null;
    page.cloudActionBusy = true;
    const generation = store.getExperienceGeneration(), view = page.cloudView;
    try {
        const result = await fn();
        if (!page.cloudVisible || page.cloudView !== view || generation !== store.getExperienceGeneration()) return null;
        return result;
    } finally { page.cloudActionBusy = false; }
}
function page(definition) {
    const show = definition.onShow, hide = definition.onHide, unload = definition.onUnload;
    return Object.assign(definition, {
        onShow() {
            this.cloudVisible = true; this.cloudView = (this.cloudView || 0) + 1;
            if (this.cloudUnsubscribe) this.cloudUnsubscribe();
            this.cloudUnsubscribe = store.subscribe(() => update(this));
            if (show) show.call(this);
            update(this); store.resume();
        },
        onHide() { this.cloudVisible = false; this.cloudView++; if (this.cloudUnsubscribe) this.cloudUnsubscribe(); if (hide) hide.call(this); },
        onUnload() { this.cloudVisible = false; this.cloudView++; if (this.cloudUnsubscribe) this.cloudUnsubscribe(); if (unload) unload.call(this); },
        async onCloudLogin() {
            const result = await store.loginWithWechat();
            if (this.cloudVisible && result.error) wx.showToast({ title: message(result.error), icon: 'none' });
        },
        async onCloudRetry() {
            const result = await store.resume();
            if (this.cloudVisible && result.error) wx.showToast({ title: message(result.error), icon: 'none' });
        },
    });
}
module.exports = { page, run, message };
