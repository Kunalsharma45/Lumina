const { query, transaction } = require('../config/database')

function buildBulkInsert(records) {
  const values = []
  const placeholders = records.map((record, index) => {
    const offset = index * 6
    values.push(
      record.device_id,
      record.pole_id,
      record.seq,
      record.energized,
      record.reported_at,
      JSON.stringify(record.raw_payload || record.rawPayload || record),
    )

    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}::jsonb)`
  })

  return {
    text: `
      INSERT INTO telemetry (device_id, pole_id, seq, energized, reported_at, raw_payload)
      VALUES ${placeholders.join(', ')}
      ON CONFLICT (device_id, seq) DO UPDATE SET
        pole_id = EXCLUDED.pole_id,
        energized = EXCLUDED.energized,
        reported_at = EXCLUDED.reported_at,
        raw_payload = EXCLUDED.raw_payload
      RETURNING *
    `,
    values,
  }
}

async function bulkUpsertTelemetry(records) {
  if (!records.length) {
    return []
  }

  const inserted = []
  const chunkSize = 500

  await transaction(async (client) => {
    for (let index = 0; index < records.length; index += chunkSize) {
      const chunk = records.slice(index, index + chunkSize)
      const { text, values } = buildBulkInsert(chunk)
      const { rows } = await client.query(text, values)
      inserted.push(...rows)
    }
  })

  return inserted
}

async function getLatestTelemetryByPoleIds(poleIds = []) {
  if (!poleIds.length) {
    return []
  }

  const { rows } = await query(
    `
      SELECT DISTINCT ON (pole_id)
        *
      FROM telemetry
      WHERE pole_id = ANY($1::bigint[])
      ORDER BY pole_id, seq DESC, ingested_at DESC
    `,
    [poleIds],
  )

  return rows
}

module.exports = {
  bulkUpsertTelemetry,
  getLatestTelemetryByPoleIds,
}