import os
import sys

from dotenv import load_dotenv
from uagents import Agent, Context, Protocol

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from shared.chatProtocol import build_chat_protocol  # noqa: E402

load_dotenv()
WELLNESS_AGENT_PORT = int(os.getenv("WELLNESS_AGENT_PORT", "8007"))
WELLNESS_AGENT_ENDPOINT = os.getenv("WELLNESS_AGENT_ENDPOINT", f"http://localhost:{WELLNESS_AGENT_PORT}/submit")

agent = Agent(
    name="wellness-agent",
    seed=os.getenv("AGENT_SEED", "wellness-agent-seed"),
    port=WELLNESS_AGENT_PORT,
    endpoint=[WELLNESS_AGENT_ENDPOINT],
)

proto: Protocol = build_chat_protocol()
agent.include(proto)


@agent.on_event("startup")
async def on_startup(ctx: Context) -> None:
    ctx.logger.info(f"Wellness agent started: {agent.address}")


if __name__ == "__main__":
    agent.run()
