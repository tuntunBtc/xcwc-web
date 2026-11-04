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

const nestFootMaskCache=new WeakMap();
function isNestFootPoint(art,x,y){
 const area=Object.hasOwn(nestFootHitAreas,art)?nestFootHitAreas[art]:null;
 if(!area||!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>=1||y>=1)return false;
 const px=Math.floor(x*area.width),py=Math.floor(y*area.height);
 return area.masks.some(mask=>{
  if(px<mask.x||py<mask.y||px>=mask.x+mask.width||py>=mask.y+mask.height)return false;
  let bytes=nestFootMaskCache.get(mask);
  if(!bytes){bytes=Uint8Array.from(atob(mask.bits),character=>character.charCodeAt(0));nestFootMaskCache.set(mask,bytes)}
  const bit=(py-mask.y)*mask.width+px-mask.x;
  return !!(bytes[bit>>3]&(1<<(bit&7)));
 });
}
function nestTouchPoint(event,image){
 if(!event.detail||!image.complete||!image.naturalWidth||!Number.isFinite(event.clientX)||!Number.isFinite(event.clientY))return null;
 const style=getComputedStyle(image),width=parseFloat(style.width),height=parseFloat(style.height),rect=image.getBoundingClientRect();
 if(!width||!height)return null;
 // Recover the full affine transform, including idle rotation and a pressed
 // button's scale. The bounding rectangle supplies its viewport translation.
 let matrix=new DOMMatrix();
 for(let element=image;element;element=element.parentElement||element.getRootNode()?.host){
  const transform=getComputedStyle(element).transform;
  if(transform&&transform!=='none'){
   const next=new DOMMatrix(transform);if(!next.is2D)return null;
   matrix=new DOMMatrix([next.a,next.b,next.c,next.d,0,0]).multiply(matrix);
  }
 }
 const corners=[[0,0],[width,0],[0,height],[width,height]].map(([x,y])=>({x:matrix.a*x+matrix.c*y,y:matrix.b*x+matrix.d*y}));
 const tx=rect.left-Math.min(...corners.map(point=>point.x)),ty=rect.top-Math.min(...corners.map(point=>point.y));
 const local=new DOMPoint(event.clientX-tx,event.clientY-ty).matrixTransform(matrix.inverse());
 const scale=Math.min(width/image.naturalWidth,height/image.naturalHeight),drawWidth=image.naturalWidth*scale,drawHeight=image.naturalHeight*scale;
 const x=(local.x-(width-drawWidth)/2)/drawWidth,y=(local.y-(height-drawHeight)/2)/drawHeight;
 return x>=0&&x<1&&y>=0&&y<1?{x,y}:null;
}

function nestEmotionArtwork(emotion){
 const footArea=emotion==='veryhappy'?'happy':['thirsty','unwell'].includes(emotion)?'hungry':emotion;
 const filename=({happy:'happy-v2',hungry:'hungry-v3',angry:'angry-v3',puzzled:'puzzled-v2'})[footArea]||footArea;
 return {footArea,filename:filename+'.webp'};
}

function selectNestEmotion(bird,interaction=null,phase=0){
 if(bird&&interaction?.birdId===bird.id&&['happy','veryhappy','puzzled','angry','crying'].includes(interaction.emotion))return interaction.emotion;
 return describeNestState(bird,phase).emotion;
}

function chooseNestPetReaction(sequence,bird,now,{accepted=true,replayed=false,veryHappyActive=false,duringVeryHappy=false}={}){
 const previous=sequence||{birdId:null,times:[]},empty={birdId:bird?.id||null,times:[]};
 if(!accepted)return {sequence:previous,emotion:null,duration:0};
 const current=previous.birdId===bird?.id?previous:empty;
 // A touch made during this reaction must neither restart its four seconds
 // nor seed the following round after the reaction has ended.
 if(veryHappyActive||duringVeryHappy)return {sequence:empty,emotion:null,duration:0};
 if(replayed)return {sequence:current,emotion:'happy',duration:2000};
 const comfortable=bird&&Number.isFinite(bird.mood)&&bird.mood>=60&&Number.isFinite(bird.hunger)&&bird.hunger>=30&&Number.isFinite(bird.water)&&bird.water>=30;
 if(!comfortable||!Number.isFinite(now))return {sequence:empty,emotion:'happy',duration:2000};
 const times=(Array.isArray(current.times)?current.times:[]).filter(time=>Number.isFinite(time)&&time<=now&&now-time<=12000);
 times.push(now);
 return times.length>=3?{sequence:empty,emotion:'veryhappy',duration:4000}:{sequence:{birdId:bird.id,times},emotion:'happy',duration:2000};
}

