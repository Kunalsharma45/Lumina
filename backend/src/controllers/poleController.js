const { query } = require('../config/database')

async function listPoles(req, res, next) {
  try {
    const limit = Math.min(Number(req.query.limit) || 10000, 38400)
    const offset = Math.max(Number(req.query.offset) || 0, 0)
    const { minLat, maxLat, minLng, maxLng } = req.query

    let whereClause = ''
    const params = []

    if (minLat && maxLat && minLng && maxLng) {
      whereClause = 'WHERE p.latitude BETWEEN $1 AND $2 AND p.longitude BETWEEN $3 AND $4'
      params.push(Number(minLat), Number(maxLat), Number(minLng), Number(maxLng))
    }

    params.push(limit, offset)
    const limitParamIdx = params.length - 1
    const offsetParamIdx = params.length

    const { rows } = await query(
      `
        SELECT
          p.id, p.pole_code, p.transformer_id, p.latitude, p.longitude, p.seq_on_line,
          COALESCE(t.energized, true) AS energized
        FROM poles p
        LEFT JOIN LATERAL (
          SELECT energized FROM telemetry WHERE pole_id = p.id ORDER BY seq DESC, reported_at DESC LIMIT 1
        ) t ON true
        ${whereClause}
        ORDER BY p.id
        LIMIT $${limitParamIdx} OFFSET $${offsetParamIdx}
      `,
      params,
    )
    const { rows: countRows } = await query(`SELECT count(*) FROM poles`)

    res.json({
      total: Number(countRows[0].count),
      returned: rows.length,
      limit,
      offset,
      poles: rows,
    })
  } catch (error) {
    next(error)
  }
}

module.exports = {
  listPoles,
}
