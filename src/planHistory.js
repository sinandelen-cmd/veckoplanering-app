export function recordPlanHistory(history, identity, plan, skip = false) {
  const current=JSON.stringify(plan)
  if (history.identity!==identity) return {identity,past:[],current,future:[]}
  if (current===history.current) return history
  if (skip) return {...history,current}
  return {...history,past:[...history.past,history.current].slice(-60),current,future:[]}
}
export function undoPlanHistory(history) {
  if (!history.past.length) return history
  return {...history,past:history.past.slice(0,-1),current:history.past.at(-1),future:[history.current,...history.future]}
}
export function redoPlanHistory(history) {
  if (!history.future.length) return history
  return {...history,past:[...history.past,history.current].slice(-60),current:history.future[0],future:history.future.slice(1)}
}