function describeNestState(bird,phase=0){
 const hungry=Number.isFinite(bird?.hunger)&&bird.hunger<30;
 const thirsty=Number.isFinite(bird?.water)&&bird.water<30;
 const mood=Number.isFinite(bird?.mood)?Math.min(100,Math.max(20,bird.mood)):null;
 const needs=[];
 if(thirsty)needs.push({key:'water',label:'想喝水',emotion:'thirsty',value:bird.water,speech:bird.water<=10?'先给我添点水吧，润润小嗓子～':'想喝点水，润润小嗓子～'});
 if(hungry)needs.push({key:'food',label:'肚子饿了',emotion:'hungry',value:bird.hunger,speech:bird.hunger<=10?'先给我一点谷粒吧，肚子空空的啦～':'肚子有点空空的，想吃谷粒啦。'});
 // Start with the most pressing physical need; the exhibition can then show
 // every remaining real need rather than starving the food/company states.
 needs.sort((a,b)=>a.value-b.value);
 if(mood!==null&&mood<50)needs.push({key:'company',label:'想你陪陪',emotion:'unwell',speech:'有一点点想你，陪我待一会儿吧～'});
 const index=Number.isFinite(phase)?Math.max(0,Math.floor(phase)):0,current=needs.length?needs[index%needs.length]:null;
 return {emotion:current?.emotion||'happy',need:current?.key||null,mood,moodLabel:mood===null?'状态待接':mood>=50?'开心':'想你陪陪我',speech:current?.speech||'阳光正好，陪我待一会儿吧～',needs};
}

