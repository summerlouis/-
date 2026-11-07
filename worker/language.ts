import type {Session} from './device-session';
export async function languageSetting(env:Cloudflare.Env,store:string){return await env.DB!.prepare('SELECT language,revision FROM store_preferences WHERE store=?').bind(store).first<{language:string,revision:number}>()||{language:'fr',revision:0}}
export async function languageAPI(request:Request,env:Cloudflare.Env,session:Session){
 const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
 if(request.method==='GET')return json(await languageSetting(env,session.store));
 if(request.method!=='PUT')return json({error:'Method not allowed'},405);
 if(session.role!=='admin')return json({error:'仅管理设备可修改语言 / Hanya admin yang dapat mengubah bahasa'},403);
 let data:any;try{data=await request.json()}catch{return json({error:'请求格式无效'},400)}
 if(!['fr','id'].includes(data?.language)||!Number.isInteger(data?.revision)||data.revision<0)return json({error:'语言选项无效 / Pilihan bahasa tidak valid'},400);
 const current=await languageSetting(env,session.store);if(current.revision!==data.revision)return json({error:'设置已更新，请刷新后重试 / Pengaturan berubah, muat ulang'},409);
 const result=await env.DB!.prepare('INSERT INTO store_preferences(store,language,revision) VALUES(?,?,1) ON CONFLICT(store) DO UPDATE SET language=excluded.language,revision=store_preferences.revision+1 WHERE store_preferences.revision=?').bind(session.store,data.language,data.revision).run();
 if(!result.meta.changes)return json({error:'设置已更新，请刷新后重试'},409);
 return json(await languageSetting(env,session.store));
}
