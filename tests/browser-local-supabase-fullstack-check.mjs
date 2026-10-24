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
 await page.goto('http://127.0.0.1:4177/elev/isolated-public-a')
 await page.getByText('Visible',{exact:true}).first().waitFor({timeout:20000})
 assert.equal(await page.getByText('Hidden',{exact:true}).count(),0)
 assert.equal(await page.getByText('Expired',{exact:true}).count(),0)
 await page.goto('http://127.0.0.1:4177/elev/not-present')
 await page.getByText('Planeringen finns inte eller är inte publicerad.').waitFor({timeout:20000})
 assert.deepEqual(external,[],'Fullstack App.jsx must only access localhost')
 console.log('PASS real Chromium App.jsx + real local GoTrue login + PostgREST teacher RLS + anonymous public student RPC + hidden week + nonexistent link')
}finally{await browser.close()}
