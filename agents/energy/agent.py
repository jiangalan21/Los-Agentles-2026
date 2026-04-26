import json
import os
import re
import sys
import time
from datetime import datetime, timedelta
from typing import Optional

from dotenv import load_dotenv
from openai import OpenAI
from uagents import Agent, Context, Model, Protocol

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from shared.models import ActionAgentRequest, ActionAgentResponse

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))

ASI1_API_KEY = os.getenv("ASI1_API_KEY")
ENERGY_AGENT_PORT = int(os.getenv("ENERGY_AGENT_PORT", "8005"))
ENERGY_AGENT_ENDPOINT = os.getenv("ENERGY_AGENT_ENDPOINT") or f"http://localhost:{ENERGY_AGENT_PORT}/submit"
ENERGY_AGENT_DEBUG = os.getenv("ENERGY_AGENT_DEBUG", "").lower() in {"1", "true", "yes"}
ORCHESTRATOR_AGENT_ADDRESS = os.getenv("ORCHESTRATOR_AGENT_ADDRESS", "").strip()

agent = Agent(
    name="energy-agent",
    seed=os.getenv("AGENT_SEED", "energy-agent-seed"),
    port=ENERGY_AGENT_PORT,
    endpoint=[ENERGY_AGENT_ENDPOINT],
    mailbox=True,
)
orchestrator_proto = Protocol(name="orchestrator-pipeline", version="0.1.0")

client = OpenAI(
    base_url="https://api.asi1.ai/v1",
    api_key=ASI1_API_KEY,
)


class EnergyRunRequest(Model):
    prompt: str
    mood: Optional[str] = None
    stress_level: Optional[str] = None
    energy_level: Optional[int] = None
    wake_time: Optional[str] = None
    schedule_notes: Optional[str] = None
    events: Optional[list] = None
    location: Optional[str] = None
    morning_focus: Optional[str] = None


class EnergyRunResponse(Model):
    headlineValue: str
    coachSummary: str
    wellnessTips: list
    energyWindows: dict
    energyCurve: list
    quote: dict
    value: str
    detail: str
    previewData: str
    toneTag: str
    error: Optional[str] = None


FALLBACK_RESPONSE = {
    "headlineValue": "70% charged",
    "coachSummary": "You are in good shape. Keep a steady pace and protect your best focus block.",
    "wellnessTips": [
        "Start with water before caffeine.",
        "Do one deep-breath reset before your first hard task.",
        "Take a 10-minute movement break before the afternoon dip.",
    ],
    "energyWindows": {
        "peakStart": "10:30 AM",
        "peakEnd": "12:30 PM",
        "dipStart": "2:30 PM",
        "dipEnd": "4:00 PM",
    },
    "energyCurve": [
        {"timeLabel": "7:00 AM", "value": 45},
        {"timeLabel": "9:00 AM", "value": 62},
        {"timeLabel": "11:00 AM", "value": 79},
        {"timeLabel": "1:00 PM", "value": 71},
        {"timeLabel": "3:00 PM", "value": 54},
        {"timeLabel": "6:00 PM", "value": 61},
    ],
    "quote": {
        "text": "Your energy follows your choices. Stack small wins and let momentum do the heavy lifting.",
        "authorOrSource": "Morning Coach",
    },
    "value": "70% charged",
    "detail": "Supportive momentum plan",
    "previewData": "Peak around late morning, dip in the afternoon. Fuel up and stay consistent.",
    "toneTag": "supportive-frat-bro-therapist",
}


def _debug_log(run_id: str, hypothesis_id: str, location: str, message: str, data: dict) -> None:
    if not ENERGY_AGENT_DEBUG:
        return
    print(json.dumps({
        "runId": run_id,
        "hypothesisId": hypothesis_id,
        "location": location,
        "message": message,
        "data": data,
        "timestamp": int(time.time() * 1000),
    }))


