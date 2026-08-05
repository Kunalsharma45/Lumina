const { generateDispatchSummary } = require('../services/aiDispatchService')
const ticketModel = require('../models/ticketModel')
const poleModel = require('../models/poleModel')
const telemetryModel = require('../models/telemetryModel')

async function listTickets(req, res, next) {
  try {
    const tickets = await ticketModel.listTickets()
    res.json({ tickets })
  } catch (error) {
    next(error)
  }
}

async function getTicketById(req, res, next) {
  try {
    const ticket = await ticketModel.getTicketById(req.params.id)
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' })
    }

    res.json({ ticket })
  } catch (error) {
    next(error)
  }
}

async function acknowledgeTicket(req, res, next) {
  try {
    const ticket = await ticketModel.updateTicketStatus(req.params.id, 'ACKNOWLEDGED', req.body?.note || 'Acknowledge ticket')
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' })
    }

    res.json({ ticket })
  } catch (error) {
    next(error)
  }
}

async function assignTicket(req, res, next) {
  try {
    const ticket = await ticketModel.updateTicketStatus(req.params.id, 'CREW_ASSIGNED', req.body?.note || 'Crew assigned')
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' })
    }

    res.json({ ticket })
  } catch (error) {
    next(error)
  }
}

async function resolveTicket(req, res, next) {
  try {
    const ticket = await ticketModel.getTicketById(req.params.id)
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' })
    }

    // RESOLVED = crew's claim that they fixed it. Telemetry verification happens separately via /verify
    // or automatically via the ingest pipeline when restoration messages arrive.
    const updatedTicket = await ticketModel.updateTicket(ticket.id, {
      status: 'RESOLVED',
      resolved_at: new Date(),
      updated_at: new Date(),
    })

    await ticketModel.addTicketEvent(ticket.id, 'RESOLVED', req.body?.note || 'Crew marked span as fixed — awaiting telemetry verification')
    res.json({ ticket: updatedTicket })
  } catch (error) {
    next(error)
  }
}

async function verifyTicket(req, res, next) {
  try {
    const ticket = await ticketModel.getTicketById(req.params.id)
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' })
    }

    const downstreamPoles = await poleModel.findDownstreamPolesFromBoundary(ticket.first_dark_pole_id)
    const latestTelemetry = await telemetryModel.getLatestTelemetryByPoleIds(downstreamPoles.map((pole) => pole.id))
    const telemetryByPoleId = new Map(latestTelemetry.map((record) => [String(record.pole_id), record]))
    const allLive = downstreamPoles.every((pole) => telemetryByPoleId.get(String(pole.id))?.energized === true)

    if (!allLive) {
      return res.status(409).json({ message: 'Verification failed: telemetry confirms poles are still dark', ticket })
    }

    const updatedTicket = await ticketModel.updateTicket(ticket.id, {
      status: 'VERIFIED',
      verified_at: new Date(),
      updated_at: new Date(),
    })

    await ticketModel.addTicketEvent(ticket.id, 'VERIFIED', 'Automated verification from telemetry')
    res.json({ ticket: updatedTicket })
  } catch (error) {
    next(error)
  }
}

async function closeTicket(req, res, next) {
  try {
    const ticket = await ticketModel.getTicketById(req.params.id)
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' })
    }

    if (!ticket.verified_at && ticket.status !== 'VERIFIED') {
      return res.status(409).json({ message: 'Ticket must be verified before closing' })
    }

    const updatedTicket = await ticketModel.updateTicket(ticket.id, {
      status: 'CLOSED',
      closed_at: new Date(),
      updated_at: new Date(),
    })

    await ticketModel.addTicketEvent(ticket.id, 'CLOSED', req.body?.note || 'Ticket closed')
    res.json({ ticket: updatedTicket })
  } catch (error) {
    next(error)
  }
}

module.exports = {
  acknowledgeTicket,
  assignTicket,
  closeTicket,
  getTicketById,
  listTickets,
  resolveTicket,
  verifyTicket,
}