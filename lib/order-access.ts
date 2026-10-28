import { env } from 'cloudflare:workers';

export function orderAccess(request: Request) {
  const standalone = env.BAO_STANDALONE === 'true';
  return {
    role: standalone ? request.headers.get('x-bao-role') || 'customer' : 'admin',
    customerId: standalone ? request.headers.get('x-bao-customer-id') || '' : '',
    mock: env.PAYMENT_MODE === 'mock',
  };
}

// A notification failure must not undo or disguise a committed order.
export async function notifyOrders(store: string, customerId = '') {
  if (!env.ORDER_EVENTS) return;
  try {
    const hub = env.ORDER_EVENTS.get(env.ORDER_EVENTS.idFromName(store));
    await hub.fetch(new Request('https://events.internal/notify', {
      method: 'POST', body: JSON.stringify({kind: 'orders', customerId}),
    }));
  } catch (error) { console.error('Order notification unavailable; polling will recover', String(error)); }
}
