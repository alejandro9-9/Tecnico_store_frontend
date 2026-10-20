from __future__ import annotations

import os
import re
import unicodedata
from datetime import date, datetime, time, timedelta, timezone

import requests
import streamlit as st


BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000").rstrip("/")
if not BACKEND_URL.startswith(("http://", "https://")):
    BACKEND_URL = f"https://{BACKEND_URL}"
DISCLAIMER = (
    "Solo mostramos importes publicados y registrados para ese modelo y reparación. "
    "La cotización final requiere diagnóstico y confirmación del técnico."
)
LIMA_TZ = timezone(timedelta(hours=-5))


def is_explicit_repair_followup(text: str) -> bool:
    normalized = unicodedata.normalize("NFKD", text.lower())
    normalized = "".join(char for char in normalized if not unicodedata.combining(char)).strip()
    return normalized.startswith(("y ", "y para", "tambien", "ademas", "ahora tambien", "tambien para")) or any(
        phrase in normalized for phrase in (
            "cambiar pantalla", "cambio de pantalla", "reparar pantalla", "cambiar bateria",
            "cambio de bateria", "cambiar puerto", "reparar carga", "arreglar camara",
            "cambiar camara", "reparar camara", "arreglar altavoz", "cambiar tapa trasera",
        )
    )


def normalize_text(text: str) -> str:
    value = unicodedata.normalize("NFKD", text.lower())
    value = "".join(char for char in value if not unicodedata.combining(char))
    return re.sub(r"[^a-z0-9:/.-]+", " ", value).strip().strip(".!?,;:")


def is_booking_confirmation(text: str) -> bool:
    value = normalize_text(text)
    if value in {
        "si", "si por favor", "claro", "claro que si", "ok", "okay", "de acuerdo",
        "acepto", "adelante", "dale", "si deseo", "si quiero",
    } or is_booking_request(value):
        return True
    for prefix in ("si ", "claro ", "ok ", "de acuerdo "):
        if value.startswith(prefix) and is_booking_request(value[len(prefix):]):
            return True
    return False


def is_booking_request(text: str) -> bool:
    value = normalize_text(text)
    phrases = (
        "quiero una cita", "quiero cita", "quiero agendar", "quiero reservar",
        "solicitar una cita", "solicito una cita", "agendar una cita", "reservar una cita",
        "me gustaria agendar", "me gustaria reservar", "quisiera agendar", "quisiera una cita",
        "necesito una cita", "sacar una cita", "programar una cita",
    )
    return any(value == phrase or value.startswith(f"{phrase} ") for phrase in phrases)


def is_booking_decline(text: str) -> bool:
    value = normalize_text(text)
    return value in {
        "no", "no gracias", "no por ahora", "ahora no", "mejor no", "no deseo",
        "no quiero cita", "no quiero agendar", "no puedo", "no puedo asistir", "no me interesa",
        "no gracias por ahora", "cancelar cita",
    }


