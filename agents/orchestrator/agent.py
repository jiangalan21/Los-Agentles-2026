import asyncio
from datetime import datetime
from uuid import uuid4
import json
import time
import re
import sys
import os
from dotenv import load_dotenv
from typing import Optional, Tuple

import httpx

import requests
from openai import OpenAI
from uagents import Agent, Context, Protocol, Model
from uagents_core.contrib.protocols.chat import (
    ChatAcknowledgement,
    ChatMessage,
    EndSessionContent,
    TextContent,
    chat_protocol_spec,
)

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from shared.models import (
    ParsedUserInput,
    UserProfile,
    ContextAgentRequest,
    ContextAgentResponse,
    EnrichedContext,
    ActionAgentRequest,
    ActionAgentResponse,
)

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))
DAYGER_SEED = os.getenv("DAYGER_SEED_VALUE")
ASI_ONE_API_KEY = os.getenv("ASI_ONE_API_KEY")
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:3001")
INTERNAL_RESULTS_URL = os.getenv("BACKEND_INTERNAL_RESULTS_URL", f"{BACKEND_URL}/internal/results")
INTERNAL_RESULTS_KEY = os.getenv("INTERNAL_RESULTS_KEY", "")
INTERNAL_API_KEY = INTERNAL_RESULTS_KEY
WEATHER_AGENT_URL = os.getenv("WEATHER_AGENT_URL", "http://localhost:8001/run")
OUTFIT_AGENT_URL = os.getenv("OUTFIT_AGENT_URL", "http://localhost:8002/run")
MUSIC_AGENT_URL = os.getenv("MUSIC_AGENT_URL", "http://localhost:8003/run")
ENERGY_AGENT_URL = os.getenv("ENERGY_AGENT_URL", "http://localhost:8005/run")
MEAL_AGENT_URL = os.getenv("MEAL_AGENT_URL", "http://localhost:8006/run")
ORCHESTRATOR_PORT = int(os.getenv("ORCHESTRATOR_PORT", "8000"))
CONTEXT_STAGE_TIMEOUT_S = float(os.getenv("CONTEXT_STAGE_TIMEOUT_S", "12"))
ACTION_STAGE_TIMEOUT_S = float(os.getenv("ACTION_STAGE_TIMEOUT_S", "18"))

# Messages from ASI:One may include "[session:UUID]" at the start to link a backend session.
_SESSION_PREFIX_RE = re.compile(r'^\[session:([a-f0-9\-]{36})\]\s*', re.IGNORECASE)
_AGENT_MENTION_PREFIX_RE = re.compile(r'^\s*@agent1[0-9a-z]{20,}\s*', re.IGNORECASE)

client = OpenAI(
    base_url='https://api.asi1.ai/v1',
    api_key=ASI_ONE_API_KEY,
)


# ---------------------------------------------------------------------------
# Sub-agent addresses — swap placeholders for real agentverse addresses later
# ---------------------------------------------------------------------------

# Context agents: their outputs feed INTO the action stage
CONTEXT_AGENT_ADDRESSES = {
    "weather": os.getenv("WEATHER_AGENT_ADDRESS", ""),
    # TODO: add more context agents here (e.g. calendar, news, deals)
}

# Action agents: consume full context, produce a card for the frontend
ACTION_AGENT_ADDRESSES = {
    "outfit":   os.getenv("OUTFIT_AGENT_ADDRESS",   ""),
    "music":    os.getenv("MUSIC_AGENT_ADDRESS",    ""),
    "meal":     os.getenv("MEAL_AGENT_ADDRESS",     ""),
    "energy":   os.getenv("ENERGY_AGENT_ADDRESS",   ""),
    # TODO: add more action agents here
}


class OrchestratorRunRequest(Model):
    session_id: str
    request_id: Optional[str] = None
    prompt: str
    user_context: dict
    day_context: Optional[dict] = None
    ucla_menu_snapshot: Optional[dict] = None


class OrchestratorRunResponse(Model):
    status: str
    error: Optional[str] = None


_WEATHER_FALLBACK = {
    "condition": "Clear",
    "description": "mild conditions",
    "temperature_f": 68,
    "feels_like_f": 68,
    "humidity": 50,
    "wind_speed": 5.0,
    "narrative": "Weather service unavailable — assuming mild conditions.",
}

