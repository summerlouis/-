(() => {
 const pendingPrefix='baoPendingOrder:'+(window.BaoRuntime?.storeId?BaoRuntime.storeId+':'+BaoRuntime.sessionId+':':'');
 const cloud=BaoCatalog.cloud,cacheKey='baoCloudOrdersCache',legacyKey='baoDumplingOrders';
 const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'null')??fallback}catch{return fallback}};
 let state={orders:[],closures:[]},inflight=null,ready=false,etag='';
 const announce=()=>window.dispatchEvent(new Event('bao-orders-change'));
 const status=(message,failed=false)=>document.querySelectorAll('[data-orders-status]').forEach(el=>{el.textContent=message;el.classList.toggle('sync-error',failed)});
 function apply(data){const changed=JSON.stringify(state)!==JSON.stringify(data);state=data;ready=true;if(changed)announce()}
 async function request(method,body){
  let res;try{res=await fetch('/api/orders',{method,cache:'no-store',headers:body?{'Content-Type':'application/json'}:etag?{'If-None-Match':etag}:undefined,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(12000)})}catch{throw Error((document.body.dataset.page||'self')==='self'?'连接中断，请恢复网络后重试。未确认的订单和购物车会保留，请勿重复下单。':'连接中断，购物车已保留。请恢复网络后重试，不要重复收款。')}
  if(res.status===304)return state;
  if(method==='GET'&&res.ok)etag=res.headers.get('etag')||'';
  const data=await res.json();if(!res.ok){const error=Error(data.error||'保存失败，请重试');error.status=res.status;throw error}return data;
 }
 async function refresh(){if(!cloud){state={orders:read(legacyKey,[]),closures:[]};ready=true;return true}if(inflight)return inflight;
  inflight=(async()=>{try{apply(await request('GET'));status('订单与厨房已同步 · '+new Date().toLocaleTimeString());return true}catch(error){status(error.message,true);return false}finally{inflight=null}})();return inflight;
 }
 async function submit(order){
  if(!cloud){const all=read(legacyKey,[]);all.push(order);localStorage.setItem(legacyKey,JSON.stringify(all));state.orders=all;announce();return order}
  const key=pendingPrefix+order.source;
  const pending=read(key,null)||order;localStorage.setItem(key,JSON.stringify(pending));
  try{const data=await request('POST',{order:pending,timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone});localStorage.removeItem(key);state.orders=state.orders.filter(o=>o.id!==data.order.id).concat(data.order);announce();await refresh();return data.order}
  catch(error){if(error.status&&error.status<500)localStorage.removeItem(key);if(error.status===409)await BaoCatalog.refresh();status(error.message,true);throw error}
 }
 async function change(id,action,next,details={}){
  if(!await refresh())throw Error('无法读取最新订单，请联网后重试');
  const order=state.orders.find(o=>o.id===id);if(!order)throw Error('订单不存在');
  try{const data=await request('PATCH',{...details,id,revision:order.revision,action,next,timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone});state.orders=state.orders.map(o=>o.id===id?data.order:o);announce();return data.order}finally{await refresh()}
 }
 async function close(month){await request('POST',{action:'close',month});await refresh()}
 async function importOrders(records){
  let imported=0,duplicates=0;const failed=[];
  for(const original of records){try{
   const fingerprint=JSON.stringify([original.id,original.day,original.dateKey,original.time,original.items]);
   const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(fingerprint)))).slice(0,12).map(n=>n.toString(16).padStart(2,'0')).join('');
   const data=await request('POST',{action:'import',order:{...original,id:original.revision?original.id:'LEGACY-'+hash}});if(data.duplicate)duplicates++;else imported++;
  }catch(error){failed.push(String(original.id||'未知订单')+': '+error.message)}}
  await refresh();return {imported,duplicates,failed};
 }
 function download(name,content,type='application/json'){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
 window.BaoOrders={all:()=>state.orders.map(o=>({...o,day:o.dateKey?new Date(o.dateKey+'T12:00:00').toDateString():o.day})),closures:()=>state.closures,refresh,submit,change,close,importOrders,download,legacy:()=>read(legacyKey,[]),pending:source=>read(pendingPrefix+source,null),ready:()=>ready};
 window.addEventListener('DOMContentLoaded',()=>{const target=document.querySelector('[data-catalog-status]')||document.querySelector('header');if(target){const el=document.createElement('p');el.className='sync-status';el.dataset.ordersStatus='';el.setAttribute('role','status');target.after(el)}status('正在读取订单…');refresh()});
 window.addEventListener('focus',refresh);window.addEventListener('online',refresh);window.addEventListener('offline',()=>status('网络已断开：请恢复网络后再提交；购物车会保留。',true));
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
 if(cloud)setInterval(()=>{if(!document.hidden)refresh()},window.BaoRuntime?.events?10000:2500);
})();
