async function initialize(){
 $('.back').onclick=e=>{e.preventDefault();nav(checkinBack||'home');};
 const login=()=>accountRpc('login',{page:'photo',context:photoEntry},rpcController.signal);
 $('.points-pill').onclick=()=>rpc('points').then(wallet=>{if(!destroyed)toast('本机叽分：'+wallet.balance+'，仅保存在当前浏览器')}).catch(e=>toast(e.message));
 try{
  if(!photoEntry)photoEntry=await accountRpc('returnContext',{},rpcController.signal);
  const state=await rpc('bootstrap');if(destroyed)return;authenticated=state.authenticated;if(state.localMode){$('.section-desc').textContent='本机体验 · 合照与原图保存在当前浏览器，不上传云端';$('#ck-albumFoot').textContent='本机相册';}balance=state.wallet?.balance??0;
  const mine=state.birds||[];const key=b=>[b.typeId,b.cityCode,b.skinId].join(':');const ownedKeys=new Set(mine.map(key));
  birds=sortedBirds([...mine.map(b=>({id:b.id,name:b.name,city:b.cityName,adopted:true,src:assetFor(b.cityCode)})),...state.catalog.filter(b=>!ownedKeys.has(key(b))).map(b=>({id:'catalog:'+b.key,name:b.name,city:b.cityCode,adopted:false,src:assetFor(b.cityCode)}))]);
  if(photoEntry?.source==='nest'){selected=birds.some(b=>b.adopted&&b.id===photoEntry.birdId)?[photoEntry.birdId]:[];if(!selected.length)toast('当前实体小鸟不可用或尚未绑定，请重新选择');checkinBack='home';}else selected=birds.filter(b=>b.adopted).slice(0,1).map(b=>b.id);active=selected[0]||null;poses=arrangement(selected);
  imageReady=Promise.all([loadImage(landscape),...birds.map(b=>{const image=new Image();image.crossOrigin='anonymous';images.set(b.id,image);image.src=b.src;return loadImage(image);})]);
  renderBirdList();await imageReady;if(destroyed)return;photo=landscape;ready=true;update(false);
  if(!authenticated){$('.section-desc').textContent='请先登录，获取真实领养的小鸟名单';const login=document.createElement('button');login.className='auth-action';login.textContent='登录 / 注册';login.onclick=()=>accountRpc('login',{page:'photo',context:photoEntry},rpcController.signal);$('.section-desc').append(login);$('#ck-points').textContent='—';$('#ck-albumFoot').textContent='登录后查看你的打卡合照';}
  else{await loadAlbum();if(destroyed)return;balance=(await rpc('points')).balance;syncGenerate();}
 }catch(error){if(!destroyed){toast(error.message);$('.section-desc').textContent='账号或领养数据暂时无法读取，请稍后重新进入';}}
}
initialize().catch(error=>{if(!destroyed)toast(error.message||'打卡页暂时无法加载')});
