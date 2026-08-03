# KSPDB Fault Localization System

The KSPDB Fault Localization System detects outages on low-tension distribution lines, localizes the live/dark boundary from pole telemetry, groups downstream dark poles into one ticket, and verifies restoration from telemetry before closure.

## Live Public URL

Not deployed yet.

When the app is live, place the public URL here.

## Demo Video

Not recorded yet.

When available, add the 5-minute walkthrough link here.

## One-Command Quick Start

```bash
docker compose up
```

## Documentation Map

- [Architecture](ARCHITECTURE.md)
- [Deployment](DEPLOYMENT.md)
- [Decisions](DECISIONS.md)
- [AI Workflow](AI-WORKFLOW.md)
- [Project Status](PROJECT_STATUS.md)

## What the system does

- Ingests pole telemetry from IoT devices.
- Deduplicates and orders messages by `seq`.
- Infers missing topology from GPS coordinates when needed.
- Detects the live/dark boundary and creates a single localized fault ticket.
- Filters out scheduled outages and dead-sensor patterns.
- Uses an AI-generated dispatch summary for operator handoff.
- Verifies restoration from telemetry before closing the ticket.
