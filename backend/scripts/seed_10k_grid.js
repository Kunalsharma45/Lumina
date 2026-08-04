const path = require('path')
const backendDir = path.resolve(__dirname, '..')

require(path.join(backendDir, 'node_modules/dotenv')).config({ path: path.join(backendDir, '.env') })
const { pool, query } = require(path.join(backendDir, 'src/config/database'))

async function seed10kGrid() {
  console.log('=== SEEDING 10,000 POLE GRID DATASET INTO POSTGRESQL ===\n')

  try {
    console.log('1. Wiping old database records...')
    await query('TRUNCATE TABLE substations, feeders, transformers, poles, telemetry, scheduled_outages, tickets, ticket_events RESTART IDENTITY CASCADE;')

    console.log('2. Creating Substation...')
    await query(`
      INSERT INTO substations (id, name, code, pin_code, latitude, longitude)
      VALUES (1, 'Central Substation', 'SUB-CENTRAL-01', '560001', 12.9716, 77.5946);
    `)

    console.log('3. Creating Feeder...')
    await query(`
      INSERT INTO feeders (id, substation_id, name, code)
      VALUES (1, 1, 'MG Road 11kV Feeder', 'FDR-MGR-01');
    `)

    console.log('4. Creating Transformers (Alpha: Explicit vs Beta: Missing Topology)...')
    await query(`
      INSERT INTO transformers (id, feeder_id, name, code, pin_code, latitude, longitude, topology_inferred)
      VALUES (1, 1, 'Distribution Transformer Alpha', 'DT-ALPHA-01', '560001', 12.9720, 77.5950, FALSE);

      INSERT INTO transformers (id, feeder_id, name, code, pin_code, latitude, longitude, topology_inferred)
      VALUES (2, 1, 'Distribution Transformer Beta (Unmapped)', 'DT-BETA-02', '560002', 12.9800, 77.6000, TRUE);
    `)

    console.log('5. Generating 10,000 Poles via SQL generate_series...')
    await query(`
      INSERT INTO poles (transformer_id, pole_code, pin_code, latitude, longitude, seq_on_line, topology_inferred, is_active)
      SELECT 
          CASE WHEN g <= 5000 THEN 1 ELSE 2 END AS transformer_id,
          'POLE-' || LPAD(g::TEXT, 5, '0') AS pole_code,
          CASE WHEN g % 33 = 0 THEN NULL ELSE '5600' || (g % 5) END AS pin_code,
          12.9716 + (g * 0.0001) AS latitude,
          77.5946 + (g * 0.0001) AS longitude,
          CASE WHEN g <= 5000 THEN g ELSE NULL END AS seq_on_line,
          CASE WHEN g <= 5000 THEN FALSE ELSE TRUE END AS topology_inferred,
          TRUE AS is_active
      FROM generate_series(1, 10000) AS g;
    `)

    console.log('6. Inserting Scheduled Maintenance Outage...')
    await query(`
      INSERT INTO scheduled_outages (feeder_id, transformer_id, start_at, end_at, reason, active)
      VALUES (1, NULL, NOW() - INTERVAL '1 hour', NOW() + INTERVAL '2 hours', 'Emergency Feeder Maintenance Window', TRUE);
    `)

    const { rows: countRows } = await query('SELECT count(*) FROM poles')
    console.log(`\n✔ SUCCESSFULLY SEEDED ${countRows[0].count} POLES IN POSTGRESQL!`)

  } catch (error) {
    console.error('❌ SEEDING FAILED:', error)
  } finally {
    await pool.end()
  }
}

seed10kGrid()
