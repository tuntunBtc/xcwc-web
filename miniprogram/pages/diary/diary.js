'use strict';

const store = require('../../utils/store');
const diaryAccount = require('./diary-data');

// 按日试写需测试后端开放对应能力，当前版本仅开放已生成的图文样稿。
const AI_PREVIEW_ENABLED = false;
const DAY_MS = 86400000;
const SHANGHAI_OFFSET_MS = 8 * 3600000;
const WEEK = ['一', '二', '三', '四', '五', '六', '日'];
const KIND = { home: ['窝', '小窝日常'], travel: ['旅', '旅行'], study: ['学', '学习'], memory: ['纪', '纪念'] };
const MOOD = { calm: '平静', curious: '好奇', happy: '开心', proud: '得意', content: '满足' };
const MOOD_SRC = {
    calm: '/pages/diary/assets/calendar-mood-calm.png',
    curious: '/pages/diary/assets/calendar-mood-curious.png',
    happy: '/pages/diary/assets/calendar-mood-happy.png',
    proud: '/pages/diary/assets/calendar-mood-proud.png',
    content: '/pages/diary/assets/calendar-mood-content.png',
    empty: '/pages/diary/assets/calendar-mood-empty.png',
};

function asDate(key) { return new Date(key + 'T00:00:00Z'); }
function keyFor(date) { return date.toISOString().slice(0, 10); }
function shiftDay(date, offset) { return new Date(date.getTime() + offset * DAY_MS); }
function alignWeek(date) { return shiftDay(date, -((date.getUTCDay() + 6) % 7)); }
function monthDate(date, offset, day = 1) {
    const result = new Date(date.getTime());
    result.setUTCMonth(date.getUTCMonth() + offset, day);
    return result;
}
function shortDate(date) { return (date.getUTCMonth() + 1) + ' 月 ' + date.getUTCDate() + ' 日'; }

function validDate(key) {
    if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
    const date = asDate(key);
    return Number.isFinite(date.getTime()) && keyFor(date) === key;
}

function capsuleLayout() {
    const info = typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const rectangle = typeof wx.getMenuButtonBoundingClientRect === 'function' ? wx.getMenuButtonBoundingClientRect() : null;
    const actual = Boolean(rectangle && rectangle.height > 0 && rectangle.left > 100 && rectangle.top >= 0);
    const top = actual ? rectangle.top : (info.statusBarHeight || 24) + 4;
    const height = actual ? rectangle.height : 32;
    const left = actual ? rectangle.left : info.windowWidth - 98;
    return {
        navTop: top,
        navHeight: height,
        navRight: Math.max(info.windowWidth - left + 10, 100),
        capsuleTop: top,
        capsuleBottom: top + height,
        capsuleLeft: left,
    };
}

function diaryError(code) {
    if (code === 'LOGIN_REQUIRED') return '登录已失效，请返回小窝重新登录。';
    if (code === 'OFFLINE' || code === 'NETWORK_ERROR') return '网络不稳定，请重试。';
    if (code === 'RATE_LIMITED') return '操作有点频繁，请稍后重试。';
    if (code === 'PET_NOT_FOUND') return '没有找到这只小鸟的日记。';
    if (code === 'INVALID_INPUT' || code === 'INVALID_TEXT') return '请填写 1–500 字的留言。';
    return '暂时连不上小鸟手账，请重试。';
}

// 同一天补进活动后可以重试；书信与其已读状态不影响本次试写。
function aiEntryVersion(entry) {
    return JSON.stringify([entry.title, entry.text, entry.activities || []]);
}

function aiFeedback(code) {
    const sample = '可以先看上方的图文样稿。';
    if (code === 'LOGIN_REQUIRED') return '请回小窝重新登录后再试。' + sample;
    if (code === 'OFFLINE' || code === 'NETWORK_ERROR') return '网络暂时连不上，稍后可重试。' + sample;
    if (code === 'RATE_LIMITED') return '试写请求较多，稍后可重试。' + sample;
    return '这次暂时无法生成 AI 日记。' + sample;
}

function diaryKinds(entry) {
    const activities = Array.isArray(entry?.activities) ? entry.activities : [];
    const kinds = new Set(activities.map(activity => activity.kind).filter(kind => kind === 'travel' || kind === 'study'));
    if (!kinds.size && KIND[entry?.kind]) kinds.add(entry.kind);
    return Array.from(kinds);
}

