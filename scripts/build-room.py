from pathlib import Path
import html
import re
import json
import mimetypes
import shutil

ROOT = Path(__file__).resolve().parents[1]
def data_image(name):
    p = ROOT / 'assets' / name
    return '__XCWC_ASSET_ORIGIN__/assets/' + name

frame = (ROOT / 'src/frame.html').read_text(encoding='utf-8')
# The legacy prototype also stays on the shared, independently cacheable character.
frame, legacy_bird_replacements = re.subn(
    r"const asset='data:image/png;base64,[^']*';",
    lambda _: "const asset='" + data_image('birds/huangying/happy-hero-640.webp') + "';",
    frame, count=1)
if legacy_bird_replacements != 1:
    raise RuntimeError('Expected one legacy inline bird asset in frame.html')
css = (ROOT / 'src/room.css').read_text(encoding='utf-8')
css += '\n' + (ROOT / 'src/reference-pages.css').read_text(encoding='utf-8')
js = (ROOT / 'src/room.js').read_text(encoding='utf-8')
js = js.replace('__ROOM_BACKGROUND__', data_image('room-background.png')).replace('__ROOM_BIRD__', data_image('birds/huangying/happy-hero-640.webp'))
reference_js = (ROOT / 'src/reference-pages.js').read_text(encoding='utf-8')
for token, filename in [('__REFERENCE_TREEHOUSE__', 'scenes/treehouse-960.webp'), ('__REFERENCE_CITIES__', 'scenes/city-landscapes-1200.webp'), ('__REFERENCE_PROPS__', 'ui/painted-props-768.webp')]:
    reference_js = reference_js.replace(token, data_image(filename))
start = frame.index('function home(){')
end = frame.index('function adopt(){', start)
frame = frame[:start] + js + '\n' + reference_js + '\nfunction home(){return referenceHome();}\n' + frame[end:]
start = frame.index('function city(){')
end = frame.index('function photoPage(){', start)
frame = frame[:start] + 'function city(){return referenceCity();}\n' + frame[end:]
frame = frame.replace('function render(){if(!pages.some', "function render(){root.classList.toggle('is-room',s.page==='home');if(!pages.some")
frame = frame.replace("if(s.page==='photo')bindPhoto();}", "if(s.page==='photo')bindPhoto();if(s.page==='home')bindRoom();referenceChrome();}")
frame = frame.replace('function save(){syncPet();try', 'function save(){syncPet();s.roomStock=roomState.stock;try')
frame = frame.replace("s.pets.push({name:n,hunger:65,water:78});", "s.pets.push({name:n,hunger:65,water:78,city:s.pendingAdoptionCity||'杭州'});if(s.pendingAdoptionCity){if(!s.unlockedCities.includes(s.pendingAdoptionCity))s.unlockedCities.push(s.pendingAdoptionCity);s.homeCity=s.pendingAdoptionCity;s.homeScene='treehouse';}s.pendingAdoptionCity=null;")
frame = frame.replace('<p>参考角色 · 杭州 · 好奇、亲人</p>', "<p>参考角色 · ${esc(s.pendingAdoptionCity||'杭州')} · 好奇、亲人</p>")
frame = frame.replace("function nav(p){s.page=p;", "function nav(p){if(p==='city'&&s.page!=='city')s.cityDetail=false;s.page=p;")
frame = frame.replace('</head>', '<style>\n' + css + '\n</style></head>', 1)
vendor_scripts = {
    'https://unpkg.com/lucide@1.17.0/dist/umd/lucide.js': 'lucide.js',
    'https://unpkg.com/@floating-ui/core@1.7.3/dist/floating-ui.core.umd.min.js': 'floating-ui.core.js',
    'https://unpkg.com/@floating-ui/dom@1.7.4/dist/floating-ui.dom.umd.min.js': 'floating-ui.dom.js',
}
for url, filename in vendor_scripts.items():
    if not (ROOT / 'vendor' / filename).is_file():
        raise FileNotFoundError('Missing local vendor script: ' + filename)
    pattern = r'<script([^>]*?)\s+src="' + re.escape(url) + r'"([^>]*)>\s*</script>'
    def local_vendor_script(match):
        attributes = re.sub(r'\s+async(?:=(?:"[^"]*"|\'[^\']*\'|[^\s>]+))?', '', match.group(1) + match.group(2))
        return '<script' + attributes + ' src="__XCWC_ASSET_ORIGIN__/vendor/' + filename + '"></script>'
    frame, replacements = re.subn(pattern, local_vendor_script, frame)
    if replacements != 1:
        raise RuntimeError('Expected one script reference for ' + filename)
