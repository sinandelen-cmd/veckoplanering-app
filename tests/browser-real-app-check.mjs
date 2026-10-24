import assert from 'node:assert/strict'
import {chromium} from 'playwright'

// This loads REAL src/main.jsx -> App.jsx and exercises login against a strictly
// local mocked HTTP API. It does NOT run GoTrue/PostgREST or prove production auth.
const browser=await chromium.launch({headless:true,args:['--no-sandbox']})
try {
 const page=await browser.newPage()
 const requests=[]
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url())
  if(url.hostname!=='127.0.0.1' && url.hostname!=='localhost'){
   requests.push('BLOCKED EXTERNAL '+url.href)
   return route.abort('blockedbyclient')
  }
  if(url.port==='4199'){
   requests.push(url.pathname)
   const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,PATCH,OPTIONS','content-type':'application/json'}
   if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers,body:''})
   if(url.pathname==='/auth/v1/token'){
    const submitted=route.request().postDataJSON()
    if(submitted.password==='incorrect-password'){
      return route.fulfill({status:400,headers,body:JSON.stringify({message:'Invalid login credentials',code:'invalid_credentials'})})
    }
    return route.fulfill({status:200,headers,body:JSON.stringify({
     access_token:'isolated.fake.jwt',refresh_token:'isolated-refresh',token_type:'bearer',expires_in:3600,
     user:{id:'isolated-teacher',email:'teacher@example.test',aud:'authenticated',role:'authenticated'}
    })})
   }
   if(url.pathname==='/rest/v1/teacher_access'){
    return route.fulfill({status:200,headers,body:JSON.stringify({status:'approved',timer_period:null,expires_at:null,extension_requested:false})})
   }
   if(url.pathname==='/rest/v1/veckoplanering'){
    return route.fulfill({status:200,headers,body:'[]'})
   }
   return route.fulfill({status:404,headers,body:JSON.stringify({message:'No isolated fixture for '+url.pathname})})
  }
  return route.continue()
 })
 await page.goto('http://127.0.0.1:4176/')
 await page.getByRole('heading',{name:'Logga in som lärare'}).waitFor({timeout:20000})
 await page.getByLabel('E-post').fill('teacher@example.test')
 await page.getByLabel('Lösenord').fill('incorrect-password')
 await page.getByRole('button',{name:'Logga in',exact:true}).click()
 await page.getByText(/Inloggningen misslyckades/).waitFor({timeout:10000})
 await page.getByRole('heading',{name:'Logga in som lärare'}).waitFor()
 await page.getByLabel('Lösenord').fill('isolated-password')
 await page.getByRole('button',{name:'Logga in',exact:true}).click()
 await page.getByRole('heading',{name:'Logga in som lärare'}).waitFor({state:'hidden',timeout:15000})
 assert.ok(requests.includes('/auth/v1/token'),'Real App login must call isolated Auth API')
 await page.getByText('Kontrollerar lärarbehörighet…').waitFor({state:'hidden',timeout:15000})
 assert.ok(requests.includes('/rest/v1/teacher_access'),'Real App must verify isolated teacher access')
 for(let i=0;i<50&&!requests.includes('/rest/v1/veckoplanering');i++)await page.waitForTimeout(100)
 assert.ok(requests.includes('/rest/v1/veckoplanering'),'Real App must fetch isolated teacher plans')
 assert.equal(requests.some(s=>s.startsWith('BLOCKED EXTERNAL')),false,'App must not call external URLs')

 // Verify real public student view accordion behavior against isolated RPC data.
 const studentPage=await browser.newPage()
 const monday=new Date()
 monday.setHours(12,0,0,0)
 monday.setDate(monday.getDate()-((monday.getDay()+6)%7))
 const iso=(offset)=>{const d=new Date(monday);d.setDate(d.getDate()+offset);return d.toISOString().slice(0,10)}
 const fixtureWeeks=[-14,-7,0].map((offset,index)=>({
  weekStart:iso(offset),weekNumber:index+1,title:'Testvecka '+(index+1),
  content:'Isolerat elevinnehåll '+(index+1),lessons:[]
 }))
 await studentPage.route('**/*',async route=>{
  const url=new URL(route.request().url())
  if(url.port==='4199' && url.pathname.includes('/rest/v1/rpc/get_public_annual_plan')){
   return route.fulfill({status:200,headers:{'access-control-allow-origin':'*','content-type':'application/json'},
    body:JSON.stringify({published_content:JSON.stringify({title:'Isolerad elevplanering',weeksData:fixtureWeeks})})})
  }
  if(url.hostname!=='127.0.0.1' && url.hostname!=='localhost')return route.abort('blockedbyclient')
  return route.continue()
 })
 await studentPage.goto('http://127.0.0.1:4176/elev/isolerat-test')
 const accordion=studentPage.locator('details.student-week-accordion')
 await accordion.first().waitFor({timeout:15000})
 assert.equal(await accordion.count(),1,'Only current student week is shown initially')
 assert.equal(await accordion.first().getAttribute('open'),'','Current week is expanded initially')
 const toggle=studentPage.getByRole('button',{name:/Visa tidigare veckor/})
 await toggle.click()
 assert.equal(await accordion.count(),3,'Earlier student weeks become available on request')
 assert.equal(await studentPage.locator('details.student-week-accordion').first().locator('summary').textContent().then(s=>s.includes('Testvecka 3')),true,'Current week stays first')
 await accordion.nth(1).locator('summary').click()
 assert.equal(await accordion.nth(1).getAttribute('open'),'','An earlier week can be expanded')
 await studentPage.getByRole('button',{name:'Dölj tidigare veckor'}).click()
 assert.equal(await accordion.count(),1,'Earlier student weeks can be hidden again')
 await studentPage.close()
 console.log('PASS Chromium real App.jsx student accordion: current first, earlier weeks toggle, expand and hide')
 console.log('PASS Chromium real App.jsx login and teacher access, strictly isolated HTTP mocks; no real GoTrue/PostgREST')
}finally{await browser.close()}