Page({
    data: {
        showAiSample: false, aiPreviewEnabled: AI_PREVIEW_ENABLED,
        aiWriting: false, aiText: '', aiFeedback: '',
        weekLabels: WEEK, birdOptions: [],
        selected: '', view: 'week', mood: 'empty',
        navTop: 28, navHeight: 32, navRight: 108,
        dates: [], periodLabel: '', dateLabel: '', weekday: '',
        birdIndex: 0, birdName: '', avatar: '', avatarPlaceholder: MOOD_SRC.empty,
        isToday: false, signedIn: false, activities: [], letters: [],
        dayLoading: false, calendarError: '', dayError: '', expandedLetterId: '', readingLetterId: '',
        noteText: '', noteReady: false, noteFeedback: '', noteFailed: false, sendingNote: false,
        noNextPeriod: true, noNextDay: true,
    },

    onLoad(options = {}) {
        this.selectedDay = options.date;
        this.calendarView = 'week';
        this.currentBirdId = '';
        this.noteDrafts = new Map();
        this.aiDrafts = new Map();
        this.expandedLetterId = '';
        this.onResize();
    },

    toggleAiSample() {
        this.setData({ showAiSample: !this.data.showAiSample });
    },

    async onAiWrite() {
        if (!AI_PREVIEW_ENABLED) return;
        const day = this.dayLoad;
        if (!day?.entry || day.loading || day.error || !this.diary?.accountId) return;
        const version = aiEntryVersion(day.entry);
        const drafts = this.aiDrafts;
        const previous = drafts.get(day.key);
        if (previous?.version === version && (previous.loading || previous.text)) return;
        const draft = { version, loading: true, text: '', feedback: '' };
        drafts.set(day.key, draft);
        this.renderCalendar();
        try {
            const response = await store.diaryAiPreview(day.petId, day.date);
            const text = response?.data?.text;
            if (response?.error || typeof text !== 'string' || !text.trim()) {
                draft.feedback = aiFeedback(response?.error);
            } else {
                draft.text = text.trim();
            }
        } catch {
            draft.feedback = aiFeedback('NETWORK_ERROR');
        } finally {
            draft.loading = false;
            if (this.diaryVisible && this.aiDrafts === drafts && this.dayLoad?.key === day.key) this.renderCalendar();
        }
    },

    onShow() {
        this.diaryVisible = true;
        this.syncDiary(true);
        this.stopWatching = store.subscribe(() => this.syncDiary());
        this.scheduleDayChange();
    },

    onHide() { this.stopDiarySync(); },
    onUnload() { this.stopDiarySync(); },
    onResize() { this.setData(capsuleLayout()); },

    stopDiarySync() {
        this.diaryVisible = false;
        this.stopWatching?.();
        this.stopWatching = null;
        if (this.dayChangeTimer != null) clearTimeout(this.dayChangeTimer);
        this.dayChangeTimer = null;
    },

    scheduleDayChange() {
        const toMidnight = DAY_MS - (Date.now() + SHANGHAI_OFFSET_MS) % DAY_MS;
        this.dayChangeTimer = setTimeout(() => {
            this.syncDiary();
            this.scheduleDayChange();
        }, toMidnight);
    },

    syncDiary(force = false) {
        const diary = diaryAccount(store.snapshot().data?.snapshot);
        if (diary.accountId !== this.diary?.accountId) {
            this.currentBirdId = '';
            this.expandedLetterId = '';
            this.calendarLoad = null;
            this.dayLoad = null;
            this.readAttempt = null;
            this.noteAttempt = null;
            this.noteDrafts.clear();
            this.aiDrafts = new Map();
            this.serverDate = null;
        }
        this.diary = diary;
        const deviceDate = keyFor(new Date(Date.now() + SHANGHAI_OFFSET_MS));
        const today = this.serverDate?.deviceDate === deviceDate ? this.serverDate.date : deviceDate;
        if (!validDate(this.selectedDay) || this.selectedDay > today || this.selectedDay === this.today) {
            this.selectedDay = today;
        }
        this.today = today;
        const birds = diary.birds;
        if (!birds.some(bird => bird.id === this.currentBirdId)) {
            this.currentBirdId = birds.find(bird => bird.id === diary.selectedBirdId)?.id || birds[0]?.id || '';
        }
        this.loadVisibleDiary(force);
    },

    calendarPeriod() {
        const day = asDate(this.selectedDay);
        const monthly = this.calendarView === 'month';
        const start = alignWeek(monthly ? monthDate(day, 0) : day);
        const end = monthly ? shiftDay(alignWeek(monthDate(day, 1, 0)), 6) : shiftDay(start, 6);
        const next = monthly ? monthDate(day, 1) : shiftDay(start, 7);
        return { day, monthly, start, end, next };
    },

    loadVisibleDiary(force = false) {
        const petId = this.currentBirdId;
        if (petId) {
            const { start, end } = this.calendarPeriod();
            this.loadCalendar(petId, keyFor(start), keyFor(end), force);
            this.loadDay(petId, this.selectedDay, force);
        } else {
            this.calendarLoad = null;
            this.dayLoad = null;
        }
        this.renderCalendar();
    },

    async loadCalendar(petId, from, to, force) {
        const key = JSON.stringify([petId, from, to]);
        const previous = this.calendarLoad?.key === key ? this.calendarLoad : null;
        if (previous && !force) return;
        const attempt = { key, days: previous?.days, error: '' };
        this.calendarLoad = attempt;
        const result = await store.diaryCalendar(petId, from, to);
        if (!this.diaryVisible || this.calendarLoad !== attempt) return;
        if (result.error || !Array.isArray(result.data?.days)) {
            attempt.error = diaryError(result.error);
        } else {
            attempt.days = Object.create(null);
            for (const row of result.data.days) {
                if (validDate(row?.date) && row.date >= from && row.date <= to) attempt.days[row.date] = row;
            }
            if (this.acceptServerDate(result.data.today)) return;
        }
        this.renderCalendar();
    },

    acceptServerDate(date) {
        if (!validDate(date)) return false;
        this.serverDate = { date, deviceDate: keyFor(new Date(Date.now() + SHANGHAI_OFFSET_MS)) };
        if (date === this.today) return false;
        this.syncDiary();
        return true;
    },

    async loadDay(petId, date, force) {
        const key = JSON.stringify([petId, date]);
        const previous = this.dayLoad?.key === key ? this.dayLoad : null;
        if (previous && !force) return;
        if (!previous) this.expandedLetterId = '';
        const attempt = { key, petId, date, entry: previous?.entry, loading: true, error: '' };
        this.dayLoad = attempt;
        const generateToday = date === this.today;
        const result = await (generateToday ? store.diaryToday(petId) : store.diaryDay(petId, date));
        if (!this.diaryVisible || this.dayLoad !== attempt) return;
        attempt.loading = false;
        if (generateToday && !result.error && result.data?.date !== date && this.acceptServerDate(result.data?.date)) return;
        if (result.error === 'DIARY_NOT_FOUND') attempt.entry = null;
        else if (result.error || !this.applyEntry(attempt, result.data)) attempt.error = diaryError(result.error);
        this.renderCalendar();
    },

    applyEntry(day, entry) {
        if (entry?.date !== day.date || !Array.isArray(entry.activities) || !Array.isArray(entry.letters)) return false;
        day.entry = entry;
        if (this.currentBirdId === day.petId && this.calendarLoad?.days) this.calendarLoad.days[entry.date] = entry;
        return true;
    },

    acceptMutation(day, entry) {
        if (!this.applyEntry(day, entry)) return false;
        // 打开同一天时可能还有更早的读取请求，成功写入后用回执替换该请求。
        if (this.dayLoad?.key === day.key) this.dayLoad = { ...day, entry, loading: false, error: '' };
        if (this.diaryVisible && this.currentBirdId === day.petId) this.reloadCalendar();
        return true;
    },

    renderCalendar() {
        const birds = this.diary.birds;
        const index = birds.findIndex(bird => bird.id === this.currentBirdId);
        const bird = birds[index];
        const active = this.selectedDay;
        const { day, monthly, start, end, next } = this.calendarPeriod();
        const entry = this.dayLoad?.entry;
        const dates = [];
        for (let date = start; date <= end; date = shiftDay(date, 1)) {
            const key = keyFor(date);
            const row = key === active && entry ? entry : this.calendarLoad?.days?.[key];
            const unread = row?.unreadCount > 0;
            const mood = row?.mood || 'empty';
            const kinds = diaryKinds(row);
            const markers = kinds.map(kind => ({ kind, icon: KIND[kind][0] }));
            const disabled = key > this.today;
            dates.push({
                key, number: date.getUTCDate(), mood, moodSrc: MOOD_SRC[mood] || MOOD_SRC.empty, unread, disabled,
                markers,
                today: key === this.today, active: key === active,
                outside: monthly && date.getUTCMonth() !== day.getUTCMonth(),
                label: [shortDate(date), key === this.today ? '今天' : '', MOOD[mood], ...kinds.map(kind => KIND[kind][1]),
                    unread ? '未读回信' : '', disabled ? '未来日期' : ''].filter(Boolean).join('，'),
            });
        }

        const monthLabel = day.getUTCFullYear() + ' 年 ' + (day.getUTCMonth() + 1) + ' 月';
        const weekLabel = start.getUTCMonth() === end.getUTCMonth()
            ? (start.getUTCMonth() + 1) + ' 月 ' + start.getUTCDate() + '–' + end.getUTCDate() + ' 日'
            : shortDate(start) + '–' + shortDate(end);
        const kindLabel = diaryKinds(entry).map(kind => KIND[kind][1]).join(' · ');
        const activities = (entry?.activities || []).map((activity, index) => ({
            ...activity, key: index, label: KIND[activity.kind]?.[1] || '活动',
        }));
        const draft = this.noteDrafts.get(this.dayLoad?.key);
        const storedAi = entry && this.aiDrafts.get(this.dayLoad.key);
        const ai = storedAi && storedAi.version === aiEntryVersion(entry) ? storedAi : null;
        this.setData({
            aiWriting: Boolean(ai?.loading), aiText: ai?.text || '', aiFeedback: ai?.feedback || '',
            dates, selected: active, view: this.calendarView, periodLabel: monthly ? monthLabel : weekLabel,
            dateLabel: shortDate(day), weekday: '星期' + WEEK[(day.getUTCDay() + 6) % 7],
            isToday: active === this.today, signedIn: Boolean(this.diary.accountId),
            birdOptions: birds.map(item => ({ label: item.label })),
            birdIndex: Math.max(0, index), birdName: bird?.label || '', avatar: bird?.avatar || '',
            mood: entry?.mood || 'empty', moodLabel: MOOD[entry?.mood] || '',
            record: entry || null, activities, kindLabel, letters: entry?.letters || [],
            calendarError: this.calendarLoad?.error || '', dayError: this.dayLoad?.error || '',
            dayLoading: Boolean(this.dayLoad?.loading), dayFeedback: this.dayLoad?.feedback || '',
            expandedLetterId: this.expandedLetterId, readingLetterId: this.readAttempt?.day === this.dayLoad ? this.readAttempt?.id || '' : '',
            noteText: draft?.text || '', noteReady: Boolean(draft?.text.trim()), noteFeedback: draft?.feedback || '',
            noteFailed: Boolean(draft?.failed), sendingNote: Boolean(this.noteAttempt), canSendNote: !this.readAttempt,
            noNextDay: active === this.today, noNextPeriod: keyFor(next) > this.today,
        });
    },

    goBack() {
        if (getCurrentPages().length > 1) wx.navigateBack();
        else wx.switchTab({ url: '/pages/index/index' });
    },

    onBirdChange(event) {
        const bird = this.diary.birds[Number(event.detail.value)];
        if (!bird) return;
        this.currentBirdId = bird.id;
        this.loadVisibleDiary();
    },

    onViewChange(event) {
        const view = event.currentTarget.dataset.view;
        if ((view !== 'week' && view !== 'month') || view === this.calendarView) return;
        this.calendarView = view;
        this.loadVisibleDiary();
    },

    onPeriodChange(event) {
        const offset = Number(event.currentTarget.dataset.offset);
        if (offset !== -1 && offset !== 1) return;
        const date = asDate(this.selectedDay);
        const target = this.calendarView === 'month'
            ? monthDate(date, offset, Math.min(date.getUTCDate(), monthDate(date, offset + 1, 0).getUTCDate()))
            : shiftDay(date, offset * 7);
        const key = keyFor(target);
        this.chooseDay(key > this.today ? this.today : key);
    },

    onDaySelect(event) { this.chooseDay(event.currentTarget.dataset.date); },
    onToday() {
        this.syncDiary();
        if (this.selectedDay !== this.today) this.chooseDay(this.today);
    },
    onStepDay(event) {
        const offset = Number(event.currentTarget.dataset.offset);
        if (offset === -1 || offset === 1) this.chooseDay(keyFor(shiftDay(asDate(this.selectedDay), offset)));
    },

    chooseDay(key) {
        if (!validDate(key) || key > this.today) return;
        this.selectedDay = key;
        this.loadVisibleDiary();
    },

    onRetryDiary() { this.loadVisibleDiary(true); },

    onNoteInput(event) {
        const day = this.dayLoad;
        if (!day?.entry || this.noteAttempt) return;
        const text = event.detail.value;
        if (typeof text !== 'string') return;
        const draft = this.noteDrafts.get(day.key);
        if (draft?.text === text) return;
        this.noteDrafts.set(day.key, { text });
        this.setData({ noteText: text, noteReady: Boolean(text.trim()), noteFeedback: '', noteFailed: false });
    },

    async onSendLetter() {
        const day = this.dayLoad;
        if (!day?.entry || this.noteAttempt || this.readAttempt) return;
        const draft = this.noteDrafts.get(day.key);
        const text = draft?.text.trim();
        if (!text) return;
        const attempt = { day, petId: this.currentBirdId };
        this.noteAttempt = attempt;
        this.setData({ sendingNote: true, noteFeedback: '', noteFailed: false });
        try {
            if (!draft.requestId) {
                const id = await store.diaryRequestId();
                if (this.noteAttempt !== attempt || this.dayLoad !== day || !this.diaryVisible) return;
                if (id.error) {
                    draft.failed = true;
                    draft.feedback = diaryError(id.error);
                    return;
                }
                draft.requestId = id.data.requestId;
            }
            const result = await store.diaryWriteLetter(attempt.petId, day.date, draft.requestId, text);
            if (this.noteAttempt !== attempt) return;
            if (result.error || !this.acceptMutation(day, result.data)) {
                draft.failed = true;
                draft.feedback = diaryError(result.error);
                if (result.error === 'IDEMPOTENCY_CONFLICT') delete draft.requestId;
                return;
            }
            this.noteDrafts.set(day.key, { text: '', feedback: '留言已送达，可以拆开小鸟的回信了。' });
        } finally {
            if (this.noteAttempt === attempt) {
                this.noteAttempt = null;
                if (this.diaryVisible) this.renderCalendar();
            }
        }
    },

    reloadCalendar() {
        const { start, end } = this.calendarPeriod();
        this.loadCalendar(this.currentBirdId, keyFor(start), keyFor(end), true);
    },

    async onLetter(event) {
        const id = event.currentTarget.dataset.letterId;
        const day = this.dayLoad;
        const letter = day?.entry?.letters.find(item => item.id === id);
        if (!letter?.reply || this.readAttempt || this.noteAttempt) return;
        day.feedback = '';
        if (this.expandedLetterId === id || letter.readAt) {
            this.expandedLetterId = this.expandedLetterId === id ? '' : id;
            this.renderCalendar();
            return;
        }
        const attempt = { day, id };
        this.readAttempt = attempt;
        this.renderCalendar();
        const result = await store.diaryReadLetter(this.currentBirdId, day.date, id);
        if (this.readAttempt !== attempt) return;
        this.readAttempt = null;
        if (result.error || !this.acceptMutation(day, result.data)) {
            day.feedback = diaryError(result.error);
        } else if (this.diaryVisible && this.dayLoad?.key === day.key) {
            this.expandedLetterId = id;
        }
        if (this.diaryVisible) this.renderCalendar();
    },

    onCardTouchStart(event) {
        this.cardTouch = event.touches.length === 1 ? event.touches[0] : null;
    },

    onCardTouchCancel() { this.cardTouch = null; },

    onCardTouchEnd(event) {
        const start = this.cardTouch;
        this.cardTouch = null;
        const touch = event.changedTouches[0];
        if (!start || !touch) return;
        const x = touch.clientX - start.clientX;
        const y = touch.clientY - start.clientY;
        if (Math.abs(x) < 60 || Math.abs(y) > 36 || Math.abs(x) < Math.abs(y) * 1.6) return;
        this.chooseDay(keyFor(shiftDay(asDate(this.selectedDay), x > 0 ? -1 : 1)));
    },
});
