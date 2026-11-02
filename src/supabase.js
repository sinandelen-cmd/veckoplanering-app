import { createClient } from '@supabase/supabase-js'

// Isolated preview: never fall back to production if build configuration is missing.
const expectedProject = 'tdbmhkwsgzflqgmftzyy'
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
if (supabaseUrl !== `https://${expectedProject}.supabase.co` || !supabaseKey) {
  throw new Error('Förhandsvisningen saknar korrekt Supabase-testkonfiguration. Ingen anslutning görs.')
}
export const supabase = createClient(supabaseUrl, supabaseKey)
