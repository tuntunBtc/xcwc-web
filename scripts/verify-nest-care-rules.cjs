// Isolated local fixtures only. This script never reads or mutates real accounts.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/tmp/xcwc-browser-check/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const base=(process.env.XCWC_PREVIEW_URL||'http://127.0.0.1:8790').replace(/\/$/,'');
const out=path.resolve(process.env.XCWC_NEST_REPORT_DIR||path.join(__dirname,'../output/nest-care-rules-20261103'));
if(!['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname))throw Error('Nest fixture verification requires a loopback preview.');
fs.mkdirSync(out,{recursive:true});

const key='xcwc.guest.v1';
const first={id:'1234567890abcdef1234567890abcdef',active:true,typeId:'huangying',typeName:'小黄莺',cityCode:'hangzhou',cityName:'杭州',skinId:'green',skinName:'绿色'};
const second={...first,id:'abcdef1234567890abcdef1234567890'};
const names=['规则甲','规则乙'];
const report={passed:false,preview:base,checks:[],widths:[],errors:[],api:[]};

async function verifyWidth(browser,width){
 const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true});
 const page=await context.newPage();
 page.setDefaultTimeout(10000);
 await page.addInitScript(()=>{
  if(window!==window.top)return;
  window.__nestFixtureOperationLog=[];
  Object.defineProperty(window,'xcwcGuestOperation',{configurable:true,set(original){
   Object.defineProperty(window,'xcwcGuestOperation',{configurable:true,value:async(...args)=>{
    const call={operation:args[0],done:false};window.__nestFixtureOperationLog.push(call);
    try{return await original(...args)}finally{call.done=true}
   }});
  }});
 });
 const requestedEmotions=new Set();
 page.on('pageerror',error=>report.errors.push({width,message:error.message}));
 page.on('request',request=>{
  // The media pipeline adds a content fingerprint while keeping the emotion name.
  if(request.url().includes('/emotions/'))requestedEmotions.add(path.basename(new URL(request.url()).pathname).replace(/\.[0-9a-f]{12}(?=\.webp$)/,''));
 });
 await page.route('**/api/**',route=>{
  const request=route.request(),url=new URL(request.url());
  report.api.push({width,path:url.pathname,method:request.method()});
  // Public metadata is not needed: birds below are entirely artificial fixtures.
  return route.fulfill({status:url.pathname==='/api/checkin-catalog'?200:503,contentType:'application/json',body:JSON.stringify(url.pathname==='/api/checkin-catalog'?[]:{code:'FIXTURE_ONLY',message:'Browser verification blocks real APIs'})});
 });
 const frame=page.frameLocator('iframe');
 const nest=frame.locator('#xcwc-nest');
 const image=nest.locator('.actor img');
 const touch=nest.locator('#bird');
 const emotion=()=>image.getAttribute('data-emotion');
 const expectEmotion=value=>nest.locator('.actor img[data-emotion="'+value+'"]').waitFor();
 const snapshot=()=>page.evaluate(()=>window.xcwcGuest.snapshot());
 const stored=()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
 const current=async()=>{const s=await snapshot();const raw=await stored();return s.birds.find(b=>b.id===raw.currentId)};
 const capture=async label=>{
  await image.evaluate(im=>im.decode());
  await page.screenshot({path:path.join(out,label+'-'+width+'.png')});
 };
 const reopen=async()=>{
  await page.goto(base+'/?page=home');
  await nest.locator('#name').filter({hasText:names[0]}).waitFor();
 };
 const seed=async(primary={},secondary={})=>{
  await page.evaluate(({key,first,second,names,primary,secondary})=>{
   localStorage.removeItem(key);
   window.xcwcGuest.adopt(first,names[0]);
   window.xcwcGuest.adopt(second,names[1]);
   window.xcwcGuest.select(first.id);
   const state=JSON.parse(localStorage.getItem(key));
   Object.assign(state.birds.find(b=>b.id===first.id),primary);
   Object.assign(state.birds.find(b=>b.id===second.id),secondary);
   localStorage.setItem(key,JSON.stringify(state));
  },{key,first,second,names,primary,secondary});
  await reopen();
 };
 const patchStored=async values=>{
  await page.evaluate(({key,id,values})=>{
   const state=JSON.parse(localStorage.getItem(key));
   Object.assign(state.birds.find(b=>b.id===id),values);
   localStorage.setItem(key,JSON.stringify(state));
  },{key,id:first.id,values});
 };
 const patch=async values=>{
  await patchStored(values);
  await reopen();
 };
 const feed=async()=>{
  await nest.locator('[data-action=feed]').click();
  await nest.locator('[data-action=do-feed]').click();
 };
 const supply=async()=>{
  await nest.locator('[data-action=daily]').click();
  await nest.locator('[data-action=supply]').click();
 };
 const switchTo=async name=>{
  // Local postMessage acknowledgement can precede the follow-up state read.
  await page.waitForTimeout(150);
  await nest.locator('[data-action=switch]').first().click();
  await nest.locator('.bird-choice').filter({hasText:name}).click();
  await nest.locator('#name').filter({hasText:name}).waitFor();
 };
 const check=async(name,fn)=>{
  try{
   await fn();
   report.checks.push({width,name,passed:true});
  }catch(error){
   try{
    report.failure={width,name,emotion:await emotion(),mood:await nest.locator('#mood').innerText(),speech:await nest.locator('#speech').innerText(),state:await stored()};
    await page.screenshot({path:path.join(out,'failed-'+width+'.png')});
   }catch{}
   throw error;
  }
 };
 try{
  await page.goto(base+'/?page=home');
  await page.waitForFunction(()=>!!window.xcwcGuest);
  await check('real mood percentage, normal sprite and unchanged four navigation entries',async()=>{
   await seed();
   await expectEmotion('happy');
   assert.equal(await nest.locator('#mood').innerText(),'80%');
   assert.equal(await nest.locator('#mood-bar').evaluate(el=>el.style.width),'80%');
   assert.deepEqual(await frame.locator('.bottom [data-go]').evaluateAll(elements=>elements.map(el=>el.dataset.go)),['home','city','shop','profile']);
   assert([...requestedEmotions].every(name=>['happy.webp','happy-192.webp'].includes(name)),'only the current emotion and thumbnail should load initially');
   await capture('happy');
  });

  await check('physical need priority, including equal low values choosing water',async()=>{
   await patch({hunger:20,water:25});
   await expectEmotion('hungry');
   assert.match(await nest.locator('#speech').innerText(),/谷粒|肚子/);
   await capture('hungry');
   await patch({hunger:25,water:20});
   await expectEmotion('unwell');
   assert.match(await nest.locator('#speech').innerText(),/水/);
   await patch({hunger:20,water:20});
   await expectEmotion('unwell');
   assert.match(await nest.locator('#speech').innerText(),/水/);
   await capture('unwell');
  });

  await check('feeding success lasts 3 seconds, then the remaining thirst returns',async()=>{
   await seed({hunger:15,water:10});
   await feed();
   await expectEmotion('happy');
   const shownAt=Date.now();
   assert.equal((await current()).hunger,45);
   assert.equal((await current()).water,10);
   await page.waitForTimeout(2000);
   assert.equal(await emotion(),'happy');
   await expectEmotion('unwell');
   assert(Date.now()-shownAt>=2600,'feeding feedback ended substantially before 3 seconds');
   assert.match(await nest.locator('#speech').innerText(),/水/);
  });

  await check('touch feedback lasts 2 seconds and restores the current need',async()=>{
   await seed({hunger:15,water:60});
   await touch.click({force:true});
   await expectEmotion('shy');
   const shownAt=Date.now();
   await capture('shy');
   await page.waitForTimeout(1000);
   assert.equal(await emotion(),'shy');
   await expectEmotion('hungry');
   assert(Date.now()-shownAt>=1600,'touch feedback ended substantially before 2 seconds');
  });

  await check('320/390 layout contains the transparent bird without horizontal overflow',async()=>{
   const layout=await image.evaluate(im=>{
    const r=im.getBoundingClientRect(),host=im.getRootNode().host.getBoundingClientRect();
    return{natural:[im.naturalWidth,im.naturalHeight],fit:getComputedStyle(im).objectFit,clipped:r.left<host.left||r.right>host.right||r.top<host.top||r.bottom>host.bottom};
   });
   assert.deepEqual(layout.natural,[640,580]);
   assert.equal(layout.fit,'contain');
   assert.equal(layout.clipped,false);
   assert.equal(await frame.locator('body').evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   report.widths.push({width,layout});
  });

  if(width===390){
   await check('five quick touches cause 2-second playful anger, limited to once per minute',async()=>{
    await seed();
    for(let i=0;i<5;i++)await touch.click({force:true});
    await expectEmotion('angry');
    const shownAt=Date.now();
    await capture('angry');
    await page.waitForTimeout(1000);
    assert.equal(await emotion(),'angry');
    await expectEmotion('happy');
    assert(Date.now()-shownAt>=1600,'playful anger ended substantially before 2 seconds');
    for(let i=0;i<5;i++)await touch.click({force:true});
    await page.waitForTimeout(250);
    assert.notEqual(await emotion(),'angry','anger repeated inside its 1-minute limit');
   });

   await check('crying lasts 3 seconds and is not repeated for the same bird that day',async()=>{
    await seed({mood:20});
    await expectEmotion('crying');
    const shownAt=Date.now();
    await capture('crying');
    await page.waitForTimeout(1600);
    assert.equal(await emotion(),'crying');
    await expectEmotion('unwell');
    assert(Date.now()-shownAt>=2600,'crying feedback ended substantially before 3 seconds');
    await reopen();
    await expectEmotion('unwell');
    await page.waitForTimeout(350);
    assert.equal(await emotion(),'unwell');
   });

   await check('touch immediately comforts a crying bird',async()=>{
    await seed({mood:20});
    await expectEmotion('crying');
    await touch.click({force:true});
    await expectEmotion('shy');
    assert((await current()).mood>=40);
   });

   await check('switching to a lonely bird triggers its own daily reunion once',async()=>{
    await seed({}, {mood:20});
    await switchTo(names[1]);
    await expectEmotion('crying');
    assert.equal((await stored()).birds.find(b=>b.id===second.id).cryShownDate,(await snapshot()).wallet.date);
    await touch.click({force:true});
    await expectEmotion('shy');
    await switchTo(names[0]);
    await expectEmotion('happy');
    await switchTo(names[1]);
    await expectEmotion('unwell');
    assert.equal((await current()).id,second.id);
   });

   await check('full food and water preserve inventory and do not play success feedback',async()=>{
    await seed({hunger:100,water:100,mood:40});
    const before=await current();
    await feed();
    await page.waitForTimeout(250);
    assert.equal(await emotion(),'unwell');
    let after=await current();
    assert.equal(after.food,before.food);
    assert.equal(after.mood,before.mood);
    if(await nest.locator('#sheet').evaluate(el=>el.open))await nest.locator('[data-action=close]').click();
    await nest.locator('[data-action=water]').click();
    await page.waitForTimeout(250);
    assert.equal(await emotion(),'unwell');
    after=await current();
    assert.equal(after.waterStock,before.waterStock);
    assert.equal(after.mood,before.mood);
   });

   await check('empty stock shows puzzled for 2 seconds, then restores hunger',async()=>{
    await seed({hunger:20,water:60,food:0});
    await feed();
    await expectEmotion('puzzled');
    const shownAt=Date.now();
    await capture('puzzled');
    await page.waitForTimeout(1000);
    assert.equal(await emotion(),'puzzled');
    await expectEmotion('hungry');
    assert(Date.now()-shownAt>=1600,'puzzled feedback ended substantially before 2 seconds');
    assert.equal((await current()).food,0);
   });

   await check('per-bird supplies and active feedback remain isolated when switching',async()=>{
    await seed({}, {water:20});
    await supply();
    await page.waitForFunction(()=>window.xcwcGuest.snapshot().careDaily.supplyClaimed);
    await switchTo(names[1]);
    await expectEmotion('unwell');
    let state=await snapshot();
    assert.equal(state.careDaily.supplyClaimed,false);
    assert.equal(state.birds.find(b=>b.id===first.id).food,4);
    assert.equal(state.birds.find(b=>b.id===second.id).food,3);
    await supply();
    await page.waitForFunction(()=>window.xcwcGuest.snapshot().careDaily.supplyClaimed);
    state=await snapshot();
    assert.equal(state.birds.find(b=>b.id===second.id).food,4);
    assert.equal(state.birds.find(b=>b.id===second.id).waterStock,4);
    await switchTo(names[0]);
    assert.equal((await snapshot()).careDaily.supplyClaimed,true);
    await nest.locator('[data-action=daily]').click();
    assert.equal(await nest.locator('[data-action=supply]').isDisabled(),true);
    assert.equal((await current()).food,4,'the same bird received duplicate supplies');
    await nest.locator('[data-action=close]').click();
   });

   await check('exhausted point rewards still permit mood recovery and shy feedback',async()=>{
    await seed({mood:40});
    await page.evaluate(key=>{
     const date=window.xcwcGuest.snapshot().wallet.date;
     const state=JSON.parse(localStorage.getItem(key));
     state.daily[date]??={};
     state.daily[date].pets=10;
     localStorage.setItem(key,JSON.stringify(state));
    },key);
    await reopen();
    const before=await snapshot();
    await touch.click({force:true});
    await expectEmotion('shy');
    const after=await snapshot();
    assert(after.birds.find(b=>b.id===first.id).mood>before.birds.find(b=>b.id===first.id).mood);
    assert.equal(after.wallet.balance,before.wallet.balance);
    assert.equal(after.wallet.earnedToday,10);
   });

   await check('storage failure preserves the cache and never displays feeding success',async()=>{
    await seed({mood:40});
    const before=await stored();
    await page.evaluate(key=>{
     window.__nestOriginalSetItem=Storage.prototype.setItem;
     Storage.prototype.setItem=function(k,v){
      if(k===key)throw new DOMException('Fixture quota failure','QuotaExceededError');
      return window.__nestOriginalSetItem.call(this,k,v);
     };
    },key);
    try{
     await feed();
     await frame.locator('#bjd-toast').filter({hasText:'保存失败'}).waitFor();
     assert.equal(await emotion(),'unwell');
     assert.deepEqual(await stored(),before);
    }finally{
     await page.evaluate(()=>{Storage.prototype.setItem=window.__nestOriginalSetItem;delete window.__nestOriginalSetItem});
    }
   });

   await check('27-hour absence settles mood once, preserving values on another refresh',async()=>{
    await page.clock.install({time:new Date('2026-11-03T04:00:00Z')});
    await seed();
    await page.clock.fastForward(27*3600000);
    await reopen();
    await nest.locator('#mood').filter({hasText:'79%'}).waitFor();
    const firstReturn=await current();
    assert.equal(firstReturn.hunger,33);
    assert.equal(firstReturn.water,33);
    assert.equal(firstReturn.mood,79);
    await reopen();
    await nest.locator('#mood').filter({hasText:'79%'}).waitFor();
    const secondReturn=await current();
    assert.equal(secondReturn.hunger,33);
    assert.equal(secondReturn.water,33);
    assert.equal(secondReturn.mood,79);
   });

   for(const file of ['happy.webp','hungry.webp','unwell.webp','shy.webp','puzzled.webp','angry.webp','crying.webp']){
    assert(requestedEmotions.has(file),'missing exercised emotion asset: '+file);
   }
  }
  report.widths.find(entry=>entry.width===width).requestedEmotions=[...requestedEmotions];
 }finally{
  await context.close();
 }
}

async function verifyTimedReunion(browser){
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const page=await context.newPage();page.setDefaultTimeout(10000);
 page.on('pageerror',error=>report.errors.push({width:390,message:error.message}));
 await page.route('**/api/**',route=>{
  const request=route.request();report.api.push({width:390,path:new URL(request.url()).pathname,method:request.method()});
  return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'FIXTURE_ONLY',message:'Real APIs blocked'})});
 });
 // Use the real event loop here: fake clocks can lose iframe intervals on reload.
 // Only the existing 60-second refresh interval is accelerated in this context.
 await page.addInitScript(()=>{
  const interval=window.setInterval;
  window.setInterval=function(fn,delay,...args){return interval.call(this,fn,delay===60000?300:delay,...args)};
  if(window!==window.top)return;
  window.__nestFixtureBootstraps=0;
  Object.defineProperty(window,'xcwcGuestOperation',{configurable:true,set(original){
   Object.defineProperty(window,'xcwcGuestOperation',{configurable:true,value:async(...args)=>{
    if(args[0]==='bootstrap')window.__nestFixtureBootstraps++;
    return original(...args);
   }});
  }});
 });
 try{
  await page.goto(base+'/?page=home');
  await page.waitForFunction(()=>!!window.xcwcGuest);
  await page.evaluate(({key,first,name})=>{localStorage.removeItem(key);window.xcwcGuest.adopt(first,name)},{key,first,name:names[0]});
  await page.reload();
  const frame=page.frameLocator('iframe'),nest=frame.locator('#xcwc-nest');
  await nest.locator('#name').filter({hasText:names[0]}).waitFor();
  // Finish the initial entry before changing mood; a normal timer refresh must
  // not be confused with a still-pending initial reunion under parallel QA load.
  await page.waitForFunction(()=>window.__nestFixtureBootstraps>=2);
  const before=await page.evaluate(()=>window.__nestFixtureBootstraps);
  await page.evaluate(key=>{
   const state=JSON.parse(localStorage.getItem(key));state.birds[0].mood=20;
   localStorage.setItem(key,JSON.stringify(state));
  },key);
  await nest.locator('#mood').filter({hasText:'20%'}).waitFor();
  await nest.locator('.actor img[data-emotion=unwell]').waitFor();
  assert((await page.evaluate(()=>window.__nestFixtureBootstraps))>before,'no periodic refresh was observed');
  assert.equal(await page.evaluate(()=>window.xcwcGuest.read().birds[0].cryShownDate),null,'ordinary refresh consumed the reunion feedback');
  await frame.locator('body').evaluate(()=>{
   Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.__nestFixtureHidden});
   window.__nestFixtureHidden=true;document.dispatchEvent(new Event('visibilitychange'));
   window.__nestFixtureHidden=false;document.dispatchEvent(new Event('visibilitychange'));
  });
  await nest.locator('.actor img[data-emotion=crying]').waitFor();
  const state=await page.evaluate(()=>window.xcwcGuest.snapshot());
  assert.equal(state.birds[0].cryShownDate,state.wallet.date);
  report.checks.push({width:390,name:'ordinary timer refresh is quiet; a simulated return to foreground triggers reunion',passed:true,visibility:'synthetic event, not device proof',refreshInterval:'test-only acceleration from 60000ms to 300ms'});
 }finally{await context.close()}
}

