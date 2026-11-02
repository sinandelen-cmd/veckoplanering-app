// Pure helpers for safely updating the cached library after a successful save.
export function replaceSavedPlanRow(rows, savedId, savedRow, published, publicSlug) {
  return rows.map(item => item.id === savedId
    ? { ...item, ...savedRow, id: savedId, published, public_slug: publicSlug }
    : item)
}

// Keep edits made after the save request began; only adopt the saved payload
// when the editor still holds the exact snapshot that was submitted.
export function reconcileSavedEditor(current, submitted, savedPayload) {
  return current === submitted ? savedPayload : current
}
