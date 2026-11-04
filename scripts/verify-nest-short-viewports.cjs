// Short-screen geometry and real hit targets, using disposable local fixtures only.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || '/tmp/xcwc-nest-browser-check/node_modules/playwright');

const projectRoot = path.resolve(__dirname, '..');
const buildRoot = path.resolve(process.env.XCWC_NEST_BUILD_ROOT || path.join(projectRoot, 'dist'));
const reportRoot = path.resolve(process.env.XCWC_NEST_REPORT_DIR || path.join(projectRoot, 'output/nest-exhibition-20261104/short-viewports'));
const output = path.join(reportRoot, new Date().toISOString().replace(/[:.]/g, '-') + '-' + process.pid);
const index = path.join(buildRoot, 'index.html');
if (!fs.existsSync(index)) throw Error('Build index.html is missing: ' + index);
fs.mkdirSync(output, {recursive: true});

const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webp': 'image/webp',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.woff2': 'font/woff2',
};
const server = http.createServer((request, response) => {
  try {
    if (!['GET', 'HEAD'].includes(request.method)) return response.writeHead(405).end();
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname.startsWith('/api/')) return response.writeHead(503).end('Fixture only');
    const file = path.resolve(buildRoot, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
    if (!file.startsWith(buildRoot + path.sep)) return response.writeHead(403).end();
    fs.readFile(file, (error, data) => {
      if (error) return response.writeHead(404).end();
      response.writeHead(200, {
        'Content-Type': types[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*',
      });
      response.end(request.method === 'HEAD' ? undefined : data);
    });
  } catch {
    response.writeHead(400).end();
  }
});

const overlaps = (a, b) => a.width > 0 && b.width > 0 && a.left < b.right &&
  a.right > b.left && a.top < b.bottom && a.bottom > b.top;
const report = {
  passed: false, buildRoot, output,
  htmlSha256: crypto.createHash('sha256').update(fs.readFileSync(index)).digest('hex'),
  scope: 'Geometry, actual pointer clicks, outfit portrait decoding, and no URL on hidden portraits.',
  fixtures: 'Artificial bird in a fresh browser context; only browser Date is controlled. APIs and external origins are blocked.',
  cases: [],
};

async function verifyViewport(browser, base, width, height) {
  const context = await browser.newContext({
    viewport: {width, height}, isMobile: true, hasTouch: true,
    reducedMotion: 'reduce', locale: 'zh-CN', timezoneId: 'Asia/Shanghai',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const result = {width, height, passed: false, errors: [], failedResources: [], blockedRequests: [], clicks: []};
  page.on('pageerror', error => result.errors.push(error.message));
  page.on('response', response => {
    if (!response.ok() && !new URL(response.url()).pathname.startsWith('/api/')) {
      result.failedResources.push({status: response.status(), path: new URL(response.url()).pathname});
    }
  });
  try {
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.pathname.startsWith('/api/')) {
        result.blockedRequests.push({method: route.request().method(), path: url.pathname});
        return route.fulfill({status: 200, contentType: 'application/json', body: '[]'});
      }
      if (!['data:', 'blob:', 'about:'].includes(url.protocol) && url.origin !== base) {
        result.blockedRequests.push({origin: url.origin, path: url.pathname});
        return route.abort();
      }
      return route.continue();
    });
    await context.addInitScript(() => {
      const NativeDate = Date;
      window.__shortViewportNow = Date.parse('2026-11-04T02:00:00Z');
      globalThis.Date = class extends NativeDate {
        constructor(...args) { super(...(args.length ? args : [window.__shortViewportNow])); }
        static now() { return window.__shortViewportNow; }
      };
    });
    await page.goto(base + '/?page=home', {waitUntil: 'domcontentloaded'});
    await page.waitForFunction(() => !!window.xcwcGuest);
    await page.evaluate(() => window.xcwcGuest.adopt({
      id: '1234567890abcdef1234567890abcdef', active: true,
      cityCode: 'hangzhou', cityName: '杭州', typeName: '小黄莺',
    }, '短屏审查'));
    await page.reload({waitUntil: 'domcontentloaded'});
    const nest = page.frameLocator('iframe').locator('#xcwc-nest');
    await nest.locator('#name').filter({hasText: '短屏审查'}).waitFor();
    assert.equal(await nest.locator('.emotion-portrait img').getAttribute('src'), null);

    // Reach all three persistent needs through the real store, without patching bird data.
    await page.evaluate(() => { window.__shortViewportNow += 180000; window.xcwcGuest.snapshot(); });
    await nest.locator('#nest').evaluate(() => {
      window.__shortViewportNow += 180000;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await nest.locator('[data-need=company]').waitFor({state: 'visible'});
    async function geometry() {
      return nest.locator('#nest').evaluate(element => {
        const shadow = element.getRootNode();
        const rect = selector => {
          const target = shadow.querySelector(selector), box = target.getBoundingClientRect();
          return {left: box.left, right: box.right, top: box.top, bottom: box.bottom,
            width: box.width, height: box.height, hidden: target.hidden};
        };
        const selectors = ['#bird', '.emotion-label', '.emotion-portrait', '.needs', '.dock', '.speech', '[data-action=play]'];
        return {viewport: {width: innerWidth, height: innerHeight},
          rects: Object.fromEntries(selectors.map(selector => [selector, rect(selector)]))};
      });
    }
    async function screenshot(label) {
      const filename = width + 'x' + height + '-' + label + '.png';
      await page.screenshot({path: path.join(output, filename), animations: 'disabled'});
      return filename;
    }
    async function click(selector) {
      const target = nest.locator(selector);
      await target.scrollIntoViewIfNeeded();
      const hit = await target.evaluate(button => {
        const box = button.getBoundingClientRect();
        const front = button.getRootNode().elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return {hit: button === front || button.contains(front),
          left: box.left, right: box.right, top: box.top, bottom: box.bottom};
      });
      assert(hit.hit, 'Button center is obstructed: ' + selector);
      await target.click(); // Normal click verifies visibility and hit testing; never force it.
      result.clicks.push({selector, ...hit});
    }
    result.normal = await geometry();
    result.needsScreenshot = await screenshot('needs');
    await click('[data-action=play]');
    await nest.locator('#bird img[data-emotion=puzzled]').waitFor();
    const hydration = await page.evaluate(() => window.xcwcGuest.snapshot().birds[0].water);
    // Click while the play notice is visible, proving the notice does not intercept the dock.
    await click('.dock [data-action=water]');
    await nest.locator('#water').filter({hasText: (hydration + 30) + '%'}).waitFor();
    assert.equal(await nest.locator('.emotion-portrait img').getAttribute('src'), null);
    result.hiddenPortraitHasNoSrc = true;

    // Earn the outfit through real reward operations in the disposable fixture.
    await page.evaluate(() => {
      const id = window.xcwcGuest.read().currentId;
      let now = window.__shortViewportNow;
      for (let i = 0; i < 25; i++) {
        now += i && i % 10 === 0 ? 86400000 : 31000;
        window.__shortViewportNow = now;
        window.xcwcGuest.pet(id, 'short_viewport_pet_' + String(i).padStart(3, '0'));
      }
      window.xcwcGuest.redeem('huangying_osmanthus', 'short_viewport_redeem_01');
      window.xcwcGuest.equip(id, 'huangying_osmanthus');
    });
    const now = await page.evaluate(() => window.__shortViewportNow);
    await nest.locator('#nest').evaluate((element, value) => {
      window.__shortViewportNow = value;
      document.dispatchEvent(new Event('visibilitychange'));
    }, now);
    await nest.locator('#bird img[data-skin-id=huangying_osmanthus]').waitFor();
    await nest.locator('.emotion-portrait').waitFor({state: 'visible'});
    const portrait = nest.locator('.emotion-portrait img');
    await portrait.evaluate(image => image.decode());
    assert(await portrait.evaluate(image => image.naturalWidth > 0 && image.naturalHeight > 0));
    result.portraitDecoded = true;
    await nest.locator('#bird').scrollIntoViewIfNeeded();
    result.outfit = await geometry();
    result.outfitScreenshot = await screenshot('outfit');

    // Independently project a source foot center through CSS transforms. This
    // uses forward trigonometry, never the application's inverse hit helper.
    const mainImage = nest.locator('#bird img');
    const savedStyles = await mainImage.evaluate(image => {
      const properties = ['animation', 'transform', 'transform-origin'];
      const save = element => properties.map(property => ({property,
        value: element.style.getPropertyValue(property), priority: element.style.getPropertyPriority(property)}));
      return {image: save(image), button: save(image.parentElement)};
    });
    await page.evaluate(() => {
      window.__shortFootRpcs = [];
      window.__shortFootRecorder = event => {
        const data = event.data;
        if (data?.channel === 'xcwc-account' && ['pet', 'care'].includes(data.operation)) {
          window.__shortFootRpcs.push(data.operation);
        }
      };
      window.addEventListener('message', window.__shortFootRecorder);
    });
    const touchState = () => page.evaluate(() => {
      const state = window.xcwcGuest.read(), bird = state.birds.find(item => item.id === state.currentId);
      return {balance: state.balance, mood: bird.mood, lastCompanionAt: bird.lastCompanionAt,
        lastMoodGainAt: bird.lastMoodGainAt, ledgerLength: state.ledger.length};
    });
    result.transformedFootClicks = [];
    try {
      for (const parentScale of [1, 0.97]) {
        await mainImage.evaluate(image => image.decode());
        const forward = await mainImage.evaluate((image, parentScale) => {
          const button = image.parentElement;
          image.style.setProperty('animation', 'none', 'important');
          image.style.setProperty('transform', 'none', 'important');
          image.style.setProperty('transform-origin', '50% 90%', 'important');
          button.style.setProperty('transform', 'none', 'important');
          button.style.setProperty('transform-origin', '50% 50%', 'important');
          const imageLayout = image.getBoundingClientRect(), buttonLayout = button.getBoundingClientRect();
          const style = getComputedStyle(image), width = parseFloat(style.width), height = parseFloat(style.height);
          const fit = Math.min(width / image.naturalWidth, height / image.naturalHeight);
          const sourcePoint = {x: 218, y: 500}; // Reviewed left foot in osmanthus-640.webp.
          const local = {x: (width - image.naturalWidth * fit) / 2 + sourcePoint.x * fit,
            y: (height - image.naturalHeight * fit) / 2 + sourcePoint.y * fit};
          const ox = width * 0.5, oy = height * 0.9, radians = -4 * Math.PI / 180;
          const dx = (local.x - ox) * 1.04, dy = (local.y - oy) * 1.04;
          const rotated = {x: ox + dx * Math.cos(radians) - dy * Math.sin(radians),
            y: oy + dx * Math.sin(radians) + dy * Math.cos(radians) - 3};
          const bx = buttonLayout.width * 0.5, by = buttonLayout.height * 0.5;
          const viewportPoint = {
            x: buttonLayout.left + bx + parentScale * (imageLayout.left - buttonLayout.left + rotated.x - bx),
            y: buttonLayout.top + by + parentScale * (imageLayout.top - buttonLayout.top + rotated.y - by),
          };
          image.style.setProperty('transform', 'translateY(-3px) rotate(-4deg) scale(1.04)', 'important');
          button.style.setProperty('transform', 'scale(' + parentScale + ')', 'important');
          const target = image.getRootNode().elementFromPoint(viewportPoint.x, viewportPoint.y);
          return {sourcePoint, viewportPoint, parentScale, width, height,
            frameWidth: innerWidth, frameHeight: innerHeight,
            targetHit: target === button || button.contains(target)};
        }, parentScale);
        assert(forward.targetHit, 'Transformed source foot must remain visibly reachable');
        const frameBox = await page.locator('iframe').boundingBox();
        assert(frameBox, 'The app frame must be visible');
        const clickPoint = {
          x: frameBox.x + forward.viewportPoint.x * frameBox.width / forward.frameWidth,
          y: frameBox.y + forward.viewportPoint.y * frameBox.height / forward.frameHeight,
        };
        const before = await touchState();
        const priorRpcCount = await page.evaluate(() => window.__shortFootRpcs.length);
        await page.mouse.click(clickPoint.x, clickPoint.y);
        await nest.locator('#bird img[data-emotion=angry]').waitFor();
        await nest.locator('.emotion-portrait img').evaluate(image => image.decode());
        const after = await touchState();
        assert.deepEqual(after, before, 'Touching a foot must not change points, mood or companionship');
        assert.equal(await page.evaluate(() => window.__shortFootRpcs.length), priorRpcCount,
          'Foot reactions must not issue pet/care RPCs');
        result.transformedFootClicks.push({...forward, clickPoint, before, after,
          emotion: 'angry', noCareRpc: true});
        await screenshot(parentScale === 1 ? 'transformed-foot' : 'transformed-foot-pressed-parent');
        await nest.locator('#bird img:not([data-emotion=angry])').waitFor();
      }
    } finally {
      await mainImage.evaluate((image, saved) => {
        for (const [element, values] of [[image, saved.image], [image.parentElement, saved.button]]) {
          for (const {property, value, priority} of values) {
            if (value) element.style.setProperty(property, value, priority);
            else element.style.removeProperty(property);
          }
        }
      }, savedStyles);
      await page.evaluate(() => {
        window.removeEventListener('message', window.__shortFootRecorder);
        delete window.__shortFootRecorder;
      });
    }
    result.labelDockOverlap = overlaps(result.normal.rects['.emotion-label'], result.normal.rects['.dock']);
    result.playDockOverlap = overlaps(result.normal.rects['[data-action=play]'], result.normal.rects['.dock']);
    result.portraitNeedsOverlap = overlaps(result.outfit.rects['.emotion-portrait'], result.outfit.rects['.needs']);
    assert(!result.labelDockOverlap, 'Emotion label overlaps the care dock');
    assert(!result.playDockOverlap, 'Play tool overlaps the care dock');
    assert(!result.portraitNeedsOverlap, 'Emotion portrait overlaps the needs');
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.failedResources, []);
    result.passed = true;
  } catch (error) {
    result.failure = error.stack;
    await page.screenshot({path: path.join(output, width + 'x' + height + '-failure.png')}).catch(() => {});
  } finally {
    await context.close();
  }
  report.cases.push(result);
  console.log(JSON.stringify({size: width + 'x' + height, passed: result.passed,
    labelDockOverlap: result.labelDockOverlap, playDockOverlap: result.playDockOverlap,
    portraitNeedsOverlap: result.portraitNeedsOverlap, failure: result.failure}));
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    browser = await chromium.launch({headless: true,
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
    for (const [width, height] of [[320, 520], [320, 568], [390, 667], [320, 480]]) {
      await verifyViewport(browser, base, width, height);
    }
    report.passed = report.cases.every(result => result.passed);
  } catch (error) {
    report.failure = error.stack;
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
  }
  console.log(JSON.stringify({passed: report.passed, output, htmlSha256: report.htmlSha256}));
  if (!report.passed) process.exitCode = 1;
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
