import { createClient } from '@supabase/supabase-js'

// Fail closed: a build without explicit Supabase configuration must never fall back to the production project.
// Production publishing sets these values explicitly (scripts/publish-production.sh).
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Supabase är inte konfigurerat för den här versionen. Ange VITE_SUPABASE_URL och VITE_SUPABASE_ANON_KEY.')
}

export const supabase = createClient(supabaseUrl, supabaseKey)