_OUTFIT_FALLBACK: dict = {
    "top":     {"item_id": None, "name": "Plain white t-shirt",  "reason": "Neutral, weather-appropriate base layer."},
    "bottom":  {"item_id": None, "name": "Dark jeans",           "reason": "Versatile for most conditions."},
    "shoes":   {"item_id": None, "name": "White sneakers",       "reason": "Comfortable, pairs with everything."},
    "outer":   None,
    "summary": "A simple, weather-appropriate outfit.",
}

_MUSIC_FALLBACK: dict = {
    "value": "Morning Focus",
    "detail": "Calm · Steady · Instrumental",
    "previewData": "A reliable mix to carry you through the morning",
    "tracks": [
        {"title": "Gymnopédie No.1", "artist": "Erik Satie"},
        {"title": "Clair de Lune", "artist": "Claude Debussy"},
        {"title": "River Flows in You", "artist": "Yiruma"},
        {"title": "Experience", "artist": "Ludovico Einaudi"},
        {"title": "Comptine d'un autre été", "artist": "Yann Tiersen"},
    ],
}

_ENERGY_FALLBACK: dict = {
    "headlineValue": "68% charged",
    "coachSummary": "You are moving solid. Keep the vibe steady and protect your focus window.",
    "wellnessTips": [
        "Hydrate now, then again in 45 minutes.",
        "Take one 5-minute reset walk before your first heavy task.",
        "Stack your hardest task before noon while momentum is high.",
    ],
    "energyWindows": {
        "peakStart": "10:00 AM",
        "peakEnd": "12:00 PM",
        "dipStart": "2:30 PM",
        "dipEnd": "4:00 PM",
    },
    "energyCurve": [
        {"timeLabel": "7:00 AM", "value": 42},
        {"timeLabel": "9:00 AM", "value": 63},
        {"timeLabel": "11:00 AM", "value": 80},
        {"timeLabel": "1:00 PM", "value": 71},
        {"timeLabel": "3:00 PM", "value": 52},
        {"timeLabel": "6:00 PM", "value": 60},
    ],
    "quote": {
        "text": "Small wins stack. Keep your standards high and your self-talk higher.",
        "authorOrSource": "Morning Coach",
    },
    "value": "68% charged",
    "detail": "Supportive momentum plan",
    "previewData": "Peak around late morning, dip mid-afternoon. Stay hydrated and keep the vibe up.",
    "toneTag": "supportive-frat-bro-therapist",
}


_MEAL_FALLBACK: dict = {
    "value": "Today's UCLA Meal Plan",
    "detail": "Campus-wide · Breakfast + Lunch + Dinner",
    "previewData": "Curated dishes from multiple UCLA dining spots matched to your morning.",
    "meals": {
        "breakfast": {
            "dishes": [
                {"name": "Scrambled Eggs", "station": "Grill", "reason": "High-protein morning fuel"},
                {"name": "Oatmeal", "station": "Comfort", "reason": "Slow-release energy before class"},
            ]
        },
        "lunch": {
            "dishes": [
                {"name": "Bruin Burger", "station": "Grill", "reason": "Satisfying midday protein"},
                {"name": "Garden Salad", "station": "Salad Bar", "reason": "Light and energizing"},
            ]
        },
        "dinner": {
            "dishes": [
                {"name": "Pasta Primavera", "station": "Pasta", "reason": "Carb recovery after a long day"},
                {"name": "Roasted Vegetables", "station": "Vegan", "reason": "Micronutrient boost"},
            ]
        },
    },
    "rationale": "These dishes provide balanced macros aligned with a productive study day.",
    "dietFlags": ["balanced"],
    "sourceMeta": {"diningHall": "UCLA Dining", "diningHalls": ["De Neve", "Bruin Plate", "Epicuria"], "serviceDate": "today"},
}


def _http_post(url: str, payload: dict) -> dict:
    resp = requests.post(url, json=payload, timeout=20)
    resp.raise_for_status()
    return resp.json()


def _debug_log(run_id: str, hypothesis_id: str, location: str, message: str, data: dict) -> None:
    if os.getenv("ORCHESTRATOR_DEBUG", "").lower() not in {"1", "true", "yes"}:
        return
    print(json.dumps({
        "runId": run_id,
        "hypothesisId": hypothesis_id,
        "location": location,
        "message": message,
        "data": data,
        "timestamp": int(time.time() * 1000),
    }))


