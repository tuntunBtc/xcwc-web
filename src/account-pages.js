const pointsOperationLabel=operation=>({WELCOME:'初见礼',GREETING:'每日问候',CARE:'照料奖励',PET:'抚摸奖励',CHECKIN_REWARD:'合照奖励',REDEEM:'皮肤兑换'})[operation]||'叽分变动';
const localPointsRules='首次领取初见礼 +5，仅一次；每日问候 +2；同一天给同一只小鸟喂食和添水，照料奖励 +3，每天一次。有效抚摸 +1，间隔 30 秒，本机每日最多 10 次。每日最多 3 张新原图合照各 +1，重复原图只保存、不加分。每日额度按北京时间结算，各项奖励独立计算。';
const localDataExplanation='小鸟、养成、叽分和装扮仅保存在当前浏览器，不与云端账号同步。重置网站数据、清除浏览器数据或更换设备后不会自动恢复；请先保存重要合照。';
function localDataBadge(){return liveAccount.localMode?'<details class="account-local-badge"><summary>本机保存 · 查看说明</summary><p>'+localDataExplanation+'</p></details>':''}
function walletContent(wallet,ledger){
 const rows=ledger.slice(0,50).map(entry=>{const date=new Date(entry.createdAt),time=Number.isNaN(date.getTime())?'时间未记录':date.toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'});return '<li><time>'+esc(time)+'</time><div><span>'+esc(pointsOperationLabel(entry.operation))+'</span><strong>'+(entry.delta>0?'+':'')+esc(entry.delta)+' 叽分</strong></div><small>变动后余额 '+esc(entry.balanceAfter)+'</small></li>'}).join('');
 return '<h2 id="account-wallet-title">'+(liveAccount.localMode?'本机叽分':'叽分钱包')+'</h2><p class="wallet-balance"><strong>'+esc(wallet.balance)+' 叽分</strong></p>'+localDataBadge()+'<p>今日抚摸奖励 '+esc(wallet.earnedToday)+' / '+esc(wallet.dailyLimit)+' 次</p><h3>最近流水</h3><p>按北京时间显示，最多 50 条。</p>'+(rows?'<ol class="wallet-ledger">'+rows+'</ol>':'<p class="wallet-empty">还没有叽分记录。领取小鸟后，可以通过问候和互动获得叽分。</p>')+'<details class="wallet-rules"><summary>查看叽分获取与使用规则</summary><p>'+localPointsRules+'</p><p>服装换装本期暂未开放；叽分不提供充值。</p></details>';
}
async function openWallet(sheet,signal){
 if(!liveAccount.account&&!liveAccount.localMode)return accountRpc('login',{page:s.page});
 const [wallet,ledger]=await Promise.all([accountRpc('wallet',{},signal),accountRpc('ledger',{},signal)]);if(signal?.aborted)return;liveAccount.wallet=wallet;
 sheet(walletContent(wallet,ledger));
}
function accountPage(){return '<section id="xcwc-account-page" class="account-page"></section>'}

function feltProfileContent(bird){
 const avatar=esc(birdArt(bird,'avatar')),balance=liveAccount.wallet?.balance??'—';
 return '<div class="profile-hero"><header class="account-page-head"><span class="eyebrow">MY LITTLE ISLAND</span><h1>我的小日子<span aria-hidden="true">✿</span></h1><p>和小鸟一起，把日常过得软乎乎。</p></header><section class="profile-card" aria-label="当前小鸟与叽分"><img class="profile-avatar" src="'+avatar+'" width="192" height="174" decoding="async" alt=""><div class="profile-card-copy"><small>今天也有小鸟陪你</small><strong>'+esc(bird?.name||'我的小伙伴')+'</strong><span>'+esc(bird?bird.cityName+' · 当前陪伴':'等待第一位小伙伴')+'</span></div><button type="button" class="profile-points" data-account-action="wallet" aria-label="查看叽分余额与流水"><span class="felt-feather" aria-hidden="true"></span><strong>'+balance+'</strong><span>我的叽分 ›</span></button></section></div>'
 +'<section class="account-section"><h2><span class="felt-flower" aria-hidden="true"></span>我的伙伴</h2><div class="account-menu"><button data-go="flock"><span class="account-menu-label"><span class="account-menu-icon felt-bird" aria-hidden="true"></span>我的小鸟</span><span class="account-menu-meta">'+liveAccount.birds.length+' 只伙伴 <i aria-hidden="true">›</i></span></button></div></section>'
 +'<section class="account-section"><h2><span class="felt-flower" aria-hidden="true"></span>日常管理</h2><div class="account-menu"><button data-go="wardrobe"><span class="account-menu-label"><span class="account-menu-icon felt-outfit" aria-hidden="true"></span>我的衣橱</span><span class="account-menu-meta">换装暂未开放 <i aria-hidden="true">›</i></span></button><button data-account-action="wallet"><span class="account-menu-label"><span class="account-menu-icon felt-wallet" aria-hidden="true"></span>叽分钱包</span><span class="account-menu-meta">余额与流水 <i aria-hidden="true">›</i></span></button></div></section>'
 +'<section class="account-section account-cloud-section"><h2>账号</h2><div class="account-menu"><button data-account-action="account"><span class="account-menu-label"><span class="account-menu-icon" aria-hidden="true">⌂</span>账号管理</span><span class="account-menu-meta">'+esc(liveAccount.account)+' ›</span></button><button data-account-action="logout"><span class="account-menu-label"><span class="account-menu-icon" aria-hidden="true">↗</span>退出登录</span><span class="account-menu-meta">›</span></button></div></section><p class="profile-signoff">一只小鸟，一点温柔，都是日常的小美好。</p>';
}

function wardrobeLook(bird,data){
 const outfit=data.outfits.find(o=>o.birdId===bird?.id),skin=getWardrobeSkin(outfit?.skinId);
 return {visual:skin?.kind==='aura'?skin.visualKey:'',appearance:(bird?.name||'小黄莺')+' · '+(skin?.name||'日常原始外观'),art:skin?.kind==='outfit'?birdArt({...bird,equippedSkinId:skin.id}):'__XCWC_ASSET_ORIGIN__/assets/nest/felt/idle-640.webp'};
}
function wardrobeSkinCard(skin){
 const actual=getWardrobeSkin(skin.id);
 return '<article class="wardrobe-card wardrobe-outfit-card" data-outfit-card="'+esc(skin.id)+'"><div class="wardrobe-preview wardrobe-static-art"><img data-xcwc-src="__XCWC_ASSET_ORIGIN__/'+esc(actual.thumbnailPath)+'" width="320" height="320" loading="lazy" decoding="async" alt="'+esc(skin.name)+'"></div><h2>'+esc(skin.name)+'</h2><p>服装展示</p><button type="button" class="wardrobe-wear" disabled aria-label="'+esc(skin.name)+'，暂未开放">暂未开放</button></article>';
}
function feltWardrobeContent(bird,data){
 const look=wardrobeLook(bird,data);
 const outfits=data.skins.filter(skin=>getWardrobeSkin(skin.id)?.kind==='outfit');
 return '<button type="button" class="account-back" data-go="back">← 返回</button><section class="wardrobe-hero" aria-label="当前小鸟外观：'+esc(look.appearance)+'"><header class="account-page-head"><span class="eyebrow">BUJIDAO · MY ISLAND</span><h1>我的衣橱</h1><p>服装展示 · 暂未开放</p></header><div class="wardrobe-actor '+(look.visual?'aura-'+look.visual:'')+'"><img src="'+esc(look.art)+'" width="640" height="580" alt="'+esc(look.appearance)+'"></div></section>'
 +'<p class="wardrobe-note">换装功能本期暂未开放，服装仅作展示。</p>'
 +'<section class="wardrobe-collection"><h2>小黄莺的新衣 <small>'+outfits.length+' 套装扮</small></h2><div class="account-grid wardrobe-grid wardrobe-outfit-grid">'+outfits.map(wardrobeSkinCard).join('')+'</div></section>';
}

function mountAccountPage(){
 const host=content.querySelector('#xcwc-account-page'),controller=new AbortController(),{signal}=controller;let alive=true,busy=false,resetComplete=false,walletLoading=false;const page=s.page;host.classList.toggle('account-profile-felt',page==='profile');host.classList.toggle('account-flock-felt',page==='flock');host.classList.toggle('account-wardrobe-felt',page==='wardrobe');
 const deferredMedia=createDeferredMedia({signal,root:content});
 pageCleanup=()=>{alive=false;host.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());controller.abort()};
 function mountResetControls(){
  let menu=host.querySelector('.account-menu [data-account-action="wallet"]')?.closest('.account-menu');
  if(!menu){const section=document.createElement('section');section.className='account-section';section.innerHTML='<h2>日常管理</h2><div class="account-menu"></div>';host.append(section);menu=section.querySelector('.account-menu')}
  const entry=document.createElement('button');entry.type='button';entry.dataset.accountAction='clear-cache';entry.innerHTML='<span class="account-menu-label"><span class="account-menu-icon felt-clean" aria-hidden="true">↻</span>重置本机数据</span><span class="account-menu-meta">删除小鸟与相册 ›</span>';menu.append(entry);
  const dialog=document.createElement('dialog');dialog.className='account-cache-dialog';dialog.setAttribute('aria-labelledby','account-cache-title');dialog.setAttribute('aria-describedby','account-cache-description');
  dialog.innerHTML='<h2 id="account-cache-title">重置全部本机体验数据？</h2><p id="account-cache-description">将删除本机的小鸟领取记录、昵称、养成状态、叽分及流水、装扮、购物车，以及相册中的原图和作品。</p><p class="account-cache-warning">清除后无法恢复，请先导出需要保留的照片。</p><p class="account-cache-error" role="alert" hidden></p><div class="account-cache-actions"><button type="button" data-account-action="cancel-cache" autofocus>暂不清除</button><button type="button" data-account-action="confirm-cache">确认清除</button></div>';
  dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault()},{signal});host.append(dialog);
 }
 async function draw(){try{host.textContent='正在读取本机资料…';await refreshAccount(signal);if(!alive)return;if(!liveAccount.account&&page!=='wardrobe'){host.innerHTML=page==='profile'?'<header class="account-page-head"><span class="eyebrow">BUJIDAO · MY ISLAND</span><h1>我的小日子</h1><p>和小鸟一起，把日常过得暖一点。</p></header><section class="account-guest"><img src="'+esc(birdArt(null,'avatar'))+'" alt=""><h2>等你回到小窝</h2><p>登录后查看真实领养、叽分钱包和衣橱。</p><button data-account-action="login">登录 / 注册</button></section>':'<header class="account-page-head"><span class="eyebrow">BUJIDAO · MY ISLAND</span><h1>我的小伙伴</h1><p>登录后查看你的小鸟。</p></header><section class="account-guest"><img src="'+esc(birdArt(null,'avatar'))+'" alt=""><h2>登录后继续</h2><p>你的领养信息会保存在账号中。</p><button data-account-action="login">登录 / 注册</button></section>';return}
  const bird=ownedCurrent();let html=(page==='flock'?'<button type="button" class="account-back" data-go="back">← 返回</button>':'')+'<header class="account-page-head"><span class="eyebrow">BUJIDAO · MY ISLAND</span><h1>'+({profile:'我的小日子',wardrobe:'我的衣橱',flock:'我的小伙伴'})[page]+'</h1><p>'+esc(liveAccount.account)+' · '+(liveAccount.wallet?.balance??'—')+' 叽分</p></header>';
  if(page==='wardrobe'){
   const data=await accountRpc('wardrobe',{},signal);if(!alive)return;html=feltWardrobeContent(bird,data);
  }else if(page==='flock')html+=localDataBadge()+'<p class="flock-intro">每只小鸟都有自己的名字和照料状态。选一只，回小窝陪它。</p><div class="account-grid flock-grid">'+liveAccount.birds.map(b=>'<button type="button" data-account-action="select" data-bird="'+esc(b.id)+'" aria-pressed="'+(b.id===bird?.id)+'"><img data-xcwc-src="'+esc(birdArt(b,'avatar'))+'" width="192" height="174" alt=""><strong>'+esc(b.name)+'</strong><p>'+esc(b.cityName)+' · 尾号 '+esc(b.id.slice(-6))+'</p><span class="flock-selection">'+(b.id===bird?.id?'当前陪伴 · 回小窝':'切换到这只')+'</span></button>').join('')+'</div>';
  else html=feltProfileContent(bird);
  if(!liveAccount.birds.length&&page!=='wardrobe')html+='<section class="account-empty"><h2>等待第一位小伙伴</h2><p>用手机碰一碰实体小鸟的 NFC 标签，或扫描包装二维码，打开专属领取链接。确认名字后即可免费孵化，无需登录。</p><button type="button" data-go="home">回小窝看看</button></section>';html+='<p class="account-message" role="status"></p>';host.innerHTML=html;mountWalletDialog();if(liveAccount.localMode){const badge=document.createElement('p');badge.className='account-message local-experience-note';badge.textContent='本机体验 · 无需登录；清除浏览器缓存或换设备后不会自动恢复。';host.append(badge);if(page==='profile')host.querySelector('.account-cloud-section').hidden=true;for(const node of host.querySelectorAll('[data-account-action=logout],[data-account-action=account]'))node.hidden=true;}
 }catch(e){if(alive)host.innerHTML='<h1>本机资料暂不可用</h1><p>'+esc(e.message)+'</p><button data-account-action="retry">重试</button>'}finally{if(alive)deferredMedia.scan(host);if(alive&&page==='profile')mountResetControls()}}
 function mountWalletDialog(){
  const dialog=document.createElement('dialog');dialog.className='account-wallet-dialog';dialog.setAttribute('aria-labelledby','account-wallet-title');dialog.innerHTML='<button type="button" class="wallet-close" data-account-action="close-wallet" aria-label="关闭叽分钱包">×</button><div data-wallet-content role="status"></div>';host.append(dialog);
 }
 async function showWallet(){
  const dialog=host.querySelector('.account-wallet-dialog');if(!dialog)return;if(walletLoading){await openPageDialog(dialog);return}walletLoading=true;
  const body=dialog.querySelector('[data-wallet-content]');body.innerHTML='<h2 id="account-wallet-title">叽分钱包</h2><p>正在读取叽分与流水…</p>';
  try{await openPageDialog(dialog);await openWallet(html=>{if(alive)body.innerHTML=html},signal)}catch(error){if(alive)body.innerHTML='<h2 id="account-wallet-title">叽分暂不可用</h2><p>'+esc(error.message)+'</p><button type="button" data-account-action="wallet">重新读取</button>'}finally{walletLoading=false}
 }
 host.addEventListener('click',async e=>{const b=e.target.closest('[data-account-action]');if(!b||busy)return;const action=b.dataset.accountAction;try{
  if(['preview','redeem','confirm-redeem','equip','cancel-redeem'].includes(action)){pageNotice('换装功能本期暂未开放');return}
  if(action==='close-wallet'){host.querySelector('.account-wallet-dialog')?.close();return}
  if(action==='wallet'){await showWallet();return}
  if(action==='clear-cache'){const dialog=host.querySelector('.account-cache-dialog');dialog.querySelector('.account-cache-error').hidden=true;await openPageDialog(dialog);return}
  if(action==='cancel-cache'){host.querySelector('.account-cache-dialog').close();return}
  if(action==='confirm-cache'){
   const dialog=host.querySelector('.account-cache-dialog');if(!dialog?.open)return;
   busy=true;b.disabled=true;b.textContent='正在清除…';dialog.querySelector('[data-account-action="cancel-cache"]').disabled=true;
   const result=await accountRpc('resetLocalData',{confirmation:'CLEAR_LOCAL_EXPERIENCE'},signal);
   if(!result?.cleared)throw Error('清除结果尚未确认，请重试');resetComplete=true;b.textContent='正在刷新…';return;
  }
  if(action==='retry')return draw();if(action==='login')return accountRpc('login',{page});if(action==='account'){window.parent.postMessage({channel:'xcwc-account',id:crypto.randomUUID(),operation:'login',args:{page:'profile'}},'*');return}
  if(action==='logout'){await accountRpc('logout',{},signal);return}if(action==='select'){busy=true;for(const control of host.querySelectorAll('[data-account-action=select]'))control.disabled=true;try{await accountRpc('selectBird',{birdId:b.dataset.bird},signal);liveAccount.currentId=b.dataset.bird;nav('home')}finally{if(alive)for(const control of host.querySelectorAll('[data-account-action=select]'))control.disabled=false}return}
 }catch(error){if(alive){if(action==='confirm-cache'){const message=host.querySelector('.account-cache-error');message.textContent='清除未完成：'+error.message;message.hidden=false}else pageNotice(error.message)}}finally{if(!resetComplete){busy=false;b.disabled=false;if(action==='confirm-cache'){b.textContent='确认清除';const cancel=host.querySelector('[data-account-action="cancel-cache"]');if(cancel)cancel.disabled=false}}}},{signal});draw();
}
