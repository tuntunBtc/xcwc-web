"""Build adapters for the immutable 2026-10-30 page baselines."""
from pathlib import Path
import hashlib,json,re
ROOT=Path(__file__).resolve().parents[1]
def integrate_pages(frame):
    account=(ROOT/'src/account-pages.js').read_text(encoding='utf-8')
    shared,account_page=account.split('function feltProfileContent',1)
    module=(ROOT/'src/wardrobe-catalog.mjs').read_text(encoding='utf-8').replace('export ','')+'\n'+(ROOT/'src/adopt/entry.mjs').read_text(encoding='utf-8').replace('export ','')+'\n'+(ROOT/'src/account-client.js').read_text(encoding='utf-8')+'\n'+(ROOT/'src/navigation.js').read_text(encoding='utf-8')+'\n'+shared
    module+='\n/*XCWC_ROUTE_ACCOUNT_BEGIN*/\nfunction feltProfileContent'+account_page+'\n/*XCWC_ROUTE_ACCOUNT_END*/\n'
    for name in ['nest','city']:
        module+='\n/*XCWC_ROUTE_'+name.upper()+'_BEGIN*/\nconst '+name+'Css='+json.dumps((ROOT/f'src/{name}/{name}.css').read_text(encoding='utf-8'),ensure_ascii=False)+';\n'
        module+='const '+name+'Template='+json.dumps((ROOT/f'src/{name}/template.html').read_text(encoding='utf-8'),ensure_ascii=False)+';\n'
        if name=='nest':
            touch=json.loads((ROOT/'src/nest/foot-hit-areas.json').read_text(encoding='utf-8'))
            if touch.get('schemaVersion')!=1:
                raise ValueError('Unsupported nest touch mask version')
            for area in touch['areas'].values():
                source=(ROOT/area['sourceFile']).resolve()
                if not source.is_relative_to((ROOT/'assets').resolve()) or hashlib.sha256(source.read_bytes()).hexdigest()!=area['sourceSha256']:
                    raise ValueError('Nest foot artwork changed; run scripts/prepare-nest-touch-areas.py: '+area['sourceFile'])
            runtime={key:{field:area[field] for field in ['width','height','masks']} for key,area in touch['areas'].items()}
            module+='const nestFootHitAreas='+json.dumps(runtime,separators=(',',':'))+';\n'
        module+=(ROOT/f'src/{name}/{name}.js').read_text(encoding='utf-8')+'\n/*XCWC_ROUTE_'+name.upper()+'_END*/\n'
    adoption_root=ROOT/'src/adopt/v1'
    module+='\n/*XCWC_ROUTE_ADOPT_BEGIN*/\nconst adoptionV1Css='+json.dumps((adoption_root/'adopt.css').read_text(encoding='utf-8'),ensure_ascii=False)+';\n'
    module+='const adoptionV1Template='+json.dumps((adoption_root/'template.html').read_text(encoding='utf-8'),ensure_ascii=False)+';\n'
    module+=(adoption_root/'adopt.js').read_text(encoding='utf-8')+'\n/*XCWC_ROUTE_ADOPT_END*/\n'
    module+='''
function home(){return '<section id="xcwc-nest"></section>'}
function city(){return '<section id="xcwc-city"></section>'}
function adopt(){return '<section id="xcwc-adopt"></section>'}
function profile(){return accountPage()}
function wardrobe(){return accountPage()}
function flock(){return accountPage()}
function mountIntegrated(){if(s.page==='home')mountNest();if(s.page==='city')mountCity();if(s.page==='adopt')mountAdoptionV1();if(['profile','wardrobe','flock'].includes(s.page))mountAccountPage()}
'''
    # Must execute module declarations before the application's initial render.
    marker='render();\nif(globalThis.Tweak)'
    assert marker in frame
    frame=frame.replace(marker,module+'\n'+marker,1)
    frame=frame.replace("function render(){document.body.style.overflow=","function render(){clearPage();document.body.style.overflow=",1)
    frame=frame.replace("if(s.page==='home')bindRoom();",'')
    frame=frame.replace("referenceChrome();if(s.page==='shop')mountShop();}","referenceChrome();mountIntegrated();if(s.page==='shop')mountShop().catch(e=>pageNotice(e.message));}",1)
    start=frame.index('function referenceChrome(){');end=frame.index("root.addEventListener('click'",start)
    frame=frame[:start]+'''function referenceChrome(){
window.parent.postMessage({channel:'xcwc-shop',operation:'layout',active:['home','city','shop','adopt','photo','profile','wardrobe','flock'].includes(s.page)},'*');
root.classList.remove('is-illustrated','is-travel','is-room');root.classList.toggle('is-integrated',['home','city','shop','adopt','photo','profile','wardrobe','flock'].includes(s.page));
const active=navigationSection();syncNavigation();
const navigationIcons={
 home:['__XCWC_ASSET_ORIGIN__/assets/navigation/plush/nav-home-default.webp','__XCWC_ASSET_ORIGIN__/assets/navigation/plush/nav-home-active.webp'],
 city:['__XCWC_ASSET_ORIGIN__/assets/navigation/plush/nav-city-default.webp','__XCWC_ASSET_ORIGIN__/assets/navigation/plush/nav-city-active.webp'],
 shop:['__XCWC_ASSET_ORIGIN__/assets/navigation/plush/nav-shop-default.webp','__XCWC_ASSET_ORIGIN__/assets/navigation/plush/nav-shop-active.webp'],
 profile:['__XCWC_ASSET_ORIGIN__/assets/navigation/plush/nav-profile-default.webp','__XCWC_ASSET_ORIGIN__/assets/navigation/plush/nav-profile-active.webp']
};
root.querySelector('.bottom').innerHTML=[['home','小窝'],['city','城市'],['shop','商城'],['profile','我的']].map(([p,t])=>`<button type="button" data-go="${p}" class="${active===p?'active':''}" ${active===p?'aria-current="page"':''}><img class="navigation-icon" src="${navigationIcons[p][active===p?1:0]}" width="128" height="128" alt="" aria-hidden="true" draggable="false"><span>${t}</span></button>`).join('');
if(globalThis.lucide)lucide.createIcons({attrs:{width:18,height:18}});
}
'''+frame[end:]
    # The shared module owns internal navigation and delegates history to the host.
    frame, nav_replacements=re.subn(r'function nav\(p\)\{[^\n]*\}', '', frame, count=1)
    if nav_replacements != 1:
        raise RuntimeError('Expected one legacy navigation function')
    # NFC is a deep-link route, never an additional public navigation tab.
    frame=frame.replace("const pages=[", "const pages=[['adopt','领养'],", 1)
    start=frame.index('function adopt(){');end=frame.index('function flock(){',start)
    frame=frame[:start]+frame[end:]
    # Generic bottom-nav photo entry explicitly discards any previous nest context.
    frame=frame.replace("if(b.dataset.go){nav(b.dataset.go);", "if(b.dataset.go){if(b.dataset.go==='photo')photoEntry=null;nav(b.dataset.go);",1)
    frame=frame.replace('</head>','<style>'+(ROOT/'src/account-pages.css').read_text(encoding='utf-8')+'</style><style data-xcwc-route="account">'+((ROOT/'src/account-felt.css').read_text(encoding='utf-8')+'\n'+(ROOT/'src/wardrobe-felt.css').read_text(encoding='utf-8'))+'</style></head>',1)
    return frame
