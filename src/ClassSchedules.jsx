    {groups.length>0 && <div style={{margin:"14px 0 12px"}}>
      <button type="button" className="secondary" aria-expanded={showClassMenu} onClick={()=>{setShowClassMenu(v=>!v);setShowMatrix(true);setCompare(false);setShowClassDetails(false)}} style={{fontWeight:800,padding:"12px 16px"}}>{showClassMenu?"▾ Dölj klassernas planering":"▸ Visa klassernas planering"}</button>
    </div>}
    {groups.length>0 && <div className="class-schedule-toggle"><button type="button" className="secondary" aria-expanded={showClassMenu} onClick={()=>{setShowClassMenu(v=>!v);setShowMatrix(true);setCompare(false);setShowClassDetails(false)}}>{showClassMenu?'▾ Dölj schemainställningar':'▸ Visa och ändra klassernas scheman'}</button></div>}
    {showClassMenu && <>
    {groups.length>0 && <div style={{margin:"14px 0 20px"}}>

      {showMatrix && <div style={{overflowX:"auto"}}>
      <h3>Klassernas veckoschema</h3>
      <p className="muted">Kryssa i lektionsdagarna och ange starttid för varje lektion. Lektionsnumren ordnas automatiskt från måndag till fredag. Tiderna gäller bara den valda klassen.</p>
      <table style={{width:"100%",borderCollapse:"separate",borderSpacing:"4px",minWidth:460}}>
        <thead><tr><th style={{textAlign:"left",padding:8}}>Klass</th>{DAY_SHORT.map(d=><th key={d} style={{textAlign:"center",padding:8,background:"#f5ebce",borderRadius:6}}>{d}</th>)}<th style={{textAlign:"center",padding:8}}>Totalt</th></tr></thead>
        <tbody>{groups.map((g,i)=>{const sortedDays=DAYS.flatMap(day=>(g.days||[]).filter(d=>d===day));return <tr key={i}><th style={{textAlign:"left",padding:8,background:"#f7f6f0",borderRadius:6}}><button type="button" title={"Öppna särskilda ändringar för "+g.name} onClick={()=>{setSelected(i);setCompare(false);setShowClassDetails(true);setEditing(null)}} style={{border:0,background:"transparent",fontWeight:700,cursor:"pointer",textDecoration:"underline",textUnderlineOffset:3}}>{g.name}</button></th>{DAYS.map(day=>{const count=(g.days||[]).filter(d=>d===day).length;const before=sortedDays.filter(d=>DAYS.indexOf(d)<DAYS.indexOf(day)).length;return <td key={day} style={{textAlign:"center",background:count?"#e2f3e5":"#f7f6f0",borderRadius:6,padding:8}}>
          <label style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,flexWrap:"wrap",cursor:"pointer"}}><input aria-label={g.name+" "+day} type="checkbox" checked={count>0} onChange={e=>onChange({...plan,classGroups:groups.map((row,idx)=>idx===i?{...row,days:e.target.checked?[...(row.days||[]),day].sort((x,y)=>DAYS.indexOf(x)-DAYS.indexOf(y)):(row.days||[]).filter(d=>d!==day)}:row)})} />{count>0&&<div className="class-lesson-slots">{Array.from({length:count},(_,slot)=><label key={slot} className="class-lesson-slot"><span>L{before+slot+1}</span><input type="time" aria-label={g.name+" "+day+" lektion "+(slot+1)+" tid"} value={g.lessonTimes?.[day]?.[slot] || ''} onChange={event=>setLessonTime(i,day,slot,event.target.value)} /></label>)}</div>}</label>
        </td>})}<td style={{textAlign:"center",fontWeight:700}}>{sortedDays.length}</td></tr>})}</tbody>
        <tfoot><tr><td colSpan={7} style={{padding:"14px 6px 4px",borderTop:"2px solid #d8e5dc"}}><div style={{display:"flex",gap:10,alignItems:"end",flexWrap:"wrap"}}><label style={{flex:"1 1 180px"}}>Ny klass<input value={name} onChange={e=>setName(e.target.value)} placeholder="Exempel: 8D" /></label><button type="button" disabled={!name.trim()||groups.some(g=>g.name.toLocaleLowerCase('sv')===name.trim().toLocaleLowerCase('sv'))} onClick={addClass}>+ Lägg till klassrad</button></div></td></tr></tfoot>
      </table>
      </div>}
    </div>}
    </>}
    {showClassMenu && groups.length > 0 && <div style={{display:"flex",gap:10,flexWrap:"wrap",margin:"12px 0"}}>
      <button type="button" className="secondary" aria-expanded={compare} onClick={()=>{setCompare(v=>!v);setShowAll(false)}}>{compare?"▾ Dölj klassernas veckor":"▸ Visa klassernas veckor"}</button>
      <button type="button" className="secondary" aria-expanded={!compare&&showClassDetails} onClick={()=>{setCompare(false);setShowClassDetails(v=>!v);setShowAll(false)}}>{!compare&&showClassDetails?"▾ Dölj enskilda ändringar":"⚙ Visa enskilda ändringar"}</button>
    </div>}
    {showClassMenu && compare && <div style={{marginTop:18}}>
      <h3>Jämför klasser – veckomatris</h3>
      <p className="muted">Varje klass har sin egen ruta. Lektionsnumren börjar på 1 varje vecka, men innehållet fortsätter i rätt ordning.</p>
      {comparisonWeeks.length>0 && <div style={{display:"flex",alignItems:"center",flexWrap:"wrap",gap:10,margin:"14px 0 18px"}}>
        <button type="button" className="secondary" disabled={selectedComparisonWeek<=0} onClick={()=>setComparisonWeek(n=>Math.max(0,n-1))}>← Föregående vecka</button>
        <strong style={{fontSize:"1.12rem"}}>Vecka {(() => {const d=new Date(comparisonWeeks[selectedComparisonWeek]+"T12:00:00");d.setDate(d.getDate()+3);const y=new Date(d.getFullYear(),0,4);return 1+Math.round(((d-y)/86400000-3+(y.getDay()+6)%7)/7)})()}</strong>
        <button type="button" className="secondary" disabled={selectedComparisonWeek>=comparisonWeeks.length-1} onClick={()=>setComparisonWeek(n=>Math.min(comparisonWeeks.length-1,n+1))}>Nästa vecka →</button>
        <select aria-label="Välj vecka att jämföra" value={selectedComparisonWeek} onChange={e=>setComparisonWeek(Number(e.target.value))}>{comparisonWeeks.map((key,i)=><option key={key} value={i}>{key}</option>)}</select>
      </div>}
      {comparisonWeeks[selectedComparisonWeek] && <div style={{width:"100%",paddingBottom:10}}><div style={{display:"grid",gridTemplateColumns:`repeat(${comparison.length}, minmax(0, 1fr))`,gap:8,width:"100%"}}>
        {comparison.map((g,i)=>{const items=g.weeks[comparisonWeeks[selectedComparisonWeek]]||[];const group=groups[i];return <article key={g.name} style={{border:"1px solid #c9d9d0",borderRadius:12,background:["#eaf3ff","#fff1db","#e8f6eb","#f2ebfa"][i%4],padding:8,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,flexWrap:"wrap",marginBottom:12}}>
            <strong style={{fontSize:"1rem",color:"#273e34"}}>{g.name}</strong>
            <span style={{fontSize:".72rem",borderRadius:30,padding:"3px 6px",background:"#fff"}}>{lessonsPerWeek(group)} lek/vecka</span>
          </div>
          <div style={{display:"grid",gap:6}}>
            {items.length?items.map((item,j)=><div key={item.lessonNumber} style={{background:"#fff",border:"1px solid #e0e7e2",borderRadius:8,padding:"8px 7px",overflowWrap:"anywhere"}}>
              <div style={{fontSize:".75rem",color:"#52635c",marginBottom:4}}>{item.day} · {item.date}</div>
              <strong>Lektion {j+1}</strong>
              <div style={{fontSize:".8rem",marginTop:5,whiteSpace:"pre-wrap"}}>{item.override?.text ?? describe(item.lesson)}</div>
              <div style={{fontSize:".7rem",color:"#63756a",marginTop:5}}>Gemensam lektion {item.lessonNumber}</div>
            </div>):<div style={{background:"#fff",padding:14,borderRadius:10,color:"#65756b"}}>Ingen lektion denna vecka</div>}
          </div>
        </article>})}
      </div></div>}
    </div>}
    {showClassMenu && group && !compare && showClassDetails && <>
      <h3>{group.name} – eget lektionsschema</h3>
      <p><strong>{lessonsPerWeek(group)} lektioner per vecka.</strong> Lektionsdagarna visas i matrisen ovan. En klass kan ha fler eller färre lektioner än de andra.</p>
      <label>Startdatum <input type="date" value={group.startDate || plan.startDate || ''} onChange={e => updateGroup({startDate:e.target.value})} /></label>
      <p className="muted">Lektionsdagar och antal lektioner ändras i klassmatrisen ovan. Här hanterar du endast särskilda ändringar för den valda klassen.</p>
      <p><strong>{schedule.length} planerade lektioner</strong> från grundplaneringen. Lektionsnumren börjar om på 1 varje kalendervecka. Det gemensamma innehållet fortsätter i rätt ordning. Ändringar i en klass påverkar inte andra klasser.</p>
      {!(group.days || []).length && <p role="alert">Välj minst en lektion per vecka för att se planeringen.</p>}
      {weeksShown.map(week => <div key={week.weekStart} style={{border:'1px solid #cbd5e1',borderRadius:10,padding:12,margin:'12px 0'}}>
        <h4 style={{margin:'0 0 10px'}}>Vecka {(() => {const d=new Date(week.weekStart+'T12:00:00');d.setDate(d.getDate()+3);const y=new Date(d.getFullYear(),0,4);return 1+Math.round(((d-y)/86400000-3+(y.getDay()+6)%7)/7)})()} · {week.weekStart}</h4>
        {week.items.map(item => <div key={item.lessonNumber} style={{padding:'8px 0',borderTop:'1px solid #e2e8f0'}}>
          <strong>{DAY_SHORT[DAYS.indexOf(item.day)]} {item.date} – Lektion {item.weekLessonNumber}</strong>
          <div className="muted">Gemensam lektion {item.lessonNumber} · Från grundplaneringens vecka {item.weekNumber || '?'}{item.weekTitle ? ' · '+item.weekTitle : ''}</div>
          <div style={{whiteSpace:'pre-wrap'}}>{item.override?.text ?? describe(item.lesson)}</div>
          {editing===item.lessonNumber ? <div>
            <label>Eget innehåll för {group.name}<textarea value={editText} onChange={e=>setEditText(e.target.value)} /></label>
            <button type="button" onClick={() => {updateGroup({overrides:{...group.overrides,[String(item.lessonNumber-1)]:{text:editText}}});setEditing(null)}}>Spara klassens ändring</button>
            <button type="button" className="secondary" onClick={()=>setEditing(null)}>Avbryt</button>
          </div> : <div className="button-row">
            <button type="button" className="secondary" onClick={()=>{setEditing(item.lessonNumber);setEditText(item.override?.text ?? describe(item.lesson))}}>Ändra bara för {group.name}</button>
            {item.override && <button type="button" className="secondary" onClick={()=>{const overrides={...group.overrides};delete overrides[String(item.lessonNumber-1)];updateGroup({overrides})}}>Återställ grundinnehåll</button>}
            <button type="button" className="secondary" onClick={()=>{
              if (!window.confirm('Ställa in alla lektioner '+item.date+' för '+group.name+'? Innehållet flyttas till nästa tillgängliga lektionstillfälle.')) return
              updateGroup({cancelledDates:[...new Set([...(group.cancelledDates||[]),item.date])]})
            }}>Ställ in datum</button>
          </div>}
        </div>)}
      </div>)}
      {group.cancelledDates?.length > 0 && <div><h4>Inställda datum</h4>{group.cancelledDates.map(date=><div key={date}>{date} <button type="button" className="secondary" onClick={()=>updateGroup({cancelledDates:group.cancelledDates.filter(d=>d!==date)})}>Återställ</button></div>)}</div>}
      {group.overrides && Object.keys(group.overrides).length>0 && <p className="muted">Egna ändringar är sparade separat för {group.name}. Grundplaneringen och övriga klasser påverkas inte.</p>}
      {grouped.length>8 && <button type="button" className="secondary" onClick={()=>setShowAll(!showAll)}>{showAll?'Visa färre veckor':'Visa alla '+grouped.length+' veckor'}</button>}
      <p className="muted">Ändringarna sparas tillsammans med grundplaneringen när du använder appens vanliga Spara-knapp. Inställda lektioner hoppas inte över.</p>
    </>}
  </section>
}
