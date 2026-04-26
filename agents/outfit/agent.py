import asyncio
import json
import os
import sys
from datetime import datetime, timezone
from urllib.parse import urlparse, urlunparse, urlencode, parse_qs
from uuid import uuid4
from typing import Optional

import requests
from dotenv import load_dotenv

from uagents import Agent, Context, Protocol, Model
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
ASI_ONE_API_KEY = os.getenv("ASI_ONE_API_KEY")
_PSYCOPG2_UNSUPPORTED_PARAMS = {"pgbouncer", "connection_limit"}

def _clean_db_url(url: str) -> str:
    """Strip connection string params that psycopg2 doesn't recognise (e.g. Supabase PgBouncer params)."""
    parsed = urlparse(url)
    params = {k: v[0] for k, v in parse_qs(parsed.query, keep_blank_values=True).items()
              if k not in _PSYCOPG2_UNSUPPORTED_PARAMS}
    return urlunparse(parsed._replace(query=urlencode(params)))

DATABASE_URL = _clean_db_url(os.getenv("DATABASE_URL", "")) or None

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
# Temperature classification
# ---------------------------------------------------------------------------

# Maps weather temperature (°F) → TempRange enum value used in clothing_items
def classify_temp(temp_f: Optional[float]) -> str:
    if temp_f is None:
        return "room"
    if temp_f >= 85:
        return "hot"
    if temp_f >= 65:
        return "warm"
    if temp_f >= 50:
        return "room"
    if temp_f >= 35:
        return "cool"
    return "cold"


# Include adjacent buckets so thin wardrobes still return candidates
TEMP_NEIGHBORS: dict[str, list[str]] = {
    "hot":  ["hot", "warm"],
    "warm": ["warm", "hot", "room"],
    "room": ["room", "warm", "cool"],
    "cool": ["cool", "room", "cold"],
    "cold": ["cold", "cool"],
}

ARTICLES = ["top", "bottom", "shoes", "outer"]
MAX_CANDIDATES_PER_ARTICLE = 5


# ---------------------------------------------------------------------------
# Clothing database query
# ---------------------------------------------------------------------------

def _fetch_candidates(temp_bucket: str, style_hint: Optional[list]) -> list[dict]:
    """
    Blocking DB query — run in a thread.
    Fetches up to MAX_CANDIDATES_PER_ARTICLE items per article type
    that are appropriate for the given temperature bucket.
    """
    try:
        import psycopg2
        import psycopg2.extras
    except ImportError:
        print("[outfit] psycopg2 not installed — skipping DB query")
        return []

    if not DATABASE_URL:
        print("[outfit] DATABASE_URL not set — skipping DB query")
        return []

    temp_values = TEMP_NEIGHBORS[temp_bucket]

    try:
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        # Fetch candidates ordered so style-matching items surface first,
        # then random within the remainder for variety across repeated calls.
        if style_hint:
            # Convert each style string to a %pattern% for ILIKE matching,
            # then promote any item whose style matches at least one of them.
            style_patterns = [f"%{s}%" for s in style_hint]
            cur.execute(
                """
                SELECT id, name, article, color_tone, temp, style, color, brightness, keywords
                FROM clothing_items
                WHERE temp = ANY(%s::"TempRange"[])
                ORDER BY article,
                         CASE WHEN EXISTS (
                             SELECT 1 FROM unnest(%s::text[]) AS s(v)
                             WHERE style ILIKE s.v
                         ) THEN 0 ELSE 1 END,
                         random()
                """,
                (temp_values, style_patterns),
            )
        else:
            cur.execute(
                """
                SELECT id, name, article, color_tone, temp, style, color, brightness, keywords
                FROM clothing_items
                WHERE temp = ANY(%s::"TempRange"[])
                ORDER BY article, random()
                """,
                (temp_values,),
            )
        rows = cur.fetchall()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"[outfit] DB error: {e}")
        return []

    # Group by article, cap at MAX_CANDIDATES_PER_ARTICLE each
    grouped: dict[str, list[dict]] = {a: [] for a in ARTICLES}
    for row in rows:
        article = row["article"]
        if article in grouped and len(grouped[article]) < MAX_CANDIDATES_PER_ARTICLE:
            grouped[article].append({
                "id":         row["id"],
                "name":       row["name"],
                "article":    row["article"],
                "color_tone": row["color_tone"],
                "temp":       row["temp"],
                "style":      row["style"],
                "color":      row["color"],
                "brightness": row["brightness"],
                "keywords":   row["keywords"],
            })

    # Flatten back to a list
    return [item for items in grouped.values() for item in items]