async function verifyDelayedReads(browser){
 const newFixturePage=async()=>{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage();page.setDefaultTimeout(10000);
  page.on('pageerror',error=>report.errors.push({width:390,message:error.message}));
  await page.route('**/api/**',route=>{
   const request=route.request();report.api.push({width:390,path:new URL(request.url()).pathname,method:request.method()});
   return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'FIXTURE_ONLY',message:'Real APIs blocked'})});
  });
  return{context,page,nest:page.frameLocator('iframe').locator('#xcwc-nest')};
 };
 const bootstrap=await newFixturePage();
 try{
  const {page,nest}=bootstrap;
  await page.addInitScript(()=>{
   if(window!==window.top)return;
   Object.defineProperty(window,'xcwcGuestOperation',{configurable:true,set(original){
    Object.defineProperty(window,'xcwcGuestOperation',{configurable:true,value:async(...args)=>{
     if(args[0]==='bootstrap')await new Promise(resolve=>setTimeout(resolve,1800));
     return original(...args);
    }});
   }});
  });
  await page.goto(base+'/?page=home');
  await page.waitForFunction(()=>!!window.xcwcGuest);
  await page.evaluate(({key,first,name})=>{
   localStorage.removeItem(key);window.xcwcGuest.adopt(first,name);
  },{key,first,name:names[0]});
  await page.reload();
  await nest.locator('[data-action=water]').waitFor();
  assert.notEqual(await nest.locator('#name').innerText(),names[0],'bootstrap was not delayed for the cold-click fixture');
  await nest.locator('[data-action=water]').click({force:true});
  await nest.locator('#name').filter({hasText:names[0]}).waitFor();
  assert.equal(await nest.locator('#hunger').innerText(),'60%');
  assert.equal(await nest.locator('#water').innerText(),'60%');
  report.checks.push({width:390,name:'early care click does not strand a delayed initial bootstrap',passed:true});

  await page.reload();
  await nest.locator('[data-action=water]').waitFor();
  assert.notEqual(await nest.locator('#name').innerText(),names[0],'bootstrap was not delayed for the cold-visibility fixture');
  await page.frameLocator('iframe').locator('body').evaluate(()=>{
   Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.__nestFixtureHidden});
   window.__nestFixtureHidden=true;document.dispatchEvent(new Event('visibilitychange'));
   window.__nestFixtureHidden=false;document.dispatchEvent(new Event('visibilitychange'));
  });
  await nest.locator('#name').filter({hasText:names[0]}).waitFor();
  assert.equal(await nest.locator('#mood').innerText(),'80%');
  report.checks.push({width:390,name:'return to foreground can restart a delayed initial bootstrap',passed:true,visibility:'synthetic event, not device proof'});
 }finally{await bootstrap.context.close()}

 const reunion=await newFixturePage();
 try{
  const {page,nest}=reunion;
  await page.addInitScript(id=>{
   if(window!==window.top)return;
   Object.defineProperty(window,'xcwcGuestOperation',{configurable:true,set(original){
    Object.defineProperty(window,'xcwcGuestOperation',{configurable:true,value:async(...args)=>{
     if(args[0]==='care'&&args[1]?.action==='enter'&&args[1]?.birdId===id){
      window.__nestDelayedEntryStarted=true;
      await new Promise(resolve=>setTimeout(resolve,1800));
     }
     return original(...args);
    }});
   }});
  },first.id);
  await page.goto(base+'/?page=home');
  await page.waitForFunction(()=>!!window.xcwcGuest);
  await page.evaluate(({key,first,second,names})=>{
   localStorage.removeItem(key);window.xcwcGuest.adopt(first,names[0]);window.xcwcGuest.adopt(second,names[1]);window.xcwcGuest.select(first.id);
   const state=JSON.parse(localStorage.getItem(key));for(const bird of state.birds)bird.mood=20;
   localStorage.setItem(key,JSON.stringify(state));
  },{key,first,second,names});
  await page.reload();
  await page.waitForFunction(()=>window.__nestDelayedEntryStarted===true);
  await nest.locator('#name').filter({hasText:names[0]}).waitFor();
  await nest.locator('[data-action=switch]').first().click();
  await nest.locator('.bird-choice').filter({hasText:names[1]}).click();
  await nest.locator('#name').filter({hasText:names[1]}).waitFor();
  await nest.locator('.actor img[data-emotion=crying]').waitFor();
  await page.waitForTimeout(1900);
  assert.equal(await nest.locator('#name').innerText(),names[1]);
  assert.equal(await nest.locator('.actor img').getAttribute('data-emotion'),'crying');
  const state=await page.evaluate(()=>window.xcwcGuest.snapshot());
  assert.equal(state.birds.find(b=>b.id===second.id).cryShownDate,state.wallet.date);
  report.checks.push({width:390,name:'delayed reunion for one bird does not block or overwrite the next bird',passed:true});
 }finally{await reunion.context.close()}

 const saving=await newFixturePage();
 try{
  const {page,nest}=saving;
  await page.addInitScript(id=>{
   if(window!==window.top)return;
   Object.defineProperty(window,'xcwcGuestOperation',{configurable:true,set(original){
    Object.defineProperty(window,'xcwcGuestOperation',{configurable:true,value:async(...args)=>{
     if(args[0]==='care'&&args[1]?.action==='enter'&&args[1]?.birdId===id){
      window.__nestFixtureEntryPending=true;
      await new Promise(resolve=>setTimeout(resolve,900));
     }
     if(args[0]==='pet'){
      window.__nestFixturePetPending=true;
      await new Promise(resolve=>setTimeout(resolve,2100));
      window.__nestFixturePetPending=false;
     }
     return original(...args);
    }});
   }});
  },second.id);
  await page.goto(base+'/?page=home');
  await page.waitForFunction(()=>!!window.xcwcGuest);
  await page.evaluate(({key,first,second,names})=>{
   localStorage.removeItem(key);window.xcwcGuest.adopt(first,names[0]);window.xcwcGuest.adopt(second,names[1]);window.xcwcGuest.select(first.id);
   const state=JSON.parse(localStorage.getItem(key));state.birds.find(b=>b.id===second.id).mood=20;
   localStorage.setItem(key,JSON.stringify(state));
  },{key,first,second,names});
  await page.reload();
  await nest.locator('#name').filter({hasText:names[0]}).waitFor();
  await nest.locator('[data-action=switch]').first().click();
  await nest.locator('.bird-choice').filter({hasText:names[1]}).click();
  await page.waitForFunction(()=>window.__nestFixtureEntryPending===true);
  await nest.locator('#bird').click({force:true});
  await page.waitForFunction(()=>window.__nestFixturePetPending===true);
  await page.waitForTimeout(1150);
  await nest.locator('.tools [data-action=clean]').click({force:true});
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>window.__nestFixturePetPending),true);
  assert.equal(await page.evaluate(id=>!!window.xcwcGuest.read().birds.find(b=>b.id===id).cleanedAt,second.id),false,'switch completion released the active pet save lock');
  await page.waitForFunction(()=>window.__nestFixturePetPending===false);
  await nest.locator('.actor img[data-emotion=shy]').waitFor();
  await page.waitForTimeout(150);
  await nest.locator('.tools [data-action=clean]').click({force:true});
  await page.waitForFunction(id=>!!window.xcwcGuest.read().birds.find(b=>b.id===id).cleanedAt,second.id);
  report.checks.push({width:390,name:'reunion completion cannot unlock a pending pet save, and the lock later releases',passed:true});
 }finally{await saving.context.close()}
}

(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  for(const width of [390,320])await verifyWidth(browser,width);
  await verifyTimedReunion(browser);
  await verifyDelayedReads(browser);
  assert.deepEqual(report.errors,[]);
  assert(report.api.every(request=>request.method==='GET'&&request.path==='/api/checkin-catalog'),'unexpected API request, all API traffic was blocked by the fixture');
  report.passed=true;
  console.log(JSON.stringify(report,null,2));
 }catch(error){
  report.error=error.stack;
  throw error;
 }finally{
  fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(report,null,2)+'\n','utf8');
  await browser.close();
 }
})().catch(error=>{console.error(error);process.exitCode=1});
