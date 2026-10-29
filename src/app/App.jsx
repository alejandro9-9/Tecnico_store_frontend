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

export default function App() {
  const [page, setPage] = useState('client')
  const [apiOnline, setApiOnline] = useState(null)

  useEffect(() => {
    api('/health').then(() => setApiOnline(true)).catch(() => setApiOnline(false))
  }, [])

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
