![tag:innovationlab](https://img.shields.io/badge/innovationLab-3D8BD3)
![tag:hackathon](https://img.shields.io/badge/hackathon-5F43F1)

# Orchestrator Agent

**Port:** 8000 | **Name:** `dayger`

The central coordinator for every day-plan run. Accepts a morning prompt from the Express backend via a REST `POST /run`, parses it into structured context using `asi1-mini`, then fans out to the weather, outfit, music, and energy agents in parallel. Aggregates all four card payloads and posts them back to the backend via `POST /internal/results` so the frontend can poll for progressive card rendering.

## What it does

- Parses free-form morning prompts into mood, stress level, schedule notes, and location hints
- Runs weather first, then fans out outfit + music concurrently, then calls energy
- Falls back to hardcoded card defaults if any downstream agent fails
- Also listens on the uAgents chat protocol for direct Agentverse chat sessions

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/run` | Start a day-plan pipeline run for a given session |

## Environment variables

| Variable | Description |
|----------|-------------|
| `DAYGER_SEED_VALUE` | Agent wallet seed |
| `ASI_ONE_API_KEY` | ASI:One API key for prompt parsing and synthesis |
| `BACKEND_URL` | Express backend base URL (default: `http://localhost:3001`) |
| `INTERNAL_API_KEY` | Shared secret for the `/internal/results` callback |
