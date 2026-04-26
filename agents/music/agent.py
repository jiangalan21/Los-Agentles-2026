import asyncio
import base64
import json
import os
import sys
import time
from typing import Optional

import requests as http_requests

from dotenv import load_dotenv
from openai import OpenAI
from uagents import Agent, Context, Model, Protocol

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from shared.chatProtocol import build_chat_protocol
from shared.models import (
    ActionAgentRequest,
    ActionAgentResponse,
    EnrichedContext,
    ParsedUserInput,
    UserProfile,
)

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))

ASI1_API_KEY = os.getenv("ASI1_API_KEY")
SPOTIFY_CLIENT_ID = os.getenv("SPOTIFY_CLIENT_ID", "")
SPOTIFY_CLIENT_SECRET = os.getenv("SPOTIFY_CLIENT_SECRET", "")
_seed = os.getenv("MUSIC_AGENT_SEED") or os.getenv("AGENT_SEED", "music-agent-seed")
_endpoint = os.getenv("MUSIC_AGENT_ENDPOINT") or os.getenv("AGENT_ENDPOINT") or "http://localhost:8003/submit"
ORCHESTRATOR_AGENT_ADDRESS = os.getenv("ORCHESTRATOR_AGENT_ADDRESS", "").strip()

agent = Agent(
    name="music-agent",
    seed=_seed,
    port=8003,
    endpoint=[_endpoint],
    mailbox=True,
)

client = OpenAI(
    base_url="https://api.asi1.ai/v1",
    api_key=ASI1_API_KEY,
)

SYSTEM_PROMPT = """You are a music curator for a morning day planner app.
Given context about a user's mood, stress level, schedule, genre preferences, and past feedback, return a personalised playlist.

If the user has previously liked or disliked specific vibes, use that signal:
- Favour vibes and energy levels similar to what they liked before.
- Steer clearly away from vibes they disliked.

Return ONLY valid JSON. No markdown. No preamble. No explanation. Exactly this shape:
{
  "value": "<short playlist name, 2-4 words>",
  "detail": "<mood descriptors and genres separated by · e.g. 'Calm · Focused · Lo-fi & Classical'>",
  "previewData": "<one sentence explaining why this playlist fits the user's morning>",
  "tracks": [
    {"title": "<track title>", "artist": "<artist name>"},
    ...
  ]
}

Include exactly 5 tracks. All tracks must be real, well-known songs that exist on Spotify."""

class MusicRunRequest(Model):
    mood: Optional[str] = None
    stress_level: Optional[str] = None
    schedule_notes: Optional[str] = None
    music_vibe: Optional[str] = None
    music_genres: Optional[list] = None
    weather_condition: Optional[str] = None
    temperature_f: Optional[int] = None
    liked_vibes: Optional[list] = None
    disliked_vibes: Optional[list] = None


class MusicRunResponse(Model):
    value: str
    detail: str
    previewData: str
    tracks: list
    error: Optional[str] = None


