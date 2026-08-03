const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

async function apiFetch(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  })

  const contentType = response.headers.get('content-type') || ''
  const payload = contentType.includes('application/json') ? await response.json() : await response.text()

  if (!response.ok) {
    const error = new Error(payload?.message || 'Request failed')
    error.status = response.status
    error.payload = payload
    throw error
  }

  return payload
}

export function getTickets() {
  return apiFetch('/api/tickets')
}

export function getTicket(id) {
  return apiFetch(`/api/tickets/${id}`)
}

export function acknowledgeTicket(id, note = 'Acknowledged from operator console') {
  return apiFetch(`/api/tickets/${id}/acknowledge`, {
    method: 'PATCH',
    body: JSON.stringify({ note }),
  })
}

export function assignTicket(id, note = 'Crew assigned from operator console') {
  return apiFetch(`/api/tickets/${id}/assign`, {
    method: 'PATCH',
    body: JSON.stringify({ note }),
  })
}

export function resolveTicket(id) {
  return apiFetch(`/api/tickets/${id}/resolve`, {
    method: 'PATCH',
    body: JSON.stringify({ note: 'Crew marked span fixed' }),
  })
}

export function verifyTicket(id) {
  return apiFetch(`/api/tickets/${id}/verify`, {
    method: 'PATCH',
  })
}

export function closeTicket(id) {
  return apiFetch(`/api/tickets/${id}/close`, {
    method: 'PATCH',
    body: JSON.stringify({ note: 'Closed after automated verification' }),
  })
}

export function sendTelemetry(messages) {
  return apiFetch('/api/telemetry/ingest', {
    method: 'POST',
    body: JSON.stringify({ telemetry: messages }),
  })
}

export function seedSyntheticGrid(payload) {
  return apiFetch('/api/simulator/seed', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function injectFault(payload) {
  return apiFetch('/api/simulator/inject-fault', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function createMockOutage(payload) {
  return apiFetch('/api/simulator/outages', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function createScenario(payload) {
  return apiFetch('/api/simulator/scenario', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function getScheduledOutages() {
  return apiFetch('/api/simulator/outages')
}
