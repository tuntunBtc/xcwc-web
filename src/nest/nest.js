// Short, local bird calls: the first audio operation always happens in a click.
function createNestBirdAudio(signal){
 let context=null,generation=0,lastPlayed=-Infinity;const voices=new Set();
 const now=()=>performance.now();
 function stop(){
  generation++;lastPlayed=-Infinity;
  for(const voice of voices){try{voice.oscillator.stop();}catch{}try{voice.oscillator.disconnect();voice.gain.disconnect();}catch{}}
  voices.clear();const previous=context;context=null;
  if(previous&&previous.state!=='closed')try{Promise.resolve(previous.close()).catch(()=>{});}catch{}
 }
 function prepare(){
  if(signal.aborted||document.hidden)return null;
  try{
   const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return null;
   if(!context||context.state==='closed')context=new Audio({latencyHint:'interactive'});
   const current=context;
   // resume() is invoked synchronously, before any account or storage request.
   const ready=current.state==='running'?Promise.resolve():Promise.resolve(current.resume()).catch(()=>{});
   return {context:current,generation,at:now(),ready};
  }catch{return null;}
 }
 async function play(kind,ticket){
  if(!ticket)return;
  try{
   await ticket.ready;
   const current=ticket.context,time=now();
   if(signal.aborted||document.hidden||ticket.generation!==generation||current!==context||current.state!=='running'||time-ticket.at>2000||time-lastPlayed<650)return;
   lastPlayed=time;
   const phrases={touch:[[0,1850],[.13,2450],[.27,2050]],'do-feed':[[0,1750],[.16,2250]],water:[[0,2150],[.15,2750]],clean:[[0,1800],[.13,2200],[.25,2550]]};
   const notes=phrases[kind];if(!notes)return;
   for(const [offset,pitch] of notes){
    const oscillator=current.createOscillator(),gain=current.createGain(),voice={oscillator,gain};voices.add(voice);
    const start=current.currentTime+.015+offset,end=start+.105;
    oscillator.type='sine';oscillator.frequency.setValueAtTime(pitch,start);oscillator.frequency.exponentialRampToValueAtTime(pitch*1.42,start+.035);oscillator.frequency.exponentialRampToValueAtTime(pitch*.92,end);
    gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.045,start+.012);gain.gain.exponentialRampToValueAtTime(.001,end-.012);gain.gain.linearRampToValueAtTime(0,end);
    oscillator.connect(gain);gain.connect(current.destination);
    oscillator.onended=()=>{voices.delete(voice);try{oscillator.disconnect();gain.disconnect();}catch{}};
    oscillator.start(start);oscillator.stop(end+.01);
   }
  }catch{stop();}
 }
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();},{signal});
 window.addEventListener('pagehide',stop,{signal});signal.addEventListener('abort',stop,{once:true});
 return {prepare,play,dispose:stop};
}

