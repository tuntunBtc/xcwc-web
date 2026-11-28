'use strict';

const store = require('../../utils/store');
const entry = require('../../utils/entry');
const config = require('../../utils/config');
const tabBar = require('../../utils/tab-bar');
const rules = require('../../utils/nest-rules');
const nestLayout = require('../../utils/nest-layout');
const mediaBase = require('../../utils/corgi-media-base');
const nestInteractions = require('../../utils/nest-interactions');
const nestFoot = require('../../utils/nest-foot');
const cloudUI = require('../../utils/cloud-ui');
const werun = require('../../utils/werun');
const { presentSpark, sparkNotice } = require('./spark');
const { createButtonArt } = require('../../utils/nest-button-art');
const { ORIOLE_AVATAR, birdAvatar, isOriole, isOsmanthus } = require('../../utils/bird-preview-art');
// Replace just the published legacy normal pose in the nest. New brand artwork takes precedence.
const OSMANTHUS_LEGACY_NORMAL = '/ccff4d24b61965127a42f0e6a2921e1a.png';
const BACKGROUND_LABELS = ['暖阳卧室', '桂花鸟小屋', '当前配置', '紫色桂花鸟小屋', '紫色小窝·近景地毯'];
const STATUS_REFRESH_MS = 30000;
const DIARY_FADE_MS = 900;
const DIARY_LOAD_TIMEOUT_MS = 45000;
const HAPPY_ART = '/assets/nest/emotion-happy.webp';
const ANGRY_ART = '/assets/nest/emotion-angry.webp';
const TEST_ADOPTIONS = config.DEVICE_SANDBOX_TEST === true ? [
    { key: 'oriole', name: '西湖小黄莺', code: config.DEBUG_DEMO_BIRD_CODE },
    { key: 'osmanthus', name: '桂花鸟', code: config.DEBUG_OSMANTHUS_BIRD_CODE },
].filter(item => entry.isManufacturingCode(item.code)) : [];

// 共用雪碧图格位对应 H5 的 .tools .p0~p3、cards-1200 三格、hud-icons 3×2。
const TOOLS = Object.freeze([
    { key: 'supply', label: '补给', propClass: 'prop-supply' },
    { key: 'checkin', label: '合照打卡', propClass: 'prop-checkin' },
    { key: 'ar', label: 'AR' },
    { key: 'dress', label: '换装', propClass: 'prop-dress', hidden: true },
    { key: 'video', label: '播放' },
    { key: 'diary', label: '日记' },
]);
const DOCK = Object.freeze([
    { key: 'feed', label: '喂食', cardClass: 'card-feed' },
    { key: 'water', label: '添水', cardClass: 'card-water' },
    { key: 'touch', label: '摸摸', cardClass: 'card-touch' },
]);
const STAT_META = Object.freeze([
    { key: 'hunger', label: '饱食', iconClass: 'icon-food' },
    { key: 'water', label: '水分', iconClass: 'icon-water' },
    { key: 'mood', label: '心情', iconClass: 'icon-mood' },
]);

const CORGI_ACTIONS = [
    ['wagging-tail', '摇尾巴'], ['touch_response', '抚摸'], ['play_ball', '玩球'], ['belly_up', '翻肚皮'],
    ['shake', '握手'], ['bow', '鞠躬'], ['speak', '汪汪叫'], ['spin', '转圈'],
    ['close', '互动'], ['roll_over', '打滚'], ['beg', '拜拜'], ['play_dead', '装死'],
].map(([key, label]) => ({ key, label }));

const CORGI_STATES = [
    ['enter', '入场'], ['idle', '待机'], ['eating', '进食'], ['bath', '洗澡'],
    ['walk_dog', '遛狗'], ['speaking', '说话'], ['thinking_0', '思考一'], ['thinking_1', '思考二'],
    ['go-to-sleep', '入睡'], ['idle_sleeping', '睡眠待机'], ['get_up', '起床'], ['unboxing', '开箱'],
    ['close', '收起'], ['leave', '离场'],
].map(([key, label]) => ({ key, label }));

const BIRD_SLEEP_DELAY_MS = 30000;
const CORGI_LOAD_TIMEOUT_MS = 12000;
const CORGI_LOOP_STALL_MS = 4000;
const CORGI_CLIP_STALL_MS = 8000;
const CORGI_LOOP_MAX_RETRIES = 2;
const corgiMediaUrl = filename => typeof mediaBase === 'string' ? mediaBase + '/' + filename : mediaBase[filename];
const birdPosterUrl = filename => corgiMediaUrl(filename);
const BIRD_AWAKE_POSTER = birdPosterUrl('bird-awake.webp');
const BIRD_SLEEPING_POSTER = birdPosterUrl('bird-sleeping.webp');

const BIRD_ACTIONS = [
    { key: 'bird-doze', label: '小鸟瞌睡' },
];

const MENU_ACTIONS = { actions: CORGI_ACTIONS, states: CORGI_STATES, bird: BIRD_ACTIONS, work: [] };

const CORGI_JOBS = [
    { key: 'cafe', label: '鸟咖帮忙' },
    { key: 'model', label: '宠物模特' },
].map(job => {
    const photos = [1, 2, 3].map(frame => {
        const filename = 'work-' + job.key + '-' + frame + '.webp';
        return corgiMediaUrl(filename);
    });
    return { ...job, photos };
});

