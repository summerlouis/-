import {handoffs} from './handoffs';
import {storeHealth} from './store-health';
import {storesAPI,owner,ensureRoot,result} from './stores';
import {languageAPI,languageSetting} from './language';
import {auditView} from './audit-view';
import {deviceValid,manageDevices,hashCode} from './devices';
import * as orders from '../app/api/orders/route';
import * as catalog from '../app/api/catalog/route';
import * as imageUpload from '../app/api/product-images/route';
import * as imageRead from '../app/api/product-images/[id]/route';
import * as backup from '../app/api/backup/route';
import { readSession, sessionCookie, newSession, matchesCode } from './device-session';
import type { Role } from './device-session';
export { OrderEvents } from './order-events';

const json = (body: unknown, status = 200) => Response.json(body, {status, headers: {'Cache-Control': 'no-store'}});
const staffPages: Record<string, Role[]> = {pos:['admin','cashier'], kitchen:['admin','cashier','kitchen'], admin:['admin'], owner:['admin']};

const service = {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url), path = url.pathname;
    if (env.BAO_STANDALONE !== 'true' || !['mock','manual'].includes(env.PAYMENT_MODE||'') || !env.STORE_ID || !env.SESSION_SECRET || env.SESSION_SECRET.length < 32) return json({error:'测试服务器尚未配置，请运行 npm run local:setup'},503);
    if (!['GET','HEAD','OPTIONS'].includes(request.method) || path === '/api/events') {
      const origin = request.headers.get('origin');
      if (origin && origin !== url.origin) return json({error:'请求来源无效'},403);
      if (request.headers.get('sec-fetch-site') === 'cross-site') return json({error:'请求来源无效'},403);
    }
    let previous = await readSession(request, env);
    if(previous&&!await deviceValid(previous,request,env))previous=null;
    let session = previous || newSession('customer', env.STORE_ID);
    if(path==='/api/orders'&&request.method==='POST'&&!(env as any).STORE_OPEN)return json({error:'本店暂停营业，请联系店员'},409);
    const secureResponse = async (response: Response) => {
      if (response.status === 101) return response;
      const next = new Response(response.body, response);
      next.headers.set('X-Content-Type-Options','nosniff');
      next.headers.set('Referrer-Policy','same-origin');
      if (!previous || session !== previous) next.headers.set('Set-Cookie',await sessionCookie(session,request,env));
      return next;
    };
    if(path==='/api/handoffs')return secureResponse(await handoffs(request,env,session));
    if(path==='/api/store-health')return secureResponse(await storeHealth(request,env,session));
    if(path==='/api/language')return secureResponse(await languageAPI(request,env,session));
    if(path==='/api/audit-view')return auditView(request,env,session);
    if(path==='/api/devices')return manageDevices(request,env,session);
    if (path === '/api/device-session') {
      if (request.method === 'DELETE') { if(session.deviceId)await env.DB!.prepare('UPDATE device_registry SET revoked=1 WHERE store=? AND id=?').bind(session.store,session.deviceId).run(); session = newSession('customer',env.STORE_ID); return secureResponse(json({ok:true})); }
      if (request.method !== 'POST') return json({error:'Method not allowed'},405);
      let code = ''; try { code = String((await request.json() as {code?:unknown}).code || '').trim(); } catch { return json({error:'请求格式错误'},400); }
      if (code.length > 256) return json({error:'设备配对码无效'},401);
      let role: Role | null = null;
      for (const [candidate,expected] of [['admin',env.ADMIN_DEVICE_CODE],['cashier',env.CASHIER_DEVICE_CODE],['kitchen',env.KITCHEN_DEVICE_CODE]] as const) {
        const override=await env.DB!.prepare('SELECT hash FROM pairing_codes WHERE store=? AND role=?').bind(env.STORE_ID,candidate).first<{hash:string}>();
        if (override ? await hashCode(code)===override.hash : await matchesCode(code,((env as any).STORE_SCOPE?undefined:expected))) role = candidate;
      }
      if (!role) return json({error:'设备配对码无效，请向店主管理员获取最新配对码'},401);
      session = newSession(role,env.STORE_ID,session.customerId);
      return secureResponse(json({ok:true,role}));
    }
    if (path === '/api/runtime.js') {
      const preference=await languageSetting(env,session.store);
      const config = {language:preference.language,languageRevision:preference.revision,cloud:true,mode:env.PAYMENT_MODE,storeId:env.STORE_ID,storeName:(env as any).STORE_NAME,storeOpen:!!(env as any).STORE_OPEN,owner:!!session.owner||(!(env as any).STORE_SCOPE&&session.role==='admin'),role:session.role,sessionId:session.customerId,events:true,imageUploads:!!env.BUCKET};
      return secureResponse(new Response('window.BAO_CLOUD=true;window.BaoRuntime='+JSON.stringify(config)+';', {headers:{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store'}}));
    }
    // Never trust identity headers supplied by a browser or proxy outside this worker.
    const headers = new Headers(request.headers);
    for (const name of [...headers.keys()]) if (name.startsWith('oai-authenticated-user-') || name.startsWith('x-bao-')) headers.delete(name);
    headers.set('oai-authenticated-user-id','store:'+env.STORE_ID);
    headers.set('x-bao-device-id',session.deviceId||'');headers.set('x-bao-role',session.role); headers.set('x-bao-customer-id',session.customerId);
    let requestBody: ArrayBuffer | undefined;
    if (request.body) {
      const reader=request.body.getReader(), chunks:Uint8Array[]=[];let size=0;
      while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>2200000){await reader.cancel();return json({error:'请求过大'},413)}chunks.push(part.value)}
      const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}requestBody=bytes.buffer;
    }
    const trusted = new Request(request.url,{method:request.method,headers,body:requestBody});
    if (path === '/api/events') {
      if (!previous) return json({error:'请先打开点餐页面或配对设备'},401);
      if (!env.ORDER_EVENTS) return json({error:'即时通知暂不可用'},503);
      const target = new URL('https://events.internal/connect');
      return env.ORDER_EVENTS.get(env.ORDER_EVENTS.idFromName('store:'+env.STORE_ID)).fetch(new Request(target,trusted));
    }
    if (path.startsWith('/api/')) {
      if (!previous) return json({error:'请先打开点餐页面或配对设备'},401);
      const method = request.method;
      if ((path === '/api/catalog' && method !== 'GET' || path === '/api/product-images' || path === '/api/backup') && session.role !== 'admin') return json({error:'此操作需要管理设备权限'},403);
      if (path === '/api/orders' && session.role === 'kitchen' && method === 'POST') return json({error:'厨房设备不能创建或结算订单'},403);
      let response: Response;
      if (path === '/api/orders' && ['GET','POST','PATCH'].includes(method)) response = await orders[method as 'GET'|'POST'|'PATCH'](trusted);
      else if (path === '/api/catalog' && ['GET','POST','PATCH','DELETE'].includes(method)) response = await catalog[method as 'GET'|'POST'|'PATCH'|'DELETE'](trusted);
      else if (path === '/api/product-images' && method === 'POST') response = await imageUpload.POST(trusted);
      else if (/^\/api\/product-images\/[^/]+$/.test(path) && method === 'GET') response = await imageRead.GET(trusted,{params:Promise.resolve({id:path.split('/').pop()!})});
      else if (path === '/api/backup' && method === 'GET') response = await backup.GET(trusted);
      else return json({error:'接口不存在'},404);
      if (response.ok && path === '/api/catalog' && method !== 'GET' && env.ORDER_EVENTS) {
        const hub = env.ORDER_EVENTS.get(env.ORDER_EVENTS.idFromName('store:'+env.STORE_ID));
        ctx.waitUntil(hub.fetch(new Request('https://events.internal/notify',{method:'POST',body:JSON.stringify({kind:'catalog'})})).catch(()=>undefined));
      }
      return secureResponse(response);
    }
    const entry = path.replace(/^\//,'').replace(/\.html$/,'');
    if (entry === 'cashier') return Response.redirect(new URL('/pos',url),307);
    if (staffPages[entry] && !staffPages[entry].includes(session.role)) return Response.redirect(new URL(((env as any).STORE_SCOPE||'/')+'device.html?next='+encodeURIComponent('/'+entry),url),307);
    const assetURL = new URL(url);
    if (path === '/') assetURL.pathname = '/index.html';
    else if (staffPages[entry]) assetURL.pathname = '/'+entry+'.html';
    const response = await env.ASSETS!.fetch(new Request(assetURL,request));
    const result = await secureResponse(response);
    if (path.endsWith('.js') || path.endsWith('.html') || path === '/' || staffPages[entry]) result.headers.set('Cache-Control','no-store');
    return result;
  },
};

