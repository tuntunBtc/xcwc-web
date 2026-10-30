async function openWallet(sheet,signal){
 if(!liveAccount.account)return accountRpc('login',{page:s.page});
 const [wallet,ledger]=await Promise.all([accountRpc('wallet',{},signal),accountRpc('ledger',{},signal)]);if(signal.aborted)return;liveAccount.wallet=wallet;
 sheet('<h2>我的叽分</h2><p style="font:32px Georgia">'+wallet.balance+' 叽分</p><p>有效抚摸 +1，间隔 30 秒；账号每日最多 10 次，按北京时间结算。成功合照 +1，不占抚摸额度。</p><p>今日抚摸：'+wallet.earnedToday+' / '+wallet.dailyLimit+'。装饰皮肤永久解锁，穿戴按小鸟独立保存；不提供充值。</p><h3>最近流水</h3>'+ledger.slice(0,20).map(e=>'<p>'+esc(new Date(e.createdAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}))+' · '+esc(({PET:'抚摸奖励',CHECKIN_REWARD:'合照奖励',REDEEM:'皮肤兑换'})[e.operation]||e.operation)+' '+(e.delta>0?'+':'')+e.delta+' · 余额 '+e.balanceAfter+'</p>').join(''));
}
function accountPage(){return '<section id="xcwc-account-page" class="account-page"></section>'}
function mountAccountPage(){
 const host=content.querySelector('#xcwc-account-page'),controller=new AbortController(),{signal}=controller;let alive=true,busy=false,pendingMutation=null;const page=s.page;
 pageCleanup=()=>{alive=false;controller.abort()};
 async function draw(){try{host.textContent='正在读取账号…';await refreshAccount(signal);if(!alive)return;if(!liveAccount.account){host.innerHTML='<h1>我的小鸟伙伴</h1><p>登录后查看真实领养、叽分钱包和衣橱。</p><button data-account-action="login">登录 / 注册</button>';return}
  const bird=ownedCurrent();let html='<h1>'+({profile:'我的小日子',wardrobe:'我的衣橱',flock:'我的小伙伴'})[page]+'</h1><p>'+esc(liveAccount.account)+' · '+(liveAccount.wallet?.balance??'—')+' 叽分</p>';
  if(page==='wardrobe'){
   const data=await accountRpc('wardrobe',{},signal);if(!alive)return;html+='<p>服装权益与账号钱包共用，当前穿戴按实体小鸟保存。光晕属于装饰示意，不替代出厂形象。</p><label>为哪只小鸟换装？<select id="account-bird">'+liveAccount.birds.map(b=>'<option value="'+b.id+'" '+(b.id===bird?.id?'selected':'')+'>'+esc(b.name)+' · '+b.id.slice(-6)+'</option>').join('')+'</select></label>';
   const outfit=data.outfits.find(o=>o.birdId===bird?.id);html+='<button data-account-action="equip" data-skin="" '+(!bird?'disabled':'')+'>日常原始外观'+(!outfit?.skinId?' · 使用中':'')+'</button><div class="account-grid">'+data.skins.map(skin=>'<article><h2>'+esc(skin.name)+'</h2><p>'+skin.price+' 叽分 · 永久解锁</p><button data-account-action="'+(skin.owned?'equip':'redeem')+'" data-skin="'+skin.id+'" '+(skin.owned?!bird?'disabled':'':liveAccount.wallet.balance<skin.price?'disabled':'')+'>'+(skin.owned?(outfit?.skinId===skin.id?'使用中':'穿戴'):(liveAccount.wallet.balance<skin.price?'叽分不足':'兑换'))+'</button></article>').join('')+'</div>';
  }else if(page==='flock')html+='<div class="account-grid">'+liveAccount.birds.map(b=>'<button data-account-action="select" data-bird="'+b.id+'"><img src="'+esc(birdArt(b))+'" alt="小鸟示意"><strong>'+esc(b.name)+'</strong><p>'+esc(b.cityName)+' · '+b.id.slice(-6)+'</p></button>').join('')+'</div>';
  else html+='<button data-go="flock">我的伙伴 · '+liveAccount.birds.length+' 只</button><button data-go="wardrobe">我的衣橱</button><button data-account-action="wallet">叽分钱包与流水</button><button data-account-action="account">账号管理</button><button data-account-action="logout">退出登录</button>';
  if(!liveAccount.birds.length)html+='<p>暂无已绑定小鸟。请通过实体 NFC 或二维码进入绑定流程；新版多账号绑定与鸟蛋仍待后端接入。</p>';html+='<p class="account-message" role="status"></p>';host.innerHTML=html;
 }catch(e){if(alive)host.innerHTML='<h1>账号数据暂不可用</h1><p>'+esc(e.message)+'</p><button data-account-action="retry">重试</button>'}}
 host.addEventListener('change',e=>{if(e.target.id==='account-bird'){liveAccount.currentId=e.target.value;pendingMutation=null;draw()}},{signal});
 host.addEventListener('click',async e=>{const b=e.target.closest('[data-account-action]');if(!b||busy)return;const action=b.dataset.accountAction;try{
  if(action==='retry')return draw();if(action==='login')return accountRpc('login',{page});if(action==='account'){window.parent.postMessage({channel:'xcwc-account',id:crypto.randomUUID(),operation:'login',args:{page:'profile'}},'*');return}
  if(action==='logout'){await accountRpc('logout',{},signal);return}if(action==='select'){liveAccount.currentId=b.dataset.bird;nav('home');return}
  if(action==='wallet'){const [wallet,ledger]=await Promise.all([accountRpc('wallet',{},signal),accountRpc('ledger',{},signal)]);if(!alive)return;host.querySelector('.account-message').innerHTML='<strong>'+wallet.balance+' 叽分</strong><p>有效抚摸 +1（30 秒间隔、每日最多 10 次），合照成功 +1。</p>'+ledger.map(x=>'<p>'+esc(({PET:'抚摸奖励',CHECKIN_REWARD:'合照奖励',REDEEM:'皮肤兑换'})[x.operation]||'叽分变动')+' '+(x.delta>0?'+':'')+x.delta+' · 余额 '+x.balanceAfter+'</p>').join('');return}
  busy=true;b.disabled=true;if(action==='equip'){await accountRpc('equip',{birdId:ownedCurrent()?.id,skinId:b.dataset.skin||null},signal)}if(action==='redeem'){const skin=b.dataset.skin;if(pendingMutation?.skinId!==skin)pendingMutation={skinId:skin,requestId:crypto.randomUUID()};await accountRpc('redeem',pendingMutation,signal);pendingMutation=null}await draw();if(alive)pageNotice(action==='equip'?'穿戴已保存到服务器':'兑换成功，钱包已刷新');
 }catch(error){if(alive)pageNotice(error.message)}finally{busy=false;b.disabled=false}},{signal});draw();
}