# Sandboxed srcdoc has an opaque origin: allow only this controlled static origin.
frame = frame.replace('script-src ', 'script-src __XCWC_ASSET_ORIGIN__ ', 1)
frame = frame.replace("home:'小窝 · 点小鸟触摸互动；连续轻点可体验炸毛反馈。每只小鸟独立保存状态。积分、补给和每日上限均为评审示例。'", "home:'沉浸式喂养体验 · 点击或拖动食物投喂，试试添水、摸头和清洁。角色使用预制透明素材与轻量动画；补给、羽力数值为演示规则。'")
# Adopt the confirmed checkin snapshot as scoped source, retaining the existing photo route.
checkin_assets = {}
for file in (ROOT / 'src/checkin-assets').iterdir():
    if file.is_file():
        checkin_assets[file.name] = (data_image('nest/felt/emotions/happy-400.webp')
            if re.fullmatch(r'bird(?:-\d+)?\.png', file.name)
            else '__XCWC_ASSET_ORIGIN__/assets/checkin/' + file.name)
checkin_css = (ROOT / 'src/checkin-page.css').read_text(encoding='utf-8')
for name, url in checkin_assets.items():
    checkin_css = checkin_css.replace('assets/' + name, url)
template = (ROOT / 'src/checkin-template.html').read_text(encoding='utf-8')
template = re.sub(r'src="assets/([^"]+)"', r'data-checkin-asset="\1"', template)
app = (ROOT / 'src/checkin-photo.js').read_text(encoding='utf-8') + '\n' + (ROOT / 'src/checkin-page.js').read_text(encoding='utf-8')
for token, file in [('__CHECKIN_CLOUD__','checkin-cloud.js'),('__CHECKIN_GENERATE__','checkin-generate.js'),('__CHECKIN_INITIALIZE__','checkin-initialize.js'),('__CHECKIN_MODEL__','checkin-model.mjs')]:
    app = app.replace(token, (ROOT / 'src' / file).read_text(encoding='utf-8'))
