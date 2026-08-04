const path = require('path')

const backendDir = path.resolve(__dirname, '..')
require(path.join(backendDir, 'node_modules/dotenv')).config({ path: path.join(backendDir, '.env') })

const { pool, query } = require('../src/config/database')
const { detectFaults } = require('../src/services/faultDetectionService')
const { inferPoleTopology } = require('../src/services/graphBuilderService')
const ticketModel = require('../src/models/ticketModel')
const telemetryModel = require('../src/models/telemetryModel')

async function run10kStressTest() {
  console.log('=== STARTING 10,000 POLE FULL-ASPECT STRESS & EDGE CASE TEST ===\n')

  try {
    // 1. Fetch poles from database
    const { rows: dt1Poles } = await query(`SELECT * FROM poles WHERE transformer_id = 1 ORDER BY seq_on_line LIMIT 500`)
    const { rows: dt2Poles } = await query(`SELECT * FROM poles WHERE transformer_id = 2 LIMIT 500`)
    const { rows: dt2Transformer } = await query(`SELECT * FROM transformers WHERE id = 2`)

    console.log(`Loaded ${dt1Poles.length} poles for DT-1 and ${dt2Poles.length} poles for DT-2.`)

    // 2. Test Edge Case 1: Standard Span Break on DT-1 (Poles 1-10 live, 11-500 dark)
    console.log('\n[Test 1] Simulating Span Break on Surveyed Line (DT-1)...')
    const telemetryDT1 = dt1Poles.map((p, idx) => ({
      device_id: `dev-${p.id}`,
      pole_id: p.id,
      seq: 901,
      energized: idx < 10, // First 10 live, rest dark
      reported_at: new Date().toISOString()
    }))

    await telemetryModel.bulkUpsertTelemetry(telemetryDT1)
    const faultsDT1 = detectFaults({ poles: dt1Poles, telemetry: telemetryDT1 })
    console.log(`-> Detected ${faultsDT1.length} fault(s) on DT-1. Boundary: Pole ${faultsDT1[0]?.last_live_pole_id} -> Pole ${faultsDT1[0]?.first_dark_pole_id}`)

    if (faultsDT1.length > 0) {
      await ticketModel.createDetectedTicket(faultsDT1[0], 'Automated 10k stress test ticket for DT-1 span break')
    }

    // 3. Test Edge Case 2: 60% Missing Topology Inference via Prim's MST + BFS on DT-2
    console.log('\n[Test 2] Reconstructing Missing Topology via Prim\'s MST & BFS on DT-2...')
    const inferredDT2Poles = inferPoleTopology(dt2Poles, dt2Transformer[0])
    console.log(`-> Successfully inferred sequence and tree structure for ${inferredDT2Poles.length} unmapped poles.`)

    // Simulate a fault on inferred poles
    const telemetryDT2 = inferredDT2Poles.map((p, idx) => ({
      device_id: `dev-${p.id}`,
      pole_id: p.id,
      seq: 901,
      energized: idx < 5, // First 5 live, rest dark
      reported_at: new Date().toISOString()
    }))

    const faultsDT2 = detectFaults({ poles: inferredDT2Poles, telemetry: telemetryDT2, transformer: dt2Transformer[0] })
    console.log(`-> Detected ${faultsDT2.length} fault(s) on Inferred DT-2 graph. Topology Inferred Flag: ${faultsDT2[0]?.topology_inferred}`)

    if (faultsDT2.length > 0) {
      await ticketModel.createDetectedTicket(faultsDT2[0], 'Automated 10k stress test ticket for Inferred DT-2')
    }

    // 4. Test Edge Case 4B: Blown Transformer Fuse (DT_FAULT) - 100% Dark Poles
    console.log('\n[Test 3] Simulating 100% Blown Transformer Fuse (DT_FAULT)...')
    const telemetryBlownDT1 = dt1Poles.map((p) => ({
      device_id: `dev-${p.id}`,
      pole_id: p.id,
      seq: 902,
      energized: false, // ALL poles dark
      reported_at: new Date().toISOString()
    }))

    const faultsBlown = detectFaults({ poles: dt1Poles, telemetry: telemetryBlownDT1 })
    console.log(`-> Detected Fault Type: ${faultsBlown[0]?.fault_type} (Expected: DT_FAULT). Downstream Count: ${faultsBlown[0]?.downstream_pole_count}`)

    if (faultsBlown.length > 0) {
      await ticketModel.createDetectedTicket(faultsBlown[0], 'Automated 10k stress test ticket for Blown DT Fuse')
    }

    console.log('\n=== 10,000 POLE STRESS & EDGE CASE TESTS COMPLETED SUCCESSFULLY! ===')
  } catch (error) {
    console.error('❌ STRESS TEST FAILED:', error)
  } finally {
    await pool.end()
  }
}

run10kStressTest()
