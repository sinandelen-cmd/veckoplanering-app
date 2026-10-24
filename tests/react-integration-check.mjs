import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

// Actual JSX/React integration: Vite transforms the production component,
// React renders it on the server. No browser, network or production access.
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
try {
  const { default: ClassSchedules, buildClassSchedule, remapClassOverridesAfterInsertion } =
    await server.ssrLoadModule('/src/ClassSchedules.jsx')
  const week = (weekStart, id) => ({
    weekStart, weekNumber: Number(weekStart.slice(-2)),
    title: 'Vecka ' + weekStart, lessons: [{ id, name: id, topics: [{ name: id }] }]
  })
  const before = {
    startDate: '2026-01-05',
    weeksData: [week('2026-01-05', 'Original 1'),week('2026-01-12', 'Original 2'),week('2026-01-19', 'Original 3')],
    classGroups: [
      { name: '8A', startDate:'2026-01-05', days:['Måndag'], overrides: { '1': {text:'Klass A original två'} } },
      { name: '8B', startDate:'2026-01-05', days:['Fredag'], overrides: { '1': {text:'Klass B original två'} } }
    ]
  }
  const next = {
    ...before, weeksData:[
      before.weeksData[0],week('2026-01-12','Ny provvecka'),
      { ...before.weeksData[1],weekStart:'2026-01-19' },
      { ...before.weeksData[2],weekStart:'2026-01-26' }
    ]
  }
  next.classGroups = remapClassOverridesAfterInsertion(before,next,0)
  assert.equal(buildClassSchedule(next,next.classGroups[0])[2].lesson.name,'Original 2')
  assert.equal(buildClassSchedule(next,next.classGroups[0])[2].override.text,'Klass A original två')
  assert.equal(buildClassSchedule(next,next.classGroups[1])[2].override.text,'Klass B original två')
  const html = renderToStaticMarkup(React.createElement(ClassSchedules,{plan:next,onChange:()=>{}}))
  assert.match(html,/Klasser och schema/)
  assert.match(html,/Klass A original två/)
  assert.match(html,/8A/)
  assert.match(html,/8B/)
  assert.doesNotMatch(html,/onClick=/)
  console.log('PASS React SSR integration: real JSX component renders shifted class overrides for both groups')
} finally {
  await server.close()
}
