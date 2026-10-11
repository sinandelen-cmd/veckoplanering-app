import fs from 'node:fs'
import assert from 'node:assert/strict'

const source = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const annualApp = source.slice(source.indexOf('function AnnualApp()'))
assert.match(annualApp, /return <TeacherApp\s+key=\{session\.user\.id\}\s+session=\{session\}\s*\/>/, 'Lärarvyn måste monteras om vid kontobyte så att föregående kontos lokala data inte visas')
console.log('Annual account isolation check: OK')
