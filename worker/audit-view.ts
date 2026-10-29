import type {Session} from './device-session';
export async function auditView(request:Request,env:Cloudflare.Env,session:Session){
 const json=(v:unknown,s=200)=>Response.json(v,{status:s,headers:{'Cache-Control':'no-store'}});
 if(session.role!=='admin')return json({error:'仅管理设备可清空操作记录'},403);
 if(request.method==='POST'){
  let data;try{data=await request.json() as {before:string}}catch{return json({error:'请求无效'},400)}
  if(typeof data.before!=='string'||!Number.isFinite(Date.parse(data.before))||Date.parse(data.before)>Date.now())return json({error:'请刷新记录后重试'},400);
  await env.DB!.prepare('INSERT INTO audit_view_state(store,cleared_before) VALUES(?,?) ON CONFLICT(store) DO UPDATE SET cleared_before=MAX(cleared_before,excluded.cleared_before)').bind(session.store,new Date(data.before).toISOString()).run();
  return json({ok:true});
 }
 if(request.method!=='GET')return json({error:'Method not allowed'},405);
 const state=await env.DB!.prepare('SELECT cleared_before FROM audit_view_state WHERE store=?').bind(session.store).first<{cleared_before:string}>();
 const before=new Date().toISOString();
 const rows=await env.DB!.prepare("SELECT sales.order_id AS id,json_extract(h.value,'$.time') AS time,json_extract(h.value,'$.action') AS action FROM sales,json_each(sales.body,'$.history') AS h WHERE sales.user_id=? AND json_extract(h.value,'$.time')>? AND json_extract(h.value,'$.time')<=? ORDER BY time DESC LIMIT 200").bind('store:'+session.store,state?.cleared_before||'',before).all();
 return json({records:rows.results,before});
}
