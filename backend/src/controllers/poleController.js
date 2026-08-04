const { query } = require('../config/database')

async function listPoles(req, res, next) {
  try {
    const limit = Math.min(Number(req.query.limit) || 1000, 5000)
    const { rows } = await query(
      `
        SELECT id, pole_code, transformer_id, latitude, longitude, seq_on_line
        FROM poles
        ORDER BY id
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
