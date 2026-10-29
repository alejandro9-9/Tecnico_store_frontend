import { useState } from 'react'
import { api, roleHeader } from '../../services/api.js'

function RoleLogin({ role, onLogin }) {
  const admin = role === 'admin'
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      await api(admin ? '/api/admin/appointments' : '/api/staff/appointments', { headers: roleHeader(role, token) })
      sessionStorage.setItem(`evol_${role}_token`, token); onLogin(token)
    } catch (err) { setError(err.message.includes('(401)') ? 'La clave no es válida.' : err.message) }
    finally { setBusy(false) }
  }
  return <div className="login-wrap"><div className="login-card card"><div className="login-emblem">{admin ? '▦' : '⌁'}</div><span className="eyebrow">ÁREA DE PERSONAL</span><h1>Acceso de {admin ? 'administración' : 'técnico'}</h1><p>{admin ? 'Consulta citas, precios registrados y horarios bloqueados.' : 'Revisa las solicitudes y decide si puedes atender el horario.'}</p><form onSubmit={submit}><label>Clave de acceso<input type="password" value={token} onChange={e => setToken(e.target.value)} autoComplete="current-password" required /></label><div className="login-key-hint">Clave local de {admin ? 'administración' : 'técnico'}: <code>{admin ? 'adm' : 'tec'}</code></div>{error && <div className="error-banner">{error}</div>}<button className="button button-primary full" disabled={busy}>{busy ? 'Validando…' : 'Ingresar'}</button></form></div></div>
}

export default RoleLogin

