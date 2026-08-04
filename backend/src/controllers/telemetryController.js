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