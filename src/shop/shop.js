async function mountShop(){
 const host=content.querySelector('#xcwc-shop');if(!host)return;
 const shopRoot=host.attachShadow({mode:'open'});shopRoot.innerHTML='<style>'+shopCss+'</style>'+shopTemplate;
 __SHOP_PRODUCTS__
 const $=selector=>shopRoot.querySelector(selector),controller=new AbortController(),{signal}=controller;
 const deferredMedia=createDeferredMedia({signal,root:content});
 // Fixed overlays have their own scroll viewport, outside content's containing-block chain.
 const panelMedia=createDeferredMedia({signal,root:$('#panelContent')});
 const pending=new Map(),known=new Map(),knownUntil=new Map(),freshness=new WeakMap();let active=true,toastTimer,carouselTimer,slide=0,slides=[],returnFocus,bannerVersion=0,carouselPaused=matchMedia('(prefers-reduced-motion: reduce)').matches;
 let cart=[],cartReady=false,cartBusy=false,cartReadVersion=0,sort='default',city='',page=0,total=0,loading=false,version=0,panelVersion=0,items=[],panelKind='',cartRenderVersion=0,cartReading=false,cartError='',buying=false;
 const idPattern=/^[a-z0-9_-]{1,64}$/;
 const node=(tag,className,text)=>{const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el};
 const button=(text,action,className='secondary',id)=>{const b=node('button',className,text);b.type='button';b.dataset.shopAction=action;if(id)b.dataset.id=id;return b};
 const icon=name=>{const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),use=document.createElementNS(svg.namespaceURI,'use');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('width','22');svg.setAttribute('height','22');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.7');svg.setAttribute('aria-hidden','true');use.setAttribute('href','#'+name);svg.append(use);return svg};
 const money=value=>'¥'+Number(value).toLocaleString('zh-CN',{minimumFractionDigits:0,maximumFractionDigits:2});
 function assetUrl(value){
  if(typeof value!=='string')throw Error('商品图片地址缺失');
  const url=new URL(value,'__XCWC_ASSET_ORIGIN__');
  if(url.origin!=='__XCWC_ASSET_ORIGIN__'||!url.pathname.startsWith('/assets/'))throw Error('商品图片地址无效');
  return url.href;
 }
 function product(raw){
  if(!raw||typeof raw.id!=='string'||!idPattern.test(raw.id)||typeof raw.title!=='string'||!raw.title.trim()||typeof raw.price!=='number'||!Number.isFinite(raw.price)||raw.price<0)throw Error('商品资料格式不正确');
  return {...raw,coverImageUrl:assetUrl(raw.coverImageUrl),detailImageUrl:raw.detailImageUrl?assetUrl(raw.detailImageUrl):null};
 }
 function picture(src,alt,className,eager=false,manager=deferredMedia){const im=node('img',className);im.alt=alt;im.onerror=()=>{im.classList.add('image-failed');im.alt='图片暂时无法显示'};manager.image(im,src,{eager,priority:eager&&className==='slide'?'high':'auto'});return im}
 function croppedPicture(src,alt,className,crop,eager=false,manager=deferredMedia){
  const area=crop||{left:0,top:0,width:1,height:1};
  if(!['left','top','width','height'].every(k=>Number.isFinite(area[k]))||area.left<0||area.top<0||area.width<=0||area.height<=0||area.left+area.width>1||area.top+area.height>1)throw Error('商品图片显示区域配置无效');
  const frame=node('div',className+' cropped-media'),im=picture(src,alt,'',eager,manager);
  const size=xcwcMediaSize(src);if(size)frame.style.aspectRatio=String(size[0]*area.width/(size[1]*area.height));
  const ratio=()=>{frame.style.aspectRatio=String(im.naturalWidth*area.width/(im.naturalHeight*area.height))};im.addEventListener('load',ratio);
  Object.assign(im.style,{left:-area.left/area.width*100+'%',top:-area.top/area.height*100+'%',width:100/area.width+'%',height:100/area.height+'%'});
  frame.append(im);if(im.complete&&im.naturalWidth)ratio();return frame;
 }
 function detailRetailPrice(frame,bird){
  const regions=shopDetailPriceRegions[bird.id];if(!regions?.price)return;
  const position=(element,area)=>Object.assign(element.style,{left:area.left*100+'%',top:area.top*100+'%',width:area.width*100+'%',height:area.height*100+'%',background:area.background});
  for(const area of regions.masks||[]){const mask=node('span','detail-art-mask');mask.setAttribute('aria-hidden','true');position(mask,area);frame.append(mask)}
  const price=node('div','detail-retail-price'),area=regions.price;position(price,area);price.style.color=area.color||'#cf652b';price.style.fontSize=(area.fontSizeCqw||10.5)+'cqw';price.style.paddingLeft=(area.paddingLeftCqw||0)+'cqw';price.style.paddingTop=(area.paddingTopCqw||0)+'cqw';price.setAttribute('aria-label','零售价：'+money(bird.price));price.append(node('span','detail-price-currency','¥'),node('strong','detail-price-value',money(bird.price).slice(1)));frame.append(price);
 }

 function api(operation,args={}){return new Promise((resolve,reject)=>{
  if(signal.aborted)return reject(Error('商城已离开'));
  const id=Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
  const timer=setTimeout(()=>{pending.delete(id);window.parent.postMessage({channel:'xcwc-shop-data',operation:'cancel',id},'*');reject(Error('商城读取超时，请重试'))},25000);
  pending.set(id,{resolve,reject,timer});window.parent.postMessage({channel:'xcwc-shop-data',id,operation,args},'*');
 })}
 function receive(event){const m=event.data;if(event.source!==window.parent)return;if(m?.channel==='xcwc-shop-cart-change'){readCart();return}if(m?.channel!=='xcwc-shop-data-result')return;const job=pending.get(m.id);if(!job)return;pending.delete(m.id);clearTimeout(job.timer);if(m.ok){if(m.value&&typeof m.value==='object'&&Number.isFinite(m.freshUntil))freshness.set(m.value,m.freshUntil);job.resolve(m.value)}else job.reject(Object.assign(Error(m.value?.message||'商城暂时不可用'),{code:m.value?.code,product:m.value?.product}))}
 window.addEventListener('message',receive);
 function toast(message){if(!active)return;$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),2800)}
 function status(message,retry=false){$('#shopStatus').textContent=message;$('#retry').hidden=!retry;$('#clearCity').hidden=retry||loading||!!items.length||!city}
 function syncCart(){const count=$('#cartCount');count.textContent=String(cart.length);count.hidden=!cart.length;shopRoot.querySelectorAll('.add').forEach(b=>{const added=cart.includes(b.dataset.id);b.classList.toggle('added',added);b.setAttribute('aria-label',added?'已加入购物车':'加入购物车');b.disabled=!cartReady||cartBusy||cartReading;b.replaceChildren(added?document.createTextNode('✓'):icon('cart'))});shopRoot.querySelectorAll('.detail-add-btn').forEach(b=>{b.disabled=!cartReady||cartBusy||cartReading||b.dataset.imageReady!=='true';const label=cart.includes(b.dataset.id)?'已在购物车中':'加入购物车';b.setAttribute('aria-label',label);if(!b.classList.contains('detail-hotspot'))b.textContent=label});shopRoot.querySelectorAll('[data-shop-action=remove]').forEach(b=>b.disabled=!cartReady||cartBusy||cartReading);shopRoot.querySelectorAll('[data-shop-action=buy]').forEach(b=>b.disabled=!cartReady||cartBusy||cartReading||buying||!known.get(b.dataset.id)?.purchaseUrl);$('#cartStatus').hidden=!cartError;$('#cartMessage').textContent=cartError;$('#cartRetry').disabled=cartReading;const notice=$('#cartPanelStatus');if(notice)notice.textContent=cartReading?'正在同步购物车…':cartError;}
 function renderProducts(){
  const cards=items.map((b,index)=>{
   const card=node('article','card'),open=button('', 'detail','photo-button',b.id),im=croppedPicture(b.coverImageUrl,b.title,'photo',b.coverCrop,index<2);
   im.querySelector('img').style.top='4%';open.setAttribute('aria-label','查看'+b.title+'详情');open.append(im);
   const body=node('div','card-body');body.append(node('h2','',b.title));
   if(b.remark)body.append(node('p','remark',b.remark));
   const bottom=node('div','card-bottom');bottom.append(node('span','price',money(b.price)),button('', 'add','add',b.id));body.append(bottom);card.append(open,body);return card;
  });
  $('#products').replaceChildren(...cards);deferredMedia.scan($('#products'));$('#resultCount').textContent='共 '+total+' 只城市小鸟';
  $('#defaultSort').classList.toggle('active',sort==='default');$('#defaultSort').setAttribute('aria-pressed',String(sort==='default'));
  $('#priceSort').classList.toggle('active',sort!=='default');$('#priceSort').setAttribute('aria-pressed',String(sort!=='default'));$('#priceSort').textContent=sort==='priceAsc'?'价格 ↑':sort==='priceDesc'?'价格 ↓':'价格 ↕';
  $('#loadMore').hidden=items.length>=total;$('#loadMore').disabled=loading;syncCart();
 }
 async function loadProducts(append=false,revalidate=false){
  const token=++version,targetPage=append?page+1:1;loading=true;if(!append){items=[];page=0;total=0;renderProducts()}$('#products').setAttribute('aria-busy','true');$('#loadMore').disabled=true;status(append?'正在读取更多小鸟…':'正在读取小鸟商品…');
  try{
   const data=await api('list',{city,sort,page:targetPage,pageSize:shopConfig.pageSize,revalidate});if(!active||token!==version)return;
   if(!data||!Array.isArray(data.items)||!Number.isSafeInteger(data.total)||data.total<0||!Array.isArray(data.cities))throw Error('商品资料格式不正确');
   const loaded=data.items.map(product);loaded.forEach(b=>{known.set(b.id,b);knownUntil.set(b.id,freshness.get(data)||Date.now())});
   items=[...new Map([...(append?items:[]),...loaded].map(b=>[b.id,b])).values()];page=targetPage;total=data.total;
   const options=[node('option','','全部城市')];options[0].value='';for(const c of data.cities){if(typeof c.code!=='string'||typeof c.name!=='string')continue;const o=node('option','',c.name);o.value=c.code;options.push(o)}$('#city').replaceChildren(...options);$('#city').value=city;
   status(items.length?'':city?'该城市暂无商品，去看看其他城市的小鸟吧。':'小鸟商品正在准备中');renderProducts();
  }catch(error){if(active&&token===version)status(error.message,true)}
  finally{if(active&&token===version){loading=false;$('#clearCity').hidden=!$('#retry').hidden||!!items.length||!city;$('#products').setAttribute('aria-busy','false');$('#loadMore').disabled=false}}
 }
 function carouselNotice(message,retry=false){const empty=$('#carouselEmpty');empty.replaceChildren(node('p','',message));if(retry)empty.append(button('重新读取轮播','retry-banners'));empty.hidden=false}
 function syncCarouselControl(){const control=$('#carouselPause');control.hidden=slides.length<2;control.textContent=carouselPaused?'继续轮播':'暂停轮播';control.setAttribute('aria-pressed',String(carouselPaused))}
 function showSlide(index,manual=false){
  if(!slides.length)return;if(manual){carouselPaused=true;syncCarouselControl()}
  slide=(index+slides.length)%slides.length;
  $('#slides').querySelectorAll('.slide').forEach((el,i)=>{el.hidden=i!==slide;el.classList.toggle('active',i===slide);el.setAttribute('aria-hidden',String(i!==slide));if(i===slide&&el.dataset.xcwcSrc)deferredMedia.image(el,el.dataset.xcwcSrc,{eager:true,priority:i===0?'high':'auto'})});
  const current=$('#slides').children[slide];if(current?.classList.contains('image-failed'))carouselNotice('这张橱窗图片暂时无法显示',true);else if(current?.complete&&current.naturalWidth)$('#carouselEmpty').hidden=true;else carouselNotice('正在读取小店橱窗…');
  $('#carouselDots').querySelectorAll('button').forEach((el,i)=>{el.classList.toggle('active',i===slide);el.setAttribute('aria-pressed',String(i===slide))})
 }
 async function loadBanners(revalidate=false){
  const token=++bannerVersion;clearInterval(carouselTimer);carouselNotice('正在读取小店橱窗…');$('#carouselPause').hidden=true;
  try{const data=await api('banners',{revalidate});if(!active||token!==bannerVersion)return;if(!Array.isArray(data?.items))throw Error('轮播资料格式不正确');slides=data.items.map(b=>({...b,imageUrl:assetUrl(b.imageUrl)}));
   $('#slides').replaceChildren(...slides.map((b,i)=>{const im=picture(b.imageUrl,b.alt||'小鸟商城轮播','slide',i===0);im.draggable=false;im.addEventListener('load',()=>{if(active&&token===bannerVersion&&i===slide)$('#carouselEmpty').hidden=true});im.addEventListener('error',()=>{if(active&&token===bannerVersion&&i===slide)carouselNotice('这张橱窗图片暂时无法显示',true)});return im}));
   $('#carouselDots').replaceChildren(...(slides.length>1?slides.map((b,i)=>{const el=button('', 'slide','carousel-dot');el.dataset.index=String(i);el.setAttribute('aria-label','第 '+(i+1)+' 张轮播');return el}):[]));
   if(slides.length)showSlide(0);else carouselNotice('小店橱窗正在准备中');syncCarouselControl();
   if(slides.length>1)carouselTimer=setInterval(()=>{if(!carouselPaused&&!document.hidden&&!$('#overlay').classList.contains('show'))showSlide(slide+1)},shopConfig.carouselIntervalMs);
  }catch{if(active&&token===bannerVersion)carouselNotice('小店橱窗暂时无法读取',true)}
 }
 async function readCart(forceRender=false,revalidate=false){
  const token=++cartReadVersion;cartReading=true;syncCart();
  try{const data=await api('cart-read');if(!active||token!==cartReadVersion)return;if(!Array.isArray(data?.ids)||data.ids.some(id=>typeof id!=='string'||!idPattern.test(id)))throw Error('购物车记录格式不正确');
   const changed=!cartReady||!!cartError||JSON.stringify(cart)!==JSON.stringify(data.ids);cart=data.ids;cartReady=true;cartError='';cartReading=false;syncCart();if(panelKind==='cart'&&(changed||forceRender))await renderCart(revalidate);
  }catch(error){if(active&&token===cartReadVersion){cartReady=false;cartReading=false;cartError='购物车暂时无法读取，原记录已保留。请重新读取后再操作。';syncCart();if(panelKind==='cart')await renderCart()}}
  finally{if(active&&token===cartReadVersion){cartReading=false;syncCart()}}
 }
 async function changeCart(operation,id){const result=await api(operation,{id});if(active)await readCart();return result}
 function panel(title,children,detail=false,kind='other'){panelVersion++;cartRenderVersion++;panelKind=kind;$('.panel').classList.remove('art-loaded');if(!$('#overlay').classList.contains('show'))returnFocus=shopRoot.activeElement;$('#panelTitle').textContent=title;$('#panelContent').replaceChildren(...children);$('#panelContent').scrollTop=0;$('.panel').classList.toggle('is-detail',detail);$('#overlay').classList.add('show');$('.close').focus();return panelVersion}
 function closePanel(){panelVersion++;cartRenderVersion++;panelKind='';$('#overlay').classList.remove('show');$('.panel').classList.remove('is-detail');returnFocus?.focus()}
 async function detail(id,revalidate=false){if(!idPattern.test(id))throw Error('商品编号无效');if(!revalidate&&known.has(id)&&(knownUntil.get(id)||0)>Date.now())return known.get(id);try{const data=await api('detail',{id,revalidate}),b=product(data);known.set(id,b);knownUntil.set(id,freshness.get(data)||Date.now());return b}catch(error){knownUntil.delete(id);if(['PRODUCT_NOT_FOUND','SHOP_PRODUCT_NOT_FOUND'].includes(error.code))known.delete(id);throw error}}
 async function openDetail(id){
  const token=panel('商品详情',[node('p','note','正在读取商品详情…')],true,'detail');
  try{const b=await detail(id);if(!active||token!==panelVersion)return;if(!b.detailImageUrl)throw Error('商品详情图正在准备中');
   const im=croppedPicture(b.detailImageUrl,b.title+'完整商品详情','detail-image',b.detailCrop,true),add=button('', 'add','detail-add-btn detail-hotspot',id),art=node('div','detail-art'),image=im.querySelector('img'),imageStatus=node('div','detail-image-status','正在读取商品图片…');imageStatus.setAttribute('role','status');
   detailRetailPrice(im,b);
   const area=b.cartHotspot||{left:.08,top:.87,width:.84,height:.08};
   if(!['left','top','width','height'].every(k=>Number.isFinite(area[k]))||area.left<0||area.top<0||area.width<=0||area.height<=0||area.left+area.width>1||area.top+area.height>1)throw Error('商品加购区域配置无效');
   Object.assign(add.style,{left:area.left*100+'%',top:area.top*100+'%',width:area.width*100+'%',height:area.height*100+'%'});
   const close=button('', 'close','detail-close-hotspot');close.setAttribute('aria-label','关闭商品详情');
   const closeArea=b.closeHotspot||{left:.837,top:.0555,width:.085,height:.046};
   if(!['left','top','width','height'].every(k=>Number.isFinite(closeArea[k]))||closeArea.left<0||closeArea.top<0||closeArea.width<=0||closeArea.height<=0||closeArea.left+closeArea.width>1||closeArea.top+closeArea.height>1)throw Error('商品关闭区域配置无效');
   Object.assign(close.style,{left:(closeArea.left+closeArea.width/2)*100+'%',top:(closeArea.top+closeArea.height/2)*100+'%',width:closeArea.width*100+'%',height:closeArea.height*100+'%'});
   const text=node('details','detail-text'),summary=node('summary','','商品文字信息');text.append(summary,node('h3','',b.title),node('p','','参考价格：'+money(b.price)));if(b.cityName)text.append(node('p','','所属城市：'+b.cityName));if(b.description||b.remark)text.append(node('p','',b.description||b.remark));text.append(node('p','note','商品价格与库存以淘宝页面为准。'));
   // Keep controls visible while the artwork is unavailable; only loaded art owns hotspots.
   im.hidden=true;add.hidden=true;add.disabled=true;close.hidden=true;art.append(im,add,close);$('#panelTitle').textContent=b.title;$('#panelContent').replaceChildren(imageStatus,art,text);
   const loaded=()=>{if(!active||token!==panelVersion)return;im.hidden=false;add.hidden=false;close.hidden=false;add.dataset.imageReady='true';imageStatus.hidden=true;$('.panel').classList.add('art-loaded');syncCart();if(shopRoot.activeElement===$('.close'))close.focus({preventScroll:true})};
   const failed=()=>{if(!active||token!==panelVersion)return;im.hidden=true;add.hidden=true;close.hidden=true;add.dataset.imageReady='false';add.disabled=true;$('.panel').classList.remove('art-loaded');imageStatus.hidden=false;imageStatus.replaceChildren(node('p','','商品图片暂时无法显示'),button('重新读取图片','detail','secondary',id));if(shopRoot.activeElement===close)$('.close').focus({preventScroll:true})};
   image.addEventListener('load',loaded,{once:true});image.addEventListener('error',failed,{once:true});if(image.complete){if(image.naturalWidth)loaded();else if(image.getAttribute('src'))failed()}syncCart();
  }catch(error){if(active&&token===panelVersion)$('#panelContent').replaceChildren(node('p','empty',error.message),button('重新读取','detail','secondary',id))}
 }
 async function addCart(id){
  if(cartBusy||cartReading)return;if(!cartReady){await readCart();if(!cartReady)return}
  const panelToken=panelVersion;if(!known.has(id))await detail(id);const b=known.get(id);cartBusy=true;syncCart();
  try{const {already}=await changeCart('cart-add',id);if(!active||panelToken!==panelVersion)return;
   const wrap=node('div','added-result');wrap.append(croppedPicture(b.coverImageUrl,b.title,'added-image',b.coverCrop,true),node('h3','',b.title),node('p','note','前往购物车，点击“去淘宝购买”打开对应商品。'),button('去购物车购买','cart','primary'),button('继续逛逛','close'));
   panel(already?'这只小鸟已在购物车中':'已加入购物车',[wrap]);
  }catch(error){if(error.code==='CART_CANCELLED')await readCart();toast(error.message)}finally{if(active){cartBusy=false;syncCart()}}
 }
 async function removeCart(id){if(cartBusy||cartReading||!cartReady)return;cartBusy=true;syncCart();try{await changeCart('cart-remove',id)}catch(error){if(error.code==='CART_CANCELLED')await readCart();toast(error.message)}finally{if(active){cartBusy=false;syncCart()}}}
 async function openCart(){panel('我的购物车',[node('p','note','正在读取购物车商品…')],false,'cart');await renderCart()}
 async function renderCart(revalidate=false){
  if(!active||panelKind!=='cart')return;const token=++cartRenderVersion,panelToken=panelVersion,body=$('#panelContent'),scroll=body.scrollTop,focus=shopRoot.activeElement,focusAction=focus?.dataset.shopAction,focusId=focus?.dataset.id;
  $('#panelTitle').textContent=cartReady?'我的购物车 · '+cart.length+' 只小鸟':'我的购物车 · 记录待读取';
  const notice=node('p','cart-panel-status',cartReading?'正在同步购物车…':cartError);notice.id='cartPanelStatus';notice.setAttribute('role','status');
  const restore=children=>{body.replaceChildren(notice,...children);panelMedia.scan(body);body.scrollTop=scroll;if(focusAction){const next=[...body.querySelectorAll('[data-shop-action]')].find(el=>el.dataset.shopAction===focusAction&&el.dataset.id===focusId&&!el.disabled);(next||$('.close')).focus({preventScroll:true})}syncCart()};
  if(!cartReady){const last=cart.map(id=>node('p','cart-last-known',(known.get(id)?.title||id)+' · 上次读取记录，待确认'));restore([node('p','empty','购物车记录暂不可用，不会覆盖或清空原有商品。'),...last,button('重新读取购物车','cart-retry','primary')]);return}
  if(!cart.length){restore([node('p','empty','还没有小鸟来做客，把喜欢的小鸟加入购物车吧。'),button('继续逛逛','close','primary')]);return}
  const rows=new Map(),ids=[...cart];let next=0;
  await Promise.all(Array.from({length:Math.min(4,ids.length)},async()=>{while(next<ids.length){const id=ids[next++];try{rows.set(id,{bird:await detail(id,revalidate)})}catch(error){rows.set(id,{error})}}}));
  if(!active||token!==cartRenderVersion||panelToken!==panelVersion||panelKind!=='cart')return;
  const cards=ids.map(id=>{
   const entry=rows.get(id),b=entry?.bird,row=node('div','cart-row');row.dataset.id=id;if(b)row.append(croppedPicture(b.coverImageUrl,b.title,'cart-cover',b.coverCrop,false,panelMedia));else row.append(node('div','unavailable-art','?'));
   const copy=node('div');copy.append(node('h3','',b?b.title:'商品暂不可购买'),node('p',b?'':'unavailable',b?money(b.price):(['PRODUCT_NOT_FOUND','SHOP_PRODUCT_NOT_FOUND'].includes(entry?.error?.code)?'商品已下架或不存在，记录仍保留':'商品资料暂时无法读取，记录仍保留')));
   const actions=node('div','row-actions');if(b){const buy=button(b.purchaseUrl?'去淘宝购买 ↗':'购买链接待配置','buy','taobao',id);buy.disabled=!b.purchaseUrl;actions.append(buy)}else if(!['PRODUCT_NOT_FOUND','SHOP_PRODUCT_NOT_FOUND'].includes(entry?.error?.code))actions.append(button('重新读取商品','cart-retry','secondary'));actions.append(button('移除','remove','remove',id));copy.append(actions);row.append(copy);return row;
  });restore([...cards,node('p','note','商品价格与库存以淘宝页面为准；跳转不会领取小鸟或发放鸟蛋。')]);
 }
 async function buy(id){
  if(buying||!cartReady||!cart.includes(id))return;
  buying=true;syncCart();
  try{const result=await api('purchase',{id});if(!active)return;const b=product(result.product);known.set(id,b);knownUntil.set(id,freshness.get(result)||Date.now());}
  catch(error){if(active){if(error.product){const b=product(error.product);known.set(id,b);knownUntil.delete(id);}else if(['PRODUCT_NOT_FOUND','SHOP_PRODUCT_NOT_FOUND'].includes(error.code)){known.delete(id);knownUntil.delete(id);}throw error;}}
  finally{if(active){buying=false;syncCart()}}
 }
 function openRules(){const wrap=node('div','rules');wrap.append(node('p','','通过商城挑选商品、加入购物车，再前往淘宝购买。'),node('p','','领取小鸟时，使用实体 NFC 或二维码链接查询资料，确认后完成本机领取。'),node('p','note','打开淘宝不会自动领取小鸟或发放鸟蛋。'));panel('一颗鸟蛋，一段城市旅程',[wrap])}
 shopRoot.addEventListener('click',event=>{
  const b=event.target.closest('[data-shop-action]');if(!b)return;const action=b.dataset.shopAction,id=b.dataset.id;
  let job;switch(action){case 'cart':job=openCart();break;case 'cart-retry':job=readCart(true,true);break;case 'retry-banners':job=loadBanners(true);break;case 'clear-city':city='';$('#city').value='';job=loadProducts();break;case 'carousel-pause':carouselPaused=!carouselPaused;syncCarouselControl();break;case 'detail':job=openDetail(id);break;case 'add':job=addCart(id);break;case 'remove':job=removeCart(id);break;case 'buy':job=buy(id);break;case 'rules':openRules();break;case 'close':closePanel();break;case 'sort-default':sort='default';job=loadProducts();break;case 'sort-price':sort=sort==='priceAsc'?'priceDesc':'priceAsc';job=loadProducts();break;case 'retry':job=Promise.all([loadProducts(false,true),loadBanners(true)]);break;case 'more':if(!loading)job=loadProducts(true);break;case 'slide':showSlide(Number(b.dataset.index),true);break}
  if(job)Promise.resolve(job).catch(e=>{if(active)toast(e.message)});
 });
 $('#city').addEventListener('change',event=>{city=event.target.value;loadProducts()});
 $('#overlay').addEventListener('click',event=>{if(event.target===$('#overlay'))closePanel()});
 shopRoot.addEventListener('keydown',event=>{
  if(!$('#overlay').classList.contains('show'))return;if(event.key==='Escape'){closePanel();return}
  if(event.key==='Tab'){const focusable=[...$('.panel').querySelectorAll('button:not([disabled]),a[href],select,summary,[tabindex="0"]')].filter(el=>el.getClientRects().length);const first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&shopRoot.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&shopRoot.activeElement===last){event.preventDefault();first.focus()}}
 });
 let touchX=null;$('#hero').addEventListener('pointerdown',e=>{touchX=e.clientX});$('#hero').addEventListener('pointerup',e=>{if(touchX!==null&&Math.abs(e.clientX-touchX)>35)showSlide(slide+(e.clientX<touchX?1:-1),true);touchX=null});$('#hero').addEventListener('pointercancel',()=>{touchX=null});
 pageCleanup=()=>{active=false;controller.abort();version++;panelVersion++;bannerVersion++;cartRenderVersion++;clearTimeout(toastTimer);clearInterval(carouselTimer);window.removeEventListener('message',receive);for(const [id,job]of pending){clearTimeout(job.timer);window.parent.postMessage({channel:'xcwc-shop-data',operation:'cancel',id},'*');job.reject(Error('商城已离开'))}pending.clear()};
 await Promise.all([loadProducts(),loadBanners(),readCart()]);
}
