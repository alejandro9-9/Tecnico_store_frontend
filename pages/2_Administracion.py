from __future__ import annotations

import os
from datetime import date, datetime, time, timedelta, timezone

import pandas as pd
import requests
import streamlit as st


BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000").rstrip("/")
if not BACKEND_URL.startswith(("http://", "https://")):
    BACKEND_URL = f"https://{BACKEND_URL}"
LIMA_TZ = timezone(timedelta(hours=-5))
STATUS_LABELS = {
    "requested": "Pendiente de confirmación", "scheduled": "Programada", "confirmed": "Confirmada",
    "arrived": "En el taller", "diagnosing": "En diagnóstico", "awaiting_approval": "Esperando aprobación",
    "waiting_parts": "Esperando repuesto", "in_repair": "En reparación", "ready_for_pickup": "Lista para recojo",
    "completed": "Entregada", "cancelled": "Cancelada",
}

st.set_page_config(page_title="EVOL | Administración", page_icon="🗓️", layout="wide")
st.title("🗓️ Administración")
st.caption("Consulta las citas, administra precios por modelo y reparación y bloquea horarios para nuevas solicitudes.")

if "admin_token" not in st.session_state:
    st.session_state.admin_token = ""


def headers(token: str | None = None) -> dict[str, str]:
    return {"X-Admin-Token": token if token is not None else st.session_state.admin_token}


def api_error(response: requests.Response) -> str:
    try:
        return str(response.json().get("detail", "No se pudo completar la operación."))
    except (ValueError, AttributeError):
        return "No se pudo completar la operación."


if not st.session_state.admin_token:
    st.subheader("Acceso de administración")
    with st.form("admin_login"):
        token = st.text_input("Clave de administración", type="password")
        login = st.form_submit_button("Ingresar", type="primary")
    if login:
        try:
            response = requests.get(f"{BACKEND_URL}/api/admin/appointments", headers=headers(token), timeout=10)
            if response.status_code == 401:
                st.error("La clave no es válida.")
            else:
                response.raise_for_status()
                st.session_state.admin_token = token
                st.rerun()
        except requests.RequestException:
            st.error("No se pudo conectar con el servicio. Comprueba que esté activo.")
    st.info("Clave de acceso local: `adm`. En Render configura `ADMIN_TOKEN` con una clave propia.")
    st.stop()

if st.button("Cerrar sesión", key="admin_logout"):
    st.session_state.admin_token = ""
    st.rerun()


st.subheader("Precios por modelo y reparación")
st.caption("Registra el costo exacto de una reparación para un teléfono específico. El chat usa este precio cuando coinciden modelo y reparación.")
try:
    services_response = requests.get(f"{BACKEND_URL}/api/services", timeout=10)
    services_response.raise_for_status()
    services = services_response.json()
    model_catalog_response = requests.get(f"{BACKEND_URL}/api/models", timeout=10)
    model_catalog_response.raise_for_status()
    model_catalog = model_catalog_response.json()
    model_prices_response = requests.get(f"{BACKEND_URL}/api/admin/model-prices", headers=headers(), timeout=10)
    model_prices_response.raise_for_status()
    model_prices = model_prices_response.json()
except requests.RequestException:
    services, model_catalog, model_prices = [], [], []
    st.error("No se pudo cargar el catálogo de modelos y precios.")

if model_prices:
    price_rows = [{
        "Marca": item["brand"], "Modelo": item["model"], "Reparación": item["repair_name"],
        "Precio tienda": f"S/ {float(item['price']):.2f}", "Actualizado": item["verified_on"],
    } for item in model_prices]
    st.dataframe(pd.DataFrame(price_rows), use_container_width=True, hide_index=True)
else:
    st.info("Aún no hay precios específicos por modelo registrados.")

if services:
    known_devices = sorted(
        {(item["brand"], item["model"]) for item in model_catalog},
        key=lambda pair: (pair[0].casefold(), pair[1].casefold()),
    )
    device_labels = {f"{brand} {model}": (brand, model) for brand, model in known_devices}
    with st.form("model_price_update"):
        add_new_device = st.checkbox("Registrar un modelo que todavía no aparece en el catálogo")
        if add_new_device:
            brand_input = st.text_input("Marca", max_chars=80)
            model_input = st.text_input("Modelo exacto", max_chars=120)
        elif device_labels:
            chosen_device = st.selectbox("Teléfono", list(device_labels))
            brand_input, model_input = device_labels[chosen_device]
        else:
            brand_input, model_input = "", ""
            st.warning("No hay modelos cargados. Registra uno nuevo para continuar.")

        service_codes = [item["code"] for item in services]
        service_names = {item["code"]: item["name"] for item in services}
        selected_repair_code = st.selectbox(
            "Tipo de reparación", service_codes,
            format_func=lambda code: service_names[code],
        )
        matching_price = next((
            item for item in model_prices
            if item["brand"].casefold() == brand_input.casefold()
            and item["model"].casefold() == model_input.casefold()
            and item["repair_code"] == selected_repair_code
        ), None)
        current_price = float(matching_price["price"]) if matching_price else 0.0
        exact_price = st.number_input("Precio registrado en la tienda (S/)", min_value=0.0, value=current_price, step=10.0)
        save_model_price = st.form_submit_button("Guardar precio por modelo", type="primary")
    if save_model_price:
        if len(brand_input.strip()) < 2 or not model_input.strip():
            st.error("Completa la marca y el modelo exacto.")
        else:
            payload = {
                "brand": brand_input.strip(), "model": model_input.strip(),
                "repair_code": selected_repair_code, "price": exact_price,
            }
            try:
                saved_price = requests.put(
                    f"{BACKEND_URL}/api/admin/model-prices",
                    headers=headers(), json=payload, timeout=10,
                )
                if saved_price.status_code >= 400:
                    st.error(api_error(saved_price))
                else:
                    st.success(f"Precio guardado para {brand_input} {model_input} · {service_names[selected_repair_code]}.")
                    st.rerun()
            except requests.RequestException:
                st.error("No se pudo guardar el precio por modelo.")


