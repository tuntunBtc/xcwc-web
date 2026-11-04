// Local visual review only. Re-run after every build; never publish this fixture page.
// Derived HTML stays under ignored output/, outside deployable dist/.
// This never edits dist/index.html or user assets.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const input = path.join(dist, 'index.html');
const output = path.join(root, 'output/checkin-felt-v1/index.html');
const args = process.argv.slice(2);
if (args.some(arg => arg !== '--serve')) throw Error('Usage: node scripts/preview-checkin-felt.cjs [--serve]');
let html = fs.readFileSync(input, 'utf8');
// The derived page opens the photo route even at / without a query string.
// This only alters the preview copy's initial route, never application sources.
const routePattern = /const requestedPage=routeParams\.has\('birdCode'\)[^;]+;/;
if (!routePattern.test(html)) throw Error('Missing initial page router; build the current frontend first.');
html = html.replace(routePattern, "const requestedPage='photo';");

const decodeAttribute = value => value
  .replaceAll('&quot;', '"').replaceAll('&#x27;', "'")
  .replaceAll('&gt;', '>').replaceAll('&lt;', '<').replaceAll('&amp;', '&');
const encodeAttribute = value => value
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#x27;');

// The app template is JSON inside the iframe's escaped data-srcdoc attribute.
// Add the visible fixture label to that one template, not to other page routes.
const templatePattern = /const checkinTemplate=([^\n]+);\n/;
const match = html.match(templatePattern);
if (!match) throw Error('Missing checkinTemplate; build the current frontend first.');
const template = JSON.parse(decodeAttribute(match[1]));
const start = '<div class="checkin-page">';
if (!template.startsWith(start)) throw Error('Unexpected check-in template root.');
const label = '<aside role="note" style="position:absolute;top:3px;left:50%;transform:translateX(-50%);z-index:20;max-width:96%;box-sizing:border-box;padding:4px 6px;border:1px solid #a37e3b66;border-radius:8px;background:#fff5ceee;color:#72542c;font:8px/1.4 sans-serif;white-space:nowrap;text-align:center;display:flex;align-items:center;gap:5px"><span>样式预览 · 示例小鸟与叽分，不写入本机资产</span><button type="button" id="ck-preview-fixture-photo" style="border:1px solid #739044;border-radius:5px;background:#e5edba;color:#486225;font:8px/1.4 sans-serif;padding:3px 4px;cursor:pointer;white-space:nowrap">试用示例照片</button></aside>';
html = html.replace(templatePattern, () => 'const checkinTemplate=' +
  encodeAttribute(JSON.stringify(template.replace(start, start + label))) + ';\n');

// The handler is inserted only into the derived iframe, inside mountCheckin's
// closure, so it can use the real upload workflow without crossing its sandbox.
const initializeMarker = encodeAttribute('initialize().catch(error=>');
if (html.split(initializeMarker).length !== 2) throw Error('Expected exactly one check-in initialize marker.');
const sampleHandler = String.raw`
const fixturePhotoButton = $('#ck-preview-fixture-photo');
fixturePhotoButton.onclick = async () => {
  if (fixturePhotoButton.disabled) return;
  fixturePhotoButton.disabled = true;
  try {
    const blob = await rpc('canvasAsset', { key: 'background' });
    await upload(new File([blob], 'preview-landscape.jpg', { type: 'image/jpeg' }));
  } catch (error) {
    toast(error.message || '示例照片暂时无法打开，请重试');
  } finally {
    fixturePhotoButton.disabled = false;
  }
};
`;
html = html.replace(initializeMarker, encodeAttribute(sampleHandler) + initializeMarker);

