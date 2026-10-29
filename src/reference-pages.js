const referenceMedia={treehouse:'__REFERENCE_TREEHOUSE__',cities:'__REFERENCE_CITIES__',props:'__REFERENCE_PROPS__'};
function referenceImageUrl(data){const split=data.indexOf(',');const binary=atob(data.slice(split+1));const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return URL.createObjectURL(new Blob([bytes],{type:'image/png'}));}
for(const key of Object.keys(referenceMedia))referenceMedia[key]=referenceImageUrl(referenceMedia[key]);
roomMedia.background=referenceImageUrl(roomMedia.background);
roomMedia.bird=referenceImageUrl(roomMedia.bird);
roomMedia.interior=roomMedia.background;
roomMedia.background=referenceMedia.treehouse;
s.unlockedCities=Array.isArray(s.unlockedCities)?s.unlockedCities:['杭州'];
if(!s.unlockedCities.includes('杭州'))s.unlockedCities.push('杭州');
s.homeCity=s.homeCity||'杭州';
s.homeScene=s.homeScene||'treehouse';
s.cityFilter=['all','unlocked','locked'].includes(s.cityFilter)?s.cityFilter:'all';
s.cityDetail=false;
const referenceCities=[
 {name:'杭州',en:'HANGZHOU',bird:'桂花鸟',flavor:'湖光山色，慢慢相伴。',position:'0% 0%'},
 {name:'苏州',en:'SUZHOU',bird:'园林鸟',flavor:'一方园林，一段江南。',position:'50% 0%'},
 {name:'南京',en:'NANJING',bird:'南京小鸟',flavor:'梧桐与城墙，等你相遇。',position:'100% 0%'},
 {name:'上海',en:'SHANGHAI',bird:'上海小鸟',flavor:'带着小鸟，看看城市天际线。',position:'0% 100%'},
 {name:'西安',en:"XI’AN",bird:'西安小鸟',flavor:'走过城墙，收藏长安记忆。',position:'50% 100%'},
 {name:'武汉',en:'WUHAN',bird:'武汉小鸟',flavor:'春日江城，樱花正好。',position:'100% 100%'}
];
const propPositions=['0% 0%','50% 0%','100% 0%','0% 50%','50% 50%','100% 50%','0% 100%','50% 100%','100% 100%'];
const referenceProp=(index,extra='')=>`<span class="painted-prop ${extra}" aria-hidden="true"><img src="${referenceMedia.props}" alt="" style="left:${-(index%3)*100}%;top:${-Math.floor(index/3)*100}%"></span>`;
function referenceLandscape(city){const index=Math.max(0,referenceCities.findIndex(c=>c.name===city.name));return `<span class="city-atlas-layer" aria-hidden="true"><img src="${referenceMedia.cities}" alt="" style="left:${-(index%3)*100}%;top:${-Math.floor(index/3)*100}%"></span>`;}
const sceneLabel=()=>s.homeScene==='indoor'?'江南书屋':'江南小窝';
function referenceHud(){return `<div class="room-head illustrated-head"><div class="room-profile"><button class="avatar-link" data-go="flock" aria-label="切换小鸟"><img class="room-avatar" src="${roomMedia.bird}" alt=""></button><div class="bird-identity"><button class="name-edit" data-do="rename" aria-label="修改小鸟名字"><strong>${esc(s.name)}</strong>${ico('pencil')}</button><small>${ico('map-pin')}${esc(s.homeCity)} · ${sceneLabel()}</small></div><button class="level-preview" data-ref-action="level" aria-label="查看等级演示说明"><span>🌸 Lv.3</span><i><b></b></i></button><button class="hud-arrow" data-go="flock" aria-label="查看所有小鸟">›</button></div><button class="room-wallet" data-ref-action="points" aria-label="查看羽力与补给">${referenceProp(8)}<span><b data-room-points>${s.points}</b> 羽力</span><i>＋</i></button></div>`;}
function referenceHome(){
 let markup=roomHome();
 markup=markup.replace(/<div class="room-head">[\s\S]*?<\/div><div class="room-status"/,referenceHud()+'<div class="room-status"');
 const source=s.homeScene==='indoor'?roomMedia.interior:roomMedia.background;
 markup=markup.replace(`src="${roomMedia.background}" alt="洒满日光的江南小屋，木地板和藤编小窝"`,`src="${source}" alt="枝叶环绕的江南树屋，远处湖光与近处藤编鸟窝"`);
 markup=markup.replace(/<div class="room-location">[\s\S]*?<\/div>/,`<button class="room-location illustrated-location" data-ref-action="current-city" aria-label="查看当前城市主题">${ico('map-pin')}${esc(s.homeCity)} · ${sceneLabel()} <span>›</span></button>`);
 const tools=`<div class="room-toolbox illustrated-tools">${roomButton('clean',referenceProp(0)+'<span>清洁</span>','room-tool')}${roomButton('supply',referenceProp(1)+'<span>补给</span>','room-tool '+(s.daily?'':'has-reward'))}<button data-go="photo" class="room-tool">${referenceProp(2)}<span>打卡</span></button><button data-go="wardrobe" class="room-tool">${referenceProp(3)}<span>换装</span></button><button data-go="shop" class="room-tool">${referenceProp(4)}<span>商城</span></button></div>`;
 markup=markup.replace(/<div class="room-toolbox">[\s\S]*?<\/div><div class="room-speech"/,tools+'<div class="room-speech"');
 const dock=`<div class="room-dock illustrated-dock">${roomButton('open-food',referenceProp(5)+'<span>喂食 <i>›</i></span>')}${roomButton('water',referenceProp(6)+'<span>添水 <i>›</i></span>')}${roomButton('touch',referenceProp(7)+'<span>摸摸 <i>›</i></span>')}</div>`;
 markup=markup.replace(/<div class="room-dock">[\s\S]*?<\/div><div class="room-sheet"/,dock+'<div class="room-sheet"');
 return markup;
}
function cityCard(city){const unlocked=s.unlockedCities.includes(city.name);return `<button class="travel-card ${unlocked?'is-unlocked':'is-locked'}" data-ref-city="${city.name}" aria-label="${city.name}，${unlocked?'已解锁，查看城市':'未解锁，了解解锁方式'}"><div class="travel-card-head"><div><h2>${city.name}</h2><small>${city.en}</small></div>${unlocked?'<span class="unlocked-seal">已解锁 ›</span>':ico('lock-keyhole')}</div><div class="travel-art" style="background-position:${city.position}">${referenceLandscape(city)}${unlocked?`<img class="travel-bird" src="${roomMedia.bird}" alt="你的城市伙伴">`:'<span class="mystery-bird" aria-hidden="true">?</span>'}</div><div class="travel-card-foot">${unlocked?'<span>前往城市<br>收藏这座城的风景</span>':`<span>领养${city.name}小鸟<br>即可解锁</span>`}<i>›</i></div></button>`;}
function referenceCity(){if(s.cityDetail)return referenceCityDetail();const list=referenceCities.filter(c=>s.cityFilter==='all'||(s.cityFilter==='unlocked'?s.unlockedCities.includes(c.name):!s.unlockedCities.includes(c.name)));return `<section class="city-travel" aria-label="城市之旅">${referenceHud()}<div class="travel-hero"><div class="travel-landscape" aria-hidden="true">${referenceLandscape(referenceCities[0])}</div><div class="travel-canopy" aria-hidden="true"><img class="canopy-img" src="${referenceMedia.treehouse}" alt=""></div><div class="wood-sign"><h1>城市之旅</h1><p>买小鸟，解锁更多城市</p></div><div class="travel-message">和小鸟一起去更多城市<br>收集风景，遇见新的伙伴吧！<span>♥</span></div><img class="hero-travel-bird" src="${roomMedia.bird}" alt="准备出发的蓝色小鸟"></div><div class="travel-parchment"><div class="travel-filters" role="group" aria-label="按城市解锁状态筛选">${[['all','flower-2','全部城市'],['unlocked','feather','已解锁'],['locked','lock-keyhole','未解锁']].map(([v,i,t])=>`<button data-ref-filter="${v}" aria-pressed="${s.cityFilter===v}" class="${s.cityFilter===v?'selected':''}">${ico(i)}${t}</button>`).join('')}</div><div class="travel-grid">${list.map(cityCard).join('')}</div>${!list.length?'<div class="travel-empty"><h2>还没有解锁的城市</h2><p>领养对应实物小鸟，即可开启新的城市之旅。</p><button class="primary" data-go="adopt">去认领小鸟</button></div>':''}<p class="travel-note">城市款式与风景为展示示例 · 实物认领后解锁</p></div></section>`;}
function referenceCityDetail(){const city=referenceCities.find(c=>c.name===s.city)||referenceCities[0];const chosen=s.homeCity===city.name;return `<section class="city-travel city-detail" aria-label="${city.name}城市主题">${referenceHud()}<div class="detail-art" style="background-position:${city.position}">${referenceLandscape(city)}<button class="detail-back" data-ref-action="back-cities">${ico('arrow-left')} 所有城市</button><div class="detail-title"><span>${city.en}</span><h1>${city.name}的慢日子</h1><p>${city.flavor}</p></div><img src="${roomMedia.bird}" alt="城市小鸟伙伴"></div><div class="travel-parchment detail-parchment"><div class="detail-section-title"><h2>景点与小窝场景</h2><span class="unlocked-seal">已解锁</span></div><p class="detail-intro">选一个喜欢的场景，带小鸟住进这座城。</p><div class="scene-choices"><button data-ref-scene="treehouse" class="scene-choice ${chosen&&s.homeScene==='treehouse'?'chosen':''}"><img src="${referenceMedia.treehouse}" alt="江南树屋场景"><strong>江南树屋</strong><span>${chosen&&s.homeScene==='treehouse'?'使用中':'设为小窝背景'}</span></button><button data-ref-scene="indoor" class="scene-choice ${chosen&&s.homeScene==='indoor'?'chosen':''}"><img src="${roomMedia.interior}" alt="江南书屋场景"><strong>江南书屋</strong><span>${chosen&&s.homeScene==='indoor'?'使用中':'设为小窝背景'}</span></button></div><button class="city-feature" data-go="photo">${referenceProp(2)}<span><strong>留一张城市纪念照</strong><small>上传照片，与小鸟静态同框</small></span><i>›</i></button><button class="city-feature" data-go="wardrobe">${referenceProp(3)}<span><strong>城市装扮</strong><small>查看现有装扮演示</small></span><i>›</i></button><div class="detail-return"><button class="primary" data-go="home">回小窝，看看小鸟</button></div></div></section>`;}
function referenceChrome(){
 const illustrated=s.page==='home'||s.page==='city';root.classList.toggle('is-illustrated',illustrated);root.classList.toggle('is-travel',s.page==='city');
 const active=['flock','wardrobe'].includes(s.page)?'home':s.page==='photo'?'city':s.page;
 root.querySelector('.bottom').innerHTML=[['home','house','小窝'],['adopt','bird','认领'],['city','map','城市'],['shop','shopping-bag','商城'],['profile','user-round','我的']].map(([p,i,t])=>`<button data-go="${p}" class="${active===p?'active':''}" ${active===p?'aria-current="page"':''}>${ico(i)}<span>${t}</span></button>`).join('');
 if(s.page==='city')root.querySelector('#reviewnote').textContent='城市之旅 · 筛选已解锁与未解锁城市，点击杭州查看主题背景；其他城市需对应实物凭证认领后解锁。此页面为交互演示，不含真实购买。';
 if(globalThis.lucide)lucide.createIcons({attrs:{width:18,height:18}});
}
root.addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.dataset.refFilter){s.cityFilter=b.dataset.refFilter;render();save();return;}
 if(b.dataset.refCity){const city=referenceCities.find(c=>c.name===b.dataset.refCity);if(!city)return;s.city=city.name;if(s.unlockedCities.includes(city.name)){s.cityDetail=true;render();save();}else{dialog(city.name+' · 等一位新伙伴',`<div class="locked-city-preview" style="position:relative;overflow:hidden">${referenceLandscape(city)}</div><p>领养对应的${city.name}实物小鸟，即可解锁这座城市与主题内容。</p><p>已经有实体小鸟？碰一碰 NFC，或扫描包装二维码进行认领。</p><div class="row"><button class="secondary" data-ref-action="browse-city-birds">查看实物展示</button><button class="secondary" data-ref-action="claim-city-bird">已有实物，去认领</button></div><div class="notice">当前是交互演示，城市小鸟款式及素材待确认，不发生真实交易。</div>`);}return;}
 if(b.dataset.refScene){s.homeCity=s.city;s.homeScene=b.dataset.refScene;save();render();toast('已设置 '+s.homeCity+' · '+sceneLabel()+'，回小窝看看吧');return;}
 const action=b.dataset.refAction;if(!action)return;
 if(action==='back-cities'){s.cityDetail=false;render();save();}
 if(action==='current-city'){s.city=s.homeCity;nav('city');s.cityDetail=true;render();save();}
 if(action==='browse-city-birds'){nav('shop');}
 if(action==='claim-city-bird'){s.pendingAdoptionCity=s.city;nav('adopt');toast('认领演示：验证'+s.city+'实物凭证后解锁');}
 if(action==='level'){dialog('陪伴等级 · Lv.3','<p>等级和进度条按参考图展示，当前数值为演示。</p><p>正式成长规则、升级奖励与经验来源尚未确认，不会因点击自动扣除羽力。</p>');}
 if(action==='points'){dialog('羽力与每日补给',`<p>当前羽力：${s.points}。</p><p>日常互动、清洁和签到可以获得演示羽力。喂食消耗食物，添水使用免费补给。</p><div class="row"><button class="primary" data-ref-action="claim-supply">领取今日补给</button></div><div class="notice">当前未接入付费充值。所有积分数值为交互示例。</div>`);}
 if(action==='claim-supply'){modal.hidden=true;if(s.page==='home')roomSupply();else{if(s.daily){toast('今日补给已领取');return;}s.daily=true;s.points+=20;for(const key of Object.keys(roomState.stock))roomState.stock[key]+=3;save();render();toast('补给到账：食物与 20 羽力');}}
});
