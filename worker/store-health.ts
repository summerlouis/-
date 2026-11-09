import {catalog} from '../lib/catalog';
import {languageSetting} from './language';
import type {Session} from './device-session';
export async function storeHealth(request:Request,env:Cloudflare.Env,s:Session){
 const reply=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}});
 if(s.role!=='admin')return reply({error:'仅管理设备可查看本店配置'},403);
 if(request.method!=='GET')return reply({error:'Method not allowed'},405);
 const now=Date.now();const [menu,devices,language]=await Promise.all([catalog('store:'+s.store),env.DB!.prepare('SELECT id,role,label,seen,expires,revoked FROM device_registry WHERE store=? ORDER BY seen DESC').bind(s.store).all<any>(),languageSetting(env,s.store)]);
 const list=devices.results.map(d=>({...d,connection:d.revoked?'revoked':d.expires<=now?'expired':now-d.seen<=90000?'recent':'stale'}));
 return reply({store:s.store,now,thresholdSeconds:90,devices:list,checks:{menu:menu.filter(p=>p.active).length,cashier:list.filter(d=>d.role==='cashier'&&!d.revoked&&d.expires>now).length,kitchen:list.filter(d=>d.role==='kitchen'&&!d.revoked&&d.expires>now).length,language:language.language,payment:env.PAYMENT_MODE}});
}
