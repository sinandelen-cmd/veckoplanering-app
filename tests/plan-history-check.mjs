import assert from 'node:assert/strict'
import {recordPlanHistory,undoPlanHistory,redoPlanHistory} from '../src/planHistory.js'
const a={weeksData:[{lessons:[{topics:[{name:'A',pages:['45–48'],assignments:['1–5'],links:[{url:'https://example.org',label:'Länk'}]}]}]}]}
const b=structuredClone(a);b.weeksData[0].lessons[0].topics[0].name='B'
let history=recordPlanHistory({},'user1:plan1',a)
history=recordPlanHistory(history,'user1:plan1',b)
assert.deepEqual(JSON.parse(undoPlanHistory(history).current),a)
assert.deepEqual(JSON.parse(redoPlanHistory(undoPlanHistory(history)).current),b)
history=recordPlanHistory(history,'user1:plan2',a)
assert.equal(history.past.length,0);assert.equal(history.future.length,0)
assert.equal(undoPlanHistory(history),history)
history=recordPlanHistory(history,'user2:plan2',b)
assert.equal(history.past.length,0)
for(let i=0;i<80;i++) history=recordPlanHistory(history,'user2:plan2',{i})
assert.equal(history.past.length,60)
history=undoPlanHistory(history)
history=recordPlanHistory(history,'user2:plan2',{i:'different'})
assert.equal(history.future.length,0)
console.log('PASS: full-content undo/redo, plan/account isolation, history cap, new-edit redo invalidation')
