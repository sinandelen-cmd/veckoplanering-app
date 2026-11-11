// Kapitel, moment och viktiga begrepp för en läromedelskurs.
// Kapitelstrukturen är en ren datamodell: { chapters: [{ id, title, moments: [{ id, title, concepts: [string] }] }] }
// Alla funktioner returnerar en ny struktur och ändrar inte indata.

let counter = 0
const newId = prefix => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`
const clean = value => String(value || '').replace(/\s+/g, ' ').trim()

export function emptyOutline() {
  return { chapters: [] }
}

// Tar en platt lista med rader: en rad utan indrag är kapitel, en rad med "-" är moment,
// och "Begrepp:" följt av kommaseparerade begrepp hör till föregående moment.
export function parseOutlineText(text) {
  const outline = emptyOutline()
  let chapter = null
  let moment = null
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/\t/g, '  ')
    if (!line.trim()) continue
    const trimmed = clean(line)
    if (/^begrepp\s*:/i.test(trimmed)) {
      if (!moment) moment = ensureMoment(outline, chapter)
      const items = trimmed.replace(/^begrepp\s*:/i, '').split(',').map(clean).filter(Boolean)
      moment.concepts = [...new Set([...moment.concepts, ...items])]
      continue
    }
    if (/^\s*[-•]/.test(line)) {
      if (!chapter) chapter = addChapterInPlace(outline, 'Kapitel 1')
      moment = addMomentInPlace(chapter, trimmed.replace(/^[-•]\s*/, ''))
      continue
    }
    chapter = addChapterInPlace(outline, trimmed)
    moment = null
  }
  return outline
}

function addChapterInPlace(outline, title) {
  const chapter = { id: newId('ch'), title: clean(title) || 'Kapitel', moments: [] }
  outline.chapters.push(chapter)
  return chapter
}

function addMomentInPlace(chapter, title) {
  const moment = { id: newId('mo'), title: clean(title) || 'Moment', concepts: [] }
  chapter.moments.push(moment)
  return moment
}

function ensureMoment(outline, chapter) {
  if (!chapter) chapter = addChapterInPlace(outline, 'Kapitel 1')
  return addMomentInPlace(chapter, 'Moment')
}

export function addChapter(outline, title) {
  const cleanTitle = clean(title)
  if (!cleanTitle) return outline
  return { chapters: [...outline.chapters, { id: newId('ch'), title: cleanTitle, moments: [] }] }
}

export function renameChapter(outline, chapterId, title) {
  const cleanTitle = clean(title)
  if (!cleanTitle) return outline
  return { chapters: outline.chapters.map(ch => ch.id === chapterId ? { ...ch, title: cleanTitle } : ch) }
}

export function removeChapter(outline, chapterId) {
  return { chapters: outline.chapters.filter(ch => ch.id !== chapterId) }
}

export function addMoment(outline, chapterId, title) {
  const cleanTitle = clean(title)
  if (!cleanTitle) return outline
  return {
    chapters: outline.chapters.map(ch => ch.id === chapterId
      ? { ...ch, moments: [...ch.moments, { id: newId('mo'), title: cleanTitle, concepts: [] }] }
      : ch)
  }
}

export function renameMoment(outline, momentId, title) {
  const cleanTitle = clean(title)
  if (!cleanTitle) return outline
  return mapMoments(outline, momentId, moment => ({ ...moment, title: cleanTitle }))
}

export function removeMoment(outline, momentId) {
  return {
    chapters: outline.chapters.map(ch => ({ ...ch, moments: ch.moments.filter(mo => mo.id !== momentId) }))
  }
}

// Begrepp är unika per moment (skiftlägesoberoende) och tomma värden ignoreras.
export function addConcept(outline, momentId, concept) {
  const value = clean(concept)
  if (!value) return outline
  return mapMoments(outline, momentId, moment => {
    if (moment.concepts.some(item => item.toLocaleLowerCase('sv') === value.toLocaleLowerCase('sv'))) return moment
    return { ...moment, concepts: [...moment.concepts, value] }
  })
}

export function editConcept(outline, momentId, index, value) {
  const cleanValue = clean(value)
  if (!cleanValue) return removeConcept(outline, momentId, index)
  return mapMoments(outline, momentId, moment => ({
    ...moment,
    concepts: moment.concepts.map((item, i) => i === index ? cleanValue : item)
  }))
}

export function removeConcept(outline, momentId, index) {
  return mapMoments(outline, momentId, moment => ({
    ...moment,
    concepts: moment.concepts.filter((_, i) => i !== index)
  }))
}

function mapMoments(outline, momentId, transform) {
  return {
    chapters: outline.chapters.map(ch => ({
      ...ch,
      moments: ch.moments.map(mo => mo.id === momentId ? transform(mo) : mo)
    }))
  }
}

// Summerar för förhandsgranskning före import.
export function outlineSummary(outline) {
  const moments = outline.chapters.reduce((total, ch) => total + ch.moments.length, 0)
  const concepts = outline.chapters.reduce((total, ch) => total + ch.moments.reduce((sum, mo) => sum + mo.concepts.length, 0), 0)
  return { chapters: outline.chapters.length, moments, concepts }
}
