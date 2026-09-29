// Browser auth client — used ONLY for sign-in / sign-up / session. All data goes through /api.
// Uses Supabase's standalone auth library rather than the full client (the full client more than doubled the bundle).
import { AuthClient } from '@supabase/auth-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

export const supabase = url && key
  ? {
      auth: new AuthClient({
        url: `${url.replace(/\/$/, '')}/auth/v1`,
        headers: { apikey: key },
        storageKey: 'drape:auth',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      }),
    }
  : null

export async function accessToken(): Promise<string | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}
