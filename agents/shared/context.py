from dataclasses import dataclass, field
from typing import Optional


@dataclass
class Location:
    lat: float
    lon: float
    city: Optional[str] = None


@dataclass
class WeatherContext:
    condition: str
    temperature: float
    feels_like: float
    forecast: str


@dataclass
class UserPreferences:
    cuisine: list[str] = field(default_factory=list)
    music: list[str] = field(default_factory=list)
    style: list[str] = field(default_factory=list)
    agents_enabled: dict[str, bool] = field(default_factory=dict)


@dataclass
class DayContext:
    user_id: str
    session_id: str
    prompt: str
    mood: str
    energy_level: int  # 1–10
    events: list[str]
    location: Location
    preferences: UserPreferences
    weather: Optional[WeatherContext] = None
