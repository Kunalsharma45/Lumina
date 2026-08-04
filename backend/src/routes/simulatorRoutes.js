const express = require('express')
const {
  createMockOutage,
  createScenario,
  injectFault,
  injectSpanFault,
  repairFault,
  seedSyntheticGrid,
} = require('../controllers/simulatorController')
const { listScheduledOutages } = require('../controllers/outageController')

const router = express.Router()

router.post('/seed', seedSyntheticGrid)
router.post('/scenario', createScenario)
router.post('/inject-fault', injectFault)
router.post('/inject-span-fault', injectSpanFault)
router.post('/repair-fault', repairFault)
router.get('/outages', listScheduledOutages)
router.post('/outages', createMockOutage)

module.exports = router