import { env } from 'cloudflare:workers';
import defaults from '../../../catalog-defaults.json';
export const dynamic='force-dynamic';

export async function GET(request:Request){
 const user=request.headers.get('oai-authenticated-user-id');
 if(!user)return Response.json({error:'请先登录后备份'},{status:401,headers:{'Cache-Control':'no-store'}});
 // The batch reads the same database snapshot; never export another user's rows.
 const [products,prices,orders,closures,images]=await env.DB!.batch<Record<string,unknown>>([
  env.DB!.prepare('SELECT code,category,dish,fr,cents,active,image_id,created_at FROM catalog_products WHERE user_id=? ORDER BY code').bind(user),
  env.DB!.prepare('SELECT code,cents,active,revision,deleted,image_id,updated_at FROM product_prices WHERE user_id=? ORDER BY code').bind(user),
  env.DB!.prepare('SELECT sequence,order_id,month,body,revision FROM sales WHERE user_id=? ORDER BY sequence').bind(user),
  env.DB!.prepare('SELECT month,closed_at FROM sales_closures WHERE user_id=? ORDER BY month').bind(user),
  env.DB!.prepare('SELECT id,content_type,bytes,created_at FROM catalog_images WHERE user_id=? AND id IN (SELECT image_id FROM catalog_products WHERE user_id=? UNION SELECT image_id FROM product_prices WHERE user_id=?) ORDER BY id').bind(user,user,user),
 ]);
 return Response.json({format:'bao-dumpling-full-backup',version:2,generatedAt:new Date().toISOString(),defaultCatalog:defaults,catalogProducts:products.results,productPrices:prices.results,orders:orders.results.map(row=>({...JSON.parse(String(row.body)),id:row.order_id,month:row.month,revision:row.revision,pickupNumber:String(row.sequence).padStart(4,'0')})),closures:closures.results,imageAssets:images.results.map(row=>({...row,imageUrl:'/api/product-images/'+row.id})),imageFilesIncluded:false,imageBackupNote:'本 JSON 包含图片引用和文件信息；图片原文件保存在现有站点的云端文件存储中，不在此 JSON 内。'},{headers:{'Cache-Control':'no-store','Content-Disposition':'attachment; filename="bao-dumpling-backup.json"'}});
}
