# Los Agentles

Morning day planner for the indecisive student. Built for LAHacks 2026.

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

All agents share a single `requirements.txt`. Each agent has its own venv.

### First-time setup (run once per agent)

```bash
cd agents/<agent-name>
python -m venv venv
source venv/Scripts/activate   # Windows (Git Bash / PowerShell uses: .\venv\Scripts\Activate.ps1)
# source venv/bin/activate     # macOS / Linux
pip install -r ../requirements.txt
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
| weather    | 8001 |
| outfit     | 8002 |
| music      | 8003 |
| restaurant | 8004 |
| wellness   | 8005 |
| schedule   | 8006 |

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
  /weather
  /outfit
  /music
  /restaurant
  /wellness
  /schedule
  /shared        context.py, chatProtocol.py
```

---

## Environment Variables

| File | Key | Description |
|------|-----|-------------|
| `backend/.env` | `DATABASE_URL` | Supabase PostgreSQL connection string |
| `backend/.env` | `ANTHROPIC_API_KEY` | Anthropic API key |
| `backend/.env` | `OPENWEATHER_API_KEY` | OpenWeatherMap API key for weather service |
| `backend/.env` | `YELP_API_KEY` | Yelp Fusion API key for restaurant service |
| `agents/weather/.env` | `OPEN_WEATHER_API` | OpenWeatherMap API key |
| `agents/weather/.env` | `AGENTVERSE_API` | Fetch.ai Agentverse API key |