Page(cloudUI.page({
    data: {
        corgiCategory: 'actions',
        corgiActions: CORGI_ACTIONS,
        corgiPoster: corgiMediaUrl('poster.jpg'),
        osmanthusBackdropUrl: corgiMediaUrl('osmanthus-living-room.webp'),
        osmanthusBackdropActive: true,
        birdAwakePoster: BIRD_AWAKE_POSTER,
        birdScenePoster: BIRD_AWAKE_POSTER,
        corgiAction: 'bird-awake',
        corgiClips: [],
        corgiPlaying: false,
        corgiMenuOpen: false,
        corgiJobs: CORGI_JOBS,
        corgiJob: null,
        corgiWorkIndex: 0,
        // 静态兜底：onLoad 算出真实机型数值前，首帧也能正确布局。
        layout: {
            pageHeight: 1279, viewportHeight: 1428, tabBarHeight: 149, dockBottom: 9, toastBottom: 340, actorHeight: 322,
            // 顶部组首帧按「胶囊同排」典型机型（375px / 灵动岛）给值，onLoad 立刻用真机矩形覆盖；
            // hudRight 是胶囊左侧避让量，场景主体仍沿用上面的既有兜底。
            hudTop: 124, hudRight: 184, statusTop: 244, needsTop: 346, toolsTop: 386,
            speechTop: 506, claimTop: 641, actorTop: 750,
        },
        hasBird: false,
        birdOffsetX: 0,
        birdOffsetY: 0,
        nestLoginBusy: false,
        sparkDisplay: presentSpark(null, {}),
        storageUnavailable: false,
        displayName: '等待小鸟入住',
        placeText: '⌖ 我的小窝',
        birdCodeShort: '',
        points: 0,
        todayPoints: 0,
        dailyLimit: 10,
        food: 3,
        water: 3,
        satiety: 0,
        hydration: 0,
        mood: 0,
        supplyClaimed: false,
        testWeRun: config.ENABLE_WERUN_SUPPLIES === true,
        testSteps: null,
        testStepPointsAvailable: 0,
        testStepPointsRedeemed: 0,
        testStepsToNext: 0,
        testStepMessage: '',
        testStepBusy: false,
        testStepNeedsSetting: false,
        historyLoading: false,
        fixtureMode: config.USE_LOCAL_FIXTURE,
        testBirdAdoption: TEST_ADOPTIONS.length > 0,
        testAdoptions: TEST_ADOPTIONS.map(({ key, name }) => ({ key, name })),
        avatar: ORIOLE_AVATAR,
        ledger: [],
        stats: [],
        needs: [],
        needImageErrors: {},
        needFoodUrl: 'https://assets.xinchengip.com/mini/media/8eafcd32ac21c9635d1ee32d3e8fed3ddae9a6013f9ed743647b1f478712e65f.webp',
        needWaterUrl: 'https://assets.xinchengip.com/mini/media/571b68b9b59f49eafff430bf795cf527323bdc4fa05dcdec3214bcd04ffbcbdb.webp',
        speech: '',
        birdArt: '/assets/nest/poster.webp',
        thirsty: false,
        happy: false,
        motionPaused: false,
        diaryVideoVisible: false,
        diaryVideoPlaying: false,
        idleReady: false,
        idlePlaying: false,
        showIdleButton: false,
        toast: '',
        sheet: null,
        sheetMaskBottom: 149,        // 弹框遮罩底边：默认落在 tabBar 上沿（兜底值，onLoad 后精确化）
        keyboardHeightRpx: 0,        // 改名输入框唤起键盘时的高度（rpx），用于抬升面板
        renameValue: '',
        feedFxId: 0,                 // 喂食动效计数：每次喂食 +1，配合 wx:if 重触发谷粒动画
        waterFxId: 0,                // 添水动效计数：每次添水 +1，配合 wx:if 重触发水滴动画
        tools: TOOLS.filter(tool => !tool.hidden),
        dock: DOCK,
        dockRemoteImage: '',
        previewBackgroundIndex: 3,
        previewBackgroundCount: BACKGROUND_LABELS.length,
        lavenderBackgroundUrl: 'https://assets.xinchengip.com/mini/media/83477c3a0ac691ba7ff57a683c5ce6587bdcb2c1a9e3dd03f8230828e372d248.webp',
    },

    toggleCorgiMenu() {
        if (!this.cloudVisible || this.data.sheet) return;
        if (this.data.corgiJob) {
            this.closeCorgiWork();
            return;
        }
        this.setCorgiMenu(!this.data.corgiMenuOpen);
    },

    setCorgiMenu(open) {
        this.setData({ corgiMenuOpen: open });
        const bar = this.getTabBar && this.getTabBar();
        if (bar) bar.setData({ corgiMenuOpen: open });
        if (!open && this.cloudVisible && this.data.osmanthusBackdropActive) {
            this.birdSleepAnchorAt = Date.now();
        }
        this.scheduleBirdSleep();
    },

    toggleOsmanthusBackdrop() {
        if (!this.cloudVisible || !this.data.corgiMenuOpen) return;
        const nextBird = !this.data.osmanthusBackdropActive;
        this.setCorgiMenu(false);
        if (nextBird) {
            this.birdSleepAnchorAt = Date.now();
            this.showBirdClip('bird-awake');
        } else {
            this.showCorgiClip('idle');
        }
    },

    recordBirdTouch(reschedule = false) {
        this.birdSleepAnchorAt = Date.now();
        if (reschedule) this.scheduleBirdSleep();
    },

    onNestTouch() {
        if (!this.cloudVisible || !this.data.osmanthusBackdropActive || this.data.corgiMenuOpen || this.data.sheet) return;
        if (this.data.corgiAction === 'bird-awake') this.recordBirdTouch(true);
    },

    scheduleBirdSleep() {
        clearTimeout(this.birdSleepTimer);
        this.birdSleepTimer = null;
        if (!this.cloudVisible || !this.data.osmanthusBackdropActive || this.data.corgiMenuOpen || this.data.sheet || this.data.corgiAction !== 'bird-awake') return;
        if (this.nestPet && !['bird-doze','bird-sleeping','bird-wake'].every(key => this.publishedAction(key))) return;
        const anchor = this.birdSleepAnchorAt || (this.birdSleepAnchorAt = Date.now());
        const delay = Math.max(0, BIRD_SLEEP_DELAY_MS - (Date.now() - anchor));
        this.birdSleepTimer = setTimeout(() => {
            this.birdSleepTimer = null;
            if (!this.cloudVisible || !this.data.osmanthusBackdropActive || this.data.corgiMenuOpen || this.data.sheet || this.data.corgiAction !== 'bird-awake') return;
            this.showBirdClip('bird-doze');
        }, delay);
    },

    touchBirdScene() {
        if (!this.cloudVisible || !this.data.osmanthusBackdropActive || this.data.corgiMenuOpen || this.data.sheet) return;
        const phase = this.data.corgiAction;
        if (phase === 'bird-doze') {
            if (!this.birdWakePending) {
                this.birdWakePending = true;
                this.recordBirdTouch(false);
            }
            return;
        }
        if (phase === 'bird-sleeping') {
            this.recordBirdTouch(false);
            this.showBirdClip('bird-wake');
            return;
        }
        if (phase === 'bird-awake' && (!this.nestPet || this.publishedAction('bird-pet'))) {
            this.recordBirdTouch(false);
            this.showBirdClip('bird-pet');
        }
    },

    publishedAction(key) {
        const code = nestInteractions.codes[key] || (key.startsWith('bird-extra-') ? key.slice('bird-extra-'.length) : '');
        return this.nestBindings?.[code];
    },

    birdMenu() {
        if (!this.nestPet) return BIRD_ACTIONS;
        const menu = [{key:'bird-eat',label:'喂食',icon:'eating'}, {key:'bird-drink',label:'喂水',icon:'eating'}];
        if (this.publishedAction('bird-doze') && this.publishedAction('bird-sleeping') && this.publishedAction('bird-wake')) {
            menu.unshift(BIRD_ACTIONS[0]);
        }
        for (const action of Object.values(this.nestBindings || {})) {
            if (!Object.values(nestInteractions.codes).includes(action.code)) menu.push({key:'bird-extra-'+action.code,label:action.label,icon:'speak'});
        }
        return menu;
    },

    staticBird() {
        this.pauseCorgiVideo();
        clearTimeout(this.corgiLoadTimer);
        clearTimeout(this.birdSleepTimer);
        this.corgiToken = (this.corgiToken || 0) + 1;
        this.birdWakePending = false;
        this.setData({osmanthusBackdropActive:true,corgiClips:[],corgiPlaying:false,corgiAction:'bird-awake',
            birdScenePoster:this.nestPoster || BIRD_AWAKE_POSTER});
    },

    syncNestBindings(pet, avatar, force = false) {
        if (!this.cloudVisible) return;
        const petId = pet?.petId || '';
        const role = pet?.characterId || '';
        const key = [this.cloudView,petId,role].join('|');
        this.nestPoster = avatar || this.data.osmanthusBackdropUrl;
        if (this.nestSelection !== key) {
            this.nestSelection = key;
            this.nestToken = (this.nestToken || 0) + 1;
            this.nestPet = petId;
            this.nestBindings = null;
            this.nestRequest = null;
            this.nestRefreshAt = 0;
            if (this.data.osmanthusBackdropActive) {
                if (petId) this.staticBird();
                else this.showBirdClip('bird-awake');
            }
            if (this.data.corgiCategory === 'bird') this.setData({corgiActions:this.birdMenu()});
        }
        if (!petId || !role || this.nestRequest || (!force && Date.now() < this.nestRefreshAt)) return this.nestRequest;
        this.nestRefreshAt = Date.now() + STATUS_REFRESH_MS;
        const ticket = this.nestToken;
        this.nestRequest = nestInteractions.read(wx, config.API_BASE, role).then(actions => {
            if (!this.cloudVisible || this.nestToken !== ticket) return;
            this.nestRequest = null;
            this.nestBindings = actions;
            if (this.data.corgiCategory === 'bird') this.setData({corgiActions:this.birdMenu()});
            if (!this.data.osmanthusBackdropActive || this.data.corgiJob) return;
            const clip = this.data.corgiClips[0], current = this.publishedAction(this.data.corgiAction);
            if (clip && current?.url === clip.url && current.sound === clip.sound) return;
            if (this.publishedAction('bird-awake')) this.showBirdClip('bird-awake');
            else this.staticBird();
        });
        return this.nestRequest;
    },

    showBirdClip(key) {
        if (this.nestPet && !this.publishedAction(key)) {
            if (key !== 'bird-awake' && this.publishedAction('bird-awake')) return this.showBirdClip('bird-awake');
            this.staticBird();
            return;
        }
        this.showCorgiClip(key, key === 'bird-awake' || key === 'bird-sleeping', true);
    },

    onOsmanthusBackdropError(event) {
        if (!this.data.osmanthusBackdropActive || event.currentTarget.dataset.src !== this.data.birdScenePoster) return;
        if (this.nestPet && this.nestPoster && this.data.birdScenePoster !== this.nestPoster) {
            this.setData({birdScenePoster:this.nestPoster});
            return;
        }
        if (!this.nestPet && this.data.birdScenePoster !== this.data.osmanthusBackdropUrl) {
            this.setData({ birdScenePoster: this.data.osmanthusBackdropUrl });
        }
    },

    selectCorgiCategory(event) {
        const category = event.currentTarget.dataset.category;
        if (!this.cloudVisible || !this.data.corgiMenuOpen || category === this.data.corgiCategory) return;
        if (!Object.prototype.hasOwnProperty.call(MENU_ACTIONS, category)) return;
        this.setData({ corgiCategory: category, corgiActions: category === 'bird' ? this.birdMenu() : MENU_ACTIONS[category] });
    },

    selectCorgiJob(event) {
        if (!this.cloudVisible || !this.data.corgiMenuOpen || this.data.corgiCategory !== 'work') return;
        const job = CORGI_JOBS.find(item => item.key === event.currentTarget.dataset.job);
        if (!job) return;
        clearTimeout(this.corgiLoadTimer);
        this.corgiLoadTimer = null;
        clearTimeout(this.birdSleepTimer);
        this.birdSleepTimer = null;
        this.birdWakePending = false;
        this.corgiDeferredOutcome = null;
        this.corgiRetryCount = 0;
        this.corgiLastCurrentTime = null;
        this.corgiToken = (this.corgiToken || 0) + 1;
        this.setData({ corgiJob: job, corgiWorkIndex: 0, corgiClips: [], corgiPlaying: false });
    },

    changeCorgiWorkPhoto(event) {
        if (this.data.corgiJob?.key !== event.currentTarget.dataset.job) return;
        this.setData({ corgiWorkIndex: event.detail.current });
    },

    leaveCorgiJob() {
        this.setData({ corgiJob: null, corgiWorkIndex: 0 });
        if (!this.cloudVisible) return;
        if (this.data.osmanthusBackdropActive) this.showBirdClip('bird-awake');
        else this.showCorgiClip('idle');
    },

    closeCorgiWork() {
        this.leaveCorgiJob();
        this.setCorgiMenu(false);
    },

    playCorgiAction(event) {
        const key = event.currentTarget.dataset.key;
        if (!this.cloudVisible || !this.data.corgiMenuOpen) return;
        if (!this.data.corgiActions.some(action => action.key === key)) return;
        this.setCorgiMenu(false);
        if (key === 'close') return;
        if (key === 'bird-eat' || (key === 'eating' && this.nestPet && this.data.osmanthusBackdropActive)) {
            return this.doCare('feed', false);
        }
        if (key === 'bird-drink') return this.doCare('water', false);
        if (key.startsWith('bird-extra-')) {
            if (this.publishedAction(key)) this.showBirdClip(key);
            return;
        }
        if (key === 'bird-doze' && this.data.osmanthusBackdropActive) {
            if (this.data.corgiAction !== 'bird-sleeping' && this.data.corgiAction !== key) this.showBirdClip(key);
            return;
        }
        this.showCorgiClip(key, false);
        if (key === 'idle') wx.showToast({ title: '待机', icon: 'none', duration: 800 });
    },

    pauseCorgiVideo() {
        if (!this.data.corgiClips.length) return;
        try { wx.createVideoContext('corgi-player', this).pause(); } catch (error) { /* ignore */ }
    },

    playCorgiVideo() {
        if (!this.data.corgiClips.length) return;
        try { wx.createVideoContext('corgi-player', this).play(); } catch (error) { /* ignore */ }
    },

    armCorgiWatchdog(token, timeoutMs) {
        clearTimeout(this.corgiLoadTimer);
        this.corgiLoadTimer = null;
        if (!this.cloudVisible || this.data.sheet || token !== this.corgiToken || !this.data.corgiClips.length) return;
        this.corgiLoadTimer = setTimeout(() => {
            this.corgiLoadTimer = null;
            this.recoverCorgiClip(token);
        }, timeoutMs);
    },

    suspendCorgiForSheet() {
        this.corgiPausedBySheet = true;
        clearTimeout(this.corgiLoadTimer);
        this.corgiLoadTimer = null;
        clearTimeout(this.birdSleepTimer);
        this.birdSleepTimer = null;
        this.pauseCorgiVideo();
    },

    resumeCorgiAfterSheet() {
        if (!this.cloudVisible || this.data.sheet) return;
        this.corgiPausedBySheet = false;
        if (this.data.osmanthusBackdropActive) this.birdSleepAnchorAt = Date.now();
        const deferred = this.corgiDeferredOutcome;
        this.corgiDeferredOutcome = null;
        if (deferred && deferred.token === this.corgiToken) {
            if (deferred.type === 'ended') {
                this.restoreCorgiScene();
                return;
            }
            if (deferred.type === 'error') {
                this.recoverCorgiClip(deferred.token);
                return;
            }
        }
        const clip = this.data.corgiClips[0];
        if (clip) {
            if (!this.data.corgiPlaying) {
                this.armCorgiWatchdog(clip.token, CORGI_LOAD_TIMEOUT_MS);
            } else if (clip.loop || this.data.osmanthusBackdropActive) {
                this.armCorgiWatchdog(clip.token, clip.loop ? CORGI_LOOP_STALL_MS : CORGI_CLIP_STALL_MS);
            }
            this.playCorgiVideo();
        }
        this.scheduleBirdSleep();
    },

    showCorgiClip(key, loop = key === 'idle', bird = false) {
        this.birdWakePending = false;
        this.mountCorgiClip(key, loop, bird, 0);
    },

    mountCorgiClip(key, loop, bird, retryCount) {
        this.corgiToken = (this.corgiToken || 0) + 1;
        const token = this.corgiToken;
        this.corgiRetryCount = retryCount;
        this.corgiLastCurrentTime = null;
        this.corgiDeferredOutcome = null;
        this.corgiPausedBySheet = !!this.data.sheet;
        clearTimeout(this.corgiLoadTimer);
        this.corgiLoadTimer = null;
        const published = bird && this.nestPet ? this.publishedAction(key) : null;
        if (bird && this.nestPet && !published) return this.staticBird();
        this.setData({
            corgiAction: key,
            osmanthusBackdropActive: bird,
            birdScenePoster: published ? (published.poster || this.nestPoster) : (key === 'bird-sleeping' || key === 'bird-wake' ? BIRD_SLEEPING_POSTER : BIRD_AWAKE_POSTER),
            corgiPlaying: false,
            corgiClips: [{ key, token, loop, url: published ? published.url : corgiMediaUrl(key + '.mp4'), sound: published ? published.sound : !['idle','bird-sleeping'].includes(key) }],
        });
        if (!this.data.sheet) {
            this.armCorgiWatchdog(token, CORGI_LOAD_TIMEOUT_MS);
        }
        this.scheduleBirdSleep();
    },

    onCorgiPlay(event) {
        const token = Number(event.currentTarget.dataset.token);
        if (token !== this.corgiToken || !this.cloudVisible) return;
        if (this.data.sheet) this.pauseCorgiVideo();
    },

    onCorgiFrame(event) {
        const token = Number(event.currentTarget.dataset.token);
        if (token !== this.corgiToken || !this.cloudVisible) return;
        if (this.data.sheet) {
            this.pauseCorgiVideo();
            return;
        }
        const clip = this.data.corgiClips[0];
        if (!clip) return;
        const currentTime = Number(event.detail?.currentTime);
        const hasTime = Number.isFinite(currentTime);
        const prevTime = this.corgiLastCurrentTime;
        const firstFrame = !this.data.corgiPlaying;
        const wrapped = clip.loop && prevTime !== null && prevTime > 0.2 && currentTime < prevTime - 0.1;
        const advanced = hasTime && (prevTime === null || currentTime > prevTime + 0.01 || wrapped);
        if (!firstFrame && !advanced) return;
        if (hasTime) this.corgiLastCurrentTime = currentTime;
        if (firstFrame) this.setData({ corgiPlaying: true });
        if (clip.loop || this.data.osmanthusBackdropActive) {
            this.armCorgiWatchdog(token, clip.loop ? CORGI_LOOP_STALL_MS : CORGI_CLIP_STALL_MS);
        } else {
            clearTimeout(this.corgiLoadTimer);
            this.corgiLoadTimer = null;
        }
    },

    onCorgiEnded(event) {
        const token = Number(event.currentTarget.dataset.token);
        if (token !== this.corgiToken || !this.cloudVisible || this.data.corgiClips[0]?.loop) return;
        if (this.data.sheet) {
            this.corgiDeferredOutcome = { token, type: 'ended' };
            return;
        }
        this.restoreCorgiScene();
    },

    restoreCorgiScene() {
        if (this.data.osmanthusBackdropActive) {
            if (this.data.corgiAction === 'bird-doze') {
                const wakeAfterDoze = !!this.birdWakePending;
                this.birdWakePending = false;
                this.showBirdClip(wakeAfterDoze ? 'bird-wake' : 'bird-sleeping');
                return;
            }
            this.showBirdClip('bird-awake');
            return;
        }
        this.showCorgiClip('idle');
    },

    onCorgiError(event) {
        const token = Number(event.currentTarget.dataset.token);
        if (token !== this.corgiToken || !this.cloudVisible) return;
        if (this.data.sheet) {
            this.corgiDeferredOutcome = { token, type: 'error' };
            return;
        }
        this.recoverCorgiClip(token);
    },

    recoverCorgiClip(token) {
        if (token !== this.corgiToken || !this.cloudVisible) return;
        clearTimeout(this.corgiLoadTimer);
        this.corgiLoadTimer = null;
        if (this.data.sheet) return;
        const clip = this.data.corgiClips[0];
        if (clip?.loop) {
            if ((this.corgiRetryCount || 0) < CORGI_LOOP_MAX_RETRIES) {
                this.mountCorgiClip(clip.key, true, this.data.osmanthusBackdropActive, (this.corgiRetryCount || 0) + 1);
                return;
            }
            this.corgiToken++;
            if (this.nestPet && this.data.osmanthusBackdropActive) return this.staticBird();
            const poster = this.data.osmanthusBackdropActive
                ? (clip.key === 'bird-sleeping' ? BIRD_SLEEPING_POSTER : BIRD_AWAKE_POSTER)
                : this.data.birdScenePoster;
            this.setData({ birdScenePoster: poster, corgiClips: [], corgiPlaying: false });
            return;
        }
        wx.showToast({ title: '动作加载失败，请再试一次', icon: 'none' });
        if (this.data.osmanthusBackdropActive && this.data.corgiAction === 'bird-doze' && this.birdWakePending) {
            const started = this.data.corgiPlaying;
            this.birdWakePending = false;
            this.showBirdClip(started ? 'bird-wake' : 'bird-awake');
            return;
        }
        this.restoreCorgiScene();
    },

    stopCorgiScene() {
        clearTimeout(this.corgiLoadTimer);
        this.corgiLoadTimer = null;
        clearTimeout(this.birdSleepTimer);
        this.birdSleepTimer = null;
        this.birdWakePending = false;
        this.corgiPausedBySheet = false;
        this.corgiDeferredOutcome = null;
        this.corgiRetryCount = 0;
        this.corgiLastCurrentTime = null;
        if (this.data.corgiClips.length) this.pauseCorgiVideo();
        if (this.data.corgiClips.length) {
            try { wx.createVideoContext('corgi-player', this).stop(); } catch (error) { /* ignore */ }
        }
        this.corgiToken = (this.corgiToken || 0) + 1;
        this.setCorgiMenu(false);
        const asleep = ['bird-doze', 'bird-sleeping'].includes(this.data.corgiAction);
        const resumedAction = asleep ? 'bird-sleeping' : 'bird-awake';
        const nextPoster = this.data.osmanthusBackdropActive
            ? (asleep ? BIRD_SLEEPING_POSTER : BIRD_AWAKE_POSTER)
            : this.data.birdScenePoster;
        this.setData({
            corgiAction: this.data.osmanthusBackdropActive ? resumedAction : 'idle',
            birdScenePoster: nextPoster,
            corgiClips: [],
            corgiPlaying: false,
            corgiJob: null,
            corgiWorkIndex: 0,
        });
    },

    onLoad() {
        this.buttonArt = createButtonArt(this, wx, config.NEST_BUTTONS_IMAGE_URL);
        this.statusTimer = null;
        this.currentBirdCode = '';
        this.toastTimer = null;
        this.happyTimer = null;
        this.feedbackTimer = null;
        this.feedFxTimer = null;
        this.feedFxHideTimer = null;
        this.waterFxTimer = null;
        this.waterFxHideTimer = null;
        this.feedback = null;
        // 互动鸟叫 + 待机动画原声：与网页端一致，首次用户手势后自动播放待机动画并带原声，
        // 照料 / 摸摸等互动播放短鸟叫（InnerAudioContext，小程序无 Web Audio）。
        this.chirpAudio = null;
        this.onKeyboardHeightChange = (e) => this.handleKeyboardChange(e);
        try { wx.onKeyboardHeightChange(this.onKeyboardHeightChange); } catch (err) { /* 老基础库无此 API，忽略 */ }
        this.updateLayout();
        this.refresh();
    },

    onResize() {
        this.updateLayout();
    },

    updateLayout() {
        this.birdGesture = null;
        this.setData({ layout: nestLayout.readNestLayout(), birdOffsetX: 0, birdOffsetY: 0 });
        this.recalcSheetMask();
    },

    onShow() {
        this.birdSleepAnchorAt = Date.now();
        this.refresh();
        if (this.data.osmanthusBackdropActive) this.showBirdClip(this.data.corgiAction);
        else this.showCorgiClip('idle');
        tabBar.syncSelected(this, 0);
        // 面板若仍打开（例如切走再切回），动画应保持暂停，不能与遮罩状态相反。
        this.setData({ motionPaused: !!this.data.sheet });
        // cloudUI.page 在 onShow 后统一刷新小窝。
        if (this.statusTimer === null) {
            this.statusTimer = setInterval(() => store.resume(), STATUS_REFRESH_MS);
        }
    },

    onHide() {
        this.stopCorgiScene();
        this.birdGesture = null;
        this.stopDiaryVideo();
        this.brandArt?.suspend();
        this.syncIdle(true);
        this.clearTimers();
        if (this.chirpAudio) { try { this.chirpAudio.stop(); } catch (e) { /* ignore */ } }
        this.setData({
            motionPaused: true, sheet: null, keyboardHeightRpx: 0,
            toast: '', happy: false, feedFxId: 0, waterFxId: 0,
        });
    },

    onUnload() {
        this.stopCorgiScene();
        this.stopDiaryVideo();
        this.nestUnloaded = true;
        this.brandIdle?.stop();
        this.brandArt?.display(null);
        this.brandArt?.suspend();
        if (this.buttonArt) this.buttonArt.dispose();
        if (this.onKeyboardHeightChange) {
            try { wx.offKeyboardHeightChange(this.onKeyboardHeightChange); } catch (err) { /* ignore */ }
        }
        this.clearTimers();
        // 销毁待机动画资源（音频 + 画布引用），避免离页后持续占用与内存泄漏。
        if (this.idle) { try { this.idle.dispose(); } catch (e) { /* ignore */ } this.idle = null; }
        if (this.chirpAudio) { try { this.chirpAudio.destroy(); } catch (e) { /* ignore */ } this.chirpAudio = null; }
    },

    clearTimers() {
        if (this.statusTimer !== null) {
            clearInterval(this.statusTimer);
            this.statusTimer = null;
        }
        if (this.toastTimer) {
            clearTimeout(this.toastTimer);
            this.toastTimer = null;
        }
        if (this.happyTimer) {
            clearTimeout(this.happyTimer);
            this.happyTimer = null;
        }
        if (this.feedbackTimer) {
            clearTimeout(this.feedbackTimer);
            this.feedbackTimer = null;
        }
        if (this.feedFxTimer) {
            clearTimeout(this.feedFxTimer);
            this.feedFxTimer = null;
        }
        if (this.feedFxHideTimer) {
            clearTimeout(this.feedFxHideTimer);
            this.feedFxHideTimer = null;
        }
        if (this.waterFxTimer) {
            clearTimeout(this.waterFxTimer);
            this.waterFxTimer = null;
        }
        if (this.waterFxHideTimer) {
            clearTimeout(this.waterFxHideTimer);
            this.waterFxHideTimer = null;
        }
        this.feedback = null;
    },

    // 单次 setData 只提交展示字段，不把整个状态对象塞进视图层（E-02）。
    refresh() {
        if (config.DEVICE_SANDBOX_TEST !== true) this.syncNestLoginPrompt();
        const result = store.snapshot();
        const s = result.data ? result.data.snapshot : null;
        if (!s) {
            const connection = store.status();
            this.setData({
                storageUnavailable: true,
                speech: '本机记录暂时无法读取，请重试。',
                sparkDisplay: presentSpark(null, { ...connection, synced: false }),
            });
            this.syncIdle(true);
            return;
        }
        const state = rules.describeNestState(s, s.hasBird);
        const stats = STAT_META.map(function (meta) {
            const value = meta.key === 'hunger' ? s.satiety : (meta.key === 'water' ? s.hydration : s.mood);
            const percent = s.hasBird ? Math.min(100, Math.max(0, value)) : 0;
            return {
                key: meta.key,
                label: meta.label,
                iconClass: meta.iconClass,
                text: s.hasBird ? percent + '%' : '—',
                percent: percent,
            };
        });
        const needs = state.needs.map(function (need) {
            return {
                key: need.key,
                label: need.label,
                isCurrent: need.key === state.need,
            };
        });
        const code = s.birdCode || '';
        if (this.currentPetId !== s.petId) {
            const polling = this.statusTimer !== null;
            this.clearTimers(); this.currentPetId = s.petId;
            this.birdGesture = null;
            this.setData({ happy: false, feedFxId: 0, waterFxId: 0, birdOffsetX: 0, birdOffsetY: 0 });
            if (polling && this.cloudVisible) this.statusTimer = setInterval(() => store.resume(), STATUS_REFRESH_MS);
        }
        this.currentBirdCode = code;
        const feedback = this.feedbackActive() ? this.feedback : null;
        const pet = s.pets?.find(item => item.petId === s.petId);
        const nextBundle = this.cloudVisible ? this.brandArt?.select(pet, this.cloudView) : null;
        if (this.brandPetId !== s.petId || this.brandRole !== pet?.characterId || !this.brandIdle?.isPlaying()) {
            this.brandBundle = nextBundle;
        }
        this.brandPetId = s.petId;
        this.brandRole = pet?.characterId;
        const packagedIdle = s.hasBird && !this.brandBundle && isOriole(code);
        const avatar = this.brandBundle?.paths.normal || (s.hasBird ? birdAvatar(code) : ORIOLE_AVATAR);
        this.syncNestBindings(pet, avatar);
        const stateSlot = { happy: 'normal', unwell: 'lonely' }[state.emotion] || state.emotion;
        const slot = feedback ? (feedback.art === ANGRY_ART ? 'angry' : 'happy') : stateSlot;
        this.setData({
            hasBird: s.hasBird,
            hideGrass: isOsmanthus(code),
            useFinalNestPoster: s.hasBird && isOsmanthus(code) &&
                (!this.brandBundle || avatar.endsWith(OSMANTHUS_LEGACY_NORMAL)),
            sparkDisplay: presentSpark(s, store.status()),
            pets: (s.pets || []).map(pet => ({
                ...pet,
                avatar: pet.petId === s.petId ? avatar : birdAvatar(pet.birdCode),
                sparkLevel: pet.spark?.level ?? null,
                sparkLit: pet.spark?.status === 'ACTIVE',
            })).sort((a, b) => (b.sparkLevel ?? -1) - (a.sparkLevel ?? -1)),
            selectedPetId: s.petId, cleaning: s.cleaning,
            testAdoptions: TEST_ADOPTIONS.map(({ key, name, code }) => ({
                key, name, owned: !!s.pets?.some(pet => pet.birdCode === code),
            })),
            storageUnavailable: false,
            displayName: s.hasBird ? s.nickname : '等待小鸟入住',
            placeText: '⌖ 我的小窝',
            birdCodeShort: code ? '编码 ···' + code.slice(-6) : '尚未领养',
            points: s.points,
            todayPoints: s.todayPoints,
            dailyLimit: s.dailyLimit,
            food: s.food,
            water: s.water,
            satiety: s.satiety,
            hydration: s.hydration,
            mood: s.mood,
            supplyClaimed: !!s.supplyClaimed,
            ledger: s.ledger,
            stats: stats,
            needs: needs,
            speech: feedback ? feedback.speech : state.speech,
            brandImage: this.brandBundle?.paths[slot] || '',
            brandBackground: this.brandBundle?.background || '',
            hasBrandAnimation: !!this.brandBundle?.animation,
            brandRelease: this.brandBundle?.releaseId || '',
            packagedIdle,
            avatar,
            birdArt: !s.hasBird || isOriole(code) ? (feedback ? feedback.art : rules.emotionArt(state.emotion)) : avatar,
            thirsty: state.emotion === 'thirsty',
        });
        // 先停旧播放器，再释放它仍在使用的文件。
        this.syncIdle(false);
        this.brandArt?.display(this.brandBundle);
    },

    showToast(text) {
        if (this.toastTimer) {
            clearTimeout(this.toastTimer);
        }
        this.setData({ toast: text });
        const page = this;
        this.toastTimer = setTimeout(function () {
            page.setData({ toast: '' });
            page.toastTimer = null;
        }, 2200);
    },

    // 互动反馈（摸摸 / 照料 / 改名成功）有效期内的标记，用于暂停待机动画与短反馈互斥。
    feedbackActive() {
        return !!(this.feedback && Date.now() < this.feedback.until);
    },

    // 同步待机动画播放状态：已领养、页面在前台、面板未开、且「不在互动反馈期」才允许播放。
    // 关键：互动反馈（1.6s 开心表情 / happy）期间必须暂停待机动画——否则待机画布盖住立绘、
    // idlePlaying 又把静态开心海报隐藏，nest-happy 弹跳 / 爱心 / 谷粒 / 水滴这些互动动效全都看不见
    // （用户反馈「浇水、喂食、摸摸的动效没了」）。暂停时 idle.stop() 会清空画布并停音，海报恢复可见；
    // 反馈结束 refresh() 会重新 syncIdle(false) 恢复待机，且受 cadence 冷却闸门约束不会立刻重播。
    syncIdle(suspended) {
        if (!this.idle) return;
        const hasBird = this.data.hasBird;
        const birdId = hasBird ? this.currentBirdCode || 'local-bird' : null;
        const feedbacking = this.feedbackActive() || this.data.happy;
        this.brandIdle?.sync(this.brandBundle, this.currentPetId, suspended || this.data.diaryVideoVisible || this.data.motionPaused || this.data.storageUnavailable || feedbacking);
        this.idle.sync(this.data.packagedIdle, !!(suspended || this.data.diaryVideoVisible || this.data.motionPaused || this.data.storageUnavailable || feedbacking), birdId, this.data.packagedIdle);
    },

    // 短鸟叫：与网页端 Web Audio 合成的轻量鸟叫等价，用 InnerAudioContext 播放。
    // 仅在用户手势（摸摸 / 喂食 / 添水 / 清洁 / 补给）内触发，不阻塞主流程。
    playChirp() {
        try {
            if (!this.chirpAudio) {
                this.chirpAudio = wx.createInnerAudioContext();
                this.chirpAudio.src = '/assets/nest/chirp.mp3';
            }
            this.chirpAudio.stop();
            this.chirpAudio.play();
        } catch (error) { /* 音频不可用时主流程继续 */ }
    },

    onIdleRetry() {
        if (this.brandBundle?.animation) return this.brandIdle.retry();
        if (this.idle) this.idle.retry();
    },

    applyResult(result, action, closeSheetOnSuccess) {
        if (result.error) {
            this.showToast(cloudUI.message(result.error));
            if (result.error === 'NO_FOOD' || result.error === 'NO_WATER') this.onOpenSupply();
            return false;
        }
        if (result.data && result.data.outcome === 'ALREADY_FULL') {
            this.refresh();
            this.showToast(rules.careCopy(action, false).notice);
            return false;
        }
        const copy = rules.careCopy(action, true);
        const angry = this.feedbackActive() && this.feedback.art === ANGRY_ART;
        if (copy.speech) {
            this.showFeedback(copy.speech, 1600);
        }
        this.refresh();
        const sparkFeedback = this.confirmedSparkNotice(result);
        const fallbackSpeech = angry && (action !== 'clean' || sparkFeedback) ? copy.speech : '';
        const notice = [fallbackSpeech, sparkFeedback].filter(Boolean).join(' · ');
        if (notice) this.showToast(notice);
        if (closeSheetOnSuccess) {
            this.dismissSheet();
        }
        return true;
    },

    // 对齐网页端 nest.js 的 interactionEmotion：反馈期间保留气泡与开心表情，
    // 到期后再回到状态驱动，避免 setData 与紧随的 refresh 互相覆盖。
    showFeedback(speech, duration, art = HAPPY_ART) {
        if (this.feedbackActive() && this.feedback.art === ANGRY_ART) return;
        const keep = duration || 1600;
        this.feedback = { until: Date.now() + keep, speech: speech, art: art };
        if (this.feedbackTimer) clearTimeout(this.feedbackTimer);
        if (this.happyTimer) clearTimeout(this.happyTimer);
        this.setData({ speech: speech, birdArt: isOriole(this.currentBirdCode) ? art : this.data.birdArt, brandImage: this.brandBundle?.paths[art === ANGRY_ART ? 'angry' : 'happy'] || '', happy: false });
        // 互动反馈一开始就让待机动画「让位」：暂停后 idle.stop() 会清空画布、停掉原声，
        // idlePlaying 变 false，静态开心海报重新可见——nest-happy 弹跳 / 爱心 / 谷粒 / 水滴
        // 这些画在海报那一层的动效才能被看见（否则全被待机画布盖住，表现为「动效没了」）。
        // 反馈到期后的 refresh() 会再次 syncIdle(false) 恢复待机，且受 cadence 冷却闸门约束不会立刻重播。
        this.syncIdle(false);
        const page = this;
        // 下一帧再加 class，确保连续点击时动画能重新触发。
        this.happyTimer = art === HAPPY_ART ? setTimeout(function () {
            page.setData({ happy: true });
        }, 30) : null;
        this.feedbackTimer = setTimeout(function () {
            page.feedback = null;
            page.feedbackTimer = null;
            page.happyTimer = null;
            page.setData({ happy: false });
            page.refresh();
        }, keep);
    },

    async doCare(action, closeSheetOnSuccess) {
        if (!this.requireBird()) return;
        const petId = this.currentPetId, selection = this.nestToken;
        const result = await cloudUI.run(this, () => action === 'feed' ? store.feed() : store.water());
        if (!result) return;
        if (this.currentPetId !== petId || selection !== this.nestToken) return;
        const ok = this.applyResult(result, action, closeSheetOnSuccess);
        if (ok) {
            // 按动作给专属反馈动效：喂食谷粒、添水水滴；摸一摸走 showFeedback 的开心弹跳 + 爱心。
            if (action === 'water') this.triggerWaterFx();
            else this.triggerFeedFx();
            this.playChirp();
            this.idle?.kick();
            if (result.data?.outcome !== 'SUCCEEDED' || !result.data.changed || result.data.replayed || result.data.pet?.petId !== petId) return;
            const pet = this.data.pets.find(item => item.petId === petId);
            await this.syncNestBindings(pet, this.data.avatar, true);
            const key = action === 'feed' ? 'bird-eat' : 'bird-drink';
            if (this.cloudVisible && this.nestToken === selection && this.currentPetId === petId &&
                !this.data.corgiJob && !this.data.sheet && this.publishedAction(key)) {
                this.recordBirdTouch(false);
                this.showBirdClip(key);
            }
        }
    },

    requireBird() {
        if (this.data.storageUnavailable) {
            this.refresh();
            if (this.data.storageUnavailable) {
                this.showToast(rules.ERROR_TEXT.STORAGE_UNAVAILABLE);
                return false;
            }
        }
        if (this.data.hasBird) {
            return true;
        }
        this.openSheet({ type: 'claim', title: '把伙伴带回小窝' });
        return false;
    },

    // ---------- 底部 dock ----------
    onDock(event) {
        const key = event.currentTarget.dataset.key;
        if (key === 'feed') {
            this.onFeed();
            return;
        }
        if (key === 'water') {
            this.doCare('water', false);
            return;
        }
        if (key === 'touch') {
            this.pet();
        }
    },

    async pet() {
        if (!this.requireBird()) return;
        const result = await cloudUI.run(this, () => store.pet());
        if (!result) return;
        if (result.error) {
            this.showToast(cloudUI.message(result.error));
            return;
        }
        const speech = '嘿嘿，你摸摸我，我就开心啦～';
        const angry = this.feedbackActive() && this.feedback.art === ANGRY_ART;
        this.showFeedback(speech, 1600);
        this.playChirp();
        this.idle?.kick();
        this.refresh();
        const granted = result.data && result.data.granted;
        const notice = [angry ? speech : '', this.confirmedSparkNotice(result), granted > 0 ? '叽分 +' + granted : '']
            .filter(Boolean).join(' · ');
        if (notice) this.showToast(notice);
    },

    confirmedSparkNotice(result) {
        const data = result.data;
        return data && !data.replayed ? sparkNotice(data.sparkEvent, this.data.sparkDisplay.spark) : '';
    },

    onBirdTouchStart(event) {
        if (event.touches?.length !== 1) {
            this.onBirdTouchCancel();
            return;
        }
        if (!this.data.hasBird || this.data.sheet) return;
        const { identifier, clientX, clientY } = event.touches[0];
        if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return;
        this.suppressBirdTapUntil = 0;
        this.birdGesture = {
            identifier, clientX, clientY, dragging: false,
            x: this.data.birdOffsetX, y: this.data.birdOffsetY,
        };
    },

    onBirdTouchMove(event) {
        const gesture = this.birdGesture;
        if (!gesture) return;
        if (event.touches?.length !== 1) {
            this.onBirdTouchCancel();
            return;
        }
        const touch = event.touches[0];
        if (touch.identifier !== gesture.identifier) return;
        const dx = touch.clientX - gesture.clientX;
        const dy = touch.clientY - gesture.clientY;
        if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
        if (!gesture.dragging && Math.hypot(dx, dy) < 8) return;
        gesture.dragging = true;

        const { rpxPerPixel, birdDragMinY, birdDragMaxY } = this.data.layout;
        // 立绘占屏宽 52%，左右各有 180rpx 可移动余量。
        const x = Math.round(Math.max(-180, Math.min(180, gesture.x + dx * rpxPerPixel)));
        const y = Math.round(Math.max(birdDragMinY, Math.min(birdDragMaxY, gesture.y + dy * rpxPerPixel)));
        if (x !== this.data.birdOffsetX || y !== this.data.birdOffsetY) {
            this.setData({ birdOffsetX: x, birdOffsetY: y });
        }
    },

    onBirdTouchEnd() {
        if (this.birdGesture?.dragging) this.suppressBirdTapUntil = Date.now() + 350;
        this.birdGesture = null;
    },

    onBirdTouchCancel() {
        if (this.birdGesture) this.suppressBirdTapUntil = Date.now() + 350;
        this.birdGesture = null;
    },

    onPet(event) {
        if (this.birdGesture?.dragging || Date.now() < (this.suppressBirdTapUntil || 0)) return;
        if (!this.requireBird()) return;
        const touch = event?.changedTouches?.[0];
        const x = touch?.clientX ?? event?.detail?.x;
        const y = touch?.clientY ?? event?.detail?.y;
        if (!Number.isFinite(x) || !Number.isFinite(y)) return this.pet();

        const view = this.cloudView;
        const petId = this.data.selectedPetId;
        const art = this.data.birdArt;
        const brandFrame = this.brandIdle?.getVisibleFrame();
        const sameFootMasks = this.brandBundle?.animation?.atlasHash === nestFoot.idleAtlasHash;
        // 包内脚区仅对应小黄莺原图和同源帧。
        if (this.brandBundle ? (brandFrame == null || !sameFootMasks) : !this.data.packagedIdle) return this.pet();
        const idleFrame = brandFrame == null ? this.idle?.getVisibleFrame?.() : (sameFootMasks ? brandFrame : null);
        const selector = brandFrame != null ? '#brandCanvas' : (idleFrame == null ? '.bird-art' : '#idleCanvas');
        wx.createSelectorQuery().select(selector).boundingClientRect(rect => {
            if (!this.cloudVisible || this.cloudView !== view || this.data.selectedPetId !== petId) return;
            if (!nestFoot.isFootTap(art, idleFrame, rect, x, y)) {
                this.pet();
                return;
            }
            if (this.feedbackActive() && this.feedback.art === ANGRY_ART) return;
            this.showFeedback('哎呀，脚脚痒痒的，摸摸头嘛～', 2000, ANGRY_ART);
            this.playChirp();
        }).exec();
    },

    // ---------- 右侧工具 ----------
    async onTool(event) {
        const key = event.currentTarget.dataset.key;
        if (key === 'diary') {
            this.openToolPage('/pages/diary/diary', '日记暂时打不开，请重试');
            return;
        }
        if (key === 'clean') {
            if (!this.requireBird()) return;
            const result = await cloudUI.run(this, () => store.clean());
            if (result && this.applyResult(result, 'clean', false)) {
                this.playChirp();
                this.idle?.kick();
            }
            return;
        }
        if (key === 'supply') {
            this.onOpenSupply();
            return;
        }
        if (key === 'checkin') {
            // 网页端从小窝右侧「合照打卡」直达 photo 路由；此处为同一入口。
            this.openToolPage('/pages/photo/photo', '合照打卡暂时打不开，请重试');
            return;
        }
        if (key === 'video') {
            this.openToolPage('/pages/nest-video/nest-video', '视频暂时打不开，请重试');
            return;
        }
        if (key === 'ar') {
            this.openToolPage('/pages/nest-ar/nest-ar', 'AR 暂时打不开，请重试');
            return;
        }
        // 网页端小窝「换装」直达 wardrobe 路由；这里是同一个独立衣橱页。
        // 该页当前为「服装展示 · 暂未开放」，与网页端保持一致，不伪造兑换或穿戴。
        if (key === 'dress') {
            this.openToolPage('/pages/wardrobe/wardrobe', '衣橱暂时打不开，请重试');
        }
    },

    fadeOutDiaryVideo() {
        if (!this.data.diaryVideoVisible || this.diaryReturning) return;
        this.diaryReturning = true;
        this.diaryPhase = 'returning';
        clearTimeout(this.diaryFrameTimer);
        clearTimeout(this.diaryStartTimer);
        this.diaryFrameTimer = this.diaryStartTimer = null;
        this.setData({ diaryVideoPlaying: false });
        this.diaryReturnTimer = setTimeout(() => {
            this.stopDiaryVideo();
            this.syncIdle(false);
        }, DIARY_FADE_MS + 1000);
    },

    stopDiaryVideo() {
        clearTimeout(this.diaryLoadTimer);
        clearTimeout(this.diaryReturnTimer);
        clearTimeout(this.diaryStartTimer);
        clearTimeout(this.diaryFrameTimer);
        this.diaryStartTimer = this.diaryFrameTimer = null;
        this.diaryPhase = null;
        this.diaryLoadTimer = null;
        this.diaryReturnTimer = null;
        this.diaryReturning = false;
        if (!this.data.diaryVideoVisible) return;
        try { wx.createVideoContext('diaryOriginalVideo', this).stop(); } catch (error) {}
        this.setData({ diaryVideoVisible: false, diaryVideoPlaying: false });
    },

    // First decode a real video frame, then pause and return to its first frame.
    // Fade while that frame is held before letting motion begin.
    onDiaryVideoPlay() {
        if (!this.data.diaryVideoVisible || this.diaryReturning) return;
        if (this.diaryPhase === 'loading') this.diaryPhase = 'priming';
    },

    onDiaryVideoTimeUpdate(event) {
        const detail = event.detail || {};
        if (this.diaryPhase === 'priming' && detail.currentTime >= 0) {
            this.diaryPhase = 'holding';
            clearTimeout(this.diaryLoadTimer);
            this.diaryLoadTimer = null;
            const video = wx.createVideoContext('diaryOriginalVideo', this);
            video.pause();
            video.seek(0);
            this.diaryFrameTimer = setTimeout(() => this.revealDiaryFirstFrame(), 1500);
            return;
        }
        if (this.diaryPhase === 'playing' && detail.duration > 1 && detail.currentTime >= detail.duration - 0.45 && !this.diaryReturning) this.fadeOutDiaryVideo();
    },

    onDiaryVideoSeekComplete() {
        if (this.diaryPhase !== 'holding') return;
        clearTimeout(this.diaryFrameTimer);
        this.diaryFrameTimer = setTimeout(() => this.revealDiaryFirstFrame(), 120);
    },

    revealDiaryFirstFrame() {
        if (!this.data.diaryVideoVisible || this.diaryPhase !== 'holding') return;
        clearTimeout(this.diaryFrameTimer);
        this.diaryFrameTimer = null;
        this.setData({ diaryVideoPlaying: true });
        this.diaryStartTimer = setTimeout(() => {
            if (!this.data.diaryVideoVisible || this.diaryPhase !== 'holding') return;
            this.diaryPhase = 'playing';
            wx.createVideoContext('diaryOriginalVideo', this).play();
        }, DIARY_FADE_MS + 120);
    },

    onDiaryVideoEnded() {
        if (!this.data.diaryVideoVisible) return;
        if (!this.diaryReturning) this.fadeOutDiaryVideo();
    },

    onDiaryVideoError() {
        if (this.data.diaryVideoPlaying) this.fadeOutDiaryVideo();
        else { this.stopDiaryVideo(); this.syncIdle(false); }
        wx.showToast({ title: '日记动画暂时无法播放', icon: 'none' });
    },

    openToolPage(url, errorText, onFail) {
        if (this.toolNavigationPending) return;
        this.toolNavigationPending = true;
        wx.navigateTo({
            url: url,
            fail: () => {
                this.showToast(errorText);
                if (typeof onFail === 'function') onFail();
            },
            complete: () => { this.toolNavigationPending = false; },
        });
    },

    onNeedImageError(event) {
        const key = event.currentTarget.dataset.key;
        if (key === 'food' || key === 'water') this.setData({ ['needImageErrors.' + key]: true });
    },

    onNeed(event) {
        const key = event.currentTarget.dataset.key;
        if (!this.requireBird()) return;
        if (key === 'food' || key === 'water') {
            this.doCare(key === 'food' ? 'feed' : 'water', false);
        } else {
            this.pet();
        }
    },

    // ---------- 面板 ----------
    openSheet(sheet) {
        this.setData({ sheet: sheet, motionPaused: true });
        this.recalcSheetMask(sheet);
        // 面板打开时暂停待机动画与音效（框架层 tabBar 在下，面板在上，动画不应穿透遮罩）。
        this.syncIdle(false);
        this.suspendCorgiForSheet();
    },

    dismissSheet(extra = {}) {
        const hadSheet = !!this.data.sheet || !!this.corgiPausedBySheet;
        this.setData({ sheet: null, motionPaused: false, ...extra }, () => {
            if (hadSheet && this.cloudVisible && !this.data.sheet && this.data.corgiClips.length) {
                this.playCorgiVideo();
            }
        });
        this.recalcSheetMask(null);
        if (hadSheet) this.resumeCorgiAfterSheet();
    },

    // 弹框遮罩要停靠在自定义 tabBar 上沿：框架层 tabBar 的 z-index:1000 盖不住，
    // 只能把面板整体从屏幕底部上移到 tabBarHeight 之上（与 toast/dock 规避同构）。
    // 改名时键盘覆盖底栏，面板只需要避开较高的一项。
    recalcSheetMask(sheet) {
        const target = sheet || this.data.sheet;
        const keyboard = (target && target.type === 'rename') ? (this.data.keyboardHeightRpx || 0) : 0;
        const bottom = Math.max(this.data.layout.tabBarHeight || 149, keyboard);
        if (bottom !== this.data.sheetMaskBottom) {
            this.setData({ sheetMaskBottom: bottom });
        }
    },

    handleKeyboardChange(e) {
        let rpx = 0;
        try {
            const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
            const width = info.windowWidth || 375;
            rpx = Math.round((e.height * 750) / width);
        } catch (err) {
            rpx = 0;
        }
        this.setData({ keyboardHeightRpx: rpx });
        this.recalcSheetMask();
    },

    closeSheet() {
        this.dismissSheet({ keyboardHeightRpx: 0 });
        this.refresh();
    },

    syncNestLoginPrompt() {
        if (!this.cloudVisible) return;
        if (store.status().signedIn) {
            this.loginPromptOffered = false;
            if (this.data.sheet?.type === 'login') this.dismissSheet();
        } else if (!this.loginPromptOffered && !this.data.sheet) {
            this.loginPromptOffered = true;
            this.openSheet({ type: 'login', title: '登录你的小窝', desc: '用微信登录，找回已领养的小鸟和陪伴记录。' });
        }
    },

    async onNestLogin() {
        if (this.data.nestLoginBusy || store.status().signedIn) return;
        this.setData({ nestLoginBusy: true });
        try {
            await this.onCloudLogin();
        } finally {
            if (!this.nestUnloaded) this.setData({ nestLoginBusy: false });
        }
    },

    noop() {},

    onRename() {
        if (!this.requireBird()) return;
        this.setData({ renameValue: this.data.displayName });
        this.openSheet({ type: 'rename', title: '给小鸟改个名字', desc: '1–6 个字，保存到当前账号的这只小鸟。' });
    },

    onRenameInput(event) {
        this.setData({ renameValue: Array.from(event.detail.value).slice(0, 6).join('') });
    },

    async onSaveRename() {
        const result = await cloudUI.run(this, () => store.rename(this.data.renameValue));
        if (!result) return;
        if (result.error) {
            this.showToast(cloudUI.message(result.error));
            return;
        }
        this.showToast('昵称已保存');
        this.dismissSheet({ keyboardHeightRpx: 0 });
        this.showFeedback('新名字真好听呀～', 1600);
        this.refresh();
    },

    async onWallet() {
        if (this.cloudActionBusy) return;
        this.refresh();
        if (this.data.storageUnavailable) {
            this.showToast(rules.ERROR_TEXT.STORAGE_UNAVAILABLE);
            return;
        }
        this.openSheet({ type: 'wallet', title: '叽分钱包' });
        await this.loadHistory('points', false);
    },

    onDockImageError() {
        if (this.buttonArt) this.buttonArt.fallback();
    },

    onSwitch() {
        this.openSheet({ type: 'switch', title: '今天，想陪谁？' });
    },

    onOpenSpark() {
        this.refresh();
        this.openSheet({ type: 'spark', title: '陪伴火花' });
    },

    async onSparkAction() {
        if (this.data.sheet?.type !== 'spark') return;
        const action = this.data.sparkDisplay.action;
        if (action === 'login') return this.onCloudLogin();
        if (action === 'retry') return this.onCloudRetry();
        if (action === 'pet' && (!store.status().canOperate || this.cloudActionBusy)) return;
        if (action === 'adopt') return this.onClaimHelp();
        this.closeSheet();
        if (action === 'pet') return this.pet();
    },

    onClaimHelp() {
        this.openSheet({ type: 'claim', title: '把伙伴带回小窝' });
    },

    onOpenSupply() {
        if (!this.requireBird()) return;
        this.supplyView = (this.supplyView || 0) + 1;
        const cached = this.testStepResult;
        const current = cached?.userId === store.status().userId && cached.date === this.supplyDay() ? cached : null;
        this.displayStepPoints(current);
        this.setData({ testStepMessage: '', testStepNeedsSetting: false, testStepBusy: !!this.testStepReading });
        this.openSheet({ type: 'supply', title: '小窝补给' });
    },

    supplyDay() {
        return new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
    },

    displayStepPoints(result) {
        const steps = result?.steps ?? null;
        const redeemed = result?.stepPointsRedeemed ?? 0;
        this.setData({
            testSteps: steps,
            testStepPointsAvailable: result?.stepPointsAvailable ?? 0,
            testStepPointsRedeemed: redeemed,
            testStepsToNext: steps === null ? 0 : (Math.max(Math.floor(steps / 1000), redeemed) + 1) * 1000 - steps,
        });
    },

    async onReadTestSteps(event) {
        if (!this.data.testWeRun || this.testStepReading || this.data.sheet?.type !== 'supply') return;
        const { userId } = store.status();
        let token = store.getToken();
        if (!token || !userId) {
            this.setData({ testStepMessage: '请先微信登录，再读取微信步数。' });
            return;
        }
        const redeem = event?.currentTarget?.dataset?.action === 'redeem';
        const day = this.supplyDay();
        const view = this.cloudView;
        const sheet = this.supplyView;
        const current = () => this.cloudVisible && this.cloudView === view && this.supplyView === sheet &&
            this.data.sheet?.type === 'supply' && store.status().userId === userId;
        const checkContext = () => {
            if (!current() || token !== store.getToken()) throw { error: 'CONTEXT_CHANGED' };
        };
        const renew = async () => {
            checkContext();
            const result = await store.loginWithWechat();
            if (!current()) throw { error: 'CONTEXT_CHANGED' };
            if (result.error || !store.getToken()) throw { error: result.error || 'WX_LOGIN_REQUIRED' };
            token = store.getToken();
        };

        const cached = this.testStepResult;
        let pending = this.pendingStepRedemption;
        if (pending?.day !== day || pending?.userId !== userId) pending = null;
        if (redeem && !pending) {
            if (!cached || cached.userId !== userId || cached.date !== day || cached.stepPointsAvailable < 1) {
                this.displayStepPoints(null);
                this.setData({ testStepMessage: '请先读取今日微信步数。' });
                return;
            }
            pending = { day, userId, id: 'steps_' + Date.now() + '_' + Math.random().toString(36).slice(2) };
            this.pendingStepRedemption = pending;
        }
        const read = () => redeem
            ? werun.redeemStepPoints(token, day, pending.id, checkContext)
            : werun.previewStepPoints(token, checkContext);
        this.testStepReading = true;
        this.setData({ testStepBusy: true, testStepMessage: '', testStepNeedsSetting: false });
        try {
            let renewed = false;
            if (!await werun.sessionIsCurrent()) {
                await renew();
                renewed = true;
            }
            let result;
            try { result = await read(); } catch (error) {
                if (renewed || error?.error !== 'WX_LOGIN_REQUIRED') throw error;
                await renew();
                result = await read();
            }
            if (redeem) this.pendingStepRedemption = null;
            checkContext();
            if (result?.date !== this.supplyDay()) throw { error: 'STEPS_DAY_CHANGED' };
            if (![result.steps, result.stepPointsAvailable, result.stepPointsRedeemed, result.granted]
                .every(value => Number.isSafeInteger(value) && value >= 0)) throw { error: 'INVALID_STEPS' };
            this.testStepResult = { ...result, userId };
            this.displayStepPoints(result);
            if (redeem) {
                this.setData({ testStepMessage: result.granted
                    ? (result.replayed ? '已确认兑换 ' : '已兑换 ') + result.granted + ' 叽分'
                    : '目前没有新的可兑换步数。' });
                await store.refresh();
            }
        } catch (error) {
            if (!current()) return;
            if (error?.error === 'STEPS_DAY_CHANGED') {
                this.pendingStepRedemption = null;
                this.testStepResult = null;
                this.displayStepPoints(null);
            }
            const messages = {
                WERUN_DENIED: '请在设置中开启微信运动权限。',
                PRIVACY_NOT_AUTHORIZED: '同意隐私保护指引后可重新读取。',
                PRIVACY_UNAVAILABLE: '当前小程序尚未配置微信运动隐私授权。',
                WX_LOGIN_REQUIRED: '微信会话已失效，请重新登录。',
                STEPS_DAY_CHANGED: '已进入新的一天，请重新读取步数。',
                STEP_NETWORK_ERROR: redeem ? '兑换结果暂未确认，请点同一按钮重试。' : '网络未连通，请检查网络后重试。',
                RATE_LIMITED: '操作太频繁，请稍后重试。',
            };
            this.setData({
                testStepMessage: messages[error?.error] || (redeem ? '兑换暂未完成，请重试。' : '暂时读不到微信步数，请重试。'),
                testStepNeedsSetting: error?.error === 'WERUN_DENIED',
            });
        } finally {
            this.testStepReading = false;
            if (this.cloudVisible) this.setData({ testStepBusy: false });
        }
    },

    onTestStepSettings() {
        if (!this.data.testStepNeedsSetting) return;
        wx.openSetting({ success: result => {
            if (this.data.sheet?.type === 'supply' && result.authSetting?.['scope.werun']) {
                this.setData({ testStepNeedsSetting: false, testStepMessage: '权限已开启，请重新读取。' });
            }
        } });
    },

    async onSupply() {
        if (!this.requireBird()) return;
        const result = await cloudUI.run(this, () => store.supply());
        if (!result) return;
        this.refresh();
        this.showToast(result.error ? cloudUI.message(result.error) : result.data.outcome === 'ALREADY_CLAIMED' ? '今日已领取' : '食物 +1、水 +1，已存入当前小鸟');
    },

    onFeed() { return this.doCare('feed', false); },
    async onSelectPet(event) {
        this.feedback = null;
        this.dismissSheet();
        await store.selectPet(event.currentTarget.dataset.id);
        this.refresh();
    },
    async loadHistory(kind, more) {
        const result = await cloudUI.run(this, () => store.history(kind, more));
        if (!result) return;
        this.setData({ historyError: result.error ? cloudUI.message(result.error) : '', historyKind: kind,
            historyItems: result.data ? result.data.items : [], historyMore: !!(result.data && result.data.hasMore) });
        this.refresh();
    },
    onHistory(event) {
        if (this.cloudActionBusy) return;
        const kind = event.currentTarget.dataset.kind;
        this.openSheet({ type: 'history', title: kind === 'inventory' ? '库存流水' : '免费补给领取记录' });
        this.setData({ historyKind: kind, historyError: '', historyItems: [], historyMore: false });
        return this.loadSupplyHistory(kind, false);
    },
    async loadSupplyHistory(kind, more) {
        if (this.data.historyLoading) return;
        const view = this.cloudView;
        const current = () => this.cloudVisible && this.cloudView === view &&
            this.data.sheet?.type === 'history' && this.data.historyKind === kind;
        this.setData({ historyLoading: true, historyError: '' });
        try {
            const result = await store.history(kind, more);
            if (!current()) return;
            if (result.error) {
                this.setData({ historyError: cloudUI.message(result.error) });
                return;
            }
            this.setData({ historyItems: result.data.items, historyMore: result.data.hasMore });
        } finally {
            this.setData({ historyLoading: false });
        }
    },
    onMoreHistory() {
        const { historyKind, historyMore } = this.data;
        return this.data.sheet?.type === 'history'
            ? this.loadSupplyHistory(historyKind, !!historyMore)
            : this.loadHistory(historyKind, !!historyMore);
    },

    // 谷粒动效：先归零再置位，确保连续点击也能重新触发 CSS 动画（与 showFeedback 的 happy 重触发同构）。
    triggerFeedFx() {
        if (this.feedFxTimer) clearTimeout(this.feedFxTimer);
        if (this.feedFxHideTimer) clearTimeout(this.feedFxHideTimer);
        const page = this;
        this.setData({ feedFxId: 0 });
        this.feedFxTimer = setTimeout(function () {
            page.setData({ feedFxId: 1 });
            page.feedFxHideTimer = setTimeout(function () {
                page.setData({ feedFxId: 0 });
                page.feedFxHideTimer = null;
            }, 900);
            page.feedFxTimer = null;
        }, 20);
    },

    // 水滴动效：添水时水滴从鸟身上方落下、晕开并淡出（与谷粒动效同构，配合 wx:if 重挂载重复触发）。
    triggerWaterFx() {
        if (this.waterFxTimer) clearTimeout(this.waterFxTimer);
        if (this.waterFxHideTimer) clearTimeout(this.waterFxHideTimer);
        const page = this;
        this.setData({ waterFxId: 0 });
        this.waterFxTimer = setTimeout(function () {
            page.setData({ waterFxId: 1 });
            page.waterFxHideTimer = setTimeout(function () {
                page.setData({ waterFxId: 0 });
                page.waterFxHideTimer = null;
            }, 900);
            page.waterFxTimer = null;
        }, 20);
    },

    goAdopt(event) {
        if (!this.data.testBirdAdoption && !config.USE_LOCAL_FIXTURE) {
            this.onClaimHelp();
            return;
        }
        const key = event?.currentTarget.dataset.key;
        const selected = key ? TEST_ADOPTIONS.find(item => item.key === key) : TEST_ADOPTIONS[0];
        const code = selected?.code || (config.USE_LOCAL_FIXTURE ? config.DEBUG_DEMO_BIRD_CODE : '');
        if (!entry.isManufacturingCode(code)) {
            this.showToast('测试实体编码未配置，请检查测试环境');
            return;
        }
        this.setData({ sheet: null, motionPaused: false });
        this.recalcSheetMask(null);
        const url = entry.buildAdoptUrl(code);
        this.openToolPage(url, '测试领养页暂时打不开，请重试', () => this.resumeCorgiAfterSheet());
    },
}));
