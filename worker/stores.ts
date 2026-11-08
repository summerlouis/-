import defaults from '../catalog-defaults.json';
import {readSession} from './device-session';
import {deviceValid,hashCode} from './devices';
export const result=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}});
export async function ensureRoot(env:Cloudflare.Env){await env.DB!.prepare("INSERT OR IGNORE INTO stores(id,name,address,open,created) VALUES(?,'一号店','',1,?)").bind(env.STORE_ID,new Date().toISOString()).run()}
export async function owner(request:Request,env:Cloudflare.Env){const s=await readSession(request,env);return s?.role==='admin'&&await deviceValid(s,request,env)?s:null}
export async function storesAPI(request:Request,env:Cloudflare.Env){
 if(!['GET','HEAD'].includes(request.method)&&((request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)||request.headers.get('sec-fetch-site')==='cross-site'))return result({error:'请求来源无效'},403);
 if(!await owner(request,env))return result({error:'仅老板管理设备可以管理门店'},403);
 await ensureRoot(env);const url=new URL(request.url);
 if(request.method==='GET'){
  const stores=(await env.DB!.prepare('SELECT * FROM stores ORDER BY created,id').all()).results;
  const totals=(await env.DB!.prepare("SELECT user_id,COUNT(*) AS orders,SUM(CASE WHEN json_extract(body,'$.status') IN ('paid','done') AND COALESCE(json_extract(body,'$.isTest'),0)=0 AND COALESCE(json_extract(body,'$.paymentMode'),'manual')!='mock' THEN COALESCE(CAST(json_extract(body,'$.paidTotal') AS REAL),0)+(SELECT COALESCE(SUM(CAST(json_extract(value,'$.amount') AS REAL)),0) FROM json_each(body,'$.corrections')) ELSE 0 END) AS revenue,SUM(CASE WHEN COALESCE(json_extract(body,'$.isTest'),0)=0 AND COALESCE(json_extract(body,'$.paymentMode'),'manual')!='mock' THEN COALESCE(CAST(json_extract(body,'$.refundAmount') AS REAL),0) ELSE 0 END) AS refunds,SUM(CASE WHEN json_extract(body,'$.isTest')=1 AND json_extract(body,'$.status') IN ('paid','done') THEN COALESCE(CAST(json_extract(body,'$.simulatedTotal') AS REAL),0) ELSE 0 END) AS simulated FROM sales GROUP BY user_id").all()).results;
  return result({stores,totals,root:env.STORE_ID});
 }
 let d:any;try{d=await request.json()}catch{return result({error:'请求无效'},400)}
 if(request.method==='PATCH'){
  if(typeof d.id!=='string'||typeof d.name!=='string'||!d.name.trim()||d.name.length>60||typeof d.address!=='string'||d.address.length>200||typeof d.open!=='boolean')return result({error:'门店资料无效'},400);
  const r=await env.DB!.prepare('UPDATE stores SET name=?,address=?,open=? WHERE id=?').bind(d.name.trim(),d.address,d.open?1:0,d.id).run();return result({ok:!!r.meta.changes});
 }
 if(request.method!=='POST')return result({error:'Method not allowed'},405);
 if(typeof d.name!=='string'||!d.name.trim()||d.name.length>60||typeof d.address!=='string'||d.address.length>200||typeof d.open!=='boolean')return result({error:'填写门店名称、地址和营业状态'},400);
 const source=await env.DB!.prepare('SELECT id FROM stores WHERE id=?').bind(String(d.copyFrom||env.STORE_ID)).first<{id:string}>();if(!source)return result({error:'来源门店不存在'},400);
 const id='shop-'+crypto.randomUUID().slice(0,8),user='store:'+id,from='store:'+source.id,now=new Date().toISOString();
 const statements=[env.DB!.prepare('INSERT INTO stores(id,name,address,open,created) VALUES(?,?,?,?,?)').bind(id,d.name.trim(),d.address,d.open?1:0,now)];
 // Clone image metadata and blobs: each store owns its independent immutable assets.
 const images=(await env.DB!.prepare('SELECT * FROM catalog_images WHERE user_id=?').bind(from).all<any>()).results,map=new Map<string,string>();
 for(const image of images){if(!env.BUCKET)return result({error:'图片存储不可用，未创建门店'},503);const object=await env.BUCKET.get(image.object_key);if(!object)return result({error:'来源图片缺失，未创建门店'},409);const next=crypto.randomUUID(),key='stores/'+id+'/'+next;await env.BUCKET.put(key,object.body,{httpMetadata:{contentType:image.content_type}});map.set(image.id,next);statements.push(env.DB!.prepare('INSERT INTO catalog_images(id,user_id,object_key,content_type,bytes,created_at) VALUES(?,?,?,?,?,?)').bind(next,user,key,image.content_type,image.bytes,now))}
 for(const p of (await env.DB!.prepare('SELECT * FROM catalog_products WHERE user_id=?').bind(from).all<any>()).results)statements.push(env.DB!.prepare('INSERT INTO catalog_products(user_id,code,category,dish,fr,cents,active,created_at,image_id) VALUES(?,?,?,?,?,?,?,?,?)').bind(user,p.code,p.category,p.dish,p.fr,p.cents,p.active,now,map.get(p.image_id)||null));
 for(const p of (await env.DB!.prepare('SELECT * FROM product_prices WHERE user_id=?').bind(from).all<any>()).results)statements.push(env.DB!.prepare('INSERT INTO product_prices(user_id,code,cents,active,revision,updated_at,deleted,image_id,sold_out,bundle_json) VALUES(?,?,?,?,1,?,?,?,?,?)').bind(user,p.code,p.cents,p.active,now,p.deleted,map.get(p.image_id)||null,p.sold_out,p.bundle_json));
 statements.push(env.DB!.prepare('INSERT INTO catalog_seeds(user_id,body) VALUES(?,COALESCE((SELECT body FROM catalog_seeds WHERE user_id=?),?))').bind(user,from,JSON.stringify(defaults)));
 const codes:Record<string,string>={};for(const role of ['admin','cashier','kitchen']){const code=crypto.randomUUID();codes[role]=code;statements.push(env.DB!.prepare('INSERT INTO pairing_codes(store,role,hash,updated) VALUES(?,?,?,?)').bind(id,role,await hashCode(code),Date.now()))}
 statements.push(env.DB!.prepare("INSERT INTO store_preferences(store,language,revision) VALUES(?,COALESCE((SELECT language FROM store_preferences WHERE store=?),'fr'),1)").bind(id,source.id));
 await env.DB!.batch(statements);return result({id,codes,url:url.origin+'/s/'+id+'/index.html'},201);
}
