import { useEffect, useState } from 'react'
import { supabase } from './supabase'
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
function App() {
  const [session, setSession] = useState(null)
  const [laddar, setLaddar] = useState(true)

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
    if (session?.user?.id) {
      hamtaPlaneringar(session.user.id)
    } else {
      setPlaneringar([])
    }
  }, [session?.user?.id])

  async function hamtaPlaneringar(userId) {
    setHamtar(true)

    const { data, error } = await supabase
      .from('veckoplanering')
      .select('id, title, content, week_start, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) {
      setStatus('Kunde inte hämta planeringar: ' + error.message)
    } else {
      setPlaneringar(data || [])
    }

    setHamtar(false)
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
    await supabase.auth.signOut()
    setTitel('')
    setInnehall(tommaDagar())
    setPlaneringar([])
    setRedigerarId(null)
    setStatus('')
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

    if (!dagar.some((dag) => innehall[dag]?.trim())) {
      setStatus('Skriv något på minst en dag.')
      return
    }

    if (!session?.user) {
      setStatus('Du behöver logga in först.')
      return
    }

    setStatus('Sparar...')

    const { error } = await supabase
      .from('veckoplanering')
      .insert({
        user_id: session.user.id,
        week_start: vecka,
        title: titel,
content: JSON.stringify({
  dagar: innehall,
  detaljer: detaljer
  
})   

      })
.select()

    if (error) {
      setStatus('Kunde inte spara: ' + error.message)
    } else {
      setStatus('Veckoplaneringen är sparad!')
      setTitel('')
      setInnehall(tommaDagar())
      setDetaljer(tommaDetaljer())
      await hamtaPlaneringar(session.user.id)
    }
  }

  function borjaRedigera(planering) {
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

    setStatus('Sparar ändringen...')

    const { data, error } = await supabase
      .from('veckoplanering')
      .update({
  title: redigeraTitel,
  content: JSON.stringify({
    dagar: redigeraInnehall,
    detaljer: redigeraDetaljer
  }),
  updated_at: new Date().toISOString(),
})
      .eq('id', id)
      .eq('user_id', session.user.id)
      .select('id')

    if (error) {
      setStatus('Kunde inte ändra: ' + error.message)
    } else if (!data?.length) {
      setStatus('Ingen planering ändrades.')
    } else {
      setRedigerarId(null)
      setStatus('Ändringen är sparad!')
      await hamtaPlaneringar(session.user.id)
    }
  }

  async function raderaPlanering(id) {
    if (!session?.user) return

    const bekrafta = window.confirm(
      'Vill du verkligen radera den här planeringen?'
    )

    if (!bekrafta) return

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
          onChange={(e) => setVecka(mandagensDatum(e.target.value))}
        />
      </label>

      <button onClick={() => setVecka(bytVecka(vecka, -1))}>
  Föregående vecka
</button>

{' '}

<button onClick={() => setVecka(bytVecka(vecka, 1))}>
  Nästa vecka
</button>

<br /><br /><br /><br />

      <input
        placeholder="Rubrik"
        value={titel}
        onChange={(e) => setTitel(e.target.value)}
      />

      <br /><br />

{dagar.map((dag) => (
  <div key={dag}>
    <h3>{dag}</h3>

    <textarea
      placeholder={`Planering för ${dag.toLowerCase()}...`}
      value={innehall[dag]}
      onChange={(e) =>
        setInnehall({
          ...innehall,
          [dag]: e.target.value,
        })
      }
      rows="4"
      cols="50"
    />

    <div className="day-details">
      <input
        placeholder="Delmoment"
        value={detaljer[dag]?.delmoment || ''}
        onChange={(e) =>
          setDetaljer({
            ...detaljer,
            [dag]: {
              ...detaljer[dag],
              delmoment: e.target.value,
            },
          })
        }
      />

      <input
        placeholder="Uppgiftsnummer"
        value={detaljer[dag]?.uppgiftsnummer || ''}
        onChange={(e) =>
          setDetaljer({
            ...detaljer,
            [dag]: {
              ...detaljer[dag],
              uppgiftsnummer: e.target.value,
            },
          })
        }
      />

      <input
        placeholder="Sidnummer"
        value={detaljer[dag]?.sidnummer || ''}
        onChange={(e) =>
          setDetaljer({
            ...detaljer,
            [dag]: {
              ...detaljer[dag],
              sidnummer: e.target.value,
            },
          })
        }
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
                    onChange={(e) =>
                      setRedigeraTitel(e.target.value)
                    }
                  />

                  {dagar.map((dag) => (
                    <div key={dag}>
                      <h4>{dag}</h4>

                      <textarea
 value={redigeraInnehall[dag] || ''}
 onChange={(e) => setRedigeraInnehall({ ...redigeraInnehall, [dag]: e.target.value })}
                        rows="4"
                        cols="45"
                      />
                      <input
  placeholder="Delmoment"
  value={redigeraDetaljer[dag]?.delmoment || ''}
  onChange={(e) =>
    setRedigeraDetaljer({
      ...redigeraDetaljer,
      [dag]: {
        ...redigeraDetaljer[dag],
        delmoment: e.target.value
      }
    })
  }
/>

<input
  placeholder="Uppgiftsnummer"
  value={redigeraDetaljer[dag]?.uppgiftsnummer || ''}
  onChange={(e) =>
    setRedigeraDetaljer({
      ...redigeraDetaljer,
      [dag]: {
        ...redigeraDetaljer[dag],
        uppgiftsnummer: e.target.value
      }
    })
  }
/>

<input
  placeholder="Sidnummer"
  value={redigeraDetaljer[dag]?.sidnummer || ''}
  onChange={(e) =>
    setRedigeraDetaljer({
      ...redigeraDetaljer,
      [dag]: {
        ...redigeraDetaljer[dag],
        sidnummer: e.target.value
      }
    })
  }
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
                    onClick={() => setRedigerarId(null)}
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

export default App