import React,{useState} from 'react'
import {createRoot} from 'react-dom/client'
import WeekBoard from '../../src/WeekBoard.jsx'
import {stockholmDate,mondayDate,shiftDate} from '../../src/weekPresentation.js'
import '../../src/App.css'
const current=mondayDate(stockholmDate())
const seed=[{weekStart:shiftDate(current,735),chapter:'Tal'},{weekStart:shiftDate(current,-7),chapter:'Tal'},{weekStart:shiftDate(current,371),chapter:'Geometri'},{weekStart:current,chapter:'Tal'},{weekStart:shiftDate(current,7),chapter:'Geometri'}].map((w,index)=>({...w,weekNumber:index+1}))
function Fixture(){const [weeks,setWeeks]=useState(seed);return <main className="shell"><h1>Veckoordning – endast syntetiska data</h1><button onClick={()=>setWeeks(previous=>previous.map(w=>({...w,weekStart:shiftDate(w.weekStart,-7)})))}>Flytta testveckornas datum</button><WeekBoard weeks={weeks}>{weeks.map(w=><article key={w.weekStart} data-week-date={w.weekStart}>Lektionsinnehåll {w.weekStart}</article>)}</WeekBoard></main>}
createRoot(document.getElementById('root')).render(<Fixture/> )