def parse_requested_slot(text: str) -> tuple[date | None, time | None]:
    """Extract an unambiguous-enough date/time hint; the form lets the customer verify it."""
    value = normalize_text(text)
    now = datetime.now(LIMA_TZ)
    wanted_date: date | None = None
    wanted_time: time | None = None

    if "pasado manana" in value:
        wanted_date = now.date() + timedelta(days=2)
    elif "manana" in value:
        wanted_date = now.date() + timedelta(days=1)
    elif "hoy" in value:
        wanted_date = now.date()

    weekdays = {
        "lunes": 0, "martes": 1, "miercoles": 2, "jueves": 3,
        "viernes": 4, "sabado": 5, "domingo": 6,
    }
    if wanted_date is None:
        for weekday, target in weekdays.items():
            if re.search(rf"\b{weekday}\b", value):
                days_ahead = (target - now.weekday()) % 7 or 7
                wanted_date = now.date() + timedelta(days=days_ahead)
                break

    date_match = re.search(r"\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b", value)
    if date_match:
        day, month = int(date_match.group(1)), int(date_match.group(2))
        year = int(date_match.group(3)) if date_match.group(3) else now.year
        if year < 100:
            year += 2000
        try:
            candidate = date(year, month, day)
            if date_match.group(3) is None and candidate < now.date():
                candidate = date(year + 1, month, day)
            wanted_date = candidate
        except ValueError:
            pass

    months = {
        "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6,
        "julio": 7, "agosto": 8, "septiembre": 9, "setiembre": 9,
        "octubre": 10, "noviembre": 11, "diciembre": 12,
    }
    if wanted_date is None:
        for month_name, month_number in months.items():
            match = re.search(rf"\b(\d{{1,2}})\s+de\s+{month_name}\b", value)
            if match:
                day = int(match.group(1))
                year = now.year
                try:
                    candidate = date(year, month_number, day)
                    if candidate < now.date():
                        candidate = date(year + 1, month_number, day)
                    wanted_date = candidate
                except ValueError:
                    pass
                break

    time_match = re.search(
        r"\b(?:a\s+las?\s+|para\s+las?\s+|tipo\s+)?(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.?\s*m\.?|p\.?\s*m\.?)?\b",
        value,
    )
    has_time_signal = bool(
        re.search(r"\b(?:a\s+las?|para\s+las?|tipo)\s+\d{1,2}\b", value)
        or re.search(r"\b\d{1,2}[:.]\d{2}\b", value)
        or re.search(r"\b\d{1,2}\s*(?:am|pm|a\.?\s*m\.?|p\.?\s*m\.?)\b", value)
        or re.search(r"\bde la (?:manana|tarde|noche)\b", value)
    )
    if time_match and has_time_signal:
        hour, minute = int(time_match.group(1)), int(time_match.group(2) or 0)
        meridiem = re.sub(r"[ .]", "", time_match.group(3) or "")
        if meridiem in {"pm", "am"} and 1 <= hour <= 12:
            hour = (hour % 12) + (12 if meridiem == "pm" else 0)
        elif not meridiem and "de la manana" in value and 1 <= hour <= 12:
            hour %= 12
        elif not meridiem and ("de la tarde" in value or "de la noche" in value) and 1 <= hour <= 11:
            hour += 12
        elif not meridiem and 1 <= hour <= 12:
            # A bare “a las 3” is ambiguous; leave the time for the customer to choose.
            return wanted_date, None
        if 0 <= hour <= 23 and 0 <= minute <= 59:
            wanted_time = time(hour, minute)
    return wanted_date, wanted_time


def is_valid_phone(text: str) -> bool:
    digits = re.sub(r"\D", "", text)
    return 9 <= len(digits) <= 15


def is_valid_name(text: str) -> bool:
    value = text.strip()
    return (
        2 <= len(value) <= 80
        and any(character.isalpha() for character in value)
        and not re.search(r"\d{7,}", value)
    )

st.set_page_config(page_title="EVOL | Cotiza tu reparación", page_icon="📱", layout="centered")
title_col, action_col = st.columns([5, 2])
with title_col:
    st.title("📱 Cotiza la reparación de tu celular")
    st.caption("Cuéntanos con tus palabras qué le ocurre a tu equipo.")
with action_col:
    if st.button("Nueva conversación", use_container_width=True):
        st.session_state.messages = []
        st.session_state.case_messages = []
        st.session_state.case_closed = False
        st.session_state.last_quote = None
        st.session_state.device_context = None
        st.session_state.awaiting_booking_confirmation = False
        st.session_state.booking_step = None
        st.session_state.booking_form_ready = False
        st.session_state.booking_context = None
        st.session_state.booking_name = ""
        st.session_state.booking_phone = ""
        st.session_state.requested_appointment_date = None
        st.session_state.requested_appointment_time = None
        st.rerun()

if "messages" not in st.session_state:
    st.session_state.messages = []
if "last_quote" not in st.session_state:
    st.session_state.last_quote = None
if "case_messages" not in st.session_state:
    st.session_state.case_messages = []
if "case_closed" not in st.session_state:
    st.session_state.case_closed = bool(
        st.session_state.last_quote
        and st.session_state.last_quote.get("status") in {"estimate", "manual_review"}
    )
if "device_context" not in st.session_state:
    previous_quote = st.session_state.last_quote or {}
    st.session_state.device_context = {
        "brand": previous_quote.get("brand"),
        "model": previous_quote.get("model"),
    }
if "awaiting_booking_confirmation" not in st.session_state:
    st.session_state.awaiting_booking_confirmation = False
if "booking_step" not in st.session_state:
    st.session_state.booking_step = None
if "booking_form_ready" not in st.session_state:
    st.session_state.booking_form_ready = False
if "booking_context" not in st.session_state:
    st.session_state.booking_context = None

for message in st.session_state.messages:
    with st.chat_message(message["role"]):
        st.markdown(message["content"])

if not st.session_state.messages:
    with st.chat_message("assistant"):
        st.markdown("¡Hola! Describe el problema y, si puedes, incluye la marca y el modelo. Por ejemplo: *Mi Samsung Galaxy A54 se cayó y se rompió la pantalla.* También puedes contarme si falla la batería, cámara, carga, audio, botones, señal o Wi-Fi.")

