import assert from 'node:assert/strict'
import {chromium} from 'playwright'
const browser=await chromium.launch({headless:true,args:['--no-sandbox']})
try {
 const page=await browser.newPage()
 const pageErrors=[]
 page.on('pageerror',error=>pageErrors.push(error.message))
 await page.route('**/*',route=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort('blockedbyclient'))
 await page.goto('http://127.0.0.1:4177/tests/calendar-real-student-fixture.html')
 const cards=()=>page.locator('.student-week-card')
 const switchClass=async name=>{await page.getByRole('button',{name,exact:true}).click();await page.getByTestId('selected-class').getByText(name).waitFor()}
 await cards().first().waitFor()
 // 8A: all source lessons move to ISO week 44; week 43 remains empty.
 assert.equal(await page.locator('#student-week-2026-10-26').count(),1)
 assert.equal(await page.locator('#student-week-2026-10-26').getByText('Moment 4').count(),1)
 assert.equal(await page.locator('#student-week-2026-10-19').getByText('Moment 1').count(),0)
 console.log('PASS real StudentView 8A: holiday delays all lessons to new calendar week')
 // 8B: untouched class still sees source lesson in original week.
 await switchClass('8B')
 assert.equal(await page.locator('#student-week-2026-10-19').getByText('Moment 1').count(),1)
 assert.equal(await page.locator('#student-week-2026-10-26').count(),0)
 console.log('PASS real StudentView 8B: class isolation')
 // 8C: half-day retains afternoon slot and all lesson topics.
 await switchClass('8C')
 assert.equal(await page.locator('#student-week-2026-10-19').getByText('Moment 1').count(),1)
 assert.equal(await page.locator('#student-week-2026-10-19').getByText('Moment 4').count(),1)
 console.log('PASS real StudentView 8C: half-day retains content')
 // 8E: three consecutive moments from separate base lessons appear on Monday.
 await switchClass('8E')
 const classWeek=page.locator('#student-week-2026-10-19')
 for(const name of ['Moment 1','Moment 2','Moment 3','Moment 4']) assert.equal(await classWeek.getByText(name,{exact:true}).count(),1)
 console.log('PASS real StudentView 8E: 3 Monday moments and 2 Thursday moments across base lesson boundaries')
 // 8D: study day moves first lesson to Tuesday, retaining all source content.
 await switchClass('8D')
 assert.equal(await page.locator('#student-week-2026-10-19').getByText('Moment 1').count(),1)
 assert.equal(await page.locator('#student-week-2026-10-19').getByText('Moment 4').count(),1)
 assert.deepEqual(pageErrors,[])
 console.log('PASS real StudentView 8D: study day preserves all lessons')
} finally {await browser.close()}
