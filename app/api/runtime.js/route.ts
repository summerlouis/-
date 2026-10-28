import { env } from 'cloudflare:workers';
export function GET() {
  return new Response('window.BAO_CLOUD=true;window.BaoRuntime='+JSON.stringify({cloud:true,mode:env.PAYMENT_MODE==='mock'?'mock':'manual',role:'admin',events:false})+';', {headers:{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store'}});
}
