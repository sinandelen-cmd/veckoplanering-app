// Testkonfiguration: byter ut src/supabase.js mot den fiktiva klienten. Används enbart av UI-testerna.
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
const fakePath = fileURLToPath(new URL('./fake-supabase.js', import.meta.url))
export default {
  root: fileURLToPath(new URL('../../', import.meta.url)),
  configFile: false,
  plugins: [react(), {
    name: 'fake-supabase',
    enforce: 'pre',
    resolveId(source, importer) {
      if (importer && importer.includes('/src/') && /(^|\/)supabase(\.js)?$/.test(source)) return fakePath
      return null
    },
  }],
  logLevel: 'silent',
  server: { port: 5220, strictPort: true },
}
