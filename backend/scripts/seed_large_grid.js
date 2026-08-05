const path = require('path')
const backendDir = path.resolve(__dirname, '..')

require(path.join(backendDir, 'node_modules/dotenv')).config({ path: path.join(backendDir, '.env') })
const { pool, query } = require(path.join(backendDir, 'src/config/database'))

async function seedLargeGrid() {
  console.log('=== STARTING PRODUCTION MASSIVE SCALE GRID DATA SEEDING (38,400 POLES) ===')
  const startTime = Date.now()

  try {
    console.log('1. Clearing existing database records...')
    await query('TRUNCATE ticket_events, tickets, scheduled_outages, telemetry, poles, transformers, feeders, substations RESTART IDENTITY CASCADE;')

    const baseLat = 12.9716
    const baseLng = 77.5946

    console.log('2. Inserting 4 Substations...')
    const substations = []
    for (let i = 1; i <= 4; i++) {
      const { rows } = await query(
        `INSERT INTO substations (name, code, pin_code, latitude, longitude)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [`Central Substation-${i}`, `SS-${i}`, `56000${i}`, baseLat + (i * 0.015), baseLng + (i * 0.015)]
      )
      substations.push(rows[0])
    }

    console.log('3. Inserting 31 Feeders...')
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

    console.log('4. Bulk inserting 412 Distribution Transformers (DTs)...')
    const transformers = []
    const dtValues = []
    const dtParams = []
    let dtParamIdx = 1

    for (let i = 0; i < 412; i++) {
      const feeder = feeders[i % feeders.length]
      const isMissingTopology = i >= 165 // 60% missing topology case
      const dtLat = baseLat + (Math.floor(i / 20) * 0.004)
      const dtLng = baseLng + ((i % 20) * 0.004)
      const pinCode = (i % 33 === 0) ? null : `5600${10 + (i % 80)}` // 3% missing PIN code edge case

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
    console.log(`   Successfully created ${transformers.length} Distribution Transformers!`)

    console.log('5. Bulk inserting 38,400 Poles in 1,000-record batch chunks...')
    const totalPolesTarget = 38400
    const polesPerDT = Math.ceil(totalPolesTarget / transformers.length) // ~93 poles per DT
    const poleValues = []

    for (let tIdx = 0; tIdx < transformers.length; tIdx++) {
      const dt = transformers[tIdx]
      const isMissingTopology = dt.topology_inferred
      const angle = (tIdx * 17) * (Math.PI / 180) // Radial angle distribution

      for (let pSeq = 1; pSeq <= polesPerDT; pSeq++) {
        if (poleValues.length >= totalPolesTarget) break

        const pLat = dt.latitude + (Math.cos(angle) * pSeq * 0.00006)
        const pLng = dt.longitude + (Math.sin(angle) * pSeq * 0.00006)
        const code = `P-${dt.code}-${String(pSeq).padStart(3, '0')}`
        const polePinCode = (pSeq % 33 === 0) ? null : dt.pin_code // 3% missing PIN code simulation

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
         VALUES ${valueTuples.join(', ')}
         RETURNING id, transformer_id, pole_code, seq_on_line`,
        params
      )
      insertedPoles.push(...rows)
      if (insertedPoles.length % 5000 === 0 || insertedPoles.length === poleValues.length) {
        console.log(`   Progress: inserted ${insertedPoles.length.toLocaleString()} / ${poleValues.length.toLocaleString()} poles`)
      }
    }

    console.log('6. Bulk inserting baseline live telemetry records (all energized)...')
    for (let i = 0; i < insertedPoles.length; i += chunkSize) {
      const chunk = insertedPoles.slice(i, i + chunkSize)
      const valueTuples = []
      const params = []
      let paramIdx = 1
      const now = new Date().toISOString()

      for (const p of chunk) {
        const seqVal = p.seq_on_line || 1
        valueTuples.push(`($${paramIdx}, $${paramIdx+1}, $${paramIdx+2}, $${paramIdx+3}, $${paramIdx+4})`)
        params.push(`dev-${p.id}`, p.id, seqVal, true, now)
        paramIdx += 5
      }

      await query(
        `INSERT INTO telemetry (device_id, pole_id, seq, energized, reported_at)
         VALUES ${valueTuples.join(', ')}
         ON CONFLICT (device_id, seq) DO NOTHING`,
        params
      )
    }

    console.log('7. Inserting default active maintenance outage for testing...')
    await query(`
      INSERT INTO scheduled_outages (feeder_id, transformer_id, start_at, end_at, reason, active)
      VALUES (1, NULL, NOW() - INTERVAL '1 hour', NOW() + INTERVAL '2 hours', 'Emergency Feeder Maintenance Window', TRUE);
    `)

    const durationSec = ((Date.now() - startTime) / 1000).toFixed(2)
    console.log(`\n=================================================================`)
    console.log(`✔ MASSIVE SCALE SEEDING COMPLETED IN ${durationSec}s!`)
    console.log(`- Substations: 4`)
    console.log(`- Feeders: 31`)
    console.log(`- Distribution Transformers: 412`)
    console.log(`- Monitored LT Poles: ${insertedPoles.length.toLocaleString()}`)
    console.log(`- Total Grid Asset Nodes: ${(4 + 31 + 412 + insertedPoles.length).toLocaleString()}`)
    console.log(`=================================================================\n`)

  } catch (error) {
    console.error('❌ SEEDING FAILED:', error)
  } finally {
    await pool.end()
  }
}

seedLargeGrid()
