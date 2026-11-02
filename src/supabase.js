import { createClient } from '@supabase/supabase-js'

// Preview builds must never silently connect to production.
// The existing production build retains its current configuration until
// a separately approved production migration is planned.
const isolatedPreview = import.meta.env.VITE_ISOLATED_PREVIEW === '1'
const expectedTestUrl = 'https://tdbmhkwsgzflqgmftzyy.supabase.co'
const supabaseUrl = isolatedPreview
  ? import.meta.env.VITE_SUPABASE_URL
  : (import.meta.env.VITE_SUPABASE_URL || 'https://siirwdmgbxwycndrxduu.supabase.co')
const supabaseKey = isolatedPreview
  ? import.meta.env.VITE_SUPABASE_ANON_KEY
  : (import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_rxWH5Fp9KCEQ0madyKmWw_uhIG5SiM')

if (isolatedPreview && (supabaseUrl !== expectedTestUrl || !supabaseKey)) {
  throw new Error('Förhandsvisningen saknar korrekt Supabase-testkonfiguration. Ingen anslutning görs.')
}

export const supabase = createClient(supabaseUrl, supabaseKey)
