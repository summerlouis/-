import { env } from 'cloudflare:workers';
import defaults from '../catalog-defaults.json';

export const categories = ['包子', '饺子', '粥品', '其他'];
export function validPrice(price:unknown):price is number {
  return typeof price === 'number' && Number.isFinite(price) && price >= 0 && price <= 99999.99 && Math.abs(price * 100 - Math.round(price * 100)) < 0.000001;
}
export async function catalog(userId:string) {
  const [custom, overrides] = await Promise.all([
    env.DB!.prepare('SELECT code,category,dish,fr,cents,active,image_id FROM catalog_products WHERE user_id=? ORDER BY created_at,code').bind(userId).all<{code:string,category:string,dish:string,fr:string,cents:number,active:number,image_id:string|null}>(),
    env.DB!.prepare('SELECT code,cents,active,revision,deleted,image_id FROM product_prices WHERE user_id=?').bind(userId).all<{code:string,cents:number,active:number,revision:number,deleted:number,image_id:string|null}>(),
  ]);
  const prices = new Map(overrides.results.map(row => [row.code,row]));
  const products = [...defaults.map(p=>({...p,imageId:null as string|null})), ...custom.results.map(({cents,active,image_id,...p}) => ({...p,price:cents/100,active:Boolean(active),imageId:image_id}))];
  return products.map(p => {
    const row = prices.get(p.code);
    const imageId=row?row.image_id:p.imageId;
    return {...p,imageId,imageUrl:imageId?'/api/product-images/'+imageId:null,price:row?row.cents/100:p.price,active:row?.deleted?false:row?Boolean(row.active):p.active,revision:row?.revision??0,deleted:Boolean(row?.deleted)};
  });
}
