import { useState } from 'react'
import { parseOutlineText, addChapter, renameChapter, removeChapter, addMoment, renameMoment, removeMoment, addConcept, editConcept, removeConcept, outlineSummary, emptyOutline } from './chapters.js'

// Kapitel, moment och viktiga begrepp för en läromedelskurs.
// Ändringar sparas först när planeringen sparas (samma flöde som resten av planeringen).
// Import visar alltid en förhandsgranskning och ändrar ingenting förrän användaren godkänner.
export default function ChapterOutlinePanel({ outline, onChange, textbook }) {
  const current = outline || emptyOutline()
  const [newChapter, setNewChapter] = useState('')
  const [newMoment, setNewMoment] = useState({})
  const [newConceptText, setNewConceptText] = useState({})
  const [importText, setImportText] = useState('')
  const [preview, setPreview] = useState(null)
  const [importMode, setImportMode] = useState('append')
  const summary = outlineSummary(current)

  const update = next => onChange(next)

  const previewImport = () => {
    const parsed = parseOutlineText(importText)
    if (!parsed.chapters.length) { setPreview({ error: 'Ingen kapitelstruktur hittades. Skriv kapitelrubriker utan indrag och moment med "-".' }); return }
    setPreview({ outline: parsed, summary: outlineSummary(parsed) })
  }

  const approveImport = () => {
    if (!preview?.outline) return
    const base = importMode === 'replace' ? emptyOutline() : current
    update({ chapters: [...base.chapters, ...preview.outline.chapters] })
    setPreview(null)
    setImportText('')
  }

  return (
    <section className="card chapter-outline-panel" aria-label="Kapitel, moment och viktiga begrepp" style={{ margin: '12px 0', display: 'grid', gap: 10 }}>
      <h3 style={{ margin: 0 }}>Kapitel och moment{textbook ? ` · ${textbook}` : ''}</h3>
      <p className="muted" style={{ margin: 0 }}>{summary.chapters} kapitel · {summary.moments} moment · {summary.concepts} viktiga begrepp</p>

      {current.chapters.map(chapter => (
        <div key={chapter.id} style={{ border: '1px solid #e1d7c8', borderRadius: 10, padding: 10, display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input aria-label="Kapitelnamn" value={chapter.title} onChange={event => update(renameChapter(current, chapter.id, event.target.value))} style={{ fontWeight: 700, flex: '1 1 200px' }} />
            <button type="button" className="secondary" onClick={() => { if (window.confirm(`Ta bort kapitlet "${chapter.title}" med alla moment och begrepp?`)) update(removeChapter(current, chapter.id)) }}>Ta bort kapitel</button>
          </div>
          {chapter.moments.map(moment => (
            <div key={moment.id} style={{ marginLeft: 12, display: 'grid', gap: 6 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input aria-label="Momentnamn" value={moment.title} onChange={event => update(renameMoment(current, moment.id, event.target.value))} style={{ flex: '1 1 200px' }} />
                <button type="button" className="secondary" onClick={() => { if (window.confirm(`Ta bort momentet "${moment.title}" och dess begrepp?`)) update(removeMoment(current, moment.id)) }}>Ta bort moment</button>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} aria-label="Viktiga begrepp">
                {moment.concepts.map((concept, index) => (
                  <span key={`${concept}-${index}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#fff4d6', borderRadius: 999, padding: '2px 8px' }}>
                    <input aria-label={`Begrepp ${concept}`} value={concept} onChange={event => update(editConcept(current, moment.id, index, event.target.value))} style={{ border: 'none', background: 'transparent', width: Math.max(6, concept.length + 1) + 'ch' }} />
                    <button type="button" aria-label={`Ta bort begreppet ${concept}`} onClick={() => update(removeConcept(current, moment.id, index))} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>×</button>
                  </span>
                ))}
              </div>
              <form style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} onSubmit={event => { event.preventDefault(); const text = newConceptText[moment.id] || ''; if (!text.trim()) return; update(addConcept(current, moment.id, text)); setNewConceptText(prev => ({ ...prev, [moment.id]: '' })) }}>
                <input aria-label="Nytt viktigt begrepp" placeholder="Nytt begrepp" value={newConceptText[moment.id] || ''} onChange={event => setNewConceptText(prev => ({ ...prev, [moment.id]: event.target.value }))} />
                <button type="submit" className="secondary">Lägg till begrepp</button>
              </form>
            </div>
          ))}
          <form style={{ marginLeft: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }} onSubmit={event => { event.preventDefault(); const text = newMoment[chapter.id] || ''; if (!text.trim()) return; update(addMoment(current, chapter.id, text)); setNewMoment(prev => ({ ...prev, [chapter.id]: '' })) }}>
            <input aria-label="Nytt moment" placeholder="Nytt moment" value={newMoment[chapter.id] || ''} onChange={event => setNewMoment(prev => ({ ...prev, [chapter.id]: event.target.value }))} />
            <button type="submit" className="secondary">Lägg till moment</button>
          </form>
        </div>
      ))}

      <form style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} onSubmit={event => { event.preventDefault(); if (!newChapter.trim()) return; update(addChapter(current, newChapter)); setNewChapter('') }}>
        <input aria-label="Nytt kapitel" placeholder="Nytt kapitel, t.ex. Geometri" value={newChapter} onChange={event => setNewChapter(event.target.value)} />
        <button type="submit" className="secondary">Lägg till kapitel</button>
      </form>

      <details>
        <summary>Importera kapitel och moment från text</summary>
        <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
          <p className="muted" style={{ margin: 0 }}>Skriv eller klistra in kapitelrubriker utan indrag. Moment börjar med "-". Viktiga begrepp skrivs som "Begrepp: a, b" under momentet.</p>
          <textarea aria-label="Text att importera" rows={8} value={importText} onChange={event => { setImportText(event.target.value); setPreview(null) }} placeholder={'Geometri\n- Triangel\nBegrepp: hörn, sida, vinkel\n- Area'} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" className="secondary" disabled={!importText.trim()} onClick={previewImport}>Förhandsgranska</button>
            <label><input type="radio" name="import-mode" checked={importMode === 'append'} onChange={() => setImportMode('append')} /> Lägg till efter befintliga</label>
            <label><input type="radio" name="import-mode" checked={importMode === 'replace'} onChange={() => setImportMode('replace')} /> Ersätt alla kapitel</label>
          </div>
          {preview?.error && <p role="alert" className="status">{preview.error}</p>}
          {preview?.outline && (
            <div role="region" aria-label="Förhandsgranskning" style={{ border: '1px dashed #c9b99a', borderRadius: 10, padding: 10 }}>
              <strong>Förhandsgranskning: {preview.summary.chapters} kapitel · {preview.summary.moments} moment · {preview.summary.concepts} begrepp</strong>
              <ul>{preview.outline.chapters.map(chapter => <li key={chapter.id}>{chapter.title}<ul>{chapter.moments.map(moment => <li key={moment.id}>{moment.title}{moment.concepts.length ? ` (${moment.concepts.join(', ')})` : ''}</li>)}</ul></li>)}</ul>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="primary" onClick={approveImport}>Godkänn import</button>
                <button type="button" className="secondary" onClick={() => setPreview(null)}>Avbryt</button>
              </div>
              <p className="muted" style={{ margin: '6px 0 0' }}>Ingenting sparas förrän du godkänner importen och sedan sparar planeringen.</p>
            </div>
          )}
        </div>
      </details>
    </section>
  )
}
