// Testhärva för elevutskriften. Ingår inte i produktionsbygget (inte en build-ingång i vite.config.js).
import { createRoot } from 'react-dom/client'
import '../../src/index.css'
import '../../src/App.css'
import { StudentView } from '../../src/App.jsx'
import { buildFixturePlan } from './fixtures.js'

const params = new URLSearchParams(window.location.search)
const scenario = params.get('scenario') || 'vecka44-lång'
const klass = params.get('klass') || ''
createRoot(document.getElementById('root')).render(<StudentView plan={buildFixturePlan(scenario)} preview initialClass={klass} />)
