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
        [`Substation-${i}`, `SS-${i}`, `56000${i}`, baseLat + (i * 0.015), baseLng + (i * 0.015)]
      )
      substations.push(rows[0])
    }

    const feeders = []
    for (let i = 0; i < 31; i++) {
      const ss = substations[i % substations.length]
      const { rows } = await query(
        `INSERT INTO feeders (substation_id, name, code)
         VALUES ($1, $2, $3) RETURNING *`,
        [ss.id, `Feeder-F${i + 1}`, `F${i + 1}`]
      )
      feeders.push(rows[0])
    }

    const transformers = []
    const dtValues = []
    const dtParams = []
    let dtParamIdx = 1

    for (let i = 0; i < 412; i++) {
      const feeder = feeders[i % feeders.length]
      const isMissingTopology = i >= 165
      const dtLat = baseLat + (Math.floor(i / 20) * 0.004)
      const dtLng = baseLng + ((i % 20) * 0.004)
      const pinCode = (i % 33 === 0) ? null : `5600${10 + (i % 80)}`

      dtValues.push(`($${dtParamIdx}, $${dtParamIdx+1}, $${dtParamIdx+2}, $${dtParamIdx+3}, $${dtParamIdx+4}, $${dtParamIdx+5}, $${dtParamIdx+6}, $${dtParamIdx+7}, $${dtParamIdx+8})`)
      dtParams.push(
        feeder.id,
        `DT-${feeder.code}-${i + 1}`,
        `DT-${feeder.code}-${i + 1}`,
        pinCode,
        dtLat,
        dtLng,
        isMissingTopology ? null : 1,
        null,
        isMissingTopology
      )
      dtParamIdx += 9
    }

    const { rows: insertedDts } = await query(
      `INSERT INTO transformers (feeder_id, name, code, pin_code, latitude, longitude, seq_on_line, parent_pole_id, topology_inferred)
       VALUES ${dtValues.join(', ')} RETURNING *`,
      dtParams
    )
    transformers.push(...insertedDts)

    const totalPolesTarget = 38400
    const polesPerDT = Math.ceil(totalPolesTarget / transformers.length)
    const poleValues = []

    for (let tIdx = 0; tIdx < transformers.length; tIdx++) {
      const dt = transformers[tIdx]
      const isMissingTopology = dt.topology_inferred
      const angle = (tIdx * 17) * (Math.PI / 180)

      for (let pSeq = 1; pSeq <= polesPerDT; pSeq++) {
        if (poleValues.length >= totalPolesTarget) break

        const pLat = dt.latitude + (Math.cos(angle) * pSeq * 0.00006)
        const pLng = dt.longitude + (Math.sin(angle) * pSeq * 0.00006)
        const code = `P-${dt.code}-${String(pSeq).padStart(3, '0')}`
        const polePinCode = (pSeq % 33 === 0) ? null : dt.pin_code

        poleValues.push({
          transformer_id: dt.id,
          pole_code: code,
          pin_code: polePinCode,
          latitude: pLat,
          longitude: pLng,
          seq_on_line: isMissingTopology ? null : pSeq,
          parent_pole_id: null
        })
      }
    }

    const chunkSize = 1000
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

async function generateTelemetryForTree(poles, breakAfterSeq, { simulatePacketLoss = false } = {}) {
  const FW12_RATIO = 0.08        // 8% of fleet is firmware 1.2 — goes quiet, no dying message
  const PACKET_LOSS_RATIO = 0.30 // 30% of dark-pole dying messages never arrive

  const messages = poles.map((pole, idx) => {
    const seqVal = pole.seq_on_line != null ? pole.seq_on_line : (idx + 1)
    const isEnergized = seqVal <= breakAfterSeq
    const isFw12Device = Math.random() < FW12_RATIO // hoisted so it's available in raw_payload

    // Realism: dark poles may not send a message at all
    if (!isEnergized && simulatePacketLoss) {
      const packetDropped = Math.random() < PACKET_LOSS_RATIO

      if (isFw12Device || packetDropped) {
        // This pole goes dark but its message is never received.
        // The fault detection will catch it via the 15-min heartbeat timeout (Silent Death).
        return null
      }
    }

    return {
      device_id: `dev-${pole.id}`,
      pole_id: pole.id,
      seq: seqVal,
      energized: isEnergized,
      reported_at: new Date().toISOString(),
      raw_payload: {
        pole_id: pole.id,
        seq: seqVal,
        energized: isEnergized,
        fw: isFw12Device ? '1.2.0' : '1.4.2',
      },
    }
  }).filter(Boolean)

  return bulkUpsertTelemetry(messages)
}


