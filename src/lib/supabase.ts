import {
  createClient,
  type PostgrestSingleResponse,
} from '@supabase/supabase-js'
import type { Database } from './database.types'
import { QueryError } from './fetchAll'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (see .env.example)',
  )
}

/** Typed client. Reads are public (anon key, single-tenant); see README. */
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)

/** Return `data` or throw a QueryError. Use on every awaited query so no error is swallowed. */
export function unwrap<T>(res: PostgrestSingleResponse<T>): T {
  if (res.error) throw new QueryError(res.error, res.status)
  return res.data
}

/** Like unwrap, but also returns the `count: 'exact'` total. */
export function unwrapCount<T>(res: PostgrestSingleResponse<T>): {
  data: T
  count: number | null
} {
  if (res.error) throw new QueryError(res.error, res.status)
  return { data: res.data, count: res.count }
}
