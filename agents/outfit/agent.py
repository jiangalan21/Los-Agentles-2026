import json
import os
import sys
from datetime import datetime, timezone
from uuid import uuid4
from typing import Optional

import requests
from dotenv import load_dotenv

from uagents import Agent, Context, Protocol
from uagents_core.contrib.protocols.chat import (
    ChatAcknowledgement,
    ChatMessage,
    TextContent,
    chat_protocol_spec,
)

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from shared.models import (
    ActionAgentRequest,
    ActionAgentResponse,
    EnrichedContext,
)

load_dotenv()

OUTFIT_AGENT_SEED = os.getenv("OUTFIT_AGENT_SEED")
ASI_URL = os.getenv("ASI_API_URL", "https://api.asi1.ai/v1/chat/completions")
ASI_API_KEY = os.getenv("ASI_API_KEY")

agent = Agent(
    name="outfit-agent",
    seed=OUTFIT_AGENT_SEED,
    port=8002,
    endpoint=["http://localhost:8002/submit"],
    mailbox=True,
)

chat_proto = Protocol(spec=chat_protocol_spec)
orchestrator_proto = Protocol(name="orchestrator-outfit", version="0.1.0")


# ---------------------------------------------------------------------------
# Clothing database (placeholder)
# ---------------------------------------------------------------------------

def query_clothing_db(_context: EnrichedContext) -> list[dict]:
    """
    Placeholder: query a clothing DB for candidate pieces filtered by weather/style context.
    Returns a list of clothing items with schema:
      { id, name, article, color_tone, temp, style, color, brightness, keywords }
    """
    # TODO: implement real DB query against the clothing table
    return []


# ---------------------------------------------------------------------------
# LLM call
# ---------------------------------------------------------------------------

OUTFIT_SYSTEM_PROMPT = """
You are a personal stylist building a coherent outfit recommendation.
You receive context about the user's day (weather, mood, schedule, style preferences) and
a list of available clothing pieces from their wardrobe.

Return a JSON object with exactly this shape:
{
  "top":       { "name": "<string>", "reason": "<string>" },
  "bottom":    { "name": "<string>", "reason": "<string>" },
  "shoes":     { "name": "<string>", "reason": "<string>" },
  "outer":     { "name": "<string>", "reason": "<string>" } | null,
  "summary":   "<1-2 sentence outfit description for the user>"
}

Rules:
- outer is null when weather does not require an extra layer.
- Each piece must be weather-appropriate and internally consistent (color, style).
- If the wardrobe list is empty, suggest generic pieces grounded in the weather and mood.
- Return ONLY valid JSON, no extra text.
"""


def build_outfit_prompt(context: EnrichedContext, wardrobe: list[dict]) -> str:
    weather = context.weather or {}
    parsed = context.parsed_input
    profile = context.user_profile

    parts = []

    if weather:
        parts.append(
            f"Weather: {weather.get('condition', 'unknown')}, "
            f"{weather.get('temperature_f', '?')}°F, feels like {weather.get('feels_like_f', '?')}°F. "
            f"{weather.get('description', '')}"
        )
    else:
        parts.append("Weather: unknown — assume mild conditions.")

    if parsed.mood:
        parts.append(f"Mood: {parsed.mood}")
    if parsed.stress_level:
        parts.append(f"Stress level: {parsed.stress_level}")
    if parsed.schedule_notes:
        parts.append(f"Schedule: {parsed.schedule_notes}")
    if parsed.weather_feel:
        parts.append(f"User says it feels: {parsed.weather_feel}")
    if profile.clothing_style:
        parts.append(f"Preferred style: {profile.clothing_style}")

    context_block = "\n".join(parts)

    if wardrobe:
        wardrobe_block = json.dumps(wardrobe, indent=2)
    else:
        wardrobe_block = "No wardrobe data available — suggest generic pieces."

    return (
        f"Context:\n{context_block}\n\n"
        f"Available wardrobe pieces:\n{wardrobe_block}\n\n"
        "Build an outfit."
    )


