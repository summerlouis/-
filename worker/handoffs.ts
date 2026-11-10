import type {Session} from './device-session';
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}});
const cents=(v:any)=>Math.round(Number(v||0)*100);
export function summarize(rows:any[],day:string,zone:string){
 const date=(v:any)=>{if(!v||!Number.isFinite(Date.parse(v)))return '';return new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v))};
 const totals={cash:0,card:0,qr:0,other:0,cashRefund:0,cardRefund:0,qrRefund:0,otherRefund:0,simulated:0,simulatedRefund:0,realOrders:0,pending:0,legacy:0};
 const kind=(method:string)=>method==='现金'?'cash':method==='银行卡'?'card':method==='二维码'?'qr':'other';
 for(const row of rows){const o=JSON.parse(row.body),paidDate=date(o.paidAt||o.createdAt),refundDate=date(o.refundedAt||o.cancelledAt),mock=o.isTest||o.paymentMode==='mock';if(o.imported){if(o.dateKey===day)totals.legacy++;continue}if(o.status==='pending'&&date(o.createdAt)===day)totals.pending++;
 if(mock){if(paidDate===day)totals.simulated+=cents(o.simulatedTotal);if(refundDate===day&&['cancelled','voided'].includes(o.status))totals.simulatedRefund+=cents(o.simulatedTotal);continue}
 if(paidDate===day&&Number(o.paidTotal)>0){totals[kind(o.payment)]+=cents(o.paidTotal);totals.realOrders++}
 for(const correction of o.corrections||[]){if(date(correction.time||correction.createdAt)===day)totals[kind(o.payment)]+=cents(correction.amount);else if(!correction.time&&!correction.createdAt&&paidDate===day)totals.legacy++}
 if(refundDate===day&&Number(o.refundAmount)>0){const key=(kind(o.refundMethod||o.payment)+'Refund') as 'cashRefund';totals[key]+=cents(o.refundAmount)}
 }
 return totals;
}
export async function handoffs(request:Request,env:Cloudflare.Env,s:Session){
 if(!['admin','cashier'].includes(s.role))return json({error:'仅收银和管理设备可交班'},403);
 const url=new URL(request.url);let data:any={};if(request.method==='POST'){try{data=await request.json()}catch{return json({error:'请求格式无效'},400)}}else if(request.method!=='GET')return json({error:'Method not allowed'},405);
 const day=data.day||url.searchParams.get('day'),zone=data.zone||url.searchParams.get('zone')||'Europe/Paris';
 if(typeof day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day+'T00:00:00Z'))||new Date(day+'T00:00:00Z').toISOString().slice(0,10)!==day)return json({error:'日期无效'},400);
 try{new Intl.DateTimeFormat('en',{timeZone:zone}).format()}catch{return json({error:'时区无效'},400)}
 if(request.method==='POST'&&(typeof data.id!=='string'||!/^[-\w]{8,100}$/.test(data.id)))return json({error:'保存编号无效'},400);
 if(request.method==='POST'){const saved=await env.DB!.prepare('SELECT body FROM cash_handoffs WHERE store=? AND id=?').bind(s.store,data.id).first<{body:string}>();if(saved)return json({record:JSON.parse(saved.body),duplicate:true})}
 const rows=(await env.DB!.prepare('SELECT sequence,order_id,body,revision FROM sales WHERE user_id=? ORDER BY sequence').bind('store:'+s.store).all<any>()).results;
 const count=rows.length,revision=rows.reduce((sum,r)=>sum+r.revision,0),last=rows.at(-1)?.sequence||0,token=[count,revision,last].join(':'),totals=summarize(rows,day,zone);
 if(request.method==='GET'){const records=(await env.DB!.prepare('SELECT body FROM cash_handoffs WHERE store=? AND day=? ORDER BY created DESC LIMIT 50').bind(s.store,day).all<{body:string}>()).results.map(r=>JSON.parse(r.body));return json({day,zone,token,totals,records,mode:env.PAYMENT_MODE})}
 if(data.token!==token)return json({error:'订单已有更新，请重新核对金额后保存'},409);
 for(const key of ['opening','actual','cashIn','cashOut'])if(typeof data[key]!=='number'||!Number.isSafeInteger(data[key])||data[key]<0||data[key]>100000000)return json({error:'现金金额无效'},400);
 if(typeof data.employee!=='string'||!data.employee.trim()||data.employee.length>80||typeof data.note!=='string'||data.note.length>500)return json({error:'请填写交班员工，备注最多500字'},400);
 const expected=data.opening+totals.cash-totals.cashRefund+data.cashIn-data.cashOut,difference=data.actual-expected;
 if((difference||data.cashIn||data.cashOut)&&!data.note.trim())return json({error:'现金有差额或存取款时，请填写说明'},400);
 const record={id:data.id,store:s.store,storeName:(env as any).STORE_NAME,day,zone,createdAt:new Date().toISOString(),employee:data.employee.trim(),deviceId:s.deviceId,role:s.role,mode:env.PAYMENT_MODE,totals,opening:data.opening,actual:data.actual,cashIn:data.cashIn,cashOut:data.cashOut,expected,difference,note:data.note.trim(),token};
 const user='store:'+s.store;const r=await env.DB!.prepare('INSERT INTO cash_handoffs(store,id,day,created,body) SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM sales WHERE user_id=?)=? AND (SELECT COALESCE(SUM(revision),0) FROM sales WHERE user_id=?)=? AND (SELECT COALESCE(MAX(sequence),0) FROM sales WHERE user_id=?)=? ON CONFLICT(store,id) DO NOTHING').bind(s.store,data.id,day,record.createdAt,JSON.stringify(record),user,count,user,revision,user,last).run();
 if(!r.meta.changes){const duplicate=await env.DB!.prepare('SELECT body FROM cash_handoffs WHERE store=? AND id=?').bind(s.store,data.id).first<{body:string}>();return duplicate?json({record:JSON.parse(duplicate.body),duplicate:true}):json({error:'订单刚有更新，请刷新核对后保存'},409)}return json({record},201);
}
