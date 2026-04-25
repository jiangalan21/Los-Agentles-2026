"""
Quick test client for the weather agent.

Usage:
  Terminal 1:  python agent.py
  Terminal 2:  python test_client.py [location]

Examples:
  python test_client.py
  python test_client.py "New York, NY"
  python test_client.py "Tokyo, Japan"
"""

import json
import sys
from datetime import datetime, timezone
from uuid import uuid4

from uagents import Agent, Context, Protocol
from uagents_core.contrib.protocols.chat import (
    ChatAcknowledgement,
    ChatMessage,
    TextContent,
    chat_protocol_spec,
)

WEATHER_AGENT_ADDRESS = "agent1qd9vnuvx8zkde7ng08c9m7fmgslmcfmsqha6qyz63lmsu3mmc6x9cul8u2e"
LOCATION = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else "Los Angeles, CA"

client = Agent(
    name="weather-test-client",
    seed="weather-test-client-seed-2026",
    port=8099,
    endpoint=["http://localhost:8099/submit"],
)

proto = Protocol(spec=chat_protocol_spec)


@client.on_event("startup")
async def send_request(ctx: Context) -> None:
    ctx.logger.info(f"Requesting weather for: {LOCATION}")
    await ctx.send(
        WEATHER_AGENT_ADDRESS,
        ChatMessage(
            timestamp=datetime.now(timezone.utc),
            msg_id=uuid4(),
            content=[TextContent(type="text", text=LOCATION)],
        ),
    )


@proto.on_message(ChatMessage)
async def handle_response(ctx: Context, sender: str, msg: ChatMessage) -> None:
    await ctx.send(
        sender,
        ChatAcknowledgement(
            timestamp=datetime.now(timezone.utc),
            acknowledged_msg_id=msg.msg_id,
        ),
    )

    for block in msg.content:
        if hasattr(block, "text"):
            try:
                data = json.loads(block.text)
                ctx.logger.info("=== WEATHER RESULT ===")
                ctx.logger.info(f"  Location:     {LOCATION}")
                ctx.logger.info(f"  Condition:    {data.get('condition')}")
                ctx.logger.info(f"  Temperature:  {data.get('temperature_f')}°F  /  {data.get('temperature_c')}°C")
                ctx.logger.info(f"  Feels like:   {data.get('feels_like_f')}°F")
                ctx.logger.info(f"  Description:  {data.get('description')}")
                ctx.logger.info(f"  Humidity:     {data.get('humidity')}%")
                ctx.logger.info(f"  Wind:         {data.get('wind_speed')} mph")
                ctx.logger.info(f"  Forecast:     {data.get('forecast')}")
                ctx.logger.info("======================")
            except json.JSONDecodeError:
                ctx.logger.info(f"Raw response: {block.text}")


@proto.on_message(ChatAcknowledgement)
async def handle_ack(ctx: Context, sender: str, msg: ChatAcknowledgement) -> None:
    ctx.logger.info("Weather agent acknowledged the request — waiting for response...")


client.include(proto)

if __name__ == "__main__":
    client.run()
