const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium,launchOptions}=require('./browser-runtime.cjs');
const oldWorker=`const OLD='suixin-test-old';self.addEventListener('install',e=>e.waitUntil(caches.open(OLD).then(async c=>{await c.put('./',new Response('<html><body>OLD APP WITHOUT SOLO PET</body></html>',{headers:{'Content-Type':'text/html'}}));await c.put('./bootstrap.js',new Response('window.oldBundle=true',{headers:{'Content-Type':'text/javascript'}}));}).then(()=>self.skipWaiting())));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).pathname.startsWith('/api/'))return;e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request)));});`;
const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/__test_old_worker.js'){res.setHeader('Content-Type','text/javascript');return res.end(oldWorker);}
  const file=path.join(__dirname,pathname==='/'?'index.html':pathname.slice(1));
  if(!file.startsWith(__dirname+path.sep)){res.writeHead(403);return res.end();}
  fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);return res.end();}res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(data);});
});
(async()=>{let browser;try{
  await new Promise(resolve=>server.listen(8084,'127.0.0.1',resolve));
  browser=await chromium.launch(launchOptions());
  const context=await browser.newContext({viewport:{width:390,height:844}});const page=await context.newPage();
  await page.goto('http://127.0.0.1:8084/privacy.html');
  await page.evaluate(async()=>{localStorage.setItem('soloPet',JSON.stringify({adopted:true,name:'保留的小宠物',personality:'gentle'}));localStorage.setItem('todayHistory',JSON.stringify([{id:'kept',text:'原有记录',note:'不清除数据',completed:true}]));await navigator.serviceWorker.register('./__test_old_worker.js');await navigator.serviceWorker.ready;});
  await page.waitForFunction(()=>navigator.serviceWorker.controller);await page.goto('http://127.0.0.1:8084/');assert.match(await page.locator('body').innerText(),/OLD APP/);
  await page.goto('http://127.0.0.1:8084/open-pet.html');await page.locator('#soloPetDialog[open]').waitFor();assert.equal(await page.locator('#soloPetName').inputValue(),'保留的小宠物');
  await page.waitForFunction(async()=>{const reg=await navigator.serviceWorker.getRegistration();return reg?.waiting?.scriptURL.endsWith('/sw.js')||navigator.serviceWorker.controller?.scriptURL.endsWith('/sw.js');});
  await page.evaluate(async()=>{const reg=await navigator.serviceWorker.getRegistration();reg.waiting?.postMessage({type:'SKIP_WAITING'});});
  await page.waitForFunction(()=>navigator.serviceWorker.controller?.scriptURL.endsWith('/sw.js'));await page.locator('#soloPetDialog[open]').waitFor();
  await context.setOffline(true);await page.goto('http://127.0.0.1:8084/?view=solo&v=18');await page.locator('#soloPetDialog[open]').waitFor();
  assert.equal(await page.locator('#soloPetName').inputValue(),'保留的小宠物');assert.equal(await page.evaluate(()=>history.length),1);
  console.log('PASS: old cached app → direct pet entry → new worker → offline versioned assets; existing pet and record retained.');
}finally{if(browser)await browser.close();server.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
