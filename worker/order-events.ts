import { DurableObject } from 'cloudflare:workers';

export class OrderEvents extends DurableObject<Cloudflare.Env> {
  async fetch(request: Request) {
    const path = new URL(request.url).pathname;
    if(path==='/revoke'){const data=await request.json() as {id:string};for(const socket of this.ctx.getWebSockets()){const meta=socket.deserializeAttachment();if(meta.deviceId===data.id||(!meta.deviceId&&meta.role!=='customer'))socket.close(1008,'Device revoked')}return Response.json({ok:true})}
    if (path === '/notify' && request.method === 'POST') {
      const event = await request.json() as {kind: string; customerId?: string};
      for (const socket of this.ctx.getWebSockets()) {
        const session = socket.deserializeAttachment() as {role: string; customerId: string};
        if (event.kind === 'catalog' || session.role !== 'customer' || session.customerId === event.customerId) {
          try { socket.send(JSON.stringify({kind: event.kind})); } catch { socket.close(1011, 'Reconnect'); }
        }
      }
      return Response.json({ok: true});
    }
    if (path !== '/connect' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response(null, {status: 404});
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({deviceId:request.headers.get('x-bao-device-id'),role: request.headers.get('x-bao-role'), customerId: request.headers.get('x-bao-customer-id') || ''});
    server.send(JSON.stringify({kind: 'connected'}));
    return new Response(null, {status: 101, webSocket: client});
  }
  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    if (message === 'ping') socket.send('pong');
    else socket.close(1008, 'Notifications only');
  }
  webSocketClose(socket: WebSocket, code: number) { socket.close(code, 'Closed'); }
  webSocketError(socket: WebSocket) { socket.close(1011, 'Reconnect'); }
}
