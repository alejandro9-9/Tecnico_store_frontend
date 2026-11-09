import { useEffect, useState } from 'react'
import { api } from '../services/api.js'
import ClientView from '../features/chat/ClientView.jsx'
import TechnicianView from '../features/technician/TechnicianView.jsx'
import AdminView from '../features/admin/AdminView.jsx'

const tabs = [
  { id: 'client', label: 'Cotizar reparación', icon: '✳' },
  { id: 'staff', label: 'Técnico', icon: '⌁' },
  { id: 'admin', label: 'Administración', icon: '▦' },
]

const API_STARTUP_WINDOW_MS = 90_000
const API_RETRY_DELAY_MS = 4_000

function ApiStartupScreen({ timedOut, onRetry }) {
  return <main className="api-startup-shell" aria-live="polite">
    <section className="api-startup-card">
      <img className="api-startup-logo" src="/tecfast-logo.svg" alt="TecFast · Reparación móvil" />
      {!timedOut ? <>
        <span className="api-startup-spinner" aria-hidden="true" />
        <h1>Preparando TecFast</h1>
        <p>Estamos despertando el servicio. En el plan gratuito puede tardar unos segundos en iniciar.</p>
        <small>No cierres esta ventana; te mostraremos la aplicación cuando esté lista.</small>
      </> : <>
        <h1>Estamos tardando un poco más</h1>
        <p>El servicio todavía no está disponible. Puedes volver a intentarlo ahora.</p>
        <button className="api-startup-button" type="button" onClick={onRetry}>Intentar de nuevo</button>
      </>}
    </section>
  </main>
}

export default function App() {
  const [page, setPage] = useState('client')
  const [apiOnline, setApiOnline] = useState(null)
  const [startupTimedOut, setStartupTimedOut] = useState(false)
  const [retryNumber, setRetryNumber] = useState(0)

  useEffect(() => {
    let active = true
    let timer
    const startedAt = Date.now()

    const checkApi = () => {
      api('/health').then(() => {
        if (!active) return
        setApiOnline(true)
        setStartupTimedOut(false)
      }).catch(() => {
        if (!active) return
        if (Date.now() - startedAt >= API_STARTUP_WINDOW_MS) {
          setApiOnline(false)
          setStartupTimedOut(true)
          return
        }
        timer = window.setTimeout(checkApi, API_RETRY_DELAY_MS)
      })
    }

    checkApi()
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [retryNumber])

  if (apiOnline !== true) {
    return <ApiStartupScreen timedOut={startupTimedOut} onRetry={() => {
      setApiOnline(null)
      setStartupTimedOut(false)
      setRetryNumber(value => value + 1)
    }} />
  }

  return <div className="app-shell theme-dark">
    <header className="topbar">
      <a className="brand" href="#inicio" onClick={event => { event.preventDefault(); setPage('client') }}>
        <img src="/tecfast-logo.svg" alt="TecFast · Reparación móvil" />
      </a>
      <nav className="main-nav" aria-label="Navegación principal">
        {tabs.map(item => <button key={item.id} className={`nav-link ${page === item.id ? 'active' : ''}`} onClick={() => setPage(item.id)}>
          <span className="nav-icon">{item.icon}</span>{item.label}
        </button>)}
      </nav>
      <span className={`api-status ${apiOnline === true ? 'online' : apiOnline === false ? 'offline' : ''}`}>
        <i />{apiOnline === true ? 'Servicio conectado' : apiOnline === false ? 'API desconectada' : 'Conectando…'}
      </span>
    </header>
    <main className="main-content">
      {page === 'client' && <ClientView />}
      {page === 'staff' && <TechnicianView />}
      {page === 'admin' && <AdminView />}
    </main>
    <footer className="footer"><img src="/tecfast-logo.svg" alt="TecFast · Reparación móvil" /><span>Precios sujetos a diagnóstico del técnico</span></footer>
  </div>
}
