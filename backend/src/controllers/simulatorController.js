const { query, transaction } = require('../config/database')
const { bulkUpsertTelemetry } = require('../models/telemetryModel')
const { ingestTelemetry } = require('./telemetryController')

function toLatitudeStep(stepMeters) {
  return stepMeters / 111320
}

function buildSyntheticPoleLine({
  transformerId,
  count = 8,
  startLatitude = 12.9716,
  startLongitude = 77.5946,
  stepMeters = 30,
  staggerMeters = 0,
}) {
  const latitudeStep = toLatitudeStep(stepMeters)

  return Array.from({ length: count }, (_, index) => ({
    pole_code: `SIM-${transformerId}-${index + 1}`,
    transformer_id: transformerId,
    latitude: startLatitude + latitudeStep * index,
    longitude: startLongitude + (index % 2 === 0 ? 0 : staggerMeters / 111320),
    seq_on_line: index + 1,
    parent_pole_offset: index === 0 ? null : index,
  }))
}

async function createSyntheticTreeRecord(client, {
  name,
  code,
  pinCode,
  latitude,
  longitude,
  poleCount,
}) {
  const substationResult = await client.query(
    `
      INSERT INTO substations (name, code, pin_code, latitude, longitude)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `,
    [
      `${name} Substation`,
      `${code}-SS`,
      pinCode,
      latitude,
      longitude,
    ],
  )

  const feederResult = await client.query(
    `
      INSERT INTO feeders (substation_id, name, code)
      VALUES ($1, $2, $3)
      RETURNING *
    `,
    [substationResult.rows[0].id, `${name} Feeder`, `${code}-F1`],
  )

  const transformerResult = await client.query(
    `
      INSERT INTO transformers (feeder_id, name, code, pin_code, latitude, longitude, topology_inferred)
      VALUES ($1, $2, $3, $4, $5, $6, FALSE)
      RETURNING *
    `,
    [
      feederResult.rows[0].id,
      `${name} Transformer`,
      `${code}-T1`,
      pinCode,
      latitude,
      longitude,
    ],
  )

  const poles = buildSyntheticPoleLine({
    transformerId: transformerResult.rows[0].id,
    count: poleCount,
    startLatitude: latitude,
    startLongitude: longitude,
    stepMeters: 30,
    staggerMeters: 2,
  })

  for (const pole of poles) {
    await client.query(
      `
        INSERT INTO poles (
          transformer_id,
          pole_code,
          pin_code,
          latitude,
          longitude,
          seq_on_line,
          parent_pole_id,
          topology_inferred,
          is_active
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE, TRUE)
      `,
      [
        pole.transformer_id,
        pole.pole_code,
        pinCode,
        pole.latitude,
        pole.longitude,
        pole.seq_on_line,
        pole.parent_pole_offset ? null : null,
      ],
    )
  }

  const { rows: insertedPoles } = await client.query(
    `
      SELECT *
      FROM poles
      WHERE transformer_id = $1
      ORDER BY seq_on_line, id
    `,
    [transformerResult.rows[0].id],
  )

  for (let index = 1; index < insertedPoles.length; index += 1) {
    await client.query(
      `
        UPDATE poles
        SET parent_pole_id = $1
        WHERE id = $2
      `,
      [insertedPoles[index - 1].id, insertedPoles[index].id],
    )
  }

  return {
    substation: substationResult.rows[0],
    feeder: feederResult.rows[0],
    transformer: transformerResult.rows[0],
    poles: insertedPoles,
  }
}

async function seedSyntheticGrid(req, res, next) {
  try {
    const {
      name = 'Synthetic Line',
      code = `SIM-${Date.now()}`,
      pin_code = '560001',
      latitude = 12.9716,
      longitude = 77.5946,
      poleCount = 8,
    } = req.body || {}

    const scenario = await transaction((client) => createSyntheticTreeRecord(client, {
      name,
      code,
      pinCode: pin_code,
      latitude: Number(latitude),
      longitude: Number(longitude),
      poleCount: Number(poleCount),
    }))

    res.status(201).json({
      message: 'Synthetic grid seeded',
      scenario,
    })
  } catch (error) {
    next(error)
  }
}

