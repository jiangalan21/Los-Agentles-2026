from typing import Optional
from uagents import Model


class ParsedUserInput(Model):
    raw_prompt: str
    mood: Optional[str] = None
    stress_level: Optional[str] = None    # "low" | "medium" | "high"
    schedule_notes: Optional[str] = None
    time_available_minutes: Optional[int] = None
    weather_feel: Optional[str] = None    # user's perceived weather ("cold", "rainy", …)
    location_hint: Optional[str] = None
    dietary_notes: Optional[str] = None
    music_vibe: Optional[str] = None
    requested_cards: Optional[list] = None


class UserProfile(Model):
    user_id: str
    preferred_cuisine: Optional[str] = None
    dietary_restrictions: Optional[list] = None
    clothing_style: Optional[str] = None
    music_genres: Optional[list] = None
    home_location: Optional[str] = None


class ContextAgentRequest(Model):
    """Sent by the orchestrator to context agents during the context stage."""
    session_id: str
    parsed_input: ParsedUserInput
    user_profile: UserProfile


class ContextAgentResponse(Model):
    """Returned by a context agent — its output feeds into EnrichedContext."""
    session_id: str
    agent_name: str      # must match a key in orchestrator's CONTEXT_AGENT_ADDRESSES
    context_data: dict
    error: Optional[str] = None


class EnrichedContext(Model):
    """Full context assembled after the context stage; every action agent receives this."""
    session_id: str
    parsed_input: ParsedUserInput
    user_profile: UserProfile
    weather: Optional[dict] = None
    # TODO: add a field here for each new context agent


class ActionAgentRequest(Model):
    """Sent by the orchestrator to action agents during the action stage."""
    session_id: str
    enriched_context: EnrichedContext


class ActionAgentResponse(Model):
    """Returned by an action agent — rendered as a card on the frontend."""
    session_id: str
    agent_name: str      # must match a key in orchestrator's ACTION_AGENT_ADDRESSES
    card_data: dict
    error: Optional[str] = None