async def _run_pipeline(req: OrchestratorRunRequest) -> None:
    run_id = f"run-{req.session_id}"
    parsed = parse_user_input(req.prompt)
    location = req.user_context.get("location") or parsed.location_hint or "Los Angeles"
    routine_notes = req.user_context.get("routine_notes", "") or ""

    try:
        weather_raw = await asyncio.to_thread(_http_post, WEATHER_AGENT_URL, {"location": location})
    except Exception as e:
        print(f"[orchestrator] Weather agent error: {e} — using fallback")
        weather_raw = dict(_WEATHER_FALLBACK)

    outfit_payload: dict = {
        "temperature_f": weather_raw.get("temperature_f"),
        "condition": weather_raw.get("condition"),
        "feels_like_f": weather_raw.get("feels_like_f"),
        "description": weather_raw.get("description"),
    }
    if parsed.mood:
        outfit_payload["mood"] = parsed.mood
    if parsed.stress_level:
        outfit_payload["stress_level"] = parsed.stress_level
    outfit_schedule = parsed.schedule_notes or ""
    if routine_notes:
        outfit_schedule = f"{outfit_schedule}. {routine_notes}".strip(". ")
    if outfit_schedule:
        outfit_payload["schedule_notes"] = outfit_schedule
    style_profile = req.user_context.get("style_profile")
    if style_profile:
        outfit_payload["style_profile"] = style_profile

    music_payload: dict = {}
    if parsed.mood:
        music_payload["mood"] = parsed.mood
    if parsed.stress_level:
        music_payload["stress_level"] = parsed.stress_level
    if parsed.schedule_notes:
        music_payload["schedule_notes"] = parsed.schedule_notes
    if parsed.music_vibe:
        music_payload["music_vibe"] = parsed.music_vibe
    genres = req.user_context.get("music_genres", [])
    if genres:
        music_payload["music_genres"] = genres
    liked_vibes = req.user_context.get("music_liked_vibes", [])
    if liked_vibes:
        music_payload["liked_vibes"] = liked_vibes
    disliked_vibes = req.user_context.get("music_disliked_vibes", [])
    if disliked_vibes:
        music_payload["disliked_vibes"] = disliked_vibes
    if weather_raw.get("condition"):
        music_payload["weather_condition"] = weather_raw["condition"]
    if weather_raw.get("temperature_f") is not None:
        music_payload["temperature_f"] = weather_raw["temperature_f"]

    outfit_data, music_data = await asyncio.gather(
        asyncio.to_thread(_http_post, OUTFIT_AGENT_URL, outfit_payload),
        asyncio.to_thread(_http_post, MUSIC_AGENT_URL, music_payload),
        return_exceptions=True,
    )

    if isinstance(outfit_data, Exception):
        print(f"[orchestrator] Outfit agent error: {outfit_data} — using fallback")
        outfit_data = dict(_OUTFIT_FALLBACK)
    if isinstance(music_data, Exception):
        print(f"[orchestrator] Music agent error: {music_data} — using fallback")
        music_data = dict(_MUSIC_FALLBACK)

    energy_payload: dict = {
        "prompt": req.prompt,
        "mood": parsed.mood,
        "energy_level": (req.day_context or {}).get("energy_level"),
        "wake_time": (req.day_context or {}).get("wake_time"),
        "events": (req.day_context or {}).get("events", []),
        "location": req.user_context.get("location"),
        "morning_focus": req.user_context.get("morning_focus", ""),
    }
    if parsed.stress_level:
        energy_payload["stress_level"] = parsed.stress_level
    if parsed.schedule_notes and routine_notes:
        energy_payload["schedule_notes"] = f"{parsed.schedule_notes}. {routine_notes}"
    elif parsed.schedule_notes:
        energy_payload["schedule_notes"] = parsed.schedule_notes
    elif routine_notes:
        energy_payload["schedule_notes"] = routine_notes

    meal_payload: dict = {
        "prompt": req.prompt,
        "mood": parsed.mood,
        "energy_level": (req.day_context or {}).get("energy_level"),
        "events": (req.day_context or {}).get("events", []),
        "morning_focus": req.user_context.get("morning_focus", ""),
        "dietary_profile": req.user_context.get("dietary_profile", ""),
        "food_preferences": req.user_context.get("food_preferences", ""),
    }
    if parsed.stress_level:
        meal_payload["stress_level"] = parsed.stress_level
    if req.ucla_menu_snapshot:
        meal_payload["ucla_menu_snapshot"] = req.ucla_menu_snapshot

    try:
        # region agent log
        _debug_log(run_id, "H1_H2", "agents/orchestrator/agent.py:_run_pipeline:beforeEnergyMealCall", "Calling energy + meal agents", {
            "sessionId": req.session_id,
            "requestId": req.request_id,
            "hasWakeTime": bool((req.day_context or {}).get("wake_time")),
            "energyLevel": (req.day_context or {}).get("energy_level"),
            "hasMenuSnapshot": bool(req.ucla_menu_snapshot),
        })
        # endregion
        energy_data, meal_data = await asyncio.gather(
            asyncio.to_thread(_http_post, ENERGY_AGENT_URL, energy_payload),
            asyncio.to_thread(_http_post, MEAL_AGENT_URL, meal_payload),
            return_exceptions=True,
        )
        if isinstance(energy_data, Exception):
            raise energy_data
        # region agent log
        _debug_log(run_id, "H1", "agents/orchestrator/agent.py:_run_pipeline:energySuccess", "Energy agent returned success", {
            "sessionId": req.session_id,
            "keys": sorted(list(energy_data.keys())) if isinstance(energy_data, dict) else [],
            "errorField": energy_data.get("error") if isinstance(energy_data, dict) else None,
        })
        # endregion
    except Exception as e:
        print(f"[orchestrator] Energy agent error: {e} — using fallback")
        energy_data = dict(_ENERGY_FALLBACK)
        meal_data = dict(_MEAL_FALLBACK)
        # region agent log
        _debug_log(run_id, "H1", "agents/orchestrator/agent.py:_run_pipeline:energyFallback", "Energy agent failed, fallback used", {
            "sessionId": req.session_id,
            "error": str(e),
        })
        # endregion

    if isinstance(meal_data, Exception):
        print(f"[orchestrator] Meal agent error: {meal_data} — using fallback")
        meal_data = dict(_MEAL_FALLBACK)

    # Transform outfit agent response {top/bottom/shoes/outer/summary} → card format {value/detail/previewData}
    top_name = (outfit_data.get("top") or {}).get("name", "")
    bottom_name = (outfit_data.get("bottom") or {}).get("name", "")
    shoes_name = (outfit_data.get("shoes") or {}).get("name", "")
    outer = outfit_data.get("outer")
    outer_name = outer.get("name", "") if isinstance(outer, dict) else ""
    summary = outfit_data.get("summary", "")
    piece_names = [n for n in [top_name, bottom_name, shoes_name, outer_name] if n]
    look_name_candidates = [
        outfit_data.get("look_name"),
        outfit_data.get("title"),
        outfit_data.get("name"),
        outfit_data.get("fit_name"),
    ]
    agent_look_name = next((name.strip() for name in look_name_candidates if isinstance(name, str) and name.strip()), None)
    style_label = req.user_context.get("style_profile")
    outfit_title = agent_look_name or style_label or "Today's Look"
    outfit_card = {
        "value": outfit_title,
        "detail": " · ".join(piece_names[:2]) if piece_names else "Curated outfit",
        "previewData": summary or " · ".join(piece_names),
        "items": {k: outfit_data.get(k) for k in ["top", "bottom", "shoes", "outer"]},
    }

    weather_card = {
        "value": f"{weather_raw.get('temperature_f', 68)}°F",
        "detail": f"{weather_raw.get('condition', 'Clear')} · {weather_raw.get('description', 'mild conditions')}",
        "previewData": (
            f"Feels like {weather_raw.get('feels_like_f', 68)}°. "
            f"Humidity {weather_raw.get('humidity', 50)}%. "
            f"Wind {round(weather_raw.get('wind_speed', 5))} mph.\n"
            f"{weather_raw.get('narrative', '')}"
        ),
    }

    callback_payload = {
        "sessionId": req.session_id,
        "requestId": req.request_id,
        "agents": [
            {"agentName": "weather", "output": weather_card},
            {"agentName": "outfit", "output": outfit_card},
            {"agentName": "music", "output": music_data},
            {"agentName": "energy", "output": energy_data},
            {"agentName": "meal", "output": meal_data},
        ],
    }

    try:
        # region agent log
        _debug_log(run_id, "H3_H4", "agents/orchestrator/agent.py:_run_pipeline:beforeCallback", "Posting callback to backend", {
            "sessionId": req.session_id,
            "agentNames": [agent["agentName"] for agent in callback_payload["agents"]],
            "energyErrorField": energy_data.get("error") if isinstance(energy_data, dict) else None,
        })
        # endregion
        headers = {"x-internal-key": INTERNAL_RESULTS_KEY} if INTERNAL_RESULTS_KEY else None
        response = requests.post(INTERNAL_RESULTS_URL, json=callback_payload, headers=headers, timeout=20)
        response.raise_for_status()
        print(f"[orchestrator] Callback posted for session {req.session_id}")
    except Exception as e:
        print(f"[orchestrator] Callback error for session {req.session_id}: {e}")