@st.fragment(run_every="5s")
def appointment_view() -> None:
    try:
        response = requests.get(f"{BACKEND_URL}/api/admin/appointments", headers=headers(), timeout=10)
        if response.status_code == 401:
            st.session_state.admin_token = ""
            st.error("La sesión expiró. Ingresa nuevamente.")
            st.rerun()
        response.raise_for_status()
        appointments = response.json()
    except requests.RequestException:
        st.error("No se pudo cargar la lista de citas.")
        return

    st.subheader("Todas las citas")
    if not appointments:
        st.info("Aún no hay citas registradas.")
        return
    rows = []
    for item in appointments:
        scheduled = datetime.fromisoformat(item["scheduled_at"].replace("Z", "+00:00"))
        if scheduled.tzinfo is None:
            scheduled = scheduled.replace(tzinfo=LIMA_TZ)
        else:
            scheduled = scheduled.astimezone(LIMA_TZ)
        price = item.get("quote_price")
        rows.append({
            "Cita": item["id"], "Cotización": item.get("quote_id") or "—",
            "Fecha y hora": scheduled.strftime("%d/%m/%Y %H:%M"),
            "Estado": STATUS_LABELS.get(item["status"], item["status"]),
            "Cliente": item["customer_name"], "Celular": item["customer_phone"],
            "Equipo": f"{item['brand']} {item['model']}", "Reparación": item["issue"],
            "Precio": f"S/ {float(price):.2f}" if price is not None else "Pendiente",
        })
    st.dataframe(pd.DataFrame(rows), use_container_width=True, hide_index=True)


appointment_view()
st.divider()
st.subheader("Bloquear horario")
st.caption("El bloqueo impide nuevas solicitudes que se crucen con ese intervalo. No modifica citas existentes.")
now = datetime.now(LIMA_TZ)
with st.form("block_create"):
    col1, col2, col3 = st.columns(3)
    block_date = col1.date_input("Fecha", value=now.date(), min_value=now.date())
    start_time = col2.time_input("Desde", value=time(9, 0), step=timedelta(minutes=30))
    end_time = col3.time_input("Hasta", value=time(10, 0), step=timedelta(minutes=30))
    reason = st.text_input("Motivo", value="Horario no disponible", max_chars=240)
    submit_block = st.form_submit_button("Bloquear horario", type="primary")

if submit_block:
    starts_at = datetime.combine(block_date, start_time, tzinfo=LIMA_TZ)
    ends_at = datetime.combine(block_date, end_time, tzinfo=LIMA_TZ)
    try:
        response = requests.post(
            f"{BACKEND_URL}/api/admin/blocks",
            headers=headers(),
            json={"starts_at": starts_at.isoformat(), "ends_at": ends_at.isoformat(), "reason": reason.strip() or "Horario no disponible"},
            timeout=10,
        )
        if response.status_code >= 400:
            st.error(api_error(response))
        else:
            st.success("Horario bloqueado para nuevas solicitudes.")
            st.rerun()
    except requests.RequestException:
        st.error("No se pudo guardar el bloqueo.")

st.subheader("Horarios bloqueados")
try:
    response = requests.get(f"{BACKEND_URL}/api/admin/blocks", headers=headers(), timeout=10)
    response.raise_for_status()
    blocks = response.json()
except requests.RequestException:
    blocks = []
    st.error("No se pudo cargar la lista de horarios bloqueados.")

if blocks:
    for block in blocks:
        starts = datetime.fromisoformat(block["starts_at"].replace("Z", "+00:00"))
        ends = datetime.fromisoformat(block["ends_at"].replace("Z", "+00:00"))
        starts = starts.replace(tzinfo=LIMA_TZ) if starts.tzinfo is None else starts.astimezone(LIMA_TZ)
        ends = ends.replace(tzinfo=LIMA_TZ) if ends.tzinfo is None else ends.astimezone(LIMA_TZ)
        left, right = st.columns([5, 1])
        left.write(f"**{starts:%d/%m/%Y %H:%M}–{ends:%H:%M}** · {block['reason']}")
        if right.button("Desbloquear", key=f"unblock_{block['id']}"):
            try:
                removed = requests.delete(f"{BACKEND_URL}/api/admin/blocks/{block['id']}", headers=headers(), timeout=10)
                removed.raise_for_status()
                st.rerun()
            except requests.RequestException:
                st.error("No se pudo retirar el bloqueo.")
else:
    st.info("No hay horarios bloqueados.")