export default {async fetch(request:Request,env:Cloudflare.Env,ctx:ExecutionContext):Promise<Response>{
 const url=new URL(request.url),match=url.pathname.match(/^\/s\/(shop-[a-f0-9]{8})\/(.*)$/),prefix=match?'/s/'+match[1]+'/':'';
 if(url.pathname==='/api/stores')return storesAPI(request,env);
 await ensureRoot(env);
 const id=match?match[1]:env.STORE_ID,store=await env.DB!.prepare('SELECT * FROM stores WHERE id=?').bind(id).first<any>();if(!store)return result({error:'门店不存在'},404);
 const scoped={...env,STORE_ID:id,STORE_SCOPE:prefix,STORE_NAME:store.name,STORE_OPEN:store.open} as Cloudflare.Env;
 let req=request;
 if(match){url.pathname='/'+match[2];const headers=new Headers(request.headers);const local=await readSession(request,scoped);if(!local||local.owner){const root=await owner(request,env);if(root){const cookie=await sessionCookie({...root,store:id,owner:true},request,scoped);headers.set('cookie',(headers.get('cookie')||'')+'; '+cookie.split(';')[0])}else if(local?.owner){headers.set('cookie',(headers.get('cookie')||'').split(';').filter(v=>!v.trim().startsWith('bao_device_session_'+id+'=')).join(';'))}}req=new Request(url,{method:request.method,headers,body:request.body,redirect:request.redirect});}
 const response=await service.fetch(req,scoped,ctx);
 if(response.status===101)return response;
 if(response.headers.get('Content-Type')?.includes('text/html')&&response.ok){let html=await response.text();if(prefix)html=html.replace(/(src|href)="\/(?!\/)/g,'$1="'+prefix);html=html.replace('<head>','<head><script src="'+(prefix||'/')+'store-scope.js"></script>');html=html.replace('</body>','<script src="store-health.js"></script><script src="stores-ui.js"></script><script src="handoffs.js"></script></body>');return new Response(html,{status:response.status,headers:response.headers});}
 return response;
}};
