// Only a draft name is kept in memory. No demo ownership, eggs or credentials are persisted.
const adoptionDraft={code:null,nickname:'',prompted:false,account:null};
function adopt(){return '<section id="xcwc-adopt"></section>'}
function mountAdoption(){
 const shadow=mountIsolated('xcwc-adopt',adoptCss,adoptTemplate),$=selector=>shadow.querySelector(selector),controller=new AbortController(),{signal}=controller;
 let alive=true,entry=null,bird=null,account=null,owned=false,busy=false,authenticating=false;const names=['湖小叽','小桂','慢慢','小叽','团团'];let random=0;
 pageCleanup=()=>{alive=false;controller.abort();shadow.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close())};installDialogClose(shadow,signal);
 const showMessage=(title,copy,{retry=false,home=false}={})=>{if(!alive)return;$('.service-message').hidden=false;$('[data-role="message-title"]').textContent=title;$('[data-role="message-copy"]').textContent=copy;$('[data-action="retry"]').hidden=!retry;$('[data-action="home"]').hidden=!home;};
 const info=async(title,copy)=>{$('#adoption-info-title').textContent=title;$('[data-role="info-copy"]').textContent=copy;await openPageDialog($('#adoption-info'))};
 const disable=(disabled,label)=>{$('[data-action="confirm"]').disabled=disabled;$('[data-action="confirm"]').textContent=label;$('#adoption-name').disabled=disabled;$('[data-action="random"]').disabled=disabled;};
 const login=async()=>{if(!alive)return;$('.login-error').textContent='';await openPageDialog($('#adoption-login'));};
 function remember(){adoptionDraft.nickname=$('#adoption-name').value;}
 async function load(){
  if(busy)return;busy=true;bird=null;owned=false;disable(true,'正在读取资料…');$('.service-message').hidden=true;$('[data-role="recognition"]').textContent='NFC 正在识别小鸟';
  for(const role of ['city','type','skin'])$('[data-role="'+role+'"]').textContent='—';$('[data-role="identity-state"]').textContent='等待识别';
  try{
   entry=await accountRpc('adoptionContext',{},signal);if(!alive)return;
   if(adoptionDraft.code!==entry.code)Object.assign(adoptionDraft,{code:entry.code,nickname:'',prompted:false,account:null});
   $('[data-role="code"]').textContent=entry.code||'未提供小鸟编码';$('[data-role="code-suffix"]').textContent=entry.code?'尾号 '+entry.code.slice(-6):'查看编号';
   const identity=await accountRpc('identity',{},signal);if(!alive)return;account=identity.account;
   if(adoptionDraft.account!==null&&adoptionDraft.account!==account){adoptionDraft.nickname='';adoptionDraft.prompted=false;}adoptionDraft.account=account;$('#adoption-name').value=adoptionDraft.nickname;
   if(account)adoptionDraft.prompted=false;
   if(entry.error){$('[data-role="recognition"]').textContent='还没有识别到小鸟';showMessage(entry.error==='MISSING_BIRD_CODE'?'从碰一碰链接开始这次相遇':'这个小鸟链接暂时无法使用',entry.error==='MISSING_BIRD_CODE'?'请碰一碰实体小鸟，点击弹出的链接，进入它的专属页面。':'请重新碰一碰实体小鸟，或向工作人员确认链接。',{home:true});disable(true,'等待有效的小鸟链接');return;}
   if(!account&&!adoptionDraft.prompted){adoptionDraft.prompted=true;await login();if(!alive)return;}
   if(!entry.lookupSupported){$('[data-role="recognition"]').textContent='小鸟资料暂时不可用';$('[data-role="identity-state"]').textContent='暂未识别';showMessage('还没能读取这只小鸟','这类小鸟编码的领取暂未开放，请稍后再试。',{retry:true,home:true});disable(true,'暂时无法领养');return;}
   bird=await accountRpc('adoptionPublic',{code:entry.code},signal);if(!alive)return;
   $('[data-role="city"]').textContent=bird.cityName||'未指定';$('[data-role="type"]').textContent=bird.typeName||'未指定';$('[data-role="skin"]').textContent=bird.skinName||'未指定';$('[data-role="hero-name"]').textContent=bird.name||bird.typeName||'小鸟伙伴';$('[data-role="hero-city"]').textContent=bird.cityName||'城市小鸟';$('[data-role="ribbon"]').textContent=bird.cityName?'来自'+bird.cityName+'的旅伴，等你认领！':'把一份小小的陪伴，带回家。';$('[data-role="recognition"]').textContent='NFC 已识别到小鸟';$('[data-role="identity-state"]').textContent='资料已确认';
   if(account){const mine=await accountRpc('adoptionMine',{},signal);if(!alive)return;owned=mine.some(item=>item.id===bird.id);}
   if(owned){disable(true,'这只小鸟已与你绑定');showMessage('又见面啦','已找到你与这只小鸟的绑定。鸟蛋及孵化状态暂时无法查询，不会再次提交领取。',{home:true});}
   else{disable(false,'🥚 孵化并领养 ›');$('[data-role="action-note"]').textContent=account?'确认后即可开启和小鸟的陪伴旅程。':'登录后即可开启和小鸟的陪伴旅程。';}
  }catch(error){if(!alive||signal.aborted)return;$('[data-role="recognition"]').textContent='暂时没能读取小鸟';disable(true,'暂时无法领养');showMessage(error.code==='BIRD_NOT_FOUND'?'暂时找不到这只小鸟':'小鸟资料暂时无法读取',error.code==='BIRD_NOT_FOUND'?'请重新碰一碰实体小鸟，确认打开了正确的链接。':'请检查网络，稍后重新读取资料。',{retry:true,home:true});}
  finally{busy=false;}
 }
 shadow.addEventListener('input',event=>{if(event.target.id==='adoption-name'){remember();$('.validation').hidden=true;event.target.removeAttribute('aria-invalid');}},{signal});
 shadow.addEventListener('click',async event=>{const button=event.target.closest('button');if(!button)return;try{switch(button.dataset.action){
  case'back':case'home':nav('home');break;
  case'help':await info('一次碰面，一段陪伴。','碰一碰实体小鸟，打开它的链接；登录后确认资料并取名，再点击确认领养。\n\n同一实体小鸟可以被不同账号分别领养，各自独立养成。同一账号不重复领取鸟蛋，获得鸟蛋后需前往城市页手动解锁。');break;
  case'random':if($('#adoption-name').disabled)return;$('#adoption-name').value=names[random++%names.length];remember();$('.validation').hidden=true;$('#adoption-name').removeAttribute('aria-invalid');break;
  case'close-login':$('#adoption-login').close();break;
  case'close-info':$('#adoption-info').close();break;
  case'retry':await load();break;
 }}catch(error){if(alive&&!signal.aborted)pageNotice(error.message);}},{signal});
 const confirmAdoption=async event=>{event.preventDefault();if(busy||!bird||owned||!entry?.lookupSupported)return;remember();if(!account){await login().catch(error=>{if(alive)pageNotice(error.message)});return;}
  const name=adoptionDraft.nickname.trim();if(!name){$('.validation').textContent='先给小鸟取个名字吧，也可以点“随机取名”。';$('.validation').hidden=false;$('#adoption-name').setAttribute('aria-invalid','true');$('#adoption-name').focus();return;}if([...name].length>6){$('.validation').textContent='名字最多 6 个字，请再精简一点。';$('.validation').hidden=false;$('#adoption-name').setAttribute('aria-invalid','true');$('#adoption-name').focus();return;}
  busy=true;disable(true,'正在准备孵化…');try{await accountRpc('adoptionConfirm',{code:entry.code,name},signal);if(alive)showMessage('正在核实领取状态','请稍后重新读取资料，确认领取结果。',{retry:true});}catch(error){if(!alive||signal.aborted)return;if(error.code==='LOGIN_REQUIRED'){account=null;adoptionDraft.prompted=false;await login();}else await info('孵化服务暂未开放','你的名字已经替小鸟留好。等孵化服务准备好，再来开启这段旅程。');}finally{busy=false;if(alive)disable(false,'🥚 孵化并领养 ›');}
 };
 $('.nickname-form').addEventListener('submit',confirmAdoption,{signal});$('[data-action="confirm"]').addEventListener('click',confirmAdoption,{signal});$('.nickname-form').addEventListener('keydown',event=>{if(event.key==='Enter'&&event.target.tagName==='INPUT')confirmAdoption(event);},{signal});
 const authenticate=async event=>{event.preventDefault();if(authenticating||busy&&bird)return;const form=$('.login-form');if(!form.reportValidity())return;const mode=(event.submitter?.value||event.target.closest('button')?.value)==='register'?'register':'login',password=form.elements.password.value;if(new TextEncoder().encode(password).length>72){$('.login-error').textContent='密码不能超过 72 个 UTF-8 字节。';return;}
  authenticating=true;const buttons=[...form.querySelectorAll('button')];buttons.forEach(button=>button.disabled=true);$('.login-error').textContent='';remember();try{const value=await accountRpc('adoptionLogin',{mode,username:form.elements.username.value.trim(),password},signal);if(!alive)return;account=value.account;adoptionDraft.prompted=false;form.elements.password.value='';$('#adoption-login').close();if(!busy)await load();}catch(error){if(alive&&!signal.aborted)$('.login-error').textContent=error.message;}finally{authenticating=false;if(alive)buttons.forEach(button=>button.disabled=false);}
 };
 $('.login-form').addEventListener('submit',authenticate,{signal});$('.login-form').addEventListener('click',event=>{if(event.target.closest('button[name=mode]'))authenticate(event);},{signal});$('.login-form').addEventListener('keydown',event=>{if(event.key==='Enter'&&event.target.tagName==='INPUT')authenticate(event);},{signal});load();
}
