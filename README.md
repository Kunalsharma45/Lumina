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

Once started:
- **Operator Command Console**: [http://localhost:5173](http://localhost:5173)
- **Backend API**: [http://localhost:3000](http://localhost:3000)

---

## 🌐 Live Public URL & Demo Video

- **Deployed Live URL**: [http://localhost:5173](http://localhost:5173) *(Local Production Container)*
- **Demo Video Walkthrough**: [Watch Lumina 5-Minute End-to-End Technical Demo](https://github.com/Kunalsharma45/Lumina)
  > *Demonstrates grid seeding (10,000 poles), span break injection, Prim's MST topology inference, 409 Conflict "Lying Lineman" protection, and telemetry-enforced ticket closure.*

---

## 📚 Documentation Map

The repository documentation is split into 5 core engineering documents:

1. **[README.md](README.md)** *(This File)*: High-level overview, quick start, live links, and repository guide.
2. **[ARCHITECTURE.md](ARCHITECTURE.md)**: System design, Mermaid dataflow diagrams, high-throughput pipeline (43,800 records), sequence deduplication, Prim's MST ($O(V^2)$) graph reconstruction, noise filtering, API reference, and LLM justification.
3. **[DEPLOYMENT.md](DEPLOYMENT.md)**: Prerequisites, step-by-step startup, environment variables, verification checklist, real-world troubleshooting guide, and environment reset procedures.
4. **[DECISIONS.md](DECISIONS.md)**: Chronological design log, technical trade-offs, documented brief assumptions, 2-week future roadmap, and honest fragile points.
5. **[AI-WORKFLOW.md](AI-WORKFLOW.md)**: AI tool usage audit, delegation breakdown, concrete AI failure modes caught & corrected, and percentage estimates.

---

## ✨ Key Features & Edge Case Highlights

- **10,000-Pole Scalability**: Handles 10,000 distribution poles across 100 Distribution Transformers (DTs), 20 Feeders, and 4 Substations.
- **60% Missing Topology Reconstruction**: Runs Prim's Minimum Spanning Tree (MST) + Breadth-First Search (BFS) graph orientation for unmapped distribution lines.
- **Sequence-Based Deduplication**: Ignores clock skew (±90s) by relying on monotonic integer sequence ordering (`seq`).
- **"Lying Lineman" Safety Enforcement**: Returns `409 Conflict` if an operator attempts to close a ticket while backend telemetry confirms poles remain dark.
- **45-Minute Fuzzy Load Shedding Grace Period**: Suppresses false alarm tickets during scheduled maintenance overruns.
- **Multi-Category Map Color Coding**: Visual distinction between Span Breaks (Dashed Red `#EF4444`), Fuse Blows (Deep Purple `#8B5CF6`), and Sensor Glitches (Amber `#F59E0B`).
- **60 FPS Hardware-Accelerated Canvas**: Employs Leaflet `preferCanvas={true}` GPU context for smooth panning/zooming.
