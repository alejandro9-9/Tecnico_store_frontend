from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

import pandas as pd
import requests
import streamlit as st


BACKEND_URL = (os.getenv("BACKEND_URL") or "http://localhost:8000").strip().rstrip("/")
if not BACKEND_URL.startswith(("http://", "https://")):
    BACKEND_URL = f"https://{BACKEND_URL}"
BACKEND_REQUEST_TIMEOUT = 120
LIMA_TZ = timezone(timedelta(hours=-5))
STATUS_LABELS = {
    "requested": "Pendiente de disponibilidad",
    "confirmed": "Disponibilidad confirmada",
    "cancelled": "Horario no disponible",
    "scheduled": "Programada",
    "arrived": "Cliente en el taller",
    "diagnosing": "En diagnóstico",
    "awaiting_approval": "Esperando aprobación",
    "waiting_parts": "Esperando repuesto",
    "in_repair": "En reparación",
    "ready_for_pickup": "Lista para recojo",
    "completed": "Entregada",
}

st.set_page_config(page_title="EVOL | Técnico", page_icon="🔧", layout="wide")
st.title("🔧 Disponibilidad del técnico")
st.caption("Revisa las solicitudes y confirma si puedes atender al cliente en la fecha y hora elegidas.")


def local_datetime(value: str) -> datetime:
    scheduled = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if scheduled.tzinfo is None:
        scheduled = scheduled.replace(tzinfo=LIMA_TZ)
    return scheduled.astimezone(LIMA_TZ)


def api_error(response: requests.Response) -> str:
    try:
        return str(response.json().get("detail", "No se pudo guardar la decisión."))
    except (ValueError, AttributeError):
        return "No se pudo guardar la decisión."


if "staff_token" not in st.session_state:
    st.session_state.staff_token = ""

if not st.session_state.staff_token:
    st.subheader("Acceso del técnico")
    with st.form("staff_login"):
        token = st.text_input("Clave de acceso del técnico", type="password")
        login = st.form_submit_button("Ingresar", type="primary")
    if login:
        try:
            response = requests.get(
                f"{BACKEND_URL}/api/staff/appointments",
                headers={"X-Staff-Token": token},
                timeout=BACKEND_REQUEST_TIMEOUT,
            )
            if response.status_code == 401:
                st.error("La clave no es válida.")
            else:
                response.raise_for_status()
                st.session_state.staff_token = token
                st.rerun()
        except requests.RequestException:
            st.error("No se pudo conectar con el servicio. Comprueba que esté activo.")
    st.info("Clave de acceso local: `tec`. En Render configura `STAFF_TOKEN` con una clave propia.")
    st.stop()

if st.button("Cerrar sesión", key="staff_logout"):
    st.session_state.staff_token = ""
    st.rerun()


@st.fragment(run_every="5s")
def availability_queue() -> None:
    try:
        response = requests.get(
            f"{BACKEND_URL}/api/staff/appointments",
            headers={"X-Staff-Token": st.session_state.staff_token},
            timeout=BACKEND_REQUEST_TIMEOUT,
        )
        if response.status_code == 401:
            st.session_state.staff_token = ""
            st.error("La sesión del técnico expiró o la clave cambió. Ingresa nuevamente.")
            st.rerun()
        response.raise_for_status()
        appointments = response.json()
    except requests.RequestException:
        st.error("No se pudo actualizar la lista de solicitudes. Comprueba la conexión.")
        appointments = []

    pending = [item for item in appointments if item["status"] == "requested"]
    confirmed = [item for item in appointments if item["status"] == "confirmed"]
    metric1, metric2, metric3 = st.columns(3)
    metric1.metric("Pendientes de decisión", len(pending))
    metric2.metric("Disponibilidad confirmada", len(confirmed))
    metric3.metric("Total de solicitudes", len(appointments))

    st.subheader("Solicitudes de cita")
    if not appointments:
        st.info("Aún no hay solicitudes de cita.")
        return

    rows = []
    for item in appointments:
        rows.append({
            "Cita": item["id"],
            "Fecha y hora": local_datetime(item["scheduled_at"]).strftime("%d/%m/%Y %H:%M"),
            "Disponibilidad": STATUS_LABELS.get(item["status"], item["status"]),
            "Cliente": item["customer_name"],
            "Celular": item["customer_phone"],
            "Equipo": f"{item['brand']} {item['model']}",
            "Reparación solicitada": item["issue"],
        })
    st.dataframe(pd.DataFrame(rows), use_container_width=True, hide_index=True)

    st.subheader("Decidir disponibilidad")
    if not pending:
        st.info("No hay solicitudes pendientes de decisión.")
        return

    pending_by_id = {item["id"]: item for item in pending}
    selected_id = st.selectbox("Solicitud pendiente", list(pending_by_id))
    current = pending_by_id[selected_id]
    scheduled = local_datetime(current["scheduled_at"])
    st.write(
        f"**{current['customer_name']}** · {current['customer_phone']}  \n"
        f"{current['brand']} {current['model']} · {current['issue']}  \n"
        f"Horario solicitado: **{scheduled:%d/%m/%Y a las %H:%M}**"
    )
    decision = st.radio(
        "¿Estás disponible en ese horario?",
        ["confirmed", "cancelled"],
        format_func=lambda value: "Sí, confirmar disponibilidad" if value == "confirmed" else "No, marcar horario como no disponible",
    )
    if st.button("Guardar decisión", type="primary"):
        try:
            updated = requests.patch(
                f"{BACKEND_URL}/api/staff/appointments/{selected_id}",
                json={"status": decision},
                headers={"X-Staff-Token": st.session_state.staff_token},
                timeout=BACKEND_REQUEST_TIMEOUT,
            )
            if updated.status_code >= 400:
                st.error(api_error(updated))
            else:
                st.success("Disponibilidad confirmada." if decision == "confirmed" else "La solicitud quedó marcada como no disponible.")
                st.rerun()
        except requests.RequestException:
            st.error("No se pudo guardar la decisión.")


availability_queue()
