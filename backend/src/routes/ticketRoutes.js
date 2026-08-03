const express = require('express')
const {
  acknowledgeTicket,
  assignTicket,
  closeTicket,
  getTicketById,
  listTickets,
  resolveTicket,
  verifyTicket,
} = require('../controllers/ticketController')

const router = express.Router()

router.get('/', listTickets)
router.get('/:id', getTicketById)
router.patch('/:id/acknowledge', acknowledgeTicket)
router.patch('/:id/assign', assignTicket)
router.patch('/:id/resolve', resolveTicket)
router.patch('/:id/verify', verifyTicket)
router.patch('/:id/close', closeTicket)

module.exports = router