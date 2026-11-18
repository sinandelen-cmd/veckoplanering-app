// Kontroll av förslaget om uppdelning i moment. Ingen text får försvinna, och ingen uppdelning sker utan val.
import assert from 'node:assert/strict'
import { momentSplitSuggestion, withMomentSuggestions, expandUnits } from '../src/momentSplit.js'

const LONG_LESSON = [
  'Repetera begreppen variabel och term med hjälp av exemplen på tavlan. Eleverna arbetar två och två.',
  '1. Ekvationens lika-tecken: Förklara att båda led måste behandlas lika, och visa med en våg eller balans.',
  'Gör exemplen på sidan och förklara varför vi gör samma sak på båda sidor.',
  '2. Lösa enkla ekvationer: Addition och subtraktion av tal, till exempel x + 7 = 12.',
  'Kontrollera svaret genom att sätta in det i ursprungsekvationen.',
  '3. Ekvationer med multiplikation och division: 4x = 20 och x/3 = 5.',
  'Avslutning: Sammanfatta med tre frågor på tavlan och låt eleverna svara i mindre grupper.',
  'Läxa: sida 42–44, uppgift 1–10. Material: räknedosa och balansmodell.',
].join('\n')

const parts = momentSplitSuggestion(LONG_LESSON)
assert.ok(parts && parts.length === 3, 'tre moment förväntades, fick ' + (parts && parts.length))
assert.match(parts[0].title, /^Ekvationens lika-tecken/)
assert.ok(parts[0].title.length <= 90, 'titeln kortas till 90 tecken, men texten ligger kvar i delen')
assert.match(parts[1].title, /^Lösa enkla ekvationer/)
assert.match(parts[2].title, /^Ekvationer med multiplikation/)
// Inget kapas: alla rader finns kvar i någon del, i samma ordning.
assert.equal(parts.map(p => p.body).join('\n'), LONG_LESSON, 'texten ändrades eller kapades vid uppdelning')
// Texten före första momentet hamnar i första delen.
assert.match(parts[0].body, /^Repetera begreppen/)

assert.equal(momentSplitSuggestion('Bara en vanlig text utan nummer.\nNästa rad.'), null, 'ingen uppdelning när det inte finns moment')
assert.equal(momentSplitSuggestion('1. Enda moment\nMer text'), null, 'ett moment är inget förslag')
const moments = momentSplitSuggestion('Moment 1: Tal\nText om tal\nMoment 2: Geometri\nText om geometri')
assert.ok(moments && moments[0].title === 'Tal' && moments[1].title === 'Geometri', 'Moment N: stöds')
const many = Array.from({ length: 13 }, (_, i) => `${i + 1}. Rad ${i + 1}`).join('\n')
assert.equal(momentSplitSuggestion(many), null, 'fler än 12 moment ger inget förslag')

// Förslaget läggs på enheter, men ingen uppdelning sker av sig själv.
const units = withMomentSuggestions([{ week: 47, chapter: 'Ekvationer', topic: 'Lektion 1', details: LONG_LESSON }, { week: 47, chapter: 'Ekvationer', topic: 'Lektion 2', details: 'Vanlig text' }])
assert.equal(units.length, 2)
assert.ok(units[0].momentParts && units[0].momentParts.length === 3, 'förslag saknas')
assert.equal(units[1].momentParts, null)
assert.deepEqual(expandUnits(units, {}), units, 'utan val ska inget ändras')
assert.deepEqual(expandUnits(units, { 0: 'keep' }), units, '"behåll" ska inte ändra något')

// Efter godkänd uppdelning: en enhet per moment, och originaltexten sparas i första momentet.
const split = expandUnits(units, { 0: 'split' })
assert.equal(split.length, 4, 'tre moment + en vanlig enhet')
assert.equal(split[0].topic, parts[0].title)
assert.equal(split[0].originalText, 'Lektion 1\n' + LONG_LESSON, 'originaltexten ska finnas kvar')
assert.equal(split[1].originalText, undefined, 'bara första momentet bär originaltexten')
assert.equal(split.slice(0, 3).map(u => u.details).join('\n'), LONG_LESSON, 'delarna täcker hela texten')
assert.equal(split[3].topic, 'Lektion 2')
console.log('Uppdelning av moment: OK')
