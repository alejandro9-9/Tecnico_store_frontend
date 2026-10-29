export const STATUS = { requested: 'Pendiente', confirmed: 'Confirmada', cancelled: 'No disponible', scheduled: 'Programada', arrived: 'En taller', diagnosing: 'En diagnóstico', awaiting_approval: 'Esperando aprobación', waiting_parts: 'Esperando repuesto', in_repair: 'En reparación', ready_for_pickup: 'Lista para recojo', completed: 'Entregada' }

export const showDate = value => new Date(value).toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'medium', timeStyle: 'short' })

