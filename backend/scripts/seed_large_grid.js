const path = require('path')
const backendDir = path.resolve(__dirname, '..')

require(path.join(backendDir, 'node_modules/dotenv')).config({ path: path.join(backendDir, '.env') })
const { pool, query } = require(path.join(backendDir, 'src/config/database'))

async function seedLargeGrid() {
  console.log('--- Starting Large Scale Grid Data Seeding (5,000 Poles) ---')
  const startTime = Date.now()

  try {
    console.log('1. Clearing existing records...')
    await query('TRUNCATE ticket_events, tickets, scheduled_outages, telemetry, poles, transformers, feeders, substations RESTART IDENTITY CASCADE;')

    console.log('2. Inserting 4 Substations...')
    const substations = []
    const baseLat = 12.9716
    const baseLng = 77.5946

    for (let i = 1; i <= 4; i++) {
      const { rows } = await query(
        `INSERT INTO substations (name, code, pin_code, latitude, longitude)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [`Substation-${i}`, `SS-${i}`, `56000${i}`, baseLat + (i * 0.02), baseLng + (i * 0.02)]
      )
      substations.push(rows[0])
    }

    console.log('3. Inserting 20 Feeders...')
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

    console.log('4. Inserting 100 Distribution Transformers (DTs)...')
    const transformers = []
    for (let i = 0; i < 100; i++) {
      const feeder = feeders[i % feeders.length]
      const isMissingTopology = i >= 40 // 60% missing topology case
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

    console.log('5. Bulk inserting 10,000 Poles in batch chunks...')
    const totalPoles = 10000
    const polesPerDT = 100
    const poleValues = []

    for (let tIdx = 0; tIdx < transformers.length; tIdx++) {
      const dt = transformers[tIdx]
      const isMissingTopology = dt.topology_inferred

      for (let pSeq = 1; pSeq <= polesPerDT; pSeq++) {
        const pLat = dt.latitude + (pSeq * 0.0002)
        const pLng = dt.longitude + (pSeq * 0.0002)
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

      const queryText = `
        INSERT INTO poles (transformer_id, pole_code, pin_code, latitude, longitude, seq_on_line, parent_pole_id)
        VALUES ${valueTuples.join(', ')}
        RETURNING id, transformer_id, pole_code, seq_on_line
      `
      const { rows } = await query(queryText, params)
      insertedPoles.push(...rows)
      console.log(`   Progress: inserted ${insertedPoles.length} / ${totalPoles} poles`)
    }

    const polesByDT = new Map()
    for (const p of insertedPoles) {
      if (!polesByDT.has(p.transformer_id)) polesByDT.set(p.transformer_id, [])
      polesByDT.get(p.transformer_id).push(p)
    }

    for (const [dtId, pList] of polesByDT.entries()) {
      pList.sort((a, b) => a.id - b.id)
      for (let idx = 0; idx < pList.length; idx++) {
        const parentId = idx === 0 ? null : pList[idx - 1].id
        await query('UPDATE poles SET parent_pole_id = $1 WHERE id = $2', [parentId, pList[idx].id])
      }
    }

    console.log('6. Bulk inserting initial telemetry records (all live)...')
    const telemetryRecords = insertedPoles.map(p => ({
      device_id: `dev-${p.id}`,
      pole_id: p.id,
      seq: 100,
      energized: true,
      reported_at: new Date().toISOString()
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

    const duration = ((Date.now() - startTime) / 1000).toFixed(2)
    console.log(`Successfully seeded ${totalPoles} poles across ${transformers.length} Distribution Transformers!`)
    console.log(`--- Large Scale Seeding Completed Successfully in ${duration}s ---`)

  } catch (error) {
    console.error('Seeding Failed:', error)
  } finally {
    await pool.end()
  }
}

seedLargeGrid()
