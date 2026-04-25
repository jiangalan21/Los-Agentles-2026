import os
import sys

from dotenv import load_dotenv
from uagents import Agent, Context, Protocol

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from shared.chatProtocol import build_chat_protocol  # noqa: E402

load_dotenv()

agent = Agent(
    name="music-agent",
    seed=os.getenv("AGENT_SEED", "music-agent-seed"),
    port=8003,
    endpoint=["http://localhost:8003/submit"],
)

proto: Protocol = build_chat_protocol()
agent.include(proto)


@agent.on_event("startup")
async def on_startup(ctx: Context) -> None:
    ctx.logger.info(f"Music agent started: {agent.address}")


if __name__ == "__main__":
    agent.run()
