import json
import os
import time
import random
import sys
from typing import Optional

from dotenv import load_dotenv
from openai import OpenAI
from uagents import Agent, Context, Model, Protocol

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from shared.models import ActionAgentRequest, ActionAgentResponse

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))

ASI1_API_KEY = os.getenv("ASI1_API_KEY")
MEAL_AGENT_PORT = int(os.getenv("MEAL_AGENT_PORT", "8006"))
MEAL_AGENT_ENDPOINT = os.getenv("MEAL_AGENT_ENDPOINT") or f"http://localhost:{MEAL_AGENT_PORT}/submit"
ORCHESTRATOR_AGENT_ADDRESS = os.getenv("ORCHESTRATOR_AGENT_ADDRESS", "").strip()

agent = Agent(
    name="meal-agent",
    seed=os.getenv("AGENT_SEED", "meal-agent-seed"),
    port=MEAL_AGENT_PORT,
    endpoint=[MEAL_AGENT_ENDPOINT],
    mailbox=True,
)
orchestrator_proto = Protocol(name="orchestrator-pipeline", version="0.1.0")

client = OpenAI(
    base_url="https://api.asi1.ai/v1",
    api_key=ASI1_API_KEY,
)


class MealDish(Model):
    name: str
    station: str
    reason: str


class MealWindow(Model):
    dishes: list


class MealRunRequest(Model):
    prompt: str
    mood: Optional[str] = None
    stress_level: Optional[str] = None
    energy_level: Optional[int] = None
    events: Optional[list] = None
    morning_focus: Optional[str] = None
    dietary_profile: Optional[str] = None
    food_preferences: Optional[str] = None
    ucla_menu_snapshot: Optional[dict] = None
    exclude_dishes: Optional[list[str]] = None


class MealRunResponse(Model):
    value: str
    detail: str
    previewData: str
    meals: dict
    rationale: str
    dietFlags: list
    sourceMeta: dict
    error: Optional[str] = None


