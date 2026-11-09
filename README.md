# Frontend React

Interfaz React 19 con Vite. Incluye cotización para clientes y paneles de técnico y administración.

## Organización del código

```text
src/
├── app/                  # composición de la aplicación y navegación
├── components/
│   ├── auth/             # acceso por rol y sesión local
│   └── common/           # encabezados, métricas, estados vacíos y carga
├── features/
│   ├── chat/              # chat de cotización y solicitud de cita
│   ├── technician/        # disponibilidad y decisiones del técnico
│   └── admin/             # citas, precios específicos y bloqueos
├── services/              # comunicación HTTP con el backend
├── styles/                # base, chat, paneles, responsive y tema oscuro
└── utils/                  # etiquetas y formatos compartidos
```

Cada vista de negocio está aislada en `features/`; `app/App.jsx` solo controla navegación y estado de conexión. Los componentes compartidos no hacen llamadas a la API y el cliente HTTP está centralizado en `services/api.js`.

```powershell
npm ci
$env:VITE_API_URL="http://localhost:8000"
npm run dev
```

Abre `http://localhost:5173`. La API ASP.NET Core debe estar iniciada en el puerto 8000.

Para generar el sitio estático que se despliega en Vercel:

```powershell
npm ci
npm run build
```

Vercel publica `dist/`. El backend de Render puede tardar unos segundos en despertar si está en un plan que escala a cero.

## Despliegue en Vercel

Importa este repositorio como un proyecto Vercel. Vercel detectará Vite y usará `npm run build`, publicando `dist/`. Configura esta variable de entorno en Production, Preview y Development:

```text
VITE_API_URL=https://tecfast-api.onrender.com
```

Después de desplegar, copia la URL de Vercel en `FRONTEND_ORIGIN` dentro del servicio del backend en Render para permitir las llamadas CORS.
