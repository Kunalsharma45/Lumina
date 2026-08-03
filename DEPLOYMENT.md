# Deployment Guide

## Prerequisites

- Docker 24+.
- Docker Compose v2+.
- Node.js 22+ for local development outside Docker.

## Step-by-Step Commands

```bash
git clone <your-repo-url>
cd Propel
docker compose up
```

If you want to run without Docker for development:

```bash
cd backend
npm install
npm start
```

```bash
cd frontend
npm install
npm run dev
```

## Environment Variables

### Backend

- `PORT` - HTTP port for the backend server.
- `DATABASE_URL` - PostgreSQL connection string.

### Frontend

- `VITE_API_URL` - Base URL for the backend API.

See [backend/.env.example](backend/.env.example) and [frontend/.env.example](frontend/.env.example).

## Verification Checklist

1. Start the stack with `docker compose up`.
2. Confirm PostgreSQL starts without errors.
3. Confirm the backend logs `Server running: http://localhost:3000`.
4. Open the frontend in the browser.
5. Use the simulator panel to create a scenario.
6. Confirm tickets appear in the list and on the map.
7. Try the resolve flow and confirm the backend rejects closure until telemetry shows restored poles.

## Troubleshooting

### Port already in use

If Docker reports a port conflict on 3000, 5173, or 5432, stop the conflicting process or change the published port in `docker-compose.yml`.

### CORS errors

If the frontend cannot call the backend, confirm `VITE_API_URL` points to the backend host and that CORS is enabled in [backend/src/server.js](backend/src/server.js).

### Database startup timing

If the backend starts before PostgreSQL is ready, restart the stack. The compose file uses a health check, but cold startup can still take a moment.

### Empty ticket list after scenario creation

Verify that the simulator scenario endpoint returned a scenario payload and that the backend can reach PostgreSQL through `DATABASE_URL`.

### Free-hosting cold starts

If you deploy to a free tier, expect slow first requests after idle periods. Increase timeout and health-check windows if needed.

## Reset Command

```bash
docker compose down -v
```

This removes the containers and the PostgreSQL volume so the database starts fresh on the next `docker compose up`.
