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
    await query('TRUNCATE ticket_events, tickets, scheduled_outages, telemetry, poles, transformers, feeders, substations RESTART IDENTITY CASCADE;')

    const baseLat = 12.9716
    const baseLng = 77.5946
    const substations = []

    for (let i = 1; i <= 4; i++) {
      const { rows } = await query(
        `INSERT INTO substations (name, code, pin_code, latitude, longitude)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [`Substation-${i}`, `SS-${i}`, `56000${i}`, baseLat + (i * 0.02), baseLng + (i * 0.02)]
      )
      substations.push(rows[0])
    }

    const feeders = []
    for (let i = 0; i < 20; i++) {
      const ss = substations[i % substations.length]
      const { rows } = await query(
        `INSERT INTO feeders (substation_id, name, code)
         VALUES ($1, $2, $3) RETURNING *`,
        [ss.id, `Feeder-F${i + 1}`, `F${i + 1}`]
      )
      feeders.push(rows[0])
    }

    const transformers = []
    for (let i = 0; i < 100; i++) {
      const feeder = feeders[i % feeders.length]
      const isMissingTopology = i >= 40
      const dtLat = baseLat + (Math.floor(i / 10) * 0.005)
      const dtLng = baseLng + ((i % 10) * 0.005)

      const { rows } = await query(
        `INSERT INTO transformers (feeder_id, name, code, pin_code, latitude, longitude, seq_on_line, parent_pole_id, topology_inferred)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [
          feeder.id,
          `DT-${feeder.code}-${i + 1}`,
          `DT-${feeder.code}-${i + 1}`,
          `5600${10 + (i % 80)}`,
          dtLat,
          dtLng,
          isMissingTopology ? null : 1,
          null,
          isMissingTopology
        ]
      )
      transformers.push(rows[0])
    }

    const targetPolesPerDT = Number(req.body?.polesPerDT) || 100
    const poleValues = []
    for (let tIdx = 0; tIdx < transformers.length; tIdx++) {
      const dt = transformers[tIdx]
      const isMissingTopology = dt.topology_inferred
      const angle = (tIdx * 36) * (Math.PI / 180) // Radial angle distribution per feeder branch

      for (let pSeq = 1; pSeq <= targetPolesPerDT; pSeq++) {
        const pLat = dt.latitude + (Math.cos(angle) * pSeq * 0.00008)
        const pLng = dt.longitude + (Math.sin(angle) * pSeq * 0.00008)
        const code = `P-${dt.code}-${String(pSeq).padStart(3, '0')}`

        poleValues.push({
          transformer_id: dt.id,
          pole_code: code,
          pin_code: dt.pin_code,
          latitude: pLat,
          longitude: pLng,
          seq_on_line: isMissingTopology ? null : pSeq,
          parent_pole_id: null
        })
      }
    }

    const chunkSize = 500
    const insertedPoles = []

    for (let i = 0; i < poleValues.length; i += chunkSize) {
      const chunk = poleValues.slice(i, i + chunkSize)
      const valueTuples = []
      const params = []
      let paramIdx = 1

      for (const p of chunk) {
        valueTuples.push(`($${paramIdx}, $${paramIdx+1}, $${paramIdx+2}, $${paramIdx+3}, $${paramIdx+4}, $${paramIdx+5}, $${paramIdx+6})`)
        params.push(p.transformer_id, p.pole_code, p.pin_code, p.latitude, p.longitude, p.seq_on_line, p.parent_pole_id)
        paramIdx += 7
      }

      const { rows } = await query(
        `INSERT INTO poles (transformer_id, pole_code, pin_code, latitude, longitude, seq_on_line, parent_pole_id)
         VALUES ${valueTuples.join(', ')} RETURNING id, transformer_id, pole_code, seq_on_line`,
        params
      )
      insertedPoles.push(...rows)
    }

    // Insert initial live telemetry for seeded poles
    const telemetryRecords = insertedPoles.map((p) => ({
      device_id: `dev-${p.id}`,
      pole_id: p.id,
      seq: 100,
      energized: true,
      reported_at: new Date().toISOString(),
    }))

    for (let i = 0; i < telemetryRecords.length; i += chunkSize) {
      const chunk = telemetryRecords.slice(i, i + chunkSize)
      const valueTuples = []
      const params = []
      let paramIdx = 1

      for (const t of chunk) {
        valueTuples.push(`($${paramIdx}, $${paramIdx+1}, $${paramIdx+2}, $${paramIdx+3}, $${paramIdx+4})`)
        params.push(t.device_id, t.pole_id, t.seq, t.energized, t.reported_at)
        paramIdx += 5
      }

      await query(
        `INSERT INTO telemetry (device_id, pole_id, seq, energized, reported_at)
         VALUES ${valueTuples.join(', ')}
         ON CONFLICT (device_id, seq) DO NOTHING`,
        params
      )
    }

    res.status(201).json({
      message: `Synthetic grid seeded with ${insertedPoles.length.toLocaleString()} poles across ${transformers.length} transformers`,
      total_poles: insertedPoles.length,
      transformers: transformers.length,
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
    let {
      transformer_id,
      break_after_seq = 3,
      reason = 'Synthetic span fault injected for testing',
    } = req.body || {}

    if (!transformer_id) {
      const { rows: availableDts } = await query(
        `
          SELECT t.id
          FROM transformers t
          WHERE t.id NOT IN (
            SELECT DISTINCT p.transformer_id
            FROM tickets tk
            JOIN poles p ON p.id = tk.first_dark_pole_id
            WHERE tk.status <> 'CLOSED'
          )
          ORDER BY RANDOM()
          LIMIT 1
        `
      )
      transformer_id = availableDts[0]?.id || null

      if (!transformer_id) {
        const { rows: randomDts } = await query(`SELECT id FROM transformers ORDER BY RANDOM() LIMIT 1`)
        transformer_id = randomDts[0]?.id
      }
    }

    if (!transformer_id) {
      return res.status(404).json({ message: 'No transformer found in database' })
    }

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

    const { detectFaults } = require('../services/faultDetectionService')
    const { inferPoleTopology } = require('../services/graphBuilderService')
    const ticketModel = require('../models/ticketModel')

    const { rows: dtRows } = await query(`SELECT * FROM transformers WHERE id = $1`, [transformer_id])
    const transformer = dtRows[0] || null

    const orderedPoles = poleRows.some((p) => p.seq_on_line == null)
      ? inferPoleTopology(poleRows, transformer)
      : poleRows

    const faults = detectFaults({ poles: orderedPoles, telemetry: insertedTelemetry, transformer })
    let createdTicket = null
    if (faults.length > 0) {
      createdTicket = await ticketModel.createDetectedTicket(faults[0], reason)
    }

    res.status(201).json({
      message: reason,
      transformer_id,
      break_after_seq: Number(break_after_seq),
      telemetry: insertedTelemetry,
      ticket: createdTicket,
    })
  } catch (error) {
    next(error)
  }
}

