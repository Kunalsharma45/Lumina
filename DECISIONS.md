# 📜 DECISIONS.md — Architecture & Design Log

This document records the technical trade-offs, design choices, documented assumptions, scope choices, and fragile points in chronological order (newest first).

---

## 1. Chronological Decision Log

### Decision 8: Multi-Category Visual Color Coding System (2026-08-04)
- **Chosen**: Visual distinction using exact HSL color codes: Emerald Green (`#10B981`) for working lines, Dashed Red (`#EF4444`, `dashArray: '5, 10'`) for Wire Breaks, Deep Purple (`#8B5CF6`, `dashArray: '12, 6'`) for Blown Transformer Fuses, and Amber Yellow (`#F59E0B`) for Hardware Glitches.
- **Rejected**: Single uniform red line marker for all fault types.
- **Rationale**: Control room operators must diagnose failure modes (wire snap vs fuse blow vs dead sensor) instantly at a glance.

### Decision 7: HTML5 GPU Canvas Acceleration (`preferCanvas={true}`) (2026-08-04)
- **Chosen**: Leaflet `<MapContainer preferCanvas={true}>`.
- **Rejected**: Standard Leaflet SVG DOM node rendering.
- **Rationale**: Rendering 10,000 poles with individual SVG `<path>` elements overloaded the browser DOM tree, causing frame drops during zoom/pan. HTML5 Canvas renders 10,000 markers on a single GPU context at 60 FPS.

### Decision 6: Telemetry-Enforced Restoration ("Lying Lineman" Safety Rule) (2026-08-03)
- **Chosen**: Return `409 Conflict` if an operator/crew attempts to close a ticket while backend telemetry confirms downstream poles are still dark.
- **Rejected**: Allowing manual ticket resolution without telemetry verification.
- **Rationale**: Field crews in real-world utility operations routinely report jobs as "Fixed" before physical pole lines are energized. Telemetry verification prevents premature ticket closure.

### Decision 5: Algorithmic Fault Localization over LLM Decision-Making (2026-08-02)
- **Chosen**: Deterministic graph algorithms (Prim's MST + BFS + Linear Scans).
- **Rejected**: Prompting an LLM to predict fault locations from telemetry JSON.
- **Rationale**: Power grid fault localization is safety-critical and must be 100% reproducible, auditable, and testable without non-deterministic hallucinations or latency spikes.

### Decision 4: Monotonic Sequence Numbers (`seq`) over Device Timestamps (2026-08-01)
- **Chosen**: Monotonic sequence integers for state ordering and deduplication (`ON CONFLICT (device_id, seq)`).
- **Rejected**: Sorting incoming telemetry by device timestamp (`reported_at`).
- **Rationale**: Field IoT device clocks routinely suffer from clock skew (±90 seconds) and out-of-order cellular retries.

---

## 2. Documented Assumptions

1. **Radial Line Assumption**: LT distribution lines branching from transformers follow radial tree topologies rather than meshed loops.
2. **Deterministic Sequence Integrity**: IoT hardware sensors emit strictly increasing integer sequence numbers per device.
3. **Geometric Proximity Heuristic**: For unmapped transformers ($60\%$ missing topology case), physical proximity between poles closely correlates with electrical wire connectivity.
4. **45-Minute Maintenance Overrun Buffer**: Scheduled outages routinely overrun by 20–40 minutes; a 45-minute fuzzy grace period prevents false alarm tickets.

---

## 3. Two-Week Future Roadmap

If given two additional weeks, the following features would be implemented:

1. **WebSocket Real-Time Handoff**: Replace 5-second polling with Socket.io / WebSocket server push for instant ticket popups.
2. **Crew Mobile GIS App**: Offline-first PWA for field repair linemen with GPS navigation to exact fault boundary coordinates.
3. **GIS Shapefile Import/Export**: Support for importing utility GIS shapefiles (`.shp`/`.geojson`) to replace MST graph fallback.
4. **Historical Outage Analytics**: Heatmap dashboard showing repeat fault frequency per transformer over 12 months.

---

## 4. Honest Fragile Points & Limitations

1. **Geometric MST Edge Cases**: In rare geographic terrains (e.g. river crossings or sharp diagonal alleys), physical proximity can connect two poles that belong to different physical circuits. Real GIS survey data is always preferred over geometric MST heuristics.
2. **Database Scale Caps**: The backend seeder is optimized for 10,000 poles per instance. Scaling to 1,000,000 poles requires horizontal database sharding or TimescaleDB hyper-tables.
