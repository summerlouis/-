import { env } from 'cloudflare:workers';
import { MAX_IMAGE_BYTES, rasterType } from '../../../lib/product-images';
export const dynamic = 'force-dynamic';
const json = (value: unknown, status=200) => Response.json(value,{status,headers:{'Cache-Control':'no-store'}});

export async function POST(request: Request) {
  const userId=request.headers.get('oai-authenticated-user-id');
  if (!userId) return json({error:'请先登录后上传图片'},401);
  const origin=request.headers.get('origin');
  if (origin && origin!==new URL(request.url).origin) return json({error:'请求来源无效'},403);
  if (!env.BUCKET) return json({error:'图片存储暂不可用，请稍后重试'},503);
  const contentType=request.headers.get('content-type')||'';
  if (!contentType.toLowerCase().startsWith('multipart/form-data;')) return json({error:'请选择 JPG、PNG 或 WebP 图片'},415);
  const maxRequest=MAX_IMAGE_BYTES+64*1024;
  if (Number(request.headers.get('content-length'))>maxRequest) return json({error:'处理后的图片不能超过 2MB，请选择较小图片'},413);
  if (!request.body) return json({error:'请选择图片文件'},400);
  // Bound chunked uploads before asking the multipart parser to allocate memory.
  const reader=request.body.getReader(), chunks: Uint8Array[]=[];
  let length=0;
  try {
    while (true) {
      const {done,value}=await reader.read();
      if (done) break;
      length+=value.byteLength;
      if (length>maxRequest) {await reader.cancel();return json({error:'处理后的图片不能超过 2MB'},413)}
      chunks.push(value);
    }
  } catch {return json({error:'图片传输中断，请重新选择后重试'},400)}
  const body=new Uint8Array(length);let offset=0;
  for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.length}
  let form: FormData;
  try {form=await new Response(body,{headers:{'Content-Type':contentType}}).formData()} catch {return json({error:'无法读取上传文件'},400)}
  const file=form.get('file');
  if (!file || typeof file==='string' || form.getAll('file').length!==1 || !file.size) return json({error:'请选择一张有效图片'},400);
  if (file.size>MAX_IMAGE_BYTES) return json({error:'处理后的图片不能超过 2MB'},413);
  const bytes=new Uint8Array(await file.arrayBuffer()),mime=rasterType(bytes);
  if (!mime) return json({error:'仅支持 JPG、PNG、WebP 图片，请勿上传其他文件'},415);
  const imageId=crypto.randomUUID();
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(userId)));
  const ownerKey=Array.from(digest).map(value=>value.toString(16).padStart(2,'0')).join('');
  const objectKey=`product-images/${ownerKey}/${imageId}`;
  try {
    await env.BUCKET.put(objectKey,bytes,{httpMetadata:{contentType:mime}});
    await env.DB!.prepare('INSERT INTO catalog_images (id,user_id,object_key,content_type,bytes,created_at) VALUES (?,?,?,?,?,?)').bind(imageId,userId,objectKey,mime,bytes.length,new Date().toISOString()).run();
  } catch {
    try {await env.BUCKET.delete(objectKey)} catch {}
    return json({error:'图片保存失败，请重试；商品原图片未改变'},503);
  }
  return json({imageId,imageUrl:'/api/product-images/'+imageId},201);
}
