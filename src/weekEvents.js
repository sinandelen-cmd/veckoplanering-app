const DAYS=['Måndag','Tisdag','Onsdag','Torsdag','Fredag']
export const WEEK_EVENT_TYPES=['Övning inför prov','Prov','Test','Nationellt prov','Introduktion','Lov','Studiedag','Annat']
const shift=(iso,days)=>{const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}
const weekNumber=iso=>{const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+3-((d.getUTCDay()+6)%7));return Math.ceil(((d-new Date(Date.UTC(d.getUTCFullYear(),0,1)))/86400000+1)/7)}
export function insertCalendarEventWeek(plan,afterDate,event,className=''){
 const weekStart=event.weekStart || shift(afterDate,7)
 if(!/^\d{4}-\d{2}-\d{2}$/.test(weekStart))return plan
 const type=WEEK_EVENT_TYPES.includes(event.type)?event.type:'Annat'
 const days=Array.isArray(event.days)?DAYS.filter(day=>event.days.includes(day)):DAYS
 const entry={weekStart,type,days,title:String(event.title || type).slice(0,300)}
 if(className)return {...plan,classGroups:(plan.classGroups||[]).map(g=>g.name===className?{...g,calendarEvents:[...(g.calendarEvents||[]),entry]}:g)}
 const existing=(plan.weeksData||[]).slice().sort((a,b)=>a.weekStart.localeCompare(b.weekStart))
 const lessons=DAYS.map((day,index)=>({name:'Lektion '+(index+1),day,topics:[{name:days.includes(day)?entry.title:'',pages:[''],assignments:[''],links:[]}],...((type==='Prov'||type==='Test'||type==='Nationellt prov')&&days.includes(day)?{assessment:{type,title:entry.title,description:''}}:{})}))
 const collision=existing.some(w=>w.weekStart===weekStart)
 const weeksData=[...existing.map(w=>{if(!collision||w.weekStart<weekStart)return w;const date=shift(w.weekStart,7);return {...w,weekStart:date,weekNumber:weekNumber(date),title:!w.title||/^Vecka\s+\d+$/i.test(w.title)?'Vecka '+weekNumber(date):w.title}}),{...entry,weekNumber:weekNumber(weekStart),calendarEventWeek:true,eventTitle:entry.title,eventDays:days,eventType:type,title:'Vecka '+weekNumber(weekStart),content:'',lessons,pages:[],assignments:[],links:[],hidden:false}].sort((a,b)=>a.weekStart.localeCompare(b.weekStart))
 return {...plan,weeksData,weeks:weeksData.length}
}
