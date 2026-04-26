# Los Agentles

Morning day planner for the indecisive student. Built for LAHacks 2026.

Current dashboard modules: `weather`, `outfit`, `music`, `energy`, and `meal` plus an optional `custom_agent` runner.

## Prerequisites

- Node.js 20+
- Python 3.11+
- PostgreSQL (via Supabase)

---

## Frontend

```bash
cd frontend
npm install
npm run dev          # Vite on http://localhost:5173
```

---

## Backend

```bash
cd backend
npm install
npm run dev          # Express on http://localhost:3001
```

Verify: `curl http://localhost:3001/health` → `{"status":"ok"}`

Copy and fill in env vars:
```bash
cp .env.example .env
```

Generate Prisma client (requires `DATABASE_URL` set):
```bash
npx prisma generate
```

Apply schema changes with your preferred migration flow for your environment.

---

## Agents

### First-time setup (run once per agent)

```bash
cd agents/<agent-name>
python -m venv venv
source venv/Scripts/activate   # Windows (Git Bash / PowerShell uses: .\venv\Scripts\Activate.ps1)
# source venv/bin/activate     # macOS / Linux
pip install -r requirements.txt
```

### Run an agent

```bash
cd agents/weather
source venv/Scripts/activate   # Windows Git Bash
python agent.py
```

### Agent ports

| Agent      | Port |
|------------|------|
| orchestrator | 8000 |
| weather    | 8001 |
| outfit     | 8002 |
| music      | 8003 |
| energy     | 8005 |
| meal       | 8006 |

---

## Project Structure

```
/frontend        React + Vite + Tailwind + Framer Motion + TanStack Query
/backend         Node + Express + TypeScript + Prisma
  /src
    /routes      session.ts, preferences.ts, feedback.ts, profile.ts, request.ts
    /services    promptParser.ts, agentOrchestrator.ts, userContext.ts, users.ts
    /types       dayContext.ts
  /prisma        schema.prisma
/agents
  /orchestrator
  /weather
  /outfit
  /music
  /energy
  /meal
  /restaurant   (not active in current dashboard pipeline)
  /wellness     (legacy / not active in current dashboard pipeline)
  /schedule     (legacy / not active in current dashboard pipeline)
  /shared        context.py, chatProtocol.py
```

---

## Environment Variables

| File | Key | Description |
|------|-----|-------------|
| `backend/.env` | `DATABASE_URL` | Supabase PostgreSQL connection string |
| `backend/.env` | `PYTHON_ORCHESTRATOR_URL` | Python orchestrator run endpoint (default `http://localhost:8000/run`) |
| `backend/.env` | `MUSIC_AGENT_URL` | Music agent endpoint for regeneration (default `http://localhost:8003/run`) |
| `backend/.env` | `OUTFIT_AGENT_URL` | Outfit agent endpoint for regeneration (default `http://localhost:8002/run`) |
| `backend/.env` | `MEAL_AGENT_URL` | Meal agent endpoint for regeneration (default `http://localhost:8006/run`) |
| `backend/.env` | `BACKEND_INTERNAL_RESULTS_URL` | Internal callback URL used by custom async runner (default `http://localhost:3001/internal/results`) |
| `backend/.env` | `CUSTOM_AGENT_ALLOWED_HOSTS` | Comma-separated hostname allowlist for custom Agentverse runs |
| `backend/.env` | `INTERNAL_RESULTS_KEY` | Shared secret required by `POST /internal/results` (`x-internal-key`) |
| `backend/.env` | `OPENWEATHER_API_KEY` | OpenWeatherMap API key for weather service |
| `backend/.env` | `YELP_API_KEY` | Yelp Fusion API key for restaurant service |
| `agents/orchestrator/.env` | `BACKEND_INTERNAL_RESULTS_URL` | Backend callback endpoint (default `http://localhost:3001/internal/results`) |
| `agents/orchestrator/.env` | `INTERNAL_RESULTS_KEY` | Shared secret sent as `x-internal-key` callback header |
| `agents/orchestrator/.env` | `WEATHER_AGENT_URL` | Weather agent run endpoint |
| `agents/orchestrator/.env` | `MUSIC_AGENT_URL` | Music agent run endpoint |
| `agents/orchestrator/.env` | `ENERGY_AGENT_URL` | Energy agent run endpoint |
| `agents/orchestrator/.env` | `MEAL_AGENT_URL` | Meal agent run endpoint |
| `agents/energy/.env` | `ENERGY_AGENT_PORT` | Energy agent port (default `8005`) |
