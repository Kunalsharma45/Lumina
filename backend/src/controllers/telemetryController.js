const { detectFaults } = require('../services/faultDetectionService')
const { inferPoleTopology } = require('../services/graphBuilderService')
const { fetchRelevantScheduledOutages } = require('./outageController')
const { generateDispatchSummary } = require('../services/aiDispatchService')
const poleModel = require('../models/poleModel')
const telemetryModel = require('../models/telemetryModel')
const ticketModel = require('../models/ticketModel')
const { dedupeTelemetryByDeviceAndSequence } = require('../utils/sequenceManager')

function normalizeTelemetryBody(body) {
  if (Array.isArray(body)) {
    return body
  }

  if (Array.isArray(body?.telemetry)) {
    return body.telemetry
  }

  if (Array.isArray(body?.messages)) {
    return body.messages
  }

  return body ? [body] : []
}

async function ingestTelemetry(req, res, next) {
  try {
    const rawMessages = normalizeTelemetryBody(req.body)
    if (!rawMessages.length) {
      return res.status(400).json({ message: 'Telemetry payload is required' })
    }

    const deduped = dedupeTelemetryByDeviceAndSequence(rawMessages)
      .map((message) => ({
        device_id: message.device_id || message.deviceId,
        pole_id: Number(message.pole_id || message.poleId),
        seq: Number(message.seq),
        energized: Boolean(message.energized),
        reported_at: message.reported_at || message.reportedAt || new Date().toISOString(),
        raw_payload: message,
      }))
      .filter((message) => message.device_id && Number.isFinite(message.pole_id) && Number.isFinite(message.seq))

    if (!deduped.length) {
      return res.status(400).json({ message: 'No valid telemetry records were found' })
    }

    const uniquePoleIds = [...new Set(deduped.map((message) => message.pole_id))]
    const poles = await poleModel.findPolesByIds(uniquePoleIds)
    const existingPoleIds = new Set(poles.map((p) => String(p.id)))

    const validDeduped = deduped.filter((message) => existingPoleIds.has(String(message.pole_id)))
    if (!validDeduped.length) {
      return res.status(400).json({ message: 'No telemetry records matching existing poles were found' })
    }

    const insertedTelemetry = await telemetryModel.bulkUpsertTelemetry(validDeduped)

    const groupedByTransformer = new Map()
    for (const pole of poles) {
      if (!groupedByTransformer.has(pole.transformer_id)) {
        groupedByTransformer.set(pole.transformer_id, [])
      }

      groupedByTransformer.get(pole.transformer_id).push(pole)
    }

    const detectedTickets = []
    const detectedFaults = []

const setImmediatePromise = () => new Promise((resolve) => setImmediate(resolve))

    // --- Per-DT fault detection ---
    for (const [transformerId, transformerPoles] of groupedByTransformer.entries()) {
      const transformer = transformerPoles[0]?.transformer || null
      const needsInference = transformerPoles.some((pole) => pole.seq_on_line == null || pole.parent_pole_id == null)
      const orderedPoles = needsInference
        ? inferPoleTopology(transformerPoles, transformer)
        : [...transformerPoles].sort((left, right) => {
            const leftSeq = Number(left.seq_on_line || Number.MAX_SAFE_INTEGER)
            const rightSeq = Number(right.seq_on_line || Number.MAX_SAFE_INTEGER)
            return leftSeq - rightSeq || left.id - right.id
          })

      const relevantTelemetry = deduped.filter((message) => orderedPoles.some((pole) => String(pole.id) === String(message.pole_id)))
      const scheduledOutages = await fetchRelevantScheduledOutages({
        transformerIds: [transformerId],
        feederIds: transformer?.feeder_id ? [transformer.feeder_id] : [],
      })

      const faults = detectFaults({
        poles: orderedPoles,
        scheduledOutages,
        telemetry: relevantTelemetry,
        transformer,
        feeder_id: transformer?.feeder_id || null,
      })

      for (const fault of faults) {
        detectedFaults.push(fault)

        const existingTicket = await ticketModel.findOpenTicketByBoundary(fault.last_live_pole_id, fault.first_dark_pole_id)
        const aiSummary = generateDispatchSummary({
          ...fault,
          downstream_pole_count: fault.downstream_pole_count,
        })

        if (existingTicket) {
          const updatedTicket = await ticketModel.updateTicket(existingTicket.id, {
            fault_type: fault.fault_type,
            downstream_pole_count: fault.downstream_pole_count,
            confidence: fault.confidence,
            confidence_reason: fault.confidence_reason,
            pin_code: fault.pin_code,
            latitude: fault.latitude,
            longitude: fault.longitude,
            topology_inferred: fault.topology_inferred,
            ai_summary: aiSummary,
            updated_at: new Date(),
          })
          detectedTickets.push(updatedTicket)
        } else {
          const createdTicket = await ticketModel.createDetectedTicket(fault, aiSummary)
          detectedTickets.push(createdTicket)
        }
      }

      // Yield to the event loop after processing each transformer line so Express remains responsive
      await setImmediatePromise()
    }

    // --- FEEDER_FAULT aggregation ---
    // If >= 2 DT_FAULTs share the same feeder AND they represent >=50% of that feeder's DTs → emit one FEEDER_FAULT
    const dtFaultsByFeeder = new Map()
    for (const fault of detectedFaults) {
      if (fault.fault_type === 'DT_FAULT' && fault.feeder_id) {
        if (!dtFaultsByFeeder.has(fault.feeder_id)) {
          dtFaultsByFeeder.set(fault.feeder_id, [])
        }
        dtFaultsByFeeder.get(fault.feeder_id).push(fault)
      }
    }

    for (const [feederId, feederDtFaults] of dtFaultsByFeeder.entries()) {
      if (feederDtFaults.length < 2) continue

      const totalDTs = await poleModel.countTransformersByFeederId(feederId)
      if (feederDtFaults.length < Math.ceil(totalDTs * 0.5)) continue

      // Check no open FEEDER_FAULT ticket already exists for this feeder
      const existingFeederTicket = await ticketModel.findOpenFeederFaultTicket(feederId)
      if (existingFeederTicket) continue

      const totalDownstream = feederDtFaults.reduce((sum, f) => sum + f.downstream_pole_count, 0)
      const firstFault = feederDtFaults[0]

      const feederFault = {
        fault_type: 'FEEDER_FAULT',
        feeder_id: feederId,
        last_live_pole_id: null,
        first_dark_pole_id: firstFault.first_dark_pole_id,
        downstream_pole_count: totalDownstream,
        confidence: 0.98,
        confidence_reason: `${feederDtFaults.length} of ${totalDTs} distribution transformers on feeder #${feederId} are completely dark — 11 kV feeder fault or upstream HT fuse failure likely.`,
        pin_code: firstFault.pin_code,
        latitude: firstFault.latitude,
        longitude: firstFault.longitude,
        topology_inferred: false,
      }

      const feederAiSummary = generateDispatchSummary(feederFault)
      const feederTicket = await ticketModel.createDetectedTicket(feederFault, feederAiSummary)
      detectedTickets.push(feederTicket)
      detectedFaults.push(feederFault)
    }

    // --- Auto-verify restoration: promote CREW_ASSIGNED / RESOLVED tickets when downstream poles are live again ---
    const anyRestoredPoles = validDeduped.some((m) => m.energized === true)
    if (anyRestoredPoles) {
      const openTickets = await ticketModel.findTicketsAwaitingVerification()
      for (const openTicket of openTickets) {
        if (!openTicket.first_dark_pole_id) continue
        const downstreamPoles = await poleModel.findDownstreamPolesFromBoundary(openTicket.first_dark_pole_id)
        if (!downstreamPoles.length) continue

        const latestTelemetry = await telemetryModel.getLatestTelemetryByPoleIds(downstreamPoles.map((p) => p.id))
        const telemetryByPoleId = new Map(latestTelemetry.map((r) => [String(r.pole_id), r]))
        const allLive = downstreamPoles.every((p) => telemetryByPoleId.get(String(p.id))?.energized === true)

        if (allLive) {
          await ticketModel.updateTicket(openTicket.id, {
            status: 'VERIFIED',
            verified_at: new Date(),
            updated_at: new Date(),
          })
          await ticketModel.addTicketEvent(
            openTicket.id,
            'VERIFIED',
            'Auto-verified: backend telemetry confirmed all downstream poles restored to live state'
          )
        }
      }
    }

    res.status(201).json({
      ingested: insertedTelemetry.length,
      deduplicated: deduped.length,
      detectedFaults,
      tickets: detectedTickets,
    })
  } catch (error) {
    next(error)
  }
}

async function getTelemetryHealth(req, res) {
  res.json({ status: 'ok' })
}

module.exports = {
  getTelemetryHealth,
  ingestTelemetry,
}