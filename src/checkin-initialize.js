async function initialize(){
 $('.back').onclick=e=>{e.preventDefault();nav(checkinBack||'home');};
 const login=()=>accountRpc('login',{page:'photo',context:photoEntry},rpcController.signal);
 $('.points-pill').onclick=()=>rpc('points').then(wallet=>{if(!destroyed)toast('本机叽分：'+wallet.balance+'，仅保存在当前浏览器')}).catch(e=>toast(e.message));
 try{
  if(!photoEntry)photoEntry=await accountRpc('returnContext',{},rpcController.signal);
  const state=await rpc('bootstrap');if(destroyed)return;authenticated=state.authenticated;localMode=!!state.localMode;if(localMode){$('.section-desc').textContent='本机体验 · 合照与原图保存在当前浏览器，不上传云端';$('#ck-albumFoot').textContent='本机相册';$('.upload-note').textContent='最大 15 MB · 在本机处理，照片不上传云端';}balance=state.wallet?.balance??0;
  const mine=state.birds||[];const key=b=>[b.typeId,b.cityCode,b.skinId].join(':');const ownedKeys=new Set(mine.map(key));
  birds=sortedBirds([...mine.map(b=>({id:b.id,name:b.name,city:b.cityName,adopted:true,src:assetFor(b.cityCode)})),...state.catalog.filter(b=>!ownedKeys.has(key(b))).map(b=>({id:'catalog:'+b.key,name:b.name,city:b.cityCode,adopted:false,src:assetFor(b.cityCode)}))]);
  if(photoEntry?.source==='nest'){selected=birds.some(b=>b.adopted&&b.id===photoEntry.birdId)?[photoEntry.birdId]:[];if(!selected.length)toast('当前实体小鸟不可用或尚未绑定，请重新选择');checkinBack='home';}else selected=birds.filter(b=>b.adopted).slice(0,1).map(b=>b.id);active=selected[0]||null;poses=arrangement(selected);
  const bySource=new Map();imageReady=Promise.all([loadCheckinAsset(landscape,'background'),...birds.map(b=>{let shared=bySource.get(b.src);if(!shared){const image=new Image();shared={image,ready:loadCheckinAsset(image,'bird')};bySource.set(b.src,shared);}images.set(b.id,shared.image);return shared.ready;})]);
  renderBirdList();await imageReady;if(destroyed)return;if(!uploaded)photo=landscape;ready=true;update(uploaded);
  if(!authenticated){$('.section-desc').textContent='请先登录，获取真实领养的小鸟名单';const login=document.createElement('button');login.className='auth-action';login.textContent='登录 / 注册';login.onclick=()=>accountRpc('login',{page:'photo',context:photoEntry},rpcController.signal);$('.section-desc').append(login);$('#ck-points').textContent='—';$('#ck-albumFoot').textContent='登录后查看你的打卡合照';}
  else{await loadAlbum();if(destroyed)return;balance=(await rpc('points')).balance;syncGenerate();}
 }catch(error){if(!destroyed){toast(error.message);$('.section-desc').textContent=error.code==='CHECKIN_ASSET_FAILED'?'合照素材暂时无法加载，请刷新后重试':'账号或领养数据暂时无法读取，请稍后重新进入';}}
}
initialize().catch(error=>{if(!destroyed)toast(error.message||'打卡页暂时无法加载')});