FALLBACK_CARD: dict = {
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


_spotify_token_cache: dict = {"token": None, "expires_at": 0.0}


def _get_spotify_token() -> Optional[str]:
    if not SPOTIFY_CLIENT_ID or not SPOTIFY_CLIENT_SECRET:
        return None
    now = time.time()
    if _spotify_token_cache["token"] and now < _spotify_token_cache["expires_at"] - 60:
        return _spotify_token_cache["token"]
    try:
        creds = base64.b64encode(
            f"{SPOTIFY_CLIENT_ID}:{SPOTIFY_CLIENT_SECRET}".encode()
        ).decode()
        resp = http_requests.post(
            "https://accounts.spotify.com/api/token",
            headers={
                "Authorization": f"Basic {creds}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data={"grant_type": "client_credentials"},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        _spotify_token_cache["token"] = data["access_token"]
        _spotify_token_cache["expires_at"] = now + data.get("expires_in", 3600)
        return _spotify_token_cache["token"]
    except Exception as e:
        print(f"[music] Spotify token error: {e}")
        return None


def _resolve_spotify_id(title: str, artist: str, token: str) -> Optional[str]:
    try:
        resp = http_requests.get(
            "https://api.spotify.com/v1/search",
            headers={"Authorization": f"Bearer {token}"},
            params={"q": f"track:{title} artist:{artist}", "type": "track", "limit": 1},
            timeout=10,
        )
        resp.raise_for_status()
        items = resp.json().get("tracks", {}).get("items", [])
        return items[0]["id"] if items else None
    except Exception as e:
        print(f"[music] Spotify search error for '{title}' by '{artist}': {e}")
        return None


def _build_user_prompt(msg: ActionAgentRequest) -> str:
    ctx = msg.enriched_context
    p = ctx.parsed_input
    u = ctx.user_profile
    w = ctx.weather

    lines = [f"Mood: {p.mood or 'neutral'}"]
    if p.stress_level:
        lines.append(f"Stress level: {p.stress_level}")
    if p.schedule_notes:
        lines.append(f"Schedule: {p.schedule_notes}")
    if p.music_vibe:
        lines.append(f"Desired vibe: {p.music_vibe}")
    if u.music_genres:
        lines.append(f"Preferred genres: {', '.join(u.music_genres)}")
    if u.liked_vibes:
        lines.append(f"Previously liked vibes (lean toward these): {'; '.join(u.liked_vibes[:3])}")
    if u.disliked_vibes:
        lines.append(f"Previously disliked vibes (avoid these): {'; '.join(u.disliked_vibes[:3])}")
    if w:
        lines.append(f"Weather: {w.get('condition', 'unknown')}, {w.get('temperature_f', '?')}°F")

    return "\n".join(lines)


def _generate_playlist(msg: ActionAgentRequest) -> tuple[dict, Optional[str]]:
    if not ASI1_API_KEY:
        return FALLBACK_CARD, "ASI1_API_KEY not configured — using fallback playlist"

    try:
        response = client.chat.completions.create(
            model="asi1-mini",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": _build_user_prompt(msg)},
            ],
            max_tokens=512,
        )
        raw = response.choices[0].message.content.strip()
        data = json.loads(raw)

        if not all(k in data for k in ("value", "detail", "previewData", "tracks")):
            return FALLBACK_CARD, "LLM response missing required fields — using fallback playlist"
        if not isinstance(data["tracks"], list) or not data["tracks"]:
            return FALLBACK_CARD, "LLM returned empty track list — using fallback playlist"

        token = _get_spotify_token()
        for track in data["tracks"]:
            if token:
                track["spotify_id"] = _resolve_spotify_id(
                    track.get("title", ""), track.get("artist", ""), token
                )
            else:
                track["spotify_id"] = None

        return data, None

    except json.JSONDecodeError as e:
        return FALLBACK_CARD, f"LLM returned non-JSON — using fallback playlist: {e}"
    except Exception as e:
        return FALLBACK_CARD, f"LLM call failed — using fallback playlist: {e}"


# ── Chat protocol (standalone Agentverse chat) ────────────────────────────────

proto: Protocol = build_chat_protocol()
agent.include(proto, publish_manifest=True)


# ── Orchestrator protocol ─────────────────────────────────────────────────────

orchestrator_proto = Protocol(name="orchestrator-pipeline", version="0.1.0")


@orchestrator_proto.on_message(ActionAgentRequest)
async def handle_action_request(ctx: Context, sender: str, msg: ActionAgentRequest) -> None:
    ctx.logger.info(f"[music] ActionAgentRequest received for session {msg.session_id}")
    reply_target = ORCHESTRATOR_AGENT_ADDRESS or sender
    if ORCHESTRATOR_AGENT_ADDRESS:
        ctx.logger.info(f"[music] replying to configured ORCHESTRATOR_AGENT_ADDRESS: {reply_target}")
    else:
        ctx.logger.info(f"[music] replying to sender: {reply_target}")

    card_data, error = await asyncio.to_thread(_generate_playlist, msg)

    await ctx.send(
        reply_target,
        ActionAgentResponse(
            session_id=msg.session_id,
            agent_name="music",
            card_data=card_data,
            error=error,
        ),
    )
    ctx.logger.info(f"[music] ActionAgentResponse sent for session {msg.session_id}")


agent.include(orchestrator_proto, publish_manifest=True)


@agent.on_rest_post("/run", MusicRunRequest, MusicRunResponse)
async def handle_rest_run(ctx: Context, req: MusicRunRequest) -> MusicRunResponse:
    parsed = ParsedUserInput(
        raw_prompt="",
        mood=req.mood,
        stress_level=req.stress_level,
        schedule_notes=req.schedule_notes,
        music_vibe=req.music_vibe,
    )
    profile = UserProfile(
        user_id="rest",
        music_genres=req.music_genres or [],
        liked_vibes=req.liked_vibes,
        disliked_vibes=req.disliked_vibes,
    )
    weather = (
        {"condition": req.weather_condition, "temperature_f": req.temperature_f}
        if req.weather_condition
        else None
    )
    enriched = EnrichedContext(
        session_id="rest",
        parsed_input=parsed,
        user_profile=profile,
        weather=weather,
    )
    action_req = ActionAgentRequest(session_id="rest", enriched_context=enriched)
    card_data, error = await asyncio.to_thread(_generate_playlist, action_req)
    return MusicRunResponse(**card_data, error=error)


@agent.on_event("startup")
async def on_startup(ctx: Context) -> None:
    ctx.logger.info(f"Music agent started: {agent.address}")


if __name__ == "__main__":
    agent.run()
