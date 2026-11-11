import assert from 'node:assert/strict'
import { booksForSubject, searchTextbooks, buildManualTextbook, isValidIsbn, normalizeIsbn, isDuplicateTextbook } from '../src/textbooks.js'

// ISBN-kontrollsiffra
assert.equal(isValidIsbn('9780306406157'), true, 'giltig ISBN-13')
assert.equal(isValidIsbn('978-0-306-40615-7'), true, 'ISBN-13 med bindestreck')
assert.equal(isValidIsbn('9780306406158'), false, 'ogiltig ISBN-13 (fel kontrollsiffra)')
assert.equal(isValidIsbn('0306406152'), true, 'giltig ISBN-10')
assert.equal(isValidIsbn('030640615X'), false, 'ogiltig ISBN-10 med X')
assert.equal(isValidIsbn('12345'), false, 'för kort')
assert.equal(normalizeIsbn(' 978-0 306 406157 '), '9780306406157')

// Katalog och ISBN-fält
const math = booksForSubject('Grundskola', 'Matematik')
assert.ok(math.length >= 10, 'matematik i grundskolan har böcker')
assert.ok(math.every(book => typeof book.isbn === 'string'), 'alla böcker har ett isbn-fält (tomt tills verifierat)')
assert.ok(math.every(book => book.subject === 'Matematik' && book.school === 'Grundskola'))

// Sökning över alla ämnen
const byTitle = searchTextbooks('Grundskola', 'matte direkt')
assert.ok(byTitle.some(book => book.title === 'Matte Direkt'), 'söker på titel')
const byPublisher = searchTextbooks('Gymnasiet', 'natur & kultur')
assert.ok(byPublisher.some(book => book.title === 'Matematik 5000+'), 'söker på förlag')
assert.ok(byPublisher.length > 0 && byPublisher.every(book => book.school === 'Gymnasiet'), 'söker bara inom valt stadium')
assert.deepEqual(searchTextbooks('Grundskola', '   '), [], 'tom sökning ger inget')

// ISBN-sökning fungerar när ett ISBN finns i katalogen (testar med tillfällig post via manuell registrering)
const manual = buildManualTextbook({ school: 'Grundskola', subject: 'Matematik', title: 'Testbok', publisher: 'Testförlag', isbn: '978-0-306-40615-7' })
assert.equal(manual.ok, true, 'manuell registrering med giltig ISBN')
assert.equal(manual.book.isbn, '9780306406157', 'ISBN normaliseras')

// Manuell registrering: fel
assert.equal(buildManualTextbook({ school: 'Grundskola', subject: 'Matematik', title: '' }).ok, false, 'titel krävs')
assert.equal(buildManualTextbook({ school: 'Grundskola', subject: '', title: 'X' }).ok, false, 'ämne krävs')
assert.equal(buildManualTextbook({ school: 'Förskola', subject: 'Matematik', title: 'X' }).ok, false, 'okänt stadium nekas')
assert.equal(buildManualTextbook({ school: 'Gymnasiet', subject: 'Matematik', title: 'X', isbn: '9780306406158' }).ok, false, 'ogiltig ISBN nekas')
assert.equal(buildManualTextbook({ school: 'Gymnasiet', subject: 'Matematik', title: 'X' }).ok, true, 'ISBN är valfritt')

// Samma läromedel två gånger i samma ämne och stadium nekas
const existing = [{ school: 'Grundskola', subject: 'Matematik', title: 'Matte Direkt' }]
assert.equal(isDuplicateTextbook(existing, { school: 'Grundskola', subject: 'Matematik', title: 'matte  direkt' }), true, 'dubblett oavsett skiftläge och mellanrum')
assert.equal(isDuplicateTextbook(existing, { school: 'Gymnasiet', subject: 'Matematik', title: 'Matte Direkt' }), false, 'annat stadium är inte dubblett')
assert.equal(isDuplicateTextbook(existing, { school: 'Grundskola', subject: 'Svenska', title: 'Matte Direkt' }), false, 'annat ämne är inte dubblett')
assert.equal(buildManualTextbook({ school: 'Grundskola', subject: 'Matematik', title: 'Matte Direkt' }, existing).ok, false, 'manuell dubblett nekas')

// Olika läromedel för samma årskurs/ämne tillåts
assert.equal(isDuplicateTextbook(existing, { school: 'Grundskola', subject: 'Matematik', title: 'Favorit matematik' }), false, 'annat läromedel tillåts')

console.log('Textbook checks: OK')
