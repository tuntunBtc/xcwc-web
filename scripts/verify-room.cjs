const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const screenshotDir=process.env.BJD_SCREENSHOT_DIR;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const context=await browser.newContext({viewport:{width:390,height:844}});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8766/');const frame=page.frameLocator('iframe');await frame.locator('.pet-room').waitFor();
 assert.equal(await page.locator('iframe').getAttribute('sandbox'),'allow-scripts');
 await frame.locator('[data-room-action="open-food"]').click();await delay(350);
 const actorBox=await frame.locator('.room-actor').boundingBox(),trayBox=await frame.locator('.room-sheet').boundingBox();
 assert(actorBox.y+actorBox.height<=trayBox.y+2,'food tray covers bird');
 if(screenshotDir)await page.screenshot({path:screenshotDir+'/room-tray-final.png',fullPage:true});
 await frame.locator('[data-room-food="seed"]').evaluate(el=>{el.click();el.click();});
 await delay(2300);assert.equal(await frame.locator('[data-room-value="hunger"]').innerText(),'77%');
 assert.equal(await frame.locator('[data-room-food="seed"] .food-stock').innerText(),'×5');
 const berry=await frame.locator('[data-room-food="berry"]').boundingBox();const actor=await frame.locator('.room-actor').boundingBox();
 await page.mouse.move(berry.x+berry.width/2,berry.y+berry.height/2);await page.mouse.down();await page.mouse.move(actor.x+actor.width/2,actor.y+actor.height/2,{steps:12});await page.mouse.up();await delay(2300);
 assert.equal(await frame.locator('[data-room-value="hunger"]').innerText(),'95%');
 assert.equal(await frame.locator('[data-room-food="berry"] .food-stock').innerText(),'×3');
 await frame.locator('[data-room-food="meal"]').click();await delay(2300);
 assert.equal(await frame.locator('[data-room-value="hunger"]').innerText(),'100%');
 await frame.locator('[data-room-food="seed"]').click();await delay(100);
 assert.equal(await frame.locator('[data-room-food="seed"] .food-stock').innerText(),'×5');
 await frame.locator('[data-room-action="close-food"]').click();await frame.locator('[data-room-action="water"]').click();await delay(1800);
 assert.equal(await frame.locator('[data-room-value="water"]').innerText(),'98%');
 await frame.locator('.room-tool[data-room-action="clean"]').click();assert.equal(await frame.locator('.room-poop').count(),0);
 await frame.locator('.room-actor').click({clickCount:4,delay:90});assert.match(await frame.locator('#room-speech').innerText(),/轻一点/);
 for(const name of ['city','shop','profile']){await frame.locator('.bottom [data-go="'+name+'"]').click();assert((await frame.locator('main').innerText()).length>20);}
 await frame.locator('.bottom [data-go="home"]').click();await page.reload();await frame.locator('.pet-room').waitFor();
 assert.equal(await frame.locator('[data-room-value="hunger"]').innerText(),'100%');
 await frame.locator('[data-room-action="open-food"]').click();assert.equal(await frame.locator('[data-room-food="seed"] .food-stock').innerText(),'×5');
 await frame.locator('[data-room-action="close-food"]').click();
 for(const width of [320,390,430,1024]){await page.setViewportSize({width,height:1000});await delay(150);assert(!(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)),'outer overflow '+width);assert(!(await frame.locator('body').evaluate(()=>document.documentElement.scrollWidth>innerWidth)),'frame overflow '+width);}
 await page.setViewportSize({width:430,height:950});await delay(600);if(screenshotDir)await page.screenshot({path:screenshotDir+'/room-final.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,checks:['sandbox retained','click and drag feeding','no duplicate deductions','full hunger rejects food','water and cleanup','rapid touch response','existing navigation','reload persistence','320–1024px layouts'],errors},null,2));
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
