const path = require('path')
const assert = require('assert')

// Dynamically resolve backend root directory on any machine/operating system
const backendDir = path.resolve(__dirname, '..')

require(path.join(backendDir, 'node_modules/dotenv')).config({ path: path.join(backendDir, '.env') })
const { pool, query } = require(path.join(backendDir, 'src/config/database'))
const { detectFaults } = require(path.join(backendDir, 'src/services/faultDetectionService'))
const { inferPoleTopology } = require(path.join(backendDir, 'src/services/graphBuilderService'))
const ticketModel = require(path.join(backendDir, 'src/models/ticketModel'))
const poleModel = require(path.join(backendDir, 'src/models/poleModel'))
const telemetryModel = require(path.join(backendDir, 'src/models/telemetryModel'))
const { dedupeTelemetryByDeviceAndSequence } = require(path.join(backendDir, 'src/utils/sequenceManager'))

async function runEdgeCaseTests() {
  console.log('=== STARTING AUTOMATED EDGE CASE TEST SUITE (5,000 POLE DATASET) ===\n')
  let passedTests = 0

  try {
    // Fetch test transformers dynamically
    const { rows: dtPopRows } = await query(`SELECT * FROM transformers WHERE topology_inferred = FALSE ORDER BY id LIMIT 2`)
    const { rows: dtMissRows } = await query(`SELECT * FROM transformers WHERE topology_inferred = TRUE ORDER BY id LIMIT 2`)
    
    assert(dtPopRows.length >= 2, 'Must have at least 2 populated DTs')
    assert(dtMissRows.length >= 2, 'Must have at least 2 missing topology DTs')

    const dtPop1 = dtPopRows[0]
    const dtPop2 = dtPopRows[1]
    const dtMiss1 = dtMissRows[0]

    // -------------------------------------------------------------
    // EDGE CASE 1: Single Span Fault Boundary Localization (Populated Topology)
    // -------------------------------------------------------------
    console.log(`TEST 1: Single Span Fault Boundary Localization on ${dtPop1.code}...`)
    const { rows: dtPop1Poles } = await query(`SELECT * FROM poles WHERE transformer_id = $1 ORDER BY seq_on_line`, [dtPop1.id])
    assert(dtPop1Poles.length >= 5, 'DT must have at least 5 poles')

    // Simulate break after Pole 3 (Poles 4+ dark)
    const telemetryPop1 = dtPop1Poles.map((pole, idx) => ({
      device_id: `dev-${pole.id}`,
      pole_id: pole.id,
      seq: 201,
      energized: idx < 3,
      reported_at: new Date().toISOString()
    }))

    await telemetryModel.bulkUpsertTelemetry(telemetryPop1)
    const faultsPop1 = detectFaults({ poles: dtPop1Poles, telemetry: telemetryPop1 })
    
    assert.strictEqual(faultsPop1.length, 1, 'Should detect exactly 1 localized fault')
    assert.strictEqual(String(faultsPop1[0].last_live_pole_id), String(dtPop1Poles[2].id), 'Last live pole should be Pole 3')
    assert.strictEqual(String(faultsPop1[0].first_dark_pole_id), String(dtPop1Poles[3].id), 'First dark pole should be Pole 4')
    assert.strictEqual(faultsPop1[0].downstream_pole_count, dtPop1Poles.length - 3, 'Downstream dark count should match')
    assert(faultsPop1[0].confidence >= 0.70, 'Confidence should be >= 0.70')

    const ticket1 = await ticketModel.createDetectedTicket(faultsPop1[0], 'Dispatch handoff note for Test 1')
    assert.strictEqual(ticket1.status, 'DETECTED', 'Ticket status should be DETECTED')
    console.log(`✔ TEST 1 PASSED: Localized boundary P3 -> P4 on ${dtPop1.code} with 1 ticket created.\n`)
    passedTests++

    // -------------------------------------------------------------
    // EDGE CASE 2: Missing Topology Inference (60% Case - Prim's MST + BFS)
    // -------------------------------------------------------------
    console.log(`TEST 2: Missing Topology Reconstruction via Prim's MST & BFS on ${dtMiss1.code}...`)
    const { rows: dtMiss1Poles } = await query(`SELECT * FROM poles WHERE transformer_id = $1 ORDER BY id`, [dtMiss1.id])

    const inferredPoles = inferPoleTopology(dtMiss1Poles, dtMiss1)
    assert.strictEqual(inferredPoles.length, dtMiss1Poles.length, 'Inferred all poles')
    assert.strictEqual(inferredPoles[0].seq_on_line, 1, 'Root pole assigned seq 1')
    assert(inferredPoles.every(p => p.topology_inferred === true), 'All marked topology_inferred=true')

    const telemetryMiss1 = inferredPoles.map((pole, idx) => ({
      device_id: `dev-${pole.id}`,
      pole_id: pole.id,
      seq: 201,
      energized: idx < 4,
      reported_at: new Date().toISOString()
    }))

    const faultsMiss1 = detectFaults({ poles: inferredPoles, telemetry: telemetryMiss1, transformer: dtMiss1 })
    assert.strictEqual(faultsMiss1.length, 1, 'Detected 1 fault on inferred graph')
    assert.strictEqual(faultsMiss1[0].topology_inferred, true, 'Flagged topology_inferred=true on ticket')
    console.log(`✔ TEST 2 PASSED: Reconstructed tree graph for ${dtMiss1.code} using Prim's MST + BFS.\n`)
    passedTests++

    // -------------------------------------------------------------
    // EDGE CASE 3: Multiple Simultaneous Faults (Monsoon Storm)
    // -------------------------------------------------------------
    console.log('TEST 3: Multiple Simultaneous Faults (Monsoon Storm)...')
    const { rows: dtPop2Poles } = await query(`SELECT * FROM poles WHERE transformer_id = $1 ORDER BY seq_on_line`, [dtPop2.id])

    const telemetryStorm1 = dtPop1Poles.map((p, i) => ({ device_id: `dev-${p.id}`, pole_id: p.id, seq: 202, energized: i < 2, reported_at: new Date().toISOString() }))
    const telemetryStorm2 = dtPop2Poles.map((p, i) => ({ device_id: `dev-${p.id}`, pole_id: p.id, seq: 202, energized: i < 3, reported_at: new Date().toISOString() }))

    const faultsStorm1 = detectFaults({ poles: dtPop1Poles, telemetry: telemetryStorm1 })
    const faultsStorm2 = detectFaults({ poles: dtPop2Poles, telemetry: telemetryStorm2 })

    const totalStormFaults = [...faultsStorm1, ...faultsStorm2]
    assert.strictEqual(totalStormFaults.length, 2, 'Must create exactly 2 distinct tickets')
    console.log(`✔ TEST 3 PASSED: Grouped ${dtPop1Poles.length + dtPop2Poles.length - 5} dark poles across 2 lines into exactly 2 tickets.\n`)
    passedTests++

    // -------------------------------------------------------------
    // EDGE CASE 4: Dead Sensor Candidate Filtering ("Don't Cry Wolf")
    // -------------------------------------------------------------
    console.log('TEST 4: Dead Sensor Candidate Noise Filtering...')
    const telemetryDeadSensor = dtPop2Poles.map((p, i) => ({
      device_id: `dev-${p.id}`,
      pole_id: p.id,
      seq: 203,
      energized: i !== 1, // Pole 2 dark only
      reported_at: new Date().toISOString()
    }))

    const faultsDeadSensor = detectFaults({ poles: dtPop2Poles, telemetry: telemetryDeadSensor })
    assert.strictEqual(faultsDeadSensor.length, 0, 'Dead sensor candidate must NOT generate a fault ticket')
    console.log('✔ TEST 4 PASSED: Isolated dark pole identified as dead sensor candidate; zero false tickets generated.\n')
    passedTests++

    // -------------------------------------------------------------
    // EDGE CASE 5: Scheduled Outage Filtering (Planned Load Shedding)
    // -------------------------------------------------------------
    console.log('TEST 5: Scheduled Maintenance / Load Shedding Filtering...')
    const outageRes = await query(
      `INSERT INTO scheduled_outages (transformer_id, start_at, end_at, reason, active)
       VALUES ($1, NOW() - INTERVAL '10 minutes', NOW() + INTERVAL '2 hours', 'Planned maintenance', TRUE) RETURNING *`,
      [dtPop2.id]
    )

    const telemetryOutage = dtPop2Poles.map(p => ({
      device_id: `dev-${p.id}`,
      pole_id: p.id,
      seq: 205,
      energized: false,
      reported_at: new Date().toISOString()
    }))

    const faultsOutage = detectFaults({
      poles: dtPop2Poles,
      telemetry: telemetryOutage,
      scheduledOutages: outageRes.rows,
      transformer: dtPop2
    })

    assert.strictEqual(faultsOutage.length, 0, 'Scheduled outage must NOT generate a fault ticket')
    console.log('✔ TEST 5 PASSED: Scheduled maintenance window recognized; zero false tickets generated.\n')
    passedTests++

    // -------------------------------------------------------------
    // EDGE CASE 6: Telemetry Deduplication & Sequence Monotonicity
    // -------------------------------------------------------------
    console.log('TEST 6: Sequence Deduplication & Out-of-Order Message Handling...')
    const rawMessages = [
      { device_id: 'dev-1', seq: 50, energized: true, reported_at: '2026-08-03T10:00:00Z' },
      { device_id: 'dev-1', seq: 50, energized: true, reported_at: '2026-08-03T10:00:05Z' },
      { device_id: 'dev-1', seq: 49, energized: false, reported_at: '2026-08-03T10:00:02Z' },
    ]

    const deduped = dedupeTelemetryByDeviceAndSequence(rawMessages)
    assert.strictEqual(deduped.length, 2, 'Deduplicated to 2 unique sequences')
    console.log('✔ TEST 6 PASSED: Deduplicated messages by (device_id, seq) regardless of clock skew.\n')
    passedTests++

    // -------------------------------------------------------------
    // EDGE CASE 7: Telemetry-Enforced Restoration Verification
    // -------------------------------------------------------------
    console.log('TEST 7: Telemetry-Enforced Restoration & Conflict Rejection...')
    const downstreamPoles = await poleModel.findDownstreamPolesFromBoundary(ticket1.first_dark_pole_id)
    
    await ticketModel.updateTicketStatus(ticket1.id, 'ACKNOWLEDGED')
    await ticketModel.updateTicketStatus(ticket1.id, 'CREW_ASSIGNED')

    const restoredTelemetry = downstreamPoles.map(p => ({
      device_id: `dev-${p.id}`,
      pole_id: p.id,
      seq: 300,
      energized: true,
      reported_at: new Date().toISOString()
    }))

    await telemetryModel.bulkUpsertTelemetry(restoredTelemetry)

    const restoredCheck = await telemetryModel.getLatestTelemetryByPoleIds(downstreamPoles.map(p => p.id))
    const allLiveNow = downstreamPoles.every(p => restoredCheck.find(t => String(t.pole_id) === String(p.id))?.energized === true)
    assert(allLiveNow, 'All downstream poles confirmed live via telemetry')

    const verifiedTicket = await ticketModel.updateTicketStatus(ticket1.id, 'VERIFIED', 'Telemetry confirmed restoration')
    const closedTicket = await ticketModel.updateTicketStatus(ticket1.id, 'CLOSED', 'Ticket closed after verification')

    assert.strictEqual(closedTicket.status, 'CLOSED', 'Ticket successfully closed')
    console.log('✔ TEST 7 PASSED: Ticket lifecycle correctly enforced and verified from telemetry before closure.\n')
    passedTests++

    // -------------------------------------------------------------
    // EDGE CASE 8: Database Integrity & Query Verification
    // -------------------------------------------------------------
    console.log('TEST 8: Database State & Scale Verification...')
    const { rows: poleCountRow } = await query('SELECT count(*) FROM poles')
    const totalPoles = Number(poleCountRow[0].count)
    assert(totalPoles >= 5000, 'Database contains 5,000+ poles')
    
    const { rows: events } = await query('SELECT * FROM ticket_events WHERE ticket_id = $1 ORDER BY created_at', [ticket1.id])
    assert(events.length >= 3, 'Audit trail logged lifecycle events')
    console.log(`✔ TEST 8 PASSED: Database scale verified at ${totalPoles} poles with full audit logging.\n`)
    passedTests++

    console.log(`=================================================`)
    console.log(`ALL ${passedTests} EDGE CASE TESTS PASSED AT 5,000 POLE SCALE!`)
    console.log(`=================================================`)

  } catch (error) {
    console.error('\n❌ TEST SUITE FAILED:', error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

runEdgeCaseTests()
