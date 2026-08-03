function dedupeTelemetryByDeviceAndSequence(messages) {
  const seen = new Map()

  for (const message of messages) {
    const deviceId = message.device_id || message.deviceId
    const seq = Number(message.seq)
    const key = `${deviceId}:${seq}`

    const current = seen.get(key)
    if (!current) {
      seen.set(key, { ...message, device_id: deviceId, seq })
      continue
    }

    const currentReportedAt = new Date(current.reported_at || current.reportedAt || 0).getTime()
    const incomingReportedAt = new Date(message.reported_at || message.reportedAt || 0).getTime()

    if (incomingReportedAt >= currentReportedAt) {
      seen.set(key, { ...message, device_id: deviceId, seq })
    }
  }

  return Array.from(seen.values())
}

function sortTelemetryBySequence(messages) {
  return [...messages].sort((left, right) => {
    if (left.seq !== right.seq) {
      return left.seq - right.seq
    }

    const leftTime = new Date(left.reported_at || left.reportedAt || 0).getTime()
    const rightTime = new Date(right.reported_at || right.reportedAt || 0).getTime()
    return leftTime - rightTime
  })
}

module.exports = {
  dedupeTelemetryByDeviceAndSequence,
  sortTelemetryBySequence,
}