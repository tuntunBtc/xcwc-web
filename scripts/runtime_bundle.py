"""Cacheable classic-script chunks for the existing opaque-origin sandbox.

Factories receive explicit capabilities; no eval, same-origin sandbox permission,
framework migration, or credentials are needed to load a page.
"""
from pathlib import Path
import hashlib
import html
import json
import re
import subprocess
from html.parser import HTMLParser

SCRIPT = r'<script(?![^>]*\btype=["\'](?:application/json|importmap)["\'])[^>]*>(.*?)</script>'


class ResourceBlocks(HTMLParser):
    """Locate real HTML resources, ignoring markup inside script string values."""
    def __init__(self, source):
        super().__init__(convert_charrefs=False)
        self.source=source;self.blocks=[];self.active=None
        self.lines=[0]
        for match in re.finditer('\n',source):self.lines.append(match.end())
        self.feed(source)

    def position(self):
        line,column=self.getpos();return self.lines[line-1]+column

    def handle_starttag(self, tag, attributes):
        if tag in {'script','style'}:
            start=self.position();self.active=(tag,dict(attributes),start,start+len(self.get_starttag_text()))

    def handle_endtag(self, tag):
        if self.active and self.active[0]==tag:
            name,attrs,start,body=self.active;end=self.position()
            self.blocks.append((name,attrs,start,self.source.index('>',end)+1,self.source[body:end]));self.active=None


def extract(source, tag, predicate):
    selected=[block for block in ResourceBlocks(source).blocks if block[0]==tag and predicate(block[1])]
    for _,_,start,end,_ in reversed(selected):source=source[:start]+source[end:]
    return source,[block[4] for block in selected]


def executable(attributes):
    return not attributes.get('src') and attributes.get('type','').lower() in {'','text/javascript','application/javascript'}