async def query_clothing_db(context: EnrichedContext) -> list[dict]:
    weather = context.weather or {}
    temp_f = weather.get("temperature_f")
    temp_bucket = classify_temp(temp_f)
    style_hint = context.user_profile.clothing_style
    return await asyncio.to_thread(_fetch_candidates, temp_bucket, style_hint)


# ---------------------------------------------------------------------------
# LLM call
# ---------------------------------------------------------------------------

OUTFIT_SYSTEM_PROMPT = """
You are a personal stylist building a morning outfit recommendation.

Priority order for your reasoning:
1. USER SIGNALS (most important): mood, stress level, schedule, and style preference.
   A stressed student with an exam needs something that feels put-together and calm.
   A relaxed day off calls for something comfortable. Match the emotional context first.
2. STYLE PREFERENCE: honour the user's preferred aesthetic when candidates support it.
3. WEATHER (constraint, not focus): use weather only to rule out impractical choices
   (e.g. no shorts in freezing weather). Do not let weather dominate the recommendation
   if the user's context points clearly in a style direction.
4. COHERENCE: colors, tones, and style across all pieces should work together.

Rules:
- top, bottom, and shoes are always required.
- outer is required only when weather is cold, cool, or rainy.
- You MUST pick from the provided candidates and include each item's `id`.
- If a slot has no candidates, invent a generic piece and set item_id to null.
- Your `reason` for each piece should reference the user's mood/schedule, not just the weather.

Return a JSON object with EXACTLY this shape and no other text:
{
  "top":    { "item_id": "<uuid or null>", "name": "<string>", "reason": "<string>" },
  "bottom": { "item_id": "<uuid or null>", "name": "<string>", "reason": "<string>" },
  "shoes":  { "item_id": "<uuid or null>", "name": "<string>", "reason": "<string>" },
  "outer":  { "item_id": "<uuid or null>", "name": "<string>", "reason": "<string>" } or null,
  "summary": "<1-2 sentences describing the full outfit and why it fits the user's day>"
}
"""


def build_outfit_prompt(context: EnrichedContext, candidates: list[dict]) -> str:
    weather = context.weather or {}
    parsed = context.parsed_input
    profile = context.user_profile

    # --- Context block (user signals first, weather last as a constraint) ---
    ctx_lines = []

    if parsed.mood:
        ctx_lines.append(f"Mood: {parsed.mood}")
    if parsed.stress_level:
        ctx_lines.append(f"Stress level: {parsed.stress_level}")
    if parsed.schedule_notes:
        ctx_lines.append(f"Schedule: {parsed.schedule_notes}")
    if profile.clothing_style:
        ctx_lines.append(f"Preferred style: {', '.join(profile.clothing_style)}")
    if parsed.weather_feel:
        ctx_lines.append(f"User describes weather as: {parsed.weather_feel}")

    if weather:
        ctx_lines.append(
            f"Weather (constraint): {weather.get('condition', 'unknown')}, "
            f"{weather.get('temperature_f', '?')}°F "
            f"(feels like {weather.get('feels_like_f', '?')}°F). "
            f"{weather.get('description', '')}"
        )
    else:
        ctx_lines.append("Weather: unknown — assume mild, comfortable conditions.")

    context_block = "\n".join(ctx_lines)

    # --- Wardrobe candidates block ---
    if candidates:
        # Group by article for readability in the prompt
        grouped: dict[str, list[dict]] = {a: [] for a in ARTICLES}
        for item in candidates:
            if item["article"] in grouped:
                grouped[item["article"]].append(item)

        wardrobe_parts = []
        for article in ARTICLES:
            items = grouped[article]
            if items:
                wardrobe_parts.append(f"\n{article.upper()} options:")
                for item in items:
                    kw = ", ".join(item.get("keywords") or [])
                    wardrobe_parts.append(
                        f"  - id={item['id']} | {item['name']} "
                        f"| color: {item['color']} ({item['color_tone']}, {item['brightness']}) "
                        f"| style: {item['style']} | temp: {item['temp']}"
                        + (f" | keywords: {kw}" if kw else "")
                    )
        wardrobe_block = "\n".join(wardrobe_parts)
    else:
        wardrobe_block = "No wardrobe data available — generate a generic weather-appropriate outfit."

    return (
        f"User context:\n{context_block}\n\n"
        f"Available wardrobe candidates:{wardrobe_block}\n\n"
        "Select an outfit."
    )


