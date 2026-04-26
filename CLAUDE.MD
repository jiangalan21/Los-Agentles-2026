# Los Agentles 2026

## What We're Building

A morning day planner for the indecisive student. The user describes their morning in a text prompt; the app returns a set of concrete, coherent recommendations across weather, outfit, music, food, and wellness — all consistent with each other and grounded in real-time data. The goal is to eliminate the gray area of indecision during the morning rush by giving the user something specific to say yes or no to.

**Demo target:** A judge types "I'm stressed, have a midterm at 2pm, and it's cold outside" and receives a weather card, a weather-appropriate outfit, a calming playlist, a nearby comfort food restaurant, and a short wellness tip like "try box breathing before your exam."

---

## Architecture

### Data Flow

1. User opens app → anonymous `user_key` generated, stored in localStorage
2. Frontend resolves/creates anonymous user context (`x-user-key`) on API calls
3. User updates profile/preferences (`/profile`, `/preferences`) to shape prompt context
4. User starts a day plan request → server creates `request_id` via `POST /request`
5. User submits prompt/session request (`POST /session`) with `user_key` + `request_id`
6. Backend composes `user_context` from preferences, recent sessions, and feedback signals
7. Prompt parser creates enriched `day_context` JSON
8. Orchestrator runs agents and records per-agent output/status
9. Frontend polls session/request status and renders cards progressively
10. User feedback (`/feedback`) is stored and fed back into future context assembly

### Backend Routes

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/session` | Creates a session for the current anonymous user and triggers orchestration |
| GET | `/session` | Returns recent sessions for the current anonymous user |
| GET | `/session/:id` | Returns session + all agent outputs (ownership checked) |
| POST | `/preferences` | Saves/updates user preference profile |
| POST | `/feedback` | Stores per-module feedback signals (`liked`/`disliked`/etc.) |
| GET | `/profile` | Returns persisted user profile context for the current anonymous user |
| PUT | `/profile` | Saves profile context (name, location, routine, preference text) |
| POST | `/request` | Creates `request_id` for idempotent day-plan runs |
| GET | `/request/:id` | Returns request + per-agent completion state |

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
- `users` — anonymous identity (`anon_key`), ownership root, and persisted profile fields (`name`, `location`, `morning_focus`, `routine_notes`, `dietary_profile`, `music_profile`, `style_profile`)
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
  - Uses TanStack Query to poll both session outputs and request/agent status.
  - Maps progressive agent completion into per-card loading states.
  - Stores profile locally and syncs to backend via `/profile`.
  - Captures card/panel feedback and sends to `/feedback`.
- UI composition:
  - Reusable modules: `DashboardCard`, `ExpandedPanel`, `StatBox`, `ProfileModal`, `DashboardHeader`, `Logo`.
  - Live `Current Time` stat box in dashboard updates every second.
  - Dashboard background includes static ambient orbs plus intermittent accent pulse animation for ambient motion.

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
2026-04-25 — Anonymous-first persistence adopted (`user_key` + `anon_key`) to support fast hackathon personalization without full auth.
2026-04-25 — Feedback events and user context assembly added as first-class prompt steering inputs.
2026-04-25 — Request-level orchestration with `request_id` and per-agent completion tracking implemented to prevent duplicate API/LLM calls.
2026-04-25 — Dashboard UX now includes progressive card loading states, profile completeness badge, live current-time stat, and ambient background pulse motion.