class RuntimeBundle:
    def __init__(self, root, media):
        self.root, self.media = Path(root), media
        self.files = {}

    def emit(self, name, text, suffix='js'):
        text = self.media.rewrite(text)
        if suffix == 'js' and name != 'host':
            # Root-relative URLs inherit the srcdoc's embedding document base.
            # APIs requiring an absolute base use the trusted bootstrap origin.
            for quote in ["'", '"']:
                text = text.replace(quote+'__XCWC_ASSET_ORIGIN__'+quote, 'globalThis.xcwcAssetOrigin')
        if name != 'host':
            text = text.replace('__XCWC_ASSET_ORIGIN__', '')
        data = text.encode('utf-8')
        sha = hashlib.sha256(data).hexdigest()
        relative = f'runtime/{name}.{sha[:12]}.{suffix}'
        target = self.root/'dist'/relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        self.files[relative] = {'sha256': sha, 'bytes': len(data)}
        return '__XCWC_ASSET_ORIGIN__/'+relative

    def icons(self):
        # These exact Lucide nodes are the same geometry as the previous full UMD.
        names = ['house','map','shopping-bag','user-round','camera','gift','wheat','droplets','sparkles','shirt']
        result = subprocess.run(['node','-e',
            "const l=require('./vendor/lucide.js');const names=JSON.parse(process.argv[1]);"
            "const out={};for(const n of names){const k=n.split('-').map(s=>s[0].toUpperCase()+s.slice(1)).join('');"
            "if(!l.icons[k])throw Error('Missing icon '+n);out[n]=l.icons[k]}process.stdout.write(JSON.stringify(out))",
            json.dumps(names)], cwd=self.root, check=True, capture_output=True, text=True)
        return '''(()=>{const icons='''+result.stdout+''',ns='http://www.w3.org/2000/svg';
globalThis.lucide={createIcons({attrs={}}={}){for(const old of document.querySelectorAll('[data-lucide]')){
 const name=old.getAttribute('data-lucide'),nodes=icons[name];if(!nodes)continue;
 const svg=document.createElementNS(ns,'svg');for(const [k,v] of Object.entries({width:24,height:24,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':2,'stroke-linecap':'round','stroke-linejoin':'round',...attrs}))svg.setAttribute(k,v);
 for(const attr of old.attributes)if(attr.name!=='data-lucide')svg.setAttribute(attr.name,attr.value);
 svg.classList.add('lucide','lucide-'+name);svg.setAttribute('aria-hidden','true');
 for(const [tag,attributes] of nodes){const child=document.createElementNS(ns,tag);for(const [key,value] of Object.entries(attributes))child.setAttribute(key,value);svg.append(child)}old.replaceWith(svg);
}}};})();'''

    def split_frame(self, frame):
        routes = {}
        definitions = {
            'nest': ('home', "'<section id=\"xcwc-nest\"></section>'", 'mountNest'),
            'city': ('city', "'<section id=\"xcwc-city\"></section>'", 'mountCity'),
            'adopt': ('adopt', "'<section id=\"xcwc-adopt\"></section>'", 'mountAdoptionV1'),
            'shop': ('shop', "'<section id=\"xcwc-shop\" aria-label=\"小鸟商城\"></section>'", 'mountShop'),
            'photo': ('photo', 'checkinTemplate', 'mountCheckin'),
            'account': ('account', 'accountPage()', 'mountAccountPage'),
        }
        dependencies = ('root,content,s,esc,liveAccount,accountRpc,ownedCurrent,refreshAccount,nav,'
            'mountIsolated,openPageDialog,installDialogClose,pageNotice,currentCheckin,getWardrobeSkin,'
            'birdArt,birdAssets,openWallet,localDataBadge,accountPage,checkinRpc,save,toast,matchesAdoptionBird,xcwcRandomId')
        for name, (route, template, mount) in definitions.items():
            pattern = r'/\*XCWC_ROUTE_'+name.upper()+r'_BEGIN\*/(.*?)/\*XCWC_ROUTE_'+name.upper()+r'_END\*/'
            match = re.search(pattern, frame, flags=re.S)
            if not match:
                raise ValueError('Missing route boundary: '+name)
            source = match[1]
            # Mutable lifecycle state stays in the shared shell through accessors.
            for symbol in ['pageCleanup','checkinCleanup','checkinBack','photoEntry']:
                source = re.sub(r'\b'+symbol+r'\b', 'ctx.'+symbol, source)
            styles = []
            style_pattern = r'<style data-xcwc-route="'+name+r'">(.*?)</style>'
            for css in re.findall(style_pattern, frame, flags=re.S):
                styles.append(self.emit(name, css, 'css'))
            frame = re.sub(style_pattern, '', frame, flags=re.S)
            chunk = ('globalThis.xcwcRoutes.register('+json.dumps(route)+',function(ctx){\nconst {'+
                dependencies+'}=ctx;\n'+source+'\nreturn {html:()=>'+template+',mount:'+mount+'};\n});')
            routes[route] = {'script': self.emit(name, chunk), 'styles': styles, 'beforeCommon': route=='photo'}
            frame = frame[:match.start()]+frame[match.end():] if not styles else re.sub(pattern, '', frame, count=1, flags=re.S)
        # The shared renderer below is the only caller of route html/mount.
        frame = re.sub(r'function mountIntegrated\(\)\{[^\n]*\}', '', frame, count=1)
        frame = re.sub(r'function photoPage\(\)\{[^\n]*\}', 'function photoPage(){return ""}', frame, count=1)
        frame = re.sub(r'function bindPhoto\(\)\{[^\n]*\}', 'function bindPhoto(){}', frame, count=1)
        loader = (self.root/'src/route-loader.js').read_text(encoding='utf-8')
        context = '''const routeContext={root,content,s,esc,liveAccount,accountRpc,ownedCurrent,refreshAccount,nav,
mountIsolated,openPageDialog,installDialogClose,pageNotice,currentCheckin,getWardrobeSkin,birdArt,birdAssets,
openWallet,localDataBadge,accountPage,checkinRpc,save,toast,matchesAdoptionBird,xcwcRandomId,
get pageCleanup(){return pageCleanup},set pageCleanup(value){pageCleanup=value},
get checkinCleanup(){return checkinCleanup},set checkinCleanup(value){checkinCleanup=value},
get photoEntry(){return photoEntry},set photoEntry(value){photoEntry=value},
get checkinBack(){return checkinBack},set checkinBack(value){checkinBack=value}};
const routeLoader=createRouteLoader('''+json.dumps(routes,ensure_ascii=False)+''',routeContext);
let routeRenderVersion=0;
'''
        render = '''function render(){
 const version=++routeRenderVersion;clearPage();if(checkinCleanup){checkinCleanup();checkinCleanup=null}
 document.body.style.overflow='';if(!appRoutes.has(s.page))s.page='home';
 root.classList.toggle('is-checkin',s.page==='photo');root.classList.toggle('is-shop',s.page==='shop');
 root.dataset.xcwcPage=s.page;
 root.querySelector('#balance').textContent=s.points;referenceChrome();
 const page=s.page,key=['profile','wardrobe','flock'].includes(page)?'account':page;
 content.innerHTML='<p class="route-loading" role="status">正在打开页面…</p>';content.setAttribute('aria-busy','true');
 routeLoader.load(key).then(module=>{if(version!==routeRenderVersion||page!==s.page)return;
  content.removeAttribute('aria-busy');content.innerHTML=module.html();return module.mount();
 }).catch(error=>{if(version!==routeRenderVersion||page!==s.page)return;content.removeAttribute('aria-busy');
  content.textContent='页面暂时无法加载，请重试。';const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='重新加载';button.onclick=()=>render();content.append(button);pageNotice(error.message);
 });
}
'''
        frame, count = re.subn(r'function render\(\)\{[^\n]*\}', lambda _:render, frame, count=1)
        if count != 1:
            raise ValueError('Expected one synchronous legacy renderer')
        frame = frame.replace('render();\nif(globalThis.Tweak)', context+'\nrender();\nif(globalThis.Tweak)',1)
        # Shared loader and exact icon subset run before the app's initial render.
        frame = frame.replace('<script>\n(()=>{', '<script>\n'+loader+'\n'+self.icons()+'\n(()=>{',1)
        # There are currently no tooltip triggers. Retain the accessibility helper,
        # loading its unchanged positioning library only on real interaction.
        frame = re.sub(r'<script[^>]+src="[^"]*/vendor/(?:lucide|floating-ui\.(?:core|dom))\.js"[^>]*></script>', '', frame)
        floating_urls = [self.emit('floating-'+name,(self.root/'vendor'/('floating-ui.'+name+'.js')).read_text(encoding='utf-8')) for name in ['core','dom']]
        tooltip = r'<script>\s*(\(\(\) => \{\s*if \(window\.FloatingUIDOM == null\).*?)</script>'
        def defer_tooltip(match):
            url = self.emit('tooltip', match[1])
            return '<script>'+'''(()=>{let loading=null;const urls='''+json.dumps(floating_urls+[url])+''';
const trigger=event=>{if(!event.target?.closest?.('[data-tooltip]')||loading)return;loading=urls.reduce((promise,url)=>promise.then(()=>new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=url;script.onload=resolve;script.onerror=reject;document.head.append(script)})),Promise.resolve()).catch(()=>{loading=null});};
document.addEventListener('pointerover',trigger,true);document.addEventListener('focusin',trigger,true);})();</script>'''
        frame = re.sub(tooltip, defer_tooltip, frame, count=1, flags=re.S)
        # All CSS/JS remains independently cacheable. Styles may reference only the
        # existing static origin; the opaque sandbox's origin is never relaxed.
        frame = frame.replace('style-src ', 'style-src __XCWC_ASSET_ORIGIN__ ',1)
        frame,styles=extract(frame,'style',lambda attrs:attrs.get('id')!='codex-visualization-host-theme')
        css_url = self.emit('frame', '\n'.join(styles), 'css')
        frame = frame.replace('</head>', '<link id="xcwc-common-style" rel="stylesheet" href="'+css_url+'"></head>',1)
        frame,scripts=extract(frame,'script',executable)
        js_url = self.emit('frame', '\n;\n'.join(scripts))
        return frame.replace('</body>', '<script>globalThis.xcwcAssetOrigin="__XCWC_ASSET_ORIGIN__";</script><script src="'+js_url+'"></script></body>',1)

    def split_shell(self, shell):
        # Extract only real host scripts; escaped srcdoc is a data attribute.
        shell,scripts=extract(shell,'script',executable)
        url = self.emit('host','\n;\n'.join(scripts)).replace('__XCWC_ASSET_ORIGIN__','')
        return shell.replace('</body>','<script src="'+url+'"></script></body>',1)

    def finish(self):
        dist = self.root/'dist'
        vendor=(self.root/'vendor/lucide.js').read_text(encoding='utf-8')
        notice=vendor[:vendor.index('*/')+2]+'\nExact Lucide icon nodes are used by the generated frame bundle.\n'
        self.emit('lucide-license',notice,'txt')
        for file in (dist/'runtime').iterdir():
            if file.is_file() and file.relative_to(dist).as_posix() not in self.files:
                file.unlink()
        (dist/'runtime-manifest.json').write_text(json.dumps({'schemaVersion':1,'files':self.files},indent=2)+'\n',encoding='utf-8')
