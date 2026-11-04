const cityCollectionCities=Object.freeze([
 ['hz','hangzhou','杭州','HANGZHOU','一湖烟雨，半城诗意','0% 0%'],
 ['sz','suzhou','苏州','SUZHOU','一窗园林，一梦江南','50% 0%'],
 ['nj','nanjing','南京','NANJING','金陵秋色，满城故事','100% 0%'],
 ['sh','shanghai','上海','SHANGHAI','江风拂过，灯火可亲','0% 100%'],
 ['xa','xian','西安','XIAN','长安一眼，千年回响','50% 100%'],
 ['wh','wuhan','武汉','WUHAN','江城花开，等你而来','100% 100%']
].map(([id,code,name,en,line,pos])=>Object.freeze({id,code,name,en,line,pos})));
function collectedCityCodes(birds){
 const supported=new Set(cityCollectionCities.map(city=>city.code));
 return new Set((Array.isArray(birds)?birds:[]).filter(bird=>bird&&bird.eggStatus==='HATCHED'&&supported.has(bird.cityCode)).map(bird=>bird.cityCode));
}
function cityCollectionRows(cityCode,birds,catalog){
 const key=bird=>[bird.typeId,bird.cityCode,bird.skinId].join(':');
 const mine=(Array.isArray(birds)?birds:[]).filter(bird=>bird&&bird.cityCode===cityCode&&bird.eggStatus==='HATCHED');
 const ownedKeys=new Set(mine.map(key)),seen=new Set();
 const available=(Array.isArray(catalog)?catalog:[]).filter(bird=>{
  if(!bird||bird.cityCode!==cityCode||ownedKeys.has(key(bird))||seen.has(key(bird)))return false;
  seen.add(key(bird));return true;
 });
 return [...mine.map(bird=>({...bird,owned:true})),...available.map(bird=>({...bird,owned:false}))];
}
function mountCity(){
 const shadow=mountIsolated('xcwc-city',cityCss,cityTemplate),$=q=>shadow.querySelector(q),controller=new AbortController(),{signal}=controller;
 let alive=true,filter='all',catalog=[],stateKnown=false,loading=true,catalogLoading=true,catalogFailed=false,loadVersion=0,catalogVersion=0,activeCity=null;
 pageCleanup=()=>{alive=false;controller.abort();shadow.querySelectorAll('dialog[open]').forEach(d=>d.close())};installDialogClose(shadow,signal);
 $('#sheet').addEventListener('close',()=>{activeCity=null},{signal});
 const showSheet=html=>{activeCity=null;$('#sheet-content').innerHTML=html;openPageDialog($('#sheet')).catch(error=>{if(alive)pageNotice(error.message)})};
 function renderCity(){
  if(!alive)return;
  const bird=stateKnown?ownedCurrent():null,unlocked=collectedCityCodes(stateKnown?liveAccount.birds:[]);
  $('.profile strong').textContent=loading?'正在读取':bird?.name||'我的小鸟';$('.profile img').src=birdArt(bird,'avatar');$('.points b').textContent=stateKnown?(liveAccount.wallet?.balance??'—'):'—';
  $('#progress').textContent=(stateKnown?unlocked.size:'—')+' / '+cityCollectionCities.length;
  $('#progress-bar').style.width=(stateKnown?unlocked.size/cityCollectionCities.length*100:0)+'%';
  const track=$('#progress-bar').parentElement;track.setAttribute('role','progressbar');track.setAttribute('aria-label','本机城市收集进度');track.setAttribute('aria-valuemin','0');track.setAttribute('aria-valuemax',String(cityCollectionCities.length));
  if(stateKnown)track.setAttribute('aria-valuenow',String(unlocked.size));else track.removeAttribute('aria-valuenow');
  $('#unlocked-count').textContent=stateKnown?unlocked.size:'—';$('#locked-count').textContent=stateKnown?cityCollectionCities.length-unlocked.size:'—';$('.tabs small').textContent=cityCollectionCities.length;
  shadow.querySelectorAll('.tabs [data-filter]').forEach(button=>{const selected=button.dataset.filter===filter;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1});
  const visible=cityCollectionCities.filter(city=>filter==='all'||(stateKnown&&(filter==='unlocked'?unlocked.has(city.code):!unlocked.has(city.code))));
  $('#city-grid').innerHTML=visible.map(city=>{
   const status=stateKnown?(unlocked.has(city.code)?'unlocked':'locked'):'unknown',label=stateKnown?(unlocked.has(city.code)?'本机已解锁':'尚未领取'):(loading?'正在读取':'状态待读取');
   return `<button class="city-card ${status}" ${loading?'disabled':''} data-city="${city.id}" aria-label="${city.name}，${label}，查看城市小鸟"><div class="city-art" style="background-position:${city.pos}"><div class="city-name"><h3>${city.name}</h3><span>${city.en}</span></div><span class="state-icon" aria-hidden="true">⌑</span><img class="bird-mini bird-shadow" src="${esc(birdAssets.avatar)}" width="192" height="174" loading="lazy" decoding="async" alt=""><span class="question" aria-hidden="true">?</span></div><div class="city-card-body"><strong><span class="tiny-dot"></span>${label}</strong><p>${city.line}</p><span class="card-action">查看小鸟 ›</span></div></button>`;
  }).join('');
  $('#empty').hidden=visible.length>0;
  if(!visible.length)$('#empty').innerHTML='<h3>'+(stateKnown?'旅程才刚刚开始':'本机记录暂不可用')+'</h3><p>'+(stateKnown?'碰一碰实体小鸟并领取后，回来收集这座城。':'请先重新读取本机记录，暂不推定城市状态。')+'</p><button data-filter="all">看看全部城市</button>';
  $('.footnote').innerHTML=!stateKnown?(loading?'正在读取本机城市手账…':'本机记录暂时无法读取，不会覆盖原有记录。<br><button class="retry" data-action="retry">重新加载</button>'):'城市状态来自本机领取缓存 · 不代表云端购买权益'+(catalogFailed?'<br><span>城市小鸟目录暂不可用，仍可查看本机伙伴。</span> <button class="retry" data-action="retry-catalog">重试</button>':'');
  if(activeCity&&$('#sheet').open)showBirds(cityCollectionCities.find(city=>city.id===activeCity),true);
 }
 function showBirds(city,update=false){
  if(!city)return;
  const rows=cityCollectionRows(city.code,stateKnown?liveAccount.birds:[],catalog);
  const emptyMessage=catalogLoading?'正在读取这座城的小鸟目录，请稍候再来看看。':catalogFailed?'这座城的公开小鸟目录暂时无法读取，请稍后重试。':city.code==='hangzhou'?'尚未领取杭州小鸟。碰一碰已建档的实体小黄莺并打开链接，即可领取。':'这座城的小鸟暂未开放，敬请期待。';
  const html='<div class="sheet-head"><button class="close" data-action="close-sheet" aria-label="关闭">×</button><span class="eyebrow">CITY BIRD COLLECTION</span><h2>'+city.name+'的小鸟伙伴</h2><p>'+(stateKnown?'查看本机已领取的伙伴与公开小鸟目录。':'本机记录待读取，以下公开目录不代表领取结果。')+'</p></div><div class="sheet-body">'+rows.map(bird=>'<div class="bird-row"><img src="'+esc(birdArt(bird,'sticker'))+'" class="'+(bird.owned?'':'bird-shadow')+'" alt="'+esc(bird.owned?bird.name+'的小黄莺形象':'尚未领取的小鸟剪影')+'"><div><h3>'+esc(bird.name||'城市小鸟')+'</h3><p>'+(bird.owned?'已领取 · 本机已孵化':stateKnown?'尚未领取':'领取状态待读取')+'</p></div>'+(bird.owned?'<button class="pill" data-action="visit-bird" data-bird="'+esc(bird.id)+'">去小窝</button>':'<span class="pill lock">'+(stateKnown?'尚未领取':'状态待查')+'</span>')+'</div>').join('')+(catalogLoading?'<p class="catalog-status" role="status">正在读取这座城的小鸟目录…</p>':catalogFailed?'<div class="catalog-status" role="status"><p>公开小鸟目录暂时无法读取，本机伙伴仍可查看。</p><button class="retry" data-action="retry-catalog">重新读取目录</button></div>':!rows.length?'<p class="city-not-open">'+emptyMessage+'</p>':'')+'<div class="instructions">碰一碰实体小鸟的 NFC 或扫描二维码，打开对应领取页面。领取无需登录，记录仅保存在当前浏览器。</div><button class="primary" data-action="close-sheet">返回城市手账</button></div>';
  if(!update){showSheet(html);activeCity=city.id;return}
  const sheet=$('#sheet'),scroll=sheet.scrollTop,focused=shadow.activeElement,action=focused?.dataset.action,birdId=focused?.dataset.bird;$('#sheet-content').innerHTML=html;sheet.scrollTop=scroll;
  if(action){const next=[...$('#sheet-content').querySelectorAll('button')].find(button=>button.dataset.action===action&&button.dataset.bird===birdId)||$('#sheet-content .close');next?.focus({preventScroll:true})}
 }
 async function loadCatalog(){
  const version=++catalogVersion;catalogLoading=true;catalogFailed=false;renderCity();
  try{const value=await accountRpc('catalog',{},signal);if(!alive||version!==catalogVersion)return;if(!Array.isArray(value))throw Error('城市目录格式不正确');catalog=value;catalogFailed=false}
  catch{if(!alive||version!==catalogVersion)return;catalogFailed=true}
  finally{if(alive&&version===catalogVersion){catalogLoading=false;renderCity()}}
 }
 async function load(){
  const version=++loadVersion;loading=true;renderCity();
  await Promise.allSettled([
   refreshAccount(signal).then(()=>{if(!alive||version!==loadVersion)return;stateKnown=true;loading=false;renderCity()}).catch(error=>{if(!alive||version!==loadVersion)return;stateKnown=false;loading=false;renderCity();pageNotice(error.message)}),
   loadCatalog()
  ]);
 }
 shadow.addEventListener('keydown',event=>{
  const tab=event.target.closest('.tabs [role=tab]');if(!tab||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  const tabs=[...shadow.querySelectorAll('.tabs [role=tab]')],index=tabs.indexOf(tab),next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
  event.preventDefault();filter=tabs[next].dataset.filter;renderCity();shadow.querySelector('.tabs [data-filter="'+filter+'"]').focus();
 },{signal});
 shadow.addEventListener('click',async event=>{
  const button=event.target.closest('button');if(!button)return;
  try{
   if(button.dataset.filter){filter=button.dataset.filter;renderCity();return}
   if(button.dataset.city){showBirds(cityCollectionCities.find(city=>city.id===button.dataset.city));return}
   if(button.dataset.action==='close-sheet')return $('#sheet').close();
   if(button.dataset.action==='back')return nav('home');
   if(button.dataset.action==='profile')return nav('profile');
   if(button.dataset.action==='points')return await openWallet(showSheet,signal);
   if(button.dataset.action==='retry')return await load();
   if(button.dataset.action==='retry-catalog')return await loadCatalog();
   if(button.dataset.action==='visit-bird'){
    button.disabled=true;await accountRpc('selectBird',{birdId:button.dataset.bird},signal);if(!alive)return;liveAccount.currentId=button.dataset.bird;nav('home');
   }
  }catch(error){if(alive){button.disabled=false;pageNotice(error.message)}}
 },{signal});
 renderCity();load();
}
