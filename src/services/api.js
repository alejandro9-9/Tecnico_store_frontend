const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '')

export async function api(path, { headers = {}, ...options } = {}) {
  let response
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    })
  } catch {
    throw new Error('No se pudo conectar con la API. Comprueba que el backend esté ejecutándose en http://localhost:8000.')
  }
  if (response.status === 204) return null
  const contentType = response.headers.get('content-type') || ''
  const data = contentType.includes('application/json') ? await response.json() : await response.text()
  if (!response.ok) throw new Error(data?.detail || `La solicitud falló (${response.status}).`)
  return data
}

export const roleHeader = (role, token) => ({ [role === 'admin' ? 'X-Admin-Token' : 'X-Staff-Token']: token })

