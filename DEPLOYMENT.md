# 🛠️ DEPLOYMENT.md — Operations & Troubleshooting Guide

## 1. Prerequisites & Version Requirements

- **Docker Desktop**: v24.0+
- **Docker Compose**: v2.20+
- **Node.js**: v22.0+ *(For local development outside Docker)*
- **PostgreSQL**: v16.0+ *(Bundled in Docker container)*

---

## 2. Step-by-Step Production Setup

### Option A: Docker Compose (Recommended One-Command Setup)

```bash
# 1. Clone Repository
git clone https://github.com/Kunalsharma45/Lumina.git
cd Lumina

# 2. Launch Full Stack (PostgreSQL, Backend API, Frontend Console)
docker compose up -d

# 3. Seed 10,000 Grid Poles in PostgreSQL
docker compose exec backend node scripts/seed_large_grid.js
```

### Option B: Local Manual Setup (Without Docker)

```bash
# 1. Start Backend Server
cd backend
npm install
npm start

# 2. In a new terminal, start Frontend Dev Server
cd frontend
npm install
npm run dev

# 3. Seed 10,000 Poles into PostgreSQL
cd backend
node scripts/seed_large_grid.js
```

---

## 3. Environment Variables Reference

Committed configuration files:
- [backend/.env.example](file:///e:/Propel/backend/.env.example)
- [frontend/.env.example](file:///e:/Propel/frontend/.env.example)

| Variable | Location | Required | Default Value | Description |
| :--- | :--- | :---: | :--- | :--- |
| `PORT` | `backend/.env` | Yes | `3000` | HTTP Port for Express API server |
| `DATABASE_URL` | `backend/.env` | Yes | `postgres://postgres:postgres@localhost:5432/lumina_db` | PostgreSQL Connection String |
| `VITE_API_URL` | `frontend/.env` | Yes | `http://localhost:3000` | Base URL for API client requests |

---

## 4. Verification Checklist

1. **Verify Backend Health**: Open [http://localhost:3000/api/telemetry/health](http://localhost:3000/api/telemetry/health) ($\rightarrow$ returns `{ "status": "ok" }`).
2. **Verify Frontend UI**: Open [http://localhost:5173](http://localhost:5173).
3. **Verify Grid Infrastructure**: Confirm topbar badge displays `⚡ 10,000 Monitored Grid Poles`.
4. **Verify Fault Simulator**:
   - Click **`1. Seed Grid Data`**: Resets grid to 10,000 live poles (0 active tickets).
   - Click **`2. Inject Span Break`**: Spawns localized fault ticket ($P_3 \rightarrow P_4$) on map.
   - Click **`3. Monsoon Scenario`**: Spawns 2 simultaneous storm fault tickets.
5. **Verify "Lying Lineman" Safety Enforcement**:
   - Click **`Mark Resolved`** on an open ticket without repairing: System blocks resolution with `409 Conflict`.
   - Click **`⚡ Repair & Send Restored Telemetry`**: System ingests live telemetry, auto-verifies, and allows ticket closure.

---

## 5. Troubleshooting Section (Real-World Failure Modes)

### 1. Port Conflicts (3000 / 5173 / 5432)
- **Symptom**: `Error: listen EADDRINUSE: address already in use :::3000`.
- **Fix**: Kill conflicting background processes:
  ```bash
  npx kill-port 3000
  npx kill-port 5173
  ```

### 2. Database Race Condition / Startup Delay
- **Symptom**: Backend crashes on startup with `connection refused at localhost:5432`.
- **Fix**: `docker-compose.yml` includes a PostgreSQL `healthcheck`. If running manually, wait 5 seconds for PostgreSQL container readiness before launching `npm start`.

### 3. OpenStreetMap CDN Tile Rate Limits (Black Tile Squares)
- **Symptom**: Map displays black square tile boxes.
- **Fix**: Replaced default OSM tile URL with high-speed CartoDB Voyager CDN (`https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png`).

### 4. Leaflet Popup Canvas Shift / Map Jumping
- **Symptom**: Map container jumps upward when clicking markers.
- **Fix**: Enforced `<Popup autoPan={false}>` across all Leaflet markers.

---

## 6. Environment Reset Procedure

To completely wipe all test data, telemetry logs, and tickets and reset PostgreSQL to a clean 10,000-pole baseline:

```bash
cd backend
node scripts/seed_large_grid.js
```
*Or via SQL:*
```sql
TRUNCATE ticket_events, tickets, scheduled_outages, telemetry, poles, transformers, feeders, substations RESTART IDENTITY CASCADE;
```