prompt = st.chat_input(
    "Escribe qué le sucede a tu celular…",
    max_chars=2000,
    disabled=st.session_state.booking_form_ready,
)
if prompt:
    st.session_state.messages.append({"role": "user", "content": prompt})
    with st.chat_message("user"):
        st.markdown(prompt)

    answer = None
    should_call_api = True

    if st.session_state.booking_step == "name":
        if not is_valid_name(prompt):
            answer = "Escribe tu nombre, sin incluir el número de celular, para continuar con la cita."
        else:
            st.session_state.booking_name = prompt.strip()[:120]
            st.session_state.booking_step = "phone"
            answer = f"Gracias, {st.session_state.booking_name}. Ahora indícame tu número de celular, incluyendo el código de país si corresponde."
        should_call_api = False
    elif st.session_state.booking_step == "phone":
        if not is_valid_phone(prompt):
            answer = "El número parece incompleto. Escríbeme tu celular con al menos 9 dígitos."
        else:
            st.session_state.booking_phone = prompt.strip()[:30]
            st.session_state.booking_step = None
            st.session_state.booking_form_ready = True
            answer = "Listo. Elige la fecha y hora que prefieres en el formulario para enviar la solicitud de cita."
        should_call_api = False
    elif st.session_state.awaiting_booking_confirmation and is_booking_decline(prompt):
        st.session_state.awaiting_booking_confirmation = False
        st.session_state.requested_appointment_date = None
        st.session_state.requested_appointment_time = None
        answer = "De acuerdo, no enviaré una solicitud de cita. Si luego deseas agendarla, dímelo."
        should_call_api = False
    elif st.session_state.awaiting_booking_confirmation and (
        is_booking_confirmation(prompt) or any(parse_requested_slot(prompt))
    ):
        preferred_date, preferred_time = parse_requested_slot(prompt)
        if preferred_date:
            st.session_state.requested_appointment_date = preferred_date
        if preferred_time:
            st.session_state.requested_appointment_time = preferred_time
        st.session_state.awaiting_booking_confirmation = False
        st.session_state.booking_step = "name"
        answer = "Claro. Para comenzar la solicitud, ¿cuál es tu nombre?"
        should_call_api = False
    elif is_booking_request(prompt) and st.session_state.booking_context:
        preferred_date, preferred_time = parse_requested_slot(prompt)
        if preferred_date:
            st.session_state.requested_appointment_date = preferred_date
        if preferred_time:
            st.session_state.requested_appointment_time = preferred_time
        st.session_state.awaiting_booking_confirmation = False
        st.session_state.booking_step = "name"
        answer = "Claro. Para comenzar la solicitud, ¿cuál es tu nombre?"
        should_call_api = False
    else:
        st.session_state.awaiting_booking_confirmation = False

    if should_call_api:
        inherited_device = None
        if st.session_state.case_closed:
            previous_device = st.session_state.device_context or {}
            if (
                is_explicit_repair_followup(prompt)
                and previous_device.get("brand")
                and previous_device.get("model")
            ):
                inherited_device = previous_device
            if not is_booking_request(prompt):
                st.session_state.booking_context = None
            st.session_state.case_messages = []
            st.session_state.case_closed = False

        st.session_state.case_messages.append({"role": "user", "content": prompt})
        with st.spinner("Revisando los datos y el catálogo…"):
            try:
                payload = {"messages": st.session_state.case_messages}
                if inherited_device:
                    payload.update(inherited_device)
                response = requests.post(
                    f"{BACKEND_URL}/api/chat",
                    json=payload,
                    timeout=45,
                )
                response.raise_for_status()
                result = response.json()
                answer = result["reply"]
                st.session_state.last_quote = result
                st.session_state.case_closed = result["status"] in {"estimate", "manual_review"}
                st.session_state.awaiting_booking_confirmation = st.session_state.case_closed
                if result.get("brand") and result.get("model"):
                    st.session_state.device_context = {
                        "brand": result["brand"],
                        "model": result["model"],
                    }
                if st.session_state.case_closed:
                    st.session_state.booking_context = {
                        "quote_id": result["quote_id"],
                        "brand": result.get("brand") or "",
                        "model": result.get("model") or "",
                        "issue": result.get("issue_name") or result.get("issue_code") or "Diagnóstico técnico",
                    }
            except requests.RequestException as exc:
                detail = "No fue posible conectar con el backend."
                if getattr(exc, "response", None) is not None:
                    try:
                        detail = exc.response.json().get("detail", detail)
                    except ValueError:
                        pass
                answer = f"{detail} Verifica que la API esté activa y que BACKEND_URL apunte al servicio correcto."
                st.session_state.last_quote = None

    with st.chat_message("assistant"):
        st.markdown(answer)
        if should_call_api and st.session_state.last_quote and st.session_state.last_quote["status"] in {"estimate", "manual_review"}:
            st.caption(DISCLAIMER)
    st.session_state.messages.append({"role": "assistant", "content": answer})