# ---------------------------------------------------------------------------
# Orchestrator agent
# ---------------------------------------------------------------------------

dayger = Agent(
    name='dayger',
    seed=DAYGER_SEED,
    port=ORCHESTRATOR_PORT,
    mailbox=True,
    publish_agent_details=True,
)


protocol = Protocol(spec=chat_protocol_spec)
orchestrator_proto = Protocol(name="orchestrator-pipeline", version="0.1.0")


# ---------------------------------------------------------------------------
# In-memory session store
# TODO: replace with a persistent store for production
# ---------------------------------------------------------------------------

_sessions: dict[str, dict] = {}


def _new_session(
    session_id: str,
    sender: str,
    parsed_input: ParsedUserInput,
    user_profile: UserProfile,
    backend_session_id: Optional[str] = None,
):
    active_ctx_agents = [k for k, v in CONTEXT_AGENT_ADDRESSES.items() if v]
    active_act_agents = [k for k, v in ACTION_AGENT_ADDRESSES.items() if v]
    _sessions[session_id] = {
        "sender": sender,
        "parsed_input": parsed_input,
        "user_profile": user_profile,
        "backend_session_id": backend_session_id,
        "context_expected": set(active_ctx_agents),
        "context_received": {},
        "action_expected": set(active_act_agents),
        "action_received": {},
        "action_started": False,
        "context_timeout_task": None,
        "action_timeout_task": None,
    }


