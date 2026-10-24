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
assert.equal(draftRpc.data,null,'Unpublished draft must not be accessible via RPC')
const publish=await api('/rest/v1/veckoplanering?id=eq.'+rowId,'PATCH',a.access_token,{published:true})
assert.equal(publish.status,200)
const visible=await api('/rest/v1/rpc/get_public_annual_plan','POST','',{slug_value:'isolated-public-a'})
assert.equal(visible.status,200,JSON.stringify(visible.data))
assert.deepEqual(visible.data.weeksData.map(w=>w.title),['Visible','No hideDate'])
const missing=await api('/rest/v1/rpc/get_public_annual_plan','POST','',{slug_value:'not-present'})
assert.equal(missing.data,null)
const noSteal=await api('/rest/v1/veckoplanering?id=eq.'+rowId,'PATCH',a.access_token,{user_id:b.user.id})
assert.ok(noSteal.status>=400,'Owner reassignment must fail RLS WITH CHECK')
const unpublish=await api('/rest/v1/veckoplanering?id=eq.'+rowId,'PATCH',a.access_token,{published:false})
assert.equal(unpublish.status,200)
const after=await api('/rest/v1/rpc/get_public_annual_plan','POST','',{slug_value:'isolated-public-a'})
assert.equal(after.data,null,'Unpublished snapshot must be hidden immediately')
console.log('PASS local fullstack: GoTrue signup/login x2, teacher access, PostgREST ownership RLS, no direct anon read, RPC draft/publish/hidden/expired/missing/unpublish, owner reassignment denied')
