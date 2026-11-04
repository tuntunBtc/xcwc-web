// NFC adoption V1.0. Draft names stay in memory and never create demo assets.
const adoptionV1Draft={code:null,nickname:'',prompted:false,account:null};
const adoptionV1Defaults=Object.freeze({city:'杭州',type:'西湖小黄莺',skin:'绿色',nickname:'西湖小黄莺'});
function mountAdoptionV1(){
 const shadow=mountIsolated('xcwc-adopt',adoptionV1Css,adoptionV1Template),$=selector=>shadow.querySelector(selector),controller=new AbortController(),{signal}=controller;
 const adoptChrome=document.createElement('style');adoptChrome.dataset.adoptChrome='';adoptChrome.textContent=`
 #bjd-review.is-integrated:has(#xcwc-adopt) .phone{background:#dfe5c5}
 #bjd-review.is-integrated:has(#xcwc-adopt) .phone>main{background:#c8ddb7}
 `;document.head.append(adoptChrome);
 let alive=true,loading=false,busy=false,entry=null,bird=null,account=null,alreadyMine=false,randomIndex=0,composing=false;
 const suggestions=['湖小叽','西湖团团','小桂','啾啾','慢慢'];
 const chars=value=>[...String(value||'')];
 const showNotice=(message,kind='info')=>{const node=$('[data-role="service-notice"]');node.textContent=message;node.dataset.kind=kind;node.hidden=false};
 const setText=(role,value,fallback='—')=>{const node=$('[data-role="'+role+'"]');if(node)node.textContent=value==null||String(value).trim()===''?fallback:String(value)};
 const setReady=ready=>{const input=$('#adopt-v1-name');input.disabled=!ready;input.readOnly=alreadyMine;const random=$('[data-action="random"]');random.disabled=!ready||alreadyMine;random.hidden=alreadyMine;$('[data-action="confirm"]').disabled=!ready;$('.name-heading').lastChild.textContent=alreadyMine?'它已经住进你的小窝啦':'给小鸟取个名字吧～'};
 const setName=value=>{const input=$('#adopt-v1-name');input.value=chars(value).slice(0,6).join('');adoptionV1Draft.nickname=input.value};
 const openLogin=async()=>{if(!alive)return;$('.login-error').textContent='';await openPageDialog($('.login-dialog'))};
 const rememberName=()=>{adoptionV1Draft.nickname=$('#adopt-v1-name').value};
 const clearNameError=()=>{$('.validation').hidden=true;$('#adopt-v1-name').removeAttribute('aria-invalid')};
 pageCleanup=()=>{adoptChrome.remove();alive=false;controller.abort();shadow.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close())};
 installDialogClose(shadow,signal);
 async function load(){
  if(loading||!alive)return;loading=true;bird=null;alreadyMine=false;$('[data-action="retry"]').hidden=true;setReady(false);$('[data-action="confirm"]').textContent='正在读取资料…';showNotice('正在读取实体资料，请稍候…');
  for(const role of ['bird-name','city-line','type','skin'])setText(role,'—');
  try{
   entry=await accountRpc('adoptionContext',{},signal);if(!alive)return;
   if(adoptionV1Draft.code!==entry.code)Object.assign(adoptionV1Draft,{code:entry.code,nickname:'',prompted:false,account:null});
   const identity=await accountRpc('identity',{},signal);if(!alive)return;account=identity.account;
   if(entry.previewTest){
    account=null;bird={id:entry.code,typeId:'preview_yellow_oriole',name:'小黄莺',cityCode:'hangzhou',cityName:'杭州',typeName:'小黄莺',skinId:'osmanthus_yellow',skinName:'桂花黄'};
    if(!adoptionV1Draft.nickname)adoptionV1Draft.nickname=adoptionV1Defaults.nickname;adoptionV1Draft.account=null;setName(adoptionV1Draft.nickname);
    setText('bird-name',adoptionV1Defaults.type);setText('city-line',adoptionV1Defaults.city);setText('type',adoptionV1Defaults.type);setText('skin',adoptionV1Defaults.skin);
    setText('action-note','仅作页面预览，不会提交领养');setReady(true);$('[data-action="confirm"]').textContent='预览测试，不提交领取';showNotice('测试数据：杭州 · 西湖小黄莺 · 绿色 · 编号尾号 '+entry.code.slice(-4)+'。此本地预览不会提交绑定或发放权益。');return;
   }
   if(adoptionV1Draft.account&&adoptionV1Draft.account!==account){adoptionV1Draft.nickname='';adoptionV1Draft.prompted=false}
   adoptionV1Draft.account=account;setName(adoptionV1Draft.nickname);
   if(entry.error){showNotice(entry.error==='MISSING_BIRD_CODE'?'请碰一碰实体小鸟并打开系统弹出的链接。':'链接参数无效，请重新碰一碰实体小鸟。','error')}
   else if(!entry.lookupSupported){showNotice('已收到完整小鸟编码，但此编码格式暂不受当前资料服务支持，请核对完整链接。','error')}
   else{
    const result=await accountRpc('adoptionPublic',{code:entry.code},signal);if(!alive)return;
    if(!matchesAdoptionBird(entry.code,result))throw Object.assign(new Error('服务返回的实体编号与链接不一致'),{code:'BIRD_ID_MISMATCH'});
    bird=result;
    // First-release display names do not change the public entity or its identifiers.
    setText('bird-name',adoptionV1Defaults.type);setText('city-line',adoptionV1Defaults.city);
    setText('type',adoptionV1Defaults.type);setText('skin',adoptionV1Defaults.skin);
    let ownedBird=null;if(account){const mine=await accountRpc('adoptionMine',{},signal);if(!alive)return;ownedBird=Array.isArray(mine)?mine.find(item=>item?.id===result.id):null;alreadyMine=!!ownedBird}
    setName((alreadyMine&&(ownedBird.nickname||ownedBird.name))||adoptionV1Draft.nickname||adoptionV1Defaults.nickname);
    if(alreadyMine){setText('action-note','这只小鸟已在你的领养名单中');$('[data-role="service-notice"]').hidden=true}
    else{setText('action-note','名字和实体属性确认后，再提交领养请求');$('[data-role="service-notice"]').hidden=true}
    setReady(true);$('[data-action="confirm"]').textContent=alreadyMine?'回小窝，看看它':'孵化并领养';
   }
   if(false&&!account&&!adoptionV1Draft.prompted){adoptionV1Draft.prompted=true;await openLogin()}
  }catch(error){
   if(!alive||signal.aborted)return;
   const message=error.code==='BIRD_NOT_FOUND'?'没有查到该实体小鸟，请重新碰一碰并确认链接。':error.code==='BIRD_ID_MISMATCH'?'服务返回了不同的小鸟编号，本次资料未采用。':'小鸟资料读取失败：'+(error.message||'请检查网络后重试。');
   showNotice(message,'error');$('[data-action="retry"]').hidden=false;
   if(false&&!account&&!adoptionV1Draft.prompted){adoptionV1Draft.prompted=true;try{await openLogin()}catch{}}
  }finally{loading=false;if(alive&&!bird)$('[data-action="confirm"]').textContent='读取资料后可领取'}
 }
 async function submitAdoption(){
  if(busy||!bird)return;if(alreadyMine){await accountRpc('selectBird',{birdId:bird.id},signal);liveAccount.currentId=bird.id;nav('home');return;}rememberName();const name=adoptionV1Draft.nickname.trim(),parts=chars(name);
  if(entry?.previewTest){if(parts.length<1||parts.length>6){const error=$('.validation');error.textContent='请输入 1–6 个字，也可以使用随机取名。';error.hidden=false;$('#adopt-v1-name').setAttribute('aria-invalid','true');$('#adopt-v1-name').focus();return}showNotice('本地测试数据不会提交绑定请求，也不会发放鸟蛋或其他权益。');return}
  
  if(parts.length<1||parts.length>6){const error=$('.validation');error.textContent='请输入 1–6 个字，也可以使用随机取名。';error.hidden=false;$('#adopt-v1-name').setAttribute('aria-invalid','true');$('#adopt-v1-name').focus();return}
  busy=true;$('[data-action="confirm"]').disabled=true;$('[data-action="confirm"]').textContent='正在领取…';
  try{const result=await accountRpc('adoptionConfirm',{code:entry.code,name},signal);if(!result?.bound||result.birdId!==bird.id||result.eggStatus!=='HATCHED')throw Error('领养结果尚未确认，请重试核对');alreadyMine=true;liveAccount.currentId=bird.id;if(alive){showNotice('领取成功，小鸟已免费孵化并保存到本机！');nav('home')}}
  catch(error){if(!alive||signal.aborted)return;if(error.code==='LOGIN_REQUIRED'){account=null;adoptionV1Draft.prompted=false;await openLogin()}else showNotice(error.message||'领养结果暂未确认，请保留当前页面重试，不会重复发放权益。','error')}
  finally{busy=false;if(alive&&bird&&!alreadyMine){$('[data-action="confirm"]').disabled=false;$('[data-action="confirm"]').textContent='孵化并领养'}}
 }
 function syncNameInput(event){if(event.target.id!=='adopt-v1-name'||event.isComposing||composing)return;const input=event.target,limited=chars(input.value).slice(0,6).join('');if(input.value!==limited)input.value=limited;rememberName();clearNameError()}
 shadow.addEventListener('compositionstart',()=>{composing=true},{signal});
 shadow.addEventListener('compositionend',event=>{composing=false;syncNameInput(event)},{signal});
 shadow.addEventListener('focusout',()=>{composing=false},{signal});
 shadow.addEventListener('input',syncNameInput,{signal});
 async function authenticate(mode){
  const form=$('.login-form');if(!form.reportValidity())return;const password=form.elements.password.value;
  if(new TextEncoder().encode(password).length>72){$('.login-error').textContent='密码不能超过 72 个 UTF-8 字节。';return}
  rememberName();const buttons=[...form.querySelectorAll('button')];buttons.forEach(button=>button.disabled=true);$('.login-error').textContent='';
  try{const result=await accountRpc('adoptionLogin',{mode,username:form.elements.username.value.trim(),password},signal);if(!alive)return;account=result.account;adoptionV1Draft.account=account;adoptionV1Draft.prompted=false;form.elements.password.value='';$('.login-dialog').close();await load()}
  catch(error){if(alive&&!signal.aborted)$('.login-error').textContent=error.message}
  finally{if(alive)buttons.forEach(button=>button.disabled=false)}
 }
 shadow.addEventListener('keydown',event=>{if(event.key!=='Enter'||composing||event.isComposing||event.keyCode===229)return;if(event.target.id==='adopt-v1-name'){event.preventDefault();submitAdoption();return}if(event.target.closest('.login-form')){event.preventDefault();authenticate('login')}},{signal});
 shadow.addEventListener('click',async event=>{const button=event.target.closest('button');if(!button)return;if(button.closest('.login-form')){try{await authenticate(button.value==='register'?'register':'login')}catch(error){if(alive) $('.login-error').textContent=error.message||'登录失败'}return}if(!button.matches('[data-action]'))return;try{
  if(button.dataset.action==='retry'){rememberName();await load();return}
  if(button.dataset.action==='close-login'){$('.login-dialog').close();return}
  if(button.dataset.action==='random'){setName(suggestions[randomIndex++%suggestions.length]);clearNameError();$('#adopt-v1-name').focus();return}
  if(button.dataset.action==='confirm'){event.preventDefault();await submitAdoption()}
 }catch(error){if(alive&&!signal.aborted)showNotice(error.message||'操作暂不可用','error')}},{signal});
 load();
}