def call_llm(prompt: str) -> Optional[dict]:
    if not ASI_ONE_API_KEY:
        print("[outfit] ASI_API_KEY not set")
        return None
    try:
        resp = requests.post(
            ASI_URL,
            headers={"Authorization": f"Bearer {ASI_ONE_API_KEY}", "Content-Type": "application/json"},
            json={
                "model": "asi1-mini",
                "messages": [
                    {"role": "system", "content": OUTFIT_SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
                "max_tokens": 600,
                "temperature": 0.7,
            },
            timeout=15,
        )
        resp.raise_for_status()
        raw = resp.json()["choices"][0]["message"]["content"].strip()
        # Strip markdown code fences if the model wraps the JSON
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        return json.loads(raw.strip())
    except Exception as e:
        print(f"[outfit] LLM error: {e}")
        return None


# ---------------------------------------------------------------------------
# Core logic
# ---------------------------------------------------------------------------

FALLBACK_CARD = {
    "top":     {"item_id": None, "name": "Plain white t-shirt",  "reason": "Neutral, weather-appropriate base layer."},
    "bottom":  {"item_id": None, "name": "Dark jeans",           "reason": "Versatile for most conditions."},
    "shoes":   {"item_id": None, "name": "White sneakers",       "reason": "Comfortable, pairs with everything."},
    "outer":   None,
    "summary": "A simple, weather-appropriate outfit — wardrobe data or LLM unavailable.",
}


async def generate_outfit_card(context: EnrichedContext) -> dict:
    candidates = await query_clothing_db(context)
    prompt = build_outfit_prompt(context, candidates)
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
    ctx.logger.info(f"[outfit] Direct chat from {sender} — not supported in this agent.")
    await ctx.send(sender, ChatMessage(
        timestamp=datetime.now(timezone.utc),
        msg_id=uuid4(),
        content=[TextContent(type="text", text="Outfit agent is ready and waiting for context from the orchestrator.")]
    ))


@chat_proto.on_message(ChatAcknowledgement)
async def handle_ack(ctx: Context, sender: str, _msg: ChatAcknowledgement) -> None:
    ctx.logger.info(f"[outfit] Ack from {sender}")


# ---------------------------------------------------------------------------
# REST endpoint — called directly by the orchestrator pipeline
# ---------------------------------------------------------------------------

class OutfitRunRequest(Model):
    temperature_f: Optional[float] = None
    condition: Optional[str] = None
    feels_like_f: Optional[float] = None
    description: Optional[str] = None
    mood: Optional[str] = None
    stress_level: Optional[str] = None
    schedule_notes: Optional[str] = None
    style_profile: Optional[str] = None


class OutfitRunResponse(Model):
    top: Optional[dict] = None
    bottom: Optional[dict] = None
    shoes: Optional[dict] = None
    outer: Optional[dict] = None
    summary: Optional[str] = None
    error: Optional[str] = None


@agent.on_rest_post("/run", OutfitRunRequest, OutfitRunResponse)
async def handle_rest_run(ctx: Context, req: OutfitRunRequest) -> OutfitRunResponse:
    weather = {}
    if req.temperature_f is not None:
        weather["temperature_f"] = req.temperature_f
    if req.condition:
        weather["condition"] = req.condition
    if req.feels_like_f is not None:
        weather["feels_like_f"] = req.feels_like_f
    if req.description:
        weather["description"] = req.description

    style_list = [s.strip() for s in req.style_profile.split(",")] if req.style_profile else None

    from shared.models import ParsedUserInput, UserProfile
    parsed = ParsedUserInput(
        raw_prompt="",
        mood=req.mood,
        stress_level=req.stress_level,
        schedule_notes=req.schedule_notes,
    )
    profile = UserProfile(user_id="rest", clothing_style=style_list)

    context = EnrichedContext(
        session_id="rest",
        parsed_input=parsed,
        user_profile=profile,
        weather=weather if weather else None,
    )

    try:
        card = await generate_outfit_card(context)
        return OutfitRunResponse(**card)
    except Exception as e:
        ctx.logger.exception(f"[outfit] REST run error: {e}")
        return OutfitRunResponse(**FALLBACK_CARD, error=str(e))


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