async function generateTelemetryForTree(poles, breakAfterSeq) {
  const messages = poles.map((pole) => ({
    device_id: `dev-${pole.id}`,
    pole_id: pole.id,
    seq: pole.seq_on_line,
    energized: pole.seq_on_line < breakAfterSeq,
    reported_at: new Date().toISOString(),
    raw_payload: {
      pole_id: pole.id,
      seq: pole.seq_on_line,
      energized: pole.seq_on_line < breakAfterSeq,
    },
  }))

  return bulkUpsertTelemetry(messages)
}

async function injectFault(req, res, next) {
  try {
    const {
      transformer_id,
      break_after_seq = 3,
      reason = 'Synthetic span fault injected for testing',
    } = req.body || {}

    const { rows: poleRows } = await query(
      `
        SELECT *
        FROM poles
        WHERE transformer_id = $1
        ORDER BY seq_on_line, id
      `,
      [transformer_id],
    )

    if (!poleRows.length) {
      return res.status(404).json({ message: 'No synthetic tree found for this transformer' })
    }

    const insertedTelemetry = await generateTelemetryForTree(poleRows, Number(break_after_seq))

    res.status(201).json({
      message: reason,
      transformer_id,
      break_after_seq: Number(break_after_seq),
      telemetry: insertedTelemetry,
    })
  } catch (error) {
    next(error)
  }
}

async function createMockOutage(req, res, next) {
  try {
    const { rows } = await query(
      `
        INSERT INTO scheduled_outages (transformer_id, start_at, end_at, reason, active)
        VALUES ($1, NOW(), NOW() + INTERVAL '2 hours', $2, TRUE)
        RETURNING *
      `,
      [req.body?.transformer_id || null, req.body?.reason || 'Load shedding'],
    )

    res.status(201).json({ outage: rows[0] })
  } catch (error) {
    next(error)
  }
}

async function createScenario(req, res, next) {
  try {
    const {
      name = 'Demo Scenario',
      code = `SCN-${Date.now()}`,
      pin_code = '560001',
      latitude = 12.9716,
      longitude = 77.5946,
      poleCount = 8,
      break_after_seq = 4,
    } = req.body || {}

    const scenario = await transaction(async (client) => {
      const created = await createSyntheticTreeRecord(client, {
        name,
        code,
        pinCode: pin_code,
        latitude: Number(latitude),
        longitude: Number(longitude),
        poleCount: Number(poleCount),
      })

      const telemetry = await bulkUpsertTelemetry(
        created.poles.map((pole) => ({
          device_id: `dev-${pole.id}`,
          pole_id: pole.id,
          seq: pole.seq_on_line,
          energized: pole.seq_on_line < Number(break_after_seq),
          reported_at: new Date().toISOString(),
          raw_payload: {
            pole_id: pole.id,
            seq: pole.seq_on_line,
            energized: pole.seq_on_line < Number(break_after_seq),
          },
        })),
      )

      return {
        ...created,
        telemetry,
        break_after_seq: Number(break_after_seq),
      }
    })

    res.status(201).json({
      message: 'Synthetic scenario created',
      scenario,
    })
  } catch (error) {
    next(error)
  }
}

async function repairFault(req, res, next) {
  try {
    const { ticket_id } = req.body || {}
    const ticketModel = require('../models/ticketModel')
    const poleModel = require('../models/poleModel')

    const ticket = await ticketModel.getTicketById(ticket_id)
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' })
    }

    const downstreamPoles = await poleModel.findDownstreamPolesFromBoundary(ticket.first_dark_pole_id)
    if (!downstreamPoles.length) {
      return res.status(400).json({ message: 'No downstream poles found for this ticket boundary' })
    }

    const restorationMessages = downstreamPoles.map((pole) => ({
      device_id: `dev-${pole.id}`,
      pole_id: Number(pole.id),
      seq: Date.now(),
      energized: true,
      reported_at: new Date().toISOString(),
      raw_payload: { event: 'power_restored', energized: true },
    }))

    await bulkUpsertTelemetry(restorationMessages)

    const updatedTicket = await ticketModel.updateTicket(ticket.id, {
      status: 'VERIFIED',
      verified_at: new Date(),
      updated_at: new Date(),
    })

    await ticketModel.addTicketEvent(ticket.id, 'VERIFIED', 'Power restored telemetry received from field crew repair')

    res.status(200).json({
      message: 'Repair telemetry injected and ticket auto-verified',
      ticket: updatedTicket,
      restoredPolesCount: downstreamPoles.length,
    })
  } catch (error) {
    next(error)
  }
}

module.exports = {
  createMockOutage,
  createScenario,
  injectFault,
  repairFault,
  seedSyntheticGrid,
}