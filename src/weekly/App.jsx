import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase'
import './App.css'
const dagar = ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag']

function bytVecka(datum, antalVeckor) {
  const nyttDatum = new Date(datum + 'T12:00:00')
  nyttDatum.setDate(nyttDatum.getDate() + antalVeckor * 7)

  const ar = nyttDatum.getFullYear()
  const manad = String(nyttDatum.getMonth() + 1).padStart(2, '0')
  const dag = String(nyttDatum.getDate()).padStart(2, '0')

  return `${ar}-${manad}-${dag}`
}
function tommaDagar() {
  return {
    Måndag: '',
    Tisdag: '',
    Onsdag: '',
    Torsdag: '',
    Fredag: '',
  }
}
function tommaDetaljer() {
  return Object.fromEntries(
    dagar.map((dag) => [
      dag,
      { delmoment: '', uppgiftsnummer: '', sidnummer: '' }
    ])
  )
}
function mandagensDatum(valtDatum = new Date()) {
  const idag = new Date(valtDatum)
  const veckodag = idag.getDay()
  const skillnad = veckodag === 0 ? -6 : 1 - veckodag

  idag.setDate(idag.getDate() + skillnad)

  const ar = idag.getFullYear()
  const manad = String(idag.getMonth() + 1).padStart(2, '0')
  const dag = String(idag.getDate()).padStart(2, '0')

  return `${ar}-${manad}-${dag}`
}

function lasDagar(text) {
  try {
    const resultat = JSON.parse(text)

    if (
      resultat &&
      typeof resultat === 'object' &&
      !Array.isArray(resultat)
    ) {
     return { ...tommaDagar(), ...(resultat.dagar || resultat) }
    }
  } catch {
    // Äldre planeringar kan innehålla vanlig text.
  }

  return {
    ...tommaDagar(),
    Måndag: text || '',
  }
}
function lasDetaljer(text) {
  try {
    const resultat = JSON.parse(text)

    if (
      resultat &&
      typeof resultat === 'object' &&
      !Array.isArray(resultat)
    ) {
      const sparadeDetaljer = resultat.detaljer || {}
      const detaljer = tommaDetaljer()

      dagar.forEach((dag) => {
        const sparat = sparadeDetaljer[dag]

        if (typeof sparat === 'string') {
          detaljer[dag] = {
            delmoment: sparat,
            uppgiftsnummer: '',
            sidnummer: ''
          }
        } else if (sparat && typeof sparat === 'object') {
          detaljer[dag] = {
            ...detaljer[dag],
            ...sparat
          }
        }
      })

      return detaljer
    }
  } catch {
    // Äldre planeringar kan innehålla vanlig text.
  }

  return tommaDetaljer()
}
// Även ifyllda delmoment/uppgifter/sidor räknas som planeringsinnehåll.
function hasWeeklyContent(dayContent, dayDetails) {
  return dagar.some((dag) => {
    const details = dayDetails?.[dag] || {}
    return [dayContent?.[dag], details.delmoment, details.uppgiftsnummer, details.sidnummer]
      .some((value) => typeof value === 'string' && value.trim().length > 0)
  })
}

// Ignorera gamla svar om användaren har bytts eller en ny hämtning startats.
function isCurrentWeeklyRequest(activeUserId, requestedUserId, activeRequest, requestId) {
  return Boolean(requestedUserId) && activeUserId === requestedUserId && activeRequest === requestId
}

function isWeeklyRow(row) {
  try {
    const data = JSON.parse(row.content || '{}')
    return data?.kind !== 'arsplanering-v1' && data?.kind !== 'arsplanering-v2'
  } catch { return true }
}