def _parse_wake_time(raw_wake_time: Optional[str], prompt: str) -> Optional[datetime]:
    if raw_wake_time:
        match = re.match(r"^(\d{1,2}):(\d{2})$", raw_wake_time.strip())
        if match:
            hour = int(match.group(1))
            minute = int(match.group(2))
            if 0 <= hour <= 23 and 0 <= minute <= 59:
                now = datetime.now()
                return now.replace(hour=hour, minute=minute, second=0, microsecond=0)

    prompt_match = re.search(r"\b(?:woke up at|woke at|up since)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b", prompt.lower())
    if not prompt_match:
        return None

    hour = int(prompt_match.group(1))
    minute = int(prompt_match.group(2) or "0")
    meridiem = prompt_match.group(3)
    if meridiem == "am":
        hour = 0 if hour == 12 else hour
    elif meridiem == "pm":
        hour = 12 if hour == 12 else hour + 12

    if hour < 0 or hour > 23 or minute < 0 or minute > 59:
        return None
    now = datetime.now()
    return now.replace(hour=hour, minute=minute, second=0, microsecond=0)


def _format_time(dt: datetime) -> str:
    return dt.strftime("%I:%M %p").lstrip("0")


def _build_curve(wake_time: datetime, baseline: int) -> tuple[list, dict]:
    peak_start = wake_time + timedelta(hours=3, minutes=30)
    peak_end = wake_time + timedelta(hours=5, minutes=30)
    dip_start = wake_time + timedelta(hours=8)
    dip_end = wake_time + timedelta(hours=9, minutes=30)

    base_percent = max(45, min(95, baseline * 10))
    peak_value = min(98, base_percent + 14)
    dip_value = max(35, base_percent - 18)

    curve = [
        {"timeLabel": _format_time(wake_time), "value": max(35, base_percent - 18)},
        {"timeLabel": _format_time(wake_time + timedelta(hours=2)), "value": max(45, base_percent - 5)},
        {"timeLabel": _format_time(peak_start), "value": peak_value},
        {"timeLabel": _format_time(peak_end), "value": min(95, peak_value - 4)},
        {"timeLabel": _format_time(dip_start), "value": max(42, dip_value + 8)},
        {"timeLabel": _format_time(dip_end), "value": dip_value},
        {"timeLabel": _format_time(dip_end + timedelta(hours=2)), "value": max(45, dip_value + 10)},
    ]

    windows = {
        "peakStart": _format_time(peak_start),
        "peakEnd": _format_time(peak_end),
        "dipStart": _format_time(dip_start),
        "dipEnd": _format_time(dip_end),
    }
    return curve, windows


def _generate_coaching_copy(req: EnergyRunRequest, windows: dict) -> dict:
    if not ASI1_API_KEY:
        # region agent log
        _debug_log(f"run-energy-{int(time.time() * 1000)}", "H2", "agents/energy/agent.py:_generate_coaching_copy:noApiKey", "ASI key missing, using fallback coaching copy", {
            "hasMorningFocus": bool(req.morning_focus),
        })
        # endregion
        return dict(FALLBACK_RESPONSE)

    morning_focus_line = f"- Morning focus / goal: {req.morning_focus}" if req.morning_focus else ""

    prompt = f"""
You are an encouraging morning coach with a supportive, playful "therapist + frat-bro" style.
Write practical wellness guidance with positive, non-judgmental language.
No medical claims, no diagnosis, no unsafe advice.
Keep everything concise and useful for a student morning routine.

If a morning focus or goal is provided, tailor the wellness tips specifically to help the user
achieve that goal — e.g. if they want to stay calm for an exam, prioritise breathing and
stress-reduction tips; if they want energy for a workout, prioritise hydration and movement.

Context:
- User prompt: {req.prompt}
- Mood: {req.mood or "unknown"}
- Stress level: {req.stress_level or "unknown"}
- Energy baseline (1-10): {req.energy_level or 7}
- Predicted peak window: {windows["peakStart"]} to {windows["peakEnd"]}
- Predicted dip window: {windows["dipStart"]} to {windows["dipEnd"]}
- Events: {", ".join(req.events or []) or "general routine"}
{morning_focus_line}

Return only JSON with exact fields:
{{
  "coachSummary": "string",
  "wellnessTips": ["tip1","tip2","tip3"],
  "quote": {{
    "text": "string",
    "authorOrSource": "string"
  }},
  "detail": "string",
  "previewData": "string"
}}
"""
    try:
        response = client.chat.completions.create(
            model="asi1-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=320,
        )
        parsed = json.loads(response.choices[0].message.content.strip())
        if not isinstance(parsed.get("wellnessTips"), list) or len(parsed["wellnessTips"]) < 3:
            raise ValueError("wellnessTips missing")
        return parsed
    except Exception as error:
        # region agent log
        _debug_log(f"run-energy-{int(time.time() * 1000)}", "H2", "agents/energy/agent.py:_generate_coaching_copy:exception", "LLM generation failed, using fallback coaching copy", {
            "error": str(error),
            "hasMorningFocus": bool(req.morning_focus),
        })
        # endregion
        return {
            "coachSummary": "You have a strong base. Keep your routine tight and ride your peak window with confidence.",
            "wellnessTips": FALLBACK_RESPONSE["wellnessTips"],
            "quote": FALLBACK_RESPONSE["quote"],
            "detail": "Party mode with purpose",
            "previewData": "You're built for a big morning. Stay hydrated and attack your highest-priority task early.",
        }


