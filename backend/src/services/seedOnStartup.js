/**
 * Startup Seed Guard
 *
 * Called once at server boot. Checks if the `poles` table is empty (i.e. fresh
 * container or wiped database). If empty, runs the full 38,400-pole grid seed
 * automatically so the operator console is populated on the very first page load
 * — satisfying acceptance gate G3: "The database must be seeded on first run."
 *
 * This is safe to call on every restart:
 *   - If poles > 0  → skips immediately (no-op)
 *   - If poles == 0 → seeds the full grid and baseline telemetry
 */

const { query } = require('../config/database')

async function seedIfEmpty() {
  const { rows } = await query('SELECT COUNT(*) AS total FROM poles')
  const total = Number(rows[0]?.total || 0)

  if (total > 0) {
    console.log(`[AutoSeed] Database already contains ${total.toLocaleString()} poles — skipping seed`)
    return
  }

  console.log('[AutoSeed] Database is empty — running full 38,400-pole grid seed automatically...')

  const startTime = Date.now()

  const baseLat = 12.9716
  const baseLng = 77.5946

  // ── 1. Substations ────────────────────────────────────────────────────────
  const substations = []
  for (let i = 1; i <= 4; i++) {
    const { rows: ss } = await query(
      `INSERT INTO substations (name, code, pin_code, latitude, longitude)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [`Central Substation-${i}`, `SS-${i}`, `56000${i}`, baseLat + i * 0.015, baseLng + i * 0.015],
    )
    substations.push(ss[0])
  }

  // ── 2. Feeders ─────────────────────────────────────────────────────────────
  const feeders = []
  for (let i = 0; i < 31; i++) {
    const ss = substations[i % substations.length]
    const { rows: f } = await query(
      `INSERT INTO feeders (substation_id, name, code) VALUES ($1, $2, $3) RETURNING *`,
      [ss.id, `Feeder-F${i + 1}`, `F${i + 1}`],
    )
    feeders.push(f[0])
  }

  // ── 3. Transformers (412 DTs, 60% missing topology) ───────────────────────
  const dtValues = []
  const dtParams = []
  let dtParamIdx = 1

  for (let i = 0; i < 412; i++) {
    const feeder = feeders[i % feeders.length]
    const isMissingTopology = i >= 165
    const dtLat = baseLat + Math.floor(i / 20) * 0.004
    const dtLng = baseLng + (i % 20) * 0.004
    const pinCode = i % 33 === 0 ? null : `5600${10 + (i % 80)}`

    dtValues.push(
      `($${dtParamIdx}, $${dtParamIdx + 1}, $${dtParamIdx + 2}, $${dtParamIdx + 3}, $${dtParamIdx + 4}, $${dtParamIdx + 5}, $${dtParamIdx + 6}, $${dtParamIdx + 7}, $${dtParamIdx + 8})`,
    )
    dtParams.push(
      feeder.id,
      `DT-${feeder.code}-${i + 1}`,
      `DT-${feeder.code}-${i + 1}`,
      pinCode,
      dtLat,
      dtLng,
      isMissingTopology ? null : 1,
      null,
      isMissingTopology,
    )
    dtParamIdx += 9
  }

  const { rows: transformers } = await query(
    `INSERT INTO transformers (feeder_id, name, code, pin_code, latitude, longitude, seq_on_line, parent_pole_id, topology_inferred)
     VALUES ${dtValues.join(', ')} RETURNING *`,
    dtParams,
  )

  // ── 4. Poles (38,400 total in 1,000-record chunks) ─────────────────────────
  const totalPolesTarget = 38400
  const polesPerDT = Math.ceil(totalPolesTarget / transformers.length)
  const poleValues = []

  for (let tIdx = 0; tIdx < transformers.length; tIdx++) {
    const dt = transformers[tIdx]
    const isMissingTopology = dt.topology_inferred
    const angle = (tIdx * 17 * Math.PI) / 180

    for (let pSeq = 1; pSeq <= polesPerDT; pSeq++) {
      if (poleValues.length >= totalPolesTarget) break

      const pLat = dt.latitude + Math.cos(angle) * pSeq * 0.00006
      const pLng = dt.longitude + Math.sin(angle) * pSeq * 0.00006
      const code = `P-${dt.code}-${String(pSeq).padStart(3, '0')}`
      const polePinCode = pSeq % 33 === 0 ? null : dt.pin_code

      poleValues.push({
        transformer_id: dt.id,
        pole_code: code,
        pin_code: polePinCode,
        latitude: pLat,
        longitude: pLng,
        seq_on_line: isMissingTopology ? null : pSeq,
        parent_pole_id: null,
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
      valueTuples.push(
        `($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5}, $${paramIdx + 6})`,
      )
      params.push(p.transformer_id, p.pole_code, p.pin_code, p.latitude, p.longitude, p.seq_on_line, p.parent_pole_id)
      paramIdx += 7
    }

    const { rows } = await query(
      `INSERT INTO poles (transformer_id, pole_code, pin_code, latitude, longitude, seq_on_line, parent_pole_id)
       VALUES ${valueTuples.join(', ')}
       RETURNING id, transformer_id, pole_code, seq_on_line`,
      params,
    )
    insertedPoles.push(...rows)
  }

  // ── 5. Baseline live telemetry (all energized = true) ──────────────────────
  for (let i = 0; i < insertedPoles.length; i += chunkSize) {
    const chunk = insertedPoles.slice(i, i + chunkSize)
    const valueTuples = []
    const params = []
    let paramIdx = 1
    const now = new Date().toISOString()

    for (const p of chunk) {
      const seqVal = p.seq_on_line || 1
      valueTuples.push(`($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4})`)
      params.push(`dev-${p.id}`, p.id, seqVal, true, now)
      paramIdx += 5
    }

    await query(
      `INSERT INTO telemetry (device_id, pole_id, seq, energized, reported_at)
       VALUES ${valueTuples.join(', ')}
       ON CONFLICT (device_id, seq) DO NOTHING`,
      params,
    )
  }

  // ── 6. Default scheduled outage for testing ────────────────────────────────
  await query(`
    INSERT INTO scheduled_outages (feeder_id, transformer_id, start_at, end_at, reason, active)
    VALUES (1, NULL, NOW() - INTERVAL '1 hour', NOW() + INTERVAL '2 hours', 'Emergency Feeder Maintenance Window', TRUE)
    ON CONFLICT DO NOTHING
  `)

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2)
  console.log(`[AutoSeed] ✔ Seed complete in ${durationSec}s — ${insertedPoles.length.toLocaleString()} poles, 412 DTs, 31 Feeders, 4 Substations`)
}

module.exports = { seedIfEmpty }
