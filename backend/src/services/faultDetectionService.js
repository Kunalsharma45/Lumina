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
  const OVERRUN_BUFFER_MS = 45 * 60 * 1000 // 45-minute fuzzy buffer for crew overruns
  return (context.scheduledOutages || []).some((outage) => {
    const now = new Date(context.observedAt || Date.now())
    const startAt = new Date(outage.start_at || outage.startAt)
    const endAtRaw = outage.end_at || outage.endAt ? new Date(outage.end_at || outage.endAt) : null
    const endAtWithBuffer = endAtRaw ? new Date(endAtRaw.getTime() + OVERRUN_BUFFER_MS) : null

    const inWindow = startAt <= now && (!endAtWithBuffer || now <= endAtWithBuffer)
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

  // 1. Find true topological parent
  const parentPole = pole.parent_pole_id
    ? orderedPoles.find((p) => String(p.id) === String(pole.parent_pole_id))
    : orderedPoles[index - 1]
  const parentLive = parentPole ? stateByPoleId.get(String(parentPole.id)) === true : false

  // 2. Find true topological children
  const childrenPoles = orderedPoles.filter((p) => String(p.parent_pole_id) === String(pole.id))
  if (childrenPoles.length === 0) {
    const nextPole = orderedPoles[index + 1]
    if (!nextPole) return false
    return parentLive && stateByPoleId.get(String(nextPole.id)) === true
  }

  // 3. Are ALL true children still live?
  const allChildrenLive = childrenPoles.every((child) => stateByPoleId.get(String(child.id)) === true)

  return parentLive && allChildrenLive
}

function buildConfidence(darkRunLength, totalAffected, topologyInferred) {
  const baseConfidence = Math.min(0.95, 0.65 + darkRunLength * 0.1 + totalAffected * 0.02)
  return topologyInferred ? Math.max(0.55, baseConfidence - 0.08) : baseConfidence
}

function detectFaults({ poles = [], telemetry = [], scheduledOutages = [], observedAt = Date.now(), transformer = null, feeder_id = null }) {
  if (!poles.length) {
    return []
  }

  const FIFTEEN_MINUTES_MS = 15 * 60 * 1000
  const NETWORK_BUFFER_MS = 2 * 60 * 1000 // 2 minute grace period for clock skew

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
    let energized = true

    if (telemetryRecord) {
      energized = Boolean(telemetryRecord.energized)

      // Silent Death Check: If device claims live, verify it hasn't timed out past 15 min heartbeat window
      if (energized === true) {
        const lastReportTime = new Date(telemetryRecord.reported_at || telemetryRecord.reportedAt || 0).getTime()
        if (lastReportTime > 0) {
          const timeSinceLastMessage = observedAt - lastReportTime
          if (timeSinceLastMessage > FIFTEEN_MINUTES_MS + NETWORK_BUFFER_MS) {
            energized = false // SILENT DEATH DETECTED - Capacitor / Firmware 1.2 failure!
          }
        }
      }
    }
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
      const allDark = orderedPoles.every((p) => stateByPoleId.get(String(p.id)) === false)
      if (allDark) {
        const topologyInferred = orderedPoles.some((currentPole) => currentPole.topology_inferred) || Boolean(transformer?.topology_inferred)
        faults.push({
          fault_type: 'DT_FAULT',
          feeder_id: feeder_id || transformer?.feeder_id || null,
          last_live_pole_id: null,
          first_dark_pole_id: pole.id,
          downstream_pole_count: orderedPoles.length,
          confidence: 0.95,
          confidence_reason: '100% of poles dark on distribution transformer; DT fuse blown or transformer trip detected.',
          pin_code: pole.pin_code || transformer?.pin_code || null,
          latitude: pole.latitude,
          longitude: pole.longitude,
          boundary_span_meters: 0,
          topology_inferred: topologyInferred,
        })
        break
      }
    }

    const topologyInferred = orderedPoles.some((currentPole) => currentPole.topology_inferred) || Boolean(transformer?.topology_inferred)
    const latitude = (lastLivePole?.latitude ?? firstDarkPole.latitude)
    const longitude = (lastLivePole?.longitude ?? firstDarkPole.longitude)
    const distanceToBoundary = lastLivePole ? haversineDistanceMeters(lastLivePole, firstDarkPole) : 0

    faults.push({
      fault_type: 'SPAN_BREAK',
      feeder_id: feeder_id || transformer?.feeder_id || null,
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