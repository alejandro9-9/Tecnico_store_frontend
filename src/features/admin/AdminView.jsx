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

const PRICE_PAGE_SIZE_OPTIONS = [10, 25, 50]

function EyeIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.6" /></svg>
}

function PencilIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m4 16.5-.8 3.8 3.8-.8L18.7 7.8a2.1 2.1 0 0 0 0-3L19.2 5a2.1 2.1 0 0 0-3 0L4 16.5Z" /><path d="m14.7 6.5 2.8 2.8" /></svg>
}

function SearchIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="10.8" cy="10.8" r="6.3" /><path d="m16 16 4.5 4.5" /></svg>
}

function CloseIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m6 6 12 12M18 6 6 18" /></svg>
}

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
  const [pricePage, setPricePage] = useState(1)
  const [pricePageSize, setPricePageSize] = useState(10)
  const [viewingPrice, setViewingPrice] = useState(null)
  const [editingPrice, setEditingPrice] = useState(null)
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
  const totalPricePages = Math.max(1, Math.ceil(visiblePrices.length / pricePageSize))
  const paginatedPrices = useMemo(() => visiblePrices.slice((pricePage - 1) * pricePageSize, pricePage * pricePageSize), [visiblePrices, pricePage, pricePageSize])
  useEffect(() => { setPricePage(1) }, [priceSearch, pricePageSize])
  useEffect(() => { setPricePage(current => Math.min(current, totalPricePages)) }, [totalPricePages])
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
      setNotice(`${editingPrice ? 'Precio actualizado' : 'Precio guardado'} para ${brand} ${model}.`); setNewDevice(false); setEditingPrice(null); await refresh()
    } catch (err) { setError(err.message) }
  }
  function editPrice(price) {
    setEditingPrice(price); setViewingPrice(null); setNewDevice(false)
    setPriceDevice(`${price.brand}|${price.model}`); setBrand(price.brand); setModel(price.model)
    setRepairCode(price.repair_code); setPriceValue(String(price.price))
  }
  function cancelEdit() {
    setEditingPrice(null); setNewDevice(false)
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
    <div className="metric-grid"><Metric label="Citas registradas" value={appointments.length} icon="▤" /><Metric label="Pendientes de confirmación" value={appointments.filter(a => a.status === 'requested').length} icon="◷" /><Metric label="Precios referenciales" value={prices.length} icon="S/" /></div>
    {loading && appointments.length === 0 ? <Loading /> : <>
      <section className="card table-card"><div className="section-heading"><div><span className="eyebrow">AGENDA COMPLETA</span><h2>Todas las citas</h2></div><button className="button button-quiet" onClick={refresh}>↻ Actualizar</button></div>
        {appointments.length === 0 ? <Empty text="Aún no hay citas registradas." /> : <div className="table-scroll"><table><thead><tr><th>Cita</th><th>Fecha y hora</th><th>Estado</th><th>Cliente</th><th>Celular</th><th>Equipo</th><th>Reparación</th><th>Precio</th></tr></thead><tbody>{appointments.map(a => <tr key={a.id}><td>#{a.id}</td><td>{showDate(a.scheduled_at)}</td><td><Status value={a.status} /></td><td>{a.customer_name}</td><td>{a.customer_phone}</td><td>{a.brand} {a.model}</td><td>{a.issue}</td><td>{a.quote_price == null ? 'Pendiente' : <>{`S/ ${Number(a.quote_price).toFixed(2)}`}{a.quote_is_simulated && <small className="sample-price-note">FICTICIO</small>}</>}</td></tr>)}</tbody></table></div>}
      </section>
      <section className="card admin-section"><div className="section-heading"><div><span className="eyebrow">CATÁLOGO DEL TALLER</span><h2>Precios por modelo y reparación</h2><p>Los precios referenciales orientan al cliente; el técnico confirma el costo final.</p></div></div>
        {prices.length > 0 ? <>
          <div className="price-toolbar"><label className="price-search">Buscar modelo o reparación<span className="search-input-wrap"><SearchIcon /><input aria-label="Buscar modelo o reparación" value={priceSearch} onChange={e => setPriceSearch(e.target.value)} placeholder="Ej.: iPhone 13, falla de carga" /></span></label><label className="page-size-select">Mostrar<select value={pricePageSize} onChange={e => setPricePageSize(Number(e.target.value))}>{PRICE_PAGE_SIZE_OPTIONS.map(size => <option key={size} value={size}>{size} registros</option>)}</select></label></div>
          <div className="table-scroll compact-table"><table><thead><tr><th>Marca</th><th>Modelo</th><th>Reparación</th><th>Precio referencial</th><th>Origen / fecha</th><th className="actions-heading">Acciones</th></tr></thead><tbody>{paginatedPrices.map(p => <tr key={`${p.brand}-${p.model}-${p.repair_code}`}><td>{p.brand}</td><td>{p.model}</td><td>{p.repair_name}</td><td><strong>S/ {Number(p.price).toFixed(2)}</strong></td><td>{p.verified_on === 'SIMULADO' ? <span className="sample-price-note">FICTICIO</span> : p.verified_on}</td><td><div className="row-actions"><button type="button" className="icon-button" title="Ver precio" aria-label={`Ver precio de ${p.brand} ${p.model}`} onClick={() => setViewingPrice(p)}><EyeIcon /></button><button type="button" className="icon-button" title="Editar precio" aria-label={`Editar precio de ${p.brand} ${p.model}`} onClick={() => editPrice(p)}><PencilIcon /></button></div></td></tr>)}</tbody></table>{visiblePrices.length === 0 && <Empty text="No hay precios que coincidan con la búsqueda." />}</div>
          {visiblePrices.length > 0 && <div className="pagination" aria-label="Paginación de precios"><button type="button" className="button button-quiet" disabled={pricePage === 1} onClick={() => setPricePage(page => Math.max(1, page - 1))}>← Anterior</button><span>Página <strong>{pricePage}</strong> de {totalPricePages}</span><button type="button" className="button button-quiet" disabled={pricePage === totalPricePages} onClick={() => setPricePage(page => Math.min(totalPricePages, page + 1))}>Siguiente →</button></div>}
        </> : <Empty text="Aún no hay precios referenciales registrados." />}
        <form id="price-editor" className="price-form" onSubmit={savePrice}><div className="price-form-heading"><div><span className="eyebrow">GESTIÓN DE PRECIOS</span><h3>Registrar precio referencial</h3></div></div><div className="form-grid four-col"><label className="check-label"><input type="checkbox" checked={newDevice} onChange={e => { setNewDevice(e.target.checked); if (e.target.checked) { setBrand(''); setModel(''); setPriceValue('') } }} /> Registrar un modelo nuevo</label>
          {newDevice ? <><label>Marca<input required maxLength="80" value={brand} onChange={e => setBrand(e.target.value)} placeholder="Samsung" /></label><label>Modelo exacto<input required maxLength="120" value={model} onChange={e => setModel(e.target.value)} placeholder="Galaxy S23 Ultra" /></label></> : <label>Teléfono<select value={priceDevice} onChange={e => setPriceDevice(e.target.value)}>{devices.map(d => <option key={`${d.brand}-${d.model}`} value={`${d.brand}|${d.model}`}>{d.brand} {d.model}</option>)}</select></label>}
          <label>Reparación<select required value={repairCode} onChange={e => setRepairCode(e.target.value)}>{services.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}</select></label><label>Precio referencial (S/)<input required type="number" min="0" max="99999999.99" step="0.01" value={priceValue} onChange={e => setPriceValue(e.target.value)} placeholder="0.00" /></label><button className="button button-primary form-submit">Guardar precio</button>
        </div></form>
      </section>
      <section className="card admin-section"><div className="section-heading"><div><span className="eyebrow">AGENDA DEL TALLER</span><h2>Bloquear horario</h2><p>Impide nuevas solicitudes en el intervalo; no cambia citas existentes.</p></div></div>
        <form className="block-form" onSubmit={createBlock}><label>Fecha<input required type="date" min={new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })} value={blockDate} onChange={e => setBlockDate(e.target.value)} /></label><label>Desde<input required type="time" value={blockStart} onChange={e => setBlockStart(e.target.value)} /></label><label>Hasta<input required type="time" value={blockEnd} onChange={e => setBlockEnd(e.target.value)} /></label><label>Motivo<input maxLength="240" value={blockReason} onChange={e => setBlockReason(e.target.value)} /></label><button className="button button-primary">Bloquear horario</button></form>
        <div className="block-list">{blocks.length === 0 ? <Empty text="No hay horarios bloqueados." /> : blocks.map(block => <div className="block-row" key={block.id}><div><strong>{showDate(block.starts_at)} – {new Date(block.ends_at).toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' })}</strong><small>{block.reason}</small></div><button className="button button-danger" onClick={() => removeBlock(block.id)}>Desbloquear</button></div>)}</div>
      </section>
    </>}
    {viewingPrice && <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setViewingPrice(null) }}><div className="price-modal" role="dialog" aria-modal="true" aria-labelledby="price-detail-title"><div className="price-modal-heading"><div><span className="eyebrow">DETALLE DEL PRECIO</span><h2 id="price-detail-title">{viewingPrice.brand} {viewingPrice.model}</h2></div><button type="button" className="icon-button" title="Cerrar detalle" aria-label="Cerrar detalle" onClick={() => setViewingPrice(null)}><CloseIcon /></button></div><dl className="price-detail-list"><div><dt>Reparación</dt><dd>{viewingPrice.repair_name}</dd></div><div><dt>Precio referencial</dt><dd className="price-detail-amount">S/ {Number(viewingPrice.price).toFixed(2)}</dd></div><div><dt>Origen / fecha</dt><dd>{viewingPrice.verified_on === 'SIMULADO' ? 'Precio de prueba' : viewingPrice.verified_on}</dd></div><div><dt>Moneda</dt><dd>{viewingPrice.currency || 'PEN'}</dd></div></dl><div className="price-modal-actions"><button type="button" className="button button-quiet" onClick={() => setViewingPrice(null)}>Cerrar</button><button type="button" className="button button-primary" onClick={() => editPrice(viewingPrice)}><PencilIcon /> Editar precio</button></div></div></div>}
    {editingPrice && <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) cancelEdit() }}><div className="price-modal price-editor-modal" role="dialog" aria-modal="true" aria-labelledby="price-edit-title"><div className="price-modal-heading"><div><span className="eyebrow">EDITAR REGISTRO</span><h2 id="price-edit-title">Editar precio referencial</h2><p className="modal-subtitle">{editingPrice.brand} {editingPrice.model}</p></div><button type="button" className="icon-button" title="Cerrar editor" aria-label="Cerrar editor" onClick={cancelEdit}><CloseIcon /></button></div><form className="modal-form" onSubmit={savePrice}><div className="modal-form-grid"><label>Marca<input value={brand} readOnly /></label><label>Modelo<input value={model} readOnly /></label><label>Reparación<input value={editingPrice.repair_name} readOnly /></label><label>Precio referencial (S/)<input required type="number" min="0" max="99999999.99" step="0.01" value={priceValue} onChange={e => setPriceValue(e.target.value)} /></label></div><div className="price-modal-actions"><button type="button" className="button button-quiet" onClick={cancelEdit}>Cancelar</button><button className="button button-primary"><PencilIcon /> Guardar cambios</button></div></form></div></div>}
  </section>
}

export default AdminView

