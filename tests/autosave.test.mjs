import test from 'node:test'
import assert from 'node:assert/strict'
import { replaceSavedPlanRow, reconcileSavedEditor } from '../src/autosaveUtils.js'

const original = [
  { id: 1, title: 'Matte Direkt 8', content: '{"kind":"arsplanering-v2"}', archived: true, published: false, public_slug: '', class_name: '8A', updated_at: 'old' },
  { id: 2, title: 'Svenska', content: 'other', archived: false }
]

test('autosave updates only the matching cached plan and preserves other rows', () => {
  const result = replaceSavedPlanRow(original, 1, { title: 'Matte 8 ny', content: 'new', updated_at: 'new' }, false, '')
  assert.equal(result[0].title, 'Matte 8 ny')
  assert.equal(result[0].content, 'new')
  assert.equal(result[0].updated_at, 'new')
  assert.equal(result[1], original[1])
  assert.equal(result[0].archived, true)
  assert.equal(result[0].class_name, '8A')
  assert.equal(original[0].title, 'Matte Direkt 8')
})
test('autosave retains published status and public link from confirmed payload', () => {
  const result = replaceSavedPlanRow(original, 1, { title: 'Matte', archived: false }, true, 'matte-8')
  assert.equal(result[0].published, true)
  assert.equal(result[0].public_slug, 'matte-8')
  assert.equal(result[0].archived, false)
})
test('autosave leaves the library unchanged when the id is absent', () => {
  const result = replaceSavedPlanRow(original, 99, { title: 'Unknown' }, false, '')
  assert.deepEqual(result, original)
  assert.equal(result[0], original[0])
})
test('autosave adopts saved payload when no newer edits exist', () => {
  const submitted = { title: 'Matte' }
  const saved = { title: 'Matte', published: true }
  assert.equal(reconcileSavedEditor(submitted, submitted, saved), saved)
})
test('autosave does not overwrite edits made while the request was in flight', () => {
  const submitted = { title: 'Matte' }
  const newer = { title: 'Matte – ny redigering' }
  const saved = { title: 'Matte', published: true }
  assert.equal(reconcileSavedEditor(newer, submitted, saved), newer)
})
