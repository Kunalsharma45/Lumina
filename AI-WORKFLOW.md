# AI Workflow Report

## Tools Used

- GitHub Copilot in VS Code.
- ChatGPT-style coding assistance through the current agent workflow.

## Delegation Breakdown

### Mostly AI-generated

- Initial scaffolding for the backend API structure.
- The topology inference and fault detection services.
- The first-pass frontend console layout.
- The documentation drafts.

### Heavily edited by hand

- The PostgreSQL schema details.
- The ticket lifecycle rules and telemetry verification checks.
- The simulator scenario flow.
- The final UI cleanup and removal of fallback debug controls.

## AI Mistakes and Hallucinations Caught

### 1. Wrong responsibility for localization

An early version leaned too much toward a generic AI approach for fault detection. I corrected that by keeping fault localization algorithmic and using AI only for the dispatch summary.

### 2. Fallback controls in the simulator UI

The first version of the simulator panel kept old seed and fault buttons as fallback actions. I removed them because the main UI should focus on the single scenario workflow.

### 3. Initial documentation gaps

The first status note was useful but too narrow for the assignment deliverables. I expanded the docs into the required reviewer-facing files.

## Estimated AI Contribution

Rough estimate: 65% to 75% of the codebase was initially generated or heavily assisted by AI, followed by substantial manual correction and cleanup.

## Best Prompts

- Build a localized fault detection service that uses sequence ordering, not timestamps.
- Create a React operator console with OpenStreetMap and a ticket workflow.
- Generate a synthetic scenario endpoint that seeds the grid and injects a fault.
- Write reviewer-facing docs for architecture, deployment, decisions, and AI workflow.

## Notes on Review Discipline

The most valuable pattern was to let AI draft the first version, then verify it against the assignment constraints and the actual code paths.
