# Los Agentles 2026

## What We're Building

A morning day planner for the indecisive student. The user describes their morning in a text prompt; the app returns a set of concrete, coherent recommendations across weather, outfit, music, energy, and meal planning — all consistent with each other and grounded in real-time data. The goal is to eliminate the gray area of indecision during the morning rush by giving the user something specific to say yes or no to.

**Demo target:** A judge types "I'm stressed, have a midterm at 2pm, and it's cold outside" and receives a weather card, a weather-appropriate outfit, a calming playlist, an energy/focus recommendation stream, and UCLA meal picks that all feel coherent together.

---

## Architecture

### Data Flow

1. User opens app → anonymous `user_key` generated, stored in localStorage
2. Frontend resolves/creates anonymous user context (`x-user-key`) on API calls
3. User updates profile/preferences (`/profile`, `/preferences`) to shape prompt context
4. User starts a day plan request → server creates `request_id` via `POST /request`
5. User submits prompt/session request (`POST /session`) with `user_key` + `request_id`
6. Backend composes `user_context` from preferences, recent sessions, and feedback signals
7. Backend parser creates enriched `day_context` JSON (local heuristic parsing + stored user context)
8. Backend orchestration writes immediate fallback output for `energy` and `meal`, then asynchronously calls the Python orchestrator for `weather`/`outfit`/`music`/`energy`/`meal`
9. Python orchestrator posts callback outputs to `POST /internal/results`
10. Frontend polls session/request status and renders cards progressively
11. User feedback (`/feedback`) is stored and fed back into future context assembly

