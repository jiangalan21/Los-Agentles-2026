from datetime import datetime
from uuid import uuid4
import json

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

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.venv', '.env'))
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


# ---------------------------------------------------------------------------
# Shared data models
# ---------------------------------------------------------------------------

class ParsedUserInput(Model):
    """Structured extraction of the user's raw morning prompt."""
    raw_prompt: str
    mood: Optional[str] = None            # e.g. "stressed", "energetic", "calm"
    stress_level: Optional[str] = None    # "low" | "medium" | "high"
    schedule_notes: Optional[str] = None  # e.g. "midterm at 2pm"
    time_available_minutes: Optional[int] = None
    weather_feel: Optional[str] = None    # user's perceived weather ("cold", "rainy", …)
    location_hint: Optional[str] = None
    dietary_notes: Optional[str] = None
    music_vibe: Optional[str] = None
    requested_cards: Optional[list] = None  # if user explicitly asks for certain cards


class UserProfile(Model):
    """User preferences and history fetched from the database."""
    user_id: str
    # TODO: populate from DB — these are placeholders for fields we expect
    preferred_cuisine: Optional[str] = None
    dietary_restrictions: Optional[list] = None
    clothing_style: Optional[str] = None
    music_genres: Optional[list] = None
    home_location: Optional[str] = None


class ContextAgentRequest(Model):
    """Sent to context agents (e.g. weather) during the context stage."""
    session_id: str
    parsed_input: ParsedUserInput
    user_profile: UserProfile


class ContextAgentResponse(Model):
    """Response from a context agent — becomes part of EnrichedContext."""
    session_id: str
    agent_name: str         # must match a key in CONTEXT_AGENT_ADDRESSES
    context_data: dict      # agent-specific payload (e.g. {"temp": 42, "condition": "cloudy"})
    error: Optional[str] = None


class EnrichedContext(Model):
    """Full context assembled at the end of the context stage.
    This is the single object every action agent receives.
    """
    session_id: str
    parsed_input: ParsedUserInput
    user_profile: UserProfile
    # Outputs from context agents — keyed by agent name
    weather: Optional[dict] = None        # from weather context agent
    # TODO: add fields for each new context agent (calendar, deals, news, …)


class ActionAgentRequest(Model):
    """Sent to action agents during the action stage."""
    session_id: str
    enriched_context: EnrichedContext


class ActionAgentResponse(Model):
    """Response from an action agent — rendered as a card on the frontend."""
    session_id: str
    agent_name: str         # must match a key in ACTION_AGENT_ADDRESSES
    card_data: dict         # frontend-renderable payload for this card type
    error: Optional[str] = None


class Message(Model):
    message: str


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


@protocol.on_message(ContextAgentResponse)
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


@protocol.on_message(ActionAgentResponse)
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


@protocol.on_message(ChatAcknowledgement)
async def handle_ack(_ctx: Context, _sender: str, _msg: ChatAcknowledgement):
    pass


dayger.include(protocol, publish_manifest=True)

if __name__ == '__main__':
    dayger.run()
