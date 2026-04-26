import asyncio
from datetime import datetime
from uuid import uuid4
import json

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

from dotenv import load_dotenv
import os
from typing import Optional

from shared.models import (
    ParsedUserInput,
    UserProfile,
    ContextAgentRequest,
    ContextAgentResponse,
    EnrichedContext,
    ActionAgentRequest,
    ActionAgentResponse,
)

load_dotenv()
DAYGER_SEED = os.getenv("DAYGER_SEED_VALUE")
ASI_ONE_API_KEY = os.getenv("ASI_ONE_API_KEY")

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
    "food":     os.getenv("FOOD_AGENT_ADDRESS",     ""),
    "wellness": os.getenv("WELLNESS_AGENT_ADDRESS", ""),
    # TODO: add more action agents here
}


class OrchestratorRunRequest(Model):
    session_id: str
    request_id: Optional[str] = None
    prompt: str
    user_context: dict


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


def _http_post(url: str, payload: dict) -> dict:
    resp = requests.post(url, json=payload, timeout=20)
    resp.raise_for_status()
    return resp.json()


async def _run_pipeline(req: OrchestratorRunRequest) -> None:
    parsed = parse_user_input(req.prompt)
    location = req.user_context.get("location") or parsed.location_hint or "Los Angeles"

    try:
        weather_raw = await asyncio.to_thread(_http_post, "http://localhost:8001/run", {"location": location})
    except Exception as e:
        print(f"[orchestrator] Weather agent error: {e} — using fallback")
        weather_raw = dict(_WEATHER_FALLBACK)

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

    try:
        music_data = await asyncio.to_thread(_http_post, "http://localhost:8003/run", music_payload)
    except Exception as e:
        print(f"[orchestrator] Music agent error: {e} — using fallback")
        music_data = dict(_MUSIC_FALLBACK)

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
            {"agentName": "music", "output": music_data},
        ],
    }

    try:
        await asyncio.to_thread(_http_post, "http://localhost:3001/internal/results", callback_payload)
        print(f"[orchestrator] Callback posted for session {req.session_id}")
    except Exception as e:
        print(f"[orchestrator] Callback error for session {req.session_id}: {e}")


# ---------------------------------------------------------------------------
# Orchestrator agent
# ---------------------------------------------------------------------------

dayger = Agent(
    name='dayger',
    seed=DAYGER_SEED,
    port=8000,
    mailbox=True,
    publish_agent_details=True,
)


protocol = Protocol(spec=chat_protocol_spec)
orchestrator_proto = Protocol(name="orchestrator-context", version="0.1.0")


# ---------------------------------------------------------------------------
# In-memory session store
# TODO: replace with a persistent store for production
# ---------------------------------------------------------------------------

_sessions: dict[str, dict] = {}


def _new_session(session_id: str, sender: str, parsed_input: ParsedUserInput, user_profile: UserProfile):
    active_ctx_agents = [k for k, v in CONTEXT_AGENT_ADDRESSES.items() if v]
    active_act_agents = [k for k, v in ACTION_AGENT_ADDRESSES.items() if v]
    _sessions[session_id] = {
        "sender": sender,
        "parsed_input": parsed_input,
        "user_profile": user_profile,
        "context_expected": set(active_ctx_agents),
        "context_received": {},
        "action_expected": set(active_act_agents),
        "action_received": {},
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
            model="asi1",
            messages=[
                {"role": "system", "content": PARSE_SYSTEM_PROMPT},
                {"role": "user", "content": raw_prompt},
            ],
            max_tokens=512,
        )
        parsed = json.loads(r.choices[0].message.content)
    except Exception:
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

    for agent_key, address in CONTEXT_AGENT_ADDRESSES.items():
        if not address:
            ctx.logger.warning(f"No address for context agent '{agent_key}' — skipping")
            continue
        try:
            await ctx.send(address, request)
            ctx.logger.info(f"[CONTEXT STAGE] dispatched to {agent_key}")
        except Exception:
            ctx.logger.exception(f"[CONTEXT STAGE] failed to dispatch to {agent_key}")


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
    enriched = _build_enriched_context(session_id)
    request = ActionAgentRequest(session_id=session_id, enriched_context=enriched)

    session = _sessions[session_id]
    if not session["action_expected"]:
        # No action agents configured — reply with raw parsed context for dev/debug
        reply = (
            "No action agents connected yet. Parsed context:\n"
            + json.dumps(enriched.model_dump(), indent=2)
        )
        await _send_final_reply(ctx, session_id, reply)
        return

    for agent_key, address in ACTION_AGENT_ADDRESSES.items():
        if not address:
            ctx.logger.warning(f"No address for action agent '{agent_key}' — skipping")
            continue
        try:
            await ctx.send(address, request)
            ctx.logger.info(f"[ACTION STAGE] dispatched to {agent_key}")
        except Exception:
            ctx.logger.exception(f"[ACTION STAGE] failed to dispatch to {agent_key}")


# ---------------------------------------------------------------------------
# Response aggregation & final reply
# ---------------------------------------------------------------------------

def _build_final_reply(session_id: str) -> str:
    """Combine all action agent card payloads into a user-facing reply.
    TODO: swap for structured frontend payload once card schema is finalised.
    """
    session = _sessions.pop(session_id, {})
    cards = session.get("action_received", {})
    if not cards:
        return "Sorry, no recommendations could be generated."
    lines = ["Good morning! Here is your personalised day plan:\n"]
    for agent_name, card in cards.items():
        lines.append(f"[{agent_name.upper()} CARD]")
        lines.append(json.dumps(card, indent=2))
        lines.append("")
    return "\n".join(lines)


async def _send_final_reply(ctx: Context, session_id: str, text: str):
    sender = (_sessions.get(session_id) or {}).get("sender")
    if not sender:
        return
    await ctx.send(sender, ChatMessage(
        timestamp=datetime.utcnow(),
        msg_id=uuid4(),
        content=[
            TextContent(type="text", text=text),
            EndSessionContent(type="end-session"),
        ],
    ))


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

    ctx.logger.info(f"Received morning prompt: {raw_text!r}")

    # --- CONTEXT STAGE: parse input + fetch profile + call context agents ---
    parsed_input = parse_user_input(raw_text)
    ctx.logger.info(f"ParsedUserInput: {parsed_input.model_dump()}")

    # TODO: derive real user_id from session/auth token
    user_profile = fetch_user_profile(user_id="placeholder_user")

    session_id = str(uuid4())
    _new_session(session_id, sender, parsed_input, user_profile)

    await run_context_stage(ctx, session_id)


@protocol.on_message(ChatAcknowledgement)
async def handle_ack(_ctx: Context, _sender: str, _msg: ChatAcknowledgement):
    pass


# ---------------------------------------------------------------------------
# Orchestrator handlers
# ---------------------------------------------------------------------------

@orchestrator_proto.on_message(ContextAgentResponse)
async def handle_context_response(ctx: Context, _sender: str, msg: ContextAgentResponse):
    """Receive output from a context agent; kick off the action stage once all context is in."""
    session = _sessions.get(msg.session_id)
    if not session:
        ctx.logger.warning(f"Unknown session_id in ContextAgentResponse: {msg.session_id}")
        return

    session["context_received"][msg.agent_name] = msg.context_data
    ctx.logger.info(f"[CONTEXT STAGE] received response from {msg.agent_name}")

    if session["context_expected"] == set(session["context_received"].keys()):
        ctx.logger.info(f"[CONTEXT STAGE] complete — moving to action stage")
        # --- ACTION STAGE: all context gathered, dispatch to action agents ---
        await run_action_stage(ctx, msg.session_id)


@orchestrator_proto.on_message(ActionAgentResponse)
async def handle_action_response(ctx: Context, _sender: str, msg: ActionAgentResponse):
    """Receive a card from an action agent; send final reply when all cards are in."""
    session = _sessions.get(msg.session_id)
    if not session:
        ctx.logger.warning(f"Unknown session_id in ActionAgentResponse: {msg.session_id}")
        return

    session["action_received"][msg.agent_name] = msg.card_data
    ctx.logger.info(f"[ACTION STAGE] received card from {msg.agent_name}")

    if session["action_expected"] == set(session["action_received"].keys()):
        ctx.logger.info(f"[ACTION STAGE] complete — sending final reply to user")
        reply = _build_final_reply(msg.session_id)
        await _send_final_reply(ctx, msg.session_id, reply)


dayger.include(protocol, publish_manifest=True)
dayger.include(orchestrator_proto, publish_manifest=True)


@dayger.on_rest_post("/run", OrchestratorRunRequest, OrchestratorRunResponse)
async def handle_rest_run(ctx: Context, req: OrchestratorRunRequest) -> OrchestratorRunResponse:
    asyncio.create_task(_run_pipeline(req))
    return OrchestratorRunResponse(status="started")


if __name__ == '__main__':
    dayger.run()