### Backend Routes

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/health` | Basic backend liveness check |
| POST | `/session` | Creates a session for the current anonymous user and triggers orchestration |
| GET | `/session` | Returns recent sessions for the current anonymous user |
| GET | `/session/:id` | Returns session + all agent outputs (ownership checked) |
| POST | `/session/:id/regenerate/music` | Regenerates the music card for an existing session |
| POST | `/session/:id/regenerate/outfit` | Regenerates the outfit card for an existing session |
| POST | `/session/:id/regenerate/meal` | Regenerates the meal card for an existing session |
| POST | `/session/:id/custom-agent/run` | Runs a user-specified Agentverse endpoint and stores output as `custom_agent` |
| POST | `/preferences` | Saves/updates user preference profile |
| POST | `/feedback` | Stores per-module feedback signals (`liked`/`disliked`/etc.) |
| GET | `/profile` | Returns persisted user profile context for the current anonymous user |
| PUT | `/profile` | Saves profile context (name, location, routine, preference text) |
| POST | `/request` | Creates `request_id` for idempotent day-plan runs |
| GET | `/request/:id` | Returns request + per-agent completion state |
| GET | `/weather/hourly` | Returns normalized 3-hour forecast entries for a location |
| GET | `/maps/preview-image` | Returns static location map preview image |
| POST | `/internal/results` | Internal callback endpoint for orchestrator/agent output ingestion (requires `x-internal-key`) |

---

## Tech Stack

### Frontend
- **Framework:** React + Vite
- **Styling:** Tailwind CSS
- **State:** React state/hooks + localStorage-backed user/session utilities
- **Data fetching:** TanStack Query
- **Animation:** Framer Motion
- **Component library:** None (custom components)

### Backend
- **Runtime:** Node.js + Express
- **Language:** TypeScript
- **API style:** REST

### Database
- PostgreSQL + Prisma
- Anonymous-first identity keyed by `users.anon_key`
- Session and agent output persistence for progressive rendering
- Feedback and memory snapshot tables for preference learning over time

### Database Framework (Current)

Current persisted models:
- `users` — anonymous identity (`anon_key`), ownership root, and persisted profile fields (`name`, `location`, `morning_focus`, `routine_notes`, `dietary_profile`, `food_preferences`, `music_profile`, `style_profile`)
- `sessions` — per-plan request payload + parsed context snapshot
- `agent_outputs` — per-agent outputs, timestamps, completion evidence, and optional `request_id` linkage
- `user_preferences` — normalized cuisine/music/style preference arrays
- `feedback_events` — per-module feedback signals and metadata (`module_variant`, `reason_code`, `session_phase`, `score`)
- `user_memory_snapshots` — summarized longitudinal memory windows
- `plan_requests` — one `request_id` per day-plan initiation, lifecycle status
- `plan_request_agents` — per-agent status for idempotent execution and dedupe

### Frontend Architecture (Current)

- Route-level views: landing (`/`) and dashboard (`/dashboard`) are selected in `App.tsx` with client-side history state.
- Dashboard orchestration in `DashboardView`:
  - Maintains `user_key`, active `session_id`, and active `request_id` in localStorage.
  - Automatically resumes latest session when available; otherwise creates a fresh request + session.
  - Uses TanStack Query to poll both session outputs and request/agent status.
  - Maps progressive agent completion into per-card loading states for `weather`, `outfit`, `music`, `energy`, and `meal`.
  - Stores profile locally and syncs to backend via `/profile`.
  - Profile save triggers a fresh session using updated context.
  - Captures card/panel feedback and sends to `/feedback`.
  - Supports weather hourly forecast full-screen modal via `/weather/hourly`.
  - Supports music/outfit/meal regeneration via `/session/:id/regenerate/{music|outfit|meal}`.
  - Includes a custom agent module that runs `/session/:id/custom-agent/run` and displays external Agentverse output.
- UI composition:
  - Reusable modules: `DashboardCard`, `ExpandedPanel`, `StatBox`, `ProfileModal`, `DashboardHeader`, `Logo`.
  - Live `Current Time` stat box in dashboard updates every second.
  - Dashboard background includes static ambient orbs plus intermittent accent pulse animation for ambient motion.

### LLM
- **Backend parser/orchestration shell:** deterministic TypeScript logic + heuristics in Node
- **Python orchestrator + agents:** ASI models (`asi1`, `asi1-mini`) via OpenAI-compatible client

### External APIs
- **OpenWeatherMap** — free tier: 1,000 calls/day
- **Mapbox** — geocoding + static map preview images
- **Spotify oEmbed/Search** — track enrichment + album art/embed metadata
- **ASI API**

---

## Agents

### Orchestrator / Prompt Parser
Node backend creates session context, parses the prompt into `day_context`, and coordinates request lifecycle state. It also dispatches to a Python orchestrator service and ingests callback outputs via `/internal/results`.

### Weather Agent
Returns current weather context and card payload data consumed by the dashboard.
- **Fallback:** hardcoded default conditions if API fails.

### Outfit Agent
Takes weather output + user's saved style preferences. Returns a specific outfit recommendation (top, bottom, shoes, outerwear) using Claude's fashion knowledge combined with weather context. No external fashion API.
- **Fallback:** generic weather-appropriate suggestion with no style context.

### Music Agent
Takes mood and energy level from `day_context`. Returns playlist name, vibe text, preview sentence, and track suggestions with Spotify metadata enrichment when available.
- **Fallback:** default calming/focus playlist payload.

### Energy Module
Current dashboard includes an `energy` card generated by the Python energy agent and rendered with a curve plot, peak/dip windows, wellness tips, and motivational quote.
- **Fallback:** Node pre-seeds a deterministic energy payload so the card can render while async orchestration runs.

### Meal Agent
Generates a UCLA-focused meal plan card (`breakfast`, `lunch`, `dinner`) using prompt context, profile dietary signals, and a UCLA menu snapshot from backend scraping.
- **Fallback:** Node pre-seeds a deterministic UCLA meal payload so the card can render while async orchestration runs.

### Custom Agent Runner
Allows the user to submit an Agentverse address and freeform prompt from the dashboard. Backend validates host + input, rate-limits per user, runs asynchronously, and writes output under `agent_name = custom_agent`.

---

## In Scope

- Morning text prompt input
- Backend prompt parsing + request orchestration (`request_id` + per-agent status tracking)
- Weather, outfit, music, energy, and meal card pipeline
- Modular card UI with progressive loading and expandable detail panels
- Full-screen in-app hourly forecast modal
- User preference profile (dietary restrictions, food preferences, music/style preferences stored in Postgres)
- Optional custom Agentverse run module in dashboard
- All agents registered on Agentverse

## Out of Scope (for now)

- Full Spotify recommendations API integration
- Outfit purchasing / product links
- Restaurant and wellness card reintegration
- Wellness integration with wearables (Fitbit, Apple Health)
- Calendar integration
- Mobile-responsive UI
- User auth

## Stretch Goals (priority order)

1. Improve music recommendations with richer Spotify-backed metadata
2. Outfit agent with real product links (Google Shopping scrape)
3. Reintroduce restaurant and wellness modules into current request pipeline
4. Persistent user preference profile across sessions
5. Mobile-responsive UI polish

---

## MVP Definition

The MVP is complete when:
- A user can type a morning prompt and receive five populated cards (`weather`, `outfit`, `music`, `energy`, `meal`)
- Recommendations are internally consistent (e.g., outfit reflects weather, music/energy align with mood, and meals align with dietary context)
- All agents are registered on Agentverse
- The UI has a modular card layout with toggles for each agent

---

## Decisions Log

<!-- Append one-liners here whenever an architecture choice is made. Format: YYYY-MM-DD — decision -->
2026-04-25 — Agents use asi1-mini (ASI API); Claude Sonnet reserved for prompt parser and orchestrator only.
2026-04-25 — Anonymous-first persistence adopted (`user_key` + `anon_key`) to support fast hackathon personalization without full auth.
2026-04-25 — Feedback events and user context assembly added as first-class prompt steering inputs.
2026-04-25 — Request-level orchestration with `request_id` and per-agent completion tracking implemented to prevent duplicate API/LLM calls.
2026-04-25 — Dashboard UX now includes progressive card loading states, profile completeness badge, live current-time stat, and ambient background pulse motion.
2026-04-26 — Weather detail now includes a full-screen in-app hourly forecast modal backed by `/weather/hourly`.
2026-04-26 — Map preview support added via backend `/maps/preview-image` endpoint using Mapbox.
2026-04-26 — Active dashboard card set expanded to `weather`, `outfit`, `music`, `energy`, `meal`.
2026-04-26 — Profile model split dietary inputs into `dietary_profile` and `food_preferences` for stronger meal personalization.
2026-04-26 — Custom Agentverse runner added to session flow (`/session/:id/custom-agent/run`) with host allowlist + cooldown.