async function injectFault(req, res, next) {
  try {
    let {
      transformer_id,
      break_after_seq = 3,
      reason = 'Synthetic span fault injected for testing',
      simulate_packet_loss = false,
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

    const insertedTelemetry = await generateTelemetryForTree(
      poleRows,
      Number(break_after_seq),
      { simulatePacketLoss: Boolean(simulate_packet_loss) }
    )

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
      packet_loss_simulated: Boolean(simulate_packet_loss),
      messages_sent: insertedTelemetry.length,
      messages_dropped: poleRows.length - insertedTelemetry.length,
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
    let transformerCode = 'DT-1'

    if (!transformer_id) {
      const { rows: randomDt } = await query(`SELECT id, code FROM transformers ORDER BY RANDOM() LIMIT 1`)
      if (randomDt.length > 0) {
        transformer_id = randomDt[0].id
        transformerCode = randomDt[0].code
      }
    } else {
      const { rows: dtRows } = await query(`SELECT code FROM transformers WHERE id = $1`, [transformer_id])
      if (dtRows.length > 0) transformerCode = dtRows[0].code
    }

    const { rows: outageRows } = await query(
      `
        INSERT INTO scheduled_outages (transformer_id, start_at, end_at, reason, active)
        VALUES ($1, NOW() - INTERVAL '10 minutes', NOW() + INTERVAL '2 hours', $2, TRUE)
        RETURNING *
      `,
      [transformer_id || null, req.body?.reason || 'Scheduled Load Shedding Window'],
    )

    // Inject dark telemetry for poles under this transformer to demonstrate ticket suppression
    const { rows: poleRows } = await query(
      `SELECT * FROM poles WHERE transformer_id = $1 ORDER BY seq_on_line, id`,
      [transformer_id]
    )

    if (poleRows.length > 0) {
      const breakAfterSeq = 2
      const insertedTelemetry = await generateTelemetryForTree(poleRows, breakAfterSeq)

      const { detectFaults } = require('../services/faultDetectionService')
      const { inferPoleTopology } = require('../services/graphBuilderService')

      const { rows: dtRows } = await query(`SELECT * FROM transformers WHERE id = $1`, [transformer_id])
      const transformer = dtRows[0]

      const orderedPoles = poleRows.some((p) => p.seq_on_line == null)
        ? inferPoleTopology(poleRows, transformer)
        : poleRows

      // Run fault detection passing active scheduled outages context
      const faults = detectFaults({
        poles: orderedPoles,
        telemetry: insertedTelemetry,
        transformer,
        scheduledOutages: outageRows,
      })

      // Zero tickets generated because scheduled outage suppressed false alarms!
      return res.status(201).json({
        message: `Scheduled Load Shedding Active on ${transformerCode}: Dark telemetry ingested but ticket creation SUPPRESSED due to maintenance schedule.`,
        outage: outageRows[0],
        transformer_code: transformerCode,
        tickets_created: faults.length,
        suppressed: true,
      })
    }

    res.status(201).json({
      message: `Scheduled Load Shedding Active on ${transformerCode}`,
      outage: outageRows[0],
      transformer_code: transformerCode,
      suppressed: true,
    })
  } catch (error) {
    next(error)
  }
}

async function createScenario(req, res, next) {
  try {
    const { name = 'Simultaneous Monsoon Storm Outages' } = req.body || {}

    const { rows: selectedDts } = await query(
      `SELECT id FROM transformers ORDER BY RANDOM() LIMIT 2`
    )

    if (selectedDts.length < 2) {
      return res.status(400).json({ message: 'At least 2 transformers required in database' })
    }

    const { detectFaults } = require('../services/faultDetectionService')
    const { inferPoleTopology } = require('../services/graphBuilderService')
    const ticketModel = require('../models/ticketModel')

    const createdTickets = []

    for (let i = 0; i < selectedDts.length; i++) {
      const dtId = selectedDts[i].id
      const { rows: dtRows } = await query(`SELECT * FROM transformers WHERE id = $1`, [dtId])
      const transformer = dtRows[0]

      const { rows: poleRows } = await query(
        `SELECT * FROM poles WHERE transformer_id = $1 ORDER BY seq_on_line, id`,
        [dtId]
      )

      if (!poleRows.length) continue

      const breakAfterSeq = Math.floor(Math.random() * 4) + 2
      const insertedTelemetry = await generateTelemetryForTree(poleRows, breakAfterSeq)

      const orderedPoles = poleRows.some((p) => p.seq_on_line == null)
        ? inferPoleTopology(poleRows, transformer)
        : poleRows

      const faults = detectFaults({ poles: orderedPoles, telemetry: insertedTelemetry, transformer })

      if (faults.length > 0) {
        const ticket = await ticketModel.createDetectedTicket(faults[0], `${name} - ${transformer.code}`)
        createdTickets.push(ticket)
      }
    }

    res.status(201).json({
      message: 'Simultaneous monsoon storm scenario created',
      tickets_created: createdTickets.length,
      tickets: createdTickets,
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

async function injectFeederFault(req, res, next) {
  try {
    // Pick a random feeder that has >= 2 DTs and inject DT_FAULT on all of them
    const { rows: feederRows } = await query(
      `SELECT feeder_id, COUNT(*) AS dt_count
       FROM transformers
       GROUP BY feeder_id
       HAVING COUNT(*) >= 2
       ORDER BY RANDOM()
       LIMIT 1`
    )

    if (!feederRows.length) {
      return res.status(404).json({ message: 'No feeder found with >= 2 transformers' })
    }

    const feederId = feederRows[0].feeder_id
    const { rows: dtRows } = await query(
      `SELECT id, code FROM transformers WHERE feeder_id = $1 ORDER BY id`,
      [feederId]
    )

    const ticketModel = require('../models/ticketModel')
    const { detectFaults } = require('../services/faultDetectionService')
    const { inferPoleTopology } = require('../services/graphBuilderService')

    const dtFaults = []
    for (const dt of dtRows) {
      const { rows: poleRows } = await query(
        `SELECT * FROM poles WHERE transformer_id = $1 ORDER BY seq_on_line, id`,
        [dt.id]
      )
      if (!poleRows.length) continue

      // All poles dark = DT fault, which will then aggregate to FEEDER_FAULT
      const telemetry = await generateTelemetryForTree(poleRows, 0)
      const orderedPoles = poleRows.some((p) => p.seq_on_line == null)
        ? inferPoleTopology(poleRows, dt)
        : poleRows

      const faults = detectFaults({ poles: orderedPoles, telemetry, transformer: dt, feeder_id: feederId })
      if (faults.length > 0) {
        dtFaults.push(...faults)
      }
    }

    // Aggregate into single FEEDER_FAULT ticket
    const existingFeederTicket = await ticketModel.findOpenFeederFaultTicket(feederId)
    let feederTicket = existingFeederTicket

    if (!existingFeederTicket && dtFaults.length >= 2) {
      const totalDownstream = dtFaults.reduce((sum, f) => sum + f.downstream_pole_count, 0)
      const firstFault = dtFaults[0]
      const feederFault = {
        fault_type: 'FEEDER_FAULT',
        feeder_id: feederId,
        last_live_pole_id: null,
        first_dark_pole_id: firstFault.first_dark_pole_id,
        downstream_pole_count: totalDownstream,
        confidence: 0.98,
        confidence_reason: `${dtFaults.length} of ${dtRows.length} distribution transformers on feeder #${feederId} are completely dark — 11 kV feeder fault or upstream HT fuse failure likely.`,
        pin_code: firstFault.pin_code,
        latitude: firstFault.latitude,
        longitude: firstFault.longitude,
        topology_inferred: false,
      }
      feederTicket = await ticketModel.createDetectedTicket(feederFault, `11 kV feeder fault injected on feeder #${feederId}`)
    }

    res.status(201).json({
      message: `11 kV feeder fault injected: ${dtRows.length} DTs on feeder #${feederId} all dark`,
      feeder_id: feederId,
      affected_transformers: dtRows.map((d) => d.code),
      ticket: feederTicket,
    })
  } catch (error) {
    next(error)
  }
}

async function injectDeadDeviceNoise(req, res, next) {
  try {
    // Kill one random device's telemetry while power stays on everywhere else.
    // This simulates a dead modem / water ingress / expired SIM.
    const { rows: poleRows } = await query(
      `SELECT p.* FROM poles p
       LEFT JOIN telemetry t ON t.pole_id = p.id
       WHERE t.id IS NOT NULL
       ORDER BY RANDOM() LIMIT 1`
    )

    if (!poleRows.length) {
      return res.status(404).json({ message: 'No poles with telemetry found. Run Seed Grid first.' })
    }

    const pole = poleRows[0]
    // Simply stop sending heartbeats — we do this by inserting a very stale last heartbeat
    const staleTime = new Date(Date.now() - 20 * 60 * 1000).toISOString() // 20 min ago
    await bulkUpsertTelemetry([{
      device_id: `dev-${pole.id}`,
      pole_id: pole.id,
      seq: Date.now(),
      energized: false, // Device goes silent — no more heartbeats
      reported_at: staleTime,
      raw_payload: { event: 'device_silent', fw: '1.2.0', note: 'Fw1.2 device — last heartbeat expired' },
    }])

    // Create a suppressed DEAD_SENSOR ticket so it shows up on the map (Amber icon) for the demo,
    // but we immediately CLOSE it so it doesn't dispatch a crew.
    const fault = {
      fault_type: 'DEAD_SENSOR',
      feeder_id: null,
      last_live_pole_id: pole.parent_pole_id || null,
      first_dark_pole_id: pole.id,
      downstream_pole_count: 1,
      confidence: 0.99,
      confidence_reason: 'Device stopped heartbeating but children are live. Suppressed from crew dispatch.',
      pin_code: pole.pin_code,
      latitude: pole.latitude,
      longitude: pole.longitude,
      topology_inferred: false,
    }
    
    const ticketModel = require('../models/ticketModel')
    const ticket = await ticketModel.createDetectedTicket(fault, 'Hardware glitch / Dead Modem detected. Suppressed.')
    await ticketModel.updateTicketStatus(ticket.id, 'CLOSED', 'System Auto-Closed: Dead Sensor suppressed from active operations')

    // Fetch the updated ticket with all joined fields (like last_live_lat) so the frontend map renders it flawlessly
    const finalTicket = await ticketModel.getTicketById(ticket.id)

    res.status(201).json({
      message: `Dead device noise injected on pole #${pole.id} (${pole.pole_code}). Filter auto-suppressed the ticket (created and immediately closed) so it appears as an Amber Warning on the map.`,
      pole_id: pole.id,
      pole_code: pole.pole_code,
      suppressed: true,
      ticket: finalTicket,
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
  injectDeadDeviceNoise,
  injectFeederFault,
  injectFault,
  injectSpanFault,
  repairFault,
  seedSyntheticGrid,
}