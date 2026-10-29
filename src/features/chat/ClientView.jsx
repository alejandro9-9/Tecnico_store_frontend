import { useEffect, useRef, useState } from 'react'
import { api } from '../../services/api.js'
import PageHeading from '../../components/common/PageHeading.jsx'

function ClientView() {
  const [messages, setMessages] = useState([{ role: 'assistant', content: '¡Hola! Cuéntame qué le ocurre a tu celular. Si sabes la marca y el modelo, inclúyelos para consultar el precio registrado.' }])
  const [caseMessages, setCaseMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [quote, setQuote] = useState(null)
  const [chatStatus, setChatStatus] = useState('')
  const [device, setDevice] = useState(null)
  const [booking, setBooking] = useState(false)
  const [bookingDone, setBookingDone] = useState(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('09:00')
  const listRef = useRef(null)
  const lastAssistantMessage = [...messages].reverse().find(message => message.role === 'assistant')?.content || ''
  const showSuggestions = !quote && !booking && !busy && (messages.length === 1 ||
    (chatStatus === 'needs_details' && /síntoma|qué parte|qué le ocurre|describir|falla/i.test(lastAssistantMessage)))
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }) }, [messages, busy])

  async function send(event, suggestedText = null) {
    event?.preventDefault()
    const content = (suggestedText ?? draft).trim()
    if (!content || busy) return
    setDraft(''); setError(''); setBookingDone(null)
    const isAppointmentAsk = quote && /\b(cita|agendar|reservar|solicitar cita)\b/i.test(content)
    setMessages(current => [...current, { role: 'user', content }])
    if (isAppointmentAsk) {
      setBooking(true)
      setMessages(current => [...current, { role: 'assistant', content: 'Perfecto. Completa tus datos y el horario que prefieres para enviar la solicitud.' }])
      return
    }
    const inheritedDevice = quote && device ? device : null
    const nextMessages = quote ? [{ role: 'user', content }] : [...caseMessages, { role: 'user', content }]
    setCaseMessages(nextMessages)
    setQuote(null); setBooking(false)
    setBusy(true)
    try {
      const payload = { messages: nextMessages, ...(inheritedDevice || {}) }
      const result = await api('/api/chat', { method: 'POST', body: JSON.stringify(payload) })
      setMessages(current => [...current, { role: 'assistant', content: result.reply }])
      setChatStatus(result.status)
      setQuote(['estimate', 'manual_review'].includes(result.status) ? result : result.status === 'information' ? quote : null)
      if (result.brand && result.model) setDevice({ brand: result.brand, model: result.model })
    } catch (err) {
      setError(err.message)
      setMessages(current => [...current, { role: 'assistant', content: 'No pude consultar la cotización. Revisa que el backend esté iniciado e inténtalo otra vez.' }])
    } finally { setBusy(false) }
  }

  async function submitBooking(event) {
    event.preventDefault(); setError('')
    if (!quote || !date || !time) return setError('Completa la fecha y la hora para solicitar la cita.')
    const local = new Date(`${date}T${time}:00-05:00`)
    if (local <= new Date()) return setError('Elige una fecha y hora futuras.')
    setBusy(true)
    try {
      const appointment = await api('/api/appointments', { method: 'POST', body: JSON.stringify({
        quote_id: quote.quote_id, customer_name: name.trim(), customer_phone: phone.trim(),
        brand: quote.brand, model: quote.model, issue: quote.issue_name || quote.issue_code || 'Diagnóstico técnico',
        scheduled_at: local.toISOString(), notes: 'Solicitud enviada por el cliente; pendiente de confirmación del taller.',
      }) })
      const confirmation = `Registré tu solicitud de cita #${appointment.id} para el ${new Date(appointment.scheduled_at).toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'short' })}. Quedará pendiente hasta que el técnico confirme el horario.`
      setBookingDone(confirmation); setMessages(current => [...current, { role: 'assistant', content: confirmation }]); setBooking(false)
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  return <div className="client-layout">
    <section className="chat-panel card">
      <div className="chat-header"><PageHeading eyebrow="COTIZACIÓN EN LÍNEA" title="Cuéntanos qué le pasa" description="Te orientamos con el precio registrado para tu modelo." icon="✳" />
        <button className="button button-quiet" disabled={busy} onClick={() => { setMessages([{ role: 'assistant', content: '¡Hola! Cuéntame qué le ocurre a tu celular. Si sabes la marca y el modelo, inclúyelos para consultar el precio registrado.' }]); setCaseMessages([]); setQuote(null); setChatStatus(''); setDevice(null); setBooking(false); setBookingDone(null); setName(''); setPhone(''); setDate(''); setTime('09:00'); setError('') }}>Nueva consulta</button>
      </div>
      <div className="message-list" ref={listRef}>
        {messages.map((message, index) => <div key={index} className={`message-row ${message.role}`}>
          <span className={`avatar ${message.role}`}>{message.role === 'assistant' ? 'T' : 'Tú'}</span>
          <div className="message-bubble"><p>{message.content}</p></div>
        </div>)}
        {busy && <div className="message-row assistant" aria-label="TecFast está respondiendo"><span className="avatar assistant">T</span><div className="message-bubble typing"><i/><i/><i/></div></div>}
      </div>
      {showSuggestions && <div className="chat-suggestions" aria-label="Opciones de falla">
        <span>O puedes elegir:</span>{['Pantalla rota', 'No carga', 'Batería', 'Cámara', 'No enciende', 'Se mojó'].map(option => <button key={option} type="button" onClick={() => send(null, option)}>{option}</button>)}
      </div>}
      {quote && !booking && <div className="quote-actions"><div className="quote-summary"><span className="quote-check">✓</span><div><strong>{quote.status === 'estimate' ? 'Cotización orientativa lista' : 'Revisión técnica requerida'}</strong><small>{quote.brand || 'Equipo por identificar'} {quote.model || ''} · {quote.issue_name || 'Reparación'}</small>{quote.is_simulated && <em className="sample-price-note">PRECIO FICTICIO · SOLO PARA PRUEBAS</em>}</div>{quote.min_price != null && <b>S/ {Number(quote.min_price).toFixed(2)}</b>}</div><button className="button button-primary" onClick={() => setBooking(true)}>Solicitar una cita <span>→</span></button></div>}
      {booking && <form className="booking-form" onSubmit={submitBooking}>
        <div className="booking-title"><div><span className="eyebrow">SIGUIENTE PASO</span><h2>Solicitar una cita</h2><p>El taller confirmará la disponibilidad del horario.</p></div><button type="button" className="icon-button" aria-label="Cerrar" onClick={() => setBooking(false)}>×</button></div>
        <div className="form-grid"><label>Nombre<input required minLength="2" maxLength="120" value={name} onChange={e => setName(e.target.value)} placeholder="Tu nombre" /></label><label>Celular<input required minLength="7" maxLength="30" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Tu número de celular" /></label><label>Fecha preferida<input required type="date" min={new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })} value={date} onChange={e => setDate(e.target.value)} /></label><label>Hora preferida<input required type="time" value={time} onChange={e => setTime(e.target.value)} /></label></div>
        <button disabled={busy} className="button button-primary" type="submit">{busy ? 'Enviando…' : 'Enviar solicitud'}</button>
      </form>}
      {bookingDone && <div className="success-banner">✓ {bookingDone}</div>}
      {error && <div className="error-banner">{error}</div>}
      <form className="composer" onSubmit={send}><input value={draft} onChange={e => setDraft(e.target.value)} disabled={busy || booking} maxLength="2000" placeholder={booking ? 'Completa el formulario para continuar…' : 'Escribe qué le sucede a tu celular…'} /><button type="submit" aria-label="Enviar" disabled={!draft.trim() || busy || booking}>↑</button></form>
      <p className="privacy-note">No envíes contraseñas, códigos de desbloqueo ni información privada.</p>
    </section>
    <aside className="side-panel">
      <div className="side-card card"><span className="eyebrow">ASÍ FUNCIONA</span><h2>Una solución clara, paso a paso.</h2>
        <ol className="steps"><li><span>01</span><div><strong>Describe la falla</strong><small>Cuéntanos el síntoma con tus palabras.</small></div></li><li><span>02</span><div><strong>Revisamos el precio</strong><small>Usamos importes específicos registrados para el modelo.</small></div></li><li><span>03</span><div><strong>Solicita una cita</strong><small>El técnico confirma la disponibilidad.</small></div></li></ol>
      </div>
      <div className="side-note"><span>i</span><p>La cotización es orientativa. El costo final se confirma después de la revisión técnica.</p></div>
    </aside>
  </div>
}

export default ClientView

