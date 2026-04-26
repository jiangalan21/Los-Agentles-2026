import asyncio
import json
import os
import re
import sys
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple
from uuid import uuid4

import requests
from dotenv import load_dotenv
from uagents import Agent, Context, Model, Protocol
from uagents_core.contrib.protocols.chat import (
    ChatAcknowledgement,
    ChatMessage,
    TextContent,
    chat_protocol_spec,
)

# Allow importing from agents/shared/
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from shared.models import ContextAgentRequest, ContextAgentResponse

load_dotenv()

OWM_WEATHER_URL = "https://api.openweathermap.org/data/2.5/weather"
OWM_FORECAST_URL = "https://api.openweathermap.org/data/2.5/forecast"
OWM_GEO_URL = "http://api.openweathermap.org/geo/1.0/direct"
OWM_REVERSE_URL = "http://api.openweathermap.org/geo/1.0/reverse"
ASI_URL = os.getenv("ASI_API_URL", "https://api.asi1.ai/v1/chat/completions")
WEATHER_AGENT_SEED = os.getenv("WEATHER_AGENT_SEED")

FALLBACK_MESSAGE = "Weather service unavailable — assuming mild, partly cloudy conditions around 68°F."


class WeatherRunRequest(Model):
    location: str


class WeatherRunResponse(Model):
    condition: str
    description: str
    temperature_f: int
    feels_like_f: int
    humidity: int
    wind_speed: float
    narrative: str
    error: Optional[str] = None

# Hours (local) that define each period
PERIODS: Dict[str, Tuple[int, int]] = {
    "morning":   (6,  12),
    "afternoon": (12, 18),
    "evening":   (18, 21),
    "night":     (21, 24),  # early hours (0-5) handled separately below
}

DAY_NAMES = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]

_endpoint = os.getenv("AGENT_ENDPOINT") or "http://localhost:8001/submit"

agent = Agent(
    name="weather-agent",
    seed=WEATHER_AGENT_SEED,
    port=8001,
    endpoint=[_endpoint], # can delete
    mailbox=True,
)

proto = Protocol(spec=chat_protocol_spec)


# ── Input parsing ────────────────────────────────────────────────────────────

def extract_query_text(msg: ChatMessage) -> str:
    for block in msg.content:
        if hasattr(block, "text"):
            return re.sub(r'^@agent\w+\s*', '', block.text.strip()).strip()
    return ""


def parse_coordinates(text: str) -> Optional[Tuple[float, float]]:
    try:
        data = json.loads(text)
        lat = data.get("lat") or data.get("latitude")
        lon = data.get("lon") or data.get("longitude")
        if lat is not None and lon is not None:
            return float(lat), float(lon)
    except (json.JSONDecodeError, ValueError, AttributeError):
        pass
    match = re.search(r'(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)', text)
    if match:
        lat, lon = float(match.group(1)), float(match.group(2))
        if -90 <= lat <= 90 and -180 <= lon <= 180:
            return lat, lon
    return None


def parse_date_and_period(text: str) -> Tuple[List[date], Optional[str]]:
    """Return (list_of_target_dates, period_filter).

    period_filter is one of 'morning'/'afternoon'/'evening'/'night' or None (full day).
    Returns multiple dates for 'weekend'.
    """
    today = date.today()
    lower = text.lower()
    target_dates: List[date] = []
    period_filter: Optional[str] = None

    # Weekend → Saturday + Sunday
    if "weekend" in lower:
        days_to_sat = (5 - today.weekday()) % 7 or 7
        sat = today + timedelta(days=days_to_sat)
        target_dates = [sat, sat + timedelta(days=1)]

    # Tomorrow
    elif "tomorrow" in lower:
        target_dates = [today + timedelta(days=1)]

    # Tonight
    elif "tonight" in lower:
        target_dates = [today]
        period_filter = "night"

    # Named day: "on Friday", "this Friday", "next Monday"
    else:
        for i, day in enumerate(DAY_NAMES):
            if day in lower:
                days_ahead = (i - today.weekday()) % 7 or 7
                target_dates = [today + timedelta(days=days_ahead)]
                break

    # Time-of-day filter anywhere in the text
    for p in PERIODS:
        if p in lower:
            period_filter = p
            break

    # Default → today
    if not target_dates:
        target_dates = [today]

    return target_dates, period_filter