def call_llm(prompt: str) -> Optional[dict]:
    if not ASI_API_KEY:
        return None
    try:
        resp = requests.post(
            ASI_URL,
            headers={"Authorization": f"Bearer {ASI_API_KEY}", "Content-Type": "application/json"},
            json={
                "model": "asi1-mini",
                "messages": [
                    {"role": "system", "content": OUTFIT_SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
                "max_tokens": 512,
                "temperature": 0.7,
            },
            timeout=15,
        )
        resp.raise_for_status()
        raw = resp.json()["choices"][0]["message"]["content"].strip()
        return json.loads(raw)
    except Exception as e:
        print(f"[outfit] LLM error: {e}")
        return None


# ---------------------------------------------------------------------------
# Core logic
# ---------------------------------------------------------------------------

FALLBACK_CARD = {
    "top":     {"name": "Plain white t-shirt", "reason": "Neutral, weather-appropriate base layer."},
    "bottom":  {"name": "Dark jeans", "reason": "Versatile and suitable for most conditions."},
    "shoes":   {"name": "White sneakers", "reason": "Comfortable and pairs with everything."},
    "outer":   None,
    "summary": "A simple, weather-appropriate outfit — no wardrobe data or LLM response available.",
}


async def generate_outfit_card(context: EnrichedContext) -> dict:
    wardrobe = query_clothing_db(context)
    prompt = build_outfit_prompt(context, wardrobe)
    card = call_llm(prompt)
    if card is None:
        return FALLBACK_CARD
    return card


# ---------------------------------------------------------------------------
# Orchestrator protocol handler (main entry point)
# ---------------------------------------------------------------------------

@orchestrator_proto.on_message(ActionAgentRequest)
async def handle_action_request(ctx: Context, sender: str, msg: ActionAgentRequest) -> None:
    ctx.logger.info(f"[outfit] ActionAgentRequest received for session {msg.session_id}")

    card_data = None
    error = None

    try:
        card_data = await generate_outfit_card(msg.enriched_context)
    except Exception as e:
        error = str(e)
        ctx.logger.exception(f"[outfit] Error generating outfit card: {e}")
        card_data = FALLBACK_CARD

    await ctx.send(sender, ActionAgentResponse(
        session_id=msg.session_id,
        agent_name="outfit",
        card_data=card_data,
        error=error,
    ))
    ctx.logger.info(f"[outfit] ActionAgentResponse sent for session {msg.session_id}")


# ---------------------------------------------------------------------------
# Chat protocol handler (direct chat / dev testing)
# ---------------------------------------------------------------------------

@chat_proto.on_message(ChatMessage)
async def handle_chat_message(ctx: Context, sender: str, msg: ChatMessage) -> None:
    await ctx.send(
        sender,
        ChatAcknowledgement(
            timestamp=datetime.now(),
            acknowledged_msg_id=msg.msg_id,
        ),
    )
    ctx.logger.info(f"[outfit] Direct chat from {sender} — outfit agent does not support free-form chat yet.")
    await ctx.send(sender, ChatMessage(
        timestamp=datetime.now(timezone.utc),
        msg_id=uuid4(),
        content=[TextContent(type="text", text="Outfit agent is ready and waiting for context from the orchestrator.")]
    ))


@chat_proto.on_message(ChatAcknowledgement)
async def handle_ack(ctx: Context, sender: str, _msg: ChatAcknowledgement) -> None:
    ctx.logger.info(f"[outfit] Ack from {sender}")


# ---------------------------------------------------------------------------
# Agent startup
# ---------------------------------------------------------------------------

agent.include(chat_proto, publish_manifest=True)
agent.include(orchestrator_proto, publish_manifest=True)


@agent.on_event("startup")
async def on_startup(ctx: Context) -> None:
    ctx.logger.info(f"Outfit agent started: {agent.address}")


if __name__ == "__main__":
    agent.run()
