import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, roleHeader } from '../../services/api.js'
import RoleLogin from '../../components/auth/RoleLogin.jsx'
import PageHeading from '../../components/common/PageHeading.jsx'
import Metric from '../../components/common/MetricCard.jsx'
import Status from '../../components/common/StatusBadge.jsx'
import Empty from '../../components/common/EmptyState.jsx'
import Loading from '../../components/common/LoadingState.jsx'
import useRoleToken from '../../components/auth/useRoleToken.js'
import { showDate } from '../../utils/appointment.js'

function AdminView() {
  const [token, setToken, logout] = useRoleToken('admin')
  const [appointments, setAppointments] = useState([])
  const [services, setServices] = useState([])
  const [models, setModels] = useState([])
  const [prices, setPrices] = useState([])
  const [blocks, setBlocks] = useState([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [priceDevice, setPriceDevice] = useState('')
  const [newDevice, setNewDevice] = useState(false)
  const [brand, setBrand] = useState('')
  const [model, setModel] = useState('')
  const [repairCode, setRepairCode] = useState('')
  const [priceValue, setPriceValue] = useState('')
  const [priceSearch, setPriceSearch] = useState('')
  const [blockDate, setBlockDate] = useState('')
  const [blockStart, setBlockStart] = useState('09:00')
  const [blockEnd, setBlockEnd] = useState('10:00')
  const [blockReason, setBlockReason] = useState('Horario no disponible')
  const [loading, setLoading] = useState(false)
  const headers = useMemo(() => roleHeader('admin', token), [token])
  const refresh = useCallback(async () => {
    if (!token) return
    try {
      const [a, s, m, p, b] = await Promise.all([
        api('/api/admin/appointments', { headers }), api('/api/services'), api('/api/models'),
        api('/api/admin/model-prices', { headers }), api('/api/admin/blocks', { headers }),
      ])
      setAppointments(a); setServices(s); setModels(m); setPrices(p); setBlocks(b); setError('')
      if (!repairCode && s.length) setRepairCode(s[0].code)
    } catch (err) { setError(err.message); if (err.message.includes('401')) logout() }
  }, [token, headers])
  useEffect(() => { if (token) { setLoading(true); refresh().finally(() => setLoading(false)); const timer = setInterval(refresh, 7000); return () => clearInterval(timer) } }, [token, refresh])
  const devices = useMemo(() => models.map(x => ({ brand: x.brand, model: x.model })).sort((a, b) => `${a.brand} ${a.model}`.localeCompare(`${b.brand} ${b.model}`, 'es')), [models])
  const visiblePrices = useMemo(() => prices.filter(p => `${p.brand} ${p.model} ${p.repair_name}`.toLocaleLowerCase('es').includes(priceSearch.trim().toLocaleLowerCase('es'))), [prices, priceSearch])
  useEffect(() => { if (!newDevice && devices.length && !priceDevice) setPriceDevice(`${devices[0].brand}|${devices[0].model}`) }, [devices, newDevice, priceDevice])
  useEffect(() => {
    if (newDevice) return
    const [selectedBrand, selectedModel] = priceDevice.split('|')
    setBrand(selectedBrand || ''); setModel(selectedModel || '')
    const item = prices.find(p => p.brand.toLowerCase() === selectedBrand?.toLowerCase() && p.model.toLowerCase() === selectedModel?.toLowerCase() && p.repair_code === repairCode)
    setPriceValue(item ? String(item.price) : '')
  }, [priceDevice, repairCode, prices, newDevice])
  if (!token) return <RoleLogin role="admin" onLogin={setToken} />

  async function savePrice(e) {
    e.preventDefault(); setError(''); setNotice('')
    try {
      await api('/api/admin/model-prices', { method: 'PUT', headers, body: JSON.stringify({ brand, model, repair_code: repairCode, price: Number(priceValue) }) })
      setNotice(`Precio guardado para ${brand} ${model}.`); setNewDevice(false); await refresh()
    } catch (err) { setError(err.message) }
  }
  async function createBlock(e) {
    e.preventDefault(); setError(''); setNotice('')
    const startsAt = new Date(`${blockDate}T${blockStart}:00-05:00`).toISOString()
    const endsAt = new Date(`${blockDate}T${blockEnd}:00-05:00`).toISOString()
    try { await api('/api/admin/blocks', { method: 'POST', headers, body: JSON.stringify({ starts_at: startsAt, ends_at: endsAt, reason: blockReason }) }); setNotice('Horario bloqueado para nuevas solicitudes.'); await refresh() }
    catch (err) { setError(err.message) }
  }
  async function removeBlock(id) {
    try { await api(`/api/admin/blocks/${id}`, { method: 'DELETE', headers }); setNotice('Bloqueo retirado.'); await refresh() }
    catch (err) { setError(err.message) }
  }
  return <section className="dashboard-view">
    <div className="dashboard-heading"><PageHeading eyebrow="CONTROL DEL TALLER" title="Administración" description="Consulta citas, registra precios específicos y bloquea horarios." icon="▦" /><button className="button button-quiet" onClick={logout}>Cerrar sesión</button></div>
    {error && <div className="error-banner">{error}</div>}{notice && <div className="success-banner">{notice}</div>}
    <div className="metric-grid"><Metric label="Citas registradas" value={appointments.length} icon="▤" /><Metric label="Pendientes de confirmación" value={appointments.filter(a => a.status === 'requested').length} icon="◷" /><Metric label="Precios específicos" value={prices.length} icon="S/" /></div>
    {loading && appointments.length === 0 ? <Loading /> : <>
      <section className="card table-card"><div className="section-heading"><div><span className="eyebrow">AGENDA COMPLETA</span><h2>Todas las citas</h2></div><button className="button button-quiet" onClick={refresh}>↻ Actualizar</button></div>
        {appointments.length === 0 ? <Empty text="Aún no hay citas registradas." /> : <div className="table-scroll"><table><thead><tr><th>Cita</th><th>Fecha y hora</th><th>Estado</th><th>Cliente</th><th>Celular</th><th>Equipo</th><th>Reparación</th><th>Precio</th></tr></thead><tbody>{appointments.map(a => <tr key={a.id}><td>#{a.id}</td><td>{showDate(a.scheduled_at)}</td><td><Status value={a.status} /></td><td>{a.customer_name}</td><td>{a.customer_phone}</td><td>{a.brand} {a.model}</td><td>{a.issue}</td><td>{a.quote_price == null ? 'Pendiente' : <>{`S/ ${Number(a.quote_price).toFixed(2)}`}{a.quote_is_simulated && <small className="sample-price-note">FICTICIO</small>}</>}</td></tr>)}</tbody></table></div>}
      </section>
      <section className="card admin-section"><div className="section-heading"><div><span className="eyebrow">CATÁLOGO DEL TALLER</span><h2>Precios por modelo y reparación</h2><p>Los importes ficticios de muestra están marcados y sirven solo para probar el sistema.</p></div></div>
        {prices.length > 0 ? <><label className="price-search">Buscar modelo o reparación<input value={priceSearch} onChange={e => setPriceSearch(e.target.value)} placeholder="Ej.: iPhone 13, falla de carga" /></label><div className="table-scroll compact-table"><table><thead><tr><th>Marca</th><th>Modelo</th><th>Reparación</th><th>Importe</th><th>Origen / fecha</th></tr></thead><tbody>{visiblePrices.map((p, i) => <tr key={`${p.brand}-${p.model}-${p.repair_code}-${i}`}><td>{p.brand}</td><td>{p.model}</td><td>{p.repair_name}</td><td><strong>S/ {Number(p.price).toFixed(2)}</strong></td><td>{p.verified_on === 'SIMULADO' ? <span className="sample-price-note">FICTICIO</span> : p.verified_on}</td></tr>)}</tbody></table>{visiblePrices.length === 0 && <Empty text="No hay precios que coincidan con la búsqueda." />}</div></> : <Empty text="Aún no hay precios específicos registrados." />}
        <form className="price-form" onSubmit={savePrice}><div className="form-grid four-col"><label className="check-label"><input type="checkbox" checked={newDevice} onChange={e => { setNewDevice(e.target.checked); if (e.target.checked) { setBrand(''); setModel(''); setPriceValue('') } }} /> Registrar un modelo nuevo</label>
          {newDevice ? <><label>Marca<input required maxLength="80" value={brand} onChange={e => setBrand(e.target.value)} placeholder="Samsung" /></label><label>Modelo exacto<input required maxLength="120" value={model} onChange={e => setModel(e.target.value)} placeholder="Galaxy S23 Ultra" /></label></> : <label>Teléfono<select value={priceDevice} onChange={e => setPriceDevice(e.target.value)}>{devices.map(d => <option key={`${d.brand}-${d.model}`} value={`${d.brand}|${d.model}`}>{d.brand} {d.model}</option>)}</select></label>}
          <label>Reparación<select required value={repairCode} onChange={e => setRepairCode(e.target.value)}>{services.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}</select></label><label>Precio registrado (S/)<input required type="number" min="0" max="99999999.99" step="0.01" value={priceValue} onChange={e => setPriceValue(e.target.value)} placeholder="0.00" /></label><button className="button button-primary form-submit">Guardar precio</button>
        </div></form>
      </section>
      <section className="card admin-section"><div className="section-heading"><div><span className="eyebrow">AGENDA DEL TALLER</span><h2>Bloquear horario</h2><p>Impide nuevas solicitudes en el intervalo; no cambia citas existentes.</p></div></div>
        <form className="block-form" onSubmit={createBlock}><label>Fecha<input required type="date" min={new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })} value={blockDate} onChange={e => setBlockDate(e.target.value)} /></label><label>Desde<input required type="time" value={blockStart} onChange={e => setBlockStart(e.target.value)} /></label><label>Hasta<input required type="time" value={blockEnd} onChange={e => setBlockEnd(e.target.value)} /></label><label>Motivo<input maxLength="240" value={blockReason} onChange={e => setBlockReason(e.target.value)} /></label><button className="button button-primary">Bloquear horario</button></form>
        <div className="block-list">{blocks.length === 0 ? <Empty text="No hay horarios bloqueados." /> : blocks.map(block => <div className="block-row" key={block.id}><div><strong>{showDate(block.starts_at)} – {new Date(block.ends_at).toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' })}</strong><small>{block.reason}</small></div><button className="button button-danger" onClick={() => removeBlock(block.id)}>Desbloquear</button></div>)}</div>
      </section>
    </>}
  </section>
}

export default AdminView