const fixture = String.raw`
// PREVIEW ONLY: all birds, points and works below are transient example data.
// No IndexedDB, localStorage, guest wallet mutation or backend request is made.
(() => {
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname)) {
    throw Error('This example page is available only on a local preview host.');
  }
  const works = new Map();
  const birdId = 'a'.repeat(32);
  const wallet = Object.freeze({ balance: 21 });
  const bird = Object.freeze({
    id: birdId, name: '湖小叽', cityCode: 'hangzhou', cityName: '杭州',
    typeId: 'hy', skinId: 'default', active: true
  });
  const catalog = [
    { key: 'preview-hz-white-1', name: '高透白洁（测试）', typeId: 'hy-white-1' },
    { key: 'preview-hz-hy-2', name: '小黄莺', typeId: 'hy-2' },
    { key: 'preview-hz-white-2', name: '高透白洁', typeId: 'hy-white-2' }
  ].map(item => ({ ...item, cityCode: 'hangzhou', cityName: '杭州', skinId: 'default' }));
  const operations = ['bootstrap', 'history', 'detail', 'image', 'original', 'create', 'points'];
  const get = id => {
    const row = works.get(id);
    if (!row) throw Error('本次预览中没有找到这张合照');
    return row;
  };
  const view = row => ({
    id: row.id, status: 'COMPLETE', birdIds: [...row.metadata.birdIds],
    styleId: row.metadata.styleId, label: row.metadata.label,
    createdAt: row.createdAt, reward: 0, localOnly: true, previewOnly: true
  });
  window.xcwcLocalAlbum = {
    operations,
    clear: async () => { works.clear(); },
    async run(operation, args = {}) {
      if (operation === 'bootstrap') return {
        authenticated: true, localMode: true, birds: [{ ...bird }],
        wallet: { ...wallet }, catalog: catalog.map(item => ({ ...item }))
      };
      if (operation === 'points') return { ...wallet };
      if (operation === 'history') {
        const rows = [...works.values()].sort((a, b) =>
          b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
        const start = args.cursor ? rows.findIndex(row => row.id === args.cursor) + 1 : 0;
        if (args.cursor && start === 0) throw Error('预览列表已变化，请刷新');
        const page = rows.slice(start, start + 20);
        return {
          items: page.map(view), total: rows.length,
          nextCursor: rows.length > start + page.length ? page.at(-1).id : null
        };
      }
      if (operation === 'detail') return view(get(args.id));
      if (operation === 'image' || operation === 'original') return get(args.id)[operation];
      if (operation === 'create') {
        const metadata = args.metadata;
        if (!metadata || !/^[a-zA-Z0-9_-]{16,64}$/.test(metadata.requestId || '') ||
            !Array.isArray(metadata.birdIds) || metadata.birdIds.length !== 1 ||
            metadata.birdIds[0] !== birdId) throw Error('请选择预览中的湖小叽');
        if (!(args.image instanceof Blob) || !(args.original instanceof Blob)) {
          throw Error('请先选择一张本机照片');
        }
        const id = metadata.requestId.replaceAll('-', '');
        if (!works.has(id)) works.set(id, {
          id, metadata: { ...metadata, birdIds: [...metadata.birdIds] },
          image: args.image, original: args.original, createdAt: new Date().toISOString()
        });
        return view(works.get(id));
      }
      throw Error('预览不支持此操作');
    }
  };
})();
`;

if (!html.includes('</body>')) throw Error('Missing HTML body closing tag.');
html = html.replace('</body>', '<script>' + fixture + '</script>\n</body>');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, html, 'utf8');
console.log('Derived local-only preview: ' + output);

if (args.includes('--serve')) {
  const port = Number(process.env.PORT || 8798);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('PORT must be an integer from 1 to 65535.');
  const types = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8', '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
    '.svg': 'image/svg+xml', '.gif': 'image/gif', '.avif': 'image/avif',
    '.woff': 'font/woff', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg'
  };
  const server = http.createServer((request, response) => {
    const fail = (code, message) => {
      response.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(message);
    };
    let url, pathname;
    try {
      if (!request.url.startsWith('/') || request.url.startsWith('//')) throw Error('Invalid path');
      url = new URL(request.url, 'http://127.0.0.1');
      // Inspect before URL normalization so encoded/raw traversal is rejected.
      pathname = decodeURIComponent(request.url.split('?')[0]);
    } catch { fail(400, 'Invalid path'); return; }
    if (pathname.startsWith('/api/')) { fail(503, 'Visual preview has no backend.'); return; }
    if (!['GET', 'HEAD'].includes(request.method)) { fail(405, 'Read-only preview'); return; }
    if (pathname.includes('\\') || pathname.includes('\0') ||
        pathname.split('/').some(segment => segment === '..' || segment === '.')) {
      fail(400, 'Invalid path'); return;
    }
    let filename;
    if (pathname === '/' || pathname === '/index.html') {
      if (url.searchParams.has('page') && url.searchParams.get('page') !== 'photo') {
        fail(404, 'Only the photo preview route is available.'); return;
      }
      if (url.searchParams.has('birdCode') || url.searchParams.has('bird')) {
        fail(404, 'Entity lookup is unavailable in the visual preview.'); return;
      }
      filename = output;
    } else {
      const prefix = pathname.startsWith('/assets/') ? 'assets' :
        pathname.startsWith('/vendor/') ? 'vendor' : null;
      if (!prefix) { fail(404, 'Not found'); return; }
      const directory = path.resolve(dist, prefix);
      filename = path.resolve(dist, '.' + pathname);
      if (!filename.startsWith(directory + path.sep)) { fail(400, 'Invalid path'); return; }
      try {
        // Resolve symlinks too, so a static path cannot escape its allowlisted tree.
        const realDirectory = fs.realpathSync(directory);
        filename = fs.realpathSync(filename);
        if (!filename.startsWith(realDirectory + path.sep)) { fail(400, 'Invalid path'); return; }
      } catch { fail(404, 'Not found'); return; }
    }
    try {
      if (!fs.statSync(filename).isFile()) { fail(404, 'Not found'); return; }
      const bytes = fs.readFileSync(filename);
      response.writeHead(200, {
        'Content-Type': types[path.extname(filename).toLowerCase()] || 'application/octet-stream',
        'Content-Length': bytes.length, 'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*', 'X-Content-Type-Options': 'nosniff'
      });
      response.end(request.method === 'HEAD' ? undefined : bytes);
    } catch { fail(404, 'Not found'); }
  });
  server.listen(port, '127.0.0.1', () => console.log('Local visual preview: http://127.0.0.1:' + port + '/?page=photo'));
} else {
  console.log('Serve locally with: node scripts/preview-checkin-felt.cjs --serve');
}