FALLBACK_RESPONSE = {
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

_CAMPUS_FALLBACK_POOL = {
    "breakfast": [
        {"name": "Avocado Toast", "station": "Bruin Plate"},
        {"name": "Greek Yogurt Parfait", "station": "Epicuria at Covel"},
        {"name": "Veggie Breakfast Burrito", "station": "De Neve Dining"},
        {"name": "Steel-Cut Oats", "station": "Bruin Plate"},
    ],
    "lunch": [
        {"name": "Tofu Grain Bowl", "station": "Epicuria at Covel"},
        {"name": "Chickpea Power Bowl", "station": "Epicuria at Covel"},
        {"name": "Grilled Chicken Plate", "station": "De Neve Dining"},
        {"name": "Mediterranean Wrap", "station": "The Study"},
        {"name": "Quinoa Salad", "station": "Bruin Plate"},
    ],
    "dinner": [
        {"name": "Salmon with Rice", "station": "Bruin Plate"},
        {"name": "Herb Chicken and Vegetables", "station": "Bruin Plate"},
        {"name": "Lentil Curry", "station": "Feast at Rieber"},
        {"name": "Veggie Pasta", "station": "De Neve Dining"},
        {"name": "Stir-Fry Tofu", "station": "Epicuria at Covel"},
    ],
}


def _build_menu_context(snapshot: Optional[dict]) -> str:
    if not snapshot:
        return "No live UCLA menu data available — use general UCLA dining knowledge."

    dining_halls = snapshot.get("diningHalls", [])
    hall_list = ", ".join(dining_halls[:8]) if dining_halls else snapshot.get("diningHall", "UCLA dining")
    lines = [f"UCLA Dining Menu — {snapshot.get('date', 'today')} · Locations: {hall_list}"]

    locations = snapshot.get("locations", [])
    if locations:
        for location in locations[:8]:
            location_name = location.get("name", "Unknown location")
            lines.append(f"\n{location_name}:")
            for period in ("breakfast", "lunch", "dinner"):
                window = location.get(period, {})
                dishes = window.get("dishes", [])
                if dishes:
                    names = ", ".join(d.get("name", "") for d in dishes[:8] if d.get("name"))
                    lines.append(f"- {period.capitalize()}: {names}")
    else:
        for period in ("breakfast", "lunch", "dinner"):
            window = snapshot.get(period, {})
            dishes = window.get("dishes", [])
            if dishes:
                names = ", ".join(d.get("name", "") for d in dishes[:12] if d.get("name"))
                lines.append(f"{period.capitalize()}: {names}")
    return "\n".join(lines)

def _build_snapshot_plan(req: MealRunRequest) -> dict:
    snapshot = req.ucla_menu_snapshot or {}
    locations = snapshot.get("locations", []) if isinstance(snapshot, dict) else []
    raw_halls = snapshot.get("diningHalls", []) if isinstance(snapshot, dict) else []
    dining_halls = list(dict.fromkeys([str(h).strip() for h in raw_halls if str(h).strip()]))
    service_date = snapshot.get("date", "today") if isinstance(snapshot, dict) else "today"
    excluded = set((dish or "").strip().lower() for dish in (req.exclude_dishes or []) if isinstance(dish, str))

    if not locations:
        # No snapshot available — return static fallback as last resort.
        return dict(FALLBACK_RESPONSE)

    def pick_for_period(period: str) -> list[dict]:
        # Keep dishes for each period from the same location.
        shuffled_locations = locations[:]
        random.shuffle(shuffled_locations)
        for location in shuffled_locations:
            window = location.get(period, {}) if isinstance(location, dict) else {}
            dishes = window.get("dishes", []) if isinstance(window, dict) else []
            location_name = str(location.get("name", "UCLA Dining")).strip() if isinstance(location, dict) else "UCLA Dining"
            picked_from_location: list[dict] = []
            for dish in dishes:
                name = str(dish.get("name", "")).strip() if isinstance(dish, dict) else ""
                if not name or name.lower() in excluded:
                    continue
                picked_from_location.append({
                    "name": name,
                    "station": location_name,
                    "reason": "Fits your day and available on campus",
                })
                if len(picked_from_location) >= 2:
                    for picked in picked_from_location:
                        excluded.add(picked["name"].lower())
                    return picked_from_location

        # Fallback still honors one location per period.
        fallback_options = _CAMPUS_FALLBACK_POOL.get(period, [])
        by_station: dict[str, list[dict]] = {}
        for option in fallback_options:
            by_station.setdefault(option["station"], []).append(option)
        stations = list(by_station.keys())
        random.shuffle(stations)
        for station in stations:
            picked: list[dict] = []
            for option in by_station[station]:
                name = option["name"]
                if name.lower() in excluded:
                    continue
                picked.append({
                    "name": name,
                    "station": station,
                    "reason": "Good fit for your schedule and goals",
                })
                if len(picked) >= 2:
                    for selected in picked:
                        excluded.add(selected["name"].lower())
                    return picked
        return []

    def fallback_for_period(period: str) -> list[dict]:
        fallback_options = _CAMPUS_FALLBACK_POOL.get(period, [])
        by_station: dict[str, list[dict]] = {}
        for option in fallback_options:
            by_station.setdefault(option["station"], []).append(option)
        for station, options in by_station.items():
            if len(options) >= 2:
                return [
                    {"name": options[0]["name"], "station": station, "reason": "Good fit for your schedule and goals"},
                    {"name": options[1]["name"], "station": station, "reason": "Good fit for your schedule and goals"},
                ]
        return FALLBACK_RESPONSE["meals"][period]["dishes"]

    breakfast = pick_for_period("breakfast")
    lunch = pick_for_period("lunch")
    dinner = pick_for_period("dinner")
    hall_summary = ", ".join(dining_halls[:3]) if dining_halls else "UCLA Dining"
    return {
        "value": "Today's UCLA Meal Plan",
        "detail": "Campus-wide · Breakfast + Lunch + Dinner",
        "previewData": f"Fresh picks across {hall_summary}.",
        "meals": {
            "breakfast": {"dishes": breakfast or fallback_for_period("breakfast")},
            "lunch": {"dishes": lunch or fallback_for_period("lunch")},
            "dinner": {"dishes": dinner or fallback_for_period("dinner")},
        },
        "rationale": "These picks use live campus menu availability while aligning with your day.",
        "dietFlags": ["balanced"],
        "sourceMeta": {
            "diningHall": "UCLA Dining",
            "diningHalls": dining_halls or FALLBACK_RESPONSE["sourceMeta"]["diningHalls"],
            "serviceDate": service_date,
        },
    }


def _recommend_meals(req: MealRunRequest) -> dict:
    if not ASI1_API_KEY:
        return _build_snapshot_plan(req)

    menu_context = _build_menu_context(req.ucla_menu_snapshot)
    dining_halls = (req.ucla_menu_snapshot or {}).get("diningHalls", [])
    dining_hall_summary = ", ".join(dining_halls[:4]) if dining_halls else (req.ucla_menu_snapshot or {}).get("diningHall", "UCLA dining")
    service_date = (req.ucla_menu_snapshot or {}).get("date", "today")

    dietary_line = f"- Dietary restrictions / allergies (hard block): {req.dietary_profile}" if req.dietary_profile else ""
    food_pref_line = f"- Food preferences (soft rank, prefer these): {req.food_preferences}" if req.food_preferences else ""
    focus_line = f"- Morning focus / goal: {req.morning_focus}" if req.morning_focus else ""
    events_line = f"- Today's events: {', '.join(req.events or [])}" if req.events else ""
    exclude_line = f"- Avoid dishes already served recently: {', '.join(req.exclude_dishes or [])}" if req.exclude_dishes else ""

    prompt = f"""You are a UCLA campus nutrition advisor helping a student plan their meals for the day.

Available menu today:
{menu_context}

Student context:
- Prompt: {req.prompt}
- Mood: {req.mood or "neutral"}
- Stress level: {req.stress_level or "medium"}
- Energy level (1-10): {req.energy_level or 7}
{dietary_line}
{food_pref_line}
{focus_line}
{events_line}
{exclude_line}

Rules:
1. Hard-block any dishes that conflict with stated dietary restrictions/allergies.
1a. Soft-rank dishes that match stated food preferences higher — mention the match in the reason field.
2. Prefer dishes from the live menu when available; include multiple UCLA dining locations when possible.
3. Select 2 dishes per meal period (breakfast, lunch, dinner).
4. Keep both dishes in each meal period from the same dining hall/station.
5. For each dish provide a short reason (≤10 words) explaining why it fits the student's day.
6. Identify 1-3 diet flags from: high-protein, low-carb, vegetarian, vegan, balanced, comfort, light.

Return ONLY valid JSON with this exact shape:
{{
  "value": "short card headline (e.g. \\"Today\\'s UCLA Dining Pick\\")",
  "detail": "Campus-wide · Breakfast + Lunch + Dinner",
  "previewData": "one sentence summary of the day\\'s meal plan",
  "meals": {{
    "breakfast": {{
      "dishes": [
        {{"name": "...", "station": "...", "reason": "..."}},
        {{"name": "...", "station": "...", "reason": "..."}}
      ]
    }},
    "lunch": {{
      "dishes": [
        {{"name": "...", "station": "...", "reason": "..."}},
        {{"name": "...", "station": "...", "reason": "..."}}
      ]
    }},
    "dinner": {{
      "dishes": [
        {{"name": "...", "station": "...", "reason": "..."}},
        {{"name": "...", "station": "...", "reason": "..."}}
      ]
    }}
  }},
  "rationale": "2-3 sentences explaining why these dishes fit the student\\'s goals and energy needs",
  "dietFlags": ["flag1", "flag2"],
  "sourceMeta": {{
    "diningHall": "UCLA Dining",
    "diningHalls": {json.dumps(dining_halls) if dining_halls else '[]'},
    "serviceDate": "{service_date}"
  }}
}}
"""

    try:
        response = client.chat.completions.create(
            model="asi1-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=600,
        )
        raw = response.choices[0].message.content.strip()
        # Strip markdown fences if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        parsed = json.loads(raw)
        # Validate required keys exist
        required = {"value", "detail", "previewData", "meals", "rationale", "dietFlags", "sourceMeta"}
        if not required.issubset(parsed.keys()):
            raise ValueError(f"Missing keys: {required - parsed.keys()}")
        return parsed
    except Exception as err:
        print(f"[meal-agent] LLM generation failed: {err} — using fallback")
        return _build_snapshot_plan(req)


@agent.on_rest_post("/run", MealRunRequest, MealRunResponse)
async def handle_run(_ctx: Context, req: MealRunRequest) -> MealRunResponse:
    start = time.time()
    result = _recommend_meals(req)
    print(f"[meal-agent] completed in {time.time() - start:.2f}s")
    return MealRunResponse(
        value=result.get("value", FALLBACK_RESPONSE["value"]),
        detail=result.get("detail", FALLBACK_RESPONSE["detail"]),
        previewData=result.get("previewData", FALLBACK_RESPONSE["previewData"]),
        meals=result.get("meals", FALLBACK_RESPONSE["meals"]),
        rationale=result.get("rationale", FALLBACK_RESPONSE["rationale"]),
        dietFlags=result.get("dietFlags", FALLBACK_RESPONSE["dietFlags"]),
        sourceMeta=result.get("sourceMeta", FALLBACK_RESPONSE["sourceMeta"]),
        error=None,
    )


def _build_meal_request(msg: ActionAgentRequest) -> MealRunRequest:
    parsed = msg.enriched_context.parsed_input
    profile = msg.enriched_context.user_profile
    dietary_profile = ", ".join(profile.dietary_restrictions) if profile.dietary_restrictions else None
    events = [parsed.schedule_notes] if parsed.schedule_notes else None
    return MealRunRequest(
        prompt=parsed.raw_prompt,
        mood=parsed.mood,
        stress_level=parsed.stress_level,
        energy_level=None,
        events=events,
        morning_focus=None,
        dietary_profile=dietary_profile,
        food_preferences=profile.preferred_cuisine,
        ucla_menu_snapshot=None,
        exclude_dishes=None,
    )


@orchestrator_proto.on_message(ActionAgentRequest)
async def handle_action_request(ctx: Context, sender: str, msg: ActionAgentRequest) -> None:
    ctx.logger.info(f"[meal] ActionAgentRequest received for session {msg.session_id}")
    reply_target = ORCHESTRATOR_AGENT_ADDRESS or sender
    if ORCHESTRATOR_AGENT_ADDRESS:
        ctx.logger.info(f"[meal] replying to configured ORCHESTRATOR_AGENT_ADDRESS: {reply_target}")
    else:
        ctx.logger.info(f"[meal] replying to sender: {reply_target}")

    error: Optional[str] = None
    try:
        run_req = _build_meal_request(msg)
        result = await handle_run(ctx, run_req)
        card_data = result.model_dump(exclude_none=True)
    except Exception as exc:
        ctx.logger.exception(f"[meal] failed to generate card: {exc}")
        error = str(exc)
        card_data = dict(FALLBACK_RESPONSE)

    await ctx.send(
        reply_target,
        ActionAgentResponse(
            session_id=msg.session_id,
            agent_name="meal",
            card_data=card_data,
            error=error,
        ),
    )
    ctx.logger.info(f"[meal] ActionAgentResponse sent for session {msg.session_id}")


@agent.on_event("startup")
async def on_startup(ctx: Context) -> None:
    ctx.logger.info(f"Meal agent started: {agent.address}")


if __name__ == "__main__":
    agent.include(orchestrator_proto, publish_manifest=True)
    agent.run()
