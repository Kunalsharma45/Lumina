const { query } = require('../config/database')

async function findPolesByIds(poleIds = []) {
  if (!poleIds.length) {
    return []
  }

  const { rows } = await query(
    `
      SELECT
        p.*,
        t.id AS transformer_id,
        t.name AS transformer_name,
        t.code AS transformer_code,
        t.latitude AS transformer_latitude,
        t.longitude AS transformer_longitude,
        t.pin_code AS transformer_pin_code,
        t.seq_on_line AS transformer_seq_on_line,
        t.parent_pole_id AS transformer_parent_pole_id,
        t.topology_inferred AS transformer_topology_inferred,
        t.feeder_id AS feeder_id
      FROM poles p
      JOIN transformers t ON t.id = p.transformer_id
      WHERE p.id = ANY($1::bigint[])
    `,
    [poleIds],
  )

  return rows.map((row) => ({
    ...row,
    transformer: {
      id: row.transformer_id,
      name: row.transformer_name,
      code: row.transformer_code,
      latitude: row.transformer_latitude,
      longitude: row.transformer_longitude,
      pin_code: row.transformer_pin_code,
      seq_on_line: row.transformer_seq_on_line,
      parent_pole_id: row.transformer_parent_pole_id,
      topology_inferred: row.transformer_topology_inferred,
      feeder_id: row.feeder_id,
    },
  }))
}

async function findPolesByTransformerIds(transformerIds = []) {
  if (!transformerIds.length) {
    return []
  }

  const { rows } = await query(
    `
      SELECT
        p.*,
        t.id AS transformer_id,
        t.name AS transformer_name,
        t.code AS transformer_code,
        t.latitude AS transformer_latitude,
        t.longitude AS transformer_longitude,
        t.pin_code AS transformer_pin_code,
        t.seq_on_line AS transformer_seq_on_line,
        t.parent_pole_id AS transformer_parent_pole_id,
        t.topology_inferred AS transformer_topology_inferred,
        t.feeder_id AS feeder_id
      FROM poles p
      JOIN transformers t ON t.id = p.transformer_id
      WHERE t.id = ANY($1::bigint[])
      ORDER BY t.id, COALESCE(p.seq_on_line, 2147483647), p.id
    `,
    [transformerIds],
  )

  return rows.map((row) => ({
    ...row,
    transformer: {
      id: row.transformer_id,
      name: row.transformer_name,
      code: row.transformer_code,
      latitude: row.transformer_latitude,
      longitude: row.transformer_longitude,
      pin_code: row.transformer_pin_code,
      seq_on_line: row.transformer_seq_on_line,
      parent_pole_id: row.transformer_parent_pole_id,
      topology_inferred: row.transformer_topology_inferred,
      feeder_id: row.feeder_id,
    },
  }))
}

async function findDownstreamPolesFromBoundary(firstDarkPoleId) {
  const { rows: boundaryRows } = await query(
    `
      SELECT id, transformer_id, seq_on_line
      FROM poles
      WHERE id = $1
    `,
    [firstDarkPoleId],
  )

  const boundary = boundaryRows[0]
  if (!boundary) {
    return []
  }

  const { rows } = await query(
    `
      SELECT *
      FROM poles
      WHERE transformer_id = $1 AND COALESCE(seq_on_line, 2147483647) >= COALESCE($2, 1)
      ORDER BY COALESCE(seq_on_line, 2147483647), id
    `,
    [boundary.transformer_id, boundary.seq_on_line],
  )

  return rows
}

module.exports = {
  findDownstreamPolesFromBoundary,
  findPolesByIds,
  findPolesByTransformerIds,
}