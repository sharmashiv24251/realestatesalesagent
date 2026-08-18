"""Turn-by-turn orchestration for the Northstar sales agent.

Builds the model call for a single turn: the Aarav system prompt rendered
for this session's channel and the current time, the running conversation
as contents, and this session's ToolBox registered for automatic function
calling. The SDK resolves any tool calls itself and hands back the final
reply, which gets appended to the session history alongside the user's
message.
"""

from google.genai import types

from app.core.config import settings
from app.core.prompt import render_system_prompt
from app.services.gemini_service import gemini_service
from app.services.session_store import Session
from app.services.slots import now_ist
from app.services.tools import ToolBox


def _build_contents(history: list[dict]) -> list[types.Content]:
    return [
        types.Content(role=turn["role"], parts=[types.Part.from_text(text=turn["content"])])
        for turn in history
    ]


def get_agent_reply(session: Session, user_message: str) -> str:
    session.touch()
    session.turn_count += 1
    session.history.append({"role": "user", "content": user_message})

    toolbox = ToolBox(session)
    client = gemini_service.get_client()

    config = types.GenerateContentConfig(
        system_instruction=render_system_prompt(session.channel, now_ist().isoformat()),
        tools=[
            toolbox.search_projects,
            toolbox.get_project_details,
            toolbox.check_slot_availability,
            toolbox.book_site_visit,
            toolbox.save_lead_profile,
            toolbox.log_unanswered_question,
            toolbox.request_human_callback,
            toolbox.set_do_not_contact,
            toolbox.end_conversation,
        ],
        temperature=0.6,
    )

    response = client.models.generate_content(
        model=settings.GEMINI_MODEL,
        contents=_build_contents(session.history),
        config=config,
    )
    reply_text = response.text or ""

    if response.usage_metadata and response.usage_metadata.total_token_count:
        session.total_tokens += response.usage_metadata.total_token_count

    session.history.append({"role": "model", "content": reply_text})
    return reply_text
