async function initialize(){
 if(initializing)return;initializing=true;$('#ck-retryData').disabled=true;setIssue('data','');
 $('.back').onclick=event=>{event.preventDefault();nav('back');};
 $('.points-pill').onclick=()=>rpc('points').then(wallet=>{if(!destroyed)toast('本机叽分：'+wallet.balance+'，仅保存在当前浏览器')}).catch(error=>{if(!destroyed)toast(error.message)});
 try{
  if(!photoEntry){try{photoEntry=await accountRpc('returnContext',{},rpcController.signal)}catch{photoEntry=null}}
  const state=await rpc('bootstrap');if(destroyed)return;
  authenticated=state.authenticated;localMode=!!state.localMode;balance=state.wallet?.balance??0;
  $('.section-desc').textContent='最多选择 3 只已领取的小鸟一起合照';$('.upload-note').textContent='最大 15 MB · 照片在本机处理，不上传云端';
  const mine=state.birds||[],key=bird=>[bird.typeId,bird.cityCode,bird.skinId].join(':'),ownedKeys=new Set(mine.map(key));
  birds=sortedBirds([...mine.map(bird=>({id:bird.id,name:bird.name,city:bird.cityName,adopted:true,src:assetFor(bird.cityCode)})),...(state.catalog||[]).filter(bird=>!ownedKeys.has(key(bird))).map(bird=>({id:'catalog:'+bird.key,name:bird.name,city:bird.cityCode,adopted:false,src:assetFor(bird.cityCode)}))]);
  const previous=selected.filter(id=>birds.some(bird=>bird.adopted&&bird.id===id));
  if(previous.length)selected=previous;
  else if(photoEntry?.source==='nest')selected=birds.some(bird=>bird.adopted&&bird.id===photoEntry.birdId)?[photoEntry.birdId]:[];
  else selected=birds.filter(bird=>bird.adopted).slice(0,1).map(bird=>bird.id);
  poses=reconcilePoses(selected,poses);active=selected.includes(active)?active:selected[0]||null;
  renderBirdList();ready=true;
  if(!draftReady){try{await restoreDraft()}catch{if(!destroyed)toast('暂时无法恢复编辑内容，仍可重新选择照片')}}
  if(destroyed)return;renderBirdList();update(false);
  if(!authenticated){setIssue('data','请登录后读取你的小鸟资料。');$('#ck-retryData').textContent='登录 / 注册';$('#ck-retryData').onclick=()=>accountRpc('login',{page:'photo',context:photoEntry},rpcController.signal);}
 }catch(error){if(!destroyed){ready=false;setIssue('data','小鸟资料暂时无法读取，请重试。已收藏的合照仍可在下方查看。');}}
 finally{initializing=false;if(!destroyed){$('#ck-retryData').disabled=false;syncGenerate();}}
 if(!destroyed){try{await loadAlbum()}catch{}}
}
$('#ck-retryData').onclick=()=>{initialized=initialize();};
$('#ck-retryAlbum').onclick=()=>{void loadAlbum(false).catch(()=>{});};
$('#ck-retryAssets').onclick=async()=>{
 const button=$('#ck-retryAssets');button.disabled=true;
 try{if(draftRestoreFailed){await restoreDraft();return;}await prepareCanvasImages();if(destroyed)return;if(!uploaded)photo=landscape;update(false);}
 catch{}finally{if(!destroyed)button.disabled=false;}
};
let initialized=initialize();
