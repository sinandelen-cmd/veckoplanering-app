import assert from 'node:assert/strict'
import {chromium} from 'playwright'

const browser=await chromium.launch({headless:true,args:['--no-sandbox']})
try{
 const page=await browser.newPage({viewport:{width:1280,height:850},hasTouch:true})
 const errors=[]
 page.on('pageerror',error=>errors.push(error.message))
 await page.route('**/*',route=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort('blockedbyclient'))
 await page.goto('http://127.0.0.1:4177/moment-demo.html')
 await page.getByRole('heading',{name:'Testklasser – olika moment'}).waitFor()
 const expectedNames=Array.from({length:12},(_,i)=>'Moment '+(i+1)+': ')
 const verify=async(label,expected)=>{
   await page.getByRole('button',{name:label,exact:true}).click()
   const cards=page.getByTestId('moment-demo-lessons').locator('article')
   assert.equal(await cards.count(),expected.length,label+' lesson count')
   const actual=[]
   for(let i=0;i<expected.length;i++){
     const card=cards.nth(i)
     const headings=await card.locator('div > strong').allTextContents()
     assert.equal(headings.length,expected[i],label+' lesson '+(i+1)+' topic count')
     actual.push(...headings)
   }
   assert.equal(actual.length,12,label+' total moments')
   for(let i=0;i<12;i++){
     assert.ok(actual[i].startsWith(expectedNames[i]),label+' moment order '+(i+1))
   }
   assert.equal(await page.getByRole('button',{name:label,exact:true}).getAttribute('aria-pressed'),'true')
   console.log('PASS demo Chromium '+label+': '+expected.join(',')+' moments; all 12 in order')
 }
 await verify('Test 1',Array(12).fill(1))
 await verify('Test 2',Array(6).fill(2))
 await verify('Test 3',Array(4).fill(3))
 await verify('Test 4',Array(3).fill(4))
 await verify('Test Mix',[1,2,3,4,1,1])
 // Mobile touch interaction: all five class buttons remain reachable without
 // losing any source moment or creating horizontal document overflow.
 await page.setViewportSize({width:390,height:844})
 for(const label of ['Test 1','Test 2','Test 3','Test 4','Test Mix']){
   await page.getByRole('button',{name:label,exact:true}).tap()
   assert.equal(await page.getByRole('button',{name:label,exact:true}).getAttribute('aria-pressed'),'true')
   assert.equal(await page.getByTestId('moment-demo-lessons').locator('div > strong').count(),12)
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+2)
   assert.equal(overflow,false,'mobile horizontal overflow in '+label)
 }
 assert.deepEqual(errors,[])
 console.log('PASS demo mobile Chromium: five class tabs, 12 moments and no horizontal overflow')
}finally{await browser.close()}
