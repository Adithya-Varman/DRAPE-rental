// Image intake for uploads: sniff the real type from magic bytes (never trust the client's MIME), then store.
import { HttpError, requireEnv } from './http.js'
import { db, LISTING_BUCKET } from './supabase.js'

// Vercel Functions reject request bodies over 4.5 MB; the UI downsizes photos before upload to stay well under.
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024

const TYPES = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic' } as const
type Ext = keyof typeof TYPES

export function sniffImage(bytes: Uint8Array): { ext: Ext; mime: string } | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to))
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { ext: 'jpeg', mime: TYPES.jpeg }
  if (bytes[0] === 0x89 && ascii(1, 4) === 'PNG') return { ext: 'png', mime: TYPES.png }
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return { ext: 'webp', mime: TYPES.webp }
  if (ascii(4, 8) === 'ftyp' && /^(heic|heix|hevc|mif1|msf1|heif)$/.test(ascii(8, 12))) return { ext: 'heic', mime: TYPES.heic }
  return null
}

export async function readImage(request: Request): Promise<{ bytes: Uint8Array; ext: Ext; mime: string }> {
  const form = await request.formData().catch(() => { throw new HttpError(400, 'Expected multipart/form-data with an "image" field') })
  const file = form.get('image')
  if (!(file instanceof Blob) || file.size === 0) throw new HttpError(400, 'Missing "image" file')
  if (file.size > MAX_IMAGE_BYTES) throw new HttpError(413, 'Image is too large (max 4 MB)')
  const bytes = new Uint8Array(await file.arrayBuffer())
  const type = sniffImage(bytes)
  if (!type) throw new HttpError(415, 'Unsupported image type — use JPEG, PNG, WebP or HEIC')
  return { bytes, ...type }
}

export async function storeImage(image: { bytes: Uint8Array; ext: string; mime: string }): Promise<{ path: string; url: string }> {
  const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${image.ext}`
  const { error } = await db().storage.from(LISTING_BUCKET).upload(path, image.bytes, { contentType: image.mime, upsert: false })
  if (error) throw error
  return { path, url: db().storage.from(LISTING_BUCKET).getPublicUrl(path).data.publicUrl }
}

export async function removeImage(path: string): Promise<void> {
  const { error } = await db().storage.from(LISTING_BUCKET).remove([path])
  if (error) console.warn('Could not remove image', path, error.message)
}

// Listings may only point at images this app stored — never arbitrary URLs.
export function isOwnImageUrl(url: string): boolean {
  const prefix = `${requireEnv('SUPABASE_URL').replace(/\/$/, '')}/storage/v1/object/public/${LISTING_BUCKET}/`
  return url.startsWith(prefix) && !url.slice(prefix.length).includes('..')
}
