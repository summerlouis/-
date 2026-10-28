import { env } from 'cloudflare:workers';
import { catalog } from '../../../lib/catalog';
import { orderAccess, notifyOrders } from '../../../lib/order-access';
export const dynamic='force-dynamic';
type Row={sequence:number,order_id:string,month:string,body:string,revision:number};
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const decode=(r:Row)=>({...JSON.parse(r.body),id:r.order_id,revision:r.revision,pickupNumber:String(r.sequence).padStart(4,'0')});
const text=(v:unknown,max=160)=>typeof v==='string'?v.slice(0,max):'';
async function row(user:string,id:string){return env.DB!.prepare('SELECT * FROM sales WHERE user_id=? AND order_id=?').bind(user,id).first<Row>()}
function identity(req:Request){return req.headers.get('oai-authenticated-user-id')}
function badOrigin(req:Request){const origin=req.headers.get('origin');return origin&&origin!==new URL(req.url).origin}
function localTime(value:unknown,now=new Date()){
 let zone=text(value)||'UTC';try{new Intl.DateTimeFormat('en-CA',{timeZone:zone}).format(now)}catch{zone='UTC'}
 return {dateKey:new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now),time:new Intl.DateTimeFormat('fr-FR',{timeZone:zone,hour:'2-digit',minute:'2-digit'}).format(now)};
}
export async function GET(req:Request){
 const user=identity(req);if(!user)return json({error:'请先登录'},401);
 const access=orderAccess(req);
 if(access.role==='customer'){
  if(!access.customerId)return json({error:'请重新打开点餐页面'},401);
  const rows=await env.DB!.prepare("SELECT * FROM sales WHERE user_id=? AND json_extract(body,'$.customerId')=? ORDER BY sequence").bind(user,access.customerId).all<Row>();
  return json({orders:rows.results.map(decode),closures:[]});
 }
 const counts=await env.DB!.prepare('SELECT COUNT(*) AS count,COALESCE(MAX(sequence),0) AS last,COALESCE(SUM(revision),0) AS revision,(SELECT COUNT(*) FROM sales_closures WHERE user_id=?) AS closed FROM sales WHERE user_id=?').bind(user,user).first();
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(user+JSON.stringify(counts)));
 const etag='"'+Array.from(new Uint8Array(digest)).map(n=>n.toString(16).padStart(2,'0')).join('')+'"';
 if(req.headers.get('if-none-match')===etag)return new Response(null,{status:304,headers:{ETag:etag,'Cache-Control':'private, no-cache'}});
 const [rows,closed]=await Promise.all([env.DB!.prepare('SELECT * FROM sales WHERE user_id=? ORDER BY sequence').bind(user).all<Row>(),env.DB!.prepare('SELECT month,closed_at FROM sales_closures WHERE user_id=? ORDER BY month').bind(user).all<{month:string,closed_at:string}>()]);
 return Response.json({orders:rows.results.map(decode),closures:closed.results},{headers:{ETag:etag,'Cache-Control':'private, no-cache'}});
}
export async function POST(req:Request){
 const user=identity(req);if(!user)return json({error:'请先登录'},401);if(badOrigin(req))return json({error:'请求来源无效'},403);
 let data: Record<string, any>;try{data=await req.json() as Record<string, any>}catch{return json({error:'请求格式不正确'},400)}
 const access=orderAccess(req);
 if(access.role==='kitchen'||(data.action&&access.role!=='admin'))return json({error:'此设备无权执行该操作'},403);
 if(access.role==='customer'&&(data.order?.source!=='self'||!access.customerId))return json({error:'顾客只能提交自己的点餐订单'},403);
 if(access.mock&&data.action==='import')return json({error:'模拟环境不导入真实营业订单'},403);
 if(data?.action==='close'){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(data.month))return json({error:'月份无效'},400);
  // Close only finished months; new orders must remain possible this month.
  if(data.month>=new Date().toISOString().slice(0,7))return json({error:'只能归档已结束的月份'},400);
  const pending=await env.DB!.prepare("SELECT order_id FROM sales WHERE user_id=? AND month=? AND json_extract(body,'$.status')='pending' LIMIT 1").bind(user,data.month).first();
  if(pending)return json({error:'该月份还有待付款订单，请先收款或作废后再归档'},409);
  await env.DB!.prepare('INSERT INTO sales_closures (user_id,month,closed_at) VALUES (?,?,?) ON CONFLICT DO NOTHING').bind(user,data.month,new Date().toISOString()).run();
  return json({ok:true});
 }
 const draft=data?.order;
 if(!draft||typeof draft.id!=='string'||draft.id.length>100||!/^[-A-Za-z0-9_:]+$/.test(draft.id))return json({error:'订单编号无效'},400);
 const existing=await row(user,draft.id);if(existing){const saved=decode(existing);if(access.role==='customer'&&saved.customerId!==access.customerId)return json({error:'订单编号已被使用'},409);return json({order:saved,duplicate:true})}
 if(!Array.isArray(draft.items)||!draft.items.length||draft.items.length>100)return json({error:'订单需包含 1 至 100 行商品'},400);
 const importing=data.action==='import';
 if(!importing&&!access.mock&&draft.source!=='self'&&!['现金','银行卡','二维码'].includes(draft.payment))return json({error:'请选择实际收款方式'},400);
 const tableNumber=draft.service==='打包'?'':text(draft.tableNumber,100).trim();
 if((access.mock&&draft.service!=='打包'&&!tableNumber)||(tableNumber&&!/^[\p{L}\p{N} -]{1,20}$/u.test(tableNumber)))return json({error:'堂食请填写桌号（1 至 20 位文字或数字）'},400);
 const available=await catalog(user);
 const items=[];
 for(const item of draft.items){
  if(!item||typeof item!=='object')return json({error:'商品格式无效'},400);
  const product=available.find(p=>p.code===item.code);
  if(!product||!Number.isInteger(Number(item.qty??1))||Number(item.qty??1)<1||Number(item.qty??1)>999)return json({error:'商品或数量无效'},400);
  const price=product.price;
  if(!importing&&!product.active)return json({error:product.dish+' 已下架，请核对购物车'},409);
  const incoming=Number(item.price);
  if(!Number.isFinite(incoming)||incoming<0||incoming>99999.99)return json({error:'商品价格无效'},400);
  if(!importing&&Math.round(incoming*100)!==Math.round(price*100))return json({error:'价格已更新，请核对新金额后再次确认'},409);
  items.push({...product,price:importing?Math.round(incoming*100)/100:price,qty:Number(item.qty??1),filling:text(item.filling),fillingFr:text(item.fillingFr),style:text(item.style),styleFr:text(item.styleFr)});
 }
 const now=new Date();let zone=text(data.timeZone)||'UTC';try{new Intl.DateTimeFormat('en-CA',{timeZone:zone}).format(now)}catch{zone='UTC'}
 const dateKey=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 let originalDate=typeof draft.dateKey==='string'?draft.dateKey:'';
 if(importing&&!/^\d{4}-\d{2}-\d{2}$/.test(originalDate)){const d=new Date(draft.day);if(Number.isNaN(d.getTime()))return json({error:'旧订单日期无法识别，请检查后再导入'},400);originalDate=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
 if(importing){const parsed=new Date(originalDate+'T00:00:00Z');if(Number.isNaN(parsed.getTime())||parsed.toISOString().slice(0,10)!==originalDate)return json({error:'旧订单日期无效'},400)}
 const total=items.reduce((sum,i)=>sum+Math.round(i.price*100)*i.qty,0)/100;
 const order={id:draft.id,items,total,paidTotal:total,status:importing&&['paid','done','cancelled','voided','pending'].includes(draft.status)?draft.status:'paid',payment:text(draft.payment,40),source:draft.source==='self'?'self':'pos',service:draft.service==='打包'?'打包':'堂食',kitchenStatus:importing?'complete':'new',dateKey:importing?originalDate:dateKey,month:(importing?originalDate:dateKey).slice(0,7),time:importing?text(draft.time,20):new Intl.DateTimeFormat('fr-FR',{timeZone:zone,hour:'2-digit',minute:'2-digit'}).format(now),createdAt:now.toISOString(),history:[{time:now.toISOString(),action:importing?'导入旧订单':'创建订单'}],imported:importing,refundAmount:0};
 if(!importing&&order.source==='self'){
  order.status='pending';order.paidTotal=0;order.payment='待付款';order.kitchenStatus='awaiting_payment';order.history[0].action='提交自助订单，待柜台付款';
 }
 Object.assign(order,{tableNumber,totalCents:Math.round(total*100),customerId:access.customerId,isTest:access.mock,paymentMode:access.mock?'mock':'manual'});
 if(access.mock){order.payment=order.source==='self'?'待模拟付款':'模拟付款';order.paidTotal=0;Object.assign(order,{simulatedTotal:order.source==='self'?0:total});order.history[0].action=order.source==='self'?'提交测试订单，待模拟付款':'POS 模拟付款，不扣款'}
 if(importing){const paid=Number(draft.paidTotal??total);if(!Number.isFinite(paid)||paid<0)return json({error:'旧订单金额无效'},400);order.paidTotal=paid;order.refundAmount=Number(draft.refundAmount)||0;Object.assign(order,{corrections:Array.isArray(draft.corrections)?draft.corrections.filter((c:{amount:unknown})=>Number.isFinite(Number(c.amount))):[]})}
 const result=await env.DB!.prepare('INSERT INTO sales (user_id,order_id,month,body,revision) SELECT ?,?,?,?,1 WHERE NOT EXISTS (SELECT 1 FROM sales_closures WHERE user_id=? AND month=?) ON CONFLICT(user_id,order_id) DO NOTHING').bind(user,order.id,order.month,JSON.stringify(order),user,order.month).run();
 const saved=await row(user,order.id);if(!saved)return json({error:'该月份已归档，不能加入订单'},409);
 if(access.role==='customer'&&decode(saved).customerId!==access.customerId)return json({error:'订单编号已被使用'},409);
 if(result.meta.changes)await notifyOrders(user,access.customerId);
 return json({order:decode(saved),duplicate:!result.meta.changes});
}
export async function PATCH(req:Request){
 const user=identity(req);if(!user)return json({error:'请先登录'},401);if(badOrigin(req))return json({error:'请求来源无效'},403);
 let data: Record<string, any>;try{data=await req.json() as Record<string, any>}catch{return json({error:'请求格式不正确'},400)}
 if(!data||typeof data.id!=='string'||!Number.isInteger(data.revision))return json({error:'请求格式不正确'},400);
 const access=orderAccess(req);
 if(access.role==='kitchen'&&data.action!=='kitchen')return json({error:'厨房设备只能更新制作状态'},403);
 if(access.role==='customer'&&data.action!=='mock-pay')return json({error:'顾客无权更改订单状态'},403);
 if(access.role==='cashier'&&['refund','void'].includes(data.action))return json({error:'作废或退款需要管理设备权限'},403);
 const current=await row(user,data.id);if(!current)return json({error:'订单不存在'},404);
 if(access.role==='customer'&&decode(current).customerId!==access.customerId)return json({error:'订单不存在'},404);
 if(data.action==='mock-pay'&&access.mock&&decode(current).paymentMode==='mock'&&['paid','done'].includes(decode(current).status))return json({order:decode(current),duplicate:true});
 if(current.revision!==data.revision)return json({error:'其他设备已更新此订单，请刷新后重试'},409);
 const order=decode(current),now=new Date().toISOString();let action='';
 if(data.action==='mock-pay'){
  if(!access.mock||order.paymentMode!=='mock')return json({error:'此环境未启用模拟付款'},403);
  if(order.status!=='pending')return json({error:'订单已作废或已处理'},409);
  const available=await catalog(user);
  if(order.items.some((item:{code:string})=>!available.find(p=>p.code===item.code)?.active))return json({error:'订单中有已下架商品，请联系店员作废后重新点单'},409);
  order.status='paid';order.paidTotal=0;order.simulatedTotal=order.total;order.payment='模拟付款';order.kitchenStatus='new';order.paidAt=now;action='模拟付款成功，不扣款、不计入营业收入';
 }else if(data.action==='pay'){
  if(access.mock||order.isTest)return json({error:'测试订单只能使用模拟付款'},403);
  if(order.status!=='pending')return json({error:'该订单已处理，请核对收款记录，不要重复收款'},409);
  if(!['现金','银行卡','二维码'].includes(data.payment))return json({error:'请选择实际收款方式'},400);
  const available=await catalog(user);
  if(order.items.some((item:{code:string})=>!available.find(p=>p.code===item.code)?.active))return json({error:'订单中有已下架或删除的商品，请先作废并重新点单'},409);
  const received=localTime(data.timeZone);
  order.orderedDateKey=order.dateKey;order.orderedTime=order.time;order.dateKey=received.dateKey;order.time=received.time;order.month=received.dateKey.slice(0,7);
  order.status='paid';order.paidTotal=order.total;order.payment=data.payment;order.kitchenStatus='new';order.paidAt=now;action='柜台确认收款 · '+data.payment;
 }else if(data.action==='kitchen'){
  const next:{[key:string]:string}={new:'making',making:'ready',ready:'complete'};
  if(!['paid','done'].includes(order.status)||next[order.kitchenStatus||'new']!==data.next)return json({error:'订单状态已变化'},409);
  order.kitchenStatus=data.next;action='厨房状态：'+data.next;
  if(data.next==='complete')order.status='done';
 }else if(data.action==='refund'||data.action==='void'){
  if(!['paid','done'].includes(order.status)&&!(data.action==='void'&&order.status==='pending'))return json({error:'该订单已取消、作废或尚未付款'},409);
  order.status=data.action==='refund'?'cancelled':'voided';order.refundAmount=Math.round((Number(order.paidTotal)+(order.corrections||[]).reduce((sum:number,c:{amount:number})=>sum+Number(c.amount||0),0))*100)/100;order.refundedAt=now;action=data.action==='refund'?'登记退款':'作废订单';
 }else return json({error:'不支持的操作'},400);
 order.history=[...(order.history||[]),{time:now,action}];
 const result=await env.DB!.prepare('UPDATE sales SET body=?,month=?,revision=revision+1 WHERE user_id=? AND order_id=? AND revision=? AND NOT EXISTS (SELECT 1 FROM sales_closures WHERE user_id=? AND month IN (?,?))').bind(JSON.stringify(order),order.month,user,data.id,data.revision,user,current.month,order.month).run();
 if(!result.meta.changes)return json({error:'订单已更新或月份已归档，请刷新后重试'},409);
 await notifyOrders(user,order.customerId||'');
 return json({order:decode((await row(user,data.id))!)});
}

