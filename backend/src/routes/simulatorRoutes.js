const express = require('express')
const {
  createMockOutage,
  createScenario,
  injectFault,
  seedSyntheticGrid,
} = require('../controllers/simulatorController')
const { listScheduledOutages } = require('../controllers/outageController')

const router = express.Router()

router.post('/seed', seedSyntheticGrid)
router.post('/scenario', createScenario)
router.post('/inject-fault', injectFault)
router.get('/outages', listScheduledOutages)
router.post('/outages', createMockOutage)

module.exports = router