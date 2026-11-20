import { createClient } from '@supabase/supabase-js'
import { createTimeoutFetch } from './requestTimeout.js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://siirwdmgbxwycndrxduu.supabase.co'
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_rxWH5Fp9KCEQ0madyKmjWw_uhIG5SiM'
// Standard 30 sekunder. VITE_REQUEST_TIMEOUT_MS kan sättas i testbyggen.
const requestTimeoutMs = Number(import.meta.env.VITE_REQUEST_TIMEOUT_MS) || 30000

export const supabase = createClient(supabaseUrl, supabaseKey, {
  global: { fetch: createTimeoutFetch(requestTimeoutMs) },
})
