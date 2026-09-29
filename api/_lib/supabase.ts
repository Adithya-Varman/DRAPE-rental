// Server-only Supabase client (service role). Never import this from src/.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Area } from '../../shared/contracts.js'
import { HttpError, requireEnv } from './http.js'

let client: SupabaseClient | null = null

export function db(): SupabaseClient {
  client ??= createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return client
}

export const LISTING_BUCKET = 'listings'

// Everything a browser may see about a listing. owner_contact, embedding and location are deliberately excluded.
export const PUBLIC_LISTING_COLUMNS =
  'id, created_at, owner_name, image_url, title, category, gender, occasions, style_tags, colors, formality, size, price_per_day, area, description'

export async function listAreas(): Promise<Area[]> {
  const { data, error } = await db().from('areas').select('name, lat, lng').order('name')
  if (error) throw error
  return data
}

export async function getArea(name: string): Promise<Area> {
  const { data, error } = await db().from('areas').select('name, lat, lng').eq('name', name).maybeSingle()
  if (error) throw error
  if (!data) throw new HttpError(400, `Unknown area: ${name}`)
  return data
}
