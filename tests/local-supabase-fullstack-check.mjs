import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'

// Real GoTrue Auth + PostgREST + PostgreSQL RLS + SQL RPC.
// ONLY local Supabase CLI stack in disposable GitHub Actions runner.
const base=process.env.ISOLATED_SUPABASE_URL
const key=process.env.ISOLATED_SUPABASE_ANON_KEY
assert.match(base||'',/^http:\/\/(127\.0\.0\.1|localhost):[0-9]+$/)
assert.ok(key && key.length>20,'Expected disposable CLI-generated local anon key')
const api=async (path,method='GET',token='',body=undefined)=>{
 const r=await fetch(base+path,{method,headers:{apikey:key,Authorization:'Bearer '+(token||key),'content-type':'application/json',Prefer:'return=representation'},body:body===undefined?undefined:JSON.stringify(body)})
 const raw=await r.text()
 let data
 try{data=JSON.parse(raw)}catch{data=raw}
 return {status:r.status,data}
}
const register=async (email,password)=>{
 const sign=await api('/auth/v1/signup','POST','',{email,password})
 assert.ok(sign.status<300,'GoTrue signup '+sign.status+' '+JSON.stringify(sign.data).slice(0,200))
 const login=await api('/auth/v1/token?grant_type=password','POST','',{email,password})
 assert.equal(login.status,200,'GoTrue password login '+JSON.stringify(login.data).slice(0,200))
 assert.ok(login.data.access_token && login.data.user?.id)
 return login.data
}
const a=await register('isolated-teacher-a@example.test','only-local-test-password-a')
const b=await register('isolated-teacher-b@example.test','only-local-test-password-b')
const psql=sql=>execFileSync('psql',['-X','-v','ON_ERROR_STOP=1','-At','-h','127.0.0.1','-p','54322','-U','postgres','-d','postgres','-c',sql],{encoding:'utf8',env:{...process.env,PGPASSWORD:'postgres'}}).trim()
psql("INSERT INTO public.teacher_access(user_id,status) VALUES ('"+a.user.id+"','approved'),('"+b.user.id+"','approved')")
const access=await api('/rest/v1/teacher_access?select=status', 'GET',a.access_token)
assert.equal(access.status,200)
assert.equal(access.data[0]?.status,'approved')
const anonAccess=await api('/rest/v1/teacher_access?select=*')
assert.ok(anonAccess.status===401||anonAccess.status===403,'Anonymous must not read teacher_access')
const otherAccess=await api('/rest/v1/teacher_access?select=user_id,status','GET',b.access_token)
assert.deepEqual(otherAccess.data.map(x=>x.user_id),[b.user.id])
const payload={kind:'arsplanering-v2',title:'Fiktiv publicerad plan',autoReleaseWeeks:false,weeksData:[
 {weekStart:'2026-01-05',title:'Visible',lessons:[{name:'Matte'}]},
 {weekStart:'2026-01-12',title:'Hidden',hidden:true},
 {weekStart:'2026-01-19',title:'Expired',hideDate:'2020-01-01'},
 {weekStart:'2026-01-26',title:'No hideDate'}
]}
const own=await api('/rest/v1/veckoplanering','POST',a.access_token,{user_id:a.user.id,title:'Local test',content:'{}',published:false,public_slug:'isolated-public-a',published_content:payload})
assert.equal(own.status,201,'Teacher own insert '+JSON.stringify(own.data).slice(0,250))
const rowId=own.data[0].id
const anonRows=await api('/rest/v1/veckoplanering?select=id')
assert.ok(anonRows.status===401||anonRows.status===403,'Anonymous direct table access forbidden')
const bRows=await api('/rest/v1/veckoplanering?select=id','GET',b.access_token)
assert.deepEqual(bRows.data,[],'Other teacher must not see owner plan')
const steal=await api('/rest/v1/veckoplanering?id=eq.'+rowId,'PATCH',b.access_token,{title:'Unauthorized'})
assert.ok(steal.status===200||steal.status===204)
assert.deepEqual(steal.data,[],'Other teacher must not modify plan')
const draftRpc=await api('/rest/v1/rpc/get_public_annual_plan','POST','',{slug_value:'isolated-public-a'})
assert.equal(draftRpc.status,200)
assert.deepEqual(draftRpc.data,[],'Unpublished draft must not be accessible via RPC')
const publish=await api('/rest/v1/veckoplanering?id=eq.'+rowId,'PATCH',a.access_token,{published:true})
assert.equal(publish.status,200)
const visible=await api('/rest/v1/rpc/get_public_annual_plan','POST','',{slug_value:'isolated-public-a'})
assert.equal(visible.status,200,JSON.stringify(visible.data))
assert.deepEqual(JSON.parse(visible.data[0].published_content).weeksData.map(w=>w.title),['Visible','No hideDate'])
// Exercise the actual production RPC's auto-release, latest-week count, Stockholm date and closure filtering.
const now=new Date()
const iso=d=>d.toISOString().slice(0,10)
const monday=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()))
monday.setUTCDate(monday.getUTCDate()-((monday.getUTCDay()+6)%7))
const shifted=n=>{const d=new Date(monday);d.setUTCDate(d.getUTCDate()+n*7);return iso(d)}
const dynamic={kind:'arsplanering-v2',title:'Isolated auto release',autoReleaseWeeks:true,visibleWeekCount:2,
 weeksData:[-3,-2,-1,0,1,2].map((n,i)=>({weekStart:shifted(n),title:'Auto '+i,lessons:[{name:'Week '+i}]})),
 schoolClosures:[{name:'old closure',startDate:'2020-01-01',endDate:'2020-01-03'},{name:'current closure',startDate:shifted(0),endDate:shifted(0)}]}
