from datetime import datetime
from uuid import uuid4
import json
import re
import sys
import os
from dotenv import load_dotenv
from typing import Optional, Tuple

import httpx

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

load_dotenv()
DAYGER_SEED = os.getenv("DAYGER_SEED_VALUE")
ASI_ONE_API_KEY = os.getenv("ASI_ONE_API_KEY")
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:3001")
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "")

# Messages from ASI:One may include "[session:UUID]" at the start to link a backend session.
_SESSION_PREFIX_RE = re.compile(r'^\[session:([a-f0-9\-]{36})\]\s*', re.IGNORECASE)

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
        await _send_final_reply(ctx, session["sender"], reply)
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

async def _push_to_backend(backend_session_id: str, cards: dict) -> None:
    """POST raw card JSON to the Express backend so the frontend can poll it."""
    payload = {"session_id": backend_session_id, "outputs": cards}
    headers = {"x-internal-key": INTERNAL_API_KEY, "Content-Type": "application/json"}
    try:
        async with httpx.AsyncClient() as http:
            r = await http.post(
                f"{BACKEND_URL}/internal/agent-output",
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
You are a friendly morning day-planner assistant. You have received structured JSON outputs from several specialist agents (weather, outfit, music, food, wellness). Your job is to weave them into a single, warm, cohesive morning briefing for the user.

Rules:
- Write in second person ("you", "your").
- Keep it concise — one short paragraph per card, in this order: weather, outfit, food, music, wellness.
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
        ctx.logger.info(f"[ACTION STAGE] complete — funneling outputs")
        session = _sessions.pop(msg.session_id)
        cards: dict = session["action_received"]
        parsed_input: ParsedUserInput = session["parsed_input"]
        backend_session_id: Optional[str] = session.get("backend_session_id")

        # Raw JSON → backend (frontend polls this)
        if backend_session_id:
            await _push_to_backend(backend_session_id, cards)
        else:
            ctx.logger.warning("[ACTION STAGE] no backend_session_id — skipping backend push")

        # Synthesized prose → ASI:One sender
        reply = _synthesize_reply(cards, parsed_input)
        await _send_final_reply(ctx, session["sender"], reply)


dayger.include(protocol, publish_manifest=True)
dayger.include(orchestrator_proto, publish_manifest=True)



if __name__ == '__main__':
    dayger.run()
