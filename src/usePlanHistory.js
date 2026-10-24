import { useEffect, useRef, useState } from 'react'

// Shared by the production App and isolated Chromium tests.
// The history state belongs to the current mounted plan editor.
export function usePlanHistory(plan, setPlan) {
  const historyRef = useRef({ past: [], current: JSON.stringify(plan), future: [] })
  const historySkipRef = useRef(false)
  const [historyVersion, setHistoryVersion] = useState(0)
  useEffect(() => {
    const next = JSON.stringify(plan)
    const history = historyRef.current
    if (next === history.current) return
    if (historySkipRef.current) {
      historySkipRef.current = false
      history.current = next
      return
    }
    history.past.push(history.current)
    if (history.past.length > 60) history.past.shift()
    history.current = next
    history.future = []
    setHistoryVersion(v => v + 1)
  }, [plan])
  const undoPlan = () => {
    const h = historyRef.current
    if (!h.past.length) return
    h.future.unshift(h.current)
    h.current = h.past.pop()
    historySkipRef.current = true
    setPlan(JSON.parse(h.current))
    setHistoryVersion(v => v + 1)
  }
  const redoPlan = () => {
    const h = historyRef.current
    if (!h.future.length) return
    h.past.push(h.current)
    h.current = h.future.shift()
    historySkipRef.current = true
    setPlan(JSON.parse(h.current))
    setHistoryVersion(v => v + 1)
  }
  return { undoPlan, redoPlan, historyVersion, historyRef, historySkipRef }
}