app = app.replace('export ', '')
app = app.replace('function toast(text){', "function toast(text){if(destroyed)return;rpc('notice',{message:text}).catch(()=>{});")
app = app.replace('const host=root.querySelector(".checkin-page");', 'const host=root.querySelector(".checkin-page");host.querySelectorAll("[data-checkin-asset]").forEach(image=>image.src=checkinAssets[image.dataset.checkinAsset]);')
app = app.replace('showViewer();', 'showViewer().catch(error=>{if(!destroyed)toast(error.message)});')
asset_script = 'const checkinAssets=' + json.dumps(checkin_assets,ensure_ascii=False) + ';\n'
rpc = (ROOT / 'src/checkin-rpc.js').read_text(encoding='utf-8')
frame = frame.replace('function photoPage(){', rpc + '\n' + asset_script + 'const checkinTemplate=' + json.dumps(template,ensure_ascii=False) + ';\n' + app + '\nfunction photoPage(){',1)
start = frame.index('function photoPage(){');end = frame.index('function wardrobe(){',start)
frame = frame[:start] + 'function photoPage(){return checkinTemplate;}\n' + frame[end:]
start = frame.index('function bindPhoto(){');end = frame.index('async function exportCard(){',start)
frame = frame[:start] + 'function bindPhoto(){mountCheckin();}\n' + frame[end:]
frame = frame.replace('function render(){', "function render(){if(checkinCleanup){checkinCleanup();checkinCleanup=null;}root.classList.toggle('is-checkin',s.page==='photo');",1)
frame = frame.replace('function nav(p){', "function nav(p){if(p==='photo'&&s.page!=='photo')checkinBack=s.page;",1)
frame = frame.replace("render();\nif(globalThis.Tweak)", "if(new URLSearchParams(location.search).get('page')==='photo')s.page='photo';render();\nif(globalThis.Tweak)")
# srcdoc has about:srcdoc location; the parent forwards only the requested initial page, never credentials.
frame = frame.replace("if(new URLSearchParams(location.search).get('page')==='photo')s.page='photo';", "if(window.openai?.widgetState?.privateContent?.initialCheckin)s.page='photo';")
frame = frame.replace('</head>', '<style>' + checkin_css + '</style></head>',1)
frame = frame.replace('img-src blob: data:', 'img-src __XCWC_ASSET_ORIGIN__ blob: data:',1)
# Confirmed shop V1.0: native route module with isolated styles and shared app state.
shop_root = ROOT / 'src/shop'
shop_product_source = (shop_root/'products.js').read_text(encoding='utf-8')
shop_ids = re.findall(r"\bid:'([^']+)'", shop_product_source)
shop_assets = {product_id: data_image('birds/huangying/happy-card-400.webp') for product_id in shop_ids}
shop_setup = 'const shopAssets=' + json.dumps(shop_assets) + ';\n'
shop_setup += 'const shopCss=' + json.dumps((shop_root/'shop.css').read_text(encoding='utf-8')) + ';\n'
shop_setup += 'const shopTemplate=' + json.dumps((shop_root/'template.html').read_text(encoding='utf-8')) + ';\n'
shop_setup += (shop_root/'shop.js').read_text(encoding='utf-8').replace('__SHOP_PRODUCTS__',shop_product_source)
start=frame.index('function shop(){');end=frame.index('function profile(){',start)
frame=frame[:start]+shop_setup+"\nfunction shop(){return `<section id='xcwc-shop' aria-label='小鸟商城'></section>`;}\n"+frame[end:]
frame=frame.replace('referenceChrome();}',"referenceChrome();if(s.page==='shop')mountShop();}")
frame=frame.replace('function render(){if(checkinCleanup)',"function render(){document.body.style.overflow='';root.classList.toggle('is-shop',s.page==='shop');if(checkinCleanup)",1)
frame=frame.replace("['adopt','认领'],",'')
frame=re.sub(r'<button[^>]*data-go="adopt"[^>]*>.*?</button>','',frame)
frame=frame.replace("${go('adopt','＋ 领养另一只小伙伴','primary')}",'')
frame=frame.replace("if(p==='photo'", "if(p==='photo'",1)
frame=frame.replace("root.querySelector('#reviewnote').textContent=note[s.page];","root.querySelector('#reviewnote').textContent=s.page==='shop'?'商城 · 演示价格与销量；购物车跳转淘宝，不在站内下单，不自动发放鸟蛋。':note[s.page];")
frame=frame.replace("if(window.openai?.widgetState?.privateContent?.initialCheckin)s.page='photo';", "if(window.openai?.widgetState?.privateContent?.initialCheckin)s.page='photo';if(window.openai?.widgetState?.privateContent?.initialShop)s.page='shop';delete s.initialShop;")
frame=frame.replace('</head>','<style>html:has(#bjd-review.is-shop),body:has(#bjd-review.is-shop){margin:0;overflow:hidden}#bjd-review.is-shop{height:100dvh;padding:0;background:#faf5e9}#bjd-review.is-shop .reviewbar,#bjd-review.is-shop .reviewnote{display:none}#bjd-review.is-shop .phone{height:100dvh;display:flex;flex-direction:column;border:0;border-radius:0}#bjd-review.is-shop main{padding:0;min-height:0;overflow:auto;flex:1}#bjd-review.is-shop .bottom{flex-shrink:0;background:#fff9ed;padding-bottom:max(16px,env(safe-area-inset-bottom))}#bjd-review.is-checkin .phone>.bottom{display:flex}#bjd-review.is-shop .brandbar{display:none}#bjd-review.is-shop .phone{max-width:660px;width:100%}#bjd-review .bottom button{width:20%}</style></head>',1)

import runpy
frame=runpy.run_path(str(ROOT/'scripts/integrate-pages.py'))['integrate_pages'](frame)
frame = frame.replace('crypto.randomUUID()', 'xcwcRandomId()')
frame = frame.replace('function accountRpc(', "function xcwcRandomId(){const b=new Uint8Array(16);crypto.getRandomValues(b);return Array.from(b,n=>n.toString(16).padStart(2,'0')).join('');}\nfunction accountRpc(",1)
shell = (ROOT / 'src/shell.html').read_text(encoding='utf-8')
# The srcdoc inherits its parent policy as well; allow local static vendor scripts.
shell = shell.replace('script-src ', "script-src 'self' ", 1)
shell = re.sub(r'data-srcdoc=".*?"', lambda _: 'data-srcdoc="' + html.escape(frame, quote=True) + '"', shell, count=1, flags=re.S)
shell = shell.replace('<title>bujidao-ui.html</title>', '<title>卜叽岛 · 小鸟的江南小窝</title>')
shell = shell.replace('</head>', '<style>body{background:#eceee6} @media(max-width:520px){body{padding:0}iframe{height:100vh;max-width:100%}}</style></head>', 1)
shell = shell.replace('img-src blob: data:', "img-src 'self' blob: data:",1)
shell = shell.replace('connect-src blob: data:;', "connect-src 'self' blob: data:;",1)
shell = shell.replace('const initialGlobals = {', "if(new URLSearchParams(location.search).get('page')==='photo'){state={...state,privateContent:{...state?.privateContent,page:'photo'}};}\n  const initialGlobals = {",1)
shell = shell.replace('</body>', '<script>' + (ROOT/'src/account/session-store.js').read_text(encoding='utf-8') + '</script></body>',1)
shell = shell.replace('</body>', '<script>' + (ROOT/'src/shop/host.js').read_text(encoding='utf-8') + '</script></body>',1)
shell = shell.replace('</body>','<script>'+(ROOT/'src/browser-compat.js').read_text(encoding='utf-8')+'</script></body>',1)
shell = shell.replace('</body>', '<script>'+(ROOT/'src/account-session.js').read_text(encoding='utf-8')+'</script></body>',1)
guest_host=(ROOT/'src/guest-host.js').read_text(encoding='utf-8').replace('__GUEST_MODEL__',(ROOT/'src/guest-store.mjs').read_text(encoding='utf-8').replace('export ',''))
shell = shell.replace('</body>','<script>'+guest_host+'</script></body>',1)
shell = shell.replace('</body>','<script>'+(ROOT/'src/guest-album.js').read_text(encoding='utf-8')+'</script></body>',1)
shell = shell.replace('</body>','<script>'+(ROOT/'src/local-data-reset.js').read_text(encoding='utf-8')+'</script></body>',1)
shell = shell.replace('</body>', '<script>' + (ROOT/'src/checkin-host.js').read_text(encoding='utf-8') + '</script></body>',1)
shell=shell.replace('const initialGlobals = {', "if(new URLSearchParams(location.search).get('page')==='shop'){state={...state,privateContent:{...state?.privateContent,page:'shop',initialShop:true}};}\n  const initialGlobals = {",1)
account_host=(ROOT/'src/account-host.js').read_text(encoding='utf-8').replace('__ADOPTION_ENTRY__',(ROOT/'src/adopt/entry.mjs').read_text(encoding='utf-8').replace('export ',''))
shell = shell.replace('</body>', '<script>'+account_host+'</script></body>',1)
shell = shell.replace('const initialGlobals = {', "const routeParams=new URLSearchParams(location.search);const requestedPage=routeParams.has('birdCode')||routeParams.has('bird')?'adopt':routeParams.get('page');if(['home','city','adopt','photo','shop','profile','wardrobe','flock'].includes(requestedPage)){state={...state,privateContent:{...state?.privateContent,page:requestedPage}};}\n  const initialGlobals = {",1)
shell = shell.replace('</head>', '<style>html,body{margin:0!important;padding:0!important}#codex-visualization{width:100%;max-width:none!important;margin:0!important;border:0;display:block}</style></head>',1)
shell = shell.replace('frame.srcdoc = frameHtml;', "frame.srcdoc = frameHtml.replaceAll('__XCWC_ASSET_ORIGIN__', location.origin);")
shell = shell.replace('crypto.randomUUID()', 'window.xcwcRandomId()')
shell = re.sub(r'[ \t]+\n', '\n', shell)
(ROOT / 'dist/index.html').write_text(shell, encoding='utf-8')
shutil.copytree(ROOT/'assets', ROOT/'dist/assets', dirs_exist_ok=True)
shutil.copytree(ROOT/'vendor', ROOT/'dist/vendor', dirs_exist_ok=True)
shutil.copytree(ROOT/'src/checkin-assets', ROOT/'dist/assets/checkin', dirs_exist_ok=True)
account=ROOT/'src/account';(ROOT/'dist/preview').mkdir(exist_ok=True)
for name in ['registration.js','registration.css','points.js','session-store.js']:
    shutil.copy2(account/name,ROOT/'dist/preview'/name)
registration=(account/'register.html').read_text(encoding='utf-8').replace('</header>', '<a id="xcwc-return" href="/?page=photo">返回应用 →</a></header>',1)
registration=registration.replace('<script type="module"', '<script src="/preview/session.js"></script><script type="module"',1)
registration=registration.replace('</body>', '<script src="/preview/return.js"></script></body>')
# Keep the established NFC URL. The same app shell reads the original query without redirects.
(ROOT/'dist/register.html').write_text(shell,encoding='utf-8')
(ROOT/'dist/account.html').write_text(registration,encoding='utf-8')
shutil.copy2(ROOT/'src/account-session.js',ROOT/'dist/preview/session.js')
shutil.copy2(account/'return.js',ROOT/'dist/preview/return.js')
(ROOT/'dist/miniprogram/assets').mkdir(parents=True,exist_ok=True)
shutil.copy2(account/'bird_calm.png',ROOT/'dist/miniprogram/assets/bird_calm.png')
print('Built sandboxed room experience:', (ROOT / 'dist/index.html').stat().st_size, 'bytes')
