function generateDispatchSummary(ticket) {
  return [
    `Dispatch to the span between pole ${ticket.last_live_pole_id} and pole ${ticket.first_dark_pole_id}.`,
    `Estimated affected poles: ${ticket.downstream_pole_count}.`,
    `Use PIN ${ticket.pin_code || 'unknown'} and verify live telemetry before closure.`,
  ].join(' ')
}

module.exports = {
  generateDispatchSummary,
}