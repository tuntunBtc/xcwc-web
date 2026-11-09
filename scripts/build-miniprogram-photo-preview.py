#!/usr/bin/env python3
"""Build a self-contained HTML preview of the mini-program photo page.

The preview renders the *actual* pages/photo/photo.wxml and photo.wxss through a
small WXML interpreter (wx:for / wx:if / {{...}}), converts rpx to CSS px
(750rpx = 375px viewport), and inlines every asset as a data URI so both
file:// and http:// work without a server.

Usage:
    python3 scripts/build-miniprogram-photo-preview.py
    # then open output/miniprogram-photo-preview/index.html?state=default|editor|viewer|album|empty
"""

from __future__ import annotations

import base64
import json
import mimetypes
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MP = ROOT / "miniprogram"
OUT_DIR = ROOT / "output" / "miniprogram-photo-preview"
OUT = OUT_DIR / "index.html"

MIME = {
    ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg", ".mp3": "audio/mpeg",
}


def data_uri(path: Path) -> str:
    mime = MIME.get(path.suffix.lower()) or mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return "data:%s;base64,%s" % (mime, base64.b64encode(path.read_bytes()).decode("ascii"))


def build_assets() -> dict:
    assets = {}
    for path in sorted((MP / "assets/photo").iterdir()):
        assets["/assets/photo/" + path.name] = data_uri(path)
    for name in (
        "nav-background.webp", "nav-home-active.webp", "nav-home-default.webp",
        "nav-city-default.webp", "nav-shop-default.webp", "nav-profile-default.webp",
    ):
        path = MP / "assets/navigation/plush" / name
        assets["/assets/navigation/plush/" + name] = data_uri(path)
    return assets


def convert_wxss(css: str) -> str:
    def to_px(match):
        value = float(match.group(1))
        return ("%gpx" % (value / 2.0))

    css = re.sub(r"(-?\d+(?:\.\d+)?)rpx", to_px, css)
    # WXML 的 <image> 在 HTML 解析器里是 <img>，选择器同步替换。
    return re.sub(
        r"([^{}]+)\{",
        lambda m: re.sub(r"(?<![\w-])image(?![\w-])", "img", m.group(1)) + "{",
        css,
    )


def normalise_wxml(wxml: str) -> str:
    wxml = re.sub(r"<!--[\s\S]*?-->", "", wxml)
    # HTML parser does not treat unknown custom tags as void elements.
    wxml = re.sub(r"<(slider|input)([^>]*?)\s*/>", r"<\1\2></\1>", wxml)
    return wxml.strip()


