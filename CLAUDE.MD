# Los Agentles 2026

## What We're Building

A morning day planner for the indecisive student. The user describes their morning in a text prompt; the app returns a set of concrete, coherent recommendations across weather, outfit, music, food, and wellness — all consistent with each other and grounded in real-time data. The goal is to eliminate the gray area of indecision during the morning rush by giving the user something specific to say yes or no to.

**Demo target:** A judge types "I'm stressed, have a midterm at 2pm, and it's cold outside" and receives a weather card, a weather-appropriate outfit, a calming playlist, a nearby comfort food restaurant, and a short wellness tip like "try box breathing before your exam."

---

## Architecture

### Data Flow

1. User opens app → UUID generated, stored in localStorage
2. User submits morning prompt → `POST /session`
3. Node backend calls Claude Sonnet to parse prompt → `day_context` JSON
4. Backend fetches user preferences from Postgres → merges into `day_context`
5. Backend calls weather agent → weather data added to `day_context`
6. Backend calls remaining agents **in parallel** with full `day_context`
7. Each agent response stored in `agent_outputs` table as it arrives
8. Frontend polls `GET /session/:id` via TanStack Query
9. Cards render progressively as outputs arrive

### Backend Routes

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/session` | Creates session, triggers prompt parsing |
| GET | `/session/:id` | Returns session + all agent outputs |
| POST | `/preferences` | Saves/updates user preferences |

---

## Tech Stack

### Frontend
- **Framework:** React + Vite
- **Styling:** Tailwind CSS
- **State:** Zustand
- **Data fetching:** TanStack Query
- **Component library:** shadcn/ui

### Backend
- **Runtime:** Node.js + Express
- **Language:** TypeScript
- **API style:** REST

### Database
- PostgreSQL + Prisma

### LLM
- **Prompt parser:** Claude Sonnet (Anthropic API)
- **Orchestrator:** Claude Sonnet (Anthropic API)
- **Agents:** asi1-mini (ASI API)

### External APIs
- **OpenWeatherMap** — free tier: 1,000 calls/day
- **Yelp Fusion** — free tier: 500 calls/day
- **Spotify Web API** — free (integration deferred; see out of scope)
- **Anthropic API**

---

## Agents

### Orchestrator / Prompt Parser
Not a registered agent — a Claude Sonnet call that runs before everything else. Converts the raw morning prompt into a structured `day_context` JSON (mood, energy level, events, location, preferences, etc.) that every downstream agent receives. This is what makes recommendations coherent across agents.

### Weather Agent
The foundation — every other agent depends on its output. Hits OpenWeatherMap with the user's location; returns current conditions, temperature, and a short forecast. Runs first, before any other agent.
- **Fallback:** hardcoded default conditions if API fails.

### Outfit Agent
Takes weather output + user's saved style preferences. Returns a specific outfit recommendation (top, bottom, shoes, outerwear) using Claude's fashion knowledge combined with weather context. No external fashion API.
- **Fallback:** generic weather-appropriate suggestion with no style context.

### Music Agent
Takes mood and energy level from `day_context`. Returns a themed playlist — name, vibe description, and 5–10 track suggestions — using Claude's music knowledge. Spotify recommendations API is a stretch goal.
- **Fallback:** Claude-generated track list from mood alone.

### Restaurant Agent
Takes weather, mood, location, and cuisine preferences. Hits Yelp Fusion and returns 2–3 restaurants with name, rating, distance, cuisine type, and a one-line Claude-generated reason why it fits today specifically.
- **Fallback:** top-rated nearby options with no mood filtering if context parsing fails.

### Wellness Agent
Takes mood, energy level, hard events, and weather. Returns 2–3 short, specific wellness nudges (e.g., box breathing before a stressful event, hydration reminder on a hot day, walk suggestion for low energy). Intentionally brief and actionable — not therapy. No external API.
- **Fallback:** three generic but universally applicable wellness tips.

---

## In Scope

- Morning text prompt input
- Prompt parser (Claude Sonnet → `day_context` JSON)
- Weather, outfit, music, restaurant, and wellness agents
- Modular card UI with per-agent toggles
- User preference profile (cuisine, music, style preferences stored in Postgres)
- All agents registered on Agentverse

## Out of Scope (for now)

- Spotify API integration (developer plan too limited for hackathon)
- Outfit purchasing / product links
- Grocery/recipe recommendations
- Wellness integration with wearables (Fitbit, Apple Health)
- Calendar integration
- Mobile-responsive UI
- User auth
- Google Maps (too expensive — use alternatives)

## Stretch Goals (priority order)

1. Music agent with live Spotify track data
2. Outfit agent with real product links (Google Shopping scrape)
3. Grocery/recipe agent
4. Persistent user preference profile across sessions
5. Mobile-responsive UI

---

## MVP Definition

The MVP is complete when:
- A user can type a morning prompt and receive at least four populated agent cards (weather, outfit, restaurant, music, and/or wellness)
- Recommendations are internally consistent (outfits match weather, restaurant matches mood, etc.)
- All agents are registered on Agentverse
- The UI has a modular card layout with toggles for each agent

---

## Decisions Log

<!-- Append one-liners here whenever an architecture choice is made. Format: YYYY-MM-DD — decision -->
2026-04-25 — Agents use asi1-mini (ASI API); Claude Sonnet reserved for prompt parser and orchestrator only.
