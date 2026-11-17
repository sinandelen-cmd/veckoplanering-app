// Scrollar sidan nedåt i små steg med mushjulet, som en användare gör. Veckor ritas när de närmar sig skärmen,
// så tester som letar efter innehåll längre ned måste gå igenom sidan först.
// Returnerar hur många platshållare som syntes i rutan under scrollningen (ska vara 0).
export async function scrollThroughPlan(page, { step = 400, maxSteps = 400 } = {}) {
  const visiblePlaceholders = () => page.evaluate(() => [...document.querySelectorAll('.teacher-week-lazy-placeholder')].filter(e => {
    const b = e.getBoundingClientRect()
    return b.height > 0 && b.bottom > 0 && b.top < window.innerHeight
  }).length)
  let maxVisible = 0
  await page.evaluate(() => window.scrollTo(0, 0))
  for (let i = 0; i < maxSteps; i++) {
    await page.evaluate(s => window.scrollBy(0, s), step)
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))
    maxVisible = Math.max(maxVisible, await visiblePlaceholders())
    const atEnd = await page.evaluate(() => window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2)
    if (atEnd) break
  }
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))
  return maxVisible
}
