# ⚡ Lumina — Low-Tension Grid Fault Localization System

Lumina is an enterprise-grade power distribution fault localization and incident management system. It ingests high-frequency IoT telemetry from distribution line poles, detects wire breaks and short circuits, localizes exact fault boundaries, and manages the complete repair lifecycle with telemetry-enforced restoration verification.

---

## 🚀 One-Command Quick Start

To launch the full Lumina stack (PostgreSQL 16 Database, Express Backend API, and React Leaflet Control Console) with Docker:

```bash
git clone https://github.com/Kunalsharma45/Lumina.git
cd Lumina
docker compose up -d
```

Once started, open [http://localhost:5173](http://localhost:5173).

> **Note**: On first boot, the backend automatically seeds **38,400 poles** across 412 DTs, 31 Feeders, and 4 Substations into PostgreSQL. This takes ~45–60 seconds. The map will show all poles once seeding completes. No manual step required (gate G3).

---

## 🌐 Live Public URL & Demo Video

- **Deployed Live URL**: [https://lumina-mu-one.vercel.app](https://lumina-mu-one.vercel.app)
- **Demo Video Walkthrough**: *(To be added before submission — 5-minute Loom/YouTube walkthrough)*

  > Video demonstrates: grid seeding (38,400 poles), span break injection, Prim's MST topology inference, feeder fault (11 kV) aggregation, 409 Conflict "Lying Lineman" protection, and telemetry-enforced auto-verification via the 30-second restoration watchdog.

---

## 📚 Documentation Map

The repository documentation is split into 5 core engineering documents:

1. **[README.md](README.md)** *(This File)*: High-level overview, quick start, live links, and repository guide.
2. **[ARCHITECTURE.md](ARCHITECTURE.md)**: System design, Mermaid dataflow diagrams, high-throughput pipeline (38,400 records), sequence deduplication, Prim's MST ($O(V^2)$) graph reconstruction, FEEDER_FAULT aggregation, two-layer auto-verification watchdog, noise filtering, API reference, and LLM justification.
3. **[DEPLOYMENT.md](DEPLOYMENT.md)**: Prerequisites, step-by-step startup, environment variables, verification checklist, real-world troubleshooting guide, and environment reset procedures.
4. **[DECISIONS.md](DECISIONS.md)**: Chronological design log, technical trade-offs, documented brief assumptions, 2-week future roadmap, and honest fragile points.
5. **[AI-WORKFLOW.md](AI-WORKFLOW.md)**: AI tool usage audit, delegation breakdown, concrete AI failure modes caught & corrected, and percentage estimates.

---

## ✨ Key Features & Edge Case Highlights

- **38,400-Pole Scalability**: Handles 38,400 distribution poles across 412 Distribution Transformers (DTs), 31 Feeders, and 4 Substations.
- **Auto-Seeded on First Boot**: `docker compose up -d` seeds the full grid automatically — no manual step required.
- **60% Missing Topology Reconstruction**: Runs Prim's Minimum Spanning Tree (MST) + Breadth-First Search (BFS) graph orientation for unmapped distribution lines.
- **FEEDER_FAULT Detection**: When ≥50% of DTs on a feeder are simultaneously dark, individual DT_FAULT tickets are aggregated into a single **FEEDER_FAULT** ticket, correctly modelling an 11 kV feeder trip or upstream HT fuse failure.
- **Autonomous Restoration Verification (Two Layers)**:
  1. **Ingest-Inline**: Every time restoration telemetry arrives, the system immediately promotes any CREW_ASSIGNED/RESOLVED ticket whose downstream poles are now live.
  2. **30-Second Watchdog**: `setInterval(30_000)` background loop catches any gaps — restoration without requiring the operator to click anything.
- **Sequence-Based Deduplication**: Ignores clock skew (±90s) by relying on monotonic integer sequence ordering (`seq`).
- **"Lying Lineman" Safety Enforcement**: Returns `409 Conflict` if an operator attempts to verify a ticket while backend telemetry confirms poles remain dark.
- **30% Packet Loss Simulation**: The fault simulator optionally drops 30% of dying-pole messages and silences 8% as firmware 1.2 devices, matching the real-world protocol described in `02-data-and-systems.md §6.3`.
- **45-Minute Fuzzy Load Shedding Grace Period**: Suppresses false alarm tickets during scheduled maintenance overruns.
- **Multi-Category Map Color Coding**: Visual distinction between Feeder Faults (Orange `#F97316`, dashed `18,6`), DT Fuse Blows (Deep Purple `#8B5CF6`, dashed `12,6`), Span Breaks (Dashed Red `#EF4444`, dashed `5,10`), and Sensor Glitches (Amber `#F59E0B`).
- **60 FPS Hardware-Accelerated Canvas**: Employs Leaflet `preferCanvas={true}` GPU context for smooth panning/zooming at 38,400-pole scale.

---

## 🎛️ Fault Simulator & Testing Controls

The operator console includes a built-in testing panel with 6 main action buttons to simulate different real-world power grid scenarios:

1. **Seed Grid Data**: Wipes the database and regenerates the full topological grid (4 Substations, 31 Feeders, 412 Transformers, and 38,400 Poles).
2. **Inject Span Break**: Simulates a physical wire snap between two poles. Injects downstream `energized: false` telemetry to trigger a `SPAN_BREAK` fault ticket and render a red fault boundary.
3. **Feeder Fault (11 kV)**: Trips an entire 11 kV feeder line, aggressively darkening a massive swath of transformers and aggregating them into a single high-priority `FEEDER_FAULT` ticket.
4. **Monsoon Scenario**: Simulates a severe weather event with 30% packet loss. Tests the system's resilience to missing telemetry and ensures out-of-order sequence processing still correctly localizes the fault boundary.
5. **Load Shedding**: Initiates a scheduled rolling blackout. Suppresses standard alarms and enforces a 45-minute fuzzy grace period to prevent false positive tickets during maintenance.
6. **Dead Device (Fw1.2)**: Simulates a legacy firmware 1.2 IoT sensor failure. The pole dies instantly without transmitting a final "dying gasp", triggering a specific `DEAD_SENSOR` amber warning ticket instead of a standard wire snap fault.