async function createMockOutage(req, res, next) {
  try {
    let transformer_id = req.body?.transformer_id
    if (!transformer_id) {
      const { rows: defaultDts } = await query(`SELECT id FROM transformers ORDER BY id LIMIT 1`)
      transformer_id = defaultDts[0]?.id
    }

    const { rows } = await query(
      `
        INSERT INTO scheduled_outages (transformer_id, start_at, end_at, reason, active)
        VALUES ($1, NOW() - INTERVAL '10 minutes', NOW() + INTERVAL '2 hours', $2, TRUE)
        RETURNING *
      `,
      [transformer_id || null, req.body?.reason || 'Load shedding'],
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

      const { detectFaults } = require('../services/faultDetectionService')
      const { inferPoleTopology } = require('../services/graphBuilderService')
      const ticketModel = require('../models/ticketModel')

      const orderedPoles = created.poles.some((p) => p.seq_on_line == null)
        ? inferPoleTopology(created.poles, created.transformer)
        : created.poles

      const faults = detectFaults({ poles: orderedPoles, telemetry, transformer: created.transformer })
      const createdTickets = []
      for (const fault of faults) {
        const ticket = await ticketModel.createDetectedTicket(fault, name)
        createdTickets.push(ticket)
      }

      return {
        ...created,
        telemetry,
        break_after_seq: Number(break_after_seq),
        tickets: createdTickets,
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

async function injectSpanFault(req, res, next) {
  try {
    const { rows: dts } = await query(`SELECT * FROM transformers WHERE topology_inferred = FALSE LIMIT 1`)
    const dt = dts[0]
    if (!dt) {
      return res.status(404).json({ message: 'No transformer found' })
    }

    const { rows: poles } = await query(`SELECT * FROM poles WHERE transformer_id = $1 ORDER BY seq_on_line`, [dt.id])

    const mockTelemetry = poles.map((pole, idx) => ({
      device_id: `KSPDB-DEV-${pole.id}`,
      pole_id: pole.id,
      seq: Math.floor(Math.random() * 1000) + 100,
      energized: idx < 3,
      reported_at: new Date().toISOString(),
    }))

    await bulkUpsertTelemetry(mockTelemetry)
    res.json({ message: 'Span fault injected successfully', affected_transformer: dt.code, count: mockTelemetry.length })
  } catch (error) {
    next(error)
  }
}

module.exports = {
  createMockOutage,
  createScenario,
  injectFault,
  injectSpanFault,
  repairFault,
  seedSyntheticGrid,
}