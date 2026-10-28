const {chromium}=require(process.env.BAO_PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=process.env.BAO_TEST_URL||'http://127.0.0.1:5173',root=path.resolve(__dirname,'..');
const vars=fs.readFileSync(path.join(root,'.dev.vars'),'utf8');
const cloudSecrets=process.env.BAO_CLOUD_TEST==='1'?JSON.parse(fs.readFileSync(path.join(root,'.dev.vars.cloud.json'),'utf8')):null;
const secret=name=>cloudSecrets?cloudSecrets[name]:vars.match(new RegExp('^'+name+'=([^\\r\\n]+)','m'))[1];
const out=path.join(root,'.wrangler/qa');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const errors=[],frames={};
 try{
  async function open(name,url,code,width){
   const context=await browser.newContext({viewport:{width,height:900}});
   if(code){const r=await context.request.post(base+'/api/device-session',{data:{code:secret(code)}});assert.equal(r.status(),200,await r.text())}
   const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(name+': '+e.message));page.on('dialog',d=>d.accept());frames[name]=[];
   page.on('websocket',ws=>ws.on('framereceived',({payload})=>frames[name].push(String(payload))));
   // Prove push works with both catalog and order polling disabled.
   await page.addInitScript(()=>{const interval=window.setInterval;window.setInterval=(fn,delay,...args)=>[2000,2500,10000].includes(delay)?0:interval(fn,delay,...args)});
   await page.goto(base+url);await page.waitForFunction(()=>window.BaoOrders?.ready());
   await page.waitForFunction(()=>document.querySelector('#realtime-status')?.textContent==='即时同步已连接');
   return {page,context};
  }
  const self=await open('self','/?table=05',null,390),kitchen=await open('kitchen','/kitchen','KITCHEN_DEVICE_CODE',1024),pos=await open('pos','/pos','CASHIER_DEVICE_CODE',1440),admin=await open('admin','/admin','ADMIN_DEVICE_CODE',1280);
  const request=async(device,method,url,data,headers)=>{const r=await device.context.request.fetch(base+url,{method,...(data?{data}:{}),...(headers?{headers}:{})});const raw=await r.text();if(!raw.startsWith('{'))throw Error(method+' '+url+' '+r.status()+' '+raw);return {status:r.status(),body:JSON.parse(raw)}};
  assert.equal(await self.page.locator('#table-number').inputValue(),'05');
  await self.page.locator('.product-card[data-code="C1"]').click();await self.page.locator('#choice-qty').fill('2');await self.page.locator('#choice-add').click();
  await self.page.locator('#pay-button').click();await self.page.locator('[data-method]').click();
  await self.page.locator('#receipt-dialog[open]').waitFor();
  const order=await self.page.evaluate(()=>BaoOrders.all().findLast(o=>o.source==='self'));
  assert.equal(order.tableNumber,'05');assert.equal(order.total,7);assert.equal(order.totalCents,700);assert.equal(order.status,'pending');assert.equal(order.paidTotal,0);assert.equal(order.isTest,true);
  await pos.page.locator('[data-live-order="'+order.id+'"]').waitFor();
  await self.page.locator('#mock-pay-receipt').click();
  await kitchen.page.locator('[data-id="'+order.id+'"][data-next="making"]').waitFor();
  await pos.page.waitForFunction(id=>document.querySelector('[data-live-order="'+id+'"]').textContent.includes('待制作'),order.id);
  assert.ok((await kitchen.page.locator('.ticket').filter({has:kitchen.page.locator('[data-id="'+order.id+'"]')}).innerText()).includes('05 桌'));
  assert.ok(frames.kitchen.some(s=>s.includes('orders')),'received WebSocket event');
  for(const [next,label] of [['making','制作中'],['ready','可以取餐'],['complete','已取餐']]){
   await kitchen.page.locator('[data-id="'+order.id+'"][data-next="'+next+'"]').click();
   await self.page.waitForFunction(label=>document.querySelector('#receipt-title').textContent.includes(label),label);
   await pos.page.waitForFunction(({id,next})=>BaoOrders.all().find(o=>o.id===id)?.kitchenStatus===next,{id:order.id,next});
  }
  const final=(await request(self,'GET','/api/orders')).body.orders.find(o=>o.id===order.id);
  assert.equal(final.status,'done');assert.equal(final.paidTotal,0);assert.equal(final.simulatedTotal,7);
  assert.equal((await request(self,'PATCH','/api/orders',{id:order.id,revision:1,action:'mock-pay'})).status,200,'mock pay retries are idempotent');
  assert.equal((await request(kitchen,'PATCH','/api/orders',{id:order.id,revision:final.revision,action:'pay',payment:'现金'})).status,403);
  const other=await open('other','/',null,390);
  assert.equal((await request(other,'GET','/api/orders')).body.orders.length,0,'customers isolated');
  assert.equal((await request(other,'PATCH','/api/orders',{id:order.id,revision:1,action:'mock-pay'})).status,404);
  assert.equal((await request(other,'PATCH','/api/catalog',{code:'C1',price:1,revision:0},{'oai-authenticated-user-id':'store:bao-local-test','x-bao-role':'admin'})).status,403,'spoofed identity rejected');
  const draft={id:'QA-'+crypto.randomUUID(),source:'self',service:'堂食',tableNumber:'09',items:[{code:'C1',price:3.5,qty:1}]};
  assert.equal((await request(self,'POST','/api/orders',{order:{...draft,tableNumber:''}})).status,400,'table required');
  assert.equal((await request(self,'POST','/api/orders',{order:{...draft,total:0,items:[{code:'C1',price:0,qty:1}]}})).status,409,'server validates price');
  const [first,second]=await Promise.all([request(self,'POST','/api/orders',{order:draft}),request(self,'POST','/api/orders',{order:draft})]);
  assert.equal(first.status,200);assert.equal(second.status,200);assert.equal(first.body.order.pickupNumber,second.body.order.pickupNumber);
  assert.equal((await request(self,'POST','/api/orders',{order:{...draft,id:'X-'+crypto.randomUUID()}},{origin:'https://wrong.example'})).status,403);
  await pos.page.locator('#table-number').fill('08');await pos.page.locator('#pos-catalog [data-code="C2"]').click();await pos.page.locator('#pay-pos').click();
  await pos.page.waitForFunction(()=>BaoOrders.all().some(o=>o.source==='pos'&&o.tableNumber==='08'));
  const posOrder=await pos.page.evaluate(()=>BaoOrders.all().findLast(o=>o.source==='pos'&&o.tableNumber==='08'));
  assert.equal(posOrder.paidTotal,0);assert.equal(posOrder.payment,'模拟付款');
  await kitchen.page.locator('[data-id="'+posOrder.id+'"]').waitFor();
  // Disconnect/reconnect and read the latest durable state.
  await self.context.setOffline(true);await self.context.setOffline(false);await self.page.reload();await self.page.waitForFunction(()=>BaoOrders.ready());
  await self.page.locator('#last-order-button').click();await self.page.waitForFunction(()=>document.querySelector('#receipt-title').textContent.includes('已取餐'));
  await admin.page.waitForFunction(()=>BaoOrders.all().length>=3);
  assert.equal(await admin.page.locator('#admin-net').innerText(),'0,00 €','mock orders excluded from revenue');
  const row=await admin.page.evaluate(()=>BaoCatalog.get('C3'));
  assert.equal((await request(admin,'PATCH','/api/catalog',{code:'C3',price:4.25,revision:row.revision})).status,200);
  await self.page.waitForFunction(()=>BaoCatalog.get('C3').price===4.25);await pos.page.waitForFunction(()=>BaoCatalog.get('C3').price===4.25);
  // Restore the test catalog price to its original value.
  const current=(await request(admin,'GET','/api/catalog')).body.products.find(p=>p.code==='C3');
  await request(admin,'PATCH','/api/catalog',{code:'C3',price:row.price,revision:current.revision});
  await self.page.waitForFunction(price=>BaoCatalog.get('C3').price===price,row.price);
  const code='T'+Date.now().toString(36).toUpperCase();
  const upload=await admin.context.request.post(base+'/api/product-images',{multipart:{file:{name:'desktop-photo.png',mimeType:'image/png',buffer:fs.readFileSync(path.join(root,'public/bao-pork.png'))}}});
  const noImages=await self.page.evaluate(()=>BaoRuntime.imageUploads===false);
  assert.equal(upload.status(),noImages?503:201);const photo=noImages?{}:await upload.json();
  assert.equal((await request(admin,'POST','/api/catalog',{code,category:'其他',dish:'三端实物图测试',fr:'Photo test',price:6.25,active:true,imageId:photo.imageId})).status,201);
  await self.page.waitForFunction(code=>BaoCatalog.get(code)?.active,code);await pos.page.waitForFunction(code=>BaoCatalog.get(code)?.active,code);
  if(!noImages)assert.equal((await self.context.request.get(base+photo.imageUrl)).status(),200);
  else {assert.equal(await admin.page.locator('#new-product-image').isDisabled(),true);assert.equal((await self.context.request.get(base+'/bao-pork.png')).status(),200);}
  const product=(await request(admin,'GET','/api/catalog')).body.products.find(p=>p.code===code);
  assert.equal((await request(admin,'DELETE','/api/catalog',{code,revision:product.revision})).status,200);
  await self.page.waitForFunction(code=>!BaoCatalog.get(code)?.active,code);
  await pos.page.waitForFunction(code=>!BaoCatalog.get(code)?.active,code);
  for(const [name,device] of [['customer',self],['kitchen',kitchen],['pos',pos]])await device.page.screenshot({path:path.join(out,name+'.png'),fullPage:true});
  assert.equal(await self.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'mobile layout has no horizontal overflow');
  assert.deepEqual(errors,[],'no page JavaScript errors');
  console.log('PASS: WebSocket-only three-terminal flow; table/amount/status; zero real revenue; idempotency; server price validation; role/customer isolation; reconnect/reload; catalog push; mobile layout.');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