def extract_location_from_text(text: str) -> str:
    # Strip date/time keywords so they don't end up in the geocoder query
    cleaned = re.sub(
        r'\b(today|tonight|tomorrow|this\s+weekend|weekend|morning|afternoon|evening|night|'
        r'monday|tuesday|wednesday|thursday|friday|saturday|sunday|'
        r'next\s+\w+|this\s+\w+|on\s+\w+day|forecast|weather)\b',
        '', text, flags=re.IGNORECASE,
    ).strip()

    for pattern in [
        r'weather\s+(?:in|for|at|near)\s+([^?.,\n]+)',
        r'\b(?:in|at|near)\s+([A-Z][^?.,\n]+)',
    ]:
        match = re.search(pattern, cleaned, re.IGNORECASE)
        if match:
            return match.group(1).strip()

    stripped = re.sub(
        r"(what'?s?|how'?s?)\s+the\s+weather(\s+(in|for|at|near))?",
        '', cleaned, flags=re.IGNORECASE,
    ).strip(' ?.,')

    return stripped if stripped else text


# ── Geocoding ────────────────────────────────────────────────────────────────

def geocode(query: str) -> Optional[dict]:
    api_key = os.getenv("OPEN_WEATHER_API")
    if not api_key:
        return None
    print(f"[weather] Geocoding: {query!r}")
    try:
        resp = requests.get(OWM_GEO_URL, params={"q": query, "limit": 1, "appid": api_key}, timeout=5)
        resp.raise_for_status()
        results = resp.json()
        if not results:
            print(f"[weather] No geocoding results for {query!r}")
            return None
        r = results[0]
        return {"lat": r["lat"], "lon": r["lon"], "city": r.get("name", ""),
                "state": r.get("state", ""), "country": r.get("country", "")}
    except Exception as e:
        print(f"[weather] Geocoding error: {e}")
        return None


def reverse_geocode(lat: float, lon: float) -> Optional[dict]:
    api_key = os.getenv("OPEN_WEATHER_API")
    if not api_key:
        return None
    try:
        resp = requests.get(OWM_REVERSE_URL, params={"lat": lat, "lon": lon, "limit": 1, "appid": api_key}, timeout=5)
        resp.raise_for_status()
        results = resp.json()
        if not results:
            return None
        r = results[0]
        return {"lat": lat, "lon": lon, "city": r.get("name", ""),
                "state": r.get("state", ""), "country": r.get("country", "")}
    except Exception as e:
        print(f"[weather] Reverse geocode error: {e}")
        return None


def format_location_name(geo: dict) -> str:
    parts = [p for p in [geo.get("city"), geo.get("state"), geo.get("country")] if p]
    return ", ".join(parts)


# ── Weather fetching ─────────────────────────────────────────────────────────

def fetch_current_weather(lat: float, lon: float) -> Optional[dict]:
    api_key = os.getenv("OPEN_WEATHER_API")
    if not api_key:
        return None
    try:
        resp = requests.get(
            OWM_WEATHER_URL,
            params={"lat": lat, "lon": lon, "appid": api_key, "units": "imperial"},
            timeout=5,
        )
        resp.raise_for_status()
        data = resp.json()
        temp_f = data["main"]["temp"]
        feels_f = data["main"]["feels_like"]
        return {
            "condition": data["weather"][0]["main"],
            "temperature_f": round(temp_f),
            "temperature_c": round((temp_f - 32) * 5 / 9),
            "feels_like_f": round(feels_f),
            "feels_like_c": round((feels_f - 32) * 5 / 9),
            "description": data["weather"][0]["description"],
            "humidity": data["main"]["humidity"],
            "wind_speed": data.get("wind", {}).get("speed", 0),
        }
    except Exception as e:
        print(f"[weather] Current weather error: {e}")
        return None


