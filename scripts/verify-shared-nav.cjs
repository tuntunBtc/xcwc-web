// Read-only browser checks; uses isolated contexts without backend mutations.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const base = process.env.XCWC_PREVIEW_URL || 'http://127.0.0.1:8790';
const out = path.resolve(__dirname, '../output/nest-audit-20261102/nav');
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  const records = [];
  try {
    for (const width of [320, 390, 430, 1024]) {
      for (const route of ['home', 'city', 'shop', 'profile', 'photo']) {
        const context = await browser.newContext({
          viewport: { width, height: 844 },
          ...(width < 500 ? { isMobile: true, hasTouch: true } : {}),
        });
        try {
          const page = await context.newPage();
          const errors = [];
          page.on('pageerror', error => errors.push(error.message));
          await page.goto(`${base}/?page=${route}`);
          const frame = page.frameLocator('iframe');
          await frame.locator('.bottom button').first().waitFor();
          const record = await frame.locator('.bottom').evaluate(element => {
            const nav = getComputedStyle(element);
            const button = element.querySelector('button.active');
            const selected = getComputedStyle(button);
            const icon = getComputedStyle(button.querySelector('svg'));
            const before = getComputedStyle(element, '::before');
            const pick = (style, names) => Object.fromEntries(names.map(name => [name, style[name]]));
            return {
              nav: pick(nav, ['display', 'height', 'minHeight', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'backgroundColor', 'borderTopColor']),
              button: pick(selected, ['height', 'fontFamily', 'fontSize', 'fontWeight', 'color', 'display', 'gap']),
              icon: pick(icon, ['width', 'height', 'stroke']),
              background: before.backgroundImage,
              active: button.dataset.go,
              count: element.querySelectorAll('button').length,
              rect: element.getBoundingClientRect().toJSON(),
              overflow: document.documentElement.scrollWidth > innerWidth,
            };
          });
          Object.assign(record, { width, route, errors });
          records.push(record);
          assert.equal(record.count, 4);
          assert.equal(record.active, route === 'photo' ? 'home' : route);
          assert.equal(record.overflow, false);
          assert.notEqual(record.nav.display, 'none');
          assert.equal(Math.round(record.rect.bottom), 844, `${width} ${route}: nav at viewport bottom`);
          assert.equal(Math.round(record.rect.width), Math.min(width, 480));
          assert.deepEqual(errors, []);
          const hit = await frame.locator('.bottom button.active').evaluate(element => {
            const box = element.getBoundingClientRect();
            return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
          });
          assert.equal(hit, true, `${width} ${route}: nav hit target`);
          if (route === 'photo') {
            await frame.locator('.phone>main').evaluate(element => { element.scrollTop = element.scrollHeight; });
            assert.equal(await frame.locator('.phone>main').evaluate(element => element.scrollTop > 0), true);
            assert.equal(Math.round(await frame.locator('.bottom').evaluate(element => element.getBoundingClientRect().bottom)), 844);
          }
          if (width === 390) await page.screenshot({ path: `${out}/${route}-390.png`, fullPage: true });
          await frame.locator('.bottom [data-go="city"]').click();
          await frame.locator('.bottom .active[data-go="city"]').waitFor();
        } finally {
          await context.close();
        }
      }
      const group = records.filter(record => record.width === width);
      for (const record of group) {
        assert.deepEqual(record.nav, group[0].nav, `${width} ${record.route}: shared nav`);
        assert.deepEqual(record.button, group[0].button, `${width} ${record.route}: shared active button`);
        assert.deepEqual(record.icon, group[0].icon, `${width} ${record.route}: shared active icon`);
        assert.equal(record.background, group[0].background);
      }
    }
    fs.writeFileSync(`${out}/computed-styles.json`, JSON.stringify(records, null, 2) + '\n', 'utf8');
    console.log('PASS: shared navigation in 20 route/viewport combinations');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
