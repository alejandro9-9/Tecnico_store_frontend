# EVOL — frontend

Interfaz de cliente para cotizar reparaciones y solicitar citas, con páginas separadas para Técnico y Administración.

## Tecnologías

- Python
- Streamlit
- Requests para comunicarse con la API FastAPI mediante HTTP/JSON

## Ejecución local

Desde esta carpeta:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:BACKEND_URL="http://localhost:8000"
streamlit run app.py
```

La API debe estar activa. La variable `BACKEND_URL` debe apuntar al backend; en Render se configura con la URL pública del servicio backend.

## Docker

```powershell
docker build -t evol-frontend .
docker run --rm -p 8501:8501 -e BACKEND_URL=https://URL-PUBLICA-DEL-BACKEND evol-frontend
```

## Despliegue en Render

El archivo `render.yaml` configura el servicio Streamlit. Conecta este repositorio como Blueprint y define `BACKEND_URL` con la URL HTTPS del backend publicado. En el panel de Render, limita el acceso al servicio según las necesidades del proyecto.

## Arranque en servicios gratuitos

Render y Neon pueden suspender sus servicios cuando permanecen inactivos. El primer mensaje o la primera solicitud de cita puede tardar hasta un minuto mientras despiertan. El frontend espera hasta 120 segundos para permitir ese arranque; no cierres la página ni envíes repetidamente el mismo mensaje durante ese intervalo.

En Render configura `BACKEND_URL` exactamente como la URL pública del backend, por ejemplo `https://evol-repair-api.onrender.com`, sin añadir `/api`.
