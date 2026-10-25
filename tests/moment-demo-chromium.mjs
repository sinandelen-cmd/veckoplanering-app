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
   const cards=page.getByTestId('moment-demo-weeks').locator('article')
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
   const weekCards=page.getByTestId('moment-demo-week')
   assert.ok(await weekCards.count()>=1,label+' has weekly cards')
   assert.match(await weekCards.first().locator('h3').innerText(),/Vecka 43 · 19 oktober 2026 – 25 oktober 2026/,label+' Swedish ISO week')
   console.log('PASS demo Chromium '+label+': '+expected.join(',')+' moments; all 12 in order')
 }
 await verify('Grundplanering',Array(12).fill(1))
 assert.equal(await page.getByTestId('moment-demo-week').count(),3,'Grundplanering spans three Swedish weeks')
 assert.equal(await page.getByTestId('moment-demo-week').nth(1).locator('h3').innerText(),'Vecka 44 · 26 oktober 2026 – 1 november 2026')
 assert.equal(await page.getByTestId('moment-demo-week').nth(2).locator('h3').innerText(),'Vecka 45 · 2 november 2026 – 8 november 2026')
 await verify('Test 1',Array(12).fill(1))
 await verify('Test 2',Array(6).fill(2))
 await verify('Test 3',Array(4).fill(3))
 await verify('Test 4',Array(3).fill(4))
 await verify('Test Mix',[1,2,3,4,1,1])
 // Interactive synthetic closures: compare before/after, verify moment integrity and isolation.
 await page.getByRole('button',{name:'Test 1',exact:true}).click()
 const before=await page.getByTestId('demo-comparison').locator('div').first().innerText()
 await page.getByRole('button',{name:'Lägg till för Test 1'}).click()
 assert.match(await page.getByTestId('demo-closures').innerText(),/Studiedag: 2026-10-19/)
 assert.match(await page.getByTestId('demo-integrity').innerText(),/Alla 12 moment bevaras/)
 assert.notEqual(await page.getByTestId('demo-comparison').locator('div').last().innerText(),before,'study day moves lessons')
 await page.getByRole('button',{name:'Test 2',exact:true}).click()
 assert.match(await page.getByTestId('demo-closures').innerText(),/Inga lektionsfria dagar/)
 await page.getByRole('button',{name:'Test 1',exact:true}).click()
 await page.getByRole('button',{name:'Ta bort undantag 1'}).click()
 assert.match(await page.getByTestId('demo-closures').innerText(),/Inga lektionsfria dagar/)
 await page.getByRole('combobox',{name:'Typ av lektionsfri dag'}).selectOption('Halvdag')
 await page.getByRole('button',{name:'Lägg till för Test 1'}).click()
 assert.match(await page.getByTestId('demo-closures').innerText(),/Halvdag/)
 assert.match(await page.getByTestId('demo-integrity').innerText(),/Alla 12 moment bevaras/)
 await page.getByRole('button',{name:'Återställ Test 1'}).click()
 await page.getByRole('combobox',{name:'Typ av lektionsfri dag'}).selectOption('Lov')
 await page.getByRole('button',{name:'Lägg till för Test 1'}).click()
 assert.match(await page.getByTestId('demo-closures').innerText(),/Lov: 2026-10-19 – 2026-10-23/)
 assert.match(await page.getByTestId('demo-integrity').innerText(),/Alla 12 moment bevaras/)
 await page.getByRole('button',{name:'Återställ Test 1'}).click()
 console.log('PASS demo interactive closures: study day, half-day, holiday, restore and class isolation')
 // Mobile touch interaction: all six planning/class buttons remain reachable without
 // losing any source moment or creating horizontal document overflow.
 await page.setViewportSize({width:390,height:844})
 for(const label of ['Grundplanering','Test 1','Test 2','Test 3','Test 4','Test Mix']){
   await page.getByRole('button',{name:label,exact:true}).tap()
   assert.equal(await page.getByRole('button',{name:label,exact:true}).getAttribute('aria-pressed'),'true')
   assert.equal(await page.getByTestId('moment-demo-weeks').locator('article div > strong').count(),12)
   assert.ok(await page.getByTestId('moment-demo-week').count()>=1,'mobile week cards '+label)
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+2)
   assert.equal(overflow,false,'mobile horizontal overflow in '+label)
 }
 assert.deepEqual(errors,[])
 console.log('PASS demo mobile Chromium: Grundplanering and five class tabs, 12 moments and no horizontal overflow')
}finally{await browser.close()}
