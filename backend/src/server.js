require('dotenv').config()

const express = require('express')
const cors = require('cors')

const telemetryRoutes = require('./routes/telemetryRoutes')
const ticketRoutes = require('./routes/ticketRoutes')
const simulatorRoutes = require('./routes/simulatorRoutes')
const poleRoutes = require('./routes/poleRoutes')

function createApp() {
  const app = express()

  app.use(cors())
  app.use(express.json({ limit: '50mb' }))
  app.use(express.urlencoded({ limit: '50mb', extended: true }))

  app.get('/', (req, res) => {
    res.json({ service: 'kspdb-backend', status: 'ok' })
  })

  app.use('/api/telemetry', telemetryRoutes)
  app.use('/api/tickets', ticketRoutes)
  app.use('/api/simulator', simulatorRoutes)
  app.use('/api/poles', poleRoutes)

  app.use((error, req, res, next) => {
    console.error(error)
    res.status(error.status || 500).json({ message: error.message || 'Internal server error' })
  })

  return app
}

function startServer() {
  const app = createApp()
  const port = process.env.PORT || 3000

  return app.listen(port, () => {
    console.log(`Server running: http://localhost:${port}`)
  })
}

module.exports = {
  createApp,
  startServer,
}