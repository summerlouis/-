import { env } from 'cloudflare:workers';

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const validImageId = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
export async function ownsImage(userId: string, imageId: unknown) {
  if (!validImageId(imageId)) return false;
  return !!await env.DB!.prepare('SELECT id FROM catalog_images WHERE id=? AND user_id=?').bind(imageId,userId).first();
}

// Only raster image formats are served; filenames and caller MIME types are not trusted.
export function rasterType(bytes: Uint8Array): string|null {
  if (bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((byte,index)=>bytes[index]===byte)) return 'image/png';
  if (bytes.length >= 4 && bytes[0]===0xff && bytes[1]===0xd8 && bytes[2]===0xff) return 'image/jpeg';
  const signature = (start: number, text: string) => [...text].every((character,index)=>bytes[start+index]===character.charCodeAt(0));
  if (bytes.length >= 16 && signature(0,'RIFF') && signature(8,'WEBP') && (signature(12,'VP8 ')||signature(12,'VP8L')||signature(12,'VP8X'))) return 'image/webp';
  return null;
}
