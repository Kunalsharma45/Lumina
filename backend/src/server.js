require('dotenv').config()

const express = require('express')
const cors = require('cors')

const telemetryRoutes = require('./routes/telemetryRoutes')
const ticketRoutes = require('./routes/ticketRoutes')
const simulatorRoutes = require('./routes/simulatorRoutes')
const poleRoutes = require('./routes/poleRoutes')
const { startRestorationWatchdog, stopRestorationWatchdog } = require('./services/restorationWatchdog')
const { seedIfEmpty } = require('./services/seedOnStartup')

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

  const server = app.listen(port, () => {
    console.log(`Server running: http://localhost:${port}`)

    // Auto-seed on first boot: seeds 38,400 poles if the database is empty (G3 gate)
    seedIfEmpty()
      .then(() => {
        // Start background restoration watchdog after seed completes
        const watchdogTimer = startRestorationWatchdog()

        // Graceful shutdown: stop the watchdog before closing the HTTP server
        function shutdown(signal) {
          console.log(`\n[Server] ${signal} received — shutting down gracefully`)
          stopRestorationWatchdog(watchdogTimer)
          server.close(() => {
            console.log('[Server] HTTP server closed')
            process.exit(0)
          })
        }

        process.on('SIGTERM', () => shutdown('SIGTERM'))
        process.on('SIGINT', () => shutdown('SIGINT'))
      })
      .catch((err) => {
        console.error('[AutoSeed] Seed failed on startup — server will still run but database may be empty:', err.message)
        // Still start the watchdog even if seed failed
        startRestorationWatchdog()
      })
  })

  return server
}

module.exports = {
  createApp,
  startServer,
}