# ---------------------------------------------------------------------------
# Stage 1 helpers — CONTEXT STAGE
# ---------------------------------------------------------------------------

PARSE_SYSTEM_PROMPT = """
You are a morning-prompt parser for a day-planner app.
Extract a JSON object from the user's message. Only include fields you can confidently infer.

{
  "mood": "<string or null>",
  "stress_level": "<'low'|'medium'|'high' or null>",
  "schedule_notes": "<string or null>",
  "time_available_minutes": <integer or null>,
  "weather_feel": "<string or null>",
  "location_hint": "<string or null>",
  "dietary_notes": "<string or null>",
  "music_vibe": "<string or null>",
  "requested_cards": <list of strings or null>
}

Return ONLY valid JSON, no extra text.
"""


def parse_user_input(raw_prompt: str) -> ParsedUserInput:
    """LLM call to convert a free-form morning prompt into ParsedUserInput."""
    try:
        r = client.chat.completions.create(
            model="asi1-mini",
            messages=[
                {"role": "system", "content": PARSE_SYSTEM_PROMPT},
                {"role": "user", "content": raw_prompt},
            ],
            max_tokens=512,
        )
        raw = r.choices[0].message.content.strip()
        # Strip markdown code fences if the model wraps the JSON
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        parsed = json.loads(raw.strip())
    except Exception as e:
        print(f"[orchestrator] parse_user_input error: {e}")
        parsed = {}
    return ParsedUserInput(raw_prompt=raw_prompt, **parsed)


def fetch_user_profile(user_id: str) -> UserProfile:
    """Retrieve user preferences from the database.
    TODO: replace stub with actual DB query.
    """
    return UserProfile(user_id=user_id)


async def run_context_stage(ctx: Context, session_id: str):
    """Dispatch requests to all context agents concurrently.
    Their responses come back via handle_context_response and trigger the action stage.
    """
    session = _sessions[session_id]
    request = ContextAgentRequest(
        session_id=session_id,
        parsed_input=session["parsed_input"],
        user_profile=session["user_profile"],
    )

    if not session["context_expected"]:
        # No context agents configured — skip straight to action stage
        await run_action_stage(ctx, session_id)
        return

    dispatched_agents: list[str] = []
    for agent_key, address in CONTEXT_AGENT_ADDRESSES.items():
        if not address:
            ctx.logger.warning(f"No address for context agent '{agent_key}' — skipping")
            continue
        try:
            await ctx.send(address, request)
            dispatched_agents.append(agent_key)
            ctx.logger.info(f"[CONTEXT STAGE] dispatched to {agent_key}")
        except Exception:
            ctx.logger.exception(f"[CONTEXT STAGE] failed to dispatch to {agent_key}")

    # Only wait for agents we actually dispatched to. This avoids deadlocks when routing fails.
    session["context_expected"] = set(dispatched_agents)
    if not session["context_expected"]:
        ctx.logger.warning("[CONTEXT STAGE] no context agents were dispatched — moving to action stage")
        await run_action_stage(ctx, session_id)
        return

    # Guardrail: move forward even if one context response is never delivered.
    previous_timeout = session.get("context_timeout_task")
    if previous_timeout:
        previous_timeout.cancel()
    session["context_timeout_task"] = asyncio.create_task(_context_stage_timeout(ctx, session_id))


async def _context_stage_timeout(ctx: Context, session_id: str) -> None:
    await asyncio.sleep(CONTEXT_STAGE_TIMEOUT_S)
    session = _sessions.get(session_id)
    if not session:
        return
    if session.get("action_started"):
        return
    expected = session.get("context_expected", set())
    received = set(session.get("context_received", {}).keys())
    pending = sorted(expected - received)
    if pending:
        ctx.logger.warning(
            f"[CONTEXT STAGE] timeout after {CONTEXT_STAGE_TIMEOUT_S:.1f}s; missing {pending}. Moving to action stage."
        )
        await run_action_stage(ctx, session_id)


# ---------------------------------------------------------------------------
# Stage 2 helpers — ACTION STAGE
# ---------------------------------------------------------------------------

def _build_enriched_context(session_id: str) -> EnrichedContext:
    """Assemble EnrichedContext from all gathered context data."""
    session = _sessions[session_id]
    ctx_data = session["context_received"]
    return EnrichedContext(
        session_id=session_id,
        parsed_input=session["parsed_input"],
        user_profile=session["user_profile"],
        weather=ctx_data.get("weather"),
        # TODO: map additional context agent keys here as they are added
    )


async def run_action_stage(ctx: Context, session_id: str):
    """Dispatch EnrichedContext to all action agents concurrently."""
    session = _sessions.get(session_id)
    if not session:
        return
    if session.get("action_started"):
        return
    session["action_started"] = True
    timeout_task = session.get("context_timeout_task")
    if timeout_task:
        timeout_task.cancel()
        session["context_timeout_task"] = None
    previous_action_timeout = session.get("action_timeout_task")
    if previous_action_timeout:
        previous_action_timeout.cancel()
        session["action_timeout_task"] = None

    enriched = _build_enriched_context(session_id)
    request = ActionAgentRequest(session_id=session_id, enriched_context=enriched)

    if not session["action_expected"]:
        # No action agents configured — reply with raw parsed context for dev/debug
        reply = (
            "No action agents connected yet. Parsed context:\n"
            + json.dumps(enriched.model_dump(), indent=2)
        )
        await _send_final_reply(ctx, session["sender"], reply)
        _sessions.pop(session_id, None)
        return

    dispatched_agents: list[str] = []
    for agent_key, address in ACTION_AGENT_ADDRESSES.items():
        if not address:
            ctx.logger.warning(f"No address for action agent '{agent_key}' — skipping")
            continue
        try:
            await ctx.send(address, request)
            dispatched_agents.append(agent_key)
            ctx.logger.info(f"[ACTION STAGE] dispatched to {agent_key}")
        except Exception:
            ctx.logger.exception(f"[ACTION STAGE] failed to dispatch to {agent_key}")

    # Only wait for cards from agents that were dispatched successfully.
    session["action_expected"] = set(dispatched_agents)
    if not session["action_expected"]:
        ctx.logger.warning("[ACTION STAGE] no action agents were dispatched — returning enriched context reply")
        reply = (
            "No action agents connected yet. Parsed context:\n"
            + json.dumps(enriched.model_dump(), indent=2)
        )
        await _send_final_reply(ctx, session["sender"], reply)
        _sessions.pop(session_id, None)
        return

    # Guardrail: finalize with partial cards if one action agent never responds.
    session["action_timeout_task"] = asyncio.create_task(_action_stage_timeout(ctx, session_id))


