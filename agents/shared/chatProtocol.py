from datetime import datetime, timezone

from uagents import Context, Protocol
from uagents_core.contrib.protocols.chat import (
    ChatAcknowledgement,
    ChatMessage,
    chat_protocol_spec,
)


def build_chat_protocol() -> Protocol:
    """Returns a Protocol wired to the AgentChatProtocol spec with stub handlers.

    Both ChatMessage and ChatAcknowledgement handlers are required by the spec.
    Each agent should replace handle_message with its real logic.
    """
    proto = Protocol(spec=chat_protocol_spec)

    @proto.on_message(ChatMessage)
    async def handle_message(ctx: Context, sender: str, msg: ChatMessage) -> None:
        await ctx.send(
            sender,
            ChatAcknowledgement(
                timestamp=datetime.now(timezone.utc),
                acknowledged_msg_id=msg.msg_id,
            ),
        )

    @proto.on_message(ChatAcknowledgement)
    async def handle_acknowledgement(
        ctx: Context, sender: str, msg: ChatAcknowledgement
    ) -> None:
        ctx.logger.info(f"Received acknowledgement from {sender}: {msg.acknowledged_msg_id}")

    return proto
