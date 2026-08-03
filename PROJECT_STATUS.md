# Project Status

Last updated: 2026-08-02

## What has been completed

### Repository layout

- Kept the workspace as a root-level monorepo with separate `backend`, `frontend`, and `db` folders.
- Added a root-level `docker-compose.yml` so the whole stack can be started from one place later.

### Database

- Created [db/init.sql](db/init.sql) with the PostgreSQL schema.
- Added tables for:
  - substations
  - feeders
  - transformers
  - poles
  - telemetry
  - scheduled_outages
  - tickets
  - ticket_events
- Added indexes and a trigger to maintain `updated_at` on tickets.

### Backend setup

- Converted the backend entry into a proper server bootstrap in [backend/src/server.js](backend/src/server.js).
- Added CORS, JSON parsing, and route mounting for:
  - telemetry
  - tickets
  - simulator
- Added PostgreSQL access helpers in [backend/src/config/database.js](backend/src/config/database.js).
- Added model helpers for poles, telemetry, and tickets.

### Localization and graph logic

- Added geographic distance helpers in [backend/src/utils/geoDistance.js](backend/src/utils/geoDistance.js).
- Added sequence-based telemetry deduplication in [backend/src/utils/sequenceManager.js](backend/src/utils/sequenceManager.js).
- Added topology inference in [backend/src/services/graphBuilderService.js](backend/src/services/graphBuilderService.js).
- Added fault detection in [backend/src/services/faultDetectionService.js](backend/src/services/faultDetectionService.js).
- Added a focused test in [backend/tests/faultDetection.test.js](backend/tests/faultDetection.test.js).

### API layer

- Added telemetry ingestion in [backend/src/controllers/telemetryController.js](backend/src/controllers/telemetryController.js).
- Added ticket lifecycle handling in [backend/src/controllers/ticketController.js](backend/src/controllers/ticketController.js).
- Added scheduled outage support in [backend/src/controllers/outageController.js](backend/src/controllers/outageController.js).
- Added simulator endpoints in [backend/src/controllers/simulatorController.js](backend/src/controllers/simulatorController.js).
- Added backend routes in [backend/src/routes/telemetryRoutes.js](backend/src/routes/telemetryRoutes.js), [backend/src/routes/ticketRoutes.js](backend/src/routes/ticketRoutes.js), and [backend/src/routes/simulatorRoutes.js](backend/src/routes/simulatorRoutes.js).

### AI dispatch summary

- Added a lightweight dispatch summary generator in [backend/src/services/aiDispatchService.js](backend/src/services/aiDispatchService.js).
- It is used for localized tickets as the AI-shaped feature, while fault localization itself remains algorithmic.

### Frontend setup

- Reworked the frontend into an operator console in [frontend/src/App.jsx](frontend/src/App.jsx).
- Added a layout shell, ticket list, ticket detail, simulator panel, and OpenStreetMap-based map view.
- Added API helpers in [frontend/src/api/apiClient.js](frontend/src/api/apiClient.js).
- Added polling hook support in [frontend/src/hooks/useTickets.js](frontend/src/hooks/useTickets.js).
- Kept the frontend styling in Tailwind utilities.

### Simulator UI

- Added a single primary scenario action in [frontend/src/components/SimulatorPanel.jsx](frontend/src/components/SimulatorPanel.jsx).
- The simulator now calls the backend scenario endpoint instead of exposing separate seed/fault debug actions in the main UI.

## Validation completed so far

- Frontend production build passes with `npm run build` in `frontend`.
- Backend modules load successfully in Node for the simulator and server entry points.
- The focused fault detection test passes with `node backend/tests/faultDetection.test.js`.

## What is still pending

- Full end-to-end runtime verification with PostgreSQL and Docker Compose.
- Final confirmation that the scenario endpoint, ticket lifecycle, and verification flow work together in a live stack.
- Any final packaging or deployment checks once Docker is brought back into scope.

## Current implementation notes

- The frontend and backend are connected through API calls, but the live Docker/Postgres run has not yet been proven in this workspace.
- The operator UI is intentionally focused on the main scenario flow; the earlier debug-style seed/fault buttons were removed from the visible panel.
- PostgreSQL schema work is complete for the current stage, and Docker integration is being saved for the end as requested.
