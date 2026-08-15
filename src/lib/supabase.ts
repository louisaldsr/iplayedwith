import { createClient } from '@supabase/supabase-js';

const url  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Read-only client — safe to use in browser and server. Uses anon key + RLS. */
export const supabase = createClient(url, anon);

/** Admin client — server-side only. Bypasses RLS via service_role key. */
export const supabaseAdmin = () => {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
};
