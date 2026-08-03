const { query, transaction } = require('../config/database')

function buildTicketNumber() {
  return `TK-${Date.now()}-${Math.floor(Math.random() * 1000)}`
}

async function listTickets() {
  const { rows } = await query(
    `
      SELECT *
      FROM tickets
      ORDER BY created_at DESC
    `,
  )

  return rows
}

async function getTicketById(ticketId) {
  const { rows } = await query('SELECT * FROM tickets WHERE id = $1', [ticketId])
  return rows[0] || null
}

async function findOpenTicketByBoundary(lastLivePoleId, firstDarkPoleId) {
  const { rows } = await query(
    `
      SELECT *
      FROM tickets
      WHERE last_live_pole_id = $1
        AND first_dark_pole_id = $2
        AND status <> 'CLOSED'
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [lastLivePoleId, firstDarkPoleId],
  )

  return rows[0] || null
}

async function createDetectedTicket(fault, aiSummary = '') {
  return transaction(async (client) => {
    const ticketNumber = buildTicketNumber()
    const ticketResult = await client.query(
      `
        INSERT INTO tickets (
          ticket_number,
          fault_type,
          status,
          last_live_pole_id,
          first_dark_pole_id,
          downstream_pole_count,
          confidence,
          confidence_reason,
          pin_code,
          latitude,
          longitude,
          topology_inferred,
          ai_summary
        )
        VALUES ($1, $2, 'DETECTED', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *
      `,
      [
        ticketNumber,
        fault.fault_type,
        fault.last_live_pole_id,
        fault.first_dark_pole_id,
        fault.downstream_pole_count,
        fault.confidence,
        fault.confidence_reason,
        fault.pin_code,
        fault.latitude,
        fault.longitude,
        fault.topology_inferred,
        aiSummary,
      ],
    )

    const ticket = ticketResult.rows[0]
    await client.query(
      `
        INSERT INTO ticket_events (ticket_id, status, note)
        VALUES ($1, $2, $3)
      `,
      [ticket.id, ticket.status, 'Fault localized from telemetry'],
    )

    return ticket
  })
}

async function updateTicket(ticketId, patch) {
  const fields = []
  const values = []
  let parameterIndex = 1

  for (const [key, value] of Object.entries(patch)) {
    fields.push(`${key} = $${parameterIndex}`)
    values.push(value)
    parameterIndex += 1
  }

  if (!fields.length) {
    return getTicketById(ticketId)
  }

  values.push(ticketId)

  const { rows } = await query(
    `
      UPDATE tickets
      SET ${fields.join(', ')}
      WHERE id = $${parameterIndex}
      RETURNING *
    `,
    values,
  )

  return rows[0] || null
}

async function addTicketEvent(ticketId, status, note) {
  await query(
    `
      INSERT INTO ticket_events (ticket_id, status, note)
      VALUES ($1, $2, $3)
    `,
    [ticketId, status, note],
  )
}

async function updateTicketStatus(ticketId, status, note = '') {
  const ticket = await updateTicket(ticketId, { status, updated_at: new Date() })
  if (ticket) {
    await addTicketEvent(ticket.id, status, note)
  }

  return ticket
}

module.exports = {
  addTicketEvent,
  createDetectedTicket,
  findOpenTicketByBoundary,
  getTicketById,
  listTickets,
  updateTicket,
  updateTicketStatus,
}