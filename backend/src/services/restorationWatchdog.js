/**
 * Restoration Watchdog Service
 *
 * Runs a background setInterval every 30 seconds to scan all open tickets in
 * CREW_ASSIGNED or RESOLVED state. For each, it fetches the latest telemetry
 * for every downstream pole. If ALL downstream poles are live (energized=true),
 * the ticket is automatically promoted to VERIFIED without any operator action.
 *
 * This satisfies the assignment requirement:
 *   "When the affected poles come back to life, the system should say so on its own."
 *
 * This is the safety-net watchdog. The ingest pipeline also auto-verifies inline
 * when restoration messages arrive, but this catches any gaps (e.g. restoration
 * telemetry that arrived before the ticket existed, or batches that contained only
 * already-live poles and bypassed the inline check).
 */

const ticketModel = require('../models/ticketModel')
const poleModel = require('../models/poleModel')
const telemetryModel = require('../models/telemetryModel')

const POLL_INTERVAL_MS = 30 * 1000 // 30 seconds

async function checkAndAutoVerify() {
  try {
    const openTickets = await ticketModel.findTicketsAwaitingVerification()
    if (!openTickets.length) return

    let verifiedCount = 0

    for (const ticket of openTickets) {
      if (!ticket.first_dark_pole_id) continue

      const downstreamPoles = await poleModel.findDownstreamPolesFromBoundary(ticket.first_dark_pole_id)
      if (!downstreamPoles.length) continue

      const latestTelemetry = await telemetryModel.getLatestTelemetryByPoleIds(
        downstreamPoles.map((pole) => pole.id)
      )

      const telemetryByPoleId = new Map(
        latestTelemetry.map((record) => [String(record.pole_id), record])
      )

      // All downstream poles must have a live telemetry record to qualify
      const allLive = downstreamPoles.every(
        (pole) => telemetryByPoleId.get(String(pole.id))?.energized === true
      )

      if (allLive) {
        await ticketModel.updateTicket(ticket.id, {
          status: 'VERIFIED',
          verified_at: new Date(),
          updated_at: new Date(),
        })

        await ticketModel.addTicketEvent(
          ticket.id,
          'VERIFIED',
          `Auto-verified by restoration watchdog [30s poll]: all ${downstreamPoles.length} downstream poles confirmed energized via telemetry`
        )

        verifiedCount++
        console.log(`[Watchdog] Ticket #${ticket.ticket_number} (id=${ticket.id}) auto-verified — ${downstreamPoles.length} downstream poles confirmed live`)
      }
    }

    if (verifiedCount > 0) {
      console.log(`[Watchdog] Cycle complete: ${verifiedCount}/${openTickets.length} ticket(s) auto-verified`)
    }
  } catch (error) {
    // Non-fatal: log and continue — a DB hiccup should not crash the server
    console.error('[Watchdog] Error during auto-verify scan:', error.message)
  }
}

/**
 * Starts the restoration watchdog.
 * @returns {NodeJS.Timeout} The interval handle — pass to stopRestorationWatchdog to clean up
 */
function startRestorationWatchdog() {
  console.log(`[Watchdog] Restoration watchdog started — scanning for restored poles every ${POLL_INTERVAL_MS / 1000}s`)

  // Run an immediate check at startup so the first auto-verify fires without waiting 30s
  checkAndAutoVerify()

  const timer = setInterval(checkAndAutoVerify, POLL_INTERVAL_MS)
  return timer
}

/**
 * Stops the restoration watchdog (used in tests and graceful shutdown).
 * @param {NodeJS.Timeout} timer The handle returned by startRestorationWatchdog
 */
function stopRestorationWatchdog(timer) {
  if (timer) {
    clearInterval(timer)
    console.log('[Watchdog] Restoration watchdog stopped')
  }
}

module.exports = {
  checkAndAutoVerify,
  startRestorationWatchdog,
  stopRestorationWatchdog,
}
