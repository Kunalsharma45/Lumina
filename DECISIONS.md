# Engineering Decisions

## Chronological Decision Log

### 1. Root monorepo layout

I kept the project as one repository with separate `backend`, `frontend`, and `db` folders because the assignment needs one reviewable delivery and one eventual `docker compose up` entry point.

### 2. Node.js and Express for the backend

I used Node.js and Express because the assignment explicitly allows it and the project is a straightforward API + UI system.

### 3. PostgreSQL for persistence

I chose PostgreSQL because the project needs relational joins, ticket lifecycle data, outage windows, and structured topology metadata. The assignment also benefits from deterministic querying.

### 4. React and Tailwind for the frontend

I used React for the operator console and Tailwind for styling because the UI needs to be maintainable, fast to iterate on, and easy to keep consistent across panels.

### 5. OpenStreetMap for the map

I used OpenStreetMap through Leaflet because the brief requires a map-like operator console and OSM is open, lightweight, and simple to wire in.

### 6. Algorithmic localization over LLM localization

I explicitly kept fault localization in deterministic graph code. That decision makes the result testable, explainable, and safer for a control-room workflow.

### 7. LLM only for dispatch summaries

I limited AI use to a short dispatch summary because that is a good fit for language generation. It improves operator handoff without touching the math that finds the fault.

## Documented Assumptions

- The grid is radial and can be treated as a tree for the localization path.
- `seq` is more trustworthy than timestamps for ordering telemetry.
- Missing topology can be approximated geometrically from GPS coordinates.
- Scheduled outages should not become fault tickets.
- The control room cares more about one correct ticket than many low-confidence alerts.

## Scope Cuts

To stay within the time budget, I did not build:

- Real authentication or SSO.
- Crew routing and dispatch optimization.
- A mobile app.
- Historical analytics and reporting.
- Multi-city support.
- Production-grade background job infrastructure.

## Future Improvements

If I had two more weeks, I would:

- Add a proper seeded dataset and a stronger demo story for the simulator.
- Harden backend validation and add more integration tests.
- Add persistent audit trails for each lifecycle change.
- Improve the topology inference with richer graph heuristics and more metadata checks.
- Add a clearer operator workflow for ticket notes, assignment, and closure history.

## Fragile Points

- The current system still needs live Docker/Postgres verification.
- The topology inference is a geometric fallback, not a substitute for real topology data.
- The simulator flow is functional but still should be exercised end to end in a live stack.
