'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const directory = path.join(__dirname, '../miniprogram/pages/diary');
const source = fs.readFileSync(path.join(directory, 'diary.js'), 'utf8');
const diaryAccount = require(path.join(directory, 'diary-data.js'));
const today = '2026-11-27';
const now = Date.parse(today + 'T05:00:00Z');
const settle = () => new Promise(resolve => setImmediate(resolve));
const event = dataset => ({ currentTarget: { dataset } });
const ok = data => ({ error: null, data });
const pet = { petId: 'pet-one', nickname: '小叽', birdCode: 'HZ-HY-0001' };
const owner = userId => ({ userId, status: { signedIn: true }, petId: pet.petId, pets: [pet] });

function harness(routes) {
    let definition;
    let snapshot = owner('account-one');
    let watch;
    const wx = {
        getWindowInfo: () => ({ windowWidth: 375, statusBarHeight: 42 }),
        getMenuButtonBoundingClientRect: () => ({ left: 280, top: 45, height: 32 }),
    };
    const store = {
        snapshot: () => ({ data: { snapshot } }),
        subscribe: callback => { watch = callback; return () => { watch = null; }; },
        ...routes,
    };
    vm.runInNewContext(source, {
        Page: value => { definition = value; },
        require: name => name === './diary-data' ? diaryAccount : store,
        Date: class extends Date { static now() { return now; } },
        setTimeout: () => 1,
        clearTimeout() {},
        wx,
    });
    const page = {
        ...definition,
        data: { ...definition.data },
        setData: values => { Object.assign(page.data, values); },
    };
    page.onLoad();
    page.onShow();
    return {
        page,
        switchAccount(id) { snapshot = owner(id); watch(); },
    };
}

function entry(overrides = {}) {
    return {
        date: today, kind: 'travel', mood: 'calm', title: '今天的小鸟', text: '我写好了今天的日记。',
        activities: [{ kind: 'travel', title: '湖边', text: '看到了白鹭。' }, { kind: 'study', title: '听风', text: '学会辨认叶子的声音。' }],
        letters: [], unreadCount: 0, ...overrides,
    };
}

test('周月历显示双活动，留言重试复用编号，拆信只清当前一封未读', async () => {
    let stored = entry({ letters: [{ id: 'first', text: '早上好', reply: '早呀', readAt: null }], unreadCount: 1 });
    const writes = [], reads = [], calendars = [];
    let generated = 0, ids = 0;
    const { page } = harness({
        async diaryCalendar(id, from, to) { calendars.push({ id, from, to }); return ok({ today, days: [stored] }); },
        async diaryToday() { generated++; return ok(stored); },
        async diaryRequestId() { ids++; return ok({ requestId: 'abc1234567890123' }); },
        async diaryWriteLetter(id, date, requestId, text) {
            writes.push({ id, date, requestId, text });
            if (writes.length === 1) return { error: 'NETWORK_ERROR' };
            stored = { ...stored, letters: [...stored.letters, { id: 'second', text, reply: '我收到啦', readAt: null }], unreadCount: 2 };
            return ok(stored);
        },
        async diaryReadLetter(petId, date, id) {
            reads.push({ petId, date, id });
            const letters = stored.letters.map(item => item.id === id ? { ...item, readAt: today + 'T05:00:00Z' } : item);
            stored = { ...stored, letters, unreadCount: letters.filter(letter => !letter.readAt).length };
            return ok(stored);
        },
    });
    await settle();
    const dateCell = () => page.data.dates.find(item => item.key === today);
    assert.equal(page.data.dates.length, 7);
    assert.match(dateCell().label, /旅行，学习，未读回信/);
    assert.deepEqual(Array.from(dateCell().markers, mark => mark.kind), ['travel', 'study']);
    page.onViewChange(event({ view: 'month' }));
    await settle();
    assert.equal(page.data.dates.length, 42);
    assert.equal(calendars.at(-1).from, '2026-10-26');
    assert.equal(calendars.at(-1).to, '2026-12-06');
    assert.equal(generated, 1);

    page.onNoteInput({ detail: { value: '  旅途开心吗？  ' } });
    await page.onSendLetter();
    assert.equal(page.data.noteFailed, true);
    await page.onSendLetter();
    assert.equal(ids, 1);
    assert.deepEqual(writes[1], writes[0]);
    assert.equal(writes[1].text, '旅途开心吗？');
    assert.equal(page.data.letters.length, 2);
    assert.equal(page.data.noteText, '');
    await page.onLetter(event({ letterId: 'first' }));
    assert.equal(page.data.expandedLetterId, 'first');
    assert.equal(dateCell().unread, true);
    await page.onLetter(event({ letterId: 'second' }));
    assert.equal(page.data.expandedLetterId, 'second');
    assert.equal(dateCell().unread, false);
    assert.deepEqual(reads.map(item => item.id), ['first', 'second']);
    page.onHide();
});

test('切换账号后丢弃相同宠物索引上迟到的日历和正文', async () => {
    let lateCalendar, lateDay;
    let calendars = 0, days = 0;
    const { page, switchAccount } = harness({
        diaryCalendar() {
            if (++calendars === 1) return new Promise(resolve => { lateCalendar = resolve; });
            return Promise.resolve(ok({ today, days: [entry({ mood: 'proud' })] }));
        },
        diaryToday() {
            if (++days === 1) return new Promise(resolve => { lateDay = resolve; });
            return Promise.resolve(ok(entry({ title: '现在账号的日记', mood: 'proud' })));
        },
    });
    switchAccount('account-two');
    await settle();
    lateCalendar(ok({ today, days: [entry({ mood: 'curious' })] }));
    lateDay(ok(entry({ title: '旧账号私密日记', mood: 'curious' })));
    await settle();
    assert.equal(page.data.record.title, '现在账号的日记');
    assert.equal(page.data.dates.find(item => item.key === today).mood, 'proud');
    assert.equal(page.data.noteText, '');
    page.onHide();
});