function mountNest(){
 const shadow=mountIsolated('xcwc-nest',nestCss,nestTemplate),$=q=>shadow.querySelector(q),controller=new AbortController(),{signal}=controller;
 let alive=true,busy=false,pendingPet=null,feedbackTimer=null,displayedBirdId=null,interactionEmotion=null,birdRevision=0,actionRevision=0;
 let entryPending=null,deferredCry=null,backgroundRefresh=null,stateRead=null;
 let pageSuspended=false;
 let comfortSequence={birdId:null,times:[]},comfortGeneration=0;
 let needSignature='',needPhase=0,needShownAt=null,needArtKey='',needArtRequestedAt=performance.now();
 const birdAudio=createNestBirdAudio(signal);
 const emotionNames={happy:'开心',veryhappy:'很开心',hungry:'肚子饿了',thirsty:'想喝水',unwell:'想你陪陪',puzzled:'好奇',angry:'被摸痒了',crying:'想念你'};
 const feltBird={};
 for(const emotion of Object.keys(emotionNames))feltBird[emotion]=xcwcMediaUrl('__XCWC_ASSET_ORIGIN__/assets/nest/felt/emotions/'+nestEmotionArtwork(emotion).filename);
 // The scene remains scoped to the nest; shared navigation and other pages are untouched.
 const homeChrome=document.createElement('style');homeChrome.dataset.nestChrome='';homeChrome.textContent=`
 #bjd-review.is-integrated:has(#xcwc-nest) .phone{background:#bad493 url('__XCWC_ASSET_ORIGIN__/assets/nest/felt/home-background.png') center top/100% 100% no-repeat}
 #bjd-review.is-integrated:has(#xcwc-nest) .phone>main{background:#bad493}
 #bjd-review.is-integrated:has(#xcwc-nest) #bjd-toast{
  position:fixed!important;top:auto!important;
  bottom:calc(72px + env(safe-area-inset-bottom) + clamp(72px,21.6vw,104px) + 18px)!important;
  left:50%;right:auto;transform:translateX(-50%);width:max-content;max-width:calc(100% - 36px);
  padding:8px 14px;border:1px solid rgba(255,255,255,.62);border-radius:18px;
  background:rgba(255,249,234,.72);color:#65482f;box-shadow:0 2px 10px #5e562a12;
  backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);
  font-size:12px;font-weight:500;line-height:1.6;overflow-wrap:anywhere;pointer-events:none;
 }
 `;document.head.append(homeChrome);
 const say=text=>{$('#speech').textContent=text};
 const sheet=html=>{$('#sheet-content').innerHTML=html;openPageDialog($('#sheet')).catch(e=>{if(alive)pageNotice(e.message)})};
 const isCurrent=(id,revision)=>alive&&!signal.aborted&&ownedCurrent()?.id===id&&birdRevision===revision;
 async function refreshNest(readSignal=signal){
  stateRead?.abort();const current=new AbortController();stateRead=current;
  const cancel=()=>current.abort();signal.addEventListener('abort',cancel,{once:true});
  if(readSignal!==signal)readSignal.addEventListener('abort',cancel,{once:true});
  if(signal.aborted||readSignal.aborted)current.abort();
  try{return await refreshAccount(current.signal)}
  catch(e){if(current.signal.aborted)throw Object.assign(Error('刷新已取消'),{name:'AbortError'});throw e}
  finally{signal.removeEventListener('abort',cancel);readSignal.removeEventListener('abort',cancel);if(stateRead===current)stateRead=null}
 }
 function clearFeedback(){clearTimeout(feedbackTimer);feedbackTimer=null;interactionEmotion=null;needShownAt=null;$('.actor').classList.remove('happy')}
 function clearComfort(){comfortSequence={birdId:null,times:[]};comfortGeneration++}
 function resetInteractions(){clearFeedback();clearComfort();pendingPet=null;deferredCry=null;needSignature='';needPhase=0;birdRevision++;actionRevision++}
 function nestStatus(bird){
  const status=describeNestState(bird),signature=status.needs.map(need=>need.key).join(',');
  if(signature!==needSignature){needSignature=signature;needPhase=0;needShownAt=null}
  const phase=liveAccount.careDaily?.exhibition?needPhase:0;
  return phase?describeNestState(bird,phase):status;
 }
 function emotionImages(){
  const portrait=$('.emotion-portrait');
  return portrait.hidden?[$('#bird img')]:[$('#bird img'),portrait.querySelector('img')];
 }
 const emotionReady=()=>emotionImages().every(image=>image.complete&&image.naturalWidth>0);
 function syncMotion(){
  $('#nest').classList.toggle('motion-paused',document.hidden||pageSuspended);
 }
 function renderBird(){
  const bird=ownedCurrent(),actor=$('.actor'),image=$('#bird img'),status=nestStatus(bird);
  const feedbackActive=interactionEmotion?.birdId===bird?.id&&!!bird;
  const emotion=feedbackActive?interactionEmotion.emotion:status.emotion;
  // Idle movement is visual only: it never changes care, rewards, speech or artwork.
  actor.classList.toggle('has-bird',!!bird);
  actor.classList.toggle('is-idle',!!bird&&emotion==='happy'&&!interactionEmotion);
  syncMotion();
  const skin=getWardrobeSkin(bird?.equippedSkinId),wearingOutfit=skin?.kind==='outfit';
  // Outfit artwork is a complete character. Care feedback keeps its animation and
  // speech, while default emotion images remain available after restoring the bird.
  const source=wearingOutfit?birdArt(bird,'hero'):feltBird[emotion];
  image.dataset.emotion=emotion;image.dataset.skinId=wearingOutfit?skin.id:'';
  image.alt=wearingOutfit?skin.name+'装扮的毛绒小黄莺':emotionNames[emotion]+'的毛绒小黄莺';
  if(image.getAttribute('src')!==source)image.src=source;
  actor.classList.toggle('is-thirsty',!!bird&&emotion==='thirsty');
  const portrait=$('.emotion-portrait'),portraitImage=portrait.querySelector('img');
  portrait.hidden=!bird||!wearingOutfit||(emotion==='happy'&&!feedbackActive);
  if(!portrait.hidden){
   if(portraitImage.getAttribute('src')!==feltBird[emotion])portraitImage.src=feltBird[emotion];
   portraitImage.alt=emotionNames[emotion]+'的小表情';portraitImage.dataset.emotion=emotion;
   portrait.querySelector('span').textContent=emotionNames[emotion];
  }else portraitImage.removeAttribute('src');
  const artKey=emotionImages().map(image=>image.getAttribute('src')).join('|');
  if(artKey!==needArtKey){needArtKey=artKey;needArtRequestedAt=performance.now();needShownAt=null}
  const failed=emotionImages().some(image=>image.complete&&image.naturalWidth===0);
  $('.emotion-retry').hidden=!bird||!failed;
  $('.emotion-label').hidden=!bird;
  $('.emotion-label').textContent=emotionNames[emotion];
  for(const badge of shadow.querySelectorAll('[data-need]')){
   const active=status.needs.some(need=>need.key===badge.dataset.need);
   badge.hidden=!bird||!active;badge.classList.toggle('is-current',active&&!feedbackActive&&badge.dataset.need===status.need);
  }
  for(const visual of ['lake','sunset'])actor.classList.toggle('aura-'+visual,skin?.kind==='aura'&&skin.visualKey===visual);
  const avatar=birdArt(bird,'avatar');
  for(const avatarImage of shadow.querySelectorAll('.avatar img'))if(avatarImage.getAttribute('src')!==avatar)avatarImage.src=avatar;
  say(bird?(feedbackActive?interactionEmotion.message:status.speech):'碰一碰实体小鸟，领取第一位伙伴。');
  if(!feedbackActive&&needShownAt===null&&emotionReady())needShownAt=performance.now();
 }
 function feedback(emotion,duration,message,{force=false}={}){
  const bird=ownedCurrent();if(!alive||!bird||document.hidden||pageSuspended||!Object.hasOwn(emotionNames,emotion))return;
  if(interactionEmotion?.birdId===bird.id&&!force){
   // Repeated touches on the same area do not extend a brief reaction forever.
   if(interactionEmotion.emotion===emotion){interactionEmotion.message=message;renderBird();return}
  }
  clearFeedback();const current={birdId:bird.id,emotion,message},revision=birdRevision;interactionEmotion=current;renderBird();
  const stillCurrent=()=>isCurrent(bird.id,revision)&&interactionEmotion===current;
  const finish=()=>{if(!stillCurrent())return;clearFeedback();renderBird();flushDeferredCry()};
  const start=()=>{
   if(!stillCurrent()||document.hidden||pageSuspended)return;
   clearTimeout(feedbackTimer);
   if(emotion==='happy'||emotion==='veryhappy'){void $('.actor').offsetWidth;$('.actor').classList.add('happy')}
   feedbackTimer=setTimeout(finish,duration);
  };
  // A cold mobile connection must not spend the entire brief
  // reaction downloading its image. Only the currently requested art loads.
  if(emotionReady())start();
  else{
   feedbackTimer=setTimeout(finish,15000);
   Promise.all(emotionImages().map(image=>image.decode())).then(start,()=>{
    if(!stillCurrent())return;finish();pageNotice('小表情暂时没加载出来，再试一次吧。');
   });
  }
 }
 function update(){
  if(!alive)return;
  const bird=ownedCurrent(),id=bird?.id||null;
  if(displayedBirdId!==id){resetInteractions();displayedBirdId=id}
  const status=describeNestState(bird);
  $('#nest').classList.toggle('is-empty',!bird);$('#name').textContent=bird?.name||'等待小鸟入住';
  $('.claim-help').hidden=!!bird;
  $('.identity-text small').textContent=bird?'⌖ '+bird.cityName+' · 江南小窝':'⌖ 我的小窝';
  $('#points').textContent=liveAccount.wallet?.balance??'—';
  $('#bird').setAttribute('aria-label',bird?'摸摸'+bird.name:'领取后陪伴小鸟');
  $('.name').setAttribute('aria-label',bird?'修改'+bird.name+'的昵称':'了解小鸟领取方式');
  $('#daily .dot').hidden=!bird||!!liveAccount.careDaily?.supplyClaimed;$('#daily>span').textContent='补给';
  if(bird&&liveAccount.careDaily?.exhibition)$('#daily .dot').hidden=bird.food>=3&&bird.waterStock>=3;
  $('[data-action=play]').hidden=!bird||!liveAccount.careDaily?.exhibition;
  for(const [name,value]of [['hunger',bird?.hunger],['water',bird?.water],['mood',status.mood]]){
   const valid=bird&&Number.isFinite(value),percent=valid?Math.min(100,Math.max(0,value)):0;
   $('#'+name).textContent=valid?percent+'%':'—';$('#'+name+'-bar').style.width=percent+'%';
   $('#'+name).setAttribute('aria-label',name==='mood'?'心情 '+(valid?percent+'%，'+status.moodLabel:'状态待接'):name==='hunger'?'饱食 '+percent+'%':'水分 '+percent+'%');
  }
  $('#mood').title=status.moodLabel;renderBird();
 }
 function applyBird(bird){
  if(!bird)return;const index=liveAccount.birds.findIndex(item=>item.id===bird.id);
  if(index!==-1)liveAccount.birds[index]=bird;
 }
 function flushDeferredCry(){
  const pending=deferredCry,bird=ownedCurrent();if(!pending)return false;
  if(!isCurrent(pending.id,pending.revision)||bird.mood>30||bird.lastCompanionAt!==pending.companionAt){deferredCry=null;return false}
  if(document.hidden||pageSuspended||$('#sheet').open||busy||interactionEmotion)return false;
  deferredCry=null;feedback('crying',3000,'有一点点想你，摸摸我就好啦。');return true;
 }
 async function enterCurrent(){
  if(flushDeferredCry())return;
  const bird=ownedCurrent();
  if(!alive||document.hidden||pageSuspended||$('#sheet').open||busy||interactionEmotion||!liveAccount.localMode||!bird||!Number.isFinite(bird.mood)||bird.mood>30||(entryPending?.id===bird.id&&entryPending.revision===birdRevision))return;
  const ticket={id:bird.id,revision:birdRevision,action:actionRevision,companionAt:bird.lastCompanionAt};entryPending=ticket;
  try{
   const result=await accountRpc('care',{birdId:bird.id,action:'enter'},signal);
   if(!isCurrent(ticket.id,ticket.revision))return;
   if(ticket.action!==actionRevision){
    // A foot touch is visual only. Keep an already reserved reunion until the
    // ticklish response ends, unless real companionship has since soothed it.
    if(result.cry&&ownedCurrent().lastCompanionAt===ticket.companionAt){deferredCry=ticket;flushDeferredCry()}
    return;
   }
   if(result.cry&&(document.hidden||pageSuspended||$('#sheet').open||interactionEmotion)){deferredCry=ticket;return}
   applyBird(result.bird);update();
   if(result.cry)feedback('crying',3000,'有一点点想你，摸摸我就好啦。');
  }catch(e){if(isCurrent(ticket.id,ticket.revision))pageNotice(e.message)}
  finally{if(entryPending===ticket)entryPending=null}
 }
 async function loadOutfit(){
  const bird=ownedCurrent(),id=bird?.id,revision=birdRevision,skinAtRequest=bird?.equippedSkinId;
  if(!id)return;
  try{
   const data=await accountRpc('wardrobe',{},signal),current=ownedCurrent();
   // A late wardrobe read must not re-dress another bird or overwrite a newer
   // bootstrap/care result that already carries a different equipped skin.
   if(!isCurrent(id,revision)||current.equippedSkinId!==skinAtRequest)return;
   const outfit=data.outfits.find(item=>item.birdId===id);if(!outfit)return;
   current.equippedSkinId=outfit.skinId||null;renderBird();
  }catch{/* Keep the last confirmed appearance; bootstrap remains usable. */}
 }
 async function switchBird(){
  await refreshNest();if(!alive)return;update();
  if(!liveAccount.account&&!liveAccount.localMode)return accountRpc('login',{page:'home'});
  sheet('<h2>今天，想陪谁？</h2><p>每只小鸟都有自己的状态和每日补给。</p><div class="birds"></div>');
  for(const pet of liveAccount.birds){
   const button=document.createElement('button');button.className='bird-choice'+(pet.id===liveAccount.currentId?' selected':'');button.dataset.birdId=pet.id;
   const image=document.createElement('img');image.src=birdArt(pet,'avatar');image.alt='';
   const name=document.createElement('strong');name.textContent=pet.name;
   const meta=document.createElement('small');meta.textContent=pet.cityName+' · '+pet.id.slice(-6);button.append(image,name,meta);
   button.addEventListener('click',async()=>{
    if(busy||button.disabled)return;button.disabled=true;busy=true;
    let selected=false;
    try{
     await accountRpc('selectBird',{birdId:pet.id},signal);if(!alive)return;
     liveAccount.currentId=pet.id;update();$('#sheet').close();
     await refreshNest();if(!alive)return;update();loadOutfit();selected=true;
    }catch(e){if(alive&&e.name!=='AbortError')pageNotice(e.message)}finally{busy=false;button.disabled=false}
    // Reunion does not own the save lock: its completion must not unlock a newer care action.
    if(selected)await enterCurrent();
   },{signal});$('.birds').append(button);
  }
  if(!liveAccount.birds.length)$('.birds').textContent='本机还没有领取小鸟，请碰一碰实体小鸟并打开链接。';
 }
 async function refreshVisibleNest(reunion=false){
  if(!alive||signal.aborted||document.hidden||pageSuspended||busy||(!liveAccount.ready&&!reunion)||backgroundRefresh)return;
  const current=new AbortController();backgroundRefresh=current;
  const cancel=()=>current.abort();signal.addEventListener('abort',cancel,{once:true});
  try{
   await refreshNest(current.signal);
   if(alive&&!busy&&!current.signal.aborted){update();if(reunion||liveAccount.careDaily?.exhibition)await enterCurrent()}
  }catch{/* Keep the last confirmed state; retry on the next visible refresh. */}
  finally{signal.removeEventListener('abort',cancel);if(backgroundRefresh===current)backgroundRefresh=null}
 }
 const refreshTimer=setInterval(()=>refreshVisibleNest(),5000);
 const needTimer=setInterval(()=>{
  if(!alive||document.hidden||pageSuspended||busy||interactionEmotion||!liveAccount.careDaily?.exhibition||!needSignature.includes(','))return;
  if(!emotionReady()){
   needShownAt=null;
   if(emotionImages().some(image=>image.complete&&image.naturalWidth===0)||performance.now()-needArtRequestedAt>=15000){needPhase++;renderBird()}
   return;
  }
  if(needShownAt===null)needShownAt=performance.now();
  if(performance.now()-needShownAt>=8000){needPhase++;needShownAt=null;renderBird()}
 },1000);
 pageCleanup=()=>{
  alive=false;homeChrome.remove();birdAudio.dispose();controller.abort();clearInterval(refreshTimer);clearInterval(needTimer);backgroundRefresh?.abort();stateRead?.abort();
  resetInteractions();shadow.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());
 };
 installDialogClose(shadow,signal);
 document.addEventListener('visibilitychange',()=>{
  syncMotion();
  if(document.hidden){backgroundRefresh?.abort();stateRead?.abort();clearFeedback();clearComfort();renderBird()}
  else{needShownAt=null;refreshVisibleNest(true)}
 },{signal});
 window.addEventListener('pagehide',()=>{pageSuspended=true;backgroundRefresh?.abort();stateRead?.abort();clearFeedback();clearComfort();syncMotion()},{signal});
 window.addEventListener('pageshow',()=>{pageSuspended=false;needShownAt=null;syncMotion();renderBird()},{signal});
 async function refreshSaved(id,revision){
  // A failed follow-up read does not turn an already saved care action into a failure.
  if(!isCurrent(id,revision))return;
  try{await refreshNest();if(isCurrent(id,revision))update()}
  catch{if(isCurrent(id,revision))pageNotice('照料已保存在本机，页面状态稍后刷新。')}
 }
 function showClaimHelp(){
  sheet('<h2>把伙伴带回小窝</h2><ol class="claim-steps"><li>用支持 NFC 的手机碰一碰实体小鸟，打开系统弹出的链接；也可以扫描小鸟的二维码。</li><li>在领取页确认小鸟资料和昵称，免费孵化后回到小窝。</li></ol><p>领取无需登录。小鸟、叽分与合照仅保存在当前浏览器，换设备不会自动恢复。</p><button class="primary" data-action="close">知道啦</button>');
 }
 shadow.addEventListener('click',async event=>{
  const button=event.target.closest('[data-action]');if(!button)return;
  backgroundRefresh?.abort();if(liveAccount.ready)stateRead?.abort();const action=button.dataset.action;
  const soundTicket=['touch','do-feed','water','clean'].includes(action)&&ownedCurrent()&&!busy?birdAudio.prepare():null;
  try{
   if(action==='close')return $('#sheet').close();
   if(action==='retry-expression'){
    for(const image of emotionImages())if(image.complete&&image.naturalWidth===0)image.removeAttribute('src');
    needArtKey='';renderBird();return;
   }
   if(action==='claim-help')return showClaimHelp();
   if(liveAccount.ready&&!ownedCurrent()&&['feed','water','touch','clean','daily','checkin','rename','play'].includes(action))return showClaimHelp();
   if(action==='retry'){await refreshNest();update();loadOutfit();return await enterCurrent()}
   if(action==='switch'){if(busy)return pageNotice('正在保存照料，请稍等一下～');return await switchBird()}
   if(action==='points')return openWallet(sheet,signal);
   if(action==='checkin'){if(!liveAccount.ready)throw Error('名单尚未加载，请稍后重试');return currentCheckin()}
   if(action==='dress'){if(!liveAccount.account&&!liveAccount.localMode)return accountRpc('login',{page:'wardrobe'});return nav('wardrobe')}
   if(action==='rename'){
    const bird=ownedCurrent();if(!bird)return pageNotice('请先领取小鸟');
    return sheet('<h2>给小鸟改个名字</h2><label>小鸟昵称<input id="local-nickname" value="'+esc(bird.name)+'" maxlength="24" autocomplete="off"></label><p>1–6 个字，仅保存在本机。</p><button class="primary" data-action="save-rename">保存昵称</button>');
   }
   if(action==='daily'){
    const bird=ownedCurrent();if(!bird)return pageNotice('请先领取小鸟');
    const exhibition=liveAccount.careDaily?.exhibition,full=bird.food>=3&&bird.waterStock>=3;
    const supply=exhibition?'<p>食物剩余 '+bird.food+' 份，水剩余 '+bird.waterStock+' 份。不够时可以随时来补充，不消耗叽分。</p><button class="primary" data-action="supply" '+(full?'disabled':'')+'>'+(full?'食物和水都很充足':'食物和水各补至 3 份')+'</button>':'<p>每只小鸟每天可免费领取食物和水各 1 份，手动领取后放进它的库存。</p><button class="primary" data-action="supply" '+(liveAccount.careDaily?.supplyClaimed?'disabled':'')+'>'+(liveAccount.careDaily?.supplyClaimed?'这只小鸟今日已领取':'领取这只小鸟的今日补给')+'</button>';
    return sheet('<h2>问候与补给</h2>'+supply+'<button class="primary" data-action="greet" '+(liveAccount.careDaily?.greeted?'disabled':'')+'>'+(liveAccount.careDaily?.greeted?'今日已经问候过啦':'打个招呼 · +2 叽分')+'</button><details class="play-tips"><summary>和小鸟玩一会儿</summary><p>摸摸头和身体，它会开心；吃饱喝足、心情好时，12 秒内温柔摸摸 3 次，它会很开心。摸到脚脚，它会痒得假装生气。点“逗逗”看看它的好奇脸。放一会儿，它会想吃东西、喝水或想你陪陪；想念时摸摸头，就能慢慢开心起来。</p></details>');
   }
   if(action==='feed'){
    const bird=ownedCurrent();if(!bird)return pageNotice('请先领取小鸟');
    return sheet('<h2>给它一点小满足</h2><p>食物剩余 '+bird.food+' 份 · 饱食 '+bird.hunger+'%</p><button class="primary" data-action="do-feed">喂一份谷粒</button><p>每份增加 30，上限 100；满值不扣库存。</p>');
   }
   if(['save-rename','supply','greet','do-feed','water','clean','play'].includes(action)){
    const bird=ownedCurrent();if(!bird)return pageNotice('请先领取小鸟');if(busy)return;
    const revision=birdRevision;busy=true;button.disabled=true;actionRevision++;
    try{
     const result=await accountRpc('care',{birdId:bird.id,action:({'save-rename':'rename','do-feed':'feed'})[action]||action,name:$('#local-nickname')?.value},signal);
     if(!isCurrent(bird.id,revision))return;
     applyBird(result.bird);update();$('#sheet').close();
     if(result.changed===false){clearFeedback();renderBird();say(result.message)}
     else{
      const emotion=action==='play'?'puzzled':'happy',duration=action==='save-rename'||action==='supply'?2000:3000;
      feedback(emotion,duration,result.message,{force:interactionEmotion?.emotion==='crying'});birdAudio.play(action,soundTicket);
     }
     pageNotice(result.message);await refreshSaved(bird.id,revision);
    }catch(e){
     if(isCurrent(bird.id,revision)){
      if(e.code==='NO_STOCK')feedback('puzzled',2000,liveAccount.careDaily?.exhibition?'补给不够啦，去“补给”里补充食物和水吧。':'补给不够啦，看看今日补给吧。');
      pageNotice(e.message);
     }
    }finally{busy=false;button.disabled=false}
    return;
   }
   if(action==='touch'){
    const bird=ownedCurrent();if(!bird)return pageNotice('碰一碰实体小鸟，把第一位伙伴领回小窝吧');
    if(busy)return;
    const image=$('#bird img'),point=button.id==='bird'?nestTouchPoint(event,image):null;
    const art=image.dataset.skinId||nestEmotionArtwork(image.dataset.emotion).footArea;
    if(point&&isNestFootPoint(art,point.x,point.y)){
     clearComfort();actionRevision++;feedback('angry',2000,'哎呀，脚脚痒痒的，摸摸头嘛～');birdAudio.play(action,soundTicket);return;
    }
    const revision=birdRevision,soothing=interactionEmotion?.emotion==='crying',veryHappyAtRequest=interactionEmotion?.emotion==='veryhappy'?interactionEmotion:null,comfortAtRequest=comfortGeneration;busy=true;actionRevision++;
    pendingPet??={birdId:bird.id,requestId:crypto.randomUUID()};
    try{
     const result=await accountRpc('pet',pendingPet,signal);pendingPet=null;if(!isCurrent(bird.id,revision))return;
     applyBird(result.bird);update();
     const reaction=chooseNestPetReaction(comfortSequence,result.bird,performance.now(),{accepted:comfortAtRequest===comfortGeneration&&!document.hidden&&!pageSuspended,replayed:!!result.replayed,veryHappyActive:interactionEmotion?.birdId===bird.id&&interactionEmotion.emotion==='veryhappy',duringVeryHappy:!!veryHappyAtRequest});
     comfortSequence=reaction.sequence;
     if(reaction.emotion)feedback(reaction.emotion,reaction.duration,reaction.emotion==='veryhappy'?'好开心呀，再陪我一会儿～':'嘿嘿，你摸摸我，我就开心啦～',{force:soothing});
     birdAudio.play(action,soundTicket);
     pageNotice(result.replayed?'已确认上次陪伴，未重复发放奖励':result.message||(result.reward===1?'小鸟收到你的陪伴，叽分 +1':'小鸟收到你的陪伴啦～'));
     await refreshSaved(bird.id,revision);
    }catch(e){if(isCurrent(bird.id,revision))pageNotice(e.message)}
    finally{busy=false}
    return;
   }
  }catch(e){if(alive&&!signal.aborted&&e.name!=='AbortError')pageNotice(e.message)}
 },{signal});
 update();refreshNest().then(async()=>{if(alive){update();loadOutfit();await enterCurrent()}}).catch(e=>{
  if(!alive||signal.aborted||e.name==='AbortError')return;
  say('本机记录暂时无法读取，请重试，不会覆盖已有缓存。');
  sheet('<h2>本机记录暂不可用</h2><p>'+esc(e.message)+'</p><button class="primary" data-action="retry">重新加载</button>');
 });
}