function WeeklyApp() {
  const [session, setSession] = useState(null)
  const [laddar, setLaddar] = useState(true)
  const [editorOwnerId, setEditorOwnerId] = useState(null)
  const activeUserIdRef = useRef(null)
  const fetchSequenceRef = useRef(0)
  const draftVersionRef = useRef(0)
  const savingDraftRef = useRef(null)
  const editVersionRef = useRef(0)
  function markDraftEdited() { draftVersionRef.current += 1 }
  function markEditEdited() { editVersionRef.current += 1 }

  const [email, setEmail] = useState('')
  const [losenord, setLosenord] = useState('')

  const [vecka, setVecka] = useState(mandagensDatum())
  const [titel, setTitel] = useState('')
  const [innehall, setInnehall] = useState(tommaDagar())
  const [detaljer, setDetaljer] = useState(tommaDetaljer())
  const [status, setStatus] = useState('')

  const [planeringar, setPlaneringar] = useState([])
  const [hamtar, setHamtar] = useState(false)

  const [redigerarId, setRedigerarId] = useState(null)
  const [redigeraTitel, setRedigeraTitel] = useState('')
const [redigeraInnehall, setRedigeraInnehall] = useState(tommaDagar())
  const [redigeraDetaljer, setRedigeraDetaljer] = useState(tommaDetaljer())
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLaddar(false)
    })

    const { data: lyssnare } = supabase.auth.onAuthStateChange(
      (_event, nySession) => {
        setSession(nySession)
      }
    )

    return () => {
      lyssnare.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    const userId = session?.user?.id || null
    activeUserIdRef.current = userId
    fetchSequenceRef.current += 1 // Ogiltigförklara alla svar från föregående användare.
    markDraftEdited() // Ett gammalt sparningssvar får inte rensa en ny användares utkast.
    markEditEdited() // Ett gammalt ändringssvar får inte påverka nästa användares redigerare.
    setEditorOwnerId(null)
    setPlaneringar([])
    setHamtar(false)
    setTitel('')
    setInnehall(tommaDagar())
    setDetaljer(tommaDetaljer())
    setRedigerarId(null)
    setRedigeraTitel('')
    setRedigeraInnehall(tommaDagar())
    setRedigeraDetaljer(tommaDetaljer())
    setEditorOwnerId(userId)
    if (userId) hamtaPlaneringar(userId)
  }, [session?.user?.id])

  async function hamtaPlaneringar(userId) {
    if (activeUserIdRef.current !== userId) return
    const requestId = ++fetchSequenceRef.current
    const isCurrent = () => isCurrentWeeklyRequest(
      activeUserIdRef.current, userId, fetchSequenceRef.current, requestId
    )
    setHamtar(true)
    try {
      const { data, error } = await supabase
        .from('veckoplanering')
        .select('id, title, content, week_start, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
      if (!isCurrent()) return
      if (error) setStatus('Kunde inte hämta planeringar: ' + error.message)
      else setPlaneringar((data || []).filter(isWeeklyRow))
    } catch (error) {
      if (isCurrent()) setStatus('Kunde inte hämta planeringar: ' + (error.message || 'Okänt fel'))
    } finally {
      if (isCurrent()) setHamtar(false)
    }
  }

  async function loggaIn(e) {
    e.preventDefault()
    setStatus('Loggar in...')

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: losenord,
    })

    if (error) {
      setStatus('Inloggningen misslyckades. Kontrollera e-post och lösenord.')
    } else {
      setStatus('')
      setLosenord('')
    }
  }

  async function loggaUt() {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      // Även om auth-händelsen dröjer ska den privata redigeraren stängas.
      setSession(null)
      setStatus('')
    } catch (error) {
      setStatus('Kunde inte logga ut: ' + (error.message || 'Okänt fel'))
    }
  }

  async function sparaPlanering() {
    if (!titel.trim()) {
      setStatus('Skriv en rubrik.')
      return
    }

    if (!vecka) {
      setStatus('Välj en vecka.')
      return
    }

    if (!hasWeeklyContent(innehall, detaljer)) {
      setStatus('Skriv något på minst en dag eller i dess detaljer.')
      return
    }

    if (!session?.user) {
      setStatus('Du behöver logga in först.')
      return
    }

    const saveOwnerId = session.user.id
    // Hindra dubbla INSERT-anrop medan samma användares sparning pågår.
    if (savingDraftRef.current?.userId === saveOwnerId) return
    const saveToken = { userId: saveOwnerId }
    savingDraftRef.current = saveToken
    const savedDraftVersion = draftVersionRef.current
    try {
    setStatus('Sparar...')

    const { data, error } = await supabase
      .from('veckoplanering')
      .insert({
        user_id: session.user.id,
        week_start: vecka,
        title: titel,
content: JSON.stringify({
  kind: 'veckoplanering-v1',
  dagar: innehall,
  detaljer: detaljer
  
})   

      })
.select()

    if (activeUserIdRef.current !== saveOwnerId) return
    if (error) {
      setStatus('Kunde inte spara: ' + error.message)
    } else if (!Array.isArray(data) || data.length === 0) {
      // Infogningen kan ha skett även om raden inte syns i svaret. Bevara utkastet.
      await hamtaPlaneringar(saveOwnerId)
      setStatus('Sparningen kunde inte bekräftas. Kontrollera listan innan du försöker igen.')
    } else {
      const newerEdits = draftVersionRef.current !== savedDraftVersion
      if (!newerEdits) {
        setTitel('')
        setInnehall(tommaDagar())
        setDetaljer(tommaDetaljer())
      }
      setStatus(newerEdits
        ? 'Veckoplaneringen sparades, men nya ändringar i redigeraren är ännu inte sparade.'
        : 'Veckoplaneringen är sparad!')
      await hamtaPlaneringar(saveOwnerId)
    }
      } catch (error) {
      if (activeUserIdRef.current === saveOwnerId)
        setStatus('Kunde inte spara: ' + (error?.message || 'Okänt fel'))
    } finally {
      // Ett äldre svar får inte låsa upp en annan användares pågående sparning.
      if (savingDraftRef.current === saveToken) savingDraftRef.current = null
    }
}

  function borjaRedigera(planering) {
    markEditEdited()
    setRedigerarId(planering.id)
    setRedigeraTitel(planering.title || '')
    setRedigeraInnehall(lasDagar(planering.content))
setRedigeraDetaljer(lasDetaljer(planering.content))
    setStatus('')
  }

  async function sparaAndring(id) {
    if (!redigeraTitel.trim()) {
      setStatus('Skriv en rubrik.')
      return
    }

    if (!session?.user) return

    const saveOwnerId = session.user.id
    const savedEditVersion = editVersionRef.current
    try {
    setStatus('Sparar ändringen...')

    const { data, error } = await supabase
      .from('veckoplanering')
      .update({
  title: redigeraTitel,
  content: JSON.stringify({
    kind: 'veckoplanering-v1',
    dagar: redigeraInnehall,
    detaljer: redigeraDetaljer
  }),
  updated_at: new Date().toISOString(),
})
      .eq('id', id)
      .eq('user_id', session.user.id)
      .select('id')

    if (activeUserIdRef.current !== saveOwnerId) return
    if (error) {
      setStatus('Kunde inte ändra: ' + error.message)
    } else if (!data?.length) {
      setStatus('Ingen planering ändrades.')
    } else {
      const newerEdits = editVersionRef.current !== savedEditVersion
      if (!newerEdits) setRedigerarId(null)
      setStatus(newerEdits
        ? 'Ändringen sparades, men nyare ändringar i redigeraren är ännu inte sparade.'
        : 'Ändringen är sparad!')
      await hamtaPlaneringar(saveOwnerId)
    }
      } catch (error) {
      if (activeUserIdRef.current === saveOwnerId)
        setStatus('Kunde inte ändra: ' + (error?.message || 'Okänt fel'))
    }
}

  async function raderaPlanering(id) {
    if (!session?.user) return

    const bekrafta = window.confirm(
      'Vill du verkligen radera den här planeringen?'
    )

    if (!bekrafta) return

    try {
    setStatus('Raderar...')

    const { data, error } = await supabase
      .from('veckoplanering')
      .delete()
      .eq('id', id)
      .eq('user_id', session.user.id)
      .select('id')

    if (error) {
      setStatus('Kunde inte radera: ' + error.message)
    } else if (!data?.length) {
      setStatus('Ingen planering raderades.')
    } else {
      if (redigerarId === id) setRedigerarId(null)
      setStatus('Planeringen är raderad!')
      await hamtaPlaneringar(session.user.id)
    }
      } catch (error) {
      setStatus('Kunde inte radera: ' + (error?.message || 'Okänt fel'))
    }
}

  if (laddar) {
    return <p>Laddar...</p>
  }

  if (!session) {
    return (
      <main>
        <h1>Veckoplanering</h1>
        <h2>Logga in</h2>

        <form onSubmit={loggaIn}>
          <input
            type="email"
            placeholder="E-postadress"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <br /><br />

          <input
            type="password"
            placeholder="Lösenord"
            value={losenord}
            onChange={(e) => setLosenord(e.target.value)}
            required
          />

          <br /><br />

          <button type="submit">Logga in</button>
        </form>

        <p>{status}</p>
      </main>
    )
  }

  // Visa aldrig en tidigare användares osparade utkast vid kontobyte.
  if (editorOwnerId !== session.user.id) return <p>Laddar användarens planering...</p>

  return (
    <main className="app">
      <h1>Veckoplanering</h1>

      <p>Inloggad som: {session.user.email}</p>
      <button onClick={loggaUt}>Logga ut</button>

      <hr />

      <h2>Ny veckoplanering</h2>

      <label>
        Veckans måndag:
        <br />
        <input
          type="date"
          value={vecka}
          onChange={(e) => { if (e.target.value) { markDraftEdited(); setVecka(mandagensDatum(e.target.value)) } }}
        />
      </label>

      <button onClick={() => { markDraftEdited(); setVecka(bytVecka(vecka, -1)) }}>
  Föregående vecka
</button>

{' '}

<button onClick={() => { markDraftEdited(); setVecka(bytVecka(vecka, 1)) }}>
  Nästa vecka
</button>

<br /><br /><br /><br />

      <input
        placeholder="Rubrik"
        value={titel}
        onChange={(e) => { markDraftEdited(); setTitel(e.target.value) }}
      />

      <br /><br />

{dagar.map((dag) => (
  <div key={dag}>
    <h3>{dag}</h3>

    <textarea
      placeholder={`Planering för ${dag.toLowerCase()}...`}
      value={innehall[dag]}
      onChange={(e) => {
        markDraftEdited()
        setInnehall({ ...innehall, [dag]: e.target.value })
      }}
      rows="4"
      cols="50"
    />

    <div className="day-details">
      <input
        placeholder="Delmoment"
        value={detaljer[dag]?.delmoment || ''}
        onChange={(e) => {
          markDraftEdited()
          setDetaljer({
            ...detaljer,
            [dag]: { ...detaljer[dag], delmoment: e.target.value },
          })
        }}
      />

      <input
        placeholder="Uppgiftsnummer"
        value={detaljer[dag]?.uppgiftsnummer || ''}
        onChange={(e) => {
          markDraftEdited()
          setDetaljer({
            ...detaljer,
            [dag]: { ...detaljer[dag], uppgiftsnummer: e.target.value },
          })
        }}
      />

      <input
        placeholder="Sidnummer"
        value={detaljer[dag]?.sidnummer || ''}
        onChange={(e) => {
          markDraftEdited()
          setDetaljer({
            ...detaljer,
            [dag]: { ...detaljer[dag], sidnummer: e.target.value },
          })
        }}
      />
    </div>
  </div>
))}      

      <br />

      <button onClick={sparaPlanering}>
        Spara veckoplanering
      </button>

      <p>{status}</p>

      <hr />

      <h2>Mina sparade planeringar</h2>

      {hamtar ? (
        <p>Hämtar planeringar...</p>
      ) : planeringar.length === 0 ? (
        <p>Du har inga sparade planeringar ännu.</p>
      ) : (
        planeringar.map((planering) => {
          const planeradeDagar = lasDagar(planering.content)
          const planeradeDetaljer = lasDetaljer(planering.content)

          return (
            <div
              key={planering.id}
              style={{
                border: '1px solid #ccc',
                padding: '15px',
                marginBottom: '15px',
                textAlign: 'left',
              }}
            >
              {redigerarId === planering.id ? (
                <>
                  <input
                    value={redigeraTitel}
                    onChange={(e) => {
                      markEditEdited()
                      setRedigeraTitel(e.target.value)
                    }}
                  />

                  {dagar.map((dag) => (
                    <div key={dag}>
                      <h4>{dag}</h4>

                      <textarea
 value={redigeraInnehall[dag] || ''}
 onChange={(e) => { markEditEdited(); setRedigeraInnehall({ ...redigeraInnehall, [dag]: e.target.value }) }}
                        rows="4"
                        cols="45"
                      />
                      <input
  placeholder="Delmoment"
  value={redigeraDetaljer[dag]?.delmoment || ''}
  onChange={(e) => {
    markEditEdited()
    setRedigeraDetaljer({
      ...redigeraDetaljer,
      [dag]: {
        ...redigeraDetaljer[dag],
        delmoment: e.target.value
      }
    })
  }}
/>

<input
  placeholder="Uppgiftsnummer"
  value={redigeraDetaljer[dag]?.uppgiftsnummer || ''}
  onChange={(e) => {
    markEditEdited()
    setRedigeraDetaljer({
      ...redigeraDetaljer,
      [dag]: {
        ...redigeraDetaljer[dag],
        uppgiftsnummer: e.target.value
      }
    })
  }}
/>

<input
  placeholder="Sidnummer"
  value={redigeraDetaljer[dag]?.sidnummer || ''}
  onChange={(e) => {
    markEditEdited()
    setRedigeraDetaljer({
      ...redigeraDetaljer,
      [dag]: {
        ...redigeraDetaljer[dag],
        sidnummer: e.target.value
      }
    })
  }}
/>
                    </div>
                  ))}

                  <button
                    onClick={() => sparaAndring(planering.id)}
                  >
                    Spara ändring
                  </button>

                  {' '}

                  <button
                    onClick={() => { markEditEdited(); setRedigerarId(null) }}
                  >
                    Avbryt
                  </button>
                </>
              ) : (
                <>
                  <h3>{planering.title}</h3>

                  <p>
                    Veckans måndag:{' '}
                    {planering.week_start || 'Inte angiven'}
                  </p>

                  {dagar.map((dag) => (
                    <div key={dag}>
                      <h4>{dag}</h4>
                      <p style={{ whiteSpace: 'pre-wrap' }}>
                        {planeradeDagar[dag] || '–'}
                      </p>
                    
               {planeradeDetaljer[dag] && (
  <div>
    <p>
      Delmoment:{' '}
      {typeof planeradeDetaljer[dag] === 'string'
        ? planeradeDetaljer[dag]
        : planeradeDetaljer[dag].delmoment || '–'}
    </p>
    {typeof planeradeDetaljer[dag] === 'object' &&
      planeradeDetaljer[dag].uppgiftsnummer && (
        <p>Uppgiftsnummer: {planeradeDetaljer[dag].uppgiftsnummer}</p>
      )}
    {typeof planeradeDetaljer[dag] === 'object' &&
      planeradeDetaljer[dag].sidnummer && (
        <p>Sidnummer: {planeradeDetaljer[dag].sidnummer}</p>
      )}
  </div>
)}
            </div>
                  
                  ))}

                  <button
                    onClick={() => borjaRedigera(planering)}
                  >
                    Ändra
                  </button>

                  {' '}

                  <button
                    onClick={() => raderaPlanering(planering.id)}
                  >
                    Radera
                  </button>
                </>
              )}
            </div>
          )
        })
      )}
    </main>
  )
}

export default function App() { return <><nav style={{display:'flex',gap:16,alignItems:'center',padding:'13px 24px',background:'#075b46',color:'white',fontFamily:'Segoe UI,Arial,sans-serif',flexWrap:'wrap'}}><strong>Lärarplanering</strong><a style={{color:'white',fontWeight:700}} href="/">Årsplanering</a><a style={{color:'white',fontWeight:700}} href="/veckoplanering.html">Veckoplanering</a></nav><WeeklyApp /></> }