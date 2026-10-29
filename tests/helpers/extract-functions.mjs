// Hämtar namngivna toppnivåfunktioner ur en JSX-fil. Filen transpileras först
// (JSX -> JavaScript) så att kodsnuttarna kan köras i vm utan att JSX-syntax
// hamnar i testet. Beroenden till andra toppnivåfunktioner i samma fil följer med.
import fs from 'node:fs'
import { transformWithOxc } from 'vite'

function functionEnd(code, start) {
  let i = code.indexOf('{', start)
  let depth = 0
  for (; i < code.length; i++) {
    const ch = code[i]
    if (ch === '/' && code[i + 1] === '/') { i = code.indexOf('\n', i); continue }
    if (ch === '/' && code[i + 1] === '*') { i = code.indexOf('*/', i) + 1; continue }
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch
      for (i++; i < code.length && code[i] !== quote; i++) if (code[i] === '\\') i++
      continue
    }
    if (ch === '{') depth++
    if (ch === '}' && --depth === 0) return i + 1
  }
  throw new Error('Kunde inte hitta slutet på funktionen')
}

export async function loadFunctions(url, names) {
  const raw = fs.readFileSync(url, 'utf8')
  const code = (await transformWithOxc(raw, url.pathname, { lang: 'jsx' })).code
  const decls = new Map()
  for (const m of code.matchAll(/^(?:export )?function (\w+)\(/gm)) {
    decls.set(m[1], code.slice(m.index, functionEnd(code, m.index)).replace(/^export /, ''))
  }
  // Toppnivåkonstanter (const X = [...] / {...} / värde) på egna rader.
  for (const m of code.matchAll(/^const (\w+) = ([^\n]*)$/gm)) {
    if (decls.has(m[1])) continue
    const multi = /[[{]$/.test(m[0])
    const stop = multi ? code.indexOf('\n]', m.index) + 2 : code.indexOf('\n', m.index)
    const close = multi ? code.indexOf('\n', stop) : stop
    decls.set(m[1], code.slice(m.index, close === -1 ? code.length : close))
  }
  const wanted = new Set()
  const queue = [...names]
  while (queue.length) {
    const name = queue.pop()
    if (wanted.has(name) || !decls.has(name)) continue
    wanted.add(name)
    for (const word of decls.get(name).match(/\b\w+\b/g) || []) queue.push(word)
  }
  return [...decls].filter(([name]) => wanted.has(name)).map(([, src]) => src).join('\n\n')
}