async def _action_stage_timeout(ctx: Context, session_id: str) -> None:
    await asyncio.sleep(ACTION_STAGE_TIMEOUT_S)
    session = _sessions.get(session_id)
    if not session:
        return
    expected = set(session.get("action_expected", set()))
    received = set(session.get("action_received", {}).keys())
    if expected == received:
        return

    pending = sorted(expected - received)
    ctx.logger.warning(
        f"[ACTION STAGE] timeout after {ACTION_STAGE_TIMEOUT_S:.1f}s; missing {pending}. Finalizing with partial cards."
    )
    await _finalize_action_stage(ctx, session_id)


# ---------------------------------------------------------------------------
# Response aggregation & final reply
# ---------------------------------------------------------------------------

async def _push_to_backend(backend_session_id: str, cards: dict, request_id: Optional[str] = None) -> None:
    """POST raw card JSON to the Express backend so the frontend can poll it."""
    payload = {
        "sessionId": backend_session_id,
        "requestId": request_id,
        "agents": [
            {"agentName": name, "output": card}
            for name, card in cards.items()
        ],
    }
    headers = {"x-internal-key": INTERNAL_API_KEY, "Content-Type": "application/json"}
    try:
        async with httpx.AsyncClient() as http:
            r = await http.post(
                INTERNAL_RESULTS_URL,
                json=payload,
                headers=headers,
                timeout=10,
            )
            r.raise_for_status()
    except Exception as e:
        print(f"[orchestrator] backend push error: {e}")


def _build_raw_reply(cards: dict) -> str:
    """Combine all action agent card payloads into a raw JSON dump reply."""
    lines = ["Good morning! Here is your personalised day plan:\n"]
    for agent_name, card in cards.items():
        lines.append(f"[{agent_name.upper()} CARD]")
        lines.append(json.dumps(card, indent=2))
        lines.append("")
    return "\n".join(lines)


SYNTHESIS_SYSTEM_PROMPT = """
You are a friendly morning day-planner assistant. You have received structured JSON outputs from several specialist agents (weather, outfit, music, meal, energy). Your job is to weave them into a single, warm, cohesive morning briefing for the user.

Rules:
- Write in second person ("you", "your").
- Keep it concise — one short paragraph per card, in this order: weather, outfit, meal, music, energy.
- Only include a section if data for that card is present.
- Reference specific details from the JSON (e.g. actual temperature, restaurant name, playlist name, outfit items).
- Make transitions feel natural — tie recommendations together (e.g. "since it's cold outside, …").
- End with a short, encouraging closing line.
- Do NOT output JSON, markdown headers, or bullet lists. Plain prose only.
"""


def _synthesize_reply(cards: dict, parsed_input: ParsedUserInput) -> str:
    """Use the LLM to turn structured card JSON into cohesive prose."""
    cards_json = json.dumps(cards, indent=2)
    user_context = f"User's morning prompt context: {json.dumps(parsed_input.model_dump())}"
    try:
        r = client.chat.completions.create(
            model="asi1-mini",
            messages=[
                {"role": "system", "content": SYNTHESIS_SYSTEM_PROMPT},
                {"role": "user", "content": f"{user_context}\n\nAgent outputs:\n{cards_json}"},
            ],
            max_tokens=600,
        )
        return r.choices[0].message.content.strip()
    except Exception as e:
        print(f"[orchestrator] synthesis error: {e}")
        return _build_raw_reply(cards)



async def _send_final_reply(ctx: Context, sender: str, text: str):
    await ctx.send(sender, ChatMessage(
        timestamp=datetime.utcnow(),
        msg_id=uuid4(),
        content=[
            TextContent(type="text", text=text),
            EndSessionContent(type="end-session"),
        ],
    ))


async def _finalize_action_stage(ctx: Context, session_id: str) -> None:
    session = _sessions.pop(session_id, None)
    if not session:
        return

    timeout_task = session.get("action_timeout_task")
    if timeout_task:
        timeout_task.cancel()
        session["action_timeout_task"] = None

    cards: dict = session["action_received"]
    parsed_input: ParsedUserInput = session["parsed_input"]
    backend_session_id: Optional[str] = session.get("backend_session_id")

    if not cards:
        reply = (
            "Your plan is still warming up - action agents did not return cards in time. "
            "Please try again in a few seconds."
        )
        await _send_final_reply(ctx, session["sender"], reply)
        return

    # Raw JSON -> backend (frontend polls this)
    if backend_session_id:
        await _push_to_backend(backend_session_id, cards)
    else:
        ctx.logger.warning("[ACTION STAGE] no backend_session_id — skipping backend push")

    # Synthesized prose -> ASI:One sender
    reply = _synthesize_reply(cards, parsed_input)
    await _send_final_reply(ctx, session["sender"], reply)


