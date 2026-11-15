// Verifierar publiceringsspärrarna i workflow-filerna. Läser de faktiska if:-raderna från filerna
// och utvärderar dem med GitHubs semantik: ej satta variabler är tom sträng, och jobbet körs endast när uttrycket är sant.
// Detta är en logikkontroll. Körmotorn i GitHub körs inte lokalt.
import fs from 'node:fs'
import assert from 'node:assert/strict'

const readIf = file => {
  const text = fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8')
  const match = text.match(/^\s{4}if: (.+)$/m)
  if (!match) throw new Error('ingen if-spärr i ' + file)
  return match[1].trim()
}
// Oversätt GitHub-uttryck (begränsad delmängd som används här) till JavaScript med kontexten ctx.
const evaluate = (expression, ctx) => {
  const js = expression
    .replace(/github\.ref/g, 'ctx.ref')
    .replace(/vars\.([A-Z_]+)/g, (_, name) => `(ctx.vars.${name} ?? '')`)
    .replace(/inputs\.([a-z]+)/g, (_, name) => `(ctx.inputs.${name} ?? '')`)
    .replace(/==/g, '===')
  return Boolean(new Function('ctx', `return (${js})`)(ctx))
}

const preview = readIf('.github/workflows/publish-class-week-preview.yml')
const production = readIf('.github/workflows/deploy-cloudflare.yml')
const cases = [
  ['förhandsvisning: variabel saknas -> hoppas över', preview, { vars: {} }, false],
  ['förhandsvisning: variabel "false" -> hoppas över', preview, { vars: { ALLOW_PROD_LINKED_PREVIEW: 'false' } }, false],
  ['förhandsvisning: variabel "true" -> körs', preview, { vars: { ALLOW_PROD_LINKED_PREVIEW: 'true' } }, true],
  ['produktion: variabel saknas -> hoppas över', production, { ref: 'refs/heads/main', vars: {}, inputs: { confirm: 'PUBLICERA' } }, false],
  ['produktion: fel gren -> hoppas över', production, { ref: 'refs/heads/feature/x', vars: { ALLOW_PRODUCTION_DEPLOY: 'true' }, inputs: { confirm: 'PUBLICERA' } }, false],
  ['produktion: bekräftelse saknas -> hoppas över', production, { ref: 'refs/heads/main', vars: { ALLOW_PRODUCTION_DEPLOY: 'true' }, inputs: {} }, false],
  ['produktion: fel bekräftelse (gemener) -> hoppas över', production, { ref: 'refs/heads/main', vars: { ALLOW_PRODUCTION_DEPLOY: 'true' }, inputs: { confirm: 'publicera' } }, false],
  ['produktion: alla tre spärrar uppfyllda -> körs', production, { ref: 'refs/heads/main', vars: { ALLOW_PRODUCTION_DEPLOY: 'true' }, inputs: { confirm: 'PUBLICERA' } }, true],
]
let failed = 0
for (const [name, expression, ctx, expected] of cases) {
  try { assert.equal(evaluate(expression, { ref: '', vars: {}, inputs: {}, ...ctx }), expected); console.log('PASS ' + name) }
  catch { failed++; console.log('FAIL ' + name) }
}
// Inga produktionsjobb får köras automatiskt: endast workflow_dispatch.
for (const file of ['.github/workflows/publish-class-week-preview.yml', '.github/workflows/deploy-cloudflare.yml']) {
  const text = fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8')
  assert.doesNotMatch(text, /^on:\s*\n\s+(push|pull_request|schedule):/m, file + ' får inte triggas automatiskt')
}
console.log(failed ? 'Publiceringsspärrar: MISSLYCKADES' : 'Publiceringsspärrar: OK')
process.exit(failed ? 1 : 0)
