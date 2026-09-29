// Small browser helpers: distances, formatting, image downscaling, safe localStorage.
import type { Area } from '../shared/contracts'
import { CATEGORY_LABELS, OCCASION_LABELS, type Category, type Occasion } from '../shared/vocab'

// Great-circle distance between two areas' centroids (listings store their area, so this is what "nearby" means in v0).
export function kmBetween(a: Pick<Area, 'lat' | 'lng'>, b: Pick<Area, 'lat' | 'lng'>): number {
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(h))
}

export const formatKm = (km: number | null | undefined) =>
  km == null ? null : km < 0.95 ? 'Nearby' : `${km < 10 ? km.toFixed(1) : Math.round(km)} km`

export const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`

export const occasionLabel = (o: string) => OCCASION_LABELS[o as Occasion] ?? o.replace(/_/g, ' ')
export const categoryLabel = (c: string) => CATEGORY_LABELS[c as Category] ?? c.replace(/_/g, ' ')
export const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase())

// Phone photos are often 4–12 MB; Vercel caps request bodies at 4.5 MB. Downscale to ≤1600 px JPEG before upload,
// which also makes the vision call faster. Falls back to the original file if the browser can't decode it.
export async function downscaleImage(file: File, maxSide = 1600, quality = 0.85): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    return blob ?? file
  } catch {
    return file
  }
}

export const storage = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key)
      return raw === null ? fallback : (JSON.parse(raw) as T)
    } catch { return fallback }
  },
  set(key: string, value: unknown) {
    try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* private mode / blocked storage */ }
  },
}
