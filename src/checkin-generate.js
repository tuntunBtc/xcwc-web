$('#ck-generate').onclick=async()=>{
 if(!eligible())return;busy=true;syncGenerate();$('#ck-location').disabled=true;let completed=false;
 try{
  if(!pendingSubmission){const canvas=$('#ck-preview');const image=await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('合照生成失败')),'image/jpeg',.9));const original=await sourceBlob();pendingSubmission={metadata:{requestId:crypto.randomUUID(),birdIds:[...selected],styleId:['natural','film','soft','mono'][style],label:$('#ck-location').value.trim()||'在路上'},original,image};}
  if(destroyed)return;
  const work=await rpc('create',pendingSubmission);completed=true;if(destroyed)return;
  dirty=false;pendingSubmission=null;$('#ck-previewBadge').textContent='已收藏';
  const wallet=await rpc('points');if(destroyed)return;balance=wallet.balance;s.cloudPoints=balance;save();
  await loadAlbum(false);if(destroyed)return;
  toast(work.reward===1?'合照已收藏，叽分 +1 ✨':'合照已收藏；本次未发叽分（原图重复或今日奖励已满）。');
 }catch(error){if(!destroyed)toast(completed?'合照已保存并结算，列表或余额暂未刷新，请重新进入查看':error.message+'；未确认结果时请原样重试，不会重复发分');}
 finally{if(!destroyed){busy=false;$('#ck-location').disabled=false;syncGenerate();}}
};