# ---------------------------------------------------------------------------
# Protocol handlers
# ---------------------------------------------------------------------------

@protocol.on_message(ChatMessage)
async def handle_message(ctx: Context, sender: str, msg: ChatMessage):
    await ctx.send(
        sender,
        ChatAcknowledgement(timestamp=datetime.now(), acknowledged_msg_id=msg.msg_id),
    )

    raw_text = "".join(
        item.text for item in msg.content if isinstance(item, TextContent)
    ).strip()
    if not raw_text:
        return

    # Extract optional backend session ID prefix: "[session:UUID] prompt text"
    m = _SESSION_PREFIX_RE.match(raw_text)
    backend_session_id: Optional[str] = m.group(1) if m else None
    prompt_text = raw_text[m.end():] if m else raw_text
    prompt_text = _AGENT_MENTION_PREFIX_RE.sub("", prompt_text).strip()

    ctx.logger.info(f"Received morning prompt: {prompt_text!r} (backend_session={backend_session_id})")

    # --- CONTEXT STAGE: parse input + fetch profile + call context agents ---
    parsed_input = parse_user_input(prompt_text)
    ctx.logger.info(f"ParsedUserInput: {parsed_input.model_dump()}")

    # TODO: derive real user_id from session/auth token
    user_profile = fetch_user_profile(user_id="placeholder_user")

    session_id = str(uuid4())
    _new_session(session_id, sender, parsed_input, user_profile, backend_session_id)

    await run_context_stage(ctx, session_id)


@protocol.on_message(ChatAcknowledgement)
async def handle_ack(_ctx: Context, _sender: str, _msg: ChatAcknowledgement):
    pass


# ---------------------------------------------------------------------------
# Orchestrator handlers
# ---------------------------------------------------------------------------

async def _handle_context_response(ctx: Context, _sender: str, msg: ContextAgentResponse):
    """Receive output from a context agent; kick off the action stage once all context is in."""
    session = _sessions.get(msg.session_id)
    if not session:
        ctx.logger.warning(f"Unknown session_id in ContextAgentResponse: {msg.session_id}")
        return
    if session.get("action_started"):
        ctx.logger.info(f"[CONTEXT STAGE] late context response from {msg.agent_name}; action stage already started")
        return

    session["context_received"][msg.agent_name] = msg.context_data
    ctx.logger.info(f"[CONTEXT STAGE] received response from {msg.agent_name}")

    if session["context_expected"] == set(session["context_received"].keys()):
        ctx.logger.info(f"[CONTEXT STAGE] complete — moving to action stage")
        # --- ACTION STAGE: all context gathered, dispatch to action agents ---
        await run_action_stage(ctx, msg.session_id)


async def _handle_action_response(ctx: Context, _sender: str, msg: ActionAgentResponse):
    """Receive a card from an action agent; send final reply when all cards are in."""
    session = _sessions.get(msg.session_id)
    if not session:
        ctx.logger.warning(f"Unknown session_id in ActionAgentResponse: {msg.session_id}")
        return

    session["action_received"][msg.agent_name] = msg.card_data
    ctx.logger.info(f"[ACTION STAGE] received card from {msg.agent_name}")

    if session["action_expected"] == set(session["action_received"].keys()):
        ctx.logger.info(f"[ACTION STAGE] complete — funneling outputs")
        await _finalize_action_stage(ctx, msg.session_id)


@orchestrator_proto.on_message(ContextAgentResponse)
async def handle_context_response_pipeline(ctx: Context, sender: str, msg: ContextAgentResponse):
    await _handle_context_response(ctx, sender, msg)


@orchestrator_proto.on_message(ActionAgentResponse)
async def handle_action_response_pipeline(ctx: Context, sender: str, msg: ActionAgentResponse):
    await _handle_action_response(ctx, sender, msg)


dayger.include(protocol, publish_manifest=True)
dayger.include(orchestrator_proto, publish_manifest=True)


@dayger.on_rest_post("/run", OrchestratorRunRequest, OrchestratorRunResponse)
async def handle_rest_run(ctx: Context, req: OrchestratorRunRequest) -> OrchestratorRunResponse:
    asyncio.create_task(_run_pipeline(req))
    return OrchestratorRunResponse(status="started")


if __name__ == '__main__':
    dayger.run()
