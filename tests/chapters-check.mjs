import assert from 'node:assert/strict'
import * as C from '../src/chapters.js'

// Import från text: kapitel, moment och begrepp
const text = [
  'Geometri',
  '- Triangel',
  'Begrepp: hörn, sida, vinkel',
  '- Area',
  'Begrepp: area, kvadratmeter',
  'Algebra',
  '- Ekvationer',
  'Begrepp: obekant, Obekant',
].join('\n')
const parsed = C.parseOutlineText(text)
assert.deepEqual(parsed.chapters.map(ch => ch.title), ['Geometri', 'Algebra'])
assert.deepEqual(parsed.chapters[0].moments.map(mo => mo.title), ['Triangel', 'Area'])
assert.deepEqual(parsed.chapters[0].moments[0].concepts, ['hörn', 'sida', 'vinkel'])
assert.deepEqual(parsed.chapters[1].moments[0].concepts, ['obekant', 'Obekant'], 'begrepp i import behålls som skrivna, dubbletter av samma ord med skiftläge tas bort vid redigering')
assert.deepEqual(C.outlineSummary(parsed), { chapters: 2, moments: 3, concepts: 7 })

// Begrepp utan föregående moment hamnar i ett skapat moment
const orphan = C.parseOutlineText('Begrepp: a, b')
assert.equal(orphan.chapters[0].moments[0].concepts.length, 2)

// Redigering är oföränderlig
const empty = C.emptyOutline()
const withChapter = C.addChapter(empty, 'Geometri')
assert.equal(empty.chapters.length, 0, 'indata ändras inte')
const chapterId = withChapter.chapters[0].id
const withMoment = C.addMoment(withChapter, chapterId, 'Triangel')
const momentId = withMoment.chapters[0].moments[0].id
const withConcept = C.addConcept(withMoment, momentId, '  hörn  ')
assert.deepEqual(withConcept.chapters[0].moments[0].concepts, ['hörn'], 'begrepp trimmas')
assert.equal(C.addConcept(withConcept, momentId, 'HÖRN').chapters[0].moments[0].concepts.length, 1, 'dubblett med annat skiftläge nekas')
assert.equal(C.addConcept(withConcept, momentId, '   ').chapters[0].moments[0].concepts.length, 1, 'tomt begrepp nekas')

// Redigera och ta bort begrepp
const edited = C.editConcept(withConcept, momentId, 0, 'vinkel')
assert.deepEqual(edited.chapters[0].moments[0].concepts, ['vinkel'])
assert.deepEqual(C.editConcept(edited, momentId, 0, '  ').chapters[0].moments[0].concepts, [], 'tomt redigerat värde tar bort begreppet')
assert.deepEqual(C.removeConcept(withConcept, momentId, 0).chapters[0].moments[0].concepts, [])

// Kapitel och moment: byt namn, ta bort
const renamed = C.renameChapter(withMoment, chapterId, 'Geometri 2')
assert.equal(renamed.chapters[0].title, 'Geometri 2')
assert.equal(C.renameChapter(withMoment, chapterId, '').chapters[0].title, 'Geometri', 'tomt namn ignoreras')
assert.equal(C.renameMoment(withMoment, momentId, 'Triangel 2').chapters[0].moments[0].title, 'Triangel 2')
assert.equal(C.removeMoment(withMoment, momentId).chapters[0].moments.length, 0)
assert.equal(C.removeChapter(withMoment, chapterId).chapters.length, 0)
assert.equal(C.addChapter(empty, '   ').chapters.length, 0, 'tomt kapitelnamn nekas')

console.log('Chapter checks: OK')
