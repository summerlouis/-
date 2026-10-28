export type Role = 'admin' | 'cashier' | 'kitchen' | 'customer';
export type Session = {role: Role; customerId: string; store: string; expires: number};
const name = 'bao_device_session';
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
const decode = (value: string) => Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
const key = (secret: string) => crypto.subtle.importKey('raw', new TextEncoder().encode(secret), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign', 'verify']);

export async function readSession(request: Request, env: Cloudflare.Env): Promise<Session | null> {
  const token = request.headers.get('cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith(name + '='))?.slice(name.length + 1);
  if (!token || token.length > 2048) return null;
  try {
    const [body, signature] = token.split('.');
    if (!await crypto.subtle.verify('HMAC', await key(env.SESSION_SECRET!), decode(signature), new TextEncoder().encode(body))) return null;
    const session = JSON.parse(new TextDecoder().decode(decode(body))) as Session;
    return session.store === env.STORE_ID && session.expires > Date.now() && ['admin','cashier','kitchen','customer'].includes(session.role) && typeof session.customerId === 'string' ? session : null;
  } catch { return null; }
}

export async function sessionCookie(session: Session, request: Request, env: Cloudflare.Env) {
  const body = encode(new TextEncoder().encode(JSON.stringify(session)));
  const signature = encode(new Uint8Array(await crypto.subtle.sign('HMAC', await key(env.SESSION_SECRET!), new TextEncoder().encode(body))));
  return `${name}=${body}.${signature}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
}

export function newSession(role: Role, store: string, customerId = crypto.randomUUID()): Session {
  return {role, store, customerId, expires: Date.now() + 30 * 24 * 3600 * 1000};
}

export async function matchesCode(supplied: string, expected?: string) {
  if (!expected || expected.length < 16) return false;
  const hash = async (value: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  const [a,b] = await Promise.all([hash(supplied), hash(expected)]);
  let diff = 0; for (let i=0; i<a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