@agent.on_rest_post("/run", EnergyRunRequest, EnergyRunResponse)
async def handle_run(_ctx: Context, req: EnergyRunRequest) -> EnergyRunResponse:
    run_id = f"run-{int(time.time() * 1000)}"
    # region agent log
    _debug_log(run_id, "H2", "agents/energy/agent.py:handle_run:entry", "Energy agent received request", {
        "hasWakeTime": bool(req.wake_time),
        "hasPrompt": bool(req.prompt),
        "energyLevel": req.energy_level,
    })
    # endregion
    wake_time = _parse_wake_time(req.wake_time, req.prompt)
    baseline = req.energy_level if req.energy_level is not None else 7

    if wake_time is None:
        wake_time = datetime.now()

    curve, windows = _build_curve(wake_time, baseline)
    generated = _generate_coaching_copy(req, windows)

    headline = f"{max(52, min(95, baseline * 10))}% charged"
    result = {
        "headlineValue": headline,
        "coachSummary": generated["coachSummary"],
        "wellnessTips": generated["wellnessTips"][:3],
        "energyWindows": windows,
        "energyCurve": curve,
        "quote": generated["quote"],
        "value": headline,
        "detail": generated.get("detail", "Supportive momentum plan"),
        "previewData": generated.get("previewData", "Peak and dip windows generated from your wake time."),
        "toneTag": "supportive-frat-bro-therapist",
        "error": None,
    }
    # region agent log
    _debug_log(run_id, "H2", "agents/energy/agent.py:handle_run:result", "Energy agent returning response", {
        "headlineValue": result["headlineValue"],
        "errorField": result["error"],
    })
    # endregion
    return EnergyRunResponse(**result)


def _build_energy_request(msg: ActionAgentRequest) -> EnergyRunRequest:
    parsed = msg.enriched_context.parsed_input
    profile = msg.enriched_context.user_profile
    events = [parsed.schedule_notes] if parsed.schedule_notes else None
    location = (msg.enriched_context.weather or {}).get("location") or profile.home_location
    return EnergyRunRequest(
        prompt=parsed.raw_prompt,
        mood=parsed.mood,
        stress_level=parsed.stress_level,
        energy_level=None,
        wake_time=None,
        schedule_notes=parsed.schedule_notes,
        events=events,
        location=location,
        morning_focus=None,
    )


@orchestrator_proto.on_message(ActionAgentRequest)
async def handle_action_request(ctx: Context, sender: str, msg: ActionAgentRequest) -> None:
    ctx.logger.info(f"[energy] ActionAgentRequest received for session {msg.session_id}")
    reply_target = ORCHESTRATOR_AGENT_ADDRESS or sender
    if ORCHESTRATOR_AGENT_ADDRESS:
        ctx.logger.info(f"[energy] replying to configured ORCHESTRATOR_AGENT_ADDRESS: {reply_target}")
    else:
        ctx.logger.info(f"[energy] replying to sender: {reply_target}")

    error: Optional[str] = None
    try:
        run_req = _build_energy_request(msg)
        result = await handle_run(ctx, run_req)
        card_data = result.model_dump(exclude_none=True)
    except Exception as exc:
        ctx.logger.exception(f"[energy] failed to generate card: {exc}")
        error = str(exc)
        card_data = dict(FALLBACK_RESPONSE)

    await ctx.send(
        reply_target,
        ActionAgentResponse(
            session_id=msg.session_id,
            agent_name="energy",
            card_data=card_data,
            error=error,
        ),
    )
    ctx.logger.info(f"[energy] ActionAgentResponse sent for session {msg.session_id}")


@agent.on_event("startup")
async def on_startup(ctx: Context) -> None:
    ctx.logger.info(f"Energy agent started: {agent.address}")


if __name__ == "__main__":
    agent.include(orchestrator_proto, publish_manifest=True)
    agent.run()
