export async function GET(request:Request){
 const url=new URL(request.url),entry=url.pathname.slice(1);
 if(['admin','owner','pos','kitchen','index','cashier'].includes(entry))return Response.redirect(new URL('/'+entry+'.html',url),307);
 return new Response('页面不存在',{status:404});
}
