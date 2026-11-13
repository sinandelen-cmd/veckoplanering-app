// Word-export (.docx) av planeringens veckor. Ett redigerbart Word-dokument i liggande A4.
// Varje vecka blir en rubrik, kapitel ett eget stycke, och varje lektion ett stycke med fältordningen Moment, Sida, Uppgift.
import { makeZip } from './zipStore.js'

const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function para(text, { bold = false, size = 20, color = '000000', spacingAfter = 60, keepNext = false } = {}) {
  const lines = String(text ?? '').split('\n')
  const runs = lines.map((line, i) => `${i ? '<w:r><w:br/></w:r>' : ''}<w:r><w:rPr>${bold ? '<w:b/>' : ''}<w:color w:val="${color}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr><w:t xml:space="preserve">${esc(line)}</w:t></w:r>`).join('')
  return `<w:p><w:pPr>${keepNext ? '<w:keepNext/>' : ''}<w:spacing w:before="0" w:after="${spacingAfter}"/></w:pPr>${runs}</w:p>`
}

function fieldPara(label, value) {
  const text = String(value ?? '').trim()
  if (!text) return ''
  const runs = text.split('\n').map((line, i) => `${i ? '<w:r><w:br/></w:r>' : ''}<w:r><w:rPr><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr><w:t xml:space="preserve">${esc(line)}</w:t></w:r>`).join('')
  return `<w:p><w:pPr><w:spacing w:before="0" w:after="40"/><w:ind w:left="284"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="555555"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr><w:t xml:space="preserve">${esc(label)} </w:t></w:r>${runs}</w:p>`
}

export function weekBody(week) {
  const number = week.printWeekNumber ?? week.weekNumber
  const parts = [para(`Vecka ${number}`, { bold: true, size: 28, color: '5A2B2B', spacingAfter: 20, keepNext: true }), para(week.weekStart || '', { size: 18, color: '666666', spacingAfter: 40, keepNext: true })]
  if (week.chapter) parts.push(para(String(week.chapter).trim(), { bold: true, size: 22, color: '5A3B2E', spacingAfter: 80, keepNext: true }))
  const lessons = Array.isArray(week.lessons) ? week.lessons : []
  lessons.forEach((lesson, li) => {
    parts.push(para(lesson?.name || `Lektion ${li + 1}`, { bold: true, size: 20, spacingAfter: 30, keepNext: true }))
    const topics = Array.isArray(lesson?.topics) ? lesson.topics : []
    topics.forEach(topic => {
      parts.push(fieldPara('Moment', topic?.name))
      parts.push(fieldPara('Sida', [...(Array.isArray(topic?.pages) ? topic.pages : []), topic?.description].filter(Boolean).join('\n')))
      parts.push(fieldPara('Uppgift', (Array.isArray(topic?.assignments) ? topic.assignments : []).filter(Boolean).join('\n')))
    })
    parts.push('<w:p><w:pPr><w:spacing w:before="0" w:after="80"/></w:pPr></w:p>')
  })
  return parts.join('')
}

// weeks: den valda listan med veckor (filtreras av anroparen). Dolda veckor utelämnas.
export function buildDocxBytes(title, weeks) {
  const visible = (weeks || []).filter(week => week && !week.hidden).slice().sort((a, b) => String(a.weekStart || '').localeCompare(String(b.weekStart || '')))
  const body = [para(title || 'Årsplanering', { bold: true, size: 32, color: '2B3A4A', spacingAfter: 200 })]
  visible.forEach((week, index) => {
    body.push(weekBody(week))
    if (index < visible.length - 1) body.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>')
  })
  const documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + body.join('') + '<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="850" w:right="850" w:bottom="850" w:left="850" w:header="400" w:footer="400" w:gutter="0"/></w:sectPr></w:body></w:document>'
  const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>'
  const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>'
  const core = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>' + esc(title || 'Årsplanering') + '</dc:title></cp:coreProperties>'
  const enc = new TextEncoder()
  return makeZip([
    { name: '[Content_Types].xml', data: enc.encode(contentTypes) },
    { name: '_rels/.rels', data: enc.encode(rels) },
    { name: 'word/document.xml', data: enc.encode(documentXml) },
    { name: 'docProps/core.xml', data: enc.encode(core) },
  ])
}

export function downloadDocx(title, weeks) {
  const bytes = buildDocxBytes(title, weeks)
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = (String(title || 'arsplanering').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'arsplanering') + '.docx'
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
