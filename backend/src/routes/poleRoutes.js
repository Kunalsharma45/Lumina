const express = require('express')
const { listPoles } = require('../controllers/poleController')

const router = express.Router()

router.get('/', listPoles)

module.exports = router
