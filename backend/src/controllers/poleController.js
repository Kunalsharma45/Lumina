const { query } = require('../config/database')

async function listPoles(req, res, next) {
  try {
    const limit = Math.min(Number(req.query.limit) || 10000, 10000)
    const { rows } = await query(
      `
        SELECT
          p.id, p.pole_code, p.transformer_id, p.latitude, p.longitude, p.seq_on_line,
          COALESCE(t.energized, true) AS energized
        FROM poles p
        LEFT JOIN LATERAL (
          SELECT energized FROM telemetry WHERE pole_id = p.id ORDER BY seq DESC, reported_at DESC LIMIT 1
        ) t ON true
        ORDER BY p.id
        LIMIT $1
      `,
      [limit],
    )
    const { rows: countRows } = await query(`SELECT count(*) FROM poles`)

    res.json({
      total: Number(countRows[0].count),
      poles: rows,
    })
  } catch (error) {
    next(error)
  }
}

module.exports = {
  listPoles,
}
