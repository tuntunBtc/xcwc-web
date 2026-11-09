from pathlib import Path
import html
import base64
import re
import json
import mimetypes
import shutil
from media_pipeline import MediaPlan
from build_directory import build_directory

ROOT = Path(__file__).resolve().parents[1]


def build(dist):
    media = MediaPlan(ROOT, output_dir=dist)
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
    app = (ROOT / 'src/checkin-photo.js').read_text(encoding='utf-8') + '\n' + (ROOT / 'src/checkin-audio.js').read_text(encoding='utf-8') + '\n' + (ROOT / 'src/checkin-page.js').read_text(encoding='utf-8')
    app = app.replace('__CHECKIN_SHUTTER_AUDIO__', base64.b64encode((ROOT/'assets/audio/camera.mp3').read_bytes()).decode('ascii'))
    for token, file in [('__CHECKIN_CLOUD__','checkin-cloud.js'),('__CHECKIN_GENERATE__','checkin-generate.js'),('__CHECKIN_INITIALIZE__','checkin-initialize.js'),('__CHECKIN_MODEL__','checkin-model.mjs')]:
        app = app.replace(token, (ROOT / 'src' / file).read_text(encoding='utf-8'))
    app = app.replace('export ', '')
    app = app.replace('function toast(text){', "function toast(text){if(destroyed)return;rpc('notice',{message:text}).catch(()=>{});")
    app = app.replace('const host=root.querySelector(".checkin-page");', 'const host=root.querySelector(".checkin-page");host.querySelectorAll("[data-checkin-asset]").forEach(image=>image.src=checkinAssets[image.dataset.checkinAsset]);')
    asset_script = 'const checkinAssets=' + json.dumps(checkin_assets,ensure_ascii=False) + ';\n'
    rpc = (ROOT / 'src/checkin-rpc.js').read_text(encoding='utf-8')
    frame = frame.replace('function photoPage(){', rpc + '\n/*XCWC_ROUTE_PHOTO_BEGIN*/\n' + asset_script + 'const checkinTemplate=' + json.dumps(template,ensure_ascii=False) + ';\n' + app + '\n/*XCWC_ROUTE_PHOTO_END*/\nfunction photoPage(){',1)
    start = frame.index('function photoPage(){');end = frame.index('function wardrobe(){',start)
    frame = frame[:start] + 'function photoPage(){return checkinTemplate;}\n' + frame[end:]
    start = frame.index('function bindPhoto(){');end = frame.index('async function exportCard(){',start)
    frame = frame[:start] + 'function bindPhoto(){mountCheckin();}\n' + frame[end:]
    frame = frame.replace('function render(){', "function render(){if(checkinCleanup){checkinCleanup();checkinCleanup=null;}root.classList.toggle('is-checkin',s.page==='photo');",1)
    frame = frame.replace('function nav(p){', "function nav(p){if(p==='photo'&&s.page!=='photo')checkinBack=s.page;",1)
    frame = frame.replace("render();\nif(globalThis.Tweak)", "if(new URLSearchParams(location.search).get('page')==='photo')s.page='photo';render();\nif(globalThis.Tweak)")
    # srcdoc has about:srcdoc location; the parent forwards only the requested initial page, never credentials.
    frame = frame.replace("if(new URLSearchParams(location.search).get('page')==='photo')s.page='photo';", "if(window.openai?.widgetState?.privateContent?.initialCheckin)s.page='photo';")
    frame = frame.replace('</head>', '<style data-xcwc-route="photo">' + checkin_css + '</style></head>',1)
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
    frame=frame[:start]+'/*XCWC_ROUTE_SHOP_BEGIN*/\n'+shop_setup+'\n/*XCWC_ROUTE_SHOP_END*/'+"\nfunction shop(){return `<section id='xcwc-shop' aria-label='小鸟商城'></section>`;}\n"+frame[end:]
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
    frame = media.rewrite(frame)
    frame = frame.replace('</head>', '<script>'+(ROOT/'src/media-lazy.js').read_text(encoding='utf-8')+'</script>'+media.helper() + '</head>', 1)
    frame = frame.replace('crypto.randomUUID()', 'xcwcRandomId()')
    frame = frame.replace('function accountRpc(', "function xcwcRandomId(){const b=new Uint8Array(16);crypto.getRandomValues(b);return Array.from(b,n=>n.toString(16).padStart(2,'0')).join('');}\nfunction accountRpc(",1)
    from runtime_bundle import RuntimeBundle
    runtime = RuntimeBundle(ROOT, media, output_dir=dist)
    frame = runtime.split_frame(frame)
    shell = (ROOT / 'src/shell.html').read_text(encoding='utf-8')
    # The srcdoc inherits its parent policy as well; allow local static vendor scripts.
    shell = shell.replace('script-src ', "script-src 'self' ", 1)
    shell = shell.replace('style-src ', "style-src 'self' ", 1)
    shell = re.sub(r'data-srcdoc=".*?"', lambda _: 'data-srcdoc="' + html.escape(frame, quote=True) + '"', shell, count=1, flags=re.S)
    shell = shell.replace('<title>bujidao-ui.html</title>', '<title>啾游记  小鸟旅行日记</title>')
    shell = shell.replace('</head>', '<style>body{background:#eceee6} @media(max-width:520px){body{padding:0}iframe{height:100vh;max-width:100%}}</style></head>', 1)
    shell = shell.replace('img-src blob: data:', "img-src 'self' blob: data:",1)
    shell = shell.replace('connect-src blob: data:;', "connect-src 'self' blob: data:;",1)
    shell = shell.replace('const initialGlobals = {', "if(new URLSearchParams(location.search).get('page')==='photo'){state={...state,privateContent:{...state?.privateContent,page:'photo'}};}\n  const initialGlobals = {",1)
    shell = shell.replace('</body>', '<script>' + (ROOT/'src/account/session-store.js').read_text(encoding='utf-8') + '</script></body>',1)
    shop_layout,shop_host=(ROOT/'src/shop/host.js').read_text(encoding='utf-8').split('// Shop-only public reads',1)
    host_features={
        'shop':runtime.emit('shop-host',"window.xcwcHostFeatures.register('shop',()=>{\n// Shop-only public reads"+shop_host+"\n});").replace('__XCWC_ASSET_ORIGIN__',''),
        'photo':runtime.emit('photo-host',"window.xcwcHostFeatures.register('photo',()=>{\n"+'\n;\n'.join((ROOT/'src'/name).read_text(encoding='utf-8') for name in ['guest-album.js','photo-save.js','checkin-host.js'])+"\n});").replace('__XCWC_ASSET_ORIGIN__',''),
    }
    feature_host=(ROOT/'src/host-features.js').read_text(encoding='utf-8').replace('__XCWC_HOST_FEATURES__',json.dumps(host_features))
    shell = shell.replace('</body>', '<script>'+shop_layout+'</script><script>'+feature_host+'</script></body>',1)
    shell = shell.replace('</body>','<script>'+(ROOT/'src/browser-compat.js').read_text(encoding='utf-8')+'</script></body>',1)
    shell = shell.replace('</body>', '<script>'+(ROOT/'src/account-session.js').read_text(encoding='utf-8')+'</script></body>',1)
    wardrobe_catalog=(ROOT/'src/wardrobe-catalog.mjs').read_text(encoding='utf-8').replace('export ','')
    guest_model=(ROOT/'src/guest-store.mjs').read_text(encoding='utf-8')
    guest_model=guest_model.replace("import {WARDROBE_SKINS,getWardrobeSkin} from './wardrobe-catalog.mjs';\n",'').replace('export ','')
    guest_host=(ROOT/'src/guest-host.js').read_text(encoding='utf-8').replace('__GUEST_MODEL__',wardrobe_catalog+'\n'+guest_model)
    shell = shell.replace('</body>','<script>'+guest_host+'</script></body>',1)
    shell = shell.replace('</body>','<script>'+(ROOT/'src/local-data-reset.js').read_text(encoding='utf-8')+'</script></body>',1)
    shell=shell.replace('const initialGlobals = {', "if(new URLSearchParams(location.search).get('page')==='shop'){state={...state,privateContent:{...state?.privateContent,page:'shop',initialShop:true}};}\n  const initialGlobals = {",1)
    account_host=(ROOT/'src/account-host.js').read_text(encoding='utf-8').replace('__ADOPTION_ENTRY__',(ROOT/'src/adopt/entry.mjs').read_text(encoding='utf-8').replace('export ',''))
    shell = shell.replace('</body>', '<script>'+account_host+'</script></body>',1)
    shell = shell.replace('</body>', '<script>'+(ROOT/'src/navigation-host.js').read_text(encoding='utf-8')+'</script></body>',1)
    shell = shell.replace('const initialGlobals = {', "const routeParams=new URLSearchParams(location.search);const requestedPage=routeParams.has('birdCode')||routeParams.has('bird')?'adopt':routeParams.get('page');if(['home','city','adopt','photo','shop','profile','wardrobe','flock'].includes(requestedPage)){state={...state,privateContent:{...state?.privateContent,page:requestedPage}};}\n  const initialGlobals = {",1)
    shell = shell.replace('</head>', '<style>html,body{margin:0!important;padding:0!important}#codex-visualization{width:100%;max-width:none!important;margin:0!important;border:0;display:block}</style></head>',1)
    shell = shell.replace('frame.srcdoc = frameHtml;', "frame.srcdoc = frameHtml.replaceAll('__XCWC_ASSET_ORIGIN__', location.origin).replace('__XCWC_INITIAL_PRELOADS__', xcwcInitialHints(initialGlobals.widgetState?.privateContent?.page));")
    shell = shell.replace('crypto.randomUUID()', 'window.xcwcRandomId()')
    shell = re.sub(r'[ \t]+\n', '\n', shell)
    shell = media.rewrite(shell)
    shell = runtime.split_shell(shell)
    # Resolve the parent policy before any runtime resource or sandbox is parsed.
    # WebKit history restores opaque srcdoc with a different interpretation of self.
    def install_origin_policy(match):
        policy = json.dumps(html.unescape(match.group(1)), ensure_ascii=False).replace('<', r'\u003c')
        return '<script>(()=>{const policy=document.createElement("meta");policy.httpEquiv="Content-Security-Policy";policy.content='+policy+'.replaceAll("\'self\'",location.origin);document.currentScript.before(policy)})();</script>'
    shell, policy_count = re.subn(r'<meta http-equiv="Content-Security-Policy" content="([^"]*)">', install_origin_policy, shell, count=1)
    if policy_count != 1:
        raise RuntimeError('Expected one parent content security policy')

    runtime.finish()
    # Fail missing-reference/budget checks before replacing any existing application shell.
    media.budgets(media.required(shell))
    dist.mkdir(exist_ok=True)
    (dist / 'index.html').write_text(shell, encoding='utf-8')
    shutil.copy2(ROOT/'assets/optimized/favicon/huangying.ico', dist/'favicon.ico')
    for photo_save_file in ['photo-save.html','photo-save.js','photo-save-receiver.js']:
        shutil.copy2(ROOT/'src'/photo_save_file,dist/photo_save_file)
    shutil.copytree(ROOT/'vendor', dist/'vendor', dirs_exist_ok=True)
    account=ROOT/'src/account';(dist/'preview').mkdir(exist_ok=True)
    for name in ['registration.js','registration.css','points.js','session-store.js']:
        (dist/'preview'/name).write_text(media.rewrite((account/name).read_text(encoding='utf-8')),encoding='utf-8')
    registration=(account/'register.html').read_text(encoding='utf-8').replace('</header>', '<a id="xcwc-return" href="/?page=photo">返回应用 →</a></header>',1)
    registration=registration.replace('<script type="module"', '<script src="/preview/session.js"></script><script type="module"',1)
    registration=registration.replace('</body>', '<script src="/preview/return.js"></script></body>')
    # Keep the established NFC URL. The same app shell reads the original query without redirects.
    (dist/'register.html').write_text(shell,encoding='utf-8')
    shutil.copy2(ROOT/'src'/'analytics.html', dist/'analytics.html')
    (dist/'account.html').write_text(registration,encoding='utf-8')
    shutil.copy2(ROOT/'src/account-session.js',dist/'preview/session.js')
    shutil.copy2(account/'return.js',dist/'preview/return.js')
    (dist/'miniprogram/assets').mkdir(parents=True,exist_ok=True)
    shutil.copy2(account/'bird_calm.png',dist/'miniprogram/assets/bird_calm.png')
    media_manifest = media.publish(shell)
    for generated_file in (dist).rglob('*'):
        if generated_file.is_file() and (generated_file.name in {'.DS_Store','Thumbs.db'} or generated_file.name.startswith('._')):
            generated_file.unlink()
    media.check()
    return media_manifest, (dist / 'index.html').stat().st_size


if __name__ == '__main__':
    with build_directory(ROOT / 'dist') as destination:
        manifest, shell_bytes = build(destination)
    print('Published runtime media:', len(manifest['files']), 'files,', manifest['totalBytes'], 'bytes')
    print('Built sandboxed room experience:', shell_bytes, 'bytes')