if st.session_state.last_quote:
    result = st.session_state.last_quote
    with st.expander("Detalle de la solicitud", expanded=False):
        st.write(f"**Estado:** {result['status']}")
        st.write(f"**Equipo:** {result.get('brand') or 'Por identificar'} {result.get('model') or ''}".strip())
        if result.get("issue_name"):
            st.write(f"**Falla probable:** {result['issue_name']}")
        st.write(f"**Código de cotización:** {result['quote_id']}")

if st.session_state.booking_form_ready:
    st.divider()
    st.subheader("Solicitar cita de reparación")
    st.caption("Revisa el horario preferido. La cita quedará pendiente hasta que el técnico confirme su disponibilidad.")
    booking_context = st.session_state.booking_context or {}
    device_label = f"{booking_context.get('brand', '')} {booking_context.get('model', '')}".strip() or "Equipo por revisar"
    issue_label = booking_context.get("issue") or "Diagnóstico técnico"
    quote_label = f" · Cotización #{booking_context['quote_id']}" if booking_context.get("quote_id") else ""
    st.info(f"Solicitud: **{device_label}** · Reparación o diagnóstico: **{issue_label}**{quote_label}")
    now_lima = datetime.now(LIMA_TZ)
    default_slot = (now_lima + timedelta(hours=1)).replace(minute=0, second=0, microsecond=0)
    preferred_date = st.session_state.get("requested_appointment_date")
    preferred_time = st.session_state.get("requested_appointment_time")
    if not isinstance(preferred_date, date) or preferred_date < now_lima.date():
        preferred_date = default_slot.date()
    if not isinstance(preferred_time, time):
        preferred_time = default_slot.time()
    with st.form("customer_appointment_form"):
        date_col, time_col = st.columns(2)
        appointment_date = date_col.date_input(
            "Fecha preferida",
            value=preferred_date,
            min_value=now_lima.date(),
        )
        appointment_time = time_col.time_input("Hora preferida", value=preferred_time)
        submit_appointment = st.form_submit_button("Enviar solicitud de cita", type="primary")

    if submit_appointment:
        scheduled_at = datetime.combine(appointment_date, appointment_time, tzinfo=LIMA_TZ)
        if scheduled_at <= datetime.now(LIMA_TZ):
            st.error("Elige una fecha y hora futuras.")
        else:
            context = st.session_state.booking_context or {}
            appointment_payload = {
                **context,
                "customer_name": st.session_state.get("booking_name", ""),
                "customer_phone": st.session_state.get("booking_phone", ""),
                "scheduled_at": scheduled_at.isoformat(),
                "notes": "Solicitud enviada por el cliente; pendiente de confirmación del taller.",
            }
            try:
                saved = requests.post(
                    f"{BACKEND_URL}/api/appointments",
                    json=appointment_payload,
                    timeout=15,
                )
                saved.raise_for_status()
                appointment = saved.json()
                quote_reference = (
                    f", vinculada a la cotización **#{appointment['quote_id']}**"
                    if appointment.get("quote_id") else ""
                )
                confirmation = (
                    f"Registré tu solicitud de cita **#{appointment['id']}**{quote_reference} para "
                    f"el {scheduled_at.strftime('%d/%m/%Y a las %H:%M')}. "
                    "Quedará pendiente hasta que el taller confirme el horario."
                )
                st.session_state.messages.append({"role": "assistant", "content": confirmation})
                st.session_state.booking_form_ready = False
                st.session_state.awaiting_booking_confirmation = False
                st.session_state.booking_context = None
                st.session_state.requested_appointment_date = None
                st.session_state.requested_appointment_time = None
                st.rerun()
            except requests.RequestException as exc:
                detail = "No se pudo guardar la solicitud. Inténtalo nuevamente."
                if getattr(exc, "response", None) is not None:
                    try:
                        detail = exc.response.json().get("detail", detail)
                    except ValueError:
                        pass
                st.error(detail)