function mountNest(){
 const shadow=mountIsolated('xcwc-nest',nestCss,nestTemplate),$=q=>shadow.querySelector(q),controller=new AbortController(),{signal}=controller;let alive=true,busy=false,pendingPet=null,happyTimer,displayedBirdId=null;
 const birdAudio=createNestBirdAudio(signal);
 const feltBird={avatar:"__XCWC_ASSET_ORIGIN__/assets/nest/felt/avatar-192.webp",idle:"__XCWC_ASSET_ORIGIN__/assets/nest/felt/idle-640.webp"};
 // Only the scene background is local; navigation geometry is shared across routes.
 const homeChrome=document.createElement('style');homeChrome.dataset.nestChrome='';homeChrome.textContent=`
 #bjd-review.is-integrated:has(#xcwc-nest) .phone{background:#bad493 url('__XCWC_ASSET_ORIGIN__/assets/nest/felt/scene-720.webp') center top/cover no-repeat}
 #bjd-review.is-integrated:has(#xcwc-nest) .phone>main{background:#bad493}
 #bjd-review.is-integrated:has(#xcwc-nest) .bottom{background:transparent;border-color:transparent}
 #bjd-review.is-integrated:has(#xcwc-nest) .bottom::before{inset:0;background:url('__XCWC_ASSET_ORIGIN__/assets/nest/felt/panel-720.webp') center/100% 110% no-repeat}
 #bjd-review.is-integrated:has(#xcwc-nest) .bottom button{color:#875d3b;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif;font-weight:600}
 #bjd-review.is-integrated:has(#xcwc-nest) .bottom button.active{color:#65995d}
 #bjd-review.is-integrated:has(#xcwc-nest) .bottom button.active::before{background:radial-gradient(ellipse,#c6e3b881,transparent 80%);box-shadow:none}
 #bjd-review.is-integrated:has(#xcwc-nest) .bottom svg{stroke:#a98562;stroke-width:2;filter:drop-shadow(0 1px 2px #b58a5a30)}
 #bjd-review.is-integrated:has(#xcwc-nest) .bottom button.active svg{stroke:#70a467;fill:#cae2b44d;filter:drop-shadow(0 0 3px #a8d39a)}
 `;document.head.append(homeChrome);
 pageCleanup=()=>{homeChrome.remove();alive=false;birdAudio.dispose();controller.abort();clearTimeout(happyTimer);shadow.querySelectorAll('dialog[open]').forEach(d=>d.close())};installDialogClose(shadow,signal);
 const say=text=>{$('#speech').textContent=text},sheet=html=>{$('#sheet-content').innerHTML=html;openPageDialog($('#sheet')).catch(e=>pageNotice(e.message))};
 function happy(){$('.actor').classList.remove('happy');void $('.actor').offsetWidth;$('.actor').classList.add('happy');clearTimeout(happyTimer);happyTimer=setTimeout(()=>$('.actor').classList.remove('happy'),1100)}
 function update(){if(!alive)return;const bird=ownedCurrent();$('#name').textContent=bird?.name||'等待小鸟入住';$('.identity-text small').textContent=bird?'⌖ '+bird.cityName+' · 江南小窝':'⌖ 我的小窝';$('#points').textContent=liveAccount.wallet?.balance??'—';for(const im of shadow.querySelectorAll('.avatar img'))im.src=feltBird.avatar;for(const im of shadow.querySelectorAll('.actor img'))im.src=feltBird.idle;$('#bird').setAttribute('aria-label',bird?'摸摸'+bird.name:'领取后陪伴小鸟');$('.actor').style.opacity='1';$('#daily .dot').hidden=!!liveAccount.careDaily?.supplyClaimed;$('#daily>span').textContent='补给';$('#hunger').textContent=bird?bird.hunger+'%':'—';$('#water').textContent=bird?bird.water+'%':'—';$('#hunger-bar').style.width=(bird?.hunger||0)+'%';$('#water-bar').style.width=(bird?.water||0)+'%';$('#mood-bar').style.width=bird?(Math.min(bird.hunger,bird.water)<30?'35%':'80%'):'0';$('#mood').textContent=bird?(Math.min(bird.hunger,bird.water)<30?'想吃点东西':'开心'):'—';if(bird&&displayedBirdId!==bird.id){say('阳光正好，\n陪我待一会儿吧～ ♥');displayedBirdId=bird.id}if(!bird){displayedBirdId=null;say('碰一碰实体小鸟并打开链接，把第一位伙伴领回小窝。领取无需登录。');}}
 async function switchBird(){await refreshAccount(signal);if(!alive)return;update();if(!liveAccount.account)return accountRpc('login',{page:'home'});sheet('<h2>今天，想陪谁？</h2><p>按真实实体编号切换，昵称相同也不会混选。</p><div class="birds"></div>');for(const pet of liveAccount.birds){const button=document.createElement('button');button.className='bird-choice'+(pet.id===liveAccount.currentId?' selected':'');button.dataset.birdId=pet.id;const image=document.createElement('img');image.src=birdArt(pet,'avatar');image.alt='';const name=document.createElement('strong');name.textContent=pet.name;const meta=document.createElement('small');meta.textContent=pet.cityName+' · '+pet.id.slice(-6);button.append(image,name,meta);button.onclick=async()=>{await accountRpc('selectBird',{birdId:pet.id},signal);liveAccount.currentId=pet.id;pendingPet=null;update();$('#sheet').close();say(pet.name+'来啦，今天也陪着你。');loadOutfit()};$('.birds').append(button)}if(!liveAccount.birds.length)$('.birds').textContent='本机还没有领取小鸟，请碰一碰实体小鸟并打开链接。'}
 async function loadOutfit(){try{const data=await accountRpc('wardrobe',{},signal);if(!alive)return;const outfit=data.outfits.find(x=>x.birdId===liveAccount.currentId);$('.actor').classList.remove('aura-lake','aura-sunset');if(['lake','sunset'].includes(outfit?.visualKey))$('.actor').classList.add('aura-'+outfit.visualKey)}catch{}}
 shadow.addEventListener('click',async event=>{const button=event.target.closest('[data-action]');if(!button)return;const action=button.dataset.action;
  // Only real interactions unlock audio; navigation, dialogs and empty nests stay silent.
  const soundTicket=['touch','do-feed','water','clean'].includes(action)&&ownedCurrent()&&!busy?birdAudio.prepare():null;
  try{
   if(action==='close')return $('#sheet').close();if(action==='retry'){await refreshAccount(signal);update();loadOutfit();return}if(action==='switch')return await switchBird();
   if(action==='points')return openWallet(sheet,signal);
   if(action==='checkin'){if(!liveAccount.ready)throw Error('名单尚未加载，请稍后重试');return currentCheckin()}
   if(action==='dress'){if(!liveAccount.account&&!liveAccount.localMode)return accountRpc('login',{page:'wardrobe'});return nav('wardrobe')}
   if(action==='rename'){const bird=ownedCurrent();if(!bird)return pageNotice('请先领取小鸟');return sheet('<h2>给小鸟改个名字</h2><label>小鸟昵称<input id="local-nickname" value="'+esc(bird.name)+'" maxlength="24" autocomplete="off"></label><p>1–6 个字，仅保存在本机。</p><button class="primary" data-action="save-rename">保存昵称</button>')}
   if(action==='daily')return sheet('<h2>每日问候与补给</h2><p>本机体验 · 每天免费食物和水各 1 份，发给当前小鸟，换鸟不重复领。</p><button class="primary" data-action="supply">领取今日补给</button><button class="primary" data-action="greet">打个招呼 · +2 叽分</button>');
   if(action==='feed'){const bird=ownedCurrent();if(!bird)return pageNotice('请先领取小鸟');return sheet('<h2>给它一点小满足</h2><p>食物剩余 '+bird.food+' 份 · 饱食 '+bird.hunger+'%</p><button class="primary" data-action="do-feed">喂一份谷粒</button><p>每份增加 30，上限 100；满值不扣库存。</p>')}
   if(['save-rename','supply','greet','do-feed','water','clean'].includes(action)){
    const bird=ownedCurrent();if(!bird)return pageNotice('请先领取小鸟');if(busy)return;busy=true;button.disabled=true;
    try{const result=await accountRpc('care',{birdId:bird.id,action:({'save-rename':'rename','do-feed':'feed'})[action]||action,name:$('#local-nickname')?.value},signal);await refreshAccount(signal);if(alive){update();happy();birdAudio.play(action,soundTicket);$('#sheet').close();say(result.message);pageNotice(result.message)}}finally{busy=false;button.disabled=false}return;
   }
   if(action==='touch'){say('嘿嘿，最喜欢你摸摸我啦 ♡');happy();birdAudio.play(action,soundTicket);const bird=ownedCurrent();if(!bird)return pageNotice('碰一碰实体小鸟，把第一位伙伴领回小窝吧');if(busy)return;busy=true;pendingPet??={birdId:bird.id,requestId:crypto.randomUUID()};try{const result=await accountRpc('pet',pendingPet,signal);pendingPet=null;liveAccount.wallet=await accountRpc('wallet',{},signal);if(alive){update();pageNotice(result.replayed?'已确认上次抚摸，未重复奖励':'小鸟收到你的陪伴，叽分 +1')}}catch(e){if(['REWARD_COOLDOWN','DAILY_LIMIT'].includes(e.code))pendingPet=null;if(alive)pageNotice(e.message)}finally{busy=false}return}
  }catch(e){if(alive)pageNotice(e.message)}
 },{signal});
 update();refreshAccount(signal).then(()=>{if(alive){update();loadOutfit()}}).catch(e=>{if(alive){say('本机记录暂时无法读取，请重试，不会覆盖已有缓存。');sheet('<h2>连接暂不可用</h2><p>'+esc(e.message)+'</p><button class="primary" data-action="retry">重新加载</button>')}});
}
