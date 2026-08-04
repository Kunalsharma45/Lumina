# 🤖 AI-WORKFLOW.md — AI Leverage & Audit Report

This report documents the collaborative workflow between human engineering and AI assistance during the development of the Lumina Fault Localization System.

---

## 1. AI Tools Utilized

- **Antigravity AI Coding Assistant (DeepMind)**: Core pair programming, architecture design, refactoring, automated test suite construction, and bug troubleshooting.
- **GitHub Copilot**: Inline code completion in VS Code.

---

## 2. Delegation Breakdown (AI vs. Human)

### 🤖 AI-Generated / Assisted (70%)
- Initial scaffolding for Express API routes and controller endpoints.
- Implementation of Prim's Minimum Spanning Tree (MST) and BFS orientation graph algorithms (`graphBuilderService.js`).
- React Leaflet Map UI components (`MapView.jsx`) and custom UI controls.
- Comprehensive automated test suite (`run_edge_case_tests.js`, `verify_ticket_lifecycle.js`, `ingest_10k_test.js`).
- Draft documentation files and Mermaid system diagrams.

### 👤 Human Engineering & Verification (30%)
- Exact PostgreSQL database schema design (`db/init.sql`) and foreign key cascade rules.
- Design of the 409 Conflict "Lying Lineman" telemetry restoration protection rule.
- Tuning database sequence reset logic (`TRUNCATE ... RESTART IDENTITY CASCADE`).
- Identification and resolution of edge case failure modes (e.g. Leaflet DOM node memory caps, JavaScript `null < breakAfterSeq` type coercion bugs).
- Execution and verification of all 8 automated edge case test suites at 10,000 poles scale.

---

## 3. Concrete AI Failure Modes Caught & Corrected

### 1. The `null < breakAfterSeq` JavaScript Type Coercion Bug
- **The Issue**: Early telemetry generator logic evaluated `pole.seq_on_line < breakAfterSeq`. For unmapped poles (`seq_on_line = null`), JavaScript coerced `null < 3` to `0 < 3` (`true`), causing 100% of poles to report `energized: true` (0 dark poles), resulting in 0 fault tickets being generated.
- **How it was caught**: During manual simulator verification, clicking **`2. Inject Span Break`** returned HTTP 201 but 0 tickets appeared on the board.
- **The Fix**: Updated `generateTelemetryForTree` to fallback to array index (`idx + 1`) when `seq_on_line` is `null`.

### 2. Leaflet SVG DOM Overload at 10,000 Poles Scale
- **The Issue**: Initial map rendering placed 10,000 individual SVG `<CircleMarker>` elements directly into the browser DOM tree, freezing the main UI thread during map zoom/pan.
- **How it was caught**: Browser frame drops and missing tile loading delays when navigating the 10,000-pole map.
- **The Fix**: Enabled Leaflet `<MapContainer preferCanvas={true}>` for 60 FPS hardware GPU canvas context rendering.

### 3. Missing Ticket Creation in Simulator Controller
- **The Issue**: Early simulator action handlers upserted dark telemetry into PostgreSQL but failed to call `detectFaults()` and `ticketModel.createDetectedTicket()`.
- **How it was caught**: Telemetry was visible in database tables, but the frontend ticket list remained empty.
- **The Fix**: Integrated immediate fault detection and ticket creation inside `injectFault` and `createScenario`.

---

## 4. Best Prompts & Collaborative Patterns

- **Prompt**: *"Build an automated edge case test suite for 5,000 and 10,000 pole datasets verifying single span breaks, Prim's MST graph inference, dead sensor candidate filtering, 45-minute fuzzy load shedding grace periods, and telemetry-enforced ticket closure."*
- **Prompt**: *"Update the Leaflet map UI with multi-category visual color codes: Emerald Green (#10B981) for working lines, Dashed Red (#EF4444, dashArray: '5, 10') for Wire Breaks, Deep Purple (#8B5CF6) for Blown Transformer Fuses, and Amber Yellow (#F59E0B) for Sensor Glitches."*

---

## 5. Summary of AI Contribution

- **Code Base**: ~70% AI-generated scaffolding & logic, ~30% human refined, debugged, and verified.
- **Test Suite**: 100% automated test coverage across all 8 assignment edge cases.
