const DAY=86400000
export function stockholmDate(now=Date.now()) {
 return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now))
}
export function shiftDate(iso,days){const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}
export function mondayDate(iso){const d=new Date(iso+'T12:00:00Z');return shiftDate(iso,-((d.getUTCDay()+6)%7))}
export function releaseDate(now=Date.now()){return stockholmDate(Number(new Date(now))-60000)}
export function selectStudentWeeks(weeks,plan={},now=Date.now(),preview=false){
 const today=releaseDate(now),current=mondayDate(today)
 const earliest=shiftDate(current,-7*(Math.max(1,Math.min(12,Number(plan.visibleWeekCount)||2))-1))
 return weeks.filter(w=>w?.weekStart && !w.hidden)
 .filter(w=>preview || (w.publishDate || mondayDate(w.weekStart))<=today)
 .filter(w=>preview || !w.hideDate || w.hideDate>today)
 .filter(w=>preview && plan.autoReleaseWeeks!==true || w.keepVisibleExtra || w.weekStart>=earliest && w.weekStart<=current)
 .slice().sort((a,b)=>b.weekStart.localeCompare(a.weekStart))
}
export function teacherWeekGroups(weeks,now=Date.now()){
 const current=mondayDate(stockholmDate(now)),groups=new Map()
 const chapters=new Map();let previousChapter=''
 for(const week of [...weeks].sort((a,b)=>a.weekStart.localeCompare(b.weekStart))){if(week.chapter?.trim())previousChapter=week.chapter.trim();chapters.set(week.weekStart,previousChapter)}
 const items=weeks.map((week,index)=>({week:{...week,chapter:chapters.get(week.weekStart)||''},index,past:week.weekStart<current}))
 .sort((a,b)=>Number(a.past)-Number(b.past)||a.week.weekStart.localeCompare(b.week.weekStart))
 for(const item of items){const chapter=String(item.week.chapter||'Övriga veckor').trim();if(!groups.has(chapter))groups.set(chapter,{chapter,current:[],past:[]});groups.get(chapter)[item.past?'past':'current'].push(item)}
 for(const group of groups.values())group.past.reverse()
 return [...groups.values()]
}
// Chapter headings may repeat, but future dates must never jump backwards
// when a chapter occurs again later in the plan (including a later year).
export function teacherWeekSections(weeks,now=Date.now()){
 const groups=teacherWeekGroups(weeks,now),sections=[],historyShown=new Set()
 const future=groups.flatMap(group=>group.current).sort((a,b)=>a.week.weekStart.localeCompare(b.week.weekStart))
 for(const item of future){
  const chapter=String(item.week.chapter||'Övriga veckor').trim()
  if(sections.at(-1)?.chapter===chapter){sections.at(-1).current.push(item);continue}
  const past=historyShown.has(chapter)?[]:groups.find(group=>group.chapter===chapter)?.past||[]
  sections.push({chapter,current:[item],past});historyShown.add(chapter)
 }
 for(const group of groups)if(!historyShown.has(group.chapter)&&group.past.length)sections.push({...group,current:[]})
 return sections
}
export function chapterColor(chapter){let hash=0;for(const char of String(chapter||'Övriga veckor').trim().toLocaleLowerCase('sv-SE'))hash=(hash*31+char.codePointAt(0))>>>0;return 'hsl('+hash%360+' 65% 92%)'}

