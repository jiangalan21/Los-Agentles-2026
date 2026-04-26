![tag:innovationlab](https://img.shields.io/badge/innovationLab-3D8BD3)
![tag:hackathon](https://img.shields.io/badge/hackathon-5F43F1)

# Outfit Agent

**Port:** 8002 | **Name:** `outfit-agent`

An action agent that selects a coherent outfit from the user's wardrobe database, prioritising mood and schedule context over raw weather data. Queries `clothing_items` in Postgres for temperature-appropriate candidates, then passes them to `asi1-mini` with user mood, stress level, schedule notes, and style preferences to pick a final top/bottom/shoes/outerwear combination.

## What it does

- Classifies temperature (°F) into hot/warm/room/cool/cold buckets and queries adjacent buckets so thin wardrobes still surface candidates
- Style hints promote matching wardrobe items via `ILIKE` ordering before random variety kicks in
- Returns `item_id` references back to the clothing database for potential future product linking
- Falls back to a generic white tee + dark jeans + white sneakers card if the DB or LLM is unavailable

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/run` | Generate an outfit card given weather + user context |

## Environment variables

| Variable | Description |
|----------|-------------|
| `OUTFIT_AGENT_SEED` | Agent wallet seed |
| `ASI_ONE_API_KEY` | ASI:One API key for outfit selection |
| `DATABASE_URL` | Postgres connection string for the `clothing_items` table |
