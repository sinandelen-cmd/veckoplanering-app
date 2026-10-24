import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Execute the actual production publishing handler, publication field builder,
// and student sanitizer against an isolated in-memory Supabase-compatible adapter.
// This is NOT a live Supabase/PostgreSQL RPC test.
const source=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8')
const extract=(begin,end)=>{const a=source.indexOf(begin),b=source.indexOf(end,a);assert.ok(a>=0&&b>a,begin);return source.slice(a,b)}
const sanitizerCode=extract('function sanitizeForStudents(plan) {','\nfunction resourceInfo(')
const publicationCode=extract('function publicationFields(publish, keepPublished, slug, publishedPayload) {','\nfunction Login(')
const handlerCode=extract('  async function publishFromList(row) {','\n  async function unpublish(row) {')
const displayWeeks=p=>p.weeksData
const makeWeeks=()=>[]
const sanitizeForStudents=new Function('displayWeeks','makeWeeks','validSchoolClosure','toIsoDate','resourceInfo',sanitizerCode+'\nreturn sanitizeForStudents')(displayWeeks,makeWeeks,()=>false,x=>x,()=>null)
const publicationFields=new Function(publicationCode+'\nreturn publicationFields')()
const row={id:'draft-1',user_id:'teacher-1',title:'Testplanering',public_slug:'safe-test-slug',published:false,published_content:null}
const database=new Map([[row.id,{...row}]])
const writes=[]
let status='',busy=false,loads=0,selectedId='draft-1'
let confirm=true,failWrite=false
const session={user:{id:'teacher-1'}}
const window={confirm:()=>confirm}
const supabase={
 from(table){
  assert.equal(table,'veckoplanering')
  return {update(payload){
   const query={filters:{},eq(key,value){this.filters[key]=value;return this},select(col){assert.equal(col,'id');return this},async single(){
    writes.push({payload,filters:{...this.filters}})
    if(failWrite)return {error:new Error('Isolated database failure')}
    const stored=database.get(this.filters.id)
    if(!stored||stored.user_id!==this.filters.user_id)return {error:new Error('Row not found')}
    database.set(stored.id,{...stored,...JSON.parse(JSON.stringify(payload))})
    return {error:null,data:{id:stored.id}}
   }}
   return query
  }}
 }
}
const sourcePlan={
 title:'Testplanering',subject:'Matematik',startDate:'2026-01-05',entryType:'lektion',
 weeksData:[
  {weekStart:'2026-01-05',weekNumber:2,title:'Vecka 2',lessons:[{name:'Original',topics:[]}]},
  {weekStart:'2026-01-12',weekNumber:3,title:'Vecka 3',publishDate:'2026-01-12',hideDate:'2026-02-01',lessons:[{name:'Nästa',topics:[]}]}
 ],
 classGroups:[{name:'8A',startDate:'2026-01-05',days:['Måndag'],overrides:{'1':{text:'Klassens ursprungliga text'}},lessonTimes:{Måndag:['08:00']}}],
 privateTeacherOnly:'secret'
}
const planFromRow=()=>sourcePlan
const buildSlug=()=>row.public_slug
const setBusy=v=>{busy=v}
const setStatus=v=>{status=v}
const setPlan=updater=>{updater(sourcePlan)}
const loadPlans=async()=>{loads++;return true}
const publishFromList=new Function('busy','planFromRow','window','setBusy','supabase','publicationFields','sanitizeForStudents','session','selectedId','setPlan','loadPlans','setStatus','buildSlug',
 handlerCode+'\nreturn publishFromList')(false,planFromRow,window,setBusy,supabase,publicationFields,sanitizeForStudents,session,selectedId,setPlan,loadPlans,setStatus,buildSlug)

await publishFromList(row)
assert.equal(writes.length,1)
assert.deepEqual(writes[0].filters,{id:'draft-1',user_id:'teacher-1'})
assert.equal(database.get(row.id).published,true)
const frozen=database.get(row.id).published_content
const snapshot=JSON.parse(frozen)
assert.equal(snapshot.classGroups[0].overrides['1'].text,'Klassens ursprungliga text')
assert.equal(snapshot.weeksData[1].hideDate,'2026-02-01')
assert.equal(Object.hasOwn(snapshot,'privateTeacherOnly'),false)
assert.equal(status,'Planeringen är publicerad för elever.')
assert.equal(busy,false)
assert.equal(loads,1)
sourcePlan.weeksData[0].title='Lärarens senare ändring'
sourcePlan.classGroups[0].overrides['1'].text='Nytt utkast'
assert.equal(database.get(row.id).published_content,frozen,'Draft edit must not rewrite published snapshot')
await publishFromList(row)
assert.notEqual(database.get(row.id).published_content,frozen,'Explicit republish must replace snapshot')
assert.equal(JSON.parse(database.get(row.id).published_content).classGroups[0].overrides['1'].text,'Nytt utkast')
const beforeCancelled=writes.length
confirm=false
await publishFromList(row)
assert.equal(writes.length,beforeCancelled,'Cancelled confirmation must not write')
confirm=true
failWrite=true
const beforeFailed=database.get(row.id).published_content
await publishFromList(row)
assert.equal(database.get(row.id).published_content,beforeFailed,'Failed write must not change database')
assert.match(status,/Kunde inte publicera/)
assert.equal(busy,false)
failWrite=false
const originalOwner=database.get(row.id).user_id
database.set(row.id,{...database.get(row.id),user_id:'other-teacher'})
const beforeDenied=database.get(row.id).published_content
await publishFromList(row)
assert.equal(database.get(row.id).published_content,beforeDenied,'Unauthorized user must not update another owner')
assert.match(status,/Kunde inte publicera/)
database.set(row.id,{...database.get(row.id),user_id:originalOwner})
const savedRow=database.get(row.id)
database.delete(row.id)
await publishFromList(row)
assert.match(status,/Kunde inte publicera/)
assert.equal(database.has(row.id),false,'Missing row must not be recreated')
database.set(row.id,savedRow)
assert.equal(busy,false)
console.log('PASS actual App.jsx publishFromList + sanitizeForStudents + publicationFields: isolated row ownership, snapshots, explicit republish, cancel and failure')
