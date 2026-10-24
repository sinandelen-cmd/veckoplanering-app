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
   const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','content-type':'application/json'}
   if(url.pathname==='/auth/v1/token'){
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
 await page.getByLabel('Lösenord').fill('isolated-password')
 await page.getByRole('button',{name:'Logga in',exact:true}).click()
 await page.getByRole('heading',{name:'Logga in som lärare'}).waitFor({state:'hidden',timeout:15000})
 assert.ok(requests.includes('/auth/v1/token'),'Real App login must call isolated Auth API')
 await page.getByText('Kontrollerar lärarbehörighet…').waitFor({state:'hidden',timeout:15000})
 assert.ok(requests.includes('/rest/v1/teacher_access'),'Real App must verify isolated teacher access')
 assert.ok(requests.includes('/rest/v1/veckoplanering'),'Real App must fetch isolated teacher plans')
 assert.equal(requests.some(s=>s.startsWith('BLOCKED EXTERNAL')),false,'App must not call external URLs')
 console.log('PASS Chromium real App.jsx login and teacher access, strictly isolated HTTP mocks; no real GoTrue/PostgREST')
}finally{await browser.close()}
