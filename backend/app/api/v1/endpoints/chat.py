from fastapi import APIRouter, HTTPException, status
from starlette.concurrency import run_in_threadpool

from app.schemas.chat import (
    ChatTurnRequest,
    ChatTurnResponse,
    SessionCreateRequest,
    SessionCreateResponse,
)
from app.services.agent_service import get_agent_reply
from app.services.gemini_service import gemini_service
from app.services.session_store import session_store

router = APIRouter()


@router.post("/session", response_model=SessionCreateResponse, summary="Start a conversation session")
async def create_session(request: SessionCreateRequest):
    session = session_store.create(channel=request.channel)
    return SessionCreateResponse(session_id=session.session_id, channel=session.channel)


@router.post("/chat", response_model=ChatTurnResponse, summary="Send a message to Aarav")
async def chat_endpoint(request: ChatTurnRequest):
    if not gemini_service.is_configured():
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Gemini API Key is not configured. Please set GEMINI_API_KEY in backend/.env",
        )

    session = session_store.get(request.session_id)
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found or expired. Start a new session with POST /session.",
        )

    try:
        reply = await run_in_threadpool(get_agent_reply, session, request.message)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

    return ChatTurnResponse(
        session_id=session.session_id,
        reply=reply,
        ended=session.ended,
        do_not_contact=session.do_not_contact,
    )
