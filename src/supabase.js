import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://siirwdmgbxwycndrxduu.supabase.co'
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_rxWH5Fp9KCEQ0madyKmjWw_uhIG5SiM'

export const supabase = createClient(supabaseUrl, supabaseKey)
