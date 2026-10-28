import { env } from 'cloudflare:workers';
import { validImageId } from '../../../../lib/product-images';
export const dynamic = 'force-dynamic';
const fail = (status: number) => new Response(null,{status,headers:{'Cache-Control':'no-store'}});

export async function GET(request: Request, context: {params: Promise<{id:string}>}) {
  const userId=request.headers.get('oai-authenticated-user-id');
  if (!userId) return fail(401);
  const {id}=await context.params;
  if (!validImageId(id)) return fail(404);
  const row=await env.DB!.prepare('SELECT object_key,content_type FROM catalog_images WHERE id=? AND user_id=?').bind(id,userId).first<{object_key:string,content_type:string}>();
  if (!row) return fail(404);
  if (!env.BUCKET) return fail(503);
  const object=await env.BUCKET.get(row.object_key);
  if (!object) return fail(404);
  // IDs are immutable. A replacement gets a new URL on every device.
  const headers={'Content-Type':row.content_type,'Content-Length':String(object.size),'Cache-Control':'private, max-age=86400, immutable','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin','ETag':object.httpEtag};
  if(request.headers.get('if-none-match')===object.httpEtag) return new Response(null,{status:304,headers});
  return new Response(object.body,{headers});
}
