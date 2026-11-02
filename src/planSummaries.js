// Guard against writing list summaries back to full planning rows.
export function isFullPlanRow(row) {
  return row?.is_summary === false
}
export function isArsplanKind(data) {
  return data?.kind === 'arsplanering-v2' || data?.kind === 'arsplanering-v1'
}
export function assertWritableFullRow(row, stored) {
  if (!isFullPlanRow(row)) throw new Error('Planeringen måste läsas in helt innan den kan ändras. Ingen ändring gjordes.')
  if (!stored || typeof stored !== 'object') throw new Error('Planeringens innehåll kunde inte läsas. Ingen ändring gjordes.')
  if (stored.kind === 'arsplanering-v2' && !Array.isArray(stored.weeksData)) throw new Error('Planeringens veckodata saknas. Ändringen avbröts för att inte skriva över innehållet.')
}
export function planSummaryContent(content) {
  if (content === null || content === undefined || content === '') return content
  let parsed
  try { parsed = JSON.parse(content) } catch { return content }
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.kind === 'arsplanering-v2') {
    const rest = { ...parsed }
    delete rest.weeksData
    return JSON.stringify(rest)
  }
  return content
}
