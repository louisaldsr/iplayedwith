import { supabaseAdmin } from '@/lib/supabase'

export function getDb() {
  return supabaseAdmin()
}