def states(assets: dict) -> dict:
    thumb = assets["/assets/photo/example.webp"]
    bird = assets["/assets/photo/bird.webp"]
    styles = [
        {"name": name, "thumb": assets["/assets/photo/style-%d.webp" % i], "selected": i == 0}
        for i, name in enumerate(("清新自然", "暖阳胶片", "柔和风景", "黑白记忆"))
    ]
    birds = [
        {"id": "b1", "name": "西湖小黄莺", "adopted": True, "selected": True},
        {"id": "b2", "name": "小黄莺", "adopted": False, "selected": False},
        {"id": "b3", "name": "桂花小鸟", "adopted": False, "selected": False},
        {"id": "b4", "name": "枫音雀", "adopted": False, "selected": False},
    ]
    base = {
        "topInset": 176,
        "toastBottom": 240,
        "canvasHeightRpx": 560,
        "points": 5,
        "birds": birds,
        "selectedCount": 1,
        "selectedSummary": "已选 西湖小黄莺",
        "noBirds": False,
        "dataError": "",
        "assetError": "",
        "albumError": "",
        "styles": styles,
        "uploaded": False,
        "uploadThumb": "",
        "location": "山野之间",
        "editorOpen": False,
        "previewTitle": "看看合照效果",
        "previewBadge": "示例",
        "photoFitIndex": 0,
        "photoFitName": "铺满画面",
        "photoFitOptions": ["铺满画面", "完整显示"],
        "showPhotoPositionX": False,
        "showPhotoPositionY": False,
        "photoX": 50,
        "photoY": 50,
        "activeIndex": 0,
        "activeNames": ["西湖小黄莺"],
        "activeName": "西湖小黄莺",
        "size": 34,
        "sizeValue": "34",
        "selectionVisible": False,
        "selectionBox": {"left": 60, "top": 62, "width": 26, "height": 24},
        "generateText": "选择照片，开启合照",
        "generateDisabled": True,
        "downloadDisabled": True,
        "draftNote": "切换页面会保留当前编辑内容；关闭小程序后不保留。",
        "albumTotal": 1,
        "albumCapacityText": "已用 1 / 30 张",
        "albumEntries": [
            {"id": "work-1", "label": "山野之间", "image": thumb,
             "dateText": "2026.11.04", "badge": "+1 叽分"},
        ],
        "albumExpanded": False,
        "albumManaging": False,
        "viewAllVisible": False,
        "viewAllText": "",
        "manageVisible": True,
        "manageText": "管理合照",
        "albumFullVisible": False,
        "albumFoot": "仅保存在当前手机 · 重要合照请保存到相册",
        "deleteConfirm": False,
        "deleteTitle": "删除这张合照？",
        "deleteStatus": "",
        "viewer": None,
        "toast": "",
    }
    empty = dict(base)
    empty.update({
        "birds": [], "selectedCount": 0, "selectedSummary": "选一位小伙伴，一起出发吧",
        "noBirds": True, "points": 0, "generateText": "先选一只小鸟",
        "albumTotal": 0, "albumCapacityText": "已用 0 / 30 张", "albumEntries": [],
        "manageVisible": False, "albumFoot": "还没有合照，和小鸟一起收藏第一张回忆吧",
        "activeNames": [], "activeName": "",
    })
    editor = dict(base)
    editor.update({
        "uploaded": True, "uploadThumb": thumb, "editorOpen": True,
        "previewTitle": "调整我们的合照", "previewBadge": "编辑中",
        "generateText": "生成并收藏", "generateDisabled": False, "downloadDisabled": False,
        "selectionVisible": True,
    })
    viewer = dict(editor)
    viewer.update({
        "viewer": {
            "image": thumb,
            "meta": "山野之间 · 26.11.04 15:27",
            "note": "已收藏到打卡相册 · +1 叽分",
            "buttonText": "保存到手机相册",
            "hint": "在系统菜单中选择「存储图像」，也可以长按合照保存。",
            "otherOpen": False,
        }
    })
    album = dict(base)
    album.update({
        "albumTotal": 4,
        "albumCapacityText": "已用 4 / 30 张",
        "albumEntries": [
            {"id": "work-%d" % i, "label": label, "image": thumb,
             "dateText": "2026.11.0%d" % (4 - i), "badge": "+1 叽分" if i == 0 else "已收藏"}
            for i, label in enumerate(("山野之间", "西湖边", "桂花树下", "湖畔晨光"))
        ],
        "albumManaging": True,
        "manageText": "完成管理",
        "viewAllVisible": True,
        "viewAllText": "查看全部 4 张",
    })
    return {"default": base, "empty": empty, "editor": editor, "viewer": viewer, "album": album}


