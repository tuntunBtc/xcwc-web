$('#ck-generate').onclick=async()=>{
 if(!eligible())return;busy=true;syncGenerate();syncPhotoControls();$('#ck-location').disabled=true;shutterAudio.play();let completed=false;
 try{
  if(!pendingSubmission){const canvas=$('#ck-preview');const image=await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('合照生成失败')),'image/jpeg',.9));if(destroyed)return;const original=await sourceBlob();if(destroyed)return;pendingSubmission={metadata:{requestId:crypto.randomUUID(),birdIds:[...selected],styleId:['natural','film','soft','mono'][style],label:$('#ck-location').value.trim()||'在路上'},original,image};persistDraft();}
  if(destroyed)return;
  const generatedImage=pendingSubmission.image;const work=await rpc('create',pendingSubmission);completed=true;if(destroyed)return;
  dirty=false;pendingSubmission=null;$('#ck-previewBadge').textContent='已收藏';persistDraft();
  let refreshFailed=false;
  try{const wallet=await rpc('points');if(destroyed)return;balance=wallet.balance;s.cloudPoints=balance;save();}catch{refreshFailed=true;}
  try{await loadAlbum(false);}catch{refreshFailed=true;}
  if(destroyed)return;
  await viewPhoto(generatedImage,{label:$('#ck-location').value.trim()||'在路上',createdAt:work.createdAt,note:work.reward===1?'已收藏到打卡相册 · +1 叽分':'已收藏到打卡相册'});
  toast(refreshFailed?'合照已收藏，列表或余额稍后可重试刷新。':work.reward===1?'合照已收藏，叽分 +1 ✨':'合照已收藏；本次未发叽分（原图重复或今日奖励已满）。');
 }catch(error){
  if(!destroyed){if(error.code==='ALBUM_FULL'){albumTotal=30;syncAlbumControls();toast('相册已满，请到下方管理合照；当前编辑会保留。');}else toast(completed?'合照已收藏，可在下方相册重试查看。':error.message+'；未确认结果时请原样重试，不会重复发分');}
 }finally{if(!destroyed){busy=false;$('#ck-location').disabled=false;syncPhotoControls();syncGenerate();persistDraft();}}
};
