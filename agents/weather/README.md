![tag:innovationlab](https://img.shields.io/badge/innovationLab-3D8BD3)
![tag:hackathon](https://img.shields.io/badge/hackathon-5F43F1)

# Weather Agent

**Port:** 8001 | **Name:** `weather-agent`

A context agent that resolves a location string to coordinates via OpenWeatherMap geocoding, fetches current conditions and a 5-day/3-hour forecast, groups forecast slots into morning/afternoon/evening/night periods, and returns a structured weather payload. An `asi1-mini` call generates a short friendly narrative summarising how conditions evolve through the day.

## What it does

- Accepts a plain location string, lat/lon coordinates, or relative date expressions ("tomorrow morning", "this weekend")
- Returns temperature °F/°C, feels-like, humidity, wind speed, condition, and an AI-generated narrative
- Falls back to mild 68°F clear conditions if the OpenWeatherMap API is unavailable
- Responds to both the uAgents chat protocol and orchestrator `ContextAgentRequest` messages

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/run` | Fetch current weather + forecast narrative for a location |

## Environment variables

| Variable | Description |
|----------|-------------|
| `WEATHER_AGENT_SEED` | Agent wallet seed |
| `OPEN_WEATHER_API` | OpenWeatherMap API key |
| `ASI_API_KEY` | ASI:One API key for narrative generation |