def fetch_forecast(lat: float, lon: float) -> Optional[Tuple[List[dict], int]]:
    """Returns (forecast_items, tz_offset_seconds) or None."""
    api_key = os.getenv("OPEN_WEATHER_API")
    if not api_key:
        return None
    try:
        resp = requests.get(
            OWM_FORECAST_URL,
            params={"lat": lat, "lon": lon, "appid": api_key, "units": "imperial"},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        tz_offset = data.get("city", {}).get("timezone", 0)
        return data["list"], tz_offset
    except Exception as e:
        print(f"[weather] Forecast error: {e}")
        return None


# ── Forecast processing ──────────────────────────────────────────────────────

def hour_to_period(hour: int) -> str:
    if 6 <= hour < 12:
        return "morning"
    if 12 <= hour < 18:
        return "afternoon"
    if 18 <= hour < 21:
        return "evening"
    return "night"  # 0-5 and 21-23


def group_forecast_by_period(
    items: List[dict], target_date: date, tz_offset: int
) -> Dict[str, List[dict]]:
    groups: Dict[str, List[dict]] = {"morning": [], "afternoon": [], "evening": [], "night": []}
    for item in items:
        local_dt = datetime.fromtimestamp(item["dt"] + tz_offset, tz=timezone.utc).replace(tzinfo=None)
        if local_dt.date() != target_date:
            continue
        groups[hour_to_period(local_dt.hour)].append(item)
    return groups


def summarize_period(items: List[dict]) -> Optional[dict]:
    if not items:
        return None
    conditions = [i["weather"][0]["main"] for i in items]
    descriptions = [i["weather"][0]["description"] for i in items]
    temps = [i["main"]["temp"] for i in items]
    condition = Counter(conditions).most_common(1)[0][0]
    description = Counter(descriptions).most_common(1)[0][0]
    return {
        "condition": condition,
        "description": description,
        "temp_min": round(min(temps)),
        "temp_max": round(max(temps)),
    }


# ── AI forecast narrative ────────────────────────────────────────────────────

def generate_narrative(
    location_name: str,
    target_date: date,
    period_summaries: Dict[str, Optional[dict]],
    current: Optional[dict] = None,
) -> str:
    asi_key = os.getenv("ASI_API_KEY")

    # Build a plain text summary as fallback and as context for the LLM
    active = {p: s for p, s in period_summaries.items() if s}
    plain_parts = [
        f"{p}: {s['condition']} ({s['temp_min']}–{s['temp_max']}F)"
        for p, s in active.items()
    ]
    plain = " | ".join(plain_parts) if plain_parts else "No forecast data available."

    if not asi_key or not active:
        return plain

    is_today = target_date == date.today()
    date_label = "today" if is_today else target_date.strftime("%A, %B %-d")

    period_lines = "\n".join(
        f"- {p.capitalize()}: {s['description']}, {s['temp_min']}–{s['temp_max']}F"
        for p, s in active.items()
    )
    current_line = ""
    if current and is_today:
        current_line = f"Currently: {current['description']}, {current['temperature_f']}F, feels like {current['feels_like_f']}F.\n"

    prompt = (
        f"Write 1–2 friendly sentences summarizing the weather in {location_name} for {date_label}. "
        f"Include how it changes through the day. Keep it under 40 words.\n\n"
        f"{current_line}"
        f"Forecast breakdown:\n{period_lines}"
    )

    try:
        resp = requests.post(
            ASI_URL,
            headers={"Authorization": f"Bearer {asi_key}", "Content-Type": "application/json"},
            json={
                "model": "asi1-mini",
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 80,
                "temperature": 0.7,
            },
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"].strip()
    except Exception as e:
        print(f"[weather] ASI narrative error: {e}")
        return plain


# ── Response formatting ──────────────────────────────────────────────────────

def format_period_row(label: str, summary: Optional[dict]) -> str:
    if not summary:
        return f"  {label:<12} No data"
    return (
        f"  {label:<12} {summary['condition']} ({summary['description']}), "
        f"{summary['temp_min']}–{summary['temp_max']}F"
    )


def build_response(
    location_name: str,
    target_dates: List[date],
    period_filter: Optional[str],
    forecast_result: Optional[Tuple[List[dict], int]],
    current: Optional[dict],
) -> str:
    today = date.today()
    blocks: List[str] = []

    for target_date in target_dates:
        if target_date == today:
            date_label = "Today"
        elif target_date == today + timedelta(days=1):
            date_label = "Tomorrow"
        else:
            date_label = target_date.strftime("%A, %B %-d")

        if forecast_result:
            items, tz_offset = forecast_result
            groups = group_forecast_by_period(items, target_date, tz_offset)

            if period_filter:
                groups = {period_filter: groups.get(period_filter, [])}

            summaries = {p: summarize_period(v) for p, v in groups.items()}
            active_summaries = {p: s for p, s in summaries.items() if s}

            narrative = generate_narrative(
                location_name, target_date, summaries,
                current if target_date == today else None,
            )

            header = f"Weather for {location_name} — {date_label}"
            block = header + "\n\n" + narrative

            if active_summaries:
                block += "\n\n"
                ordered_periods = [p for p in ["morning", "afternoon", "evening", "night"] if p in active_summaries]
                block += "\n".join(format_period_row(p.capitalize(), active_summaries[p]) for p in ordered_periods)

            if target_date == today and current and not period_filter:
                block += (
                    f"\n\nRight now:    {current['condition']} ({current['description']}), "
                    f"{current['temperature_f']}F / {current['temperature_c']}C\n"
                    f"Feels like:   {current['feels_like_f']}F\n"
                    f"Humidity:     {current['humidity']}%\n"
                    f"Wind:         {current['wind_speed']} mph"
                )
        else:
            # Forecast unavailable — fall back to current weather for today only
            if target_date == today and current:
                block = (
                    f"Weather for {location_name} — {date_label}\n\n"
                    f"{current['condition']} ({current['description']}), "
                    f"{current['temperature_f']}F / {current['temperature_c']}C\n"
                    f"Feels like:   {current['feels_like_f']}F\n"
                    f"Humidity:     {current['humidity']}%\n"
                    f"Wind:         {current['wind_speed']} mph"
                )
            else:
                block = f"Weather for {location_name} — {date_label}\n\nForecast unavailable."

        blocks.append(block)

    return "\n\n" + ("─" * 40) + "\n\n".join(blocks)


# ── Handlers ─────────────────────────────────────────────────────────────────

@proto.on_message(ChatMessage)
async def handle_message(ctx: Context, sender: str, msg: ChatMessage) -> None:
    ctx.logger.info(f"[1] Message received from {sender}")

    await ctx.send(
        sender,
        ChatAcknowledgement(
            timestamp=datetime.now().replace(tzinfo=None),
            acknowledged_msg_id=msg.msg_id,
        ),
    )

    query = extract_query_text(msg)
    ctx.logger.info(f"[2] Query: {query!r}")

    target_dates, period_filter = parse_date_and_period(query)
    ctx.logger.info(f"[2] Dates: {target_dates}, period filter: {period_filter}")

    coords = parse_coordinates(query)
    if coords:
        lat, lon = coords
        geo = await asyncio.to_thread(reverse_geocode, lat, lon)
    else:
        location_str = extract_location_from_text(query)
        ctx.logger.info(f"[3] Location string: {location_str!r}")
        geo = await asyncio.to_thread(geocode, location_str)

    if not geo:
        ctx.logger.info("[3] Geocoding failed")
        await ctx.send(sender, ChatMessage(
            timestamp=datetime.now(timezone.utc),
            msg_id=uuid4(),
            content=[TextContent(type="text", text=FALLBACK_MESSAGE)],
        ))
        return

    location_name = format_location_name(geo)
    ctx.logger.info(f"[4] Location: {location_name}")

    current, forecast_result = await asyncio.gather(
        asyncio.to_thread(fetch_current_weather, geo["lat"], geo["lon"]),
        asyncio.to_thread(fetch_forecast, geo["lat"], geo["lon"]),
    )

    ctx.logger.info(f"[5] Current: {current is not None}, Forecast: {forecast_result is not None}")

    response = build_response(location_name, target_dates, period_filter, forecast_result, current)

    await ctx.send(sender, ChatMessage(
        timestamp=datetime.now(timezone.utc),
        msg_id=uuid4(),
        content=[TextContent(type="text", text=response)],
    ))
    ctx.logger.info("[6] Response sent")


@proto.on_message(ChatAcknowledgement)
async def handle_ack(ctx: Context, sender: str, _msg: ChatAcknowledgement) -> None:
    ctx.logger.info(f"Ack from {sender}")


# ── Orchestrator protocol ────────────────────────────────────────────────────
# Handles ContextAgentRequest from the orchestrator and replies with a
# ContextAgentResponse containing structured weather data.

orchestrator_proto = Protocol(name="orchestrator-weather", version="0.1.0")


def _resolve_location(msg: ContextAgentRequest) -> Optional[str]:
    """Pick the best available location string from the request."""
    return (
        msg.parsed_input.location_hint
        or msg.user_profile.home_location
        or None
    )


async def _fetch_weather_for_location(location_str: str) -> Optional[dict]:
    """Geocode the location string and return structured current-weather data."""
    geo = await asyncio.to_thread(geocode, location_str)
    if not geo:
        return None
    current = await asyncio.to_thread(fetch_current_weather, geo["lat"], geo["lon"])
    if not current:
        return None

    location_name = format_location_name(geo)
    today = date.today()
    forecast_result = await asyncio.to_thread(fetch_forecast, geo["lat"], geo["lon"])

    narrative = ""
    if forecast_result:
        items, tz_offset = forecast_result
        groups = group_forecast_by_period(items, today, tz_offset)
        summaries = {p: summarize_period(v) for p, v in groups.items()}
        narrative = generate_narrative(location_name, today, summaries, current)

    return {
        "location": location_name,
        "condition": current["condition"],
        "description": current["description"],
        "temperature_f": current["temperature_f"],
        "temperature_c": current["temperature_c"],
        "feels_like_f": current["feels_like_f"],
        "humidity": current["humidity"],
        "wind_speed": current["wind_speed"],
        "narrative": narrative,
    }


@orchestrator_proto.on_message(ContextAgentRequest)
async def handle_context_request(ctx: Context, sender: str, msg: ContextAgentRequest) -> None:
    ctx.logger.info(f"[orchestrator] ContextAgentRequest received for session {msg.session_id}")

    location_str = _resolve_location(msg)
    weather_data = None
    error = None

    if location_str:
        weather_data = await _fetch_weather_for_location(location_str)
        if not weather_data:
            error = f"Could not fetch weather for location: {location_str!r}"
    else:
        error = "No location provided in parsed_input or user_profile"

    if weather_data is None:
        ctx.logger.warning(f"[orchestrator] {error} — using fallback")
        weather_data = {
            "location": "unknown",
            "condition": "Clear",
            "description": "mild conditions",
            "temperature_f": 68,
            "temperature_c": 20,
            "feels_like_f": 68,
            "humidity": 50,
            "wind_speed": 5,
            "narrative": FALLBACK_MESSAGE,
        }

    await ctx.send(sender, ContextAgentResponse(
        session_id=msg.session_id,
        agent_name="weather",
        context_data=weather_data,
        error=error,
    ))
    ctx.logger.info(f"[orchestrator] ContextAgentResponse sent for session {msg.session_id}")


agent.include(proto, publish_manifest=True)
agent.include(orchestrator_proto, publish_manifest=True)


@agent.on_rest_post("/run", WeatherRunRequest, WeatherRunResponse)
async def handle_rest_run(ctx: Context, req: WeatherRunRequest) -> WeatherRunResponse:
    data = await _fetch_weather_for_location(req.location)
    if not data:
        return WeatherRunResponse(
            condition="Clear", description="mild conditions",
            temperature_f=68, feels_like_f=68,
            humidity=50, wind_speed=5.0, narrative=FALLBACK_MESSAGE,
            error=f"Could not fetch weather for {req.location!r}",
        )
    return WeatherRunResponse(
        condition=data["condition"],
        description=data["description"],
        temperature_f=data["temperature_f"],
        feels_like_f=data["feels_like_f"],
        humidity=data["humidity"],
        wind_speed=data["wind_speed"],
        narrative=data["narrative"],
        error=None,
    )


@agent.on_event("startup")
async def on_startup(ctx: Context) -> None:
    ctx.logger.info(f"Weather agent started: {agent.address}")


if __name__ == "__main__":
    agent.run()
