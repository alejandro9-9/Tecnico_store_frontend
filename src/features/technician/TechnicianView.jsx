import { useCallback, useEffect, useState } from 'react'
import { api, roleHeader } from '../../services/api.js'
import RoleLogin from '../../components/auth/RoleLogin.jsx'
import PageHeading from '../../components/common/PageHeading.jsx'
import Metric from '../../components/common/MetricCard.jsx'
import Status from '../../components/common/StatusBadge.jsx'
import Empty from '../../components/common/EmptyState.jsx'
import Loading from '../../components/common/LoadingState.jsx'
import useRoleToken from '../../components/auth/useRoleToken.js'
import { showDate } from '../../utils/appointment.js'

function StaffView() {
  const [token, setToken, logout] = useRoleToken('staff')
  const [appointments, setAppointments] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const refresh = useCallback(async () => {
    if (!token) return
    try { const data = await api('/api/staff/appointments', { headers: roleHeader('staff', token) }); setAppointments(data); setError('') }
    catch (err) { setError(err.message); if (err.message.includes('401')) logout() }
  }, [token])
  useEffect(() => { if (token) { setLoading(true); refresh().finally(() => setLoading(false)); const timer = setInterval(refresh, 5000); return () => clearInterval(timer) } }, [token, refresh])
  async function decide(id, status) {
    setError(''); setNotice('')
    try { await api(`/api/staff/appointments/${id}`, { method: 'PATCH', headers: roleHeader('staff', token), body: JSON.stringify({ status }) }); setNotice(status === 'confirmed' ? 'Disponibilidad confirmada.' : 'Solicitud marcada como no disponible.'); refresh() }
    catch (err) { setError(err.message) }
  }
  if (!token) return <RoleLogin role="staff" onLogin={setToken} />
  const pending = appointments.filter(a => a.status === 'requested')
  return <section className="dashboard-view">
    <div className="dashboard-heading"><PageHeading eyebrow="EQUIPO TECFAST" title="Disponibilidad del técnico" description="Confirma o rechaza las solicitudes de horario de los clientes." icon="⌁" /><button className="button button-quiet" onClick={logout}>Cerrar sesión</button></div>
    <div className="metric-grid"><Metric label="Pendientes de decisión" value={pending.length} icon="◷" /><Metric label="Disponibilidad confirmada" value={appointments.filter(a => a.status === 'confirmed').length} icon="✓" /><Metric label="Solicitudes totales" value={appointments.length} icon="▤" /></div>
    {error && <div className="error-banner">{error}</div>}{notice && <div className="success-banner">{notice}</div>}
    <section className="card table-card"><div className="section-heading"><div><span className="eyebrow">AGENDA</span><h2>Solicitudes de cita</h2></div><button className="button button-quiet" onClick={refresh}>↻ Actualizar</button></div>
      {loading ? <Loading /> : appointments.length === 0 ? <Empty text="Aún no hay solicitudes de cita." /> : <div className="table-scroll"><table><thead><tr><th>Cita</th><th>Fecha y hora</th><th>Disponibilidad</th><th>Cliente</th><th>Celular</th><th>Equipo y reparación</th></tr></thead><tbody>{appointments.map(a => <tr key={a.id}><td>#{a.id}</td><td>{showDate(a.scheduled_at)}</td><td><Status value={a.status} /></td><td>{a.customer_name}</td><td>{a.customer_phone}</td><td>{a.brand} {a.model}<small>{a.issue}</small></td></tr>)}</tbody></table></div>}
    </section>
    <section className="card decision-card"><div className="section-heading"><div><span className="eyebrow">ACCIÓN DEL TÉCNICO</span><h2>Decidir disponibilidad</h2></div><span className="pill">{pending.length} pendiente{pending.length === 1 ? '' : 's'}</span></div>
      {pending.length === 0 ? <Empty text="No hay solicitudes pendientes de decisión." /> : <div className="decision-list">{pending.map(a => <article className="decision-item" key={a.id}><div className="decision-info"><span className="appointment-id">CITA #{a.id}</span><h3>{a.customer_name}</h3><p>{a.brand} {a.model} · {a.issue}</p><small>{showDate(a.scheduled_at)} · {a.customer_phone}</small></div><div className="decision-actions"><button className="button button-primary" onClick={() => decide(a.id, 'confirmed')}>✓ Confirmar</button><button className="button button-danger" onClick={() => decide(a.id, 'cancelled')}>No disponible</button></div></article>)}</div>}
    </section>
  </section>
}

export default StaffView

