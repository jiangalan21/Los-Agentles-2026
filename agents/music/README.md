![tag:innovationlab](https://img.shields.io/badge/innovationLab-3D8BD3)
![tag:hackathon](https://img.shields.io/badge/hackathon-5F43F1)

# Music Agent

**Port:** 8003 | **Name:** `music-agent`

An action agent that curates a personalised 5-track morning playlist using `asi1-mini`. Takes mood, stress level, schedule notes, desired vibe, preferred genres, past liked/disliked vibes, and current weather as input. After the LLM returns a playlist, resolves each track to a Spotify ID via the Spotify Search API for downstream embed metadata.

## What it does

- Incorporates longitudinal feedback signals (liked/disliked vibes) to steer recommendations away from previously unwanted moods
- Enriches each track with a `spotify_id` when Spotify credentials are configured
- Returns a playlist name, mood descriptor tags, a preview sentence, and the 5-track list
- Falls back to a curated classical/ambient playlist (Satie, Debussy, Einaudi) if the LLM or API is unavailable

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/run` | Generate a playlist card given mood + user context |

## Environment variables

| Variable | Description |
|----------|-------------|
| `AGENT_SEED` | Agent wallet seed |
| `ASI1_API_KEY` | ASI:One API key for playlist generation |
| `SPOTIFY_CLIENT_ID` | Spotify app client ID for track ID resolution |
| `SPOTIFY_CLIENT_SECRET` | Spotify app client secret |
