const assert = require('assert')

const { inferPoleTopology } = require('../src/services/graphBuilderService')
const { detectFaults } = require('../src/services/faultDetectionService')

const transformer = {
  id: 10,
  latitude: 12.9716,
  longitude: 77.5946,
  pin_code: '560001',
}

const poles = [
  { id: 1, transformer_id: 10, latitude: 12.9717, longitude: 77.5947, pin_code: '560001' },
  { id: 2, transformer_id: 10, latitude: 12.9718, longitude: 77.5948, pin_code: '560001' },
  { id: 3, transformer_id: 10, latitude: 12.9719, longitude: 77.5949, pin_code: '560001' },
]

const inferredPoles = inferPoleTopology(poles, transformer)
assert.strictEqual(inferredPoles.length, 3)
assert.strictEqual(inferredPoles[0].seq_on_line, 1)

const telemetry = [
  { device_id: 'dev-1', pole_id: 1, seq: 9, energized: true, reported_at: '2026-08-02T10:00:00Z' },
  { device_id: 'dev-2', pole_id: 2, seq: 10, energized: false, reported_at: '2026-08-02T10:00:05Z' },
  { device_id: 'dev-3', pole_id: 3, seq: 11, energized: false, reported_at: '2026-08-02T10:00:08Z' },
]

const faults = detectFaults({ poles: inferredPoles, telemetry, transformer })
assert.strictEqual(faults.length, 1)
assert.strictEqual(faults[0].last_live_pole_id, 1)
assert.strictEqual(faults[0].first_dark_pole_id, 2)
assert.strictEqual(faults[0].downstream_pole_count, 2)

console.log('faultDetection.test.js passed')