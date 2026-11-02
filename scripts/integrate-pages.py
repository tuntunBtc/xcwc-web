"""Build adapters for the immutable 2026-10-30 page baselines."""
from pathlib import Path
import json,re
ROOT=Path(__file__).resolve().parents[1]
def integrate_pages(frame):
    module=(ROOT/'src/adopt/entry.mjs').read_text(encoding='utf-8').replace('export ','')+'\n'+(ROOT/'src/account-client.js').read_text(encoding='utf-8')+'\n'+(ROOT/'src/account-pages.js').read_text(encoding='utf-8')
    for name in ['nest','city']:
        module+='\nconst '+name+'Css='+json.dumps((ROOT/f'src/{name}/{name}.css').read_text(encoding='utf-8'),ensure_ascii=False)+';\n'
        module+='const '+name+'Template='+json.dumps((ROOT/f'src/{name}/template.html').read_text(encoding='utf-8'),ensure_ascii=False)+';\n'
        module+=(ROOT/f'src/{name}/{name}.js').read_text(encoding='utf-8')+'\n'
    adoption_root=ROOT/'src/adopt/v1'
    module+='\nconst adoptionV1Css='+json.dumps((adoption_root/'adopt.css').read_text(encoding='utf-8'),ensure_ascii=False)+';\n'
    module+='const adoptionV1Template='+json.dumps((adoption_root/'template.html').read_text(encoding='utf-8'),ensure_ascii=False)+';\n'
    module+=(adoption_root/'adopt.js').read_text(encoding='utf-8')+'\n'
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
window.parent.postMessage({channel:'xcwc-shop',operation:'layout',active:['home','city','shop','adopt','profile','wardrobe','flock'].includes(s.page)},'*');
root.classList.remove('is-illustrated','is-travel','is-room');root.classList.toggle('is-integrated',['home','city','shop','adopt','profile','wardrobe','flock'].includes(s.page));
const active=['flock','wardrobe'].includes(s.page)?'home':s.page;
root.querySelector('.bottom').innerHTML=[['home','house','小窝'],['city','map','城市'],['shop','shopping-bag','商城'],['profile','user-round','我的']].map(([p,i,t])=>`<button data-go="${p}" class="${active===p?'active':''}" ${active===p?'aria-current="page"':''}>${ico(i)}<span>${t}</span></button>`).join('');
if(globalThis.lucide)lucide.createIcons({attrs:{width:18,height:18}});
}
'''+frame[end:]
    frame=frame.replace('function nav(p){',"function nav(p){window.scrollTo(0,0);accountRpc('scrollTop').catch(()=>{});if(p==='photo'&&s.page!=='photo'&&!photoEntry)photoEntry=null;if(p!=='photo'&&s.page!=='photo')photoEntry=null;",1)
    # NFC is a deep-link route, never an additional public navigation tab.
    frame=frame.replace("const pages=[", "const pages=[['adopt','领养'],", 1)
    start=frame.index('function adopt(){');end=frame.index('function flock(){',start)
    frame=frame[:start]+frame[end:]
    # Generic bottom-nav photo entry explicitly discards any previous nest context.
    frame=frame.replace("if(b.dataset.go){nav(b.dataset.go);", "if(b.dataset.go){if(b.dataset.go==='photo')photoEntry=null;nav(b.dataset.go);",1)
    frame=frame.replace('</head>','<style>'+(ROOT/'src/account-pages.css').read_text(encoding='utf-8')+'</style></head>',1)
    return frame
