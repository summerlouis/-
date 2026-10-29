import type {Session} from './device-session';
export const hashCode=async(code:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(code)))).map(n=>n.toString(16).padStart(2,'0')).join('');
export async function deviceValid(session:Session,request:Request,env:Cloudflare.Env){
 if(session.role==='customer')return true;
 const id=session.deviceId||'legacy-'+session.customerId+'-'+session.role;session.deviceId=id;
 const now=Date.now();
 await env.DB!.prepare('INSERT OR IGNORE INTO device_registry(store,id,role,label,created,seen,expires) VALUES(?,?,?,?,?,?,?)').bind(session.store,id,session.role,(request.headers.get('user-agent')||'未命名设备').slice(0,160),now,now,session.expires).run();
 const row=await env.DB!.prepare('SELECT revoked,seen FROM device_registry WHERE store=? AND id=?').bind(session.store,id).first<{revoked:number,seen:number}>();
 if(!row||row.revoked)return false;
 if(now-row.seen>300000)await env.DB!.prepare('UPDATE device_registry SET seen=? WHERE store=? AND id=?').bind(now,session.store,id).run();
 return true;
}
export async function manageDevices(request:Request,env:Cloudflare.Env,session:Session){
 const json=(v:unknown,s=200)=>Response.json(v,{status:s,headers:{'Cache-Control':'no-store'}});
 if(session.role!=='admin')return json({error:'仅管理设备可管理授权'},403);
 if(request.method==='GET'){const rows=await env.DB!.prepare('SELECT id,role,label,created,seen,expires,revoked FROM device_registry WHERE store=? ORDER BY created DESC LIMIT 200').bind(session.store).all();return json({devices:rows.results,current:session.deviceId})}
 if(request.method!=='POST')return json({error:'Method not allowed'},405);
 let data;try{data=await request.json() as Record<string,string>}catch{return json({error:'请求无效'},400)}
 if(data.action==='rename'){const label=typeof data.label==='string'?data.label.trim():'';if(!label||label.length>80)return json({error:'设备名称须为 1–80 个字符'},400);await env.DB!.prepare('UPDATE device_registry SET label=? WHERE store=? AND id=?').bind(label,session.store,String(data.id)).run();return json({ok:true})}
 if(data.action==='revoke'){
  if(data.id===session.deviceId)return json({error:'不能撤销当前管理设备，请使用退出配对'},400);
  await env.DB!.prepare('UPDATE device_registry SET revoked=1 WHERE store=? AND id=?').bind(session.store,String(data.id)).run();
  if(env.ORDER_EVENTS)await env.ORDER_EVENTS.get(env.ORDER_EVENTS.idFromName('store:'+session.store)).fetch(new Request('https://events.internal/revoke',{method:'POST',body:JSON.stringify({id:data.id})}));
  return json({ok:true});
 }
 if(data.action==='rotate'&&['admin','cashier','kitchen'].includes(data.role)){
  const code=crypto.randomUUID()+crypto.randomUUID();
  await env.DB!.prepare('INSERT INTO pairing_codes(store,role,hash,updated) VALUES(?,?,?,?) ON CONFLICT(store,role) DO UPDATE SET hash=excluded.hash,updated=excluded.updated').bind(session.store,data.role,await hashCode(code),Date.now()).run();
  return json({code});
 }
 return json({error:'操作无效'},400);
}
