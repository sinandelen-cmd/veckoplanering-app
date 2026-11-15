import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { resolve } from 'node:path'

// Varje bygge får ett unikt ID. Det används av den automatiska versionskontrollen i src/appVersion.js.
const buildId = `${Date.now().toString(36)}-${(process.env.GITHUB_SHA || 'local').slice(0, 8)}`

function buildVersionFile() {
  return {
    name: 'build-version-file',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ buildId }) + '\n' })
    },
  }
}

export default defineConfig({
  plugins: [react(), buildVersionFile()],
  define: { __APP_BUILD_ID__: JSON.stringify(buildId) },
  build: { rollupOptions: { input: { main: resolve(import.meta.dirname, 'index.html'), weekly: resolve(import.meta.dirname, 'veckoplanering.html') } } },
})