const autoRow=await api('/rest/v1/veckoplanering','POST',a.access_token,{user_id:a.user.id,title:'Auto release',content:'{}',published:true,public_slug:'isolated-auto-release',published_content:dynamic})
assert.equal(autoRow.status,201,JSON.stringify(autoRow.data).slice(0,250))
const auto=await api('/rest/v1/rpc/get_public_annual_plan','POST','',{slug_value:'isolated-auto-release'})
assert.equal(auto.status,200,JSON.stringify(auto.data).slice(0,250))
const autoDoc=JSON.parse(auto.data[0].published_content)
assert.deepEqual(autoDoc.weeksData.map(w=>w.title),['Auto 3','Auto 4'],'Production RPC should return newest two eligible weeks, never future weeks')
assert.deepEqual(autoDoc.schoolClosures.map(w=>w.name),['current closure'],'Closures must follow visible weeks')
const futureOnly={...dynamic,weeksData:[{weekStart:shifted(3),title:'Not yet released'}],schoolClosures:[]}
const futureRow=await api('/rest/v1/veckoplanering','POST',a.access_token,{user_id:a.user.id,title:'Future',content:'{}',published:true,public_slug:'isolated-future-only',published_content:futureOnly})
assert.equal(futureRow.status,201)
const future=await api('/rest/v1/rpc/get_public_annual_plan','POST','',{slug_value:'isolated-future-only'})
assert.deepEqual(JSON.parse(future.data[0].published_content).weeksData,[],'Future weeks not yet released')

const missing=await api('/rest/v1/rpc/get_public_annual_plan','POST','',{slug_value:'not-present'})
assert.deepEqual(missing.data,[])
const noSteal=await api('/rest/v1/veckoplanering?id=eq.'+rowId,'PATCH',a.access_token,{user_id:b.user.id})
assert.ok(noSteal.status>=400,'Owner reassignment must fail RLS WITH CHECK')
const unpublish=await api('/rest/v1/veckoplanering?id=eq.'+rowId,'PATCH',a.access_token,{published:false})
assert.equal(unpublish.status,200)
const after=await api('/rest/v1/rpc/get_public_annual_plan','POST','',{slug_value:'isolated-public-a'})
assert.deepEqual(after.data,[],'Unpublished snapshot must be hidden immediately')
console.log('PASS local fullstack: GoTrue signup/login x2, teacher access, PostgREST ownership RLS, no direct anon read, real production RPC draft/publish/hidden/expired/auto-release/latest-two/closures/future/missing/unpublish, owner reassignment denied')
