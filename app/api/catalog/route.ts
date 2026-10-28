import { env } from 'cloudflare:workers';
import defaults from '../../../catalog-defaults.json';
import { catalog, categories, validPrice } from '../../../lib/catalog';
import { ownsImage } from '../../../lib/product-images';
export const dynamic = 'force-dynamic';
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(request:Request){
  const userId=request.headers.get('oai-authenticated-user-id');if(!userId)return json({error:'请登录'},401);
  return json({products:await catalog(userId)});
}
export async function PATCH(request:Request){
  const userId=request.headers.get('oai-authenticated-user-id');if(!userId)return json({error:'请登录'},401);
  const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return json({error:'Invalid origin'},403);
  let data;try{data=await request.json() as {code:string,price?:number,active?:boolean,imageId?:string|null,revision:number}}catch{return json({error:'Invalid JSON'},400)}
  if(!data||typeof data.code!=='string'||!Number.isInteger(data.revision)||data.revision<0)return json({error:'Invalid product or revision'},400);
  if(data.price===undefined&&data.active===undefined&&data.imageId===undefined)return json({error:'Empty update'},400);
  if(data.price!==undefined&&!validPrice(data.price))return json({error:'Invalid price'},400);
  if(data.active!==undefined&&typeof data.active!=='boolean')return json({error:'Invalid availability'},400);
  const current=(await catalog(userId)).find(p=>p.code===data.code);
  if(!current||current.deleted)return json({error:'商品不存在或已删除，请刷新商品列表'},404);
  if(current.revision!==data.revision)return json({error:'Price changed on another device'},409);
  if(data.imageId!==undefined&&data.imageId!==null&&!await ownsImage(userId,data.imageId))return json({error:'图片不存在或不属于当前账号，请重新上传'},400);
  const imageId=data.imageId===undefined?current.imageId:data.imageId;
  const cents=Math.round((data.price??current.price)*100),active=(data.active??current.active)?1:0;
  const result=await env.DB!.prepare('INSERT INTO product_prices (user_id,code,cents,active,revision,image_id,updated_at) VALUES (?,?,?,?,1,?,?) ON CONFLICT(user_id,code) DO UPDATE SET cents=excluded.cents,active=excluded.active,image_id=excluded.image_id,revision=product_prices.revision+1,updated_at=excluded.updated_at WHERE product_prices.revision = ? AND product_prices.deleted = 0').bind(userId,data.code,cents,active,imageId,new Date().toISOString(),data.revision).run();
  if(!result.meta.changes)return json({error:'Price changed on another device'},409);
  return json({products:await catalog(userId)});
}
export async function DELETE(request:Request){
  const userId=request.headers.get('oai-authenticated-user-id');if(!userId)return json({error:'请登录'},401);
  const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return json({error:'请求来源无效'},403);
  let data;try{data=await request.json() as {code:string,revision:number}}catch{return json({error:'请求格式不正确'},400)}
  if(!data||typeof data.code!=='string'||!Number.isInteger(data.revision)||data.revision<0)return json({error:'商品编号或版本无效'},400);
  const products=await catalog(userId),current=products.find(p=>p.code===data.code);
  if(!current)return json({error:'商品不存在'},404);
  // Keep the product identity for historical orders and reserve its code against reuse.
  if(current.deleted)return json({products});
  if(current.revision!==data.revision)return json({error:'商品已在其他设备修改，请核对后重新删除'},409);
  const result=await env.DB!.prepare('INSERT INTO product_prices (user_id,code,cents,active,revision,deleted,image_id,updated_at) VALUES (?,?,?,0,1,1,?,?) ON CONFLICT(user_id,code) DO UPDATE SET active=0,deleted=1,revision=product_prices.revision+1,updated_at=excluded.updated_at WHERE product_prices.revision=? AND product_prices.deleted=0').bind(userId,data.code,Math.round(current.price*100),current.imageId,new Date().toISOString(),data.revision).run();
  const latest=await catalog(userId);
  if(!result.meta.changes&&!latest.find(p=>p.code===data.code)?.deleted)return json({error:'商品已在其他设备修改，请核对后重新删除'},409);
  return json({products:latest});
}
export async function POST(request:Request){
  const userId=request.headers.get('oai-authenticated-user-id');if(!userId)return json({error:'请登录'},401);
  const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return json({error:'请求来源无效'},403);
  let data;try{data=await request.json() as Record<string,unknown>}catch{return json({error:'请求格式不正确'},400)}
  if(!data||typeof data!=='object')return json({error:'商品信息不完整'},400);
  const code=typeof data.code==='string'?data.code.trim().toUpperCase():'';
  const dish=typeof data.dish==='string'?data.dish.trim():'';
  const fr=typeof data.fr==='string'?data.fr.trim():'';
  if(!/^[A-Z][A-Z0-9_-]{0,19}$/.test(code))return json({error:'商品编号须以字母开头，只能含字母、数字、横线或下划线，最多 20 位'},400);
  if(!dish||dish.length>80)return json({error:'请输入商品名称，最多 80 字'},400);
  if(data.fr!==undefined&&typeof data.fr!=='string'||fr.length>160)return json({error:'法文名称最多 160 字'},400);
  if(typeof data.category!=='string'||!categories.includes(data.category))return json({error:'请选择有效分类'},400);
  if(!validPrice(data.price))return json({error:'价格须为 0 至 99999.99，最多两位小数'},400);
  if(data.active!==undefined&&typeof data.active!=='boolean')return json({error:'上架状态无效'},400);
  if(defaults.some(p=>p.code===code))return json({error:'商品编号已存在，请使用新编号'},409);
  if(data.imageId!==undefined&&data.imageId!==null&&!await ownsImage(userId,data.imageId))return json({error:'图片不存在或不属于当前账号，请重新上传'},400);
  const result=await env.DB!.prepare('INSERT INTO catalog_products (user_id,code,category,dish,fr,cents,active,image_id,created_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,code) DO NOTHING').bind(userId,code,data.category,dish,fr,Math.round(data.price*100),data.active===false?0:1,data.imageId??null,new Date().toISOString()).run();
  if(!result.meta.changes)return json({error:'商品编号已存在，请核对商品列表或使用新编号'},409);
  const products=await catalog(userId);
  return json({products,product:products.find(p=>p.code===code)},201);
}
