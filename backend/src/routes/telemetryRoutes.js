const express = require('express')
const { getTelemetryHealth, ingestTelemetry } = require('../controllers/telemetryController')

const router = express.Router()

router.get('/health', getTelemetryHealth)
router.post('/ingest', ingestTelemetry)

module.exports = router