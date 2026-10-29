from pathlib import Path
import base64
import html
import re

ROOT = Path(__file__).resolve().parents[1]
def data_image(name):
    p = ROOT / 'assets' / name
    return 'data:image/png;base64,' + base64.b64encode(p.read_bytes()).decode('ascii')

frame = (ROOT / 'src/frame.html').read_text(encoding='utf-8')
css = (ROOT / 'src/room.css').read_text(encoding='utf-8')
css += '\n' + (ROOT / 'src/reference-pages.css').read_text(encoding='utf-8')
js = (ROOT / 'src/room.js').read_text(encoding='utf-8')
js = js.replace('__ROOM_BACKGROUND__', data_image('room-background.png')).replace('__ROOM_BIRD__', data_image('bird-transparent.png'))
reference_js = (ROOT / 'src/reference-pages.js').read_text(encoding='utf-8')
for token, filename in [('__REFERENCE_TREEHOUSE__', 'treehouse-background.png'), ('__REFERENCE_CITIES__', 'city-landscapes.png'), ('__REFERENCE_PROPS__', 'painted-props.png')]:
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
    code = (ROOT / 'vendor' / filename).read_text(encoding='utf-8').replace('</script', '<\\/script')
    pattern = r'<script([^>]*?)\s+src="' + re.escape(url) + r'"([^>]*)>\s*</script>'
    frame = re.sub(pattern, lambda match: '<script' + match.group(1).replace(' async', '') + match.group(2) + '>' + code + '</script>', frame)
frame = frame.replace("home:'小窝 · 点小鸟触摸互动；连续轻点可体验炸毛反馈。每只小鸟独立保存状态。积分、补给和每日上限均为评审示例。'", "home:'沉浸式喂养体验 · 点击或拖动食物投喂，试试添水、摸头和清洁。角色使用预制透明素材与轻量动画；补给、羽力数值为演示规则。'")
shell = (ROOT / 'src/shell.html').read_text(encoding='utf-8')
shell = re.sub(r'data-srcdoc=".*?"', lambda _: 'data-srcdoc="' + html.escape(frame, quote=True) + '"', shell, count=1, flags=re.S)
shell = shell.replace('<title>bujidao-ui.html</title>', '<title>卜叽岛 · 小鸟的江南小窝</title>')
shell = shell.replace('</head>', '<style>body{background:#eceee6} @media(max-width:520px){body{padding:0}iframe{height:100vh;max-width:100%}}</style></head>', 1)
(ROOT / 'dist/index.html').write_text(shell, encoding='utf-8')
print('Built sandboxed room experience:', (ROOT / 'dist/index.html').stat().st_size, 'bytes')
