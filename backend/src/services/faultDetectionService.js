const { dedupeTelemetryByDeviceAndSequence, sortTelemetryBySequence } = require('../utils/sequenceManager')
const { haversineDistanceMeters } = require('../utils/geoDistance')

function getLatestTelemetryPerPole(messages) {
  const deduped = dedupeTelemetryByDeviceAndSequence(messages)
  const latestByPole = new Map()

  for (const message of sortTelemetryBySequence(deduped)) {
    const poleId = String(message.pole_id || message.poleId)
    const current = latestByPole.get(poleId)

    if (!current) {
      latestByPole.set(poleId, message)
      continue
    }

    const currentSeq = Number(current.seq)
    const incomingSeq = Number(message.seq)
    if (incomingSeq > currentSeq) {
      latestByPole.set(poleId, message)
      continue
    }

    if (incomingSeq === currentSeq) {
      const currentTime = new Date(current.reported_at || current.reportedAt || 0).getTime()
      const incomingTime = new Date(message.reported_at || message.reportedAt || 0).getTime()
      if (incomingTime >= currentTime) {
        latestByPole.set(poleId, message)
      }
    }
  }

  return latestByPole
}

function isScheduledOutage(context, pole) {
  return (context.scheduledOutages || []).some((outage) => {
    const now = new Date(context.observedAt || Date.now())
    const startAt = new Date(outage.start_at || outage.startAt)
    const endAt = outage.end_at || outage.endAt ? new Date(outage.end_at || outage.endAt) : null
    const inWindow = startAt <= now && (!endAt || now <= endAt)
    const feederMatch = outage.feeder_id && pole.feeder_id && outage.feeder_id === pole.feeder_id
    const transformerMatch = outage.transformer_id && pole.transformer_id && outage.transformer_id === pole.transformer_id

    return inWindow && (feederMatch || transformerMatch)
  })
}

function isDeadSensorCandidate(orderedPoles, stateByPoleId, index) {
  const pole = orderedPoles[index]
  const state = stateByPoleId.get(String(pole.id))
  if (state !== false) {
    return false
  }

  const prevPole = orderedPoles[index - 1]
  const nextPole = orderedPoles[index + 1]
  const prevLive = prevPole ? stateByPoleId.get(String(prevPole.id)) === true : false
  const nextLive = nextPole ? stateByPoleId.get(String(nextPole.id)) === true : false

  return prevLive && nextLive
}

function buildConfidence(darkRunLength, totalAffected, topologyInferred) {
  const baseConfidence = Math.min(0.95, 0.65 + darkRunLength * 0.1 + totalAffected * 0.02)
  return topologyInferred ? Math.max(0.55, baseConfidence - 0.08) : baseConfidence
}

function detectFaults({ poles = [], telemetry = [], scheduledOutages = [], observedAt = Date.now(), transformer = null }) {
  if (!poles.length) {
    return []
  }

  const latestTelemetryByPole = getLatestTelemetryPerPole(telemetry)
  const orderedPoles = [...poles].sort((left, right) => {
    const leftSeq = Number(left.seq_on_line || Number.MAX_SAFE_INTEGER)
    const rightSeq = Number(right.seq_on_line || Number.MAX_SAFE_INTEGER)
    if (leftSeq !== rightSeq) {
      return leftSeq - rightSeq
    }

    return left.id - right.id
  })

  const stateByPoleId = new Map()
  for (const pole of orderedPoles) {
    const telemetryRecord = latestTelemetryByPole.get(String(pole.id))
    const energized = telemetryRecord ? Boolean(telemetryRecord.energized) : true
    stateByPoleId.set(String(pole.id), energized)
  }

  const faults = []
  let liveBoundaryIndex = -1

  for (let index = 0; index < orderedPoles.length; index += 1) {
    const pole = orderedPoles[index]

    if (isScheduledOutage({ scheduledOutages, observedAt }, pole)) {
      continue
    }

    if (stateByPoleId.get(String(pole.id)) === true) {
      liveBoundaryIndex = index
      continue
    }

    const downstreamPoles = orderedPoles.slice(index)
    const darkRunLength = downstreamPoles.filter((downstreamPole) => stateByPoleId.get(String(downstreamPole.id)) === false).length

    if (isDeadSensorCandidate(orderedPoles, stateByPoleId, index)) {
      continue
    }

    const lastLivePole = liveBoundaryIndex >= 0 ? orderedPoles[liveBoundaryIndex] : null
    const firstDarkPole = pole
    const affectedPoles = downstreamPoles.filter((downstreamPole) => stateByPoleId.get(String(downstreamPole.id)) === false)

    if (!lastLivePole && stateByPoleId.get(String(pole.id)) === false && index === 0) {
      continue
    }

    const topologyInferred = orderedPoles.some((currentPole) => currentPole.topology_inferred) || Boolean(transformer?.topology_inferred)
    const latitude = (lastLivePole?.latitude ?? firstDarkPole.latitude)
    const longitude = (lastLivePole?.longitude ?? firstDarkPole.longitude)
    const distanceToBoundary = lastLivePole ? haversineDistanceMeters(lastLivePole, firstDarkPole) : 0

    faults.push({
      fault_type: 'SPAN_BREAK',
      last_live_pole_id: lastLivePole?.id ?? null,
      first_dark_pole_id: firstDarkPole.id,
      downstream_pole_count: affectedPoles.length,
      confidence: buildConfidence(darkRunLength, affectedPoles.length, topologyInferred),
      confidence_reason: topologyInferred
        ? 'Topology inferred geometrically from pole GPS positions; live/dark boundary detected from sequence-ordered telemetry.'
        : 'Boundary detected from sequence-ordered telemetry with an explicit line order.',
      pin_code: firstDarkPole.pin_code || lastLivePole?.pin_code || transformer?.pin_code || null,
      latitude,
      longitude,
      boundary_span_meters: distanceToBoundary,
      topology_inferred: topologyInferred,
    })

    break
  }

  return faults
}

module.exports = {
  detectFaults,
  getLatestTelemetryPerPole,
}