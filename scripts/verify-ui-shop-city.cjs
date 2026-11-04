// Component-level browser regression. No service, backend writes, or real user data.
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || '/tmp/xcwc-browser-check/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8').replaceAll('__XCWC_ASSET_ORIGIN__', 'http://ui-fixture.test');
const catalog = JSON.parse(fs.readFileSync(path.join(root, '../xcwc-api/src/main/resources/shop/catalog.json'), 'utf8'));
const products = catalog.products.filter(p => p.enabled !== false).sort((a, b) => a.sortOrder - b.sortOrder);
const output = path.join(root, 'output/ui-shop-city');
fs.mkdirSync(output, { recursive: true });

async function prepare(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage(), errors = [];
  page.setDefaultTimeout(8000);
  page.on('pageerror', error => errors.push(error.message));
  const images = { failDetail: false };
  await page.route('http://ui-fixture.test/**', route => {
    const url = new URL(route.request().url());
    if (images.failDetail && url.pathname.includes('/detail-optimized.webp')) return route.abort();
    const file = path.resolve(root, '.' + url.pathname);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return route.abort();
    return route.fulfill({ body: fs.readFileSync(file), contentType: file.endsWith('.webp') ? 'image/webp' : 'image/png' });
  });
  await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%}#content{height:100dvh;overflow:auto}</style><main id="content"></main>');
  return { context, page, errors, images };
}

async function shopChecks(browser, engine) {
  const env = await prepare(browser), { page, images, errors } = env;
  try {
    await page.evaluate(({ products, banners, css, template }) => {
      window.content = document.getElementById('content');
      content.innerHTML = '<section id="xcwc-shop"></section>';
      window.shopCss = css; window.shopTemplate = template;
      window.xcwcMediaSize = src => src.includes('detail-') ? [852, 1846] : src.includes('cover-') ? [480, 375] : null;
      window.__fixture = { cart: [], failCart: true, failBanners: true, emptyCity: '', products, banners };
      window.addEventListener('message', event => {
        const m = event.data, f = window.__fixture;
        if (m.channel !== 'xcwc-shop-data' || m.operation === 'cancel') return;
        let value, error;
        const p = f.products.find(p => p.id === m.args?.id);
        if (m.operation === 'cart-read') f.failCart ? error = '隔离购物车读取失败' : value = { ids: [...f.cart] };
        if (m.operation === 'cart-add') { const already = f.cart.includes(m.args.id); f.cart = [...new Set([...f.cart, m.args.id])]; value = { already }; }
        if (m.operation === 'cart-remove') { f.cart = f.cart.filter(id => id !== m.args.id); value = {}; }
        if (m.operation === 'detail') p ? value = p : error = '商品暂不可用';
        if (m.operation === 'banners') f.failBanners ? error = '隔离轮播读取失败' : value = { items: f.banners };
        if (m.operation === 'list') {
          let items = f.products.filter(p => !m.args.city || p.cityCode === m.args.city);
          if (m.args.city && f.emptyCity === m.args.city) items = [];
          value = { items, total: items.length, cities: [...new Map(f.products.map(p => [p.cityCode, { code: p.cityCode, name: p.cityName }])).values()] };
        }
        window.postMessage({ channel: 'xcwc-shop-data-result', id: m.id, ok: !error, value: error ? { message: error } : value }, '*');
      });
    }, { products, banners: [...catalog.banners, { ...catalog.banners[0], id: 'second-fixture' }], css: read('src/shop/shop.css'), template: read('src/shop/template.html') });
    await page.addScriptTag({ content: read('src/media-lazy.js') });
    await page.addScriptTag({ content: read('src/shop/shop.js').replace('__SHOP_PRODUCTS__', read('src/shop/products.js').replace('carouselIntervalMs:5000', 'carouselIntervalMs:1000')) });
    await page.evaluate(() => mountShop());
    const shop = page.locator('#xcwc-shop');
    assert.deepEqual(await shop.locator('.card h2').allTextContents(), products.map(p => p.title));
    assert(await shop.locator('#cartStatus').isVisible());
    assert(await shop.locator('#carouselEmpty [data-shop-action=retry-banners]').isVisible());
    await page.evaluate(() => { __fixture.failCart = false; __fixture.failBanners = false; });
    await shop.locator('#cartRetry').click();
    await shop.locator('.add:not([disabled])').first().waitFor();
    await shop.locator('#carouselEmpty [data-shop-action=retry-banners]').click();
    await shop.locator('#carouselEmpty').waitFor({ state: 'hidden' });
    await shop.locator('#carouselPause').click(); // Explicit pause before checking untouched second image.
    assert.equal(await shop.locator('#slides img').nth(1).getAttribute('src'), null);
    await shop.locator('#carouselDots button').nth(1).click();
    const pausedSlide = await shop.locator('#slides .active').getAttribute('aria-hidden');
    assert.equal(pausedSlide, 'false');
    await page.waitForTimeout(1100);
    assert(await shop.locator('#carouselDots button').nth(1).getAttribute('class').then(c => c.includes('active')));
    assert.equal(await shop.locator('#carouselPause').textContent(), '继续轮播');

    images.failDetail = true;
    await shop.locator('.photo-button').first().click();
    await shop.locator('.detail-image-status [data-shop-action=detail]').waitFor();
    assert(await shop.locator('.panel-head .close').isVisible());
    assert(await shop.locator('.detail-hotspot').isDisabled());
    assert(await shop.locator('.detail-hotspot').isHidden());
    assert.deepEqual(await page.evaluate(() => __fixture.cart), []);
    images.failDetail = false;
    await shop.locator('.detail-image-status [data-shop-action=detail]').click();
    await shop.locator('.panel.art-loaded').waitFor();
    assert(await shop.locator('.detail-hotspot').isEnabled());
    await shop.locator('.detail-text summary').click();
    assert((await shop.locator('.detail-text').innerText()).includes('参考价格：¥69'));
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      const close = await shop.locator('.detail-close-hotspot').boundingBox();
      assert(close.width >= 44 && close.height >= 44, 'detail close is at least 44 px');
    }
    await shop.locator('.detail-hotspot').click();
    await shop.locator('#panelTitle').filter({ hasText: '已加入购物车' }).waitFor();
    await shop.locator('#panelContent [data-shop-action=cart]').click();
    await shop.locator('.cart-row').waitFor();
    await shop.locator('.cart-cover img').first().evaluate(im => new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('visible fixed-panel cart image never received its URL')), 2500);
      const done = () => { clearTimeout(timer); im.decode().then(resolve, reject); };
      if (im.complete && im.naturalWidth) done(); else { im.addEventListener('load', done, { once: true }); im.addEventListener('error', () => reject(Error('cart image failed')), { once: true }); }
    }));
    assert(await shop.locator('.taobao').isDisabled(), 'unconfigured purchase stays disabled');
    await page.evaluate(ids => { __fixture.cart = ids; window.postMessage({ channel: 'xcwc-shop-cart-change' }, '*'); }, products.map(p => p.id));
    await shop.locator('.cart-row').nth(products.length - 1).waitFor();
    await page.waitForTimeout(100);
    assert.equal(await shop.locator('.cart-cover img').last().getAttribute('src'), null, 'far cart images are deferred by the panel viewport');
    await shop.locator('#panelContent').evaluate(el => { el.scrollTop = el.scrollHeight; });
    await shop.locator('.cart-cover img').last().evaluate(im => new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('scrolling the cart panel did not load its last image')), 2500);
      const done = () => { clearTimeout(timer); im.decode().then(resolve, reject); };
      if (im.complete && im.naturalWidth) done(); else { im.addEventListener('load', done, { once: true }); im.addEventListener('error', () => reject(Error('cart image failed')), { once: true }); }
    }));
    await shop.locator('#panelContent').evaluate(el => { el.scrollTop = 250; });
    await page.evaluate(() => { __fixture.cart.pop(); window.postMessage({ channel: 'xcwc-shop-cart-change' }, '*'); });
    await shop.locator('.cart-row').nth(products.length - 1).waitFor({ state: 'detached' });
    assert((await shop.locator('#panelContent').evaluate(el => el.scrollTop)) >= 240, 'cart synchronization preserves scroll');
    await page.evaluate(() => { __fixture.failCart = true; window.postMessage({ channel: 'xcwc-shop-cart-change' }, '*'); });
    await shop.locator('#panelContent [data-shop-action=cart-retry]').waitFor();
    assert.equal(await shop.locator('.cart-last-known').count(), products.length - 1);
    await page.evaluate(() => { __fixture.failCart = false; __fixture.cart = []; });
    await shop.locator('#panelContent [data-shop-action=cart-retry]').click();
    await shop.locator('#panelTitle').filter({ hasText: '0 只小鸟' }).waitFor();
    assert.equal(await shop.locator('.cart-row').count(), 0);
    await shop.locator('.close').click();
    await page.evaluate(() => { __fixture.emptyCity = 'suzhou'; });
    await shop.locator('#city').selectOption('suzhou');
    await shop.locator('#shopStatus').filter({ hasText: '该城市暂无商品' }).waitFor();
    await shop.locator('#clearCity').click();
    await shop.locator('.card').nth(products.length - 1).waitFor();
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      const target = await shop.locator('.add').first().boundingBox();
      assert(target.width >= 44 && target.height >= 44);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    }
    await page.screenshot({ path: path.join(output, engine + '-shop-430.png') });
    assert.deepEqual(errors, []);
    return ['15 product IDs/order and prices retained', 'cart/banners local recovery', 'offscreen banner remains deferred', 'manual carousel pause', 'failed-image hotspots disabled with visible retry/close', 'detail accessible text', 'fixed-panel visible images decode, offscreen images wait and load on panel scroll', 'open-cart external synchronization and scroll', 'read failure preserves last known records', 'empty filter reset', '320/390/430 targets and overflow'];
  } finally { await env.context.close(); }
}

async function cityChecks(browser, engine) {
  const env = await prepare(browser), { page, errors } = env;
  try {
    await page.evaluate(({ css, template }) => {
      window.content = document.getElementById('content');
      window.cityCss = css; window.cityTemplate = template;
      window.liveAccount = { birds: [{ id: 'fixture-owned', name: '湖边叽', eggStatus: 'HATCHED', typeId: 'huangying', skinId: 'green', cityCode: 'hangzhou', cityName: '杭州' }], wallet: { balance: 5 } };
      window.ownedCurrent = () => liveAccount.birds[0];
      window.birdAssets = { avatar: 'http://ui-fixture.test/assets/nest/felt/emotions/happy-192.webp' };
      window.birdArt = () => birdAssets.avatar;
      window.esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
      window.mountIsolated = (id, css, html) => { const host = document.createElement('section'); host.id = id; content.append(host); const s = host.attachShadow({ mode: 'open' }); s.innerHTML = '<style>' + css + '</style>' + html; return s; };
      window.installDialogClose = () => {};
      window.openPageDialog = async d => { if (!d.open) d.showModal(); };
      window.refreshAccount = async () => {};
      window.accountRpc = operation => operation === 'catalog' ? new Promise((resolve, reject) => { window.__catalog = { resolve, reject }; }) : Promise.resolve();
      window.pageNotice = () => {};
      window.nav = () => {};
    }, { css: read('src/city/city.css'), template: read('src/city/template.html') });
    await page.addScriptTag({ content: read('src/city/city.js') });
    await page.evaluate(() => mountCity());
    const city = page.locator('#xcwc-city');
    await city.locator('.city-card:not([disabled])').first().waitFor();
    await city.locator('[data-city=hz]').click();
    assert((await city.locator('#sheet-content').innerText()).includes('正在读取'));
    await page.evaluate(() => __catalog.reject(new Error('隔离目录失败')));
    await city.locator('#sheet-content [data-action=retry-catalog]').waitFor();
    assert(await city.locator('[data-action=visit-bird]').isEnabled());
    await city.locator('#sheet-content [data-action=retry-catalog]').click();
    assert((await city.locator('#sheet-content').innerText()).includes('正在读取'));
    await page.evaluate(() => __catalog.resolve([{ key: 'fixture-public', name: '新伙伴', cityCode: 'hangzhou', typeId: 'different', skinId: 'green' }]));
    await city.locator('.bird-row').nth(1).waitFor();
    assert.equal(await city.locator('.catalog-status').count(), 0);
    const visit = await city.locator('[data-action=visit-bird]').boundingBox();
    assert(visit.width >= 44 && visit.height >= 44);
    await city.locator('#sheet .close').click();
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      const layout = await city.locator('#city-grid').evaluate(grid => ({ columns: getComputedStyle(grid).gridTemplateColumns.split(/\s+/).length, overflow: [...grid.querySelectorAll('.city-card-body p,.card-action,.city-card-body strong')].filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.textContent), sizes: [...grid.querySelectorAll('.city-card-body p,.card-action,.city-card-body strong')].map(el => Number.parseFloat(getComputedStyle(el).fontSize)) }));
      assert.equal(layout.columns, 3);
      assert.deepEqual(layout.overflow, []);
      assert(layout.sizes.every(size => size >= 12));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    }
    await page.screenshot({ path: path.join(output, engine + '-city-430.png') });
    assert.deepEqual(errors, []);
    return ['open sheet pending/failure/retry/success updates in place', 'owned bird stays actionable', '44 px visit target', 'six cities and three columns', '320/390/430 readable text without overflow'];
  } finally { await env.context.close(); }
}

(async () => {
  const results = [];
  for (const engine of [chromium, ...(fs.existsSync(webkit.executablePath()) ? [webkit] : [])]) {
    const browser = await engine.launch({ headless: true, ...(engine === chromium ? { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' } : {}) });
    try { results.push({ engine: engine.name(), shop: await shopChecks(browser, engine.name()), city: await cityChecks(browser, engine.name()) }); }
    finally { await browser.close(); }
  }
  fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify({ passed: true, componentFixturesOnly: true, results }, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify({ passed: true, componentFixturesOnly: true, results }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