TPL = r"""<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>小程序打卡合照 · 静态预览</title>
<style>
html,body{margin:0;padding:0;background:#dbe8c9;-webkit-font-smoothing:antialiased;width:375px;overflow-x:hidden}
#app{width:375px;margin:0;position:relative;min-height:100vh;overflow:hidden}
scroll-view.wxml-scroll-view{overflow-x:auto;overflow-y:hidden}
input.location-input{background:transparent;border:0;outline:0;padding:0}
/* 无头 Chrome 最小窗口 500px，固定层需锁在 375px 产品态内 */
.page-meadow,.tabbar-fixed,.viewer-mask{width:375px;left:0;right:auto}
.toast{left:187.5px !important}
view,scroll-view,picker,photo-tab-bar,block{display:block}
text{display:inline}
image,img.wxml-img{display:block}
input{font:inherit}
canvas{display:block}
/* WXSS 里没有的等价属性：小程序 <image> 的 mode 由渲染器写入 object-fit */
@@CSS@@
</style></head>
<body><div id="app"></div>
<script>
const ASSETS = @@ASSETS@@;
const STATES = @@STATES@@;
const WXML = @@WXML@@;
const params = new URLSearchParams(location.search);
const state = STATES[params.get('state') || 'default'] || STATES.default;

function evalExpr(expr, scope){
  try { return (new Function('s','with(s){return (' + expr + ');}'))(scope); }
  catch(e){ return ''; }
}
function rpxToPx(str){ return String(str).replace(/(-?\d+(?:\.\d+)?)rpx/g, (m,v)=>(Number(v)/2)+'px'); }
function interp(str, scope){
  return rpxToPx(String(str).replace(/\{\{([\s\S]+?)\}\}/g, (m,e)=>{
    const v = evalExpr(e.trim(), scope);
    return (v === null || v === undefined || v === false) ? '' : String(v);
  }));
}
function assetSrc(src){
  if(!src) return '';
  return src.charAt(0) === '/' ? (ASSETS[src] || src) : src;
}
function convertTag(src, node, scope){
  const tag = src.tagName.toLowerCase();
  let el = node;
  // HTML 解析器把 <image> 当成 <img> 的别名，tagName 会是 IMG。
  if(tag === 'image' || tag === 'img'){
    el = document.createElement('img');
    const mode = src.getAttribute('mode') || 'scaleToFill';
    el.style.objectFit = ({scaleToFill:'fill', aspectFit:'contain', aspectFill:'cover', widthFix:'contain'})[mode] || 'fill';
    el.setAttribute('src', assetSrc(interp(src.getAttribute('src') || '', scope)));
  } else if(tag === 'slider'){
    el = document.createElement('input');
    el.type = 'range';
    el.min = node.getAttribute('min') || '0';
    el.max = node.getAttribute('max') || '100';
    el.value = node.getAttribute('value') || '50';
  } else if(tag === 'photo-tab-bar'){
    el = document.createElement('div');
    el.className = 'tabbar-mock';
    el.innerHTML = '<div class="tabbar-spacer"></div><div class="tabbar-fixed">'
      + '<img class="tabbar-art" src="' + assetSrc('/assets/navigation/plush/nav-background.webp') + '">'
      + [['小窝','home-active'],['城市','city-default'],['商城','shop-default'],['我的','profile-default']]
        .map((t,i)=>'<div class="tabbar-item"><img src="' + assetSrc('/assets/navigation/plush/nav-' + t[1] + '.webp') + '"><span class="' + (i===0?'is-active':'') + '">' + t[0] + '</span></div>').join('')
      + '</div>';
    return el;
  }
  for(const attr of Array.from(src.attributes)){
    const name = attr.name;
    if(/^(wx:|bind|catch|hover-|show-menu|enable-flex|scroll-x|scroll-y|confirm-type|maxlength|data-)/.test(name)) continue;
    if((tag === 'image' || tag === 'img') && name === 'src') continue;
    if(tag === 'slider' && ['min','max','value'].indexOf(name) >= 0) continue;
    let value = interp(attr.value, scope);
    if(name === 'class') el.setAttribute('class', value);
    else if(name === 'style') el.setAttribute('style', value);
    else if(name === 'value' && tag === 'input') el.setAttribute('value', value);
    else el.setAttribute(name, value);
  }
  el.classList.add('wxml-' + tag);
  return el;
}
function renderNode(node, scope){
  if(node.nodeType === 3) return document.createTextNode(interp(node.textContent, scope));
  if(node.nodeType !== 1) return null;
  const rawIf = node.getAttribute('wx:if');
  if(rawIf !== null && !evalExpr(rawIf.replace(/^\{\{|\}\}$/g,''), scope)) return null;
  const rawFor = node.getAttribute('wx:for');
  if(rawFor !== null){
    const list = evalExpr(rawFor.replace(/^\{\{|\}\}$/g,''), scope) || [];
    const frag = document.createDocumentFragment();
    for(let i=0;i<list.length;i++){
      const childScope = Object.create(scope);
      childScope.item = list[i]; childScope.index = i;
      const clone = node.cloneNode(false);
      clone.removeAttribute('wx:for');
      const el = convertTag(clone, clone, childScope);
      for(const child of Array.from(node.childNodes)){
        const out = renderNode(child, childScope);
        if(out) el.appendChild(out);
      }
      frag.appendChild(el);
    }
    return frag;
  }
  const clone = node.cloneNode(false);
  const el = convertTag(clone, clone, scope);
  for(const child of Array.from(node.childNodes)){
    const out = renderNode(child, scope);
    if(out) el.appendChild(out);
  }
  return el;
}
const doc = new DOMParser().parseFromString('<div id="wxml-root">' + WXML + '</div>', 'text/html');
const root = doc.getElementById('wxml-root');
// wx:else 依据前一个兄弟节点的 wx:if 取反（本项目只用到单层 wx:if / wx:else）。
root.querySelectorAll('[wx\\:else]').forEach(function (el){
  let prev = el.previousElementSibling;
  while(prev && !prev.hasAttribute('wx:if')) prev = prev.previousElementSibling;
  if(prev){
    const expr = prev.getAttribute('wx:if').replace(/^\{\{|\}\}$/g,'');
    el.setAttribute('wx:if', '{{!(' + expr + ')}}');
  }
  el.removeAttribute('wx:else');
});
const app = document.getElementById('app');
for(const child of Array.from(root.childNodes)){
  const out = renderNode(child, Object.assign({}, state));
  if(out) app.appendChild(out);
}

// 画布预览：用与小程序相同的 1000×1010 坐标画示例底图 + 小鸟 + 页脚文字。
function paintCanvas(){
  const canvas = document.querySelector('canvas');
  if(!canvas) return;
  canvas.width = 1000; canvas.height = 1010;
  const ctx = canvas.getContext('2d');
  const bg = new Image();
  bg.onload = function(){
    ctx.fillStyle = '#fffdf4'; ctx.fillRect(0,0,1000,1010);
    ctx.save(); ctx.beginPath(); ctx.rect(38,38,924,812); ctx.clip();
    const scale = Math.max(924/bg.width, 812/bg.height);
    const w = bg.width*scale, h = bg.height*scale;
    ctx.drawImage(bg, 38+(924-w)/2, 38+(812-h)/2, w, h);
    const bird = new Image();
    bird.onload = function(){
      const ratio = bird.height/bird.width;
      const size = 34*12.6, bh = size*ratio;
      ctx.shadowColor = 'rgba(38,49,30,.22)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 7;
      ctx.drawImage(bird, 735-size/2, 850-34*6.3-bh/2, size, bh);
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      ctx.restore();
      ctx.fillStyle='#556744'; ctx.font='30px serif'; ctx.fillText('⌖ 山野之间',55,915);
      ctx.fillStyle='#b19d78'; ctx.font='16px Georgia'; ctx.textAlign='right';
      ctx.fillText('A LITTLE MOMENT WITH YOU',944,915);
      ctx.textAlign='left'; ctx.fillStyle='#9b9e88'; ctx.font='15px Georgia';
      ctx.fillText('BIRD & BEYOND',55,962);
      ctx.textAlign='right'; ctx.fillText('OUR TRAVEL DIARY',944,962);
      ctx.textAlign='left';
    };
    bird.src = ASSETS['/assets/photo/bird.webp'];
  };
  bg.src = ASSETS['/assets/photo/example.webp'];
}
paintCanvas();

// 底栏 mock：与 custom-tab-bar 的 149rpx + 安全区一致（此预览不含 Home Indicator）。
const style = document.createElement('style');
style.textContent = '.tabbar-spacer{height:75px}.tabbar-fixed{position:fixed;left:0;right:auto;width:375px;bottom:0;height:75px;'
  + 'display:flex;align-items:center;padding:0 14px;z-index:1000}.tabbar-art{position:absolute;left:4px;top:0;'
  + 'width:calc(100% - 8px);height:75px;object-fit:fill;z-index:0}.tabbar-item{position:relative;z-index:1;flex:1;'
  + 'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px}.tabbar-item img{width:29px;height:29px}'
  + '.tabbar-item span{font-size:13px;font-weight:600;color:#80502c;text-shadow:0 1px 1px #fff3d9}'
  + '.tabbar-item span.is-active{color:#4e8c4c}';
document.head.appendChild(style);

if(params.get('measure')==='1'){
  const selectors=['.hero','.birds-panel','.section-title','.bird-scroller','.compose-panel','.composer-grid',
    '.upload','.styles','.location','.editor','.create-area','.generate','.album-section','.gallery','.memory','.footer'];
  const rects={};
  selectors.forEach(s=>{const el=document.querySelector(s);if(el){const r=el.getBoundingClientRect();
    rects[s]=[Math.round(r.left),Math.round(r.top),Math.round(r.width),Math.round(r.height)];}});
  const overflow=[];
  document.querySelectorAll('.section-h2,.step-title,.hero-title,.album-title,.generate-text,.style-name,.bird-name').forEach(el=>{
    if(el.scrollWidth>el.clientWidth+1) overflow.push(el.className+':'+el.scrollWidth+'>'+el.clientWidth);
  });
  document.title='@@MEASURE@@'+JSON.stringify({rects:rects,overflow:overflow,width:innerWidth,
    assetKeys:Object.keys(ASSETS).length, heroType:typeof ASSETS['/assets/photo/hero.webp'],
    heroMapped:assetSrc('/assets/photo/hero.webp').slice(0,30),
    birdPortrait:(function(){const el=document.querySelector('.bird-portrait img');
      if(!el)return null;const r=el.getBoundingClientRect();
      return [Math.round(r.width),Math.round(r.height),getComputedStyle(el).width,getComputedStyle(el).height,el.getAttribute('src').slice(0,30)];})()})+'@@END@@';
}
</script></body></html>
"""


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    assets = build_assets()
    css = convert_wxss((MP / "pages/photo/photo.wxss").read_text(encoding="utf-8"))
    wxml = normalise_wxml((MP / "pages/photo/photo.wxml").read_text(encoding="utf-8"))
    html = TPL
    for key, value in (
        ("@@CSS@@", css),
        ("@@ASSETS@@", json.dumps(assets, ensure_ascii=False)),
        ("@@STATES@@", json.dumps(states(assets), ensure_ascii=False)),
        ("@@WXML@@", json.dumps(wxml, ensure_ascii=False)),
    ):
        html = html.replace(key, value)
    OUT.write_text(html, encoding="utf-8", newline="\n")
    print("written %s %.1f KB" % (OUT, len(html.encode("utf-8")) / 1024))


if __name__ == "__main__":
    main()
