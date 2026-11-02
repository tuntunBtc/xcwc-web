// NFC adoption V1.0. Draft names stay in memory and never create demo assets.
const adoptionV1Draft={code:null,nickname:'',prompted:false,account:null};
function mountAdoptionV1(){
 const shadow=mountIsolated('xcwc-adopt',adoptionV1Css,adoptionV1Template),$=selector=>shadow.querySelector(selector),controller=new AbortController(),{signal}=controller;
 let alive=true,loading=false,busy=false,entry=null,bird=null,account=null,alreadyMine=false,randomIndex=0;
 const suggestions=['湖小叽','西湖团团','小桂','啾啾','慢慢'];
 const chars=value=>[...String(value||'')];
 const showNotice=(message,kind='info')=>{const node=$('[data-role="service-notice"]');node.textContent=message;node.dataset.kind=kind;node.hidden=false};
 const setText=(role,value,fallback='—')=>{const node=$('[data-role="'+role+'"]');if(node)node.textContent=value==null||String(value).trim()===''?fallback:String(value)};
 const setReady=ready=>{const input=$('#adopt-v1-name');input.disabled=!ready;$('[data-action="random"]').disabled=!ready;$('[data-action="confirm"]').disabled=!ready};
 const setName=value=>{const input=$('#adopt-v1-name');input.value=chars(value).slice(0,6).join('');adoptionV1Draft.nickname=input.value};
 const openLogin=async()=>{if(!alive)return;$('.login-error').textContent='';await openPageDialog($('.login-dialog'))};
 const rememberName=()=>{adoptionV1Draft.nickname=$('#adopt-v1-name').value};
 const clearNameError=()=>{$('.validation').hidden=true;$('#adopt-v1-name').removeAttribute('aria-invalid')};
 pageCleanup=()=>{alive=false;controller.abort();shadow.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close())};
 installDialogClose(shadow,signal);
 async function load(){
  if(loading||!alive)return;loading=true;bird=null;alreadyMine=false;setReady(false);showNotice('正在读取 NFC 实体资料…');setText('recognition','正在读取小鸟资料');setText('identity-state','等待识别');
  for(const role of ['bird-name','city-line','city','type','type-card','skin','skin-card','code','trait-one','trait-two','trait-three'])setText(role,role.startsWith('trait-')?'资料待接入':'—');
  try{
   entry=await accountRpc('adoptionContext',{},signal);if(!alive)return;
   if(adoptionV1Draft.code!==entry.code)Object.assign(adoptionV1Draft,{code:entry.code,nickname:'',prompted:false,account:null});
   const identity=await accountRpc('identity',{},signal);if(!alive)return;account=identity.account;
   if(entry.previewTest){
    account=null;bird={id:entry.code,typeId:'preview_yellow_oriole',name:'小黄莺',cityCode:'hangzhou',cityName:'杭州',typeName:'小黄莺',skinId:'osmanthus_yellow',skinName:'桂花黄'};
    if(!adoptionV1Draft.nickname)adoptionV1Draft.nickname='小黄莺';adoptionV1Draft.account=null;setName(adoptionV1Draft.nickname);
    setText('code','编号尾号 '+entry.code.slice(-4));setText('bird-name',adoptionV1Draft.nickname);setText('city-line','杭州');setText('city','杭州');setText('type','小黄莺');setText('type-card','小黄莺');setText('skin','桂花黄');setText('skin-card','桂花黄');
    setText('recognition','本地预览测试资料');setText('identity-state','测试数据 · 不会提交');setText('action-note','仅作页面预览，不会提交领养');setReady(true);showNotice('测试数据：杭州 · 小黄莺 · 桂花黄 · 编号尾号 8888。此本地预览不会提交绑定或发放权益。');return;
   }
   if(adoptionV1Draft.account&&adoptionV1Draft.account!==account){adoptionV1Draft.nickname='';adoptionV1Draft.prompted=false}
   adoptionV1Draft.account=account;setName(adoptionV1Draft.nickname);
   setText('code',entry.code?'编号尾号 '+entry.code.slice(-8):'等待 NFC 链接');
   if(entry.error){setText('recognition',entry.error==='MISSING_BIRD_CODE'?'等待碰一碰链接':'小鸟链接无法识别');setText('identity-state','未识别');showNotice(entry.error==='MISSING_BIRD_CODE'?'请碰一碰实体小鸟并打开系统弹出的链接。':'链接参数无效，请重新碰一碰实体小鸟。','error')}
   else if(!entry.lookupSupported){setText('recognition','收到实体编码，资料接口暂未支持');setText('identity-state','等待新版识别服务');showNotice('已收到完整小鸟编码，但此编码格式暂不受当前资料服务支持，请核对完整链接。','error')}
   else{
    const result=await accountRpc('adoptionPublic',{code:entry.code},signal);if(!alive)return;
    if(!matchesAdoptionBird(entry.code,result))throw Object.assign(new Error('服务返回的实体编号与链接不一致'),{code:'BIRD_ID_MISMATCH'});
    bird=result;
    setText('bird-name',adoptionV1Draft.nickname||result.typeName||'城市小鸟');setText('city-line',result.cityName||result.cityCode,'城市资料待确认');
    setText('city',result.cityName||result.cityCode);setText('type',result.typeName);setText('type-card',result.typeName);setText('skin',result.skinName);setText('skin-card',result.skinName);
    setText('recognition','已读取实体小鸟资料');setText('identity-state','公开资料已读取');
    if(account){const mine=await accountRpc('adoptionMine',{},signal);if(!alive)return;alreadyMine=Array.isArray(mine)&&mine.some(item=>item?.id===result.id)}
    if(alreadyMine){setText('action-note','这只小鸟已在你的领养名单中');showNotice('这只小鸟已领取到本机，点击下方按钮回到小窝，不重复领取或发放奖励。')}
    else{setText('action-note','名字和实体属性确认后，再提交领养请求');showNotice('实体资料来自当前公开查询接口；性格档案暂未提供，本期免登录领取，领取记录与养成状态仅保存在当前浏览器。清除缓存或换设备不会自动恢复。')}
    setReady(true);if(alreadyMine){$('[data-action="confirm"]').disabled=false;$('[data-action="confirm"]').textContent='回小窝，看看它';}
   }
   if(false&&!account&&!adoptionV1Draft.prompted){adoptionV1Draft.prompted=true;await openLogin()}
  }catch(error){
   if(!alive||signal.aborted)return;
   const message=error.code==='BIRD_NOT_FOUND'?'没有查到该实体小鸟，请重新碰一碰并确认链接。':error.code==='BIRD_ID_MISMATCH'?'服务返回了不同的小鸟编号，本次资料未采用。':'小鸟资料读取失败：'+(error.message||'请检查网络后重试。');
   setText('recognition','小鸟资料暂不可用');setText('identity-state','读取失败');showNotice(message,'error');
   if(false&&!account&&!adoptionV1Draft.prompted){adoptionV1Draft.prompted=true;try{await openLogin()}catch{}}
  }finally{loading=false}
 }
 async function submitAdoption(){
  if(busy||!bird)return;if(alreadyMine){await accountRpc('selectBird',{birdId:bird.id},signal);liveAccount.currentId=bird.id;nav('home');return;}rememberName();const name=adoptionV1Draft.nickname.trim(),parts=chars(name);
  if(entry?.previewTest){if(parts.length<1||parts.length>6){const error=$('.validation');error.textContent='请输入 1–6 个字，也可以使用随机取名。';error.hidden=false;$('#adopt-v1-name').setAttribute('aria-invalid','true');$('#adopt-v1-name').focus();return}showNotice('本地测试数据不会提交绑定请求，也不会发放鸟蛋或其他权益。');return}
  
  if(parts.length<1||parts.length>6){const error=$('.validation');error.textContent='请输入 1–6 个字，也可以使用随机取名。';error.hidden=false;$('#adopt-v1-name').setAttribute('aria-invalid','true');$('#adopt-v1-name').focus();return}
  busy=true;$('[data-action="confirm"]').disabled=true;
  try{const result=await accountRpc('adoptionConfirm',{code:entry.code,name},signal);if(!result?.bound||result.birdId!==bird.id||result.eggStatus!=='HATCHED')throw Error('领养结果尚未确认，请重试核对');alreadyMine=true;liveAccount.currentId=bird.id;if(alive){showNotice('领取成功，小鸟已免费孵化并保存到本机！');nav('home')}}
  catch(error){if(!alive||signal.aborted)return;if(error.code==='LOGIN_REQUIRED'){account=null;adoptionV1Draft.prompted=false;await openLogin()}else showNotice(error.message||'领养结果暂未确认，请保留当前页面重试，不会重复发放权益。','error')}
  finally{busy=false;if(alive&&bird&&!alreadyMine)$('[data-action="confirm"]').disabled=false}
 }
 shadow.addEventListener('input',event=>{if(event.target.id!=='adopt-v1-name')return;const input=event.target,limited=chars(input.value).slice(0,6).join('');if(input.value!==limited)input.value=limited;rememberName();if(bird)setText('bird-name',limited||bird.typeName||'城市小鸟');clearNameError()},{signal});
 async function authenticate(mode){
  const form=$('.login-form');if(!form.reportValidity())return;const password=form.elements.password.value;
  if(new TextEncoder().encode(password).length>72){$('.login-error').textContent='密码不能超过 72 个 UTF-8 字节。';return}
  rememberName();const buttons=[...form.querySelectorAll('button')];buttons.forEach(button=>button.disabled=true);$('.login-error').textContent='';
  try{const result=await accountRpc('adoptionLogin',{mode,username:form.elements.username.value.trim(),password},signal);if(!alive)return;account=result.account;adoptionV1Draft.account=account;adoptionV1Draft.prompted=false;form.elements.password.value='';$('.login-dialog').close();await load()}
  catch(error){if(alive&&!signal.aborted)$('.login-error').textContent=error.message}
  finally{if(alive)buttons.forEach(button=>button.disabled=false)}
 }
 shadow.addEventListener('keydown',event=>{if(event.key!=='Enter')return;if(event.target.id==='adopt-v1-name'){event.preventDefault();submitAdoption();return}if(event.target.closest('.login-form')){event.preventDefault();authenticate('login')}},{signal});
 shadow.addEventListener('click',async event=>{const button=event.target.closest('button');if(!button)return;if(button.closest('.login-form')){try{await authenticate(button.value==='register'?'register':'login')}catch(error){if(alive) $('.login-error').textContent=error.message||'登录失败'}return}if(!button.matches('[data-action]'))return;try{
  if(button.dataset.action==='back'){nav('home');return}
  if(button.dataset.action==='close-login'){$('.login-dialog').close();return}
  if(button.dataset.action==='random'){setName(suggestions[randomIndex++%suggestions.length]);if(bird)setText('bird-name',adoptionV1Draft.nickname);clearNameError();$('#adopt-v1-name').focus();return}
  if(button.dataset.action==='confirm'){event.preventDefault();await submitAdoption()}
 }catch(error){if(alive&&!signal.aborted)showNotice(error.message||'操作暂不可用','error')}},{signal});
 load();
}
