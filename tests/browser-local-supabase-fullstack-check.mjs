import assert from 'node:assert/strict'
import {chromium} from 'playwright'

// Uses REAL local GoTrue + PostgREST + RPC and REAL App.jsx in Chromium.
// No interception or fake HTTP replies. Disposable CI stack only.
const base=process.env.ISOLATED_SUPABASE_URL
const key=process.env.ISOLATED_SUPABASE_ANON_KEY
assert.match(base||'',/^http:\/\/(127\.0\.0\.1|localhost):[0-9]+$/)
const auth=await fetch(base+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:key,'content-type':'application/json'},body:JSON.stringify({email:'isolated-teacher-a@example.test',password:'only-local-test-password-a'})})
assert.equal(auth.status,200)
const session=await auth.json()
const headers={apikey:key,Authorization:'Bearer '+session.access_token,'content-type':'application/json',Prefer:'return=representation'}
const rows=await fetch(base+'/rest/v1/veckoplanering?select=id&public_slug=eq.isolated-public-a',{headers})
assert.equal(rows.status,200)
const [row]=await rows.json()
assert.ok(row?.id)
const published=await fetch(base+'/rest/v1/veckoplanering?id=eq.'+row.id,{method:'PATCH',headers,body:JSON.stringify({published:true})})
assert.equal(published.status,200)
// Seed the plan before the app logs in and loads its initial plan list.
 const draft={kind:'arsplanering-v2',title:'Isolerad UI-plan',subject:'Matematik',schoolForm:'Grundskola',grade:'Årskurs 7',
  startDate:'2026-01-05',weeks:2,entryType:'vecka',autoReleaseWeeks:false,lessonsPerWeek:1,
  weeksData:[{weekStart:'2026-01-05',weekNumber:2,title:'UI vecka synlig',content:'',hidden:false,lessons:[{name:'Lektion 1',topics:[]}]},
             {weekStart:'2026-01-12',weekNumber:3,title:'UI vecka dold',content:'Privat veckoinnehåll',hidden:true,lessons:[]}],
  classGroups:[],schoolClosures:[]}
 const created=await fetch(base+'/rest/v1/veckoplanering',{method:'POST',headers,body:JSON.stringify({
  user_id:session.user.id,title:draft.title,subject:draft.subject,week_start:draft.startDate,start_date:draft.startDate,
  content:JSON.stringify(draft),published:false,public_slug:null,published_content:null})})
 assert.equal(created.status,201,'Create teacher UI draft '+await created.text().catch(()=>'')) 
const browser=await chromium.launch({headless:true,args:['--no-sandbox']})
try{
 const page=await browser.newPage()
 const external=[]
 page.on('request',r=>{if(!/^http:\/\/(127\.0\.0\.1|localhost):/.test(r.url()))external.push(r.url())})
 await page.goto('http://127.0.0.1:4177/')
 await page.getByRole('heading',{name:'Logga in som lärare'}).waitFor({timeout:20000})
 await page.getByLabel('E-post').fill('isolated-teacher-a@example.test')
 await page.getByLabel('Lösenord').fill('only-local-test-password-a')
 await page.getByRole('button',{name:'Logga in',exact:true}).click()
 await page.getByRole('heading',{name:'Logga in som lärare'}).waitFor({state:'hidden',timeout:20000})
 await page.getByText('Kontrollerar lärarbehörighet…').waitFor({state:'hidden',timeout:20000})
 // Full REAL App.jsx teacher editor -> automatic publication -> student RPC/browser.
 await page.getByRole('button',{name:/Mina planeringar/}).click()
 await page.getByRole('button',{name:/Grundskola \(/}).click()
 await page.getByRole('button',{name:/Matematik/,exact:false}).filter({has:page.locator('.folder-chevron')}).click()
 await page.getByRole('button',{name:'📘 Isolerad UI-plan',exact:true}).click()
 await page.getByRole('tab',{name:/Lärarvy/}).click()
 const editor=page.locator('.week-card textarea').first()
 await editor.waitFor({timeout:15000})
 await editor.fill('Synlig text från verklig App.jsx-redigering')
 const deadline=Date.now()+25000
 let stored=null
 while(Date.now()<deadline){
  await page.waitForTimeout(1000)
  const response=await fetch(base+'/rest/v1/veckoplanering?select=published,public_slug,published_content,content&title=eq.Isolerad%20UI-plan',{headers})
  const rows=await response.json()
  if(rows[0]?.published===true && rows[0]?.published_content){stored=rows[0];break}
 }
 assert.ok(stored,'App.jsx autosave must publish edited visible week in local PostgREST')
 const studentDoc=typeof stored.published_content==='string'?JSON.parse(stored.published_content):stored.published_content
 assert.ok(JSON.stringify(studentDoc).includes('Synlig text från verklig App.jsx-redigering'))
 assert.ok(!JSON.stringify(studentDoc).includes('Privat veckoinnehåll'),'Hidden week content must never publish')
 assert.ok(stored.public_slug,'App.jsx must assign student link')
 await page.goto('http://127.0.0.1:4177/elev/'+encodeURIComponent(stored.public_slug))
 const earlierWeeks = page.getByRole('button',{name:/Visa tidigare veckor/})
 if(await earlierWeeks.count()) await earlierWeeks.click()
 try {
  await page.getByText('Synlig text från verklig App.jsx-redigering').first().waitFor({timeout:20000})
 } catch (error) {
  console.error('Student view diagnostic:', JSON.stringify({
   url:page.url(),
   headings:await page.locator('h1,h2,h3').allTextContents(),
   accordions:await page.locator('.student-week-accordion').count(),
   weekCards:await page.locator('.student-week-card').count(),
   visibleText:(await page.locator('body').innerText()).slice(0,2500),
   storedWeekStart:studentDoc.weeksData?.[0]?.weekStart,
   storedWeekContent:studentDoc.weeksData?.[0]?.content,
  }))
  throw error
 }
 assert.equal(await page.getByText('Privat veckoinnehåll').count(),0)
 console.log('PASS full real App.jsx: teacher folder -> plan -> teacher editor -> automatic PostgREST publication -> sanitized public RPC -> Chromium student view')

 await page.goto('http://127.0.0.1:4177/elev/isolated-public-a')
 await page.getByText('Visible',{exact:true}).first().waitFor({timeout:20000})
 assert.equal(await page.getByText('Hidden',{exact:true}).count(),0)
 assert.equal(await page.getByText('Expired',{exact:true}).count(),0)
 await page.goto('http://127.0.0.1:4177/elev/not-present')
 await page.getByText('Planeringen finns inte eller är inte publicerad.').waitFor({timeout:20000})
 assert.deepEqual(external,[],'Fullstack App.jsx must only access localhost')
 console.log('PASS real Chromium App.jsx + real local GoTrue login + PostgREST teacher RLS + anonymous public student RPC + hidden week + nonexistent link')
}finally{await browser.close()}
