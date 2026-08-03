const { query } = require('../config/database')

async function listScheduledOutages(req, res, next) {
  try {
    const { rows } = await query(
      `
        SELECT *
        FROM scheduled_outages
        WHERE active = TRUE
        ORDER BY start_at DESC
      `,
    )

    res.json({ outages: rows })
  } catch (error) {
    next(error)
  }
}

async function createScheduledOutage(req, res, next) {
  try {
    const { feeder_id = null, transformer_id = null, start_at, end_at = null, reason = 'Scheduled maintenance' } = req.body || {}

    const { rows } = await query(
      `
        INSERT INTO scheduled_outages (feeder_id, transformer_id, start_at, end_at, reason, active)
        VALUES ($1, $2, $3, $4, $5, TRUE)
        RETURNING *
      `,
      [feeder_id, transformer_id, start_at, end_at, reason],
    )

    res.status(201).json({ outage: rows[0] })
  } catch (error) {
    next(error)
  }
}

async function fetchRelevantScheduledOutages({ transformerIds = [], feederIds = [] } = {}) {
  if (!transformerIds.length && !feederIds.length) {
    return []
  }

  const { rows } = await query(
    `
      SELECT *
      FROM scheduled_outages
      WHERE active = TRUE
        AND (
          (transformer_id = ANY($1::bigint[]))
          OR (feeder_id = ANY($2::bigint[]))
        )
    `,
    [transformerIds, feederIds],
  )

  return rows
}

module.exports = {
  createScheduledOutage,
  fetchRelevantScheduledOutages,
  listScheduledOutages,
}