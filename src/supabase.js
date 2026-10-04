import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://siirwdmgbxwycndrxduu.supabase.co'
const supabaseKey = 'sb_publishable_rxWH5Fp9KCEQ0madyKmjWw_uhIG5SiM'

export const supabase = createClient(supabaseUrl, supabaseKey